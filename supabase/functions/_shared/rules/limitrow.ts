// The limit chip on the server (slice L-2 of C/limit-chip-plan.md, 24 Nov 2026): what the jobs keep with each quote and
// booked close of a list's row (constituent_stats, migration 20261124000001), the input pricelimit.ts's rule is handed
// for the print a row shows, and the fields a row and the stock page carry. EQUITIES, WATCHLIST and the stock page read
// the same row, so the lists and the page say the same of the same print. Pure: it imports only the rule, and the
// moment, the lists and the holidays are handed in. The server's alone: web/tools/sync-pf.cjs does not copy it to the
// page. Checked in sim/logic.test.ts ([AP]).
import { EQUAL_YEN, isSession, limitRun, limitState, limitsOf, prevSession, tseDay, type LimitInput, type LimitState } from "./pricelimit.ts";

/** The lists whose .T names are placed (the rule's not-placed): the Monitor's Nikkei 225 and TOPIX. */
export const LIMIT_LISTS: readonly string[] = ["NK225", "TOPIX"];
/** constituent_stats' columns for the chip (migration 20261124000001); a database from before has none of them. */
export const LIMIT_COLS = ["q_high", "q_low", "prev_vol", "prev2_vol", "prev_qt", "lim_run"] as const;
/** Whether a database's answer is that one of those columns is not there (Postgres on a read, PostgREST on a write). */
export const lacksLimitCols = (message: string): boolean => /does not exist|could not find the/i.test(message) && LIMIT_COLS.some((c) => message.includes(c));
/** A row to write to such a database: key for key as before the chip. */
export function withoutLimitCols<T extends object>(row: T): T { for (const c of LIMIT_COLS) delete (row as Record<string, unknown>)[c]; return row; }

/** A row of constituent_stats as far as the chip reads it: the booked close (`d`, `close`, the close before it `prev`),
 *  the stored quote (`q_*`, its day `volume`), the session before the stored quote's (`prev_*`) and the run (`lim_run`). */
export interface LimitStat {
  symbol: string; d: string; close: number; prev?: number | null;
  q_price?: number | null; q_prev?: number | null; q_time?: string | null; q_high?: number | null; q_low?: number | null; volume?: number | null;
  prev_vol?: number | null; prev2_vol?: number | null; prev_qt?: string | null; lim_run?: number | null;
}
/** A print a row shows: a last price with its time, the day's high and low where held, and the quote's previous close. */
export interface LimitPrint { price: number | null; at: string | null; high?: number | null; low?: number | null; quotePrev?: number | null }
export interface LimitCtx { members: ReadonlySet<string>; holidays: ReadonlySet<string>; now: Date }

// ---- what the jobs keep ----
export interface PrevCols { prev_vol: number | null; prev2_vol: number | null; prev_qt: string | null }
/** The prev_* columns to write with a new quote printed at `nextAt`. The first quote of a later session (`sessionOf`: the
 *  exchange's date of a moment) moves the stored quote's volume and time into prev_vol and prev_qt, and prev_vol into
 *  prev2_vol; otherwise they stay as stored. A session whose quotes were never kept (the job missed it, or a name that
 *  did not trade, whose quote keeps its last trade's time) leaves prev_qt on an older session, so the reader knows the
 *  base session's volume and last trade are not held. */
export function shiftPrev(stored: Pick<LimitStat, "q_time" | "volume" | "prev_vol" | "prev2_vol" | "prev_qt"> | null | undefined, nextAt: string | null, sessionOf: (iso: string) => string): PrevCols {
  const kept: PrevCols = { prev_vol: stored?.prev_vol ?? null, prev2_vol: stored?.prev2_vol ?? null, prev_qt: stored?.prev_qt ?? null };
  if (!stored?.q_time || !nextAt || !(sessionOf(nextAt) > sessionOf(stored.q_time))) return kept;
  return { prev_vol: stored.volume ?? null, prev2_vol: stored.prev_vol ?? null, prev_qt: stored.q_time };
}
/** The Tokyo sessions the kept quotes saw without a trade: those between the last trade kept (prev_qt) and the quote's own
 *  session (no quote printed in them: no trade, or not seen), and those whose kept volume is 0 (prev2_vol's being the
 *  session before prev_qt's). They may only lengthen a run. */
