// COPY of supabase/functions/_shared/pf/presets.ts: edit that file, then run `node tools/sync-pf.cjs` from web/.
// The five starts of the paper portfolio (P-1): each start's settings with their defaults, ranges, reasons and whose
// they are, and what the start can and cannot trade.
//
// Whose a default is, and where it is from:
//   PM A   the equity long/short PM's advice (A/portfolio-spec.md §1 and P-A01 to P-A12; A/portfolio-benchmarks.md §2, §3.1)
//   PM B   the global macro PM's advice (B/portfolio-spec.md P-B01 to P-B04; B/portfolio-benchmarks.md §2, §3)
//   Owner  the owner's own rule or answer (20 Nov 2026): the starts, the 4/2/2 ladder and its default base, cash + 5%
//   C      a value the engineer settled where the two PMs' files crossed (R-nn of the plan's §0.7; C-nn its own
//          corrections), with who has accepted it (the PMs' answers of 21 Nov 2026, the plan's §0.12)
// The why lines are the PMs' own, one line a row. The steps of a typed value are the designer's where the PMs gave
// ranges only (0.5 for the ladder's levels, 5 for its capital per cents, 0.1 or 0.05 for the VaR limit, 5 for the band
// and the amber line, 0.1 for the multiples); the targets' 0.5 and the blend's 10 are the PMs'. Where no step is
// given a value may carry the decimals its range is written with, and a finer one is refused as off its step.
// No source is read for any of this: every figure here is a default or a rule, never a market figure.
import type { After, Base, Field, SectionId, StartDef, StartId, Who } from "./types.ts";

// ---- whose ----
const who = (tag: string, basis: string, card: string): Who => ({ tag, basis, card });
const ADVISED = "20 Nov 2026", ACCEPTED = "21 Nov 2026";
export const PM_A = who("PM A", "default (PM advice: A)", `PM A · default advised by the equity long/short PM, ${ADVISED}`);
export const PM_B = who("PM B", "default (PM advice: B)", `PM B · default advised by the global macro PM, ${ADVISED}`);
export const PM_AB = who("PM A · PM B", "default (PM advice: A and B)", `PM A · PM B · default advised by both PMs, ${ADVISED}`);
export const OWNER = who("Owner", `default (the owner's, ${ADVISED})`, `Owner · the owner's rule, ${ADVISED}`);
/** Who has accepted a value C settled: both PMs, one, or none yet ("the PM to accept"); `null` where no acceptance
 *  was asked for (the settled value is the wider of the two the PMs gave). */
export type Accept = "AB" | "A" | "B" | "none" | null;
const acceptWords = (by: Accept): string => (by === "AB" ? `accepted by PM A and PM B, ${ACCEPTED}` : by === "A" ? `accepted by PM A, ${ACCEPTED}` : by === "B" ? `accepted by PM B, ${ACCEPTED}` : by === "none" ? "the PM to accept" : "");
/** The adviser line of a row the settlement amended: "settled by C (R-29); accepted by PM A and PM B, 21 Nov 2026",
 *  or "settled by C (R-29); the PM to accept" until an acceptance is entered. */
export const settledLine = (r: string, by: Accept): string => `settled by C (${r})${by ? `; ${acceptWords(by)}` : ""}`;
/** A default C settled itself. */
const settled = (r: string, by: Accept, what: string): Who => who(`C · ${r}`, `default (settled by C, ${r}${by ? `; ${acceptWords(by)}` : ""})`, `C · ${r} · ${what}${by ? `; ${acceptWords(by)}` : ""}`);
/** A PM's default with one part settled by C (its range, a rule tied to it). */
const withNote = (w: Who, part: string, r: string, by: Accept): Who => who(w.tag, w.basis, `${w.card} · ${part}: ${settledLine(r, by)}`);
const noted = (w: Who, note: string): Who => who(w.tag, w.basis, `${w.card} · ${note}`);
export const BY_ACCOUNT = who("you", "set by the account", "you · set by the account");

// ---- rows ----
type Num = NonNullable<Field["num"]>;
const num = (key: string, section: SectionId, label: string, after: After, w: Who, why: string, range: string, n: Num, more: Partial<Field> = {}): Field => ({ key, section, label, after, who: w, why, range, num: n, ...more });
const fixed = (key: string, section: SectionId, label: string, w: Who, why: string, text: string, more: Partial<Field> = {}): Field => ({ key, section, label, after: "fixed", who: w, why, range: "fixed", text, ...more });
/** "between 3% and 25%" and its like: the refusal in the range's own units. */
const pc = (lo: number, hi: number): string => `between ${lo}% and ${hi}%`;
const pm = (lo: number, hi: number): string => `between ±${lo}% and ±${hi}%`;
const A_MARK = { mark: "A" as const };

// ---- 01 KIND AND SIZE ----
function kindRows(name: string, baseWho: Who, baseWhy: string, navWho: Who, navWhy: string): Field[] {
  return [
    fixed("start", "kind", "Start and kind", noted(OWNER, "the owner's split of 20 Nov 2026 into Japan and Global"), "the owner's split", `${name} · absolute return`),
    { key: "base", section: "kind", label: "Base currency", after: "fixed", who: baseWho, why: baseWhy, range: "USD · JPY", choices: { def: "USD", options: [{ value: "USD", label: "USD" }, { value: "JPY", label: "JPY" }] } },
    // the starting NAV is an amount: its range, default and refusal follow the base currency (money.ts NAV_RANGE)
    { key: "nav", section: "kind", label: "Starting NAV", after: "fixed", who: navWho, why: navWhy, range: "USD 10m–1bn · JPY 1bn–100bn" },
    fixed("valuation", "kind", "Valuation point", noted(PM_AB, "R-6"), "a USD fund strikes its NAV after New York's close", "17:00 New York, on every weekday a market of the book trades"),
    fixed("flows", "kind", "Money in and out", PM_A, "the NAV moves only by P&L and costs", "none: more money is a new portfolio"),
  ];
}

