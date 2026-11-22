// Days of the paper portfolio (P-1): the valuation day, the session a change is in force from, the targets' window,
// and the dates as the screens write them. Pure: the moment and the holidays are handed in. P-2 adds settlement days
// and each exchange's sessions to this file.
import type { LadderBase, ResetRow } from "./types.ts";

const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmts = new Map<string, Intl.DateTimeFormat>();
function parts(tz: string, d: Date): Record<string, string> {
  let f = fmts.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); fmts.set(tz, f); }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) if (x.type !== "literal") p[x.type] = x.value;
  return p;
}
/** The calendar date of a moment in a time zone, "2026-11-21". */
export function ymdIn(tz: string, d: Date): string { const p = parts(tz, d); return `${p.year}-${p.month}-${p.day}`; }
export const sgDate = (now: Date): string => ymdIn("Asia/Singapore", now);
export const nyDate = (now: Date): string => ymdIn("America/New_York", now);
const addDays = (ymd: string, n: number): string => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const weekday = (ymd: string): number => new Date(`${ymd}T00:00:00Z`).getUTCDay();

/** The valuation day a moment belongs to. A day of the book ends at its valuation point, 17:00 New York: Tokyo's
 *  session of a date and New York's of the same date are one day, and after 17:00 New York the next day has begun. */
export const valuationDay = (now: Date): string => nyDate(new Date(now.getTime() + 7 * 3600e3));

/** The holidays the Monitor holds: Tokyo's and New York's (its `sessions_cal`), and how far they reach (`through`, the
 *  last date both calendars are held for; null when they could not be read). A day past it cannot be told from a
 *  session day, so a change dated past it is refused (EN-15). Left out (the logic checks), the rows are taken as
 *  reaching every day asked about. */
export interface Holidays { TSE?: Iterable<string>; NYSE?: Iterable<string>; through?: string | null }
/** Whether a day lies inside what the holiday rows cover: null when it does, else the refusal's words. */
export function calendarGap(ymd: string, hol: Holidays): { past: string } | { unread: true } | null {
  if (hol.through === undefined) return null;
  if (hol.through === null) return { unread: true };
  return ymd > hol.through ? { past: ymd.slice(0, 4) } : null;
}
/** Whether a market of the book trades on a date: a weekday on which Tokyo or New York is not on holiday. (The
 *  Monitor holds those two calendars; a day both are shut has no session and no NAV.) */
export function sessionDay(ymd: string, hol: Holidays): boolean {
  const wd = weekday(ymd);
  if (wd === 0 || wd === 6) return false;
  const tse = new Set(hol.TSE ?? []), nyse = new Set(hol.NYSE ?? []);
  return !(tse.has(ymd) && nyse.has(ymd));
}
/** The day a change made now is in force from: the first session after the valuation day now. Never the day that is
 *  running, never backwards. */
export function nextSessionDay(now: Date, hol: Holidays): string {
  let d = addDays(valuationDay(now), 1);
  for (let k = 0; k < 14 && !sessionDay(d, hol); k++) d = addDays(d, 1);
  return d;
}

/** "18 Nov 2026". */
export function dmy(ymd: string): string { const [y, m, d] = ymd.split("-").map(Number); return `${d} ${MONS[m - 1]} ${y}`; }
/** "18 Nov". */
export function dm(ymd: string): string { const [, m, d] = ymd.split("-").map(Number); return `${d} ${MONS[m - 1]}`; }
/** "Mon 23 Nov 2026". */
export const wdmy = (ymd: string): string => `${DAYS[weekday(ymd)]} ${dmy(ymd)}`;
/** "1 Oct 2026 09:12 SGT": a moment with its year, in Singapore. */
export function stampSgt(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "–";
  const p = parts("Asia/Singapore", t);
  return `${Number(p.day)} ${MONS[Number(p.month) - 1]} ${p.year} ${p.hour}:${p.minute} SGT`;
}
/** "19 Nov 17:20": a note's time under a head that says "times in SGT". */
export function timeSgt(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "–";
  const p = parts("Asia/Singapore", t);
  return `${Number(p.day)} ${MONS[Number(p.month) - 1]} ${p.hour}:${p.minute}`;
}
/** "17:02": the time of day in Singapore. */
export function hmSgt(iso: string): string { const t = new Date(iso); if (Number.isNaN(t.getTime())) return "–"; const p = parts("Asia/Singapore", t); return `${p.hour}:${p.minute}`; }

// ---- the targets' window (C-26) ----
// Both targets are fixed at creation and may be re-set only for the year after a January reset, under a yearly base:
// entered from 1 December (New York's date) until the January reset, kept as "pending", in force from the interval
// after the reset if it is made, lapsed if it is held (a cut in force) or withheld (a losing year, guarded base).
// Under "since the start" they are fixed. The reset itself is the daily NAV's (P-3); until a year's reset is on
// record its January counts as before the reset.
export const WINDOW_WORDS = "re-set only from 1 Dec to a January reset";
// A book started in a year has no January reset in that year (the plan's §2.9: its first calendar year runs as "since
// the start"), so in the January of its own first year its window is shut (EN-10): a pair entered then would wait for
// a reset that never comes. `startedOn` is the book's first valuation day, the date the database checks too.
export interface TargetWindow { open: boolean; forYear: number | null; fixed: boolean; next: string | null }
export function targetWindow(nyYmd: string, base: LadderBase, resets: ResetRow[], startedOn?: string): TargetWindow {
  if (base === "start") return { open: false, forYear: null, fixed: true, next: null };
  const y = Number(nyYmd.slice(0, 4)), m = Number(nyYmd.slice(5, 7)), first = startedOn ? Number(startedOn.slice(0, 4)) : null;
  if (m === 12) return { open: true, forYear: y + 1, fixed: false, next: null };
  if (m === 1 && (first == null || first < y) && !resets.some((r) => r.year === y)) return { open: true, forYear: y, fixed: false, next: null };
  return { open: false, forYear: null, fixed: false, next: `next window: 1 Dec ${y} to the first NAV of ${y + 1}` };
}
