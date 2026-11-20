// The chart's PERIOD choices and the days each one shows (Shota). A stock's own page also offers five and ten
// years of daily closes (A-16, 20 Nov 2026): the server keeps ten years of a stock's daily bars already. Pure, so
// the rule for a tapped big move is checked in sim/logic.test.ts.
export type ChartPeriod = "1D" | "1W" | "1M" | "3M" | "12M" | "36M" | "5Y" | "10Y";
/** Every tab with charts. */
export const CHART_PERIODS: ChartPeriod[] = ["1D", "1W", "1M", "3M", "12M", "36M"];
/** A stock's own page (`#asset/…`). */
export const ASSET_PERIODS: ChartPeriod[] = [...CHART_PERIODS, "5Y", "10Y"];
/** Calendar days each period shows, counted back from the latest bar. */
export const PERIOD_DAYS: Record<ChartPeriod, number> = { "1D": 1, "1W": 7, "1M": 31, "3M": 93, "12M": 366, "36M": 1096, "5Y": 1827, "10Y": 3653 };
/** The periods longer than the three years the big-move circles cover. */
export const LONG_PERIODS: ReadonlySet<ChartPeriod> = new Set<ChartPeriod>(["5Y", "10Y"]);
/** The shortest daily view that holds day `t` (Unix seconds), counted back from `now` (Unix seconds): 3M, 12M or
 *  36M, then 5Y and 10Y (A-25: a big move tapped in the list opens on a chart that shows it). The chart counts its
 *  window back from its latest bar, which is never after now, so a day this holds is always inside the window. */
export function periodHolding(t: number, now: number): ChartPeriod {
  for (const p of ["3M", "12M", "36M", "5Y"] as ChartPeriod[]) if (now - t <= PERIOD_DAYS[p] * 86400) return p;
  return "10Y";
}