// ---- 02 TARGETS AND REFERENCE ----
function targetRows(first: Who, bandNote: string): Field[] {
  return [
    num("target_x", "targets", "Target return", "window", withNote(first, "the range", "R-29", "AB"), "cash + x asks the same of a dollar PM and a yen PM: the PM's work is the margin over cash", "0–15%, step 0.5",
      { def: 5, lo: 0, hi: 15, step: 0.5, dp: 1, fix: 1, refuse: pc(0, 15), pre: "cash +", unit: "% a year", show: "cash + {v}% a year" }),
    num("target_vol", "targets", "Target volatility", "window", withNote(first, "the tie to the VaR limit (it is PM B's rule)", "R-31", "A"), "the risk the book is granted: it puts the owner's ladder at 0.8, 1.2 and 1.6 target volatilities", "2–8%, step 0.5",
      { def: 5, lo: 2, hi: 8, step: 0.5, dp: 1, fix: 1, refuse: pc(2, 8), unit: "% of capital a year", show: "{v}% of capital a year" }),
    num("band", "targets", "Band around the target", "limit", settled("R-32", "AB", `settled by C between the PMs' two figures (${bandNote})`), "inside it the guide suggests no change: the estimators' own error", "±5–50",
      { def: 20, lo: 5, hi: 50, step: 5, dp: 0, refuse: "between ±5 and ±50 points", pre: "±", unit: "points", show: "±{v} points" }),
    num("amber", "targets", "Amber above", "limit", settled("R-32", "AB", "settled by C between the PMs' two figures"), "risk used turns amber; nothing is refused", "100–150%",
      { def: 120, lo: 100, hi: 150, step: 5, dp: 0, refuse: pc(100, 150), unit: "% of the target", show: "{v}% of the target" }),
    fixed("underuse", "targets", "Under-use line", PM_AB, "a platform takes capital back from a PM who does not use it", "below 50% of the target for 20 NAVs"),
    fixed("sizing", "targets", "Sizing figure", PM_AB, "a calm month never invites the book to lever up, and a spike is seen at once", "the higher of the EWMA (λ 0.94) and the 252-session figure"),
  ];
}
const CASH5: Field = fixed("cash5", "targets", "Cash + 5% a year", OWNER, "the owner's standing comparison", "drawn on every absolute-return book");

// ---- 05 LADDER (the same rule in every AR start; fixed after creation) ----
const LADDER_WHY = "the multi-manager practice the owner's 4/2/2 comes from";
function ladderRows(): Field[] {
  return [
    { key: "ladder_base", section: "ladder", label: "Base", after: "fixed", who: noted(OWNER, "the owner's answer of 20 Nov 2026: \"Make the PMs' version the default\"; the guard is PM A's and PM B's (R-42, C-25)"), why: "after a losing year the high and the reference capital carry on: a slow loss is still cut", range: "fixed",
      choices: { def: "guarded", options: [{ value: "guarded", label: "Yearly reset, not after a losing year" }, { value: "yearly", label: "Yearly reset" }, { value: "start", label: "Since the start" }] } },
    num("cut1", "ladder", "First cut at a drawdown of", "fixed", noted(OWNER, "the 4/2/2; the range is PM A's and PM B's"), LADDER_WHY, "2–8%",
      { def: 4, lo: 2, hi: 8, step: 0.5, dp: 1, refuse: pc(2, 8), unit: "% of the reference capital", show: "{v}% of the reference capital" }),
    num("cap1", "ladder", "Capital after the first cut", "fixed", OWNER, "\"capital cut by 50%\": the owner's words", "25–75%",
      { def: 50, lo: 25, hi: 75, step: 5, dp: 0, refuse: pc(25, 75), unit: "% of the reference capital", show: "{v}% of the reference capital" }),
    num("cut2", "ladder", "Second cut at a further", "fixed", OWNER, LADDER_WHY, "1–4%",
      { def: 2, lo: 1, hi: 4, step: 0.5, dp: 1, refuse: pc(1, 4), pre: "+", unit: "%", show: "+{v}%" }),
    num("cap2", "ladder", "Capital after the second cut", "fixed", withNote(OWNER, "that it must be below the first", "C-24", "AB"), "\"cut by 70%\": the owner's words; the deeper loss never hands capital back", "10–50%, below the first",
      { def: 30, lo: 10, hi: 50, step: 5, dp: 0, refuse: pc(10, 50), unit: "%", show: "{v}%" }),
    num("out", "ladder", "Out at a further", "fixed", OWNER, "Out is final: the only restart is a new portfolio", "1–4%",
      { def: 2, lo: 1, hi: 4, step: 0.5, dp: 1, refuse: pc(1, 4), pre: "+", unit: "%", show: "+{v}%" }),
    fixed("restore", "ladder", "Restore", noted(PM_AB, "R-43"), "one step at a time, never back to the high", "each 2 points below the step that cut, never below 0"),
    num("cooling", "ladder", "Cooling-off before a restore", "fixed", noted(PM_AB, "R-3"), "a restore needs time since the cut, not one good day", "0–60",
      { def: 20, lo: 0, hi: 60, dp: 0, refuse: "between 0 and 60", unit: "final NAVs", show: "{v} final NAVs" }),
    num("deadline", "ladder", "Deadline of a cut", "fixed", noted(PM_AB, "R-4"), "inside the new limits by the first NAV after each market's next session, at the 20% cap's pace", "1–3",
      { def: 1, lo: 1, hi: 3, dp: 0, refuse: "between 1 and 3 sessions", unit: "sessions", show: "{v} sessions" }),
    fixed("warning", "ladder", "Warning", noted(PM_AB, "R-5"), "it only warns: the ladder acts on the final NAV", "when the live (E) drawdown is within 0.5 point of the next step"),
  ];
}

// ---- 07 FINANCING, BORROW AND COSTS (every row an assumption, marked A) ----
const spread = (key: string, label: string, w: Who, why: string, def: number, lo: number, hi: number, range: string, refuse: string): Field =>
  num(key, "costs", label, "assumption", w, why, range, { def, lo, hi, dp: 2, fix: 2, signed: true, refuse, pre: "the overnight rate", unit: "%", show: "the overnight rate {s}%" }, { ...A_MARK, group: "Financing" });
