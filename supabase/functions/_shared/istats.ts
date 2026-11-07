// Constituent statistics for the EQUITIES pages, from Yahoo daily closes (spark, one request per 20 names,
// five years of history): day / week / month / quarter / year changes, 50- and 200-day averages, 52-week
// range; a daily breadth history over the last three years; market cap, volume and average volume from the
// quote endpoint (treemap sizing and flow by sector). Plus FINRA daily US short-volume ratios.
import { chunk, db } from "./db.ts";
import { fetchText } from "./http.ts";
import { quotes, spark } from "./yahoo.ts";

interface Constituent { idx: string; symbol: string; name: string; sector: string | null; weight: number | null }

const pct = (a: number | null, b: number | null) => (a == null || b == null || a === 0 ? null : (b / a - 1) * 100);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

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

export async function computeIndexStats(idx: "SP500" | "NK225" | "NDX", log: (s: string) => void = () => {}): Promise<string> {
  const { data, error } = await db.from("constituents").select("idx,symbol,name,sector,weight").eq("idx", idx);
  if (error) throw new Error(error.message);
  const list = (data ?? []) as Constituent[];
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
      idx, symbol: c.symbol, name: c.name, sector: c.sector, weight: c.weight, d: closes[n - 1].d,
      close: last, prev: back(1), pct1d: pct(back(1), last), pct1w: pct(back(5), last), pct1m: pct(back(21), last), pct3m: pct(back(63), last), pct12m: pct(back(252) ?? vals[0], last),
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
  // only dates where most names reported (avoids partial last days and holidays of a subset)
  const bh = [...breadth.entries()].filter(([, b]) => b.n >= rows.length * 0.6).map(([d, b]) => ({ idx, d, ...b }));
  for (const part of chunk(bh, 1000)) { const { error: be } = await db.from("breadth_history").upsert(part, { onConflict: "idx,d" }); if (be) throw new Error("breadth_history: " + be.message); }
  log(`${idx}: ${rows.length} names`);
  return `${idx}: ${rows.length} names, ${quoted} quoted, ${bh.length} breadth days${missing ? `, ${missing} without data` : ""}`;
}

/** FINRA consolidated short-sale volume for the most recent available trading day (tries the last six days). */
export async function loadShortVolume(): Promise<string> {
  for (let back = 1; back <= 6; back++) {
    const day = new Date(Date.now() - back * 86400e3);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    const ymd = day.toISOString().slice(0, 10), tag = ymd.replace(/-/g, "");
    let text: string;
    try { text = await fetchText(`https://cdn.finra.org/equity/regsho/daily/CNMSshvol${tag}.txt`, {}, 60000); } catch { continue; }
    const { data: syms } = await db.from("constituents").select("symbol").in("idx", ["SP500", "NDX"]);
    const want = new Set((syms ?? []).map((s) => s.symbol.replace(/-/g, ".")));   // FINRA uses BRK.B
    const rows: Array<Record<string, unknown>> = [];
    for (const line of text.split(/\r?\n/).slice(1)) {
      const c = line.split("|");
      if (c.length < 4 || !want.has(c[1])) continue;
      const sv = Number(c[2]), tv = Number(c[4] ?? c[3]);
      if (!Number.isFinite(sv) || !Number.isFinite(tv) || tv <= 0) continue;
      rows.push({ d: ymd, symbol: c[1].replace(/\./g, "-"), short_vol: Math.round(sv), total_vol: Math.round(tv), ratio: sv / tv });
    }
    for (const part of chunk(rows, 1000)) { const { error } = await db.from("short_volume").upsert(part, { onConflict: "d,symbol" }); if (error) throw new Error("short_volume: " + error.message); }
    return `FINRA ${ymd}: ${rows.length} names`;
  }
  throw new Error("FINRA: no short-volume file found for the last six days");
}

/** Intraday refresh of market cap, day volume and turnover for one index (no history), for flow by sector. */
export async function refreshQuotes(idx: "SP500" | "NK225" | "NDX"): Promise<string> {
  // the upsert must carry every not-null column (name, d, close) even though the rows already exist
  const { data, error } = await db.from("constituent_stats").select("symbol,name,d,close").eq("idx", idx);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ symbol: string; name: string; d: string; close: number }>;
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
