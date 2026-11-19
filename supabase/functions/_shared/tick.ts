// The minute's work on the market table, in pieces, so that two machines can do it: the server's tick
// (functions/tick) and, when the server's own answers have stopped, the relay on GitHub (jobs/relay_deno.ts,
// _shared/relay.ts). Pull the day's one-minute bars of every instrument whose market is open (or closed within
// the last 45 minutes, so the official closing level lands); store the last print and the bars; rebuild the
// table; scan for alerts. Nothing here decides who does it: the callers do.
import { db, sourceOk, type InstrumentRow } from "./db.ts";
import { marketById, marketState, recentlyClosed, type Holidays } from "./sessions.ts";
import { computeTable } from "./table.ts";
import { chart, lastPrint, spark } from "./yahoo.ts";
import { scanIndexAlerts, scanStockAlerts } from "./alerts.ts";
import type { Print } from "./feedhealth.ts";
import { newerOnly } from "./relay.ts";

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

/** The table snapshot from what is stored, then the alerts: indices every minute from the table, single stocks
 *  every fifth minute (one spark batch per 20 names). Returns the table's row count and a note for the job log. */
export async function tableAndAlerts(now: Date, holidays: Holidays): Promise<{ rows: number; note: string }> {
  const table = await computeTable(now);
  const { error: se } = await db.from("snapshots").upsert({ key: "table", payload: table, at: table.asOf }, { onConflict: "key" });
  if (se) throw new Error(se.message);
  let note = "";
  try {
    const ia = await scanIndexAlerts(table.rows, now);
    const sa = now.getUTCMinutes() % 5 === 0 ? await scanStockAlerts(now, holidays) : { scanned: 0, alerts: 0 };
    note = `, alerts idx ${ia}${sa.scanned ? ` / stocks ${sa.alerts} of ${sa.scanned}` : ""}`;
  } catch (e) { note = `, alerts failed: ${e instanceof Error ? e.message : e}`; }
  return { rows: table.rows.length, note };
}
