// The big moves marked on a stock's chart (Shota, 18 Nov 2026), found from its daily closes. No network and no
// database here; checked in sim/logic.test.ts.
//   d1   a day that closed 5% or more away from the previous close
//   w1   five sessions (a week) that moved the close 10% or more
//   m1   within a month (21 sessions): a fall of 20% or more from a high to a later low, or a rise of 20% or more
//        from a low to a later high
// Overlapping windows describe one move, not many: of the weeks (or months) that overlap and point the same way,
// only the largest is kept. Each move is dated by the day it ends on, which is where its mark sits on the chart.
// Shown for large companies only: 1tn yen and above, or 10bn US dollars and above.
import type { Bar } from "./stockstats.ts";

export const BIG_D1 = 5, BIG_W1 = 10, BIG_M1 = 20, WEEK = 5, MONTH = 21;
export interface BigMove { kind: "d1" | "w1" | "m1"; dir: 1 | -1; pct: number; from: string; to: string; fromPx: number; toPx: number; t: number }
const iso = (t: number): string => new Date(t * 1000).toISOString().slice(0, 10);
const mv = (kind: BigMove["kind"], a: Bar, b: Bar): BigMove => { const pct = (b.c / a.c - 1) * 100; return { kind, dir: pct >= 0 ? 1 : -1, pct, from: iso(a.t), to: iso(b.t), fromPx: a.c, toPx: b.c, t: b.t }; };
const EPS = 1e-9;   // 930/1000 is -6.999999999999995%: a move that is exactly on the line counts

/** Of candidate moves given as [start index, end index], the ones that survive when overlapping candidates in the
 *  same direction are reduced to their largest. Largest first, and a candidate is dropped if its span shares
 *  more than its end points with one already kept. */
function largestApart(c: Array<{ i: number; j: number; m: BigMove }>): BigMove[] {
  const kept: Array<{ i: number; j: number; m: BigMove }> = [];
  for (const x of [...c].sort((a, b) => Math.abs(b.m.pct) - Math.abs(a.m.pct) || a.j - b.j)) {
    if (!kept.some((k) => k.m.dir === x.m.dir && x.i < k.j && k.i < x.j)) kept.push(x);
  }
  return kept.map((k) => k.m);
}

/** Every big move in the bars (time order, one per trading day) that ends on or after `sinceT`, newest first. */
export function bigMoves(bars: Bar[], sinceT = 0): BigMove[] {
  const b = bars.filter((x) => x.c > 0);
  const d1: BigMove[] = [], w1: Array<{ i: number; j: number; m: BigMove }> = [], m1: Array<{ i: number; j: number; m: BigMove }> = [];
  for (let j = 1; j < b.length; j++) {
    const day = mv("d1", b[j - 1], b[j]);
    if (Math.abs(day.pct) >= BIG_D1 - EPS) d1.push(day);
    if (j >= WEEK) { const w = mv("w1", b[j - WEEK], b[j]); if (Math.abs(w.pct) >= BIG_W1 - EPS) w1.push({ i: j - WEEK, j, m: w }); }
    // the month ending today: from its highest close to today (a fall), from its lowest close to today (a rise)
    let hi = j - 1, lo = j - 1;
    for (let i = Math.max(0, j - MONTH); i < j; i++) { if (b[i].c > b[hi].c) hi = i; if (b[i].c < b[lo].c) lo = i; }
    const fall = mv("m1", b[hi], b[j]), rise = mv("m1", b[lo], b[j]);
    if (fall.pct <= -BIG_M1 + EPS) m1.push({ i: hi, j, m: fall });
    if (rise.pct >= BIG_M1 - EPS) m1.push({ i: lo, j, m: rise });
  }
  return [...d1, ...largestApart(w1), ...largestApart(m1)].filter((m) => m.t >= sinceT).sort((x, y) => y.t - x.t || x.kind.localeCompare(y.kind));
}

/** Large enough to have its big moves explained: 1tn yen and above for a yen stock, otherwise 10bn US dollars
 *  and above. `perUsd` is how many units of the stock's currency one dollar buys (1 for a dollar stock); a
 *  currency with no rate known is not judged large. */
export function isLargeCap(mcap: number | null, currency: string | null, perUsd: number | null): boolean {
  if (mcap == null || !(mcap > 0) || !currency) return false;
  if (currency === "JPY") return mcap >= 1e12;
  if (currency === "USD") return mcap >= 1e10;
  return perUsd != null && perUsd > 0 && mcap / perUsd >= 1e10;
}

/** A move in words, for the mark's read-out: "-8.2% on the day", "+12.4% in five sessions",
 *  "-24.0% from the high of 3 Aug to the low of 27 Aug". */
export function moveText(m: Pick<BigMove, "kind" | "pct" | "from" | "to">): string {
  const p = `${m.pct > 0 ? "+" : "−"}${Math.abs(m.pct).toFixed(1)}%`;
  const day = (d: string) => { const x = new Date(d + "T00:00:00Z"); return `${x.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][x.getUTCMonth()]}`; };
  if (m.kind === "d1") return `${p} on the day`;
  if (m.kind === "w1") return `${p} in five sessions (from ${day(m.from)})`;
  return m.pct < 0 ? `${p} from the high of ${day(m.from)} to the low of ${day(m.to)}` : `${p} from the low of ${day(m.from)} to the high of ${day(m.to)}`;
}