export function untradedOf(s: Pick<LimitStat, "q_time" | "volume" | "prev_qt" | "prev_vol" | "prev2_vol">, holidays: ReadonlySet<string>): Set<string> {
  const out = new Set<string>(), q = s.q_time ? tseDay(s.q_time) : null, p = s.prev_qt ? tseDay(s.prev_qt) : null;
  if (q && s.volume === 0) out.add(q);
  if (p && s.prev_vol === 0) out.add(p);
  if (p && s.prev2_vol === 0) { const b = prevSession(p, holidays); if (b) out.add(b); }
  if (p && q) for (let x = prevSession(q, holidays); x && x > p; x = prevSession(x, holidays)) out.add(x);
  return out;
}
/** A session as limitRun reads it: its close at (1), beyond (2) or inside (0) its normal limits from the close before
 *  it, null when that cannot be told (pricelimit.ts closeAt). */
function sessionAt(close: number | null | undefined, prev: number | null | undefined): 0 | 1 | 2 | null {
  if (close == null || prev == null || !(close > 0)) return null;
  const l = limitsOf(prev);
  if (!l) return null;
  if (close - l.upper >= EQUAL_YEN || (l.lower !== null && l.lower - close >= EQUAL_YEN)) return 2;
  return Math.abs(close - l.upper) < EQUAL_YEN || (l.lower !== null && Math.abs(close - l.lower) < EQUAL_YEN) ? 1 : 0;
}
/** lim_run, kept at booking: the run of sessions up to the one before the booked close's (what that close's own limit
 *  rests on), as limitRun reads them, from the job's daily closes set on the TSE's sessions (a session without a close
 *  there counts as one the series cannot tell) and the sessions known untraded (`untraded`: never a shorter run). Signed
 *  by the side of the run's newest session read at or beyond its limit (+ up, − down; + where none is). null when the
 *  close before the booked one is not the session before it's, or the booked close is on no session. */
export function limRunOf(closes: ReadonlyArray<{ d: string; v: number }>, holidays: ReadonlySet<string>, untraded: ReadonlySet<string> = new Set()): number | null {
  const n = closes.length, d = n ? closes[n - 1].d : "", b = d && isSession(d, holidays) ? prevSession(d, holidays) : "";
  if (n < 2 || !b || closes[n - 2].d !== b) return null;
  const at = new Map(closes.map((c) => [c.d, c.v])), days: string[] = [];
  for (let s = b; s && s >= closes[0].d && days.length < 12; s = prevSession(s, holidays)) days.unshift(s);
  const series = days.map((s) => ({ close: at.get(s) ?? null }));
  const run = Math.max(limitRun(series), limitRun(series.map((x, i) => ({ ...x, volume: untraded.has(days[i]) ? 0 : null }))));
  let side = 1;
  for (let i = series.length - 1; i >= 1 && i >= series.length - run; i--) { const c = series[i].close, p = series[i - 1].close; if ((sessionAt(c, p) ?? 0) >= 1) { side = (c as number) < (p as number) ? -1 : 1; break; } }
  return run === 0 ? 0 : side * run;
}
/** The run up to a booked close from the run before it (lim_run) and that close against the one before it: decision-exact
 *  with limitRun over the whole series (under 2 exactly when its is). null stays null. */
export function runThrough(before: number | null, close: number | null | undefined, prev: number | null | undefined): number | null {
  if (before === null) return null;
  const at = sessionAt(close, prev), side = close != null && prev != null ? (close < prev ? -1 : 1) : before < 0 ? -1 : 1;
  return at === 0 ? 0 : side * (at === 2 ? Math.max(2, Math.abs(before) + 1) : Math.abs(before) + 1);
}

// ---- the print a row shows, and the rule's input for it ----
/** The row's stored quote as a print (EQUITIES while its list is live; WATCHLIST's row at a print). */
export const quotePrint = (s: LimitStat): LimitPrint => ({ price: s.q_price ?? null, at: s.q_time ?? null, high: s.q_high ?? null, low: s.q_low ?? null, quotePrev: s.q_prev ?? null });
/** The row's booked close as a print: a trade only where the stored quote printed in that same session (its time and day
 *  range are then the close's); otherwise it has no time, and gets no chip. */
