// A stock's own page: the shape the server sends (action `stock`; built in supabase/functions/_shared/stock.ts
// from fin.ts and stockstats.ts) and how its figures are written. Everything here is display: no figure is
// worked out on the page except the two sums named in finSections (net cash, free cash flow).
import { fmtNum } from "./fmt";

export interface PerfRow { h: string; from: string | null; base: number | null; stock: number | null; bench: Array<number | null>; rel: Array<number | null> }
export interface Benchmark { symbol: string; name: string; note: string | null }
export type FinLine = "revenue" | "cogs" | "gross" | "sga" | "op" | "nonOpInc" | "nonOpExp" | "ordinary" | "extraInc" | "extraLoss" | "pretax" | "ni" | "eps" | "dps"
  | "cash" | "stDebt" | "ltDebt" | "assets" | "liabilities" | "equity" | "ocf" | "icf" | "fincf" | "capex" | "shares" | "dilutedShares" | "bps" | "payoutReported";
export type RatioId = "salesYoy" | "gpm" | "opm" | "npm" | "payout" | "roe" | "equityRatio";
export interface FinPeriod { key: string; end: string; label: string; kind: "FY" | "Q" | "FC"; months: number; std: string | null; doc: string | null; url: string | null; note: string | null }
export interface FinSet { periods: FinPeriod[]; lines: Partial<Record<FinLine, Array<number | null>>> }
export interface FinUnit { div: number; label: string; dp: number }
export interface Fin {
  source: "edinetdb" | "yahoo"; currency: string | null; unit: FinUnit;
  annual: FinSet; quarterly: FinSet;
  ratios: { annual: Partial<Record<RatioId, Array<number | null>>>; quarterly: Partial<Record<RatioId, Array<number | null>>> };
  guidance: { end: string; disclosed: string | null; quarter: number | null; progress: Partial<Record<"revenue" | "op" | "ordinary" | "ni", number | null>>; ytdMonths: number | null } | null;
  asOf: string | null; notes: string[];
}
export type ShortData =
  | { kind: "finra"; d: string; ratio: number }
  | { kind: "jpx"; d: string; ratio: number; shares: number | null; daysToCover: number | null; holders: Array<{ holder: string; ratio: number; d: string }> }
  | { kind: "interest"; d: string | null; shares: number | null; pctFloat: number | null; pctOut: number | null; daysToCover: number | null; prior: number | null; priorDate: string | null; finra: { d: string; ratio: number } | null };
/** A big move of the stock (supabase/functions/_shared/bigmoves.ts): a day of 5% or more, five sessions of 10% or
 *  more, or a fall or rise of 20% or more within a month; `text` says it in words. `status` is where the search
 *  for its reason stands: found (with `cause` and `sources`), not_found (searched, nothing reliable), queued
 *  (being looked up), failed (the look-up itself failed three times), old (older than the twelve months reasons
 *  are looked up for), off (this server does not look reasons up). */
export interface MoveRow { kind: "d1" | "w1" | "m1"; dir: 1 | -1; pct: number; from: string; to: string; fromPx: number; toPx: number; t: number; text: string; status: "found" | "not_found" | "queued" | "failed" | "old" | "off"; cause: string | null; sources: Array<{ title: string; url: string }> }
export const whyText = (m: MoveRow): string => (m.status === "found" && m.cause ? m.cause : m.status === "not_found" ? "No reliable report of the reason was found." : m.status === "queued" ? "The reason is being looked up; it appears here when found." : m.status === "failed" ? "The look-up for this move failed; no reason is shown." : m.status === "old" ? "Not looked up: reasons are searched for moves of the last twelve months." : "Reasons are not looked up on this server yet.");
/** The moves as marks for the chart: one per day (the moves that end the same day share a circle, coloured by the largest). */
export function chartMarks(rows: MoveRow[]): Array<{ t: number; dir: 1 | -1; title: string; items: Array<{ text: string; why: string }> }> {
  const by = new Map<string, MoveRow[]>();
  for (const r of rows) by.set(r.to, [...(by.get(r.to) ?? []), r]);
  return [...by.entries()].map(([to, rs]) => ({ t: rs[0].t, dir: [...rs].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0].dir, title: to, items: rs.map((r) => ({ text: r.text, why: whyText(r) })) }));
}
/** The site a source is on, for a short link label: "reuters.com". */
export const siteOf = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

