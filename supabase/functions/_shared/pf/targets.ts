// The targets of an absolute-return book (P-1 sets them; the plan's §2.18): what the form prints under the two fields,
// and the rules that tie them to the VaR limit and the ladder. Pure arithmetic and fixed words.
//
// The target return is cash + x% a year, never a fixed percentage: cash is the base currency's overnight rate (EFFR on
// a dollar base, Act/360; TONA on a yen base, Act/365), compounded at each strike as the book's own cash is, with the
// x on top. The target volatility is in % of capital a year. Neither is a limit.
import type { Base, CashRate, Ladder, LadderBase, StartId } from "./types.ts";
import { dmy } from "./calendar.ts";
import { fieldOf } from "./presets.ts";

const DAYCOUNT: Record<Base, number> = { USD: 360, JPY: 365 };
/** The cash line's growth over 365 days at a flat overnight rate, in per cent: 261 weekday strikes, 209 of one day and
 *  52 of three (a weekend), each `1 + r × d ÷ D`. At EFFR 3.88%: 4.0119%; at TONA 1.227%: 1.2345%. */
export function cashGrowth(ratePct: number, base: Base): number {
  const r = ratePct / 100, D = DAYCOUNT[base];
  return (Math.pow(1 + r / D, 209) * Math.pow(1 + (3 * r) / D, 52) - 1) * 100;
}
/** cash + x% a year as one figure at a rate: `(1 + cash) × (1 + x) − 1`, in per cent. EFFR 3.88% and x 5: 9.2125%. */
export const absoluteEquivalent = (xPct: number, ratePct: number, base: Base): number => ((1 + cashGrowth(ratePct, base) / 100) * (1 + xPct / 100) - 1) * 100;

/** A rate as its source writes it: "3.88", "1.227" (at least two decimals). */
export function rateWords(rate: number): string { const s = String(rate), d = s.includes(".") ? s.split(".")[1].length : 0; return rate.toFixed(Math.max(2, Math.min(4, d))); }
const one = (v: number): string => v.toFixed(1);
const two = (v: number): string => v.toFixed(2);

/** The first line under the target return: its absolute equivalent at the latest stored rate, which it always names
 *  with its date and source; or that no rate is read yet. */
export function equivalentLine(xPct: number, rate: CashRate | null, base: Base): string {
  if (!rate) return `= cash + ${one(xPct)}% a year · the cash rate is not read yet`;
  return `= ${two(absoluteEquivalent(xPct, rate.rate, base))}% a year at ${rate.name} ${rateWords(rate.rate)}% for ${dmy(rate.d)} (${rate.source})${rate.standIn ? " STAND-IN" : ""}`;
}
/** The same in short, for a cell: "= 9.21% at EFFR 3.88%", and "for 18 Nov 2026" under it. */
export function equivalentShort(xPct: number, rate: CashRate | null, base: Base): { fig: string; when: string } | null {
  return rate ? { fig: `= ${two(absoluteEquivalent(xPct, rate.rate, base))}% at ${rate.name} ${rateWords(rate.rate)}%`, when: `for ${dmy(rate.d)}` } : null;
}

/** "implied Sharpe 1.0": the target return's margin over cash ÷ the target volatility. */
export const impliedSharpe = (xPct: number, volPct: number): number => (volPct > 0 ? xPct / volPct : 0);
export const sharpeLine = (xPct: number, volPct: number): string => `implied Sharpe ${one(impliedSharpe(xPct, volPct))}`;
export const SHARPE_TIP = "the target return's margin over cash ÷ the target volatility. The book is judged against the target's own figures, by period (PERFORMANCE).";

/** The normal 99% one-day VaR a target volatility implies, in % of capital: 2.326 × σ* ÷ √252. */
export const normalVar = (volPct: number): number => (2.326 * volPct) / Math.sqrt(252);
export type TieState = "clear" | "warned" | "refused";
/** The step a start's VaR limit is typed in (0.1 on the equity starts, 0.05 on the macro start). */
export const varStep = (start: StartId): number => fieldOf(start, "var")?.num?.step ?? 0.01;
/** The tie to the VaR limit (R-31): clear at most 80% of the limit, warned above it (CREATE still allowed), refused
 *  above the limit itself. The refused sentence is the plan's; the warned one the designer's (Q-P1). The limit it asks
 *  for is the smallest one the VaR field itself takes (on the field's step, EN-11): typed as advised, it passes. */
export function varTie(volPct: number, limitPct: number, step = 0.01): { state: TieState; v: number; line: string } {
  const v = normalVar(volPct), lim = two(limitPct);
  if (v > limitPct + 1e-12) {
    const k = Math.ceil(v / step - 1e-9), up = Math.round(k * step * 1e6) / 1e6, s = String(up), d = s.includes(".") ? s.split(".")[1].length : 0;
    const need = step < 0.05 ? up.toFixed(2) : d >= 1 ? s : up.toFixed(1);   // "1.1", "1.05", "0.74": never a figure that is still refused
    return { state: "refused", v, line: `Target volatility ${one(volPct)}% implies a 99% one-day VaR of ${two(v)}% of capital on a normal law, above your ${lim}% VaR limit: lower the target or raise the limit to at least ${need}%` };
  }
  if (v > 0.8 * limitPct + 1e-12) return { state: "warned", v, line: `Target volatility ${one(volPct)}% implies a 99% one-day VaR of ${two(v)}% of capital on a normal law: above 80% of your ${lim}% VaR limit, where the limit's own warning starts.` };
  return { state: "clear", v, line: `normal 99% one-day VaR ${two(v)}% of capital, under 80% of your ${lim}% VaR limit` };
}

