// One-off (and re-runnable) history backfill for the Orrery Monitor.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx backfill.ts [--years 10] [--only ^N225,^GSPC] [--skip-curves]
// Yahoo chart endpoint per symbol (daily OHLCV, exchange-local dates), MOF full history for the JGB curve and
// Treasury yearly CSVs for the US curve. Nothing is interpolated; sessions still trading are not booked.
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(2); }
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const arg = (k: string, d = ""): string => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] ?? d : d; };
const flag = (k: string): boolean => process.argv.includes("--" + k);
const YEARS = Number(arg("years", "10"));
const ONLY = arg("only").split(",").map((s) => s.trim()).filter(Boolean);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

interface Instrument { symbol: string; tz: string; market: string; provider: string }
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function localDate(tz: string, epochSec: number): string {
  let f = fmtCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }); fmtCache.set(tz, f); }
  return f.format(new Date(epochSec * 1000));   // en-CA gives YYYY-MM-DD
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(45000) });
    if (r.status === 429) { await sleep(5000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }
  throw new Error("rate limited");
}

async function upsert(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<void> {
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 1000), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function yahooHistory(inst: Instrument[]): Promise<void> {
  const todayUtc = new Date();
  for (const i of inst) {
    try {
      const j = (await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(i.symbol)}?range=${YEARS}y&interval=1d`)) as {
        chart: { result: Array<{ meta: { exchangeTimezoneName: string; currentTradingPeriod?: { regular?: { start: number; end: number } } }; timestamp?: number[]; indicators: { quote: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> } }> | null; error: { description?: string } | null };
      };
      const res = j.chart.result?.[0];
      if (!res?.timestamp) { console.log(`${i.symbol}: ${j.chart.error?.description ?? "no data"}`); continue; }
      const tz = res.meta.exchangeTimezoneName || i.tz;
      const q = res.indicators.quote[0];
      const reg = res.meta.currentTradingPeriod?.regular;
      const nowSec = todayUtc.getTime() / 1000;
      const inSession = !!reg && nowSec >= reg.start && nowSec < reg.end + 1800;   // half an hour of grace for the official close
      const todayLocal = localDate(tz, nowSec);
      const rows: Record<string, unknown>[] = [];
      for (let k = 0; k < res.timestamp.length; k++) {
        const c = q.close?.[k];
        if (c == null || !Number.isFinite(c)) continue;
        const d = localDate(tz, res.timestamp[k]);
        if (d === todayLocal && inSession) continue;
        rows.push({ symbol: i.symbol, d, close: c, open: q.open?.[k] ?? null, high: q.high?.[k] ?? null, low: q.low?.[k] ?? null, volume: q.volume?.[k] ?? null, source: "yahoo", updated_at: todayUtc.toISOString() });
      }
      await upsert("prices_daily", rows, "symbol,d");
      if (tz !== i.tz) console.log(`  note: ${i.symbol} exchange tz ${tz} differs from instruments.tz ${i.tz}`);
      console.log(`${i.symbol}: ${rows.length} daily closes (${rows[0]?.d} .. ${rows[rows.length - 1]?.d})`);
      await sleep(400);
    } catch (e) { console.log(`${i.symbol}: ERROR ${e instanceof Error ? e.message : e}`); }
  }
}

const splitCsv = (line: string) => line.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
async function mofCurve(): Promise<void> {
  const text = await (await fetch("https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv", { headers: { "user-agent": UA } })).text();
  const lines = text.split(/\r?\n/);
  const hi = lines.findIndex((l) => /^Date,/i.test(l));
  const head = splitCsv(lines[hi]);
  const curves: Record<string, unknown>[] = [], prices: Record<string, unknown>[] = [];
  for (const line of lines.slice(hi + 1)) {
    const c = splitCsv(line); const md = c[0]?.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/); if (!md) continue;
    const d = `${md[1]}-${md[2].padStart(2, "0")}-${md[3].padStart(2, "0")}`;
    for (let k = 1; k < head.length; k++) {
      const tenor = head[k], yrs = Number(tenor.replace(/Y$/i, "")), v = Number(c[k]);
      if (!Number.isFinite(yrs) || c[k] === "" || c[k] === "-" || !Number.isFinite(v)) continue;
      curves.push({ country: "JP", d, tenor, years: yrs, yield: v, source: "MOF Japan reference yields (jgbcme)" });
      if (tenor === "10Y") prices.push({ symbol: "JGB10Y", d, close: v, source: "mof" });
    }
  }
  await upsert("curves", curves, "country,d,tenor");
  await upsert("prices_daily", prices, "symbol,d");
  console.log(`MOF: ${curves.length} curve points, ${prices.length} JGB10Y closes`);
}

const US_TENORS: Array<[string, number]> = [["1 Mo", 1 / 12], ["1.5 Month", 1.5 / 12], ["2 Mo", 2 / 12], ["3 Mo", 0.25], ["4 Mo", 4 / 12], ["6 Mo", 0.5], ["1 Yr", 1], ["2 Yr", 2], ["3 Yr", 3], ["5 Yr", 5], ["7 Yr", 7], ["10 Yr", 10], ["20 Yr", 20], ["30 Yr", 30]];
async function treasuryCurve(): Promise<void> {
  const thisYear = new Date().getUTCFullYear();
  for (let y = thisYear - YEARS; y <= thisYear; y++) {
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`;
    const r = await fetch(url, { headers: { "user-agent": UA } });
    if (!r.ok) { console.log(`Treasury ${y}: HTTP ${r.status}`); continue; }
    const lines = (await r.text()).split(/\r?\n/).filter(Boolean);
    const head = splitCsv(lines[0]); const idx = new Map(head.map((h, k) => [h, k]));
    const curves: Record<string, unknown>[] = [], prices: Record<string, unknown>[] = [];
    for (const line of lines.slice(1)) {
      const c = splitCsv(line); const md = c[idx.get("Date") ?? 0]?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!md) continue;
      const d = `${md[3]}-${md[1]}-${md[2]}`;
      for (const [tenor, yrs] of US_TENORS) {
        const k = idx.get(tenor); if (k == null) continue;
        const v = Number(c[k]); if (c[k] === "" || !Number.isFinite(v)) continue;
        curves.push({ country: "US", d, tenor, years: yrs, yield: v, source: "treasury.gov daily par yield curve" });
        if (tenor === "2 Yr") prices.push({ symbol: "UST2Y", d, close: v, source: "treasury" });
      }
    }
    await upsert("curves", curves, "country,d,tenor");
    await upsert("prices_daily", prices, "symbol,d");
    console.log(`Treasury ${y}: ${curves.length} curve points`);
    await sleep(500);
  }
}

(async () => {
  const { data, error } = await db.from("instruments").select("symbol,tz,market,provider").eq("active", true).order("ord");
  if (error) throw new Error(error.message);
  let inst = (data as Instrument[]).filter((i) => i.provider === "yahoo");
  if (ONLY.length) inst = inst.filter((i) => ONLY.includes(i.symbol));
  console.log(`backfill: ${inst.length} Yahoo instruments, ${YEARS} years`);
  await yahooHistory(inst);
  if (!flag("skip-curves") && !ONLY.length) { await mofCurve(); await treasuryCurve(); }
  // rebuild the table snapshot through the daily job's helper would need the function; the next tick does it.
  console.log("done. The next tick (or daily?job=history) rebuilds the table snapshot.");
})().catch((e) => { console.error(e); process.exit(1); });
