// Single-asset data for the search result page and the hover cards: quote, chart series (Yahoo when the symbol
// is not one of the table instruments), short data, the short statements of a hover card (from what the stock
// page has already stored for the name, otherwise Yahoo; EDINET DB itself is asked only by the stock page,
// edinet.ts), and a 12-month line relative to the home index.
import { db } from "./db.ts";
import { chart, quotes } from "./yahoo.ts";
import { fetchText } from "./http.ts";
import type { Bar } from "./stockstats.ts";
import type { Fin } from "./fin.ts";
import { legacyStatements } from "./finsrc.ts";

export interface SeriesOut { symbol: string; res: "1m" | "15m" | "1h" | "1d"; points: Array<{ t: number; v: number; q?: number | null }>; asOf: string | null; shownFrom?: string; source?: string }
type Pt = { t: number; v: number; q: number | null };
const RANGES: Record<string, number> = { "1W": 7, "1M": 31, "3M": 93, "12M": 366, "36M": 1096 };
const SIGMA_LOOKBACK_DAYS = 1120;

// ---- a small cache per isolate for series (minutes); statements are kept in the asset_cache table ----
const mem = new Map<string, { at: number; v: unknown }>();
const memo = async <T>(key: string, ttlMs: number, f: () => Promise<T>): Promise<T> => {
  const hit = mem.get(key); if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  const v = await f(); mem.set(key, { at: Date.now(), v }); return v;
};
/** Ten years of daily bars from Yahoo (close, high, low, volume), one fetch per symbol per ten minutes. Prices
 *  are adjusted for splits, not for dividends. The chart and the stock page's figures both read from this. */
export async function dailyBars(symbol: string): Promise<Bar[]> {
  return memo(`bars:1d:${symbol}`, 10 * 60e3, async () => {
    const c = await chart(symbol, "10y", "1d");
    const out: Bar[] = [];
    for (let i = 0; i < c.timestamp.length; i++) { const close = c.close[i]; if (close != null) out.push({ t: Math.floor(c.timestamp[i] / 86400) * 86400, c: close, h: c.high[i], l: c.low[i], v: c.volume[i] }); }
    return out;
  });
}

/** Yahoo-backed series in the same shape as the instrument series (1D one-minute, 1W/1M hourly, 3M+ daily). */
export async function yahooSeries(symbol: string, range: string): Promise<SeriesOut> {
  if (range === "1D") return memo(`s:1D:${symbol}`, 60e3, async () => {
    const c = await chart(symbol, "5d", "1m");
    const points = c.timestamp.map((t, i) => ({ t, v: c.close[i], q: c.volume[i] ?? null })).filter((p): p is Pt => p.v != null);
    return { symbol, res: "1m" as const, points, asOf: points.length ? new Date(points[points.length - 1].t * 1000).toISOString() : null, source: "yahoo" };
  });
  if (range === "1W" || range === "1M") return memo(`s:${range}:${symbol}`, 5 * 60e3, async () => {
    const c = await chart(symbol, range === "1W" ? "1mo" : "3mo", range === "1W" ? "15m" : "60m");
    const points = c.timestamp.map((t, i) => ({ t, v: c.close[i], q: c.volume[i] ?? null })).filter((p): p is Pt => p.v != null);
    return { symbol, res: (range === "1W" ? "15m" : "1h") as "15m" | "1h", points, asOf: points.length ? new Date(points[points.length - 1].t * 1000).toISOString() : null, source: "yahoo" };
  });
  const days = RANGES[range] ?? RANGES["12M"];
  const daily = (await dailyBars(symbol)).map((b) => ({ t: b.t, v: b.c, q: b.v ?? null }));
  const from = Math.floor((Date.now() - (days * 2 + SIGMA_LOOKBACK_DAYS) * 86400e3) / 1000);
  const points = daily.filter((p) => p.t >= from);
  return { symbol, res: "1d", shownFrom: new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10), points, asOf: points.length ? new Date(points[points.length - 1].t * 1000).toISOString().slice(0, 10) : null, source: "yahoo" };
}

