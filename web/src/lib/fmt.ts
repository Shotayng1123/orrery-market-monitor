// Number formatting shared by every table, tile and chart, on both layouts (the designer's §3.2; I-5, 20 Nov 2026):
// one precision per instrument, written once (the instruments table's `decimals`, sent with each row); a yield's
// level ends in "%"; a figure that rounds to zero at the precision shown carries no sign (D-36: "−0.0%" read as a
// fall). The dates and times are in lib/time.ts, the words in lib/labels.ts.
const cache = new Map<number, Intl.NumberFormat>();
function nf(decimals: number): Intl.NumberFormat {
  let f = cache.get(decimals);
  if (!f) { f = new Intl.NumberFormat("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); cache.set(decimals, f); }
  return f;
}
/** Whether a figure as written ("0", "0.0", "0.00") is a zero at the precision shown. */
const zero = (s: string): boolean => !/[1-9]/.test(s);
const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** Absolute level with the instrument's decimals; "–" when missing. A level that rounds to zero is "0.00", never
 *  "-0.00". */
export function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (!ok(v)) return "–";
  const s = nf(decimals).format(Math.abs(v));
  return v < 0 && !zero(s) ? `-${s}` : s;
}

/** Signed percentage, two decimals, "–" when missing; "0.0%" (no sign) when it rounds to zero. */
export function fmtPct(v: number | null | undefined, decimals = 2): string {
  if (!ok(v)) return "–";
  const s = nf(decimals).format(Math.abs(v));
  return zero(s) ? `${s}%` : v > 0 ? `+${s}%` : `-${s}%`;
}

/** Signed change in level (for rates, in bp when `bp` is true); "0.0bp" (no sign) when it rounds to zero. */
export function fmtChg(v: number | null | undefined, decimals = 2, bp = false): string {
  if (!ok(v)) return "–";
  const x = bp ? v * 100 : v;
  const s = nf(bp ? 1 : decimals).format(Math.abs(x));
  return (zero(s) ? "" : x > 0 ? "+" : "-") + s + (bp ? "bp" : "");
}

/** Any signed figure with its unit after it: "+2.7σ", "-0.6" (pp), "+1.3"; no sign when it rounds to zero.
 *  `minus` is the sign written for a negative figure (the statements write a true minus, "−"). */
export function fmtSigned(v: number | null | undefined, decimals: number, unit = "", minus = "-"): string {
  if (!ok(v)) return "–";
  const s = nf(decimals).format(Math.abs(v));
  return (zero(s) ? "" : v > 0 ? "+" : minus) + s + unit;
}
/** A distance in standard deviations: "+2.7σ" (one decimal, the designer's §3.2). */
export const fmtSigma = (v: number | null | undefined, decimals = 1): string => fmtSigned(v, decimals, "σ");

/** A level as every view writes it: the instrument's own decimals, and "%" after a yield ("4.859%", "158.400",
 *  "57,000.00", "1.1143"). One function for the table, the phone's lines, the chart's head and read-out, the
 *  watchlist and the notes' tables (the designer's D-05). */
export function fmtLevel(v: number | null | undefined, decimals: number, pct = false): string {
  return ok(v) ? `${fmtNum(v, decimals)}${pct ? "%" : ""}` : "–";
}

/** A stock's price has no row in the instruments table: two decimals under 1,000, none from 1,000 ("182.44",
 *  "3,121"). The same rule on its page, its card, the watchlist, the movers, the screener and the notes. */
export const stockDecimals = (price: number | null | undefined): number => (price != null && Math.abs(price) >= 1000 ? 0 : 2);

/** The decimals of an instrument level shown without its instruments row (a note written before the rows carried
 *  them, a server older than 20 Nov 2026): a yield 3, a currency pair 3 from 10 and 4 under it, anything else at
 *  2 under 1,000 and none from 1,000. The instruments table holds the same for every pair and yield it carries. */
export function fallbackDecimals(v: number | null | undefined, kind: "yield" | "fx" | "other"): number {
  if (kind === "yield") return 3;
  if (kind === "fx") return v != null && Math.abs(v) < 10 ? 4 : 3;
  return stockDecimals(v);
}

/** The fewest decimals that write every tick of an axis whose ticks are `incr` apart, never more than `max` (the
 *  instrument's own): ticks 0.5 apart need one ("159.5"), ticks 0.25 apart two. The designer's D-05 note: the axis
 *  of a 158.400 line reads 159.5 / 159.0. */
export function axisDecimals(incr: number, max: number): number {
  if (!(incr > 0) || !Number.isFinite(incr)) return max;
  for (let d = 0; d < max; d++) { const x = incr * 10 ** d; if (Math.abs(x - Math.round(x)) < 1e-6 * Math.max(1, x)) return d; }
  return max;
}

/** CSS class for a signed value: none for a value that rounds to zero at `decimals` (a grey "0.0%", not a red one). */
export const signCls = (v: number | null | undefined, decimals?: number): string => {
  if (!ok(v) || v === 0) return "";
  if (decimals != null && zero(nf(decimals).format(Math.abs(v)))) return "";
  return v > 0 ? "up" : "dn";
};

/** A row quoted as a yield (level in %, changes in bp). A bond future sits in the rates group but is a price. */
export const isYield = (r: { group: string; symbol: string }): boolean => r.group === "rates" && !r.symbol.endsWith("=F");
