// The minute's work on the market table, in pieces, so that two machines can do it: the server's tick
// (functions/tick) and, when the server's own answers have stopped, the relay on GitHub (jobs/relay_deno.ts,
// _shared/relay.ts). Pull the day's one-minute bars of every instrument whose market is open (or closed within
// the last 45 minutes, so the official closing level lands); store the last print and the bars; rebuild the
// table; scan for alerts. Nothing here decides who does it: the callers do.
import { db, sourceOk, type InstrumentRow } from "./db.ts";
import { marketById, marketState, recentlyClosed, type Holidays } from "./sessions.ts";
import { computeTable } from "./table.ts";
import { chart, futuresQuotes, lastPrint, spark } from "./yahoo.ts";
import { scanIndexAlerts, scanSigmaAlerts, scanStockAlerts } from "./alerts.ts";
import type { Print } from "./feedhealth.ts";
import { newerOnly } from "./relay.ts";
import { checkRoll, fromReading, QUOTE_SOURCE, tradeDate, type ContractRow, type RollRow } from "./futures.ts";

const CONCURRENCY = 6;
export interface Pulled { i: InstrumentRow; ts: number[]; close: Array<number | null>; prevClose: number | null; ok: boolean }

async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k]); } }));
  return out;
}

/** The instruments to pull this minute: market open, at lunch, or closed within the last 45 minutes. */
export async function dueInstruments(now: Date, holidays: Holidays): Promise<InstrumentRow[]> {
  const { data, error } = await db.from("instruments").select("*").eq("active", true).eq("provider", "yahoo");
  if (error) throw new Error(error.message);
  return (data as InstrumentRow[]).filter((i) => {
    const m = marketById(i.market);
    if (!m) return false;
    const st = marketState(m, now, holidays);
    return st === "OPEN" || st === "BREAK" || recentlyClosed(m, now, 45, holidays);
  });
}

/** One-minute bars of the day for each instrument. "chart": one request per symbol, a few at a time, and the
 *  batched spark endpoint for those that fail (the server's way). "spark": the batched endpoint only, twenty
 *  symbols a request (the relay's way: from GitHub's machines single chart requests were refused with HTTP 429
 *  on 18 Nov 2026 while spark answered). `sparked` counts the symbols that came through spark. */
export async function pull(due: InstrumentRow[], via: "chart" | "spark"): Promise<{ got: Pulled[]; sparked: number }> {
  const blank = (i: InstrumentRow): Pulled => ({ i, ts: [], close: [], prevClose: null, ok: false });
  const got: Pulled[] = via === "spark" ? due.map(blank) : await mapLimit(due, CONCURRENCY, async (i) => {
    try { const c = await chart(i.symbol, "1d", "1m"); return { i, ts: c.timestamp, close: c.close, prevClose: null, ok: true }; }
    catch { return blank(i); }
  });
  const failed = got.filter((g) => !g.ok).map((g) => g.i.symbol);
  if (failed.length) {
    const s = await spark(failed, "1d", "1m");
    for (const g of got) { const x = s[g.i.symbol]; if (!g.ok && x) { g.ts = x.timestamp; g.close = x.close; g.prevClose = x.chartPreviousClose ?? x.previousClose; g.ok = true; } }
  }
  return { got, sparked: via === "spark" ? got.filter((g) => g.ok).length : failed.length };
}

/** The last print of each instrument that answered: what feedState reads to say how far behind a pull is. */
export function printsOf(got: Pulled[]): Print[] {
  const out: Print[] = [];
  for (const g of got) { if (!g.ok) continue; const lp = lastPrint({ timestamp: g.ts, close: g.close }); if (lp) out.push({ symbol: g.i.symbol, market: g.i.market, marketTime: new Date(lp.t * 1000).toISOString() }); }
  return out;
}

