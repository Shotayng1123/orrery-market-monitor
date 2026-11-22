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

// ---- a book day and the moment it begins (the designer's B.0.1, 22 Nov 2026) ----
// A book day is the day whose NAV is struck at 17:00 New York; it is written as a date ("Mon 23 Nov 2026"). Where one
// day is promised (the CHANGE form, a pending line) the moment it begins is printed in SGT with it: 17:00 New York on
// the day before, 06:00 SGT in New York's winter and 05:00 SGT in its summer.
/** The ISO instant of a wall-clock time in New York on a date (`hour` 0 to 23). */
function nyAt(ymd: string, hour: number): string {
  for (const off of [5, 4]) {   // New York's winter (UTC−5), then its summer (UTC−4)
    const t = new Date(Date.parse(`${ymd}T00:00:00Z`) + (hour + off) * 3600e3), p = parts("America/New_York", t);
    if (`${p.year}-${p.month}-${p.day}` === ymd && Number(p.hour) === hour && p.minute === "00") return t.toISOString();
  }
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + (hour + 5) * 3600e3).toISOString();
}
/** The moment a book day begins: 17:00 New York on the day before. */
export const bookDayStarts = (ymd: string): string => nyAt(addDays(ymd, -1), 17);
/** "Mon 23 Nov 2026, 06:00 SGT": a book day with the moment it begins in Singapore. */
export const bookDayFrom = (ymd: string): string => `${wdmy(ymd)}, ${hmSgt(bookDayStarts(ymd))} SGT`;
/** The day a book was created, in Singapore: "created 22 Nov 2026" on its strip, the phone's head and the lists. */
export const createdDay = (iso: string): string => sgDate(new Date(iso));
/** Said once in the head of every panel or phone section that holds a book day. */
export const DAY_ENDS = "a day ends 17:00 New York";

// ---- the targets' window (C-26) ----
// Both targets are fixed at creation and may be re-set only for the year after a January reset, under a yearly base:
// entered from 1 December (New York's date: 00:00 there, 13:00 SGT in its winter) until the January reset, kept as
// "pending", in force from the interval after the reset if it is made, lapsed if it is held (a cut in force) or
// withheld (a losing year, guarded base). Under "since the start" they are fixed. The reset itself is the daily NAV's
// (P-3); until a year's reset is on record its January counts as before the reset. The lines print the moment the
// window opens, in SGT with its time (the designer's B.0.2 of 22 Nov 2026, revision 2: "from 1 Dec" with no zone was
// shut on the reader's 1 Dec until 13:00); which moment it should be (00:00 New York, as here, or the first strike of
// December) is for the PMs. Every text that names the window is built from the one moment below.
/** The moment the window opens for a year's targets: 00:00 New York on 1 December, as "1 Dec 2026, 13:00 SGT". */
export const windowOpens = (year: number): string => { const t = nyAt(`${year}-12-01`, 0); return `${dmy(sgDate(new Date(t)))}, ${hmSgt(t)} SGT`; };
/** The same moment with no year: "1 Dec, 13:00 SGT" (1 December is in New York's winter time in every year). */
export const WINDOW_OPENS = windowOpens(2026).replace(/ \d{4},/, ",");
/** The window in words: "re-set only from 1 Dec, 13:00 SGT, to a January reset" (02 TARGETS, the form's fixed line). */
export const WINDOW_WORDS = `re-set only from ${WINDOW_OPENS}, to a January reset`;
/** The window in words for a book (the same for every book: the moment names no year). */
export const windowWords = (_w: { from: string | null }): string => WINDOW_WORDS;
// A book started in a year has no January reset in that year (the plan's §2.9: its first calendar year runs as "since
// the start"), so in the January of its own first year its window is shut (EN-10): a pair entered then would wait for
// a reset that never comes. `startedOn` is the book's first valuation day, the date the database checks too.
/** `from`: the moment the window in force (or the next one) opened or opens, in SGT. */
export interface TargetWindow { open: boolean; forYear: number | null; fixed: boolean; next: string | null; from: string | null }
export function targetWindow(nyYmd: string, base: LadderBase, resets: ResetRow[], startedOn?: string): TargetWindow {
  if (base === "start") return { open: false, forYear: null, fixed: true, next: null, from: null };
  const y = Number(nyYmd.slice(0, 4)), m = Number(nyYmd.slice(5, 7)), first = startedOn ? Number(startedOn.slice(0, 4)) : null;
  if (m === 12) return { open: true, forYear: y + 1, fixed: false, next: null, from: windowOpens(y) };
  if (m === 1 && (first == null || first < y) && !resets.some((r) => r.year === y)) return { open: true, forYear: y, fixed: false, next: null, from: windowOpens(y - 1) };
  return { open: false, forYear: null, fixed: false, next: `next window: from ${windowOpens(y)}, to the first NAV of ${y + 1}`, from: windowOpens(y) };
}
