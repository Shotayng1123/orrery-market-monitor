// Rebuilds the daily closes of every currency pair on the 17:00 New York convention (see
// supabase/functions/_shared/fx.ts for why Yahoo's own daily bars cannot be used as closes).
//   recent history (as far as Yahoo's hourly bars reach, about two years): last hourly price before 17:00 New York
//   older history: Yahoo's daily bar re-dated to the day it actually describes (the previous FX day)
// Rows on dates the rebuild does not produce (weekends) are removed. open/high/low are cleared: Yahoo's
// daily range belongs to a different window than the close booked here.
//   npx tsx --env-file=.env fx_backfill.ts            dry run: prints the comparison, writes nothing
//   npx tsx --env-file=.env fx_backfill.ts --apply    writes prices_daily
import { db, selectAll } from "./lib/db.js";
import { FX_SOURCE_HOURLY, FX_SOURCE_SHIFTED, fxClosesFromDaily, fxClosesFromHourly, isFxPair, spikeThreshold, suspectBars, type FxClose } from "../supabase/functions/_shared/fx.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const APPLY = process.argv.includes("--apply");
const ONLY = process.argv.find((a) => a.endsWith("=X"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bars(symbol: string, query: string): Promise<{ ts: number[]; close: Array<number | null> }> {
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { chart: { result?: Array<{ timestamp?: number[]; indicators: { quote: Array<{ close?: Array<number | null> }> } }>; error?: { description?: string } } };
      const res = j.chart.result?.[0];
      if (!res?.timestamp) throw new Error(j.chart.error?.description ?? "no data");
      return { ts: res.timestamp, close: res.indicators.quote[0].close ?? [] };
    } catch (e) { if (k === 2) throw e; await sleep(2000); }
  }
  throw new Error("unreachable");
}

(async () => {
  const sb = db();
  const { data: inst, error } = await sb.from("instruments").select("symbol,name").eq("active", true).order("ord");
  if (error) throw new Error(error.message);
  const pairs = (inst as Array<{ symbol: string; name: string }>).filter((i) => isFxPair(i.symbol) && (!ONLY || i.symbol === ONLY));
  const nowSec = Date.now() / 1000;
  console.log(`${pairs.length} currency pairs; ${APPLY ? "APPLYING" : "dry run"}`);
  for (const p of pairs) {
    try {
      const h = await bars(p.symbol, "range=730d&interval=1h");
      const d = await bars(p.symbol, "range=10y&interval=1d");
      const hourly = fxClosesFromHourly(h.ts, h.close, nowSec);
      const shifted = fxClosesFromDaily(d.ts, d.close);
      const firstHourly = hourly[0]?.d ?? "9999";
      // how well the re-dated daily bars agree with the hourly closes where both exist (and how badly the raw ones do)
      const hBy = new Map(hourly.map((x) => [x.d, x.close]));
      const rawBy = new Map<string, number>();
      for (let k = 0; k < d.ts.length; k++) { const v = d.close[k]; if (v != null) rawBy.set(new Date(d.ts[k] * 1000 + 3600e3).toISOString().slice(0, 10), v); }
      let nS = 0, eS = 0, nR = 0, eR = 0;
      for (const s of shifted) { const hv = hBy.get(s.d); if (hv != null) { nS++; eS += Math.abs(s.close / hv - 1); } }
      for (const [dd, v] of rawBy) { const hv = hBy.get(dd); if (hv != null) { nR++; eR += Math.abs(v / hv - 1); } }
      const merged: Array<FxClose & { source: string }> = [...shifted.filter((x) => x.d < firstHourly).map((x) => ({ ...x, source: FX_SOURCE_SHIFTED })), ...hourly.map((x) => ({ ...x, source: FX_SOURCE_HOURLY }))];
      const bad = suspectBars(merged, spikeThreshold(p.symbol));
      const badSet = new Set(bad.map((b) => b.d));
      const keep = merged.filter((x) => !badSet.has(x.d));
      const existing = await selectAll<{ d: string; close: number }>(() => sb.from("prices_daily").select("d,close").eq("symbol", p.symbol).order("d"));
      const keepSet = new Set(keep.map((x) => x.d));
      const drop = existing.filter((e) => !keepSet.has(e.d) && e.d >= (keep[0]?.d ?? "0000"));
      const exBy = new Map(existing.map((e) => [e.d, e.close]));
      const last = keep.slice(-3).map((x) => `${x.d} ${x.close} (was ${exBy.get(x.d) ?? "–"})`).join("; ");
      console.log(`${p.symbol.padEnd(10)} hourly ${hourly.length} days from ${firstHourly}; daily ${shifted.length} from ${shifted[0]?.d}; vs hourly close: re-dated daily ${(eS / Math.max(1, nS) * 100).toFixed(3)}% mean abs diff (n ${nS}), raw daily ${(eR / Math.max(1, nR) * 100).toFixed(3)}% (n ${nR})`);
      console.log(`           rows ${keep.length} (existing ${existing.length}); removing ${drop.length} (${drop.slice(-4).map((x) => x.d).join(",")}); suspect bars skipped: ${bad.map((b) => `${b.d}=${b.close}`).join(" ") || "none"}; latest: ${last}`);
      if (APPLY) {
        const stamp = new Date().toISOString();
        const rows = keep.map((x) => ({ symbol: p.symbol, d: x.d, close: x.close, open: null, high: null, low: null, volume: null, source: x.source, updated_at: stamp }));
        for (let i = 0; i < rows.length; i += 1000) { const { error: ue } = await sb.from("prices_daily").upsert(rows.slice(i, i + 1000), { onConflict: "symbol,d" }); if (ue) throw new Error(ue.message); }
        for (const x of [...drop, ...bad.filter((b) => exBy.has(b.d))]) { const { error: de } = await sb.from("prices_daily").delete().eq("symbol", p.symbol).eq("d", x.d); if (de) throw new Error(de.message); }
      }
      await sleep(500);
    } catch (e) { console.log(`${p.symbol}: ERROR ${e instanceof Error ? e.message : e}`); }
  }
  if (APPLY) await sb.from("job_runs").insert({ job: "actions:fx_backfill", ok: true, detail: `${pairs.length} pairs rebuilt on the 17:00 New York close`, ms: 0 });
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