/** Stores the last prints (quotes_latest) and the minute bars of the last 36 hours (bars_intraday). */
export async function store(got: Pulled[], now: Date): Promise<{ quotes: number; bars: number; older: number }> {
  const quotes: Array<{ symbol: string; price: number; prev_close: number | null; market_time: string; fetched_at: string; source: string }> = [], bars: Array<Record<string, unknown>> = [];
  const cutoff = now.getTime() / 1000 - 36 * 3600;
  for (const g of got) {
    if (!g.ok) continue;
    const lp = lastPrint({ timestamp: g.ts, close: g.close });
    if (!lp) continue;
    quotes.push({ symbol: g.i.symbol, price: lp.price, prev_close: g.prevClose, market_time: new Date(lp.t * 1000).toISOString(), fetched_at: now.toISOString(), source: "yahoo" });
    for (let k = 0; k < g.ts.length; k++) {
      const v = g.close[k];
      if (v == null || g.ts[k] < cutoff) continue;
      bars.push({ symbol: g.i.symbol, t: new Date(g.ts[k] * 1000).toISOString(), close: v });
    }
  }
  let write = quotes;
  if (quotes.length) {
    const { data: have, error: he } = await db.from("quotes_latest").select("symbol,market_time").in("symbol", quotes.map((q) => q.symbol));
    if (he) throw new Error("quotes_latest: " + he.message);
    write = newerOnly(quotes, new Map(((have ?? []) as Array<{ symbol: string; market_time: string }>).map((r) => [r.symbol, r.market_time])));
    if (write.length) { const { error: qe } = await db.from("quotes_latest").upsert(write, { onConflict: "symbol" }); if (qe) throw new Error("quotes_latest: " + qe.message); }
  }
  for (let k = 0; k < bars.length; k += 1000) {
    const { error: be } = await db.from("bars_intraday").upsert(bars.slice(k, k + 1000), { onConflict: "symbol,t" });
    if (be) throw new Error("bars_intraday: " + be.message);
  }
  await sourceOk("yahoo");
  return { quotes: write.length, bars: bars.length, older: quotes.length - write.length };
}

/** Which contract each future's quote is on, this minute (B-27; futures.ts): one quote request for the futures whose
 *  market is open (or closed within the last 45 minutes), with the contract each was last recorded on where its expiry
 *  is not stored yet. It records the session's contract, a roll when the contract is not the one recorded for the last
 *  session before, and, once a roll's next session is read, on which day the series really changed contract. Returns
 *  the futures read: a future not read this minute raises no σ alert (a roll could not be told from a move). */
export async function readFutures(now: Date, holidays: Holidays): Promise<{ read: Set<string>; note: string }> {
  const { data: inst, error } = await db.from("instruments").select("symbol,market").eq("active", true).eq("provider", "yahoo").like("symbol", "%=F");
  if (error) throw new Error(error.message);
  const futs = ((inst ?? []) as Array<{ symbol: string; market: string }>).filter((i) => {
    const m = marketById(i.market); if (!m) return false;
    const st = marketState(m, now, holidays);
    return st === "OPEN" || st === "BREAK" || recentlyClosed(m, now, 45, holidays);
  }).map((i) => i.symbol);
  if (!futs.length) return { read: new Set(), note: "" };
  const since = new Date(now.getTime() - 15 * 86400e3).toISOString().slice(0, 10);
  const [{ data: recs, error: e1 }, { data: rls, error: e2 }] = await Promise.all([
    db.from("fut_contracts").select("symbol,d,contract,expires,prev_close").in("symbol", futs).gte("d", since).order("d", { ascending: false }),
    db.from("fut_rolls").select("symbol,d,from_contract,to_contract,prev_close,source,checked").in("symbol", futs).gte("d", since),
  ]);
  if (e1 || e2) throw new Error("futures: " + (e1 ?? e2)!.message);
  const bySym = new Map<string, ContractRow[]>();   // newest first
  for (const r of (recs ?? []) as ContractRow[]) { if (!bySym.has(r.symbol)) bySym.set(r.symbol, []); bySym.get(r.symbol)!.push(r); }
  const rolls = (rls ?? []) as RollRow[];
  const extra = [...new Set(futs.map((f) => bySym.get(f)?.[0]).filter((r): r is ContractRow => !!r && !r.expires).map((r) => r.contract))];
  const q = await futuresQuotes([...futs, ...extra]);
  const read = new Set<string>(), recWrites: ContractRow[] = [], rollWrites: RollRow[] = [], rollDrops: Array<{ symbol: string; d: string }> = [];
  const toCheck: Array<{ roll: RollRow; reading: { d: string; contract: string; prevClose: number | null } }> = [];
  for (const f of futs) {
    const x = q[f], list = bySym.get(f) ?? [];
    if (!x || !x.underlying || x.time == null) continue;
    // a quote that has not moved for a week names no current contract (the probe read TIO=F's at 2021): not recorded,
    // and the future counts as not read (no σ alert)
    if (now.getTime() / 1000 - x.time > 7 * 86400) continue;
    const d = tradeDate(x.time), lastBefore = list.find((r) => r.d < d) ?? null, same = list.find((r) => r.d === d);
    const expires = q[x.underlying]?.expires ?? (list.find((r) => r.contract === x.underlying && r.expires)?.expires ?? null);
    const res = fromReading({ symbol: f, contract: x.underlying, prevClose: x.prevClose, at: x.time }, lastBefore, expires);
    if (!res) continue;
    read.add(f);
    if (!same || same.contract !== res.record.contract || same.prev_close !== res.record.prev_close || (same.expires ?? null) !== res.record.expires) recWrites.push(res.record);
    const had = rolls.find((r) => r.symbol === f && r.d === d);
    if (res.roll && (!had || had.to_contract !== res.roll.to_contract || had.prev_close !== res.roll.prev_close)) rollWrites.push(res.roll);
    // the quote back on the contract of the session before (a change seen earlier today, then undone): no roll today
    if (!res.roll && had && had.source === QUOTE_SOURCE && !had.checked) rollDrops.push({ symbol: f, d });
    for (const r of rolls) if (r.symbol === f && !r.checked && r.d < d) toCheck.push({ roll: r, reading: { d, contract: res.record.contract, prevClose: res.record.prev_close } });
  }
  // the session after a roll: on which day did the series move to the new contract?
  let moved = 0;
  if (toCheck.length) {
    const from = toCheck.map((c) => c.roll.d).sort()[0];
    const { data: px, error: pe } = await db.from("prices_daily").select("symbol,d,close").in("symbol", [...new Set(toCheck.map((c) => c.roll.symbol))]).gte("d", new Date(Date.parse(from + "T00:00:00Z") - 14 * 86400e3).toISOString().slice(0, 10)).order("d");
    if (pe) throw new Error("futures: " + pe.message);
    const closes = (px ?? []) as Array<{ symbol: string; d: string; close: number }>;
    for (const c of toCheck) {
      const mine = closes.filter((p) => p.symbol === c.roll.symbol);
      const on = mine.find((p) => p.d === c.roll.d)?.close ?? null, before = [...mine].reverse().find((p) => p.d < c.roll.d)?.close ?? null, lastBefore = [...mine].reverse().find((p) => p.d < c.reading.d)?.d ?? null;
      const out = checkRoll(c.roll, c.reading, { rollDay: on, before, lastBefore });
      if (out.act === "keep") rollWrites.push(out.roll);
      else if (out.act === "move") { rollDrops.push({ symbol: c.roll.symbol, d: c.roll.d }); rollWrites.push(out.roll); moved++; }
    }
  }
  for (const r of rollDrops) { const { error: de } = await db.from("fut_rolls").delete().eq("symbol", r.symbol).eq("d", r.d); if (de) throw new Error("fut_rolls: " + de.message); }
  const rollRows = [...new Map(rollWrites.map((r) => [`${r.symbol}|${r.d}`, r])).values()];   // one row per key in one upsert
  if (rollRows.length) { const { error: we } = await db.from("fut_rolls").upsert(rollRows.map((r) => ({ ...r, seen_at: now.toISOString() })), { onConflict: "symbol,d" }); if (we) throw new Error("fut_rolls: " + we.message); }
  if (recWrites.length) { const { error: ce } = await db.from("fut_contracts").upsert(recWrites.map((r) => ({ ...r, seen_at: now.toISOString() })), { onConflict: "symbol,d" }); if (ce) throw new Error("fut_contracts: " + ce.message); }
  const newRolls = rollWrites.filter((r) => !r.checked).map((r) => `${r.symbol} ${r.from_contract ?? "?"}→${r.to_contract}`);
  return { read, note: `, futures ${read.size}/${futs.length} read${newRolls.length ? `, roll: ${newRolls.join(" ")}` : ""}${moved ? `, ${moved} roll(s) moved a session later` : ""}` };
}