function financingRows(): Field[] {
  return [
    spread("cash_spread", "Own cash earns", PM_A, "A's assumption: what a prime broker pays on a client's own cash (EFFR, or TONA on a yen balance)", -0.25, -1, 0, "−1.00 to 0", "between −1.00 and 0"),
    spread("debit_spread", "A margin debit pays", withNote(PM_A, "the range", "R-38", null), "A's assumption: what a prime broker charges on a margin debit", 0.4, 0, 1.5, "0 to +1.50", "between 0 and +1.50"),
    spread("rebate_spread", "Short proceeds earn (the rebate)", PM_A, "short proceeds are held as collateral for the stock lent: they earn the rebate, not the credit rate", -0.25, -1, 0, "−1.00 to 0", "between −1.00 and 0"),
  ];
}
const borrow = (key: string, label: string, def: number, lo: number, hi: number, dp: number, why: string): Field => {
  const top = dp === 2 ? hi.toFixed(1) : String(hi);   // "0.1–1.0%", "1–5%"
  return num(key, "costs", label, "assumption", PM_A, why, `${lo}–${top}%`, { def, lo, hi, dp, ...(dp === 2 ? { fix: 2 } : {}), refuse: `between ${lo}% and ${top}%`, unit: "% a year", show: "{v}% a year" }, { ...A_MARK, group: "Borrow" });
};
function borrowRows(): Field[] {
  return [
    borrow("borrow_gc_us", "Borrow, general collateral · US", 0.3, 0.1, 1, 2, "A's assumption for a US name with no borrow signal"),
    borrow("borrow_gc_jp", "Borrow, general collateral · Japan", 0.5, 0.1, 1, 2, "A's assumption for a Tokyo name with no borrow signal"),
    borrow("borrow_warm", "Borrow, warm", 2, 1, 5, 1, "A's assumption for a name whose short interest or reported positions are high"),
    borrow("borrow_htb", "Borrow, hard to borrow", 10, 5, 30, 1, "A's assumption for a name on a threshold list"),
  ];
}
const FUNDING = (names: string): Field => ({ key: "funding", section: "costs", label: `Funding of ${names} (a dollar base)`, after: "assumption", who: withNote(PM_A, "that it can change later", "C-15", "A"), why: "the Tokyo longs are a yen debit; the capital stays in dollars", range: "–", usdOnly: true, group: "Financing", ...A_MARK,
  choices: { def: "pb", options: [{ value: "pb", label: "Yen from the prime broker", line: "the Tokyo longs are a yen debit; the capital stays in dollars" }, { value: "fwd", label: "Spot and a one-month forward, rolled monthly", off: "not yet: currencies are not built" }] } });
function costRows(): Field[] {
  const bp = (key: string, label: string, def: number, hi: number): Field => num(key, "costs", label, "assumption", PM_A, "an equity desk's negotiated rate; no public source", `0–${hi} bp`, { def, lo: 0, hi, dp: 1, refuse: `between 0 and ${hi} bp`, unit: "bp of value", show: "{v} bp of value" }, { ...A_MARK, group: "Costs" });
  return [
    bp("comm_us", "Commission, US shares and ETFs", 2, 10),
    bp("comm_jp", "Commission, Tokyo shares and ETFs", 5, 20),
    num("impact", "costs", "Impact coefficient", "assumption", PM_A, "the square-root law's coefficient: 0.5 matches what A's desk paid in liquid names", "0.25–1.0", { def: 0.5, lo: 0.25, hi: 1, dp: 2, refuse: "between 0.25 and 1.0", unit: "", show: "{v}" }, { ...A_MARK, group: "Costs" }),
    { key: "spread_tiers", section: "costs", label: "Quoted spread where no quote is stored", after: "assumption", who: noted(PM_A, "V-1: \"desk experience, not sourced\""), why: "the larger of one tick and the tier of the name's average daily value traded", range: "–", group: "Costs", ...A_MARK,
      text: "by the name's average daily value traded: USD 200m and above 2 bp · 50–200m 4 bp · 10–50m 8 bp · 2–10m 20 bp · 0.5–2m 50 bp · below 100 bp; never under one tick" },
    { key: "jp_resident", section: "costs", label: "Japan-resident (consumption tax on commission)", after: "assumption", who: PM_A, why: "none for a non-resident fund; 10% on commission if the portfolio is set as Japan-resident", range: "no · yes", group: "Costs", ...A_MARK,
      choices: { def: "no", options: [{ value: "no", label: "no" }, { value: "yes", label: "yes" }] } },
  ];
}

// ---- 06 CASH FLOOR AND MARGIN ----
const mult = (key: string, label: string, after: After, w: Who, why: string, def: number, hi: number, more: Partial<Field> = {}): Field =>
  num(key, "cash", label, after, w, why, `1.0–${hi.toFixed(1)}`, { def, lo: 1, hi, step: 0.1, dp: 1, fix: 1, refuse: `between 1.0 and ${hi.toFixed(1)}`, pre: "×", unit: "", show: "× {v}" }, { ...A_MARK, group: "Margin", ...more });
const FLOOR_CURE = fixed("floor_cure", "cash", "A breach of the floor is cured to", PM_AB, "a small buffer, so the next tick does not breach again", "the floor + 2 points");
const UC_ZERO = fixed("uc_zero", "cash", "Unencumbered cash below zero", PM_AB, "the prime broker's call does not wait", "the prime broker's call: cut from each market's next session, no day of grace");

// ---- what a start can trade (BP-5), and what it cannot trade here, with the reason (V-13) ----
const OSAKA = "Osaka's futures (Nikkei 225, TOPIX): JPX's files are not used in this Monitor. Japan's index futures here are CME's NKD and NIY.";
const TPY = "CME's yen TOPIX future (TPY): only if a named month trades at least 100 contracts a day over 20 sessions; not checked yet.";
const NO_LENDING_FEE = "No lending-fee signal for Tokyo: a Tokyo short is priced as general collateral or warm, never hard to borrow, and never refused for a stop on new shorts.";
const NOT_IN_START = "Written options, bonds and repo: not in this start.";
/** The classes whose orders are not built yet (the build's own: a class leaves the list when its orders are built). */
export const NOT_BUILT_CLASSES = ["orders in stocks and ETFs", "futures", "currencies", "options"];
export const notBuiltLine = (): string => `Not built yet: ${NOT_BUILT_CLASSES.join(" · ")}.`;
/** The lines of NOT BUILT YET for a start: the classes, and for the macro start, once stocks and ETFs are built and
 *  futures are not, what it can hold meanwhile. */
