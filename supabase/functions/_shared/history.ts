// The daily closes of every Yahoo instrument (prices_daily) and the table snapshot built from them.
// Runs inside the `daily` Edge Function (job=history, on pg_cron) and, with the same code, from GitHub Actions
// (jobs/history_deno.ts) as a catch-up for bars Yahoo publishes late and for crypto's weekend days.
import { chunk, db, sourceErr, sourceOk, type InstrumentRow } from "./db.ts";
import { localDate, marketById, marketState, partsIn } from "./sessions.ts";
import { FX_SOURCE_HOURLY, fxClosesFromHourly, isFxPair, spikeThreshold, suspectBars } from "./fx.ts";
import { loadHolidays, saveTableSnapshot } from "./table.ts";
import { chart, lastPrint, spark } from "./yahoo.ts";
import { OWN_SHORT_MIN, barSettled } from "./feedhealth.ts";

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
  // How far do the answers in hand reach? On 18 Nov 2026 the server was handed the prices of 10:52 New York time
  // all evening for everything but crypto, and booked them as that day's closes. The reach is read from the
  // answers themselves, as the newest minute bar given (a currency pair: its newest hourly bar, below):
  //   - for crypto, and for everything else together. A bar is booked only when that reading reaches the end
  //     of its day, less half an hour (feedhealth.ts, barSettled);
  //   - for each market on its own as well, with a wider grace (75 minutes), in case one market is handed old
  //     answers while the others are current. Wider because the Monitor's hours can be off: Mexico's index is
  //     given minute bars that end an hour before its bell in sessions.ts. On an exchange's half day (other
  //     than New York's, which are known) this holds the close back until its next session prints.
  // Where no reading can be made, bars are booked as before.
  const reach = new Map<string, number>();
  const reaches = (market: string, ms: number) => { if (!Number.isFinite(ms)) return; for (const k of [market === "CRYPTO" ? "crypto" : "rest", "m:" + market]) if (ms > (reach.get(k) ?? 0)) reach.set(k, ms); };
  try { const m1 = await spark(inst.map((i) => i.symbol), "1d", "1m"); for (const i of inst) { const lp = m1[i.symbol] ? lastPrint(m1[i.symbol]) : null; if (lp) reaches(i.market, lp.t * 1000); } } catch { /* no reading */ }
  const held = new Set<string>(), short = new Set<string>();
  const settled = (symbol: string, market: string, d: string): boolean => {
    const all = reach.get(market === "CRYPTO" ? "crypto" : "rest"), own = reach.get("m:" + market);
    const byAll = all == null || barSettled(market, d, all), byOwn = own == null || barSettled(market, d, own, OWN_SHORT_MIN);
    if (byAll && byOwn) return true;
    held.add(symbol); short.add(byAll ? "m:" + market : market === "CRYPTO" ? "crypto" : "rest");
    return false;
  };
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
    const fx: Array<{ symbol: string; closes: Array<{ d: string; close: number }> }> = [];
    await Promise.all(Array.from({ length: 5 }, async () => {
      for (;;) {
        const p = pairs[k++]; if (!p) return;
        try {
          const c = await chart(p.symbol, "1mo", "1h");
          const closes = fxClosesFromHourly(c.timestamp, c.close, now.getTime() / 1000);
          const bad = await guard(p.symbol, false, closes);
          const lp = lastPrint(c);
          if (lp) reaches("FX", (lp.t + 3600) * 1000);          // an hourly bar holds the hour that follows its stamp
          fx.push({ symbol: p.symbol, closes: closes.filter((x) => !bad.has(x.d)) });
        } catch { missing.push(p.symbol); }
      }
    }));
    // booked once every pair has been read, so that the reading has the newest bar of any of them
    for (const p of fx) for (const x of p.closes) if (settled(p.symbol, "FX", x.d)) rows.push({ symbol: p.symbol, d: x.d, close: x.close, source: FX_SOURCE_HOURLY, updated_at: now.toISOString() });
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
    for (const x of mine) if (!bad.has(x.d) && settled(i.symbol, i.market, x.d)) rows.push({ symbol: i.symbol, d: x.d, close: x.close, source: "yahoo", updated_at: now.toISOString() });
  }
  const uniq = [...new Map(rows.map((r) => [`${r.symbol}|${r.d}`, r])).values()];   // two bars can land on one exchange-local date (DST edges, Sydney): keep the last
  for (const part of chunk(uniq, 1000)) {
    const { error: ue } = await db.from("prices_daily").upsert(part, { onConflict: "symbol,d" });
    if (ue) throw new Error("prices_daily: " + ue.message);
  }
  const n = await saveTableSnapshot(now);
  return `${rows.length} closes for ${everything.length - missing.length} instruments (${pairs.length} currency pairs at the 17:00 New York close)${missing.length ? `, missing: ${missing.join(" ")}` : ""}${suspects.length ? `; misprints dropped: ${suspects.join(", ")}` : ""}${held.size ? `; NOT BOOKED, the answers in hand reaching only ${[...short].map((k) => `${new Date(reach.get(k)!).toISOString().slice(5, 16).replace("T", " ")} UTC for ${k === "rest" ? "everything but crypto" : k.replace(/^m:/, "")}`).join(", ")}: the newest close of ${held.size} instruments (${[...held].slice(0, 8).join(" ")}${held.size > 8 ? " …" : ""})` : ""}; table ${n} rows`;
}
