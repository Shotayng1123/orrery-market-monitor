// Excessive-move alerts. Thresholds (Shota): index ±3%; single stock ±5% intraday for a large company (1tn yen /
// 10bn US dollars and above) and ±7% for the rest (moves.ts stockLine; 7% for all until 19 Nov 2026). One row per
// symbol, session date and kind; while the move extends the magnitude and message are updated, so the top bar shows the latest.
// For a stock the magnitude is the largest move of the session (moves.ts): it stays when the stock comes back.
//
// Which stocks (18 Nov 2026; until then only the first line, so Rakuten Bank's limit-down raised nothing):
//   - Nikkei 225 and S&P 500 members and every stock on anyone's watchlist: one-minute bars, scanned every five
//     minutes by the tick job (scanStockAlerts). The alert's time is the minute the threshold was passed.
//     In the minutes after a close the official closing price is measured too: a closing auction prints after
//     the last bar (19 Nov 2026; Intuit had finished -7.2% two days before with no bar beyond the line).
//   - every other company in the lists the Monitor follows (TOPIX, Nasdaq-100, KOSPI 200, Hang Seng, SSE 180) worth
//     USD 5bn or more, the floor of the headline alerts: from the day range of the quotes the flow job already
//     pulls every 10 to 20 minutes (scanQuoteAlerts). The alert's time is when the move was seen.
import { db, selectAll } from "./db.ts";
import { localDate, marketById, recentlyClosed, type Holidays, type MarketId } from "./sessions.ts";
import { AFTER_CLOSE_MIN, closeMove, quoteMove, scanDue, sessionMove, stockLine, stockMarket, STOCK_PCT } from "./moves.ts";
import { CCY, MIN_MCAP_USD } from "./newsalerts.ts";
import { quotes, spark, type QuoteRow } from "./yahoo.ts";
import type { TableRow } from "./table.ts";

export const INDEX_PCT = 3;
const r1 = (x: number) => Math.round(x * 10) / 10;
const fmtPct = (p: number) => `${Math.abs(p) >= 10 ? Math.round(Math.abs(p)) : r1(Math.abs(p))}%`;
export const alertMsg = (name: string, pct: number, intraday: boolean) => `${name} ${pct >= 0 ? "up" : "down"} ${fmtPct(pct)}${intraday ? " intraday" : ""}`;

async function upsertAlerts(rows: Array<Record<string, unknown>>): Promise<number> {
  if (!rows.length) return 0;
  const { error } = await db.from("alerts").upsert(rows, { onConflict: "symbol,d,kind" });
  if (error) throw new Error("alerts: " + error.message);
  return rows.length;
}

/** Index alerts from the market-table rows: equities (indices) whose 1D change passed ±3%. */
export async function scanIndexAlerts(rows: TableRow[], now: Date): Promise<number> {
  const cand: Array<Record<string, unknown> & { symbol: string; d: string; pct: number; msg: string }> = [];
  for (const r of rows) {
    if (r.cls !== "Equities" || r.pct.d1 == null || Math.abs(r.pct.d1) < INDEX_PCT || !r.lastAt) continue;
    const m = marketById(r.market);
    // A booked close carries its session date as "<date>T00:00:00Z": that date is the session, not an instant to
    // convert (in New York it would fall on the evening before and the alert would be filed a day early).
    const d = /T00:00:00Z$/.test(r.lastAt) ? r.lastAt.slice(0, 10) : localDate(m?.tz ?? "UTC", Date.parse(r.lastAt) / 1000);
    cand.push({ d, symbol: r.symbol, name: r.name.replace(/ via 1306\.T$/, ""), kind: "index", pct: r.pct.d1, price: r.last, market: r.market, msg: alertMsg(r.name.replace(/ via 1306\.T$/, ""), r.pct.d1, r.live), upd: now.toISOString() });
  }
  if (!cand.length) return 0;
  // Write only what changed, so `upd` means "the move was last re-measured differently" and a closed market's
  // alert is not re-stamped every minute.
  const { data: have } = await db.from("alerts").select("symbol,d,pct,msg").eq("kind", "index").in("symbol", cand.map((c) => c.symbol)).gte("d", cand.map((c) => c.d).sort()[0]);
  const old = new Map(((have ?? []) as Array<{ symbol: string; d: string; pct: number; msg: string }>).map((x) => [`${x.symbol}|${x.d}`, x]));
  const out = cand.filter((c) => { const o = old.get(`${c.symbol}|${c.d}`); return !o || Math.abs(o.pct - c.pct) >= 0.005 || o.msg !== c.msg; });
  return upsertAlerts(out);
}