export function notBuiltLines(start: StartId): string[] {
  const stocks = !NOT_BUILT_CLASSES.includes("orders in stocks and ETFs"), futures = !NOT_BUILT_CLASSES.includes("futures");
  return [notBuiltLine(), ...(start === "ar-macro" && stocks && !futures ? ["Until then this book can hold only stocks and ETFs, within its equity limits."] : [])];
}
/** Under Overview's panels, once: what of the book is not built in this copy. */
export const NOT_BUILT_YET = "Not built yet in this copy: orders and fills · the daily NAV · limits and the ladder at work · performance and risk.";

const AFTER_WORD: Record<After, string> = { fixed: "fixed", limit: "limit", assumption: "assumption", window: "window" };
export const afterWord = (a: After): string => AFTER_WORD[a];

// ---- Equity long/short · Japan ----
const JP_FIELDS: Field[] = [
  ...kindRows("Equity long/short · Japan", PM_A, "the funds A knows report in USD", noted(PM_AB, "the yen figure settled as R-13"), "at this size the 20%-of-volume cap binds in Tokyo mid-caps, as it does at a real fund"),
  ...targetRows(PM_AB, "PM A's range"),
  fixed("reference", "targets", "Reference", noted(OWNER, "the index is the owner's; the series PM A's"), "compared, never an aim · fixed by the start", "MSCI Japan"),
  CASH5,
  num("foreign", "trade", "Names listed outside Tokyo", "limit", PM_A, "a Japan PM pairs a Tokyo name with a foreign peer at times; 20% keeps it a Japan book", "0–50%", { def: 20, lo: 0, hi: 50, dp: 1, refuse: pc(0, 50), pre: "at most", unit: "% of capital, gross", show: "at most {v}% of capital, gross" }),
  num("one_long", "limits", "One name, long", "limit", PM_A, "10% is the single-issuer limit of UCITS funds and Japanese public investment trusts", "3–25%", { def: 10, lo: 3, hi: 25, dp: 1, refuse: pc(3, 25), unit: "% of capital", show: "{v}% of capital" }),
  num("one_short", "limits", "One name, short", "limit", PM_A, "a short's loss has no ceiling, and it grows as it goes wrong", "1–10%", { def: 5, lo: 1, hi: 10, dp: 1, refuse: pc(1, 10), unit: "% of capital", show: "{v}% of capital" }),
  num("sector_gross", "limits", "Sector, gross", "limit", PM_A, "a generalist book is not one sector bet", "20–150%", { def: 50, lo: 20, hi: 150, dp: 1, refuse: pc(20, 150), unit: "% of capital", show: "{v}% of capital" }),
  num("sector_net", "limits", "Sector, net", "limit", PM_A, "a generalist book is not one sector bet", "±5–50%", { def: 20, lo: 5, hi: 50, dp: 1, refuse: pm(5, 50), pre: "±", unit: "% of capital", show: "±{v}% of capital" }),
  fixed("sector_scheme", "limits", "Sector scheme", PM_A, "TSE-17 is the official scheme Tokyo reads", "TSE-17 (JPX's workbook, official · personal use); a foreign name's sector entered by hand (A)"),
  num("ccy_each", "limits", "Currency other than the base, each", "limit", PM_A, "not this PM's edge: 10% of capital at a 10% move is 1% of capital, a quarter of the first step", "0–50%", { def: 10, lo: 0, hi: 50, dp: 1, refuse: pc(0, 50), pre: "net ≤", unit: "% of capital", show: "net ≤ {v}% of capital" }),
  num("gross", "limits", "Gross", "limit", noted(PM_A, "R-47"), "at a 5% target volatility 170% to 250% gross reaches the target; 200% sits in the middle", "100–300%", { def: 200, lo: 100, hi: 300, dp: 0, refuse: pc(100, 300), pre: "≤", unit: "% of capital", show: "≤ {v}% of capital" }),
  num("net", "limits", "Net", "limit", PM_A, "the net limits keep the book hedged, so the ladder judges the stock picking, not the market", "±5–100%", { def: 20, lo: 5, hi: 100, dp: 1, refuse: pm(5, 100), pre: "±", unit: "% of capital", show: "±{v}% of capital" }),
  num("beta_net", "limits", "β-adjusted net", "limit", PM_A, "a 4/2/2 ladder needs a hedged book", "±5–50%", { def: 10, lo: 5, hi: 50, dp: 1, refuse: pm(5, 50), pre: "±", unit: "% of capital", show: "±{v}% of capital" }),
  num("var", "limits", "VaR, one-day 99%", "limit", noted(PM_A, "R-15"), "tied to the target volatility; measured on a single-index estimate (E) until the risk step", "0.5–3%, step 0.1", { def: 1, lo: 0.5, hi: 3, step: 0.1, dp: 1, fix: 1, refuse: pc(0.5, 3), pre: "≤", unit: "% of capital, warning at 80% of it", show: "≤ {v}% of capital" }),
  num("exit_long", "limits", "Days to exit a long at 20% of avg daily volume (60d)", "limit", PM_A, "a winning long may be trimmed over a week", "1–20", { def: 5, lo: 1, hi: 20, dp: 0, refuse: "between 1 and 20 sessions", pre: "≤", unit: "sessions", show: "≤ {v} sessions" }),
  num("exit_short", "limits", "Days to exit a short", "limit", PM_A, "a short must be closable fast: three days of exit at 20% of volume", "1–20", { def: 3, lo: 1, hi: 20, dp: 0, refuse: "between 1 and 20 sessions", pre: "≤", unit: "sessions", show: "≤ {v} sessions" }),
  fixed("cure", "limits", "A breach from prices is cured within", noted(PM_A, "R-10"), "a short that runs against the book must go fast; a winning long may be trimmed over a week", "5 sessions for a long, 2 for a short"),
  ...ladderRows(),
  num("floor", "cash", "Unencumbered cash floor", "limit", noted(PM_A, "R-26"), "a short squeeze becomes a margin call; the floor lets the book survive it", "5–50%", { def: 20, lo: 5, hi: 50, dp: 1, refuse: pc(5, 50), pre: "≥", unit: "% of NAV", show: "≥ {v}% of NAV" }),
  FLOOR_CURE, UC_ZERO,
  fixed("house_margin", "cash", "House margin", noted(PM_A, "FINRA Rule 4210's levels as a stand-in"), "the public US rule; a real prime broker's house rule is stricter and not public", "long 25% of value; short 30%, at least USD 5 a share, 100% under USD 5; futures at the exchange's margin", { ...A_MARK, group: "Margin" }),
  mult("house_multiple", "House margin multiple", "fixed", PM_A, "a stricter prime broker: every margin requirement × this", 1, 2),
  mult("stress_mult", "Stressed unencumbered cash: every margin ×", "assumption", settled("R-37", "A", "PM B's rule; on the equity long/short starts settled by C"), "margins rise in stress: the floor's real test. Amber below the floor, nothing refused", 1.5, 3),
  ...financingRows(), FUNDING("Tokyo names"), ...borrowRows(), ...costRows(),
];

