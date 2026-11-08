// Constituent statistics for the EQUITIES pages, from Yahoo daily closes (spark, one request per 20 names,
// five years of history): day / week / month / quarter / half-year / year / three-year changes, 50- and
// 200-day averages, 52-week range; a daily breadth history over the last three years; market cap, volume and
// average volume from the quote endpoint (treemap sizing and flow by sector); net money flow from minute bars.
// Plus FINRA daily US short-volume ratios.
import { chunk, db, selectAll } from "./db.ts";
import { fetchText } from "./http.ts";
import { chart, quotes, spark } from "./yahoo.ts";
import type { IndexId } from "./constituents.ts";

interface Constituent { idx: string; symbol: string; name: string; name_en: string | null; sector: string | null; gics_industry: string | null; weight: number | null }

const pct = (a: number | null, b: number | null) => (a == null || b == null || a === 0 ? null : (b / a - 1) * 100);

/** Rolling max and min over a trailing window, O(n) with monotonic deques; null until the window is full. */
function rollingExtrema(vals: number[], win: number): { hi: Array<number | null>; lo: Array<number | null> } {
  const n = vals.length, hi: Array<number | null> = new Array(n).fill(null), lo: Array<number | null> = new Array(n).fill(null);
  const dq: number[] = [], dqMin: number[] = [];
  for (let i = 0; i < n; i++) {
    while (dq.length && vals[dq[dq.length - 1]] <= vals[i]) dq.pop(); dq.push(i); while (dq[0] <= i - win) dq.shift();
    while (dqMin.length && vals[dqMin[dqMin.length - 1]] >= vals[i]) dqMin.pop(); dqMin.push(i); while (dqMin[0] <= i - win) dqMin.shift();
    if (i >= win - 1) { hi[i] = vals[dq[0]]; lo[i] = vals[dqMin[0]]; }
  }
  return { hi, lo };
}
function rollingMean(vals: number[], win: number): Array<number | null> {
  const out: Array<number | null> = new Array(vals.length).fill(null);
  let s = 0;
  for (let i = 0; i < vals.length; i++) { s += vals[i]; if (i >= win) s -= vals[i - win]; if (i >= win - 1) out[i] = s / win; }
  return out;
}

/** The not-null columns of constituent_stats, needed on every upsert even when only a few fields change. */
async function keyRows(idx: string): Promise<Array<{ symbol: string; name: string; d: string; close: number }>> {
  return selectAll<{ symbol: string; name: string; d: string; close: number }>(() => db.from("constituent_stats").select("symbol,name,d,close").eq("idx", idx).order("symbol"));
}