export interface StockPage {
  symbol: string; name: string; exchange: string | null; currency: string | null; quoteType: string | null;
  sector: string | null; industry: string | null; indices: string[];
  price: number | null; prevClose: number | null; pct: number | null; asOf: string | null;
  open: number | null; high: number | null; low: number | null; volume: number | null; mcap: number | null;
  benchmarks: Benchmark[];   // what the stock is set against, in order; `perf[].bench`, `perf[].rel` and `beta` follow this order
  perf: PerfRow[];
  range: { hi: number | null; hiDate: string | null; lo: number | null; loDate: string | null; fromHi: number | null; fromLo: number | null; pos: number | null };
  vol: { m1: number | null; m3: number | null; m12: number | null };
  beta: Array<{ beta: number | null; corr: number | null; days: number }>;
  drawdown: { pct: number | null; from: string | null; to: string | null };
  turnover: { d20: { shares: number | null; value: number | null }; d60: { shares: number | null; value: number | null } };
  shares: { outstanding: number | null; diluted: number | null; dilutedNote: string | null; treasury: number | null; float: number | null; asOf: string | null; source: string | null };
  short: ShortData | null;
  moves: { eligible: boolean; rows: MoveRow[] };   // eligible: 1tn yen / 10bn US dollars and above
  earningsAt: string | null; earningsEst: boolean | null;
  val: { pe: number | null; peGuide: number | null; pb: number | null; yield: number | null; yieldGuide: number | null; basis: string | null };
  fin: Fin | null; finNote: string | null;
}

const MINUS = "−";
const neg = (s: string): string => s.replace(/^-/, MINUS);
/** A statement figure in the company's unit: 45,095.3 (bn), 3,210 (m). Null is a dash, never a zero. */
export const fmtUnit = (v: number | null | undefined, u: FinUnit): string => (v == null || !Number.isFinite(v) ? "–" : neg(fmtNum(v / u.div, u.dp)));
/** A per-share figure: two decimals below 1,000, one above. */
export const fmtPs = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? "–" : neg(fmtNum(v, Math.abs(v) >= 1000 ? 1 : 2)));
/** A ratio in per cent with one decimal; `sign` puts a plus on a rise. */
export const fmtPc = (v: number | null | undefined, sign = false, dp = 1): string => (v == null || !Number.isFinite(v) ? "–" : `${sign && v > 0 ? "+" : ""}${neg(v.toFixed(dp))}%`);
/** A ratio as a bare number for a table whose header already says per cent: 27.9, +7.9, −0.2. */
export const fmtRatio = (v: number | null | undefined, sign = false): string => (v == null || !Number.isFinite(v) ? "–" : `${sign && v > 0 ? "+" : ""}${neg(v.toFixed(1))}`);
/** A multiple: 15.2x. */
export const fmtX = (v: number | null | undefined, dp = 1): string => (v == null || !Number.isFinite(v) ? "–" : `${v.toFixed(dp)}x`);
/** A count of shares: 1.23bn, 456.7m, 89.1k. */
export const fmtCount = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? "–" : Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(2)}bn` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}m` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : fmtNum(v, 0));