// ---- Equity long/short · Global: as Japan, with these differences ----
const GL_DIFF = new Map<string, Field | null>([
  ["start", fixed("start", "kind", "Start and kind", noted(OWNER, "the owner's split of 20 Nov 2026 into Japan and Global"), "the owner's split", "Equity long/short · Global · absolute return")],
  ["reference", fixed("reference", "targets", "Reference", noted(OWNER, "the index is the owner's; the series PM A's"), "compared, never an aim · fixed by the start", "MSCI ACWI")],
  ["foreign", null],
  ["sector_scheme", fixed("sector_scheme", "limits", "Sector scheme", noted(PM_A, "X-18"), "one scheme across markets for a global book", "GICS names: Yahoo's sector mapped (unofficial); Wikipedia's list for S&P 500 members (unofficial)")],
  ["gross", num("gross", "limits", "Gross", "limit", noted(PM_A, "R-47"), "at a 5% target volatility 170% to 250% gross reaches the target; two single-name markets and futures in each reach 400%", "100–400%", { def: 200, lo: 100, hi: 400, dp: 0, refuse: pc(100, 400), pre: "≤", unit: "% of capital", show: "≤ {v}% of capital" })],
]);
const GL_EXTRA: Field[] = [
  num("region_net", "limits", "Region, net, each of US · Japan · Europe · emerging markets · other developed", "limit", withNote(PM_A, "the regions' map", "C-17", "A"), "a 10% fall in one market then costs at most 1.5% of capital, under half the first step", "±5–50%", { def: 15, lo: 5, hi: 50, dp: 1, refuse: pm(5, 50), pre: "±", unit: "% of capital", show: "±{v}% of capital" }),
  num("region_max", "limits", "The largest region", "limit", PM_A, "the book stays global; 100% allows a one-market book", "50–100%", { def: 75, lo: 50, hi: 100, dp: 1, refuse: pc(50, 100), pre: "≤", unit: "% of gross", show: "≤ {v}% of gross" }),
];
const GL_CCY_ALL = num("ccy_all", "limits", "Currencies other than the base, in all", "limit", PM_A, "not this PM's edge: the whole currency exposure stays a fraction of the first step", "0–100%", { def: 20, lo: 0, hi: 100, dp: 1, refuse: pc(0, 100), pre: "net ≤", unit: "% of capital", show: "net ≤ {v}% of capital" });
const GL_FIELDS: Field[] = JP_FIELDS.flatMap((f): Field[] => {
  if (f.key === "funding") return [FUNDING("its Tokyo names")];
  if (!GL_DIFF.has(f.key)) return f.key === "ccy_each" ? [...GL_EXTRA, f, GL_CCY_ALL] : [f];
  const d = GL_DIFF.get(f.key);
  return d ? [d] : [];
});

