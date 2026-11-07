// tick — every minute (pg_cron). For every instrument whose market is open (or closed within the last 45
// minutes, so the official closing level lands) it fetches the day's one-minute bars from the chart endpoint
// (a few requests at a time), writes quotes_latest and bars_intraday, then rebuilds the market table snapshot.
// Closed markets cost no Yahoo calls. If a chart call fails the spark endpoint (5-minute bars) is the fallback.
import { db, logRun, sourceErr, sourceOk, type InstrumentRow } from "../_shared/db.ts";
import { isCron, json } from "../_shared/http.ts";
import { marketById, marketState, recentlyClosed } from "../_shared/sessions.ts";
import { computeTable, loadHolidays } from "../_shared/table.ts";
import { chart, lastPrint, spark } from "../_shared/yahoo.ts";
import { scanIndexAlerts, scanStockAlerts } from "../_shared/alerts.ts";

const CONCURRENCY = 6;

async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k]); } }));
  return out;
}

Deno.serve(async (req) => {
  if (!isCron(req)) return json(req, { error: "forbidden" }, 403);
  const t0 = Date.now(), now = new Date();
  try {
    const holidays = await loadHolidays();
    const { data, error } = await db.from("instruments").select("*").eq("active", true).eq("provider", "yahoo");
    if (error) throw new Error(error.message);
    const due = (data as InstrumentRow[]).filter((i) => {
      const m = marketById(i.market);
      if (!m) return false;
      const st = marketState(m, now, holidays);
      return st === "OPEN" || st === "BREAK" || recentlyClosed(m, now, 45, holidays);
    });
    if (!due.length) {
      await logRun("tick", true, "idle: no market open", t0);
      return json(req, { ok: true, idle: true });
    }
    // one-minute bars per symbol; failures fall back to spark below
    const got = await mapLimit(due, CONCURRENCY, async (i) => {
      try { const c = await chart(i.symbol, "1d", "1m"); return { i, ts: c.timestamp, close: c.close, prevClose: null as number | null, ok: true }; }
      catch { return { i, ts: [] as number[], close: [] as Array<number | null>, prevClose: null as number | null, ok: false }; }
    });
    const failed = got.filter((g) => !g.ok).map((g) => g.i.symbol);
    if (failed.length) {
      const s = await spark(failed, "1d", "1m");
      for (const g of got) { const x = s[g.i.symbol]; if (!g.ok && x) { g.ts = x.timestamp; g.close = x.close; g.prevClose = x.chartPreviousClose ?? x.previousClose; g.ok = true; } }
    }
    const quotes: Array<Record<string, unknown>> = [], bars: Array<Record<string, unknown>> = [];
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
    if (quotes.length) {
      const { error: qe } = await db.from("quotes_latest").upsert(quotes, { onConflict: "symbol" });
      if (qe) throw new Error("quotes_latest: " + qe.message);
    }
    for (let k = 0; k < bars.length; k += 1000) {
      const { error: be } = await db.from("bars_intraday").upsert(bars.slice(k, k + 1000), { onConflict: "symbol,t" });
      if (be) throw new Error("bars_intraday: " + be.message);
    }
    await sourceOk("yahoo");
    const table = await computeTable(now);
    const { error: se } = await db.from("snapshots").upsert({ key: "table", payload: table, at: table.asOf }, { onConflict: "key" });
    if (se) throw new Error(se.message);
    const n = table.rows.length;
    // alerts: indices every minute from the table; single stocks every fifth minute (one spark batch per 20 names)
    let alertNote = "";
    try {
      const ia = await scanIndexAlerts(table.rows, now);
      const sa = now.getUTCMinutes() % 5 === 0 ? await scanStockAlerts(now, holidays) : { scanned: 0, alerts: 0 };
      alertNote = `, alerts idx ${ia}${sa.scanned ? ` / stocks ${sa.alerts} of ${sa.scanned}` : ""}`;
    } catch (e) { alertNote = `, alerts failed: ${e instanceof Error ? e.message : e}`; }
    const missing = got.filter((g) => !g.ok).map((g) => g.i.symbol);
    const detail = `${quotes.length}/${due.length} quotes, ${bars.length} 1m bars, table ${n} rows${failed.length ? `, spark fallback for ${failed.length}` : ""}${missing.length ? `, missing: ${missing.join(" ")}` : ""}${alertNote}`;
    await logRun("tick", true, detail, t0);
    return json(req, { ok: true, detail });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sourceErr("yahoo", msg);
    await logRun("tick", false, msg, t0);
    return json(req, { ok: false, error: msg }, 500);
  }
});