type Cand = Record<string, unknown> & { symbol: string; d: string; pct: number; msg: string };
/** Keeps the candidates whose figure or wording differs from the stored row, so `upd` says when a move last
 *  extended and a closed market's alert is not re-stamped by every scan. `fresh` are the ones with no row yet. */
async function changedOnly(cand: Cand[]): Promise<{ fresh: Cand[]; moved: Cand[] }> {
  if (!cand.length) return { fresh: [], moved: [] };
  const { data: have } = await db.from("alerts").select("symbol,d,pct,msg").eq("kind", "stock").in("symbol", cand.map((c) => c.symbol)).gte("d", cand.map((c) => c.d).sort()[0]);
  const old = new Map(((have ?? []) as Array<{ symbol: string; d: string; pct: number; msg: string }>).map((x) => [`${x.symbol}|${x.d}`, x]));
  const fresh: Cand[] = [], moved: Cand[] = [];
  for (const c of cand) { const o = old.get(`${c.symbol}|${c.d}`); if (!o) fresh.push(c); else if (Math.abs(o.pct - c.pct) >= 0.005 || o.msg !== c.msg) moved.push(c); }
  return { fresh, moved };
}

/** The stocks on anyone's watchlist, with the exchange each trades on (moves.ts: stockMarket). */
async function watchedStocks(): Promise<Array<{ symbol: string; name: string | null; market: MarketId }>> {
  const rows = await selectAll<{ symbol: string; name: string | null }>(() => db.from("watchlists").select("symbol,name").order("symbol"));
  const by = new Map<string, { symbol: string; name: string | null; market: MarketId }>();
  for (const r of rows) { const market = stockMarket(r.symbol); if (market && !by.has(r.symbol)) by.set(r.symbol, { symbol: r.symbol, name: r.name, market }); else if (market && r.name && !by.get(r.symbol)!.name) by.get(r.symbol)!.name = r.name; }
  return [...by.values()];
}

/** The alert line of each of `symbols` (moves.ts stockLine), from the market value the flow job last stored for it
 *  in any list the Monitor follows. A stock in none of them, or with no value stored yet, is held to 7%. */
async function linesFor(symbols: string[]): Promise<(symbol: string) => number> {
  const line = new Map<string, number>(), rate = new Map<string, number | null>();
  for (let i = 0; i < symbols.length; i += 200) {
    const { data, error } = await db.from("constituent_stats").select("idx,symbol,mcap").in("symbol", symbols.slice(i, i + 200)).not("mcap", "is", null);
    if (error) throw new Error("sizes: " + error.message);
    for (const r of (data ?? []) as Array<{ idx: string; symbol: string; mcap: number }>) {
      const ccy = CCY[r.idx]; if (!ccy) continue;
      if (!rate.has(ccy)) rate.set(ccy, ccy === "USD" || ccy === "JPY" ? 1 : await perUsd(ccy).catch(() => null));
      // a company in two lists (Nikkei 225 and TOPIX) has the same size in both: the lower line wins if they ever differ
      line.set(r.symbol, Math.min(line.get(r.symbol) ?? STOCK_PCT, stockLine(r.mcap, ccy, rate.get(ccy))));
    }
  }
  return (symbol) => line.get(symbol) ?? STOCK_PCT;
}

/** Stock alerts from one-minute bars: Nikkei 225 and S&P 500 members and every watched stock whose market is open
 *  or has just closed (moves.ts: scanDue), each measured over all of the session's bars against the previous
 *  close (moves.ts: sessionMove). */