// ---- Global macro ----
const cap = (key: string, label: string, def: number, lo: number, hi: number, why: string, more: { pre?: string; pmSign?: boolean; refuse?: string; range?: string; dp?: number; unit?: string; step?: number } = {}): Field => {
  const unit = more.unit ?? "% of capital", pre = more.pre ?? (more.pmSign ? "±" : undefined), dp = more.dp ?? 1;
  return num(key, "limits", label, "limit", PM_B, why, more.range ?? `${more.pmSign ? "±" : ""}${lo}–${hi}%`, { def, lo, hi, dp, ...(dp === 2 ? { fix: 2 } : {}), ...(more.step ? { step: more.step } : {}), refuse: more.refuse ?? (more.pmSign ? pm(lo, hi) : pc(lo, hi)), ...(pre ? { pre } : {}), unit, show: `${pre === "±" ? "±" : pre ? `${pre} ` : ""}{v}${unit.startsWith("%") ? "" : " "}${unit}` });
};
const MACRO_FIELDS: Field[] = [
  ...kindRows("Global macro", PM_B, "a macro book's margins, the futures it trades most and its cash hurdle are in dollars", noted(PM_B, "the yen figure settled as R-13"), "one platform PM's book; the 20% cap bites where it does in life; one ES contract is 0.37% of NAV").map((f) => (f.key === "start" ? fixed("start", "kind", "Start and kind", noted(OWNER, "the owner's revision of 20 Nov 2026: absolute return, with no benchmark aim"), "the owner's revision", "Global macro · absolute return") : f.key === "flows" ? { ...f, who: PM_B } : f)),
  ...targetRows(who("PM B · PM A", PM_AB.basis, PM_AB.card.replace("PM A · PM B", "PM B · PM A")), "PM B's file had 80–125%, fixed"),
  fixed("reference", "targets", "Reference", noted(OWNER, "the blend is the owner's; the series PM B's"), "compared, never an aim · fixed by the start", "60/40 blend"),
  { key: "blend", section: "targets", label: "The blend's shares", after: "fixed", who: noted(PM_B, "R-48"), why: "the portfolio an allocator holds instead of a macro fund", range: "10/90 to 90/10, in steps of 10",
    choices: { def: "60", options: [10, 20, 30, 40, 50, 60, 70, 80, 90].map((e) => ({ value: String(e), label: `${e}% MSCI ACWI / ${100 - e}% Global Aggregate` })) } },
  CASH5,
  cap("adj_gross", "Adjusted gross (the maximum leverage)", 600, 300, 1000, "it stops a book from sitting at every asset-class cap at once", { pre: "≤", refuse: "between 300% and 1,000%", range: "300–1,000%", dp: 0 }),
  cap("one_long", "One name, long", 5, 1, 20, "a name that halves on bad news then costs 2.5% of capital, short of the first cut at 4%"),
  cap("one_short", "One name, short", 3, 0.5, 10, "a short that doubles costs 3%, still short of the first cut"),
  num("exit_one", "limits", "Days to exit one position at 20% of avg daily volume (60d)", "limit", PM_B, "a capital cut must be executable by the next day for most of the book", "1–20", { def: 5, lo: 1, hi: 20, dp: 0, refuse: "between 1 and 20 sessions", unit: "sessions", show: "{v} sessions" }),
  cap("sector_net", "Sector, net", 15, 5, 50, "a sector-wide fall of 20% costs 3% at this limit", { pmSign: true }),
  cap("sector_gross", "Sector, gross", 100, 25, 300, "room for a generalist's tilt"),
  cap("eq_gross", "Equity book, gross", 300, 50, 600, "room for a market-neutral book; a fundamental long/short book runs well inside it"),
  cap("eq_net", "Equity book, net", 30, 0, 100, "net 30% in a 25% market fall is 7.5% of capital, just inside Out (8%)", { pmSign: true, refuse: "at most ±100%", range: "up to ±100%" }),
  num("var", "limits", "VaR, one-day 99%, historical", "limit", PM_B, "four days' VaR stand between the high and the first cut · measured from the risk step on", "0.25–3%, step 0.05", { def: 1, lo: 0.25, hi: 3, step: 0.05, dp: 2, fix: 1, refuse: pc(0.25, 3), pre: "≤", unit: "% of capital, warning at 80% of it", show: "≤ {v}% of capital" }),
  cap("stress", "Worst stress", 8, 4, 12, "no single shock in the standard set may take the book to Out · measured from the risk step on", { pre: "≤" }),
  cap("dv01_each", "DV01, each curve", 0.05, 0.01, 0.2, "USD 50,000 a bp on USD 100m: a 6bp day costs 0.3% of capital, a third of the VaR limit for one curve", { unit: "% of capital a bp", dp: 2, refuse: "between 0.01% and 0.20%", range: "0.01–0.20%" }),
  cap("dv01_all", "DV01, all curves", 0.1, 0.02, 0.4, "two curves at full size", { unit: "% of capital a bp", dp: 2, refuse: "between 0.02% and 0.40%", range: "0.02–0.40%" }),
  cap("fx_each", "FX, each currency", 50, 10, 200, "sized like the DV01 limit: one risk at its limit uses only part of the VaR limit"),
  cap("fx_all", "FX, all currencies", 150, 30, 400, "three currencies at full size"),
  cap("cmdty_each", "Commodities, each", 20, 5, 100, "oil's daily moves are several times a G10 currency's, so VaR will bind for oil before this line"),
  cap("cmdty_all", "Commodities, all", 60, 10, 200, "three commodities at full size"),
  cap("vega", "Net vega", 0.2, 0.05, 1, "a 20-point jump in implied volatility then costs 4%: the first cut", { unit: "% of capital a volatility point", dp: 2 }),
  fixed("cure", "limits", "A breach from prices is cured by", noted(PM_B, "R-10"), "the same cure and fallback as a capital cut", "the next NAV"),
  ...ladderRows(),
  num("floor", "cash", "Unencumbered cash floor", "limit", noted(PM_B, "R-26"), "a futures book's losses leave cash at each strike; the floor keeps its funding", "0–50%", { def: 10, lo: 0, hi: 50, dp: 1, refuse: pc(0, 50), pre: "≥", unit: "% of NAV", show: "≥ {v}% of NAV" }),
  FLOOR_CURE, UC_ZERO,
  fixed("house_margin", "cash", "Stock and ETF margin", noted(PM_A, "PM B adopts it"), "one prime-broker rule runs through every absolute-return book", "FINRA 4210's levels as the house rule (long 25%; short 30%, at least USD 5 a share; 100% under USD 5)", { ...A_MARK, group: "Margin" }),
  mult("house_multiple", "House margin multiple", "fixed", PM_A, "a stricter prime broker: every margin requirement × this", 1, 2),
  fixed("fut_margin", "cash", "Futures margin", noted(PM_B, "V-15: \"B's rule of thumb; CME's figure not read\""), "a row entered from the exchange's page, with its address and date, replaces the rule of thumb", "the exchange's initial margin where one is entered, with its source and date; else 5 × the contract's own σ of daily changes (63 sessions) × notional, at least 0.5%", { ...A_MARK, group: "Margin" }),
  mult("fut_multiple", "Futures margin multiple", "assumption", PM_B, "a broker may ask more than the exchange", 1, 2),
  num("fxcoll_g10", "cash", "FX collateral · G10", "assumption", PM_B, "B's desk: the collateral a forward's counterparty asks", "1–10%", { def: 3, lo: 1, hi: 10, dp: 1, refuse: pc(1, 10), unit: "% of notional", show: "{v}% of notional" }, { ...A_MARK, group: "Margin" }),
  num("fxcoll_other", "cash", "FX collateral · others", "assumption", PM_B, "B's desk: the collateral a forward's counterparty asks", "3–20%", { def: 7.5, lo: 3, hi: 20, dp: 1, refuse: pc(3, 20), unit: "% of notional", show: "{v}% of notional" }, { ...A_MARK, group: "Margin" }),
  mult("stress_mult", "Stressed unencumbered cash: every margin and haircut ×", "assumption", PM_B, "margins and haircuts rise in stress: the floor's real test. Amber below the floor", 1.5, 3),
  ...financingRows().map((f) => ({ ...f, who: noted(f.who, "PM B takes PM A's") })),
  ...borrowRows(),
  { key: "repo", section: "costs", label: "Repo, for cash Treasuries", after: "assumption", who: PM_B, why: "a hedge fund borrows through its dealer, above what cash lenders earn", range: "–", group: "Financing", ...A_MARK, text: "SOFR + 0.10%, overnight · later: cash Treasuries are not built" },
  { key: "repo_haircut", section: "costs", label: "Repo haircuts", after: "assumption", who: PM_B, why: "the part of the bond the book pays from its own cash", range: "–", group: "Financing", ...A_MARK, text: "2% up to 5 years · 3% from 5 to 10 · 5% over 10, and TIPS · later: cash Treasuries are not built" },
  ...costRows().filter((f) => f.key !== "jp_resident"),
  { key: "fut_fee", section: "costs", label: "Futures: exchange, clearing, NFA and commission together", after: "assumption", who: noted(PM_B, "V-15"), why: "one figure until the exchange's own fee page is read", range: "–", group: "Costs", ...A_MARK, text: "USD 2.50 a contract a side, until CME's page is read" },
  { key: "fx_conv", section: "costs", label: "FX conversion", after: "assumption", who: noted(PM_B, "R-21"), why: "B's desk: the cost of a spot conversion in a G10 pair", range: "–", group: "Costs", ...A_MARK, text: "1 bp of the price (G10)" },
];

