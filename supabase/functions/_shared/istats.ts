// Constituent statistics for the EQUITIES pages, from Yahoo daily closes (spark, one request per 20 names,
// one year of history): day / week / month / quarter / year changes, 50- and 200-day averages, 52-week range.
// Plus daily US short-volume ratios from FINRA's consolidated short-sale volume files.
import { chunk, db } from "./db.ts";
import { fetchText } from "./http.ts";
import { spark } from "./yahoo.ts";

interface Constituent { idx: string; symbol: string; name: string; sector: string | null; weight: number | null }

const pct = (a: number | null, b: number | null) => (a == null || b == null || a === 0 ? null : (b / a - 1) * 100);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

export async function computeIndexStats(idx: "SP500" | "NK225" | "NDX", log: (s: string) => void = () => {}): Promise<string> {
  const { data, error } = await db.from("constituents").select("idx,symbol,name,sector,weight").eq("idx", idx);
  if (error) throw new Error(error.message);
  const list = (data ?? []) as Constituent[];
  if (!list.length) return `${idx}: no constituents loaded`;
  const series = await spark(list.map((c) => c.symbol), "1y", "1d");
  const rows: Array<Record<string, unknown>> = [];
  let missing = 0;
  for (const c of list) {
    const s = series[c.symbol];
    if (!s) { missing++; continue; }
    const closes: Array<{ t: number; v: number }> = [];
    for (let i = 0; i < s.close.length; i++) { const v = s.close[i]; if (v != null && Number.isFinite(v)) closes.push({ t: s.timestamp[i], v }); }
    if (closes.length < 2) { missing++; continue; }
    const vals = closes.map((x) => x.v), last = vals[vals.length - 1], n = vals.length;
    const back = (k: number) => (n - 1 - k >= 0 ? vals[n - 1 - k] : null);
    const d = new Date(closes[closes.length - 1].t * 1000).toISOString().slice(0, 10);
    rows.push({
      idx, symbol: c.symbol, name: c.name, sector: c.sector, weight: c.weight, d,
      close: last, prev: back(1), pct1d: pct(back(1), last), pct1w: pct(back(5), last), pct1m: pct(back(21), last), pct3m: pct(back(63), last), pct12m: pct(vals[0], last),
      dma50: n >= 50 ? mean(vals.slice(-50)) : null, dma200: n >= 200 ? mean(vals.slice(-200)) : null,
      hi52: Math.max(...vals), lo52: Math.min(...vals), updated_at: new Date().toISOString(),
    });
  }
  for (const part of chunk(rows, 500)) { const { error: ue } = await db.from("constituent_stats").upsert(part, { onConflict: "idx,symbol" }); if (ue) throw new Error("constituent_stats: " + ue.message); }
  log(`${idx}: ${rows.length} names`);
  return `${idx}: ${rows.length} names${missing ? `, ${missing} without data` : ""}`;
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
      rows.push({ d: ymd, symbol: c[1].replace(/\./g, "-"), short_vol: Math.round(sv), total_vol: Math.round(tv), ratio: sv / tv });   // FINRA reports fractional shares
    }
    for (const part of chunk(rows, 1000)) { const { error } = await db.from("short_volume").upsert(part, { onConflict: "d,symbol" }); if (error) throw new Error("short_volume: " + error.message); }
    return `FINRA ${ymd}: ${rows.length} names`;
  }
  throw new Error("FINRA: no short-volume file found for the last six days");
}