/** The table snapshot from what is stored, then the alerts: indices and σ moves every minute from the table, single
 *  stocks every fifth minute (one spark batch per 20 names). First, which contract each future is on (readFutures), so
 *  a roll day's 1D is the change within the new contract. Returns the table's row count and a note for the job log. */
export async function tableAndAlerts(now: Date, holidays: Holidays): Promise<{ rows: number; note: string }> {
  let fut: { read: Set<string>; note: string } = { read: new Set(), note: "" };
  // the note is shown with the feed's health: no address and no crumb in it, whatever the error says
  try { fut = await readFutures(now, holidays); } catch (e) { fut.note = `, futures not read: ${String(e instanceof Error ? e.message : e).replace(/https?:\/\/[^\s)]+/g, "(address)").replace(/crumb=[^&\s)]+/gi, "crumb=…")}`; }
  const table = await computeTable(now);
  const { error: se } = await db.from("snapshots").upsert({ key: "table", payload: table, at: table.asOf }, { onConflict: "key" });
  if (se) throw new Error(se.message);
  let note = fut.note;
  try {
    const ia = await scanIndexAlerts(table.rows, now);
    const ga = await scanSigmaAlerts(table.rows, now, fut.read);
    const sa = now.getUTCMinutes() % 5 === 0 ? await scanStockAlerts(now, holidays) : { scanned: 0, alerts: 0 };
    note += `, alerts idx ${ia} / σ ${ga}${sa.scanned ? ` / stocks ${sa.alerts} of ${sa.scanned}` : ""}`;
  } catch (e) { note += `, alerts failed: ${e instanceof Error ? e.message : e}`; }
  return { rows: table.rows.length, note };
}