const eqSummary = (v: Record<string, number | string>): string[] => [`Gross ≤ ${v.gross}% · net ±${v.net}% · β ±${v.beta_net}%`, `One name: long ${v.one_long}%, short ${v.one_short}%`, `Unencumbered cash ≥ ${v.floor}% of NAV`];

export const STARTS: Record<StartId, StartDef> = {
  "ar-ls-jp": {
    id: "ar-ls-jp", kind: "AR", name: "Equity long/short · Japan", short: "Equity L/S · Japan", offered: true,
    card: { lines: ["USD 100m · Tokyo shares, long and short", "targets: cash + 5% a year at 5% volatility", "reference: MSCI Japan, hedged"], phone: "USD 100m · reference MSCI Japan, hedged", advice: "PM A's advice" },
    reference: { short: "MSCI Japan, hedged", byBase: { USD: { label: "MSCI Japan, net, hedged to USD (E)", note: "" }, JPY: { label: "MSCI Japan, net, JPY", note: "" } }, proxy: "rebuilt from iShares MSCI Japan ETF (EWJ) holdings × Tokyo closes · fee not read yet", state: "waits for its series" },
    fields: JP_FIELDS,
    trade: {
      can: ["Tokyo-listed stocks and ETFs, long and short", "names listed outside Tokyo, up to 20% of capital, gross", "CME's Nikkei 225 futures by named month (NKD, NIY)", "1306.T and 1321.T", "long options", "USD/JPY spot and forwards"],
      cannot: [OSAKA, TPY, NO_LENDING_FEE, NOT_IN_START],
    },
    summary: eqSummary,
  },
  "ar-ls-gl": {
    id: "ar-ls-gl", kind: "AR", name: "Equity long/short · Global", short: "Equity L/S · Global", offered: true,
    card: { lines: ["USD 100m · US and Tokyo shares, other regions through ETFs", "targets: cash + 5% a year at 5% volatility", "reference: MSCI ACWI"], phone: "USD 100m · reference MSCI ACWI", advice: "PM A's advice" },
    reference: { short: "MSCI ACWI", byBase: { USD: { label: "MSCI ACWI, net, USD, unhedged", note: "includes currency moves the book does not carry" }, JPY: { label: "MSCI ACWI, net, JPY, unhedged", note: "includes currency moves the book does not carry" } }, proxy: "iShares MSCI ACWI ETF (ACWI) total return · fee not read yet", state: "waits for its series" },
    fields: GL_FIELDS,
    trade: {
      can: ["US- and Tokyo-listed stocks, long and short", "other regions through ETFs, counted by their underlying", "ES, NQ, NKD and NIY by named month", "index and region ETFs", "long options", "FX spot and forwards"],
      cannot: ["Stocks listed outside the US and Tokyo: only through ETFs.", OSAKA, TPY, NO_LENDING_FEE, NOT_IN_START],
    },
    summary: eqSummary,
  },
  "ar-macro": {
    id: "ar-macro", kind: "AR", name: "Global macro", short: "Global macro", offered: true,
    card: { lines: ["USD 100m · futures, currencies, ETFs, options", "targets: cash + 5% a year at 5% volatility", "reference: 60/40 blend of MSCI ACWI and the Global Aggregate"], phone: "USD 100m · reference 60/40 ACWI and Global Agg", advice: "PM B's advice" },
    reference: { short: "60/40 blend", byBase: {
      USD: { label: "MSCI ACWI, net, USD, unhedged · Bloomberg Global Aggregate, total return, hedged to USD · rebalanced every day", note: "" },
      JPY: { label: "MSCI ACWI, net, JPY, unhedged · Bloomberg Global Aggregate, total return, hedged to JPY (E) · rebalanced every day", note: "equity leg in yen, unhedged; bond leg hedged to yen by interest parity with overnight rates (E): the market's hedge also carries the cross-currency basis, not included" },
    }, proxy: "iShares MSCI ACWI ETF (ACWI) · the Global Aggregate's tracker · fees not read yet", state: "waits for its series" },
    fields: MACRO_FIELDS,
    trade: {
      can: ["CME's futures by named month, the front and the next: ES, NQ, YM, RTY, NKD, NIY · ZT, ZF, ZN, TN, ZB, UB · CL, BZ, NG, GC, SI, HG", "FX spot, forwards and NDFs", "options, long and short", "stocks and ETFs within its equity limits"],
      cannot: ["JGB, Bund and Gilt futures: not in the free feed the Monitor reads (Yahoo Finance carries none).", "Osaka's contracts: JPX's files are not used in this Monitor.", "So duration outside the US only through funds.", "Contract months beyond the next: too thin in the feed.", "Futures of Eurex, ICE Europe, Montréal and ASX: none in the feed.", "Cash Treasuries and repo: later, once their prices are read."],
      bold: 3,
    },
    summary: (v) => [`Adjusted gross ≤ ${v.adj_gross}% · VaR ≤ ${Number(v.var).toFixed(1)}% · floor ${v.floor}%`],
  },
  // The two relative-return starts: named, not offered from P-1. Their forms come with their benchmark limits (P-4b,
  // P-4c); what is kept here is what the plan's settlement amended (C-27, C-28) and PF-1's muted lines.
  "rr-eq": {
    id: "rr-eq", kind: "RR", name: "Equity long-only", short: "Equity LO", offered: false,
    card: { lines: [], phone: "", advice: "PM A's advice" },
    notYet: { line: "Equity long-only (against its MSCI index): offered once its benchmark limits are built.", phone: "Equity long-only: offered once its benchmark limits are built." },
    reference: null, fields: [],
    trade: { can: ["Stocks and funds", "index futures (long, and short only into the 95–102% band)", "long index puts, counted at their delta", "FX forwards to hedge a holding"], cannot: ["No shorts, written options or borrowing.", OSAKA, TPY] },
    summary: () => [],
  },
  "rr-fi": {
    id: "rr-fi", kind: "RR", name: "Fixed-income long-only", short: "FI LO", offered: false,
    card: { lines: [], phone: "", advice: "PM B's advice" },
    notYet: { line: "Fixed-income long-only (against the Global Aggregate): offered once its benchmark's profile is read.", phone: "Fixed-income long-only: offered once its benchmark's profile is read." },
    reference: null, fields: [],
    trade: { can: ["Bond ETFs", "government bond futures, long and short, by named month", "FX forwards, to hedge and within the currency limits", "Later: single Treasuries, paid in full (no repo)"], cannot: ["JGB, Bund and Gilt futures: not in the free feed the Monitor reads (Yahoo Finance carries none).", "Osaka's contracts: JPX's files are not used in this Monitor.", "So duration outside the US only through funds.", "No single corporate bonds, options, swaps, shorts of funds or equities."] },
    summary: () => [],
  },
};
/** The starts a portfolio is created from in P-1, in the order of PF-1's cards. */
export const AR_STARTS: StartId[] = ["ar-ls-jp", "ar-ls-gl", "ar-macro"];
export const RR_STARTS: StartId[] = ["rr-eq", "rr-fi"];
export const isStart = (s: string): s is StartId => Object.prototype.hasOwnProperty.call(STARTS, s);