export interface FinRow { id: string; label: string; values: Array<number | null>; fmt: "money" | "ps" | "pct" | "growth"; strong?: boolean; title?: string }
export interface FinSection { id: string; title: string; rows: FinRow[] }
const LABEL: Record<string, string> = {
  revenue: "Revenue", cogs: "Cost of sales", gross: "Gross profit", sga: "SG&A", op: "Operating profit", nonOpInc: "Non-operating income", nonOpExp: "Non-operating expenses",
  ordinary: "Ordinary profit", extraInc: "Extraordinary income", extraLoss: "Extraordinary losses", pretax: "Profit before tax", ni: "Net income", eps: "EPS", dps: "DPS",
  cash: "Cash and deposits", stDebt: "Short-term debt", ltDebt: "Long-term debt", netCash: "Net cash", assets: "Total assets", liabilities: "Total liabilities", equity: "Equity",
  ocf: "Operating cash flow", icf: "Investing cash flow", fincf: "Financing cash flow", capex: "Capex", fcf: "Free cash flow",
  salesYoy: "Sales growth, y/y", gpm: "Gross margin", opm: "Operating margin", npm: "Net margin", payout: "Payout ratio", roe: "ROE", equityRatio: "Equity ratio",
};
const TITLE: Record<string, string> = {
  stDebt: "Borrowings and bonds due within a year; lease obligations are not included",
  ltDebt: "Borrowings and bonds due after a year; lease obligations are not included",
  netCash: "Cash and deposits less short-term and long-term debt (worked out on this page); negative = net debt",
  capex: "Cash paid for property, plant and equipment and intangible assets",
  fcf: "Operating cash flow less capex (worked out on this page)",
  salesYoy: "Revenue against the period that ended twelve months earlier", payout: "Dividend per share over earnings per share", roe: "Net income over equity at the year's end",
  ni: "Attributable to owners of the parent", equity: "Net assets (JP GAAP) or total equity",
};
const STRONG = new Set(["revenue", "gross", "op", "ordinary", "ni", "assets", "equity", "ocf"]);

/** The tables of the FINANCIALS panel for one view, section by section, each row a list of values column for
 *  column. Two rows are sums made here from reported lines, and are empty wherever a part is missing:
 *  net cash = cash - short-term debt - long-term debt; free cash flow = operating cash flow - capex. */
export function finSections(f: Fin, view: "annual" | "quarterly"): { periods: FinPeriod[]; sections: FinSection[] } {
  const set = f[view], n = set.periods.length, rat = f.ratios[view];
  const L = (id: FinLine): Array<number | null> => set.lines[id] ?? Array.from({ length: n }, () => null);
  const row = (id: string, values: Array<number | null>, fmt: FinRow["fmt"] = "money"): FinRow => ({ id, label: LABEL[id] ?? id, values, fmt, strong: STRONG.has(id), title: TITLE[id] });
  const line = (id: FinLine): FinRow => row(id, L(id), id === "eps" || id === "dps" ? "ps" : "money");
  const all = (...xs: Array<number | null>): boolean => xs.every((x) => x != null);
  const cash = L("cash"), st = L("stDebt"), lt = L("ltDebt"), ocf = L("ocf"), capex = L("capex");
  const netCash = cash.map((c, i) => (all(c, st[i], lt[i]) ? (c as number) - (st[i] as number) - (lt[i] as number) : null));
  const fcf = ocf.map((o, i) => (all(o, capex[i]) ? (o as number) - (capex[i] as number) : null));
  const R = (id: RatioId): Array<number | null> => rat[id] ?? Array.from({ length: n }, () => null);
  return { periods: set.periods, sections: [
    { id: "is", title: "Income statement", rows: (["revenue", "cogs", "gross", "sga", "op", "nonOpInc", "nonOpExp", "ordinary", "extraInc", "extraLoss", "pretax", "ni", "eps", "dps"] as FinLine[]).map(line) },
    { id: "ratios", title: "Ratios, %", rows: [row("salesYoy", R("salesYoy"), "growth"), row("gpm", R("gpm"), "pct"), row("opm", R("opm"), "pct"), row("npm", R("npm"), "pct"), row("payout", R("payout"), "pct"), ...(view === "annual" ? [row("roe", R("roe"), "pct")] : []), row("equityRatio", R("equityRatio"), "pct")] },
    { id: "bs", title: "Balance sheet", rows: [line("cash"), line("stDebt"), line("ltDebt"), row("netCash", netCash), line("assets"), line("liabilities"), line("equity")] },
    { id: "cf", title: "Cash flow", rows: [line("ocf"), line("icf"), line("fincf"), line("capex"), row("fcf", fcf)] },
  ] };
}