export async function scanStockAlerts(now: Date, holidays: Holidays): Promise<{ scanned: number; alerts: number }> {
  const dueBy = new Map<string, boolean>();
  const due = (id: MarketId) => { if (!dueBy.has(id)) { const m = marketById(id); dueBy.set(id, !!m && scanDue(m, now, holidays)); } return dueBy.get(id)!; };
  const idxs: Array<"SP500" | "NK225"> = [];
  if (due("TSE")) idxs.push("NK225");
  if (due("NYSE")) idxs.push("SP500");
  const list = new Map<string, { symbol: string; name: string; market: MarketId }>();
  if (idxs.length) {
    const { data, error } = await db.from("constituents").select("idx,symbol,name,name_en").in("idx", idxs);
    if (error) throw new Error(error.message);
    // English company names as on the rest of the page (the Nikkei list's own names are upper-case short forms)
    for (const c of (data ?? []) as Array<{ idx: string; symbol: string; name: string; name_en: string | null }>) list.set(c.symbol, { symbol: c.symbol, name: c.name_en ?? c.name, market: c.idx === "NK225" ? "TSE" : "NYSE" });
  }
  // watched stocks outside those two lists, in any market the Monitor keeps session times for
  const extra = (await watchedStocks()).filter((w) => !list.has(w.symbol) && due(w.market));
  if (extra.length) {
    const { data: named } = await db.from("constituents").select("symbol,name,name_en").in("symbol", extra.map((w) => w.symbol));
    const nm = new Map(((named ?? []) as Array<{ symbol: string; name: string; name_en: string | null }>).map((c) => [c.symbol, c.name_en ?? c.name]));
    for (const w of extra) list.set(w.symbol, { symbol: w.symbol, name: nm.get(w.symbol) ?? w.name ?? w.symbol, market: w.market });
  }
  if (!list.size) return { scanned: 0, alerts: 0 };
  const [s, lineOf] = await Promise.all([spark([...list.keys()], "1d", "1m"), linesFor([...list.keys()])]);
  const cand: Cand[] = [];
  for (const c of list.values()) {
    const x = s[c.symbol]; if (!x) continue;
    const mv = sessionMove(x.timestamp, x.close, x.chartPreviousClose ?? x.previousClose, lineOf(c.symbol));
    if (!mv) continue;
    // The alert's time is the minute the stock first passed the threshold in this session, read from its own
    // one-minute bars. (The scan runs every five minutes for all names at once; stamping alerts with the scan
    // time gave every stock that crossed in the same window an identical time.)
    cand.push({ d: localDate(marketById(c.market)!.tz, mv.lastT), at: new Date(mv.crossT * 1000).toISOString(), symbol: c.symbol, name: c.name, kind: "stock", pct: mv.pct, price: mv.price, market: c.market, msg: alertMsg(c.name, mv.pct, true), upd: now.toISOString() });
  }
  // The official close as well, for a market that has just closed (moves.ts: closeMove). The closing auction
  // prints after the last one-minute bar, so the bars alone can end just short of the line while the stock
  // finishes beyond it. Asked only in the minutes after a close: one quote request per hundred names.
  const late = [...list.values()].filter((c) => { const m = marketById(c.market)!; return recentlyClosed(m, now, m.delayMin + AFTER_CLOSE_MIN, holidays); });
  if (late.length) {
    let q: Record<string, QuoteRow> = {};
    try { q = await quotes(late.map((c) => c.symbol)); } catch (e) { console.log("alerts: closing quotes:", e instanceof Error ? e.message : String(e)); }
    const at = new Map(cand.map((c, i) => [c.symbol, i])), oldest = now.getTime() / 1000 - 3 * 3600;
    for (const c of late) {
      const x = q[c.symbol];
      if (!x || x.time == null || x.time < oldest) continue;     // no print today: nothing to say about this session
      const mv = closeMove(x.prevClose, x.price, lineOf(c.symbol));
      if (!mv) continue;
      const i = at.get(c.symbol);
      // already raised from its bars: the larger of the two figures stands
      if (i != null) { if (Math.abs(mv.pct) > Math.abs(cand[i].pct)) Object.assign(cand[i], { pct: mv.pct, price: mv.price, msg: alertMsg(c.name, mv.pct, true) }); continue; }
      cand.push({ d: localDate(marketById(c.market)!.tz, x.time), at: new Date(x.time * 1000).toISOString(), symbol: c.symbol, name: c.name, kind: "stock", pct: mv.pct, price: mv.price, market: c.market, msg: alertMsg(c.name, mv.pct, false), upd: now.toISOString() });
    }
  }
  const { fresh, moved } = await changedOnly(cand);
  return { scanned: list.size, alerts: await upsertAlerts([...fresh, ...moved]) };
}

