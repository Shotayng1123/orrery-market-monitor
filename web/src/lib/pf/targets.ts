// COPY of supabase/functions/_shared/pf/targets.ts: edit that file, then run `node tools/sync-pf.cjs` from web/.
// The targets of an absolute-return book (P-1 sets them; the plan's §2.18): what the form prints under the two fields,
// and the rules that tie them to the VaR limit and the ladder. Pure arithmetic and fixed words.
//
// The target return is cash + x% a year, never a fixed percentage: cash is the base currency's overnight rate (EFFR on
// a dollar base, Act/360; TONA on a yen base, Act/365), compounded at each strike as the book's own cash is, with the
// x on top. The target volatility is in % of capital a year. Neither is a limit.
import type { Base, CashRate, Ladder, LadderBase } from "./types.ts";
import { dmy } from "./calendar.ts";

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
/** The tie to the VaR limit (R-31): clear at most 80% of the limit, warned above it (CREATE still allowed), refused
 *  above the limit itself. The refused sentence is the plan's; the warned one the designer's (Q-P1). */
export function varTie(volPct: number, limitPct: number): { state: TieState; v: number; line: string } {
  const v = normalVar(volPct), lim = two(limitPct);
  if (v > limitPct + 1e-12) {
    const need = (Math.ceil(v * 100 - 1e-9) / 100).toFixed(2);   // a limit that would pass: never a figure that is still refused
    return { state: "refused", v, line: `Target volatility ${one(volPct)}% implies a 99% one-day VaR of ${two(v)}% of capital on a normal law, above your ${lim}% VaR limit: lower the target or raise the limit to at least ${need}%` };
  }
  if (v > 0.8 * limitPct + 1e-12) return { state: "warned", v, line: `Target volatility ${one(volPct)}% implies a 99% one-day VaR of ${two(v)}% of capital on a normal law: above 80% of your ${lim}% VaR limit, where the limit's own warning starts.` };
  return { state: "clear", v, line: `normal 99% one-day VaR ${two(v)}% of capital, under 80% of your ${lim}% VaR limit` };
}

/** The ladder's first step in target volatilities (C-31): words only, it refuses nothing. Under 0.8 the scale line. */
export const SCALE_LINE = "For scale (E, the PMs' simulations, independent returns at a constant volatility): at 0.5 σ* a book on target meets the first cut in about four years out of five.";
export const SCALE_TIP = "A: 83–86% of years at 8%; B: 81% at a Sharpe ratio of 1";
export function ladderInVols(cut1: number, volPct: number): { ratio: number; line: string; scale: boolean } {
  const ratio = volPct > 0 ? Math.round((cut1 / volPct) * 10) / 10 : 0;
  return { ratio, line: `first cut at ${one(cut1)}% of the reference capital = ${one(ratio)} target volatilities (${one(ratio)} σ*)`, scale: ratio < 0.8 - 1e-9 };
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
/** The whole rule, behind "more". */
export const BASE_RULE = "At the first NAV of each calendar year, if the stage is Full capital (and, under the first base, that NAV is at or above the year's reference capital), the high and the reference capital reset to that NAV. If a cut is in force the reset is held until a later January at full capital. A restore in March resets nothing before the next January. Under every base the drawdown is (the high − NAV) ÷ the reference capital, and Out is final: the only restart is a new portfolio.";
export const drawdownLine = (b: LadderBase): string => `(the high − NAV) ÷ the reference capital: ${b === "start" ? "the starting NAV" : "this year's starting NAV under a yearly reset"}`;
const steps = (l: Pick<Ladder, "cut1" | "cut2" | "out">): string => [l.cut1, l.cut2, l.out].map((x) => String(x)).join("/");
/** "4/2/2 · yearly reset, not after a losing year". */
export const ladderShort = (l: Ladder, b: LadderBase): string => `${steps(l)} · ${BASE_NAME[b].charAt(0).toLowerCase()}${BASE_NAME[b].slice(1)}`;
/** "4/2/2 → capital 50% / 30% / Out". */
export const ladderCaps = (l: Ladder): string => `${steps(l)} → capital ${l.cap1}% / ${l.cap2}% / Out`;
