// A company's statements in one shape, whatever the source (Shota, 18 Nov 2026): the lines of the income
// statement, the balance sheet and the cash flow statement, period by period, with the ratios worked out from
// them. No network and no database here; the sources are read in finsrc.ts. Checked in sim/logic.test.ts.
//
// Rules that hold everywhere:
//   - a value is what the company reported, in the currency's own unit (yen, dollars), or null. Null means
//     "not reported / not applicable", never zero, and nothing is filled in or estimated;
//   - a ratio is null when any figure it needs is null (or the divisor is not positive);
//   - one unit (m, bn, tn) is chosen per company and used for every statement; per-share lines are never scaled.

/** The lines, in the order they are shown. */
export const IS_LINES = ["revenue", "cogs", "gross", "sga", "op", "nonOpInc", "nonOpExp", "ordinary", "extraInc", "extraLoss", "pretax", "ni", "eps", "dps"] as const;
export const BS_LINES = ["cash", "stDebt", "ltDebt", "assets", "liabilities", "equity"] as const;
export const CF_LINES = ["ocf", "icf", "fincf", "capex"] as const;   // capex is the cash paid out, as a positive number
/** Beyond the three statements: shares issued at the period's end, the diluted share count behind diluted EPS,
 *  book value per share, and the payout ratio where the company states one itself. */
export type FinLine = (typeof IS_LINES)[number] | (typeof BS_LINES)[number] | (typeof CF_LINES)[number] | "shares" | "dilutedShares" | "bps" | "payoutReported";
export const PER_SHARE: ReadonlySet<FinLine> = new Set<FinLine>(["eps", "dps", "bps"]);

/** One column: a fiscal year ("FY"), a single quarter ("Q", three months, not year-to-date) or the company's
 *  guidance for the year in progress ("FC"). `end` is the last day of the period. */
export interface FinPeriod { key: string; end: string; label: string; kind: "FY" | "Q" | "FC"; months: number; std: string | null; doc: string | null; url: string | null; note: string | null }
export interface FinSet { periods: FinPeriod[]; lines: Partial<Record<FinLine, Array<number | null>>> }
export type RatioId = "salesYoy" | "gpm" | "opm" | "npm" | "payout" | "roe" | "equityRatio";
export interface FinUnit { div: number; label: string; dp: number }
export interface Fin {
  source: "edinetdb" | "yahoo";
  currency: string | null;
  unit: FinUnit;
  annual: FinSet;        // oldest first; a guidance column, when there is one, comes last
  quarterly: FinSet;     // single quarters, oldest first
  ratios: { annual: Partial<Record<RatioId, Array<number | null>>>; quarterly: Partial<Record<RatioId, Array<number | null>>> };
  guidance: { end: string; disclosed: string | null; quarter: number | null; progress: Partial<Record<"revenue" | "op" | "ordinary" | "ni", number | null>>; ytdMonths: number | null } | null;
  asOf: string | null;
  notes: string[];
}

