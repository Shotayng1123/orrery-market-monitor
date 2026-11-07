// tick — every minute (pg_cron). Fetches quotes for the instruments whose market is open (or closed within the
// last 45 minutes, so the official closing level lands), writes quotes_latest and the 5-minute intraday bars,
// then rebuilds the market table snapshot. Closed markets cost no Yahoo calls.
import { db, logRun, sourceErr, sourceOk, type InstrumentRow } from "../_shared/db.ts";
import { isCron, json } from "../_shared/http.ts";
import { marketById, marketState, recentlyClosed } from "../_shared/sessions.ts";
import { loadHolidays, saveTableSnapshot } from "../_shared/table.ts";
import { lastPrint, spark } from "../_shared/yahoo.ts";

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
    const series = await spark(due.map((i) => i.symbol), "1d", "1m");
    const quotes: Array<Record<string, unknown>> = [], bars: Array<Record<string, unknown>> = [];
    const cutoff = now.getTime() / 1000 - 36 * 3600;
    for (const i of due) {
      const s = series[i.symbol];
      if (!s) continue;
      const lp = lastPrint(s);
      if (!lp) continue;
      quotes.push({ symbol: i.symbol, price: lp.price, prev_close: s.chartPreviousClose ?? s.previousClose, market_time: new Date(lp.t * 1000).toISOString(), fetched_at: now.toISOString(), source: "yahoo" });
      for (let k = 0; k < s.timestamp.length; k++) {
        const v = s.close[k];
        if (v == null || s.timestamp[k] < cutoff) continue;
        bars.push({ symbol: i.symbol, t: new Date(s.timestamp[k] * 1000).toISOString(), close: v });
      }
    }
    if (quotes.length) {
      const { error: qe } = await db.from("quotes_latest").upsert(quotes, { onConflict: "symbol" });
      if (qe) throw new Error("quotes_latest: " + qe.message);
    }
    for (let k = 0; k < bars.length; k += 1000) {
      const { error: be } = await db.from("bars_intraday").upsert(bars.slice(k, k + 1000), { onConflict: "symbol,t", ignoreDuplicates: false });
      if (be) throw new Error("bars_intraday: " + be.message);
    }
    await sourceOk("yahoo");
    const n = await saveTableSnapshot(now);
    const missing = due.filter((i) => !series[i.symbol]).map((i) => i.symbol);
    const detail = `${quotes.length}/${due.length} quotes, ${bars.length} bars, table ${n} rows${missing.length ? `, missing: ${missing.join(" ")}` : ""}`;
    await logRun("tick", true, detail, t0);
    return json(req, { ok: true, detail });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sourceErr("yahoo", msg);
    await logRun("tick", false, msg, t0);
    return json(req, { ok: false, error: msg }, 500);
  }
});
