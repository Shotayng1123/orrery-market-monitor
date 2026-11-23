// COPY of supabase/functions/_shared/pf/calendar.ts: edit that file, then run `node tools/sync-pf.cjs` from web/.
// Days of the paper portfolio (P-1): the valuation day, the session a change is in force from, the targets' window,
// and the dates as the screens write them. Pure: the moment and the holidays are handed in. P-2 adds settlement days
// and each exchange's sessions to this file.
import type { LadderBase, ResetRow, StartId } from "./types.ts";

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
export interface Holidays { TSE?: Iterable<string>; NYSE?: Iterable<string>; through?: string | null;
  /** a venue's early closes, as the Monitor's session table holds them (_shared/sessions.ts EARLY_CLOSES): the minute of
   *  the local day its session ends, by date (P-2.1: a print of a half day's close is not read as an hour old) */
  early?: Partial<Record<"TSE" | "NYSE", Record<string, number>>> }
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
// ---- the session a change is in force from (EN-9: the PMs' answers of 22 Nov 2026) ----
// A change is in force from the session that opens next: the book day now running counts as "next" until the first
// regular session in it has opened on an exchange where the book's stocks trade (PM A: Tokyo for the Japan start;
// Tokyo or New York for the Global start and for the Japan start's names listed elsewhere; a CME future's hours or a
// currency's do not count for an equity book). For the macro start the day has begun at its first moment (FX trades
// from 17:00 New York, Globex from 18:00), so its changes wait for the next book day (PM B: "the first book day in which
// none of the start's markets has traded yet"). So a change made at 07:30 SGT on a Tokyo trading day is in force for
// that day's sessions on an equity book, and from the next day on the macro book.
/** The stock exchanges whose regular session opens a book day for a start's changes. */
export type Venue = "TSE" | "NYSE";
export const VENUE_NAME: Record<Venue, string> = { TSE: "Tokyo", NYSE: "New York" };
/** The venues of a start: none for the macro start (its day has begun at once); Tokyo, and New York where the book may
 *  hold names listed outside Tokyo (its limit `foreign` above 0), for the Japan start; both for the Global start. */
export function venuesOf(start: StartId, foreign?: number | string | null): Venue[] {
  if (start === "ar-macro") return [];
  if (start === "ar-ls-jp") return foreign === 0 ? ["TSE"] : ["TSE", "NYSE"];
  return ["TSE", "NYSE"];
}
/** When a venue's regular session opens on a date (09:00 in Tokyo, 09:30 in New York), or null on a day it does not
 *  trade (a weekend, or a holiday in its calendar). */
export function sessionOpens(venue: Venue, ymd: string, hol: Holidays): string | null {
  const wd = weekday(ymd);
  if (wd === 0 || wd === 6 || new Set((venue === "TSE" ? hol.TSE : hol.NYSE) ?? []).has(ymd)) return null;
  return venue === "TSE" ? new Date(Date.parse(`${ymd}T00:00:00Z`)).toISOString() : new Date(Date.parse(nyAt(ymd, 9)) + 30 * 60e3).toISOString();
}
// ---- a venue's sessions now (P-2.1: how old a print may be to size an order on) ----
/** Each venue's time zone and regular sessions, in minutes of its local day (Tokyo 09:00–11:30 and 12:30–15:30 JST, New
 *  York 09:30–16:00 ET), and the feed's delay as the Monitor's session table states it (Tokyo 20 minutes, New York none).
 *  The same figures as _shared/sessions.ts, which a file here cannot import. */
export const VENUE_TZ: Record<Venue, string> = { TSE: "Asia/Tokyo", NYSE: "America/New_York" };
export const SEGMENTS: Record<Venue, Array<[number, number]>> = { TSE: [[540, 690], [750, 930]], NYSE: [[570, 960]] };
export const FEED_DELAY_MIN: Record<Venue, number> = { TSE: 20, NYSE: 0 };
/** The instant of a minute of a venue's local day. */
function venueAt(venue: Venue, ymd: string, minute: number): number {
  return venue === "TSE" ? Date.parse(`${ymd}T00:00:00Z`) + (minute - 540) * 60e3 : Date.parse(nyAt(ymd, 0)) + minute * 60e3;
}
const tradesOn = (venue: Venue, ymd: string, hol: Holidays): boolean => sessionOpens(venue, ymd, hol) != null;
/** A venue now: "open" in a regular session, "break" between two of one day's (Tokyo's lunch), else "closed" or
 *  "holiday"; the start of the session running (`segStart`, ms) and where the print before it may be from (`before`:
 *  the day's first session for Tokyo's afternoon, else the open of the session day before); and the open of its latest
 *  session day that has opened (`lastOpen`, ms). */