const WIDE_MARKET: Record<string, MarketId> = { TOPIX: "TSE", NDX: "NYSE", KOSPI200: "KRX", HSI: "HKEX", SSE180: "SSE" };
let covered: { at: number; symbols: Set<string> } | null = null;
/** Stocks the minute scan already covers (Nikkei 225, S&P 500, watchlists): the quote scan leaves them alone, or
 *  the two would keep overwriting each other's figure (one-minute closes against the day's true low and high). */
async function minuteCovered(): Promise<Set<string>> {
  if (covered && Date.now() - covered.at < 10 * 60e3) return covered.symbols;
  const idx = await selectAll<{ symbol: string }>(() => db.from("constituents").select("symbol").in("idx", ["NK225", "SP500"]).order("symbol"));
  covered = { at: Date.now(), symbols: new Set([...idx.map((r) => r.symbol), ...(await watchedStocks()).map((w) => w.symbol)]) };
  return covered.symbols;
}

const USD_PAIR: Record<string, string> = { JPY: "USDJPY=X", KRW: "KRW=X", HKD: "HKD=X", CNY: "CNY=X" };
/** Units of a currency per US dollar, from the market table's own quotes (for the USD 5bn floor). */
async function perUsd(ccy: string): Promise<number> {
  if (ccy === "USD") return 1;
  const pair = USD_PAIR[ccy];
  const { data } = pair ? await db.from("quotes_latest").select("price").eq("symbol", pair).maybeSingle() : { data: null };
  const v = (data as { price: number } | null)?.price;
  if (!v || !(v > 0)) throw new Error(`no ${ccy} rate for the size floor`);
  return v;
}

/** Stock alerts for the wide lists, from the quotes the flow job has just pulled for `idx`: a company worth
 *  USD 5bn or more whose low or high of the day lies beyond its line (5% for a large company, 7% otherwise)
 *  from the previous close. Returns the rows written. */
export async function scanQuoteAlerts(idx: string, rows: Array<{ symbol: string; name: string; q: QuoteRow }>, now: Date): Promise<number> {
  const market = WIDE_MARKET[idx], ccy = CCY[idx];
  if (!market || !ccy || !rows.length) return 0;
  const rate = await perUsd(ccy);
  const skip = await minuteCovered(), tz = marketById(market)!.tz, oldest = now.getTime() / 1000 - 36 * 3600;
  const cand: Cand[] = [], seenAt = new Map<string, number>();
  for (const r of rows) {
    const q = r.q;
    if (skip.has(r.symbol) || q.time == null || q.time < oldest || q.marketCap == null || q.marketCap / rate < MIN_MCAP_USD) continue;
    const mv = quoteMove(q.prevClose, q.low, q.high, stockLine(q.marketCap, ccy, rate));
    if (!mv) continue;
    seenAt.set(r.symbol, q.time);
    cand.push({ d: localDate(tz, q.time), symbol: r.symbol, name: r.name, kind: "stock", pct: mv.pct, price: mv.price, market, msg: alertMsg(r.name, mv.pct, true), upd: now.toISOString() });
  }
  const { fresh, moved } = await changedOnly(cand);
  // A new alert is timed when it is seen. One raised from an earlier session's quote (the first pull of a
  // morning still carries yesterday's range, and a move made in a closing auction is seen only then) is timed at
  // that session's last print instead, so it does not stand in the list as a move of this morning. One that
  // extends keeps its first time (no `at` in the update).
  const today = localDate(tz, now.getTime() / 1000);
  return (await upsertAlerts(fresh.map((c) => ({ ...c, at: c.d === today ? now.toISOString() : new Date(seenAt.get(c.symbol)! * 1000).toISOString() })))) + (await upsertAlerts(moved));
}
