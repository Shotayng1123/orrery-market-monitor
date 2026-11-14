// The daily closes of every Yahoo instrument (prices_daily) and the table snapshot built from them.
// Runs inside the `daily` Edge Function (job=history, on pg_cron) and, with the same code, from GitHub Actions
// (jobs/history_deno.ts) as a catch-up for bars Yahoo publishes late and for crypto's weekend days.
import { chunk, db, sourceErr, sourceOk, type InstrumentRow } from "./db.ts";
import { localDate, marketById, marketState, partsIn } from "./sessions.ts";
import { FX_SOURCE_HOURLY, fxClosesFromHourly, isFxPair, spikeThreshold, suspectBars } from "./fx.ts";
import { loadHolidays, saveTableSnapshot } from "./table.ts";
import { chart, spark } from "./yahoo.ts";

// ---------- history ----------
export async function history(): Promise<string> {
  const now = new Date();
  const holidays = await loadHolidays();
  const { data, error } = await db.from("instruments").select("*").eq("active", true).eq("provider", "yahoo");
  if (error) throw new Error(error.message);
  const everything = data as InstrumentRow[];
  const inst = everything.filter((i) => !isFxPair(i.symbol)), pairs = everything.filter((i) => isFxPair(i.symbol));
  let series: Awaited<ReturnType<typeof spark>>;
  try { series = await spark(inst.map((i) => i.symbol), "3mo", "1d"); await sourceOk("yahoo"); } catch (e) { await sourceErr("yahoo", e); throw e; }
  const rows: Array<Record<string, unknown>> = [];
  const missing: string[] = [];
  const suspects: string[] = [];
  // A vendor misprint (a close far from the days on both sides) is neither written nor kept if already stored.
  const guard = async (symbol: string, wild: boolean, series: Array<{ d: string; close: number }>): Promise<Set<string>> => {
    const bad = suspectBars(series, spikeThreshold(symbol, wild));
    for (const b of bad) {
      suspects.push(`${symbol} ${b.d}=${b.close}`);
      const { error: de } = await db.from("prices_daily").delete().eq("symbol", symbol).eq("d", b.d).like("source", "yahoo%");
      if (de) throw new Error("prices_daily: " + de.message);
    }
    return new Set(bad.map((b) => b.d));
  };
  // Currency pairs: Yahoo's daily bar is not a close (see _shared/fx.ts), so the day's close is the last hourly
  // price before 17:00 New York. Only finished days are booked, and never a weekend date.
  {
    let k = 0;
    await Promise.all(Array.from({ length: 5 }, async () => {
      for (;;) {
        const p = pairs[k++]; if (!p) return;
        try {
          const c = await chart(p.symbol, "1mo", "1h");
          const closes = fxClosesFromHourly(c.timestamp, c.close, now.getTime() / 1000);
          const bad = await guard(p.symbol, false, closes);
          for (const x of closes) if (!bad.has(x.d)) rows.push({ symbol: p.symbol, d: x.d, close: x.close, source: FX_SOURCE_HOURLY, updated_at: now.toISOString() });
        } catch { missing.push(p.symbol); }
      }
    }));
  }
  for (const i of inst) {
    const s = series[i.symbol];
    if (!s) { missing.push(i.symbol); continue; }
    const m = marketById(i.market);
    const today = partsIn(i.tz, now).ymd;
    const inSession = m ? ["OPEN", "BREAK"].includes(marketState(m, now, holidays)) : false;
    const mine: Array<{ d: string; close: number }> = [];
    for (let k = 0; k < s.timestamp.length; k++) {
      const v = s.close[k];
      if (v == null || !Number.isFinite(v)) continue;
      const d = localDate(i.tz, s.timestamp[k]);
      if (d > today) continue;
      if (d === today && inSession) continue;              // never book a session still trading
      if (mine.length && mine[mine.length - 1].d === d) mine[mine.length - 1].close = v; else mine.push({ d, close: v });   // two bars on one local date: keep the last
    }
    const bad = await guard(i.symbol, i.market === "CRYPTO" || i.cls === "Volatility", mine);
    for (const x of mine) if (!bad.has(x.d)) rows.push({ symbol: i.symbol, d: x.d, close: x.close, source: "yahoo", updated_at: now.toISOString() });
  }
  const uniq = [...new Map(rows.map((r) => [`${r.symbol}|${r.d}`, r])).values()];   // two bars can land on one exchange-local date (DST edges, Sydney): keep the last
  for (const part of chunk(uniq, 1000)) {
    const { error: ue } = await db.from("prices_daily").upsert(part, { onConflict: "symbol,d" });
    if (ue) throw new Error("prices_daily: " + ue.message);
  }
  const n = await saveTableSnapshot(now);
  return `${rows.length} closes for ${everything.length - missing.length} instruments (${pairs.length} currency pairs at the 17:00 New York close)${missing.length ? `, missing: ${missing.join(" ")}` : ""}${suspects.length ? `; misprints dropped: ${suspects.join(", ")}` : ""}; table ${n} rows`;
}