export async function computeIndexStats(idx: IndexId, log: (s: string) => void = () => {}): Promise<string> {
  const list = await selectAll<Constituent>(() => db.from("constituents").select("idx,symbol,name,name_en,sector,gics_industry,weight").eq("idx", idx).order("symbol"));
  if (!list.length) return `${idx}: no constituents loaded`;
  const series = await spark(list.map((c) => c.symbol), "5y", "1d");
  const rows: Array<Record<string, unknown>> = [];
  const breadth = new Map<string, { n: number; adv: number; dec: number; above50: number; above200: number; new_hi: number; new_lo: number }>();
  const sinceBreadth = new Date(Date.now() - 3.1 * 365.25 * 86400e3).toISOString().slice(0, 10);
  let missing = 0;
  for (const c of list) {
    const s = series[c.symbol];
    if (!s) { missing++; continue; }
    const closes: Array<{ d: string; v: number }> = [];
    for (let i = 0; i < s.close.length; i++) { const v = s.close[i]; if (v != null && Number.isFinite(v)) closes.push({ d: new Date(s.timestamp[i] * 1000).toISOString().slice(0, 10), v }); }
    if (closes.length < 2) { missing++; continue; }
    const vals = closes.map((x) => x.v), n = vals.length, last = vals[n - 1];
    const back = (k: number) => (n - 1 - k >= 0 ? vals[n - 1 - k] : null);
    const m50 = rollingMean(vals, 50), m200 = rollingMean(vals, 200), ex = rollingExtrema(vals, 252);
    rows.push({
      idx, symbol: c.symbol, name: c.name_en ?? c.name, sector: c.sector, industry: c.gics_industry, weight: c.weight, d: closes[n - 1].d,
      close: last, prev: back(1), pct1d: pct(back(1), last), pct1w: pct(back(5), last), pct1m: pct(back(21), last), pct3m: pct(back(63), last), pct6m: pct(back(126), last),
      pct12m: pct(back(252) ?? (n >= 200 ? vals[0] : null), last), pct36m: pct(back(756) ?? (n >= 600 ? vals[0] : null), last),
      dma50: m50[n - 1], dma200: m200[n - 1], hi52: ex.hi[n - 1] ?? Math.max(...vals.slice(-252)), lo52: ex.lo[n - 1] ?? Math.min(...vals.slice(-252)), updated_at: new Date().toISOString(),
    });
    // breadth history: one count per date over the last three years
    for (let i = 1; i < n; i++) {
      const d = closes[i].d; if (d < sinceBreadth) continue;
      const b = breadth.get(d) ?? { n: 0, adv: 0, dec: 0, above50: 0, above200: 0, new_hi: 0, new_lo: 0 };
      b.n++; if (vals[i] > vals[i - 1]) b.adv++; else if (vals[i] < vals[i - 1]) b.dec++;
      if (m50[i] != null && vals[i] > m50[i]!) b.above50++; if (m200[i] != null && vals[i] > m200[i]!) b.above200++;
      if (ex.hi[i] != null && vals[i] >= ex.hi[i]! * 0.999) b.new_hi++; if (ex.lo[i] != null && vals[i] <= ex.lo[i]! * 1.001) b.new_lo++;
      breadth.set(d, b);
    }
  }
  // quotes: market cap, volume, average volume -> turnover and average turnover in local currency
  let quoted = 0;
  try {
    const q = await quotes(rows.map((r) => r.symbol as string));
    const at = new Date().toISOString();
    for (const r of rows) {
      const x = q[r.symbol as string]; if (!x) continue;
      const px = x.price ?? (r.close as number);
      Object.assign(r, { mcap: x.marketCap, volume: x.volume, adv3m: x.adv3m, turnover: x.volume != null ? x.volume * px : null, adv_turnover: x.adv3m != null ? x.adv3m * px : null, quote_at: at });
      quoted++;
    }
  } catch (e) { log(`quotes failed: ${e instanceof Error ? e.message : e}`); }
  for (const part of chunk(rows, 500)) { const { error: ue } = await db.from("constituent_stats").upsert(part, { onConflict: "idx,symbol" }); if (ue) throw new Error("constituent_stats: " + ue.message); }
  // drop statistics of names that left the index
  const keep = new Set(rows.map((r) => r.symbol as string));
  const stale = (await keyRows(idx)).map((r) => r.symbol).filter((s) => !keep.has(s));
  if (stale.length) await db.from("constituent_stats").delete().eq("idx", idx).in("symbol", stale);
  // only dates where most names reported (avoids partial last days and holidays of a subset)
  const bh = [...breadth.entries()].filter(([, b]) => b.n >= rows.length * 0.6).map(([d, b]) => ({ idx, d, ...b }));
  for (const part of chunk(bh, 1000)) { const { error: be } = await db.from("breadth_history").upsert(part, { onConflict: "idx,d" }); if (be) throw new Error("breadth_history: " + be.message); }
  log(`${idx}: ${rows.length} names`);
  return `${idx}: ${rows.length} names, ${quoted} quoted, ${bh.length} breadth days${missing ? `, ${missing} without data` : ""}${stale.length ? `, ${stale.length} removed` : ""}`;
}

/** Intraday refresh of market cap, day volume and turnover for one index (no history), for flow by sector. */
export async function refreshQuotes(idx: IndexId): Promise<string> {
  const rows = await keyRows(idx);
  if (!rows.length) return `${idx}: no statistics yet`;
  const q = await quotes(rows.map((r) => r.symbol));
  const at = new Date().toISOString();
  const upd: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    const x = q[r.symbol]; if (!x) continue;
    const px = x.price ?? r.close;
    upd.push({ idx, symbol: r.symbol, name: r.name, d: r.d, close: r.close, mcap: x.marketCap, volume: x.volume, adv3m: x.adv3m, turnover: x.volume != null ? x.volume * px : null, adv_turnover: x.adv3m != null ? x.adv3m * px : null, quote_at: at });
  }
  for (const part of chunk(upd, 500)) { const { error: ue } = await db.from("constituent_stats").upsert(part, { onConflict: "idx,symbol" }); if (ue) throw new Error("constituent_stats: " + ue.message); }
  return `${idx}: ${upd.length} of ${rows.length} quoted`;
}

/** Net money flow for the latest session from one-minute bars: each bar's turnover (volume × close) counts as
 *  buying when the bar closed above the previous bar and as selling when below; unchanged bars carry the
 *  previous direction (the tick rule applied to minute bars, the usual approximation of money flow). */
