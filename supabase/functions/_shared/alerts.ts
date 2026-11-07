// Excessive-move alerts. Thresholds (Shota): single stock ±7% intraday, index ±3%. One row per symbol, session
// date and kind; while the move extends the magnitude and message are updated, so the top bar shows the latest.
import { db } from "./db.ts";
import { localDate, marketById, marketState, type Holidays } from "./sessions.ts";
import { spark } from "./yahoo.ts";
import type { TableRow } from "./table.ts";

export const STOCK_PCT = 7, INDEX_PCT = 3;
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
  const out: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    if (r.cls !== "Equities" || r.pct.d1 == null || Math.abs(r.pct.d1) < INDEX_PCT || !r.lastAt) continue;
    const m = marketById(r.market);
    const d = localDate(m?.tz ?? "UTC", Date.parse(r.lastAt) / 1000);
    out.push({ d, symbol: r.symbol, name: r.name.replace(/ via 1306\.T$/, ""), kind: "index", pct: r.pct.d1, price: r.last, market: r.market, msg: alertMsg(r.name.replace(/ via 1306\.T$/, ""), r.pct.d1, r.live), upd: now.toISOString() });
  }
  return upsertAlerts(out);
}

/** Stock alerts: constituents of the indices whose market is open, measured against the previous close. */
export async function scanStockAlerts(now: Date, holidays: Holidays): Promise<{ scanned: number; alerts: number }> {
  const open = (id: "TSE" | "NYSE") => { const m = marketById(id)!; const st = marketState(m, now, holidays); return st === "OPEN" || st === "BREAK"; };
  const idxs: Array<"SP500" | "NK225"> = [];
  if (open("TSE")) idxs.push("NK225");
  if (open("NYSE")) idxs.push("SP500");
  if (!idxs.length) return { scanned: 0, alerts: 0 };
  const { data, error } = await db.from("constituents").select("idx,symbol,name").in("idx", idxs);
  if (error) throw new Error(error.message);
  const list = (data ?? []) as Array<{ idx: string; symbol: string; name: string }>;
  if (!list.length) return { scanned: 0, alerts: 0 };
  const s = await spark(list.map((c) => c.symbol), "1d", "1m");
  const out: Array<Record<string, unknown>> = [];
  for (const c of list) {
    const x = s[c.symbol]; if (!x) continue;
    const prev = x.chartPreviousClose ?? x.previousClose; if (!prev) continue;
    let last: number | null = null, lastT = 0;
    for (let i = x.close.length - 1; i >= 0; i--) { const v = x.close[i]; if (v != null) { last = v; lastT = x.timestamp[i]; break; } }
    if (last == null) continue;
    const pct = (last / prev - 1) * 100;
    if (Math.abs(pct) < STOCK_PCT) continue;
    const market = c.idx === "NK225" ? "TSE" : "NYSE";
    const d = localDate(marketById(market)!.tz, lastT);
    out.push({ d, symbol: c.symbol, name: c.name, kind: "stock", pct, price: last, market, msg: alertMsg(c.name, pct, true), upd: now.toISOString() });
  }
  return { scanned: list.length, alerts: await upsertAlerts(out) };
}