const two = (n: number): string => String(n % 100).padStart(2, "0");
/** "2026-03-31" -> "FY3/26": the fiscal year by the month and year it ends in. */
export function fyLabel(end: string): string { const m = /^(\d{4})-(\d{2})/.exec(end); return m ? `FY${Number(m[2])}/${two(Number(m[1]))}` : end; }
/** Quarter `q` of the fiscal year ending `fyEnd`: "1Q 3/27". */
export function qLabel(fyEnd: string, q: number): string { const m = /^(\d{4})-(\d{2})/.exec(fyEnd); return m ? `${q}Q ${Number(m[2])}/${two(Number(m[1]))}` : `${q}Q`; }
/** A quarter known only by its last day: "Sep 26". */
export function qEndLabel(end: string): string { const m = /^(\d{4})-(\d{2})/.exec(end); return m ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1]} ${two(Number(m[1]))}` : end; }
/** The last day of quarter `q` (1 to 4) of the fiscal year ending `fyEnd`, as YYYY-MM-DD. */
export function quarterEnd(fyEnd: string, q: number): string {
  const m = /^(\d{4})-(\d{2})/.exec(fyEnd);
  if (!m) return fyEnd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 3 * (4 - q), 0));   // day 0 of the next month = this month's last day
  return d.toISOString().slice(0, 10);
}

/** The one unit for a company's statements, from the size of its yearly revenue (its total assets when it
 *  reports no revenue line): bn from 100bn of revenue, tn from 100tn, otherwise m; below 100m, thousands. */
export function pickUnit(annual: FinSet): FinUnit {
  const biggest = (id: FinLine): number => Math.max(0, ...(annual.lines[id] ?? []).map((v) => (v == null ? 0 : Math.abs(v))));
  const size = biggest("revenue") || biggest("assets") || biggest("ni");
  if (size >= 1e14) return { div: 1e12, label: "tn", dp: 2 };
  if (size >= 1e11) return { div: 1e9, label: "bn", dp: 1 };
  if (size >= 1e8) return { div: 1e6, label: "m", dp: 0 };
  return { div: 1e3, label: "k", dp: 0 };
}

const daysBetween = (a: string, b: string): number => (Date.parse(b) - Date.parse(a)) / 86400e3;
const div = (a: number | null | undefined, b: number | null | undefined): number | null => (a == null || b == null || !(b > 0) ? null : (a / b) * 100);

/** The ratios for a set of periods, each a column-for-column list in per cent.
 *    salesYoy     revenue against the period that ended twelve months earlier (the year before, or the same
 *                 quarter a year before); null where that period is not in the set
 *    gpm, opm, npm  gross profit, operating profit and net income over revenue
 *    payout       dividend per share over earnings per share (null when earnings are not positive)
 *    roe          net income over equity at the period's end (yearly columns only)
 *    equityRatio  equity over total assets */
export function ratiosOf(set: FinSet): Partial<Record<RatioId, Array<number | null>>> {
  const L = (id: FinLine): Array<number | null> => set.lines[id] ?? set.periods.map(() => null);
  const rev = L("revenue"), gross = L("gross"), op = L("op"), ni = L("ni"), eps = L("eps"), dps = L("dps"), eq = L("equity"), assets = L("assets"), paid = L("payoutReported");
  const yearBefore = (i: number): number => {
    const p = set.periods[i];
    return set.periods.findIndex((o, j) => j !== i && o.kind !== "FC" && o.months === p.months && Math.abs(daysBetween(o.end, p.end) - 365.25) <= 20);
  };
  const salesYoy = set.periods.map((_, i) => { const j = yearBefore(i); return j < 0 || rev[i] == null || rev[j] == null || !((rev[j] as number) > 0) ? null : ((rev[i] as number) / (rev[j] as number) - 1) * 100; });
  return {
    salesYoy,
    gpm: set.periods.map((_, i) => div(gross[i], rev[i])),
    opm: set.periods.map((_, i) => div(op[i], rev[i])),
    npm: set.periods.map((_, i) => div(ni[i], rev[i])),
    payout: set.periods.map((_, i) => paid[i] ?? div(dps[i], eps[i])),
    roe: set.periods.map((p, i) => (p.months === 12 && p.kind === "FY" ? div(ni[i], eq[i]) : null)),
    equityRatio: set.periods.map((_, i) => div(eq[i], assets[i])),
  };
}

/** Year-to-date figures turned into single quarters: the first quarter as it is, each later one the difference
 *  from the quarter before it in the same fiscal year. A quarter whose predecessor is missing stays null: a
 *  half-year figure is never passed off as a quarter. Input and output: one entry per (fiscal year, quarter). */
export function singleQuarters<T extends { fy: string; q: number; v: number | null }>(ytd: T[]): Array<T & { v: number | null }> {
  const at = new Map(ytd.map((r) => [`${r.fy}|${r.q}`, r.v]));
  return ytd.map((r) => {
    if (r.q === 1) return { ...r };
    const before = at.get(`${r.fy}|${r.q - 1}`);
    return { ...r, v: r.v == null || before == null ? null : r.v - before };
  });
}

/** How far the year-to-date figure has come against the full-year guidance, in per cent (the 進捗率 of a
 *  決算短信). Only for the first three quarters: at the full year the guidance on the page is next year's. */
export function progress(ytd: number | null | undefined, fullYear: number | null | undefined, quarter: number | null): number | null {
  if (quarter == null || quarter < 1 || quarter > 3) return null;
  return div(ytd, fullYear);
}

/** Valuation from the price and the statements. Each is null unless every input is there and positive where it
 *  must be. `eps`/`bps`/`dps` are per share, on the same share basis as the price. */
export function valuation(price: number | null, v: { eps: number | null; epsGuide: number | null; bps: number | null; dps: number | null; dpsGuide: number | null }): { pe: number | null; peGuide: number | null; pb: number | null; yield: number | null; yieldGuide: number | null } {
  const x = (a: number | null, b: number | null): number | null => (a == null || b == null || !(b > 0) ? null : a / b);
  return { pe: x(price, v.eps), peGuide: x(price, v.epsGuide), pb: x(price, v.bps), yield: v.dps == null || price == null || !(price > 0) ? null : (v.dps / price) * 100, yieldGuide: v.dpsGuide == null || price == null || !(price > 0) ? null : (v.dpsGuide / price) * 100 };
}