/** Equity long-only's US benchmark (C-27): the S&P 500 until a plain MSCI USA tracker is stored, then MSCI USA
 *  preselected and the S&P 500 the alternative. */
export function usBenchmarks(msciUsaStored: boolean): { options: string[]; preselected: string } {
  return msciUsaStored ? { options: ["MSCI USA", "S&P 500"], preselected: "MSCI USA" } : { options: ["S&P 500"], preselected: "S&P 500" };
}
/** The notification of the target volatility is the account's choice, off by default (C-18, R-32). */
export const NOTIFY_TARGET_VOL_DEFAULT = false;
/** An account holds at most this many open paper portfolios. */
export const OPEN_CAP = 5;
export const CAP_LINE = `You have ${OPEN_CAP} open paper portfolios, the most an account may hold. Delete one to start another.`;

export const SECTIONS: Array<{ id: SectionId; no: string; title: string }> = [
  { id: "kind", no: "01", title: "Kind and size" }, { id: "targets", no: "02", title: "Targets and reference" }, { id: "trade", no: "03", title: "What it can trade" },
  { id: "limits", no: "04", title: "Limits" }, { id: "ladder", no: "05", title: "Ladder" }, { id: "cash", no: "06", title: "Cash floor and margin" }, { id: "costs", no: "07", title: "Financing, borrow and costs" },
];
export const fieldOf = (start: StartId, key: string): Field | undefined => STARTS[start].fields.find((f) => f.key === key);
export const fieldsOf = (start: StartId, section: SectionId, base: Base): Field[] => STARTS[start].fields.filter((f) => f.section === section && (!f.usdOnly || base === "USD"));
/** The Reference as the form's row words it, for a base currency (the macro blend's shares follow the select). */
export function referenceLabel(start: StartId, base: Base, blend: number | null): { label: string; short: string; note: string; proxy: string; state: string } | null {
  const r = STARTS[start].reference;
  if (!r) return null;
  const b = r.byBase[base], mix = blend != null ? `${blend}/${100 - blend} blend` : null;
  return { label: mix ? `${mix}: ${b.label}` : b.label, short: mix ?? (start === "ar-ls-jp" && base === "JPY" ? "MSCI Japan" : r.short), note: b.note, proxy: r.proxy, state: r.state };
}
/** The macro form's help line in place of a gross default (PM B): what the target volatility means in four
 *  single-asset books. Each figure is worked out from stored closes; while a history is not stored it reads "–". */
export function leverageHelp(volPct: number, figs: { es: number | null; zn: number | null; zt: number | null; usdjpy: number | null } | null): string {
  const f = (x: number | null | undefined) => (x == null ? "–" : String(Math.round(x)));
  const all = !!figs && figs.es != null && figs.zn != null && figs.zt != null && figs.usdjpy != null;
  return `Leverage is the target volatility over the book's volatility. At today's 252-session volatilities, ${volPct.toFixed(1)}% of capital is about: S&P 500 future ${f(figs?.es)}% of capital · 10-year note futures ${f(figs?.zn)}% · 2-year note futures ${f(figs?.zt)}% · USD/JPY ${f(figs?.usdjpy)}%${all ? "." : " · shown once the futures' histories are stored."}`;
}
export const ADJ_GROSS_CARD = "equity, option delta, FX and commodity notionals, and rates in 10-year equivalents: a 2-year note counts at its risk. Gross notional is shown, not limited.";
/** The line on what is fixed, at the foot of the summary. */
export const FIXED_LINE = "Fixed after creation: the start and kind, the base currency, the starting NAV, the reference, the ladder's base and numbers, the house margin multiple. The targets: re-set only from 1 Dec to a January reset, under a yearly base.";
