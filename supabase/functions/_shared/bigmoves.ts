// The big moves marked on a stock's chart (Shota, 18 Nov 2026), found from its daily closes. No network and no
// database here; checked in sim/logic.test.ts.
//   d1   a day that closed 5% or more away from the previous close
//   w1   five sessions (a week) that moved the close 10% or more
//   m1   within a month (21 sessions): a fall of 20% or more from a high to a later low, or a rise of 20% or more
//        from a low to a later high
// Overlapping windows describe one move, not many: of the weeks (or months) that overlap and point the same way,
// only the largest is kept. Each move is dated by the day it ends on, which is where its mark sits on the chart.
// Shown for large companies only: 1tn yen and above, or 10bn US dollars and above.
//
// A second rule is on trial (Shota, 19 Nov 2026), for the stocks named in SWING_TRIAL: fewer marks, each one a
// place a reader would ask about on a twelve-month chart.
//   d1   a day that closed 10% or more away from the previous close
//   pk   a new peak: the highest close of a rise, marked once the close has since fallen 15% from it, and only if
//        it was the highest close of the twelve months before it
//   bt   a bottom: the lowest close of a fall, marked once the close has since risen 15% from it
// Peaks and bottoms are the turning points of the closes when only moves of 15% count (the same reading whichever
// day it is made on: a turning point, once marked, does not move). A high that was not a twelve-month high is
// still a turning point (the next bottom is measured from it) but is not marked.
import { barOnOrBefore, type Bar } from "./stockstats.ts";
import type { MoveCtx } from "./movecause.ts";

export const BIG_D1 = 5, BIG_W1 = 10, BIG_M1 = 20, WEEK = 5, MONTH = 21;
export const SWING_D1 = 10, SWING_PCT = 15, SWING_HIGH_DAYS = 252;
/** The stocks whose page uses the rule on trial. While this is not empty, reasons are looked up for these stocks
 *  only (stock.ts, jobs/move_causes.ts): the look-ups for every other stock wait for the rule to be settled. */
export const SWING_TRIAL: ReadonlySet<string> = new Set(["NVDA"]);
export type MoveRule = "classic" | "swings";
export const ruleFor = (symbol: string): MoveRule => (SWING_TRIAL.has(symbol) ? "swings" : "classic");
export interface BigMove { kind: "d1" | "w1" | "m1" | "pk" | "bt"; dir: 1 | -1; pct: number; from: string; to: string; fromPx: number; toPx: number; t: number }
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

/** The peaks and bottoms of the bars (time order), oldest first: the turning points of the closes when only moves
 *  of `pct` per cent count. A peak is given from the bottom before it, a bottom from the peak before it (the
 *  first one from the lowest or highest close before it); a peak is given only when it was the highest close of
 *  the `highDays` sessions before it. The stretch still running at the end has no turning point yet. */
export function turningPoints(bars: Bar[], pct = SWING_PCT, highDays = SWING_HIGH_DAYS): BigMove[] {
  const b = bars.filter((x) => x.c > 0), out: BigMove[] = [];
  const up = 1 + pct / 100, down = 1 - pct / 100;
  // dir: +1 after a bottom (looking for the peak), -1 after a peak (looking for the bottom), 0 before the first
  let dir = 0, hi = 0, lo = 0, last = -1;
  const extreme = (to: number, sign: 1 | -1): number => { let k = 0; for (let i = 1; i < to; i++) if (sign * (b[i].c - b[k].c) > 0) k = i; return k; };
  for (let j = 1; j < b.length; j++) {
    if (dir >= 0 && b[j].c > b[hi].c) hi = j;
    if (dir <= 0 && b[j].c < b[lo].c) lo = j;
    if (dir >= 0 && b[j].c <= b[hi].c * down * (1 + EPS)) {
      const from = last >= 0 ? last : extreme(hi, -1);
      let top = true;
      for (let i = Math.max(0, hi - highDays); i < hi; i++) if (b[i].c > b[hi].c) { top = false; break; }
      if (top && from !== hi) out.push(mv("pk", b[from], b[hi]));
      last = hi; dir = -1; lo = j;
    } else if (dir <= 0 && b[j].c >= b[lo].c * up * (1 - EPS)) {
      const from = last >= 0 ? last : extreme(lo, 1);
      if (from !== lo) out.push(mv("bt", b[from], b[lo]));
      last = lo; dir = 1; hi = j;
    }
  }
  return out;
}

/** Every big move in the bars (time order, one per trading day) that ends on or after `sinceT`, newest first,
 *  by the usual rule or by the one on trial. */
export function bigMoves(bars: Bar[], sinceT = 0, rule: MoveRule = "classic"): BigMove[] {
  const b = bars.filter((x) => x.c > 0);
  if (rule === "swings") {
    const days: BigMove[] = [];
    for (let j = 1; j < b.length; j++) { const day = mv("d1", b[j - 1], b[j]); if (Math.abs(day.pct) >= SWING_D1 - EPS) days.push(day); }
    return [...days, ...turningPoints(b)].filter((m) => m.t >= sinceT).sort((x, y) => y.t - x.t || x.kind.localeCompare(y.kind));
  }
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

/** The bars a move may be read from: every finished session. While the stock's market is open, today's bar is a
 *  day still in progress (its "close" is only the latest price), so it is left out: a fall of 5% at lunchtime is
 *  not yet a day that closed 5% down. `today` is the date at the exchange (YYYY-MM-DD). */
export function settledBars(bars: Bar[], marketOpen: boolean, today: string): Bar[] {
  const last = bars.length ? bars[bars.length - 1] : null;
  return marketOpen && last && iso(last.t) === today ? bars.slice(0, -1) : bars;
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
  if (m.kind === "pk") return `New high: ${p} from the low of ${day(m.from)}`;
  if (m.kind === "bt") return `Bottom: ${p} from the high of ${day(m.from)}`;
  if (m.kind === "w1") return `${p} in five sessions (from ${day(m.from)})`;
  return m.pct < 0 ? `${p} from the high of ${day(m.from)} to the low of ${day(m.to)}` : `${p} from the low of ${day(m.from)} to the high of ${day(m.to)}`;
}

/** What the look-up of a move's reason is given (movecause.ts): the stock, the move, and the benchmark's change
 *  over the same dates. One place for it, used by the page (stock.ts) and by the job when it queues a stock's
 *  moves itself (jobs/move_causes.ts --seed). */
export function moveCtx(m: BigMove, who: { symbol: string; name: string; exchange: string | null; sector: string | null; currency: string | null }, bench: { name: string; bars: Bar[] } | null): MoveCtx {
  const a = bench ? barOnOrBefore(bench.bars, Date.parse(m.from + "T00:00:00Z") / 1000) : null, z = bench ? barOnOrBefore(bench.bars, m.t) : null;
  return { ...who, kind: m.kind, from: m.from, to: m.to, pct: m.pct, fromPx: m.fromPx, toPx: m.toPx, text: moveText(m), bench: bench?.name ?? null, benchPct: a && z && a.c > 0 ? (z.c / a.c - 1) * 100 : null };
}