/** Home index for the relative line, by suffix. */
export function homeIndex(symbol: string): { symbol: string; name: string } {
  if (/\.T$/.test(symbol)) return { symbol: "^N225", name: "Nikkei 225" };
  if (/\.KS$/.test(symbol)) return { symbol: "^KS11", name: "KOSPI" };
  if (/\.HK$/.test(symbol)) return { symbol: "^HSI", name: "Hang Seng" };
  if (/\.SS$|\.SZ$/.test(symbol)) return { symbol: "000001.SS", name: "Shanghai Composite" };
  if (/\.L$/.test(symbol)) return { symbol: "^FTSE", name: "FTSE 100" };
  if (/\.DE$/.test(symbol)) return { symbol: "^GDAXI", name: "DAX" };
  return { symbol: "^GSPC", name: "S&P 500" };
}

/** The indices a stock's change is set against on its page. Tokyo names: the Nikkei 225 and TOPIX (Shota, 18 Nov
 *  2026). The feed has no TOPIX series, so TOPIX is read from the 1306.T exchange-traded fund that tracks it, as on
 *  the MARKET tab, and the page says so. Like the index, the fund's price leaves dividends out; but the fund
 *  holds the dividends it receives until its yearly payout, so around that payout its change and the index's
 *  differ a little. */
export interface Benchmark { symbol: string; name: string; note: string | null }
export function benchmarksFor(symbol: string): Benchmark[] {
  if (/\.T$/.test(symbol)) return [
    { symbol: "^N225", name: "Nikkei 225", note: null },
    { symbol: "1306.T", name: "TOPIX", note: "TOPIX is read from the 1306.T exchange-traded fund that tracks it (the feed has no TOPIX series). The fund pays out the dividends it has collected once a year, so over a period that starts or ends near that payout its change differs a little from the index's." },
  ];
  if (/^\^|=|-USD$/.test(symbol)) return [];   // an index, a currency, a future or a coin is not set against a stock index
  return [{ ...homeIndex(symbol), note: null }];
}

// ---- statements ----
export interface StatementRow { period: string; label: string; revenue: number | null; op: number | null; ni: number | null; eps: number | null; assets?: number | null; equity?: number | null; cfo?: number | null; cfi?: number | null; cff?: number | null; fcf?: number | null }
export interface Statements { source: "edinetdb" | "yahoo" | null; currency: string | null; unit: string; annual: StatementRow[]; quarterly: StatementRow[]; forecast: { fiscalYearEnd: string | null; disclosed: string | null; revenue: number | null; op: number | null; ni: number | null; eps: number | null; dps: number | null } | null; note: string | null; asOf: string | null }