export async function computeMoneyFlow(idx: IndexId, log: (s: string) => void = () => {}): Promise<string> {
  const rows = await keyRows(idx);
  if (!rows.length) return `${idx}: no statistics yet`;
  const at = new Date().toISOString();
  const upd: Array<Record<string, unknown>> = [];
  let failed = 0;
  const work = [...rows];
  const worker = async () => {
    for (;;) {
      const r = work.shift(); if (!r) return;
      try {
        // the previous session's close (chart metadata) seeds the direction of the opening bar, so an overnight gap
        // and the opening auction volume that trades on it count; the tick rule alone misses them
        const c = await chart(r.symbol, "1d", "1m");
        const dayOf = (t: number) => new Date(t * 1000).toLocaleDateString("en-CA", { timeZone: c.tz || "UTC" });
        let session = "";
        for (let i = c.timestamp.length - 1; i >= 0; i--) if (c.close[i] != null) { session = dayOf(c.timestamp[i]); break; }
        let up = 0, down = 0, dir = 0, prev: number | null = c.prevClose, lastT = 0;
        for (let i = 0; i < c.timestamp.length; i++) {
          const px = c.close[i], vol = c.volume[i];
          if (px == null || !Number.isFinite(px)) continue;
          if (dayOf(c.timestamp[i]) !== session) { prev = px; continue; }   // earlier sessions only supply the previous close
          if (prev != null) { if (px > prev) dir = 1; else if (px < prev) dir = -1; }
          if (vol && prev != null) { if (dir > 0) up += vol * px; else if (dir < 0) down += vol * px; }
          prev = px; lastT = c.timestamp[i];
        }
        const d = lastT ? new Date(lastT * 1000).toLocaleDateString("en-CA", { timeZone: c.tz || "UTC" }) : null;
        upd.push({ idx, symbol: r.symbol, name: r.name, d: r.d, close: r.close, mf_up: up, mf_down: down, mf_net: up - down, mf_d: d, mf_at: at });
      } catch (e) { failed++; if (failed <= 3) log(`${r.symbol}: ${e instanceof Error ? e.message : e}`); }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  for (const part of chunk(upd, 500)) { const { error: ue } = await db.from("constituent_stats").upsert(part, { onConflict: "idx,symbol" }); if (ue) throw new Error("constituent_stats: " + ue.message); }
  return `${idx}: money flow for ${upd.length} of ${rows.length}${failed ? `, ${failed} failed` : ""}`;
}

/** FINRA consolidated short-sale volume for one trading day: the most recent available (tries the last six
 *  days) or, with `back`, the day that many calendar days ago (for backfilling the history). Also stores the
 *  index averages in short_agg. */
export async function loadShortVolume(back?: number): Promise<string> {
  const tries = back ? [back] : [1, 2, 3, 4, 5, 6];
  for (const b of tries) {
    const day = new Date(Date.now() - b * 86400e3);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) { if (back) return `FINRA: ${day.toISOString().slice(0, 10)} is a weekend`; continue; }
    const ymd = day.toISOString().slice(0, 10), tag = ymd.replace(/-/g, "");
    let text: string;
    try { text = await fetchText(`https://cdn.finra.org/equity/regsho/daily/CNMSshvol${tag}.txt`, {}, 60000); } catch { if (back) return `FINRA: no file for ${ymd}`; continue; }
    const cons = await selectAll<{ symbol: string; idx: string }>(() => db.from("constituents").select("symbol,idx").in("idx", ["SP500", "NDX"]).order("symbol"));
    const want = new Map<string, string[]>();   // FINRA symbol (BRK.B) -> indices
    for (const c of cons) { const k = c.symbol.replace(/-/g, "."); want.set(k, [...(want.get(k) ?? []), c.idx]); }
    const rows: Array<Record<string, unknown>> = [];
    const byIdx: Record<string, number[]> = { SP500: [], NDX: [] };
    for (const line of text.split(/\r?\n/).slice(1)) {
      const c = line.split("|");
      if (c.length < 4 || !want.has(c[1])) continue;
      const sv = Number(c[2]), tv = Number(c[4] ?? c[3]);
      if (!Number.isFinite(sv) || !Number.isFinite(tv) || tv <= 0) continue;
      rows.push({ d: ymd, symbol: c[1].replace(/\./g, "-"), short_vol: Math.round(sv), total_vol: Math.round(tv), ratio: sv / tv });
      for (const ix of want.get(c[1])!) byIdx[ix].push(sv / tv);
    }
    for (const part of chunk(rows, 1000)) { const { error } = await db.from("short_volume").upsert(part, { onConflict: "d,symbol" }); if (error) throw new Error("short_volume: " + error.message); }
    const agg = Object.entries(byIdx).filter(([, xs]) => xs.length).map(([idx, xs]) => ({ d: ymd, idx, metric: "finra_avg_ratio", value: xs.reduce((a, v) => a + v, 0) / xs.length, n: xs.length }));
    if (agg.length) { const { error } = await db.from("short_agg").upsert(agg, { onConflict: "d,idx,metric" }); if (error) throw new Error("short_agg: " + error.message); }
    return `FINRA ${ymd}: ${rows.length} names`;
  }
  throw new Error("FINRA: no short-volume file found for the last six days");
}