export function closePrint(s: LimitStat): LimitPrint {
  const same = !!s.q_time && tseDay(s.q_time) === s.d;
  return { price: s.close, at: same ? (s.q_time as string) : null, high: same ? s.q_high ?? null : null, low: same ? s.q_low ?? null : null, quotePrev: same ? s.q_prev ?? null : null };
}
/** The rule's input for a print of a row (`p`: the row's quote, its booked close, or the stock page's own quote). A print
 *  of a later session than the booked close stands on that close, with the run through it; the booked session's own print
 *  stands on the close before it, which the booking placed on the session before when it kept lim_run. The base
 *  session's volume and last trade are the stored quote's or the one before it (prev_*), whichever printed in it. */
export function limitInputOf(s: LimitStat | null | undefined, symbol: string, p: LimitPrint, c: LimitCtx): LimitInput {
  const input: LimitInput = { symbol, members: c.members, price: p.price, at: p.at, high: p.high ?? null, low: p.low ?? null, base: null, baseDay: null, quotePrev: p.quotePrev ?? null, prevVolume: null, prevLastAt: null, run: null, holidays: c.holidays, now: c.now };
  if (!s || p.at === null || !Number.isFinite(Date.parse(p.at))) return input;
  const day = tseDay(p.at);
  const traded = (session: string) => (s.q_time && tseDay(s.q_time) === session ? { prevVolume: s.volume ?? null, prevLastAt: s.q_time } : s.prev_qt && tseDay(s.prev_qt) === session ? { prevVolume: s.prev_vol ?? null, prevLastAt: s.prev_qt } : {});
  if (day > s.d) return { ...input, ...traded(s.d), base: s.close, baseDay: s.d, run: runThrough(s.lim_run ?? null, s.close, s.prev) };
  if (day === s.d) { const b = prevSession(s.d, c.holidays), run = s.lim_run ?? null; return { ...input, ...(b ? traded(b) : {}), base: s.prev ?? null, baseDay: run === null || !b ? null : b, run }; }
  return input;
}
export const rowLimitState = (s: LimitStat | null | undefined, symbol: string, p: LimitPrint, c: LimitCtx): LimitState => limitState(limitInputOf(s, symbol, p, c));

// ---- what a row and the stock page carry ----
/** `lim`, a row's field while the print it shows is at its limit: nothing else is sent (a page of before reads none). */
export interface Lim { side: "up" | "down"; price: number; base: number; width: number; at: string; closed: boolean }
export function limOf(st: LimitState | null): Lim | null {
  return st && st.side && st.why === null && st.price !== null && st.base !== null && st.width !== null && st.at !== null ? { side: st.side, price: st.price, base: st.base, width: st.width, at: st.at, closed: st.closed } : null;
}
/** The row with `lim` at a limit; otherwise the very same row. */
export function withLim<T extends object>(row: T, st: LimitState | null): T | (T & { lim: Lim }) { const lim = limOf(st); return lim ? { ...row, lim } : row; }
/** The stock page's fields: `limits` for a placed name every day (the day's limits, the base and its session, the width,
 *  and why they are not JPX's where they cannot be known), and `lim` at a limit. A name not placed gets neither. */
export function stockLimitFields(st: LimitState | null) {
  if (!st || st.why === "not-placed") return {};
  const lim = limOf(st);
  return { limits: { upper: st.upper, lower: st.lower, base: st.base, baseDay: st.baseDay, width: st.width, why: st.why }, ...(lim ? { lim } : {}) };
}
const yen = (x: number | null) => (x === null ? "–" : x.toLocaleString("en-US"));
/** The job log's line for a print beyond its computed limits (the Monitor's base or width is not JPX's that day), values
 *  only, once per name and day: null unless `after` is beyond and `before` (the stored quote's state) was not, that day. */
export function beyondNote(symbol: string, before: LimitState | null, after: LimitState, p: LimitPrint): string | null {
  if (after.why !== "beyond" || (before?.why === "beyond" && before.day === after.day)) return null;
  return `limit beyond: ${symbol} ${after.day}: last ${yen(after.price)} at ${after.at}, day's high ${yen(p.high ?? null)}, low ${yen(p.low ?? null)}, outside the computed ${yen(after.lower)}–${yen(after.upper)} (base ${yen(after.base)}, close of ${after.baseDay}, ±${yen(after.width)})`;
}