const YF_TYPES = ["TotalRevenue", "OperatingIncome", "NetIncome", "DilutedEPS", "TotalAssets", "StockholdersEquity", "OperatingCashFlow", "InvestingCashFlow", "FinancingCashFlow", "FreeCashFlow"];
async function yahooStatements(symbol: string, currency: string | null): Promise<Statements> {
  const types = [...YF_TYPES.map((t) => "annual" + t), ...YF_TYPES.slice(0, 4).map((t) => "quarterly" + t)].join(",");
  const p1 = Math.floor(Date.now() / 1000) - 6 * 366 * 86400, p2 = Math.floor(Date.now() / 1000);
  const text = await fetchText(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?type=${types}&period1=${p1}&period2=${p2}`, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } }, 30000);
  const j = JSON.parse(text) as { timeseries?: { result?: Array<Record<string, unknown> & { meta: { type: string[] } }> } };
  const byPeriod = { annual: new Map<string, StatementRow>(), quarterly: new Map<string, StatementRow>() };
  for (const r of j.timeseries?.result ?? []) {
    const type = r.meta.type[0]; const scope = type.startsWith("annual") ? "annual" : "quarterly"; const field = type.replace(/^annual|^quarterly/, "");
    const vals = (r[type] as Array<{ asOfDate: string; reportedValue?: { raw?: number } }> | undefined) ?? [];
    for (const v of vals) {
      if (!v?.asOfDate) continue;
      const row = byPeriod[scope].get(v.asOfDate) ?? { period: v.asOfDate, label: scope === "annual" ? `FY ${v.asOfDate.slice(0, 7)}` : v.asOfDate.slice(0, 7), revenue: null, op: null, ni: null, eps: null, assets: null, equity: null, cfo: null, cfi: null, cff: null, fcf: null };
      const x = v.reportedValue?.raw ?? null;
      if (field === "TotalRevenue") row.revenue = x; else if (field === "OperatingIncome") row.op = x; else if (field === "NetIncome") row.ni = x; else if (field === "DilutedEPS") row.eps = x;
      else if (field === "TotalAssets") row.assets = x; else if (field === "StockholdersEquity") row.equity = x; else if (field === "OperatingCashFlow") row.cfo = x; else if (field === "InvestingCashFlow") row.cfi = x; else if (field === "FinancingCashFlow") row.cff = x; else if (field === "FreeCashFlow") row.fcf = x;
      byPeriod[scope].set(v.asOfDate, row);
    }
  }
  const sortRows = (m: Map<string, StatementRow>) => [...m.values()].sort((a, b) => a.period.localeCompare(b.period));
  return { source: "yahoo", currency, unit: "1", annual: sortRows(byPeriod.annual).slice(-5), quarterly: sortRows(byPeriod.quarterly).slice(-6), forecast: null, note: "Yahoo Finance fundamentals (as reported); no company guidance", asOf: new Date().toISOString().slice(0, 10) };
}

/** The short statements of the hover card (and of the page as it was before 18 Nov 2026). They come from the
 *  fuller statements the stock page has already fetched for this name when there are any (asset_cache key
 *  fin2:SYMBOL, written by stock.ts), otherwise from Yahoo, kept a week. A card never asks EDINET DB: that
 *  source allows a hundred requests a day, and pointing at a name must not spend them. */
export async function statementsFor(symbol: string, currency: string | null): Promise<Statements> {
  const { data: full } = await db.from("asset_cache").select("payload").eq("key", `fin2:${symbol}`).maybeSingle();
  const fin = (full?.payload as { fin?: Fin | null } | null)?.fin;
  if (fin && (fin.annual.periods.length || fin.quarterly.periods.length)) return legacyStatements(fin);
  const key = `stmt:${symbol}`;
  const { data } = await db.from("asset_cache").select("payload,fetched_at").eq("key", key).maybeSingle();
  if (data && Date.now() - Date.parse(data.fetched_at) < 7 * 86400e3) return data.payload as Statements;
  let st: Statements;
  try { st = await yahooStatements(symbol, currency); }
  catch (err) { st = { source: null, currency, unit: "1", annual: [], quarterly: [], forecast: null, note: `statements unavailable: ${err instanceof Error ? err.message : err}`, asOf: null }; }
  await db.from("asset_cache").upsert({ key, payload: st as unknown as Record<string, unknown>, fetched_at: new Date().toISOString() });
  return st;
}

/** Relative performance over the last 12 months: asset / index, both rebased to 100 at the first common date. */
export async function relativeLine(symbol: string, indexSeries: Array<{ t: number; v: number }>): Promise<Array<{ t: number; v: number }>> {
  const own = (await yahooSeries(symbol, "12M")).points;
  const from = Math.floor((Date.now() - 366 * 86400e3) / 1000);
  const idx = new Map(indexSeries.filter((p) => p.t >= from).map((p) => [Math.floor(p.t / 86400), p.v]));
  const pts = own.filter((p) => p.t >= from && idx.has(Math.floor(p.t / 86400)));
  if (pts.length < 2) return [];
  const a0 = pts[0].v, b0 = idx.get(Math.floor(pts[0].t / 86400))!;
  return pts.map((p) => ({ t: p.t, v: ((p.v / a0) / (idx.get(Math.floor(p.t / 86400))! / b0)) * 100 }));
}

export async function quoteFor(symbol: string) {
  const q = (await quotes([symbol]))[symbol];
  if (!q) throw new Error(`no quote for ${symbol}`);
  return q;
}