/** The ladder's first step in target volatilities (C-31): words only, it refuses nothing. Under 0.8 the scale line,
 *  which gives the scale the ratio sits in (PM B's answer on R-52, 22 Nov 2026: the line gave the 0.5 σ* figure
 *  whatever the ratio typed). The figures are B's simulation (B/scripts/ladder_vol_sim.py): a book exactly on target, a
 *  Sharpe ratio of 1, normal returns, the default ladder: 10%, 27%, 48% and 81% of years. */
export const SCALE_LINE = "For scale (E, B's simulation): a book on target meets the first cut within a year in about 1 year in 10 at 1.0 σ*, 1 in 4 at 0.8 σ*, 1 in 2 at 0.67 σ*, 4 in 5 at 0.5 σ*.";
export const SCALE_TIP = "B's simulation: a Sharpe ratio of 1, normal returns, the default ladder: 10%, 27%, 48% and 81% of years at 1.0, 0.8, 0.67 and 0.5 σ*. A's: 83–86% of years at 0.5 σ*";
/** The ratio is written to one decimal where it is a whole tenth and to two where it is not, and the scale line is
 *  decided on the ratio itself (EN-12): 6% at 8% is 0.75 σ*, below 0.8, and has the line. */
export function ladderInVols(cut1: number, volPct: number): { ratio: number; line: string; scale: boolean } {
  const exact = volPct > 0 ? cut1 / volPct : 0, tenth = Math.abs(exact * 10 - Math.round(exact * 10)) < 1e-9;
  const ratio = tenth ? Math.round(exact * 10) / 10 : Math.round(exact * 100) / 100, t = tenth ? one(ratio) : two(ratio);
  return { ratio, line: `first cut at ${one(cut1)}% of the reference capital = ${t} target volatilities (${t} σ*)`, scale: exact < 0.8 - 1e-9 };
}

// ---- the ladder as the form prints it (the plan's §2.9) ----
/** The cumulative levels of the second cut and of Out, as typed: "(at 6.0%)", "(at 8.0%)". */
export const cumulative = (l: Pick<Ladder, "cut1" | "cut2" | "out">): { second: number; out: number } => ({ second: l.cut1 + l.cut2, out: l.cut1 + l.cut2 + l.out });
/** The restore levels follow the steps (R-43): each 2 points below the step that made the cut, never below 0. */
export function restoreLevels(l: Pick<Ladder, "cut1" | "cut2">): { toFirst: number; toFull: number } {
  return { toFirst: Math.max(0, l.cut1 + l.cut2 - 2), toFull: Math.max(0, l.cut1 - 2) };
}
export function restoreLine(l: Pick<Ladder, "cut1" | "cut2" | "cap1">): string {
  const r = restoreLevels(l);
  return `to ${l.cap1}% at a drawdown of ${one(r.toFirst)}% or less, to full at ${one(r.toFull)}% or less`;
}
/** Capital after the second cut must be below capital after the first (C-24): each range alone would let the deeper
 *  loss hand capital back. Null when the pair stands. */
export const capitalRefusal = (cap1: number, cap2: number): string | null => (cap2 < cap1 ? null : `Capital after the second cut (${cap2}%) must be below capital after the first (${cap1}%)`);

export const BASE_NAME: Record<LadderBase, string> = { guarded: "Yearly reset, not after a losing year", yearly: "Yearly reset", start: "Since the start" };
/** Each base in one line: what it does to capital and limits. */
export const BASE_LINE: Record<LadderBase, string> = {
  guarded: "Each January at full capital, after a year that did not lose: capital and every limit are re-sized to that NAV. After a losing year: unchanged.",
  yearly: "Each January at full capital, also after a losing year: capital and every limit are re-sized to that NAV.",
  start: "Never: capital and every limit stay sized to the starting NAV for life.",
};
/** The whole rule, behind "the whole rule". */
export const BASE_RULE = "At the first NAV of each calendar year, if the stage is Full capital (and, under the first base, that NAV is at or above the year's reference capital), the high and the reference capital reset to that NAV. If a cut is in force the reset is held until a later January at full capital. A restore in March resets nothing before the next January. Under every base the drawdown is (the high − NAV) ÷ the reference capital, and Out is final: the only restart is a new portfolio.";
export const drawdownLine = (b: LadderBase): string => `(the high − NAV) ÷ the reference capital: ${b === "start" ? "the starting NAV" : "this year's starting NAV under a yearly reset"}`;
const steps = (l: Pick<Ladder, "cut1" | "cut2" | "out">): string => [l.cut1, l.cut2, l.out].map((x) => String(x)).join("/");
/** "4/2/2 · yearly reset, not after a losing year". */
export const ladderShort = (l: Ladder, b: LadderBase): string => `${steps(l)} · ${BASE_NAME[b].charAt(0).toLowerCase()}${BASE_NAME[b].slice(1)}`;
/** "4/2/2 → capital 50% / 30% / Out". */
export const ladderCaps = (l: Ladder): string => `${steps(l)} → capital ${l.cap1}% / ${l.cap2}% / Out`;