export function venueNow(venue: Venue, now: Date, hol: Holidays): { state: "open" | "break" | "closed" | "holiday"; segStart: number | null; before: number | null; lastOpen: number | null } {
  const p = parts(VENUE_TZ[venue], now), ymd = `${p.year}-${p.month}-${p.day}`, min = Number(p.hour) * 60 + Number(p.minute), segs = SEGMENTS[venue];
  const prevDayOpen = (from: string): number | null => { let d = addDays(from, -1); for (let k = 0; k < 14; k++, d = addDays(d, -1)) if (tradesOn(venue, d, hol)) return venueAt(venue, d, segs[0][0]); return null; };
  if (!tradesOn(venue, ymd, hol)) return { state: [0, 6].includes(weekday(ymd)) ? "closed" : "holiday", segStart: null, before: null, lastOpen: prevDayOpen(ymd) };
  const end = hol.early?.[venue]?.[ymd] ?? segs[segs.length - 1][1], opened = min >= segs[0][0];
  const lastOpen = opened ? venueAt(venue, ymd, segs[0][0]) : prevDayOpen(ymd);
  if (!opened || min >= end) return { state: "closed", segStart: null, before: null, lastOpen };
  const i = segs.findIndex(([a, b]) => min >= a && min < Math.min(b, end));
  if (i < 0) return { state: "break", segStart: null, before: null, lastOpen };
  return { state: "open", segStart: venueAt(venue, ymd, segs[i][0]), before: i > 0 ? venueAt(venue, ymd, segs[0][0]) : prevDayOpen(ymd), lastOpen };
}
/** The day a change made now is in force from, and the last book day already traded in (what the store's own guard
 *  takes as its "today": a change is never in force in a day a market of the book has traded in). With venues, the
 *  running book day while none of them has opened in it (`today`: true), with the first of them to open; otherwise the
 *  first session day after it. Never backwards. */
export function changeDays(now: Date, hol: Holidays, venues: Venue[] = []): { effective: string; traded: string; today: boolean; opens: { venue: Venue; at: string } | null } {
  const day = valuationDay(now);
  if (venues.length && sessionDay(day, hol)) {
    const opens = venues.map((v) => ({ venue: v, at: sessionOpens(v, day, hol) })).filter((x): x is { venue: Venue; at: string } => x.at != null).sort((a, b) => a.at.localeCompare(b.at));
    if (opens.length && Date.parse(opens[0].at) > now.getTime()) return { effective: day, traded: addDays(day, -1), today: true, opens: opens[0] };
  }
  let d = addDays(day, 1);
  for (let k = 0; k < 14 && !sessionDay(d, hol); k++) d = addDays(d, 1);
  return { effective: d, traded: day, today: false, opens: null };
}
/** The day a change made now is in force from (changeDays). Without venues, the macro start's rule: the first session
 *  day after the valuation day now. */
export const nextSessionDay = (now: Date, hol: Holidays, venues: Venue[] = []): string => changeDays(now, hol, venues).effective;
/** What the form says of it: "In force for Tue 24 Nov 2026's sessions (Tokyo opens 08:00 SGT)" for the day running, else
 *  "In force from Wed 25 Nov 2026, 06:00 SGT" (B.0.1: the day promised, with the moment it begins). */
export function inForceWords(effective: string, opens: { venue: Venue; at: string } | null | undefined): string {
  return opens ? `In force for ${wdmy(effective)}'s sessions (${VENUE_NAME[opens.venue]} opens ${hmSgt(opens.at)} SGT)` : `In force from ${bookDayFrom(effective)}`;
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
// entered from the book day of 1 December until the January reset, kept as "pending", in force from the interval
// after the reset if it is made, lapsed if it is held (a cut in force) or withheld (a losing year, guarded base). Under
// "since the start" they are fixed. The reset itself is the daily NAV's (P-3); until a year's reset is on record its
// January counts as before the reset. The window opens with the book day of 1 December, at the strike of 30 November
// (17:00 New York, 06:00 SGT on 1 Dec in every year: 1 December is in New York's winter time): the kind of moment every
// "in force from" on the book already uses (PM A's answer of 22 Nov 2026; until then it opened at 00:00 New York on 1
// Dec, 13:00 SGT). The lines print that moment in SGT with its time (the designer's B.0.2). Every text that names the
// window is built from the one moment below, and every check of it takes the book day (valuationDay), not New York's
// date.
/** The moment the window opens for a year's targets: the start of the book day of 1 December, "Tue 1 Dec 2026, 06:00
 *  SGT". */
export const windowOpens = (year: number): string => bookDayFrom(`${year}-12-01`);
/** The same moment with no year (and so no weekday): "1 Dec, 06:00 SGT". */
export const WINDOW_OPENS = `1 Dec, ${hmSgt(bookDayStarts("2026-12-01"))} SGT`;
/** The window in words: "re-set only from 1 Dec, 06:00 SGT, to a January reset" (02 TARGETS, the form's fixed line). */
export const WINDOW_WORDS = `re-set only from ${WINDOW_OPENS}, to a January reset`;
/** The window in words for a book (the same for every book: the moment names no year). */
export const windowWords = (_w: { from: string | null }): string => WINDOW_WORDS;
// A book started in a year has no January reset in that year (the plan's §2.9: its first calendar year runs as "since
// the start"), so in the January of its own first year its window is shut (EN-10): a pair entered then would wait for
// a reset that never comes. `startedOn` is the book's first valuation day, the date the database checks too.
/** `from`: the moment the window in force (or the next one) opened or opens, in SGT. */
export interface TargetWindow { open: boolean; forYear: number | null; fixed: boolean; next: string | null; from: string | null }
/** `day`: the book day now (valuationDay): the window opens with the book day of 1 December. */
export function targetWindow(day: string, base: LadderBase, resets: ResetRow[], startedOn?: string): TargetWindow {
  if (base === "start") return { open: false, forYear: null, fixed: true, next: null, from: null };
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7)), first = startedOn ? Number(startedOn.slice(0, 4)) : null;
  if (m === 12) return { open: true, forYear: y + 1, fixed: false, next: null, from: windowOpens(y) };
  if (m === 1 && (first == null || first < y) && !resets.some((r) => r.year === y)) return { open: true, forYear: y, fixed: false, next: null, from: windowOpens(y - 1) };
  return { open: false, forYear: null, fixed: false, next: `next window: from ${windowOpens(y)}, to the first NAV of ${y + 1}`, from: windowOpens(y) };
}
