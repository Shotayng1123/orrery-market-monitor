// When a closed market opens (the owner's request of 20 Nov 2026). At 21:16 SGT on a Friday the Monitor said the US
// market was closed and did not say that New York opens at 22:30 SGT (09:30 there, since its clocks went back on
// 1 Nov). So wherever the Monitor says CLOSED it now says when that market next opens, in SGT, in its own time format:
// "opens 22:30 SGT" when that is today in Singapore, "opens 23 Nov 22:30 SGT" on another day.
//   - The time is the start of the market's next regular session in the session table (lib/sessions.ts), worked out in
//     the market's own time zone, so a change of clocks there moves it by itself.
//   - No guesses: a holiday in the calendar the Monitor holds (Tokyo's from JPX, New York's from NYSE) is passed over.
//     For a market whose holidays it does not hold, the line ends ", scheduled": the time the timetable gives, on a
//     local holiday the market stays shut.
//   - A row that is not live while its market's timetable has a session is not called CLOSED: its stamp says LAST
//     PRINT, and the line says what the Monitor knows (the reviewer's O-4, 21 Nov 2026). In a session's first minutes
//     on a delayed feed: "first print due ~08:20 SGT". After them, where the Monitor holds the market's holidays
//     (so today is known not to be one): "open since 08:00 SGT". Where it does not, it cannot say the market is open
//     (on a local holiday it is not): the timetable's session, "session 16:00–00:30 SGT, scheduled".
//   - An instrument the Monitor reads in New York's regular hours though New York's exchange is not its market (the
//     dollar index, the Cboe yield and volatility indices; the reviewer's O-2) is called neither open nor closed by
//     New York's hours: its stamp says LAST PRINT and the line when the Monitor next reads it, "next read 22:30 SGT".
//   - An official yield is published once a day and has no session: nothing is said of it. Crypto never closes.
import { calendarState, EARLY_CLOSES, HOLIDAY_SOURCES, holidaysNow, marketOf, marketStatus, nextOpen, openSince, stockMarket, type HolidayMap, type Market, type MarketId, type NextOpen } from "./sessions";
import { fmtClock, fmtDate, fmtDayMon, fmtDayTime, fmtStamp, fmtWhen, isOfficialRow, TZ_ABBR } from "./time";
import { delayed, PERSONAL_USE_PUBLISHERS } from "./labels";
import { shortName } from "./short";

/** What the session table says of a market now: shut, in its timetable's hours, or not known to it (no such market in
 *  the table, one that never closes, one whose calendar has not arrived yet, or an instrument that is only read in
 *  New York's hours). */
export type SessionNow = "closed" | "open" | "unknown";
export interface SessionNote {
  /** "opens": the market is shut, and this is when it next opens.
   *  "since": it is in its regular hours by a calendar the Monitor holds, since then.
   *  "session": its timetable has a session now, but the Monitor does not hold its holidays: the session's hours.
   *  "due": a session's first minutes on a delayed feed: when the first print is due.
   *  "read": an instrument read in New York's hours, which are not its own market's: when it is next read. */
  kind: "opens" | "since" | "session" | "due" | "read";
  /** "opens 22:30 SGT", "opens 23 Nov 09:30 SGT, scheduled", "open since 08:00 SGT", "session 16:00–00:30 SGT,
   *  scheduled", "first print due ~08:20 SGT", "next read 22:30 SGT". */
  text: string;
  /** The whole of it for a tooltip: the market, its hours, why it is shut, whose calendar. */
  tip: string;
  /** True when the Monitor does not hold the market's holidays for that day: the time is the timetable's. */
  scheduled: boolean;
  /** The moment the line names: the next open, the session's start, the first print's due time, the next read. */
  at: Date;
  market: Market;
  /** For "opens": why the market is shut now, where the Monitor knows a reason beyond its hours: a holiday in the
   *  calendar it holds, its midday (or daily) break, an early close today. */
  why?: "holiday" | "break" | "early";
  /** For "opens": the days after today that the next open passes over because the calendar the Monitor holds gives
   *  them as holidays (local dates): on a Saturday Tokyo "opens 24 Nov", and this says why not on the 23rd. */
  skipped?: string[];
}
export interface RowSession { now: SessionNow; note: SessionNote | null }
/** The holiday calendar a reading is made with: the days, and whether it has come ("wait": asked for or not yet,
 *  "ok": received, "none": asked for and not received). The page's own unless one is given (the logic checks do). */
export interface Cal { holidays: HolidayMap; state: "wait" | "ok" | "none" }
const calNow = (): Cal => ({ holidays: holidaysNow(), state: calendarState() });

const p2 = (n: number) => String(n).padStart(2, "0");
const hhmm = (minute: number): string => `${p2(Math.floor(minute / 60) % 24)}:${p2(minute % 60)}`;
const zone = (m: Market): string => TZ_ABBR[m.tz] ?? `${m.name} time`;
/** A market's regular hours in its own time: "09:00–11:30, 12:30–15:30 JST". */
export function hoursText(m: Market): string {
  if (m.id === "FX") return "Sunday 17:00 to Friday 17:00 ET";
  if (m.id === "CME") return "Sunday 18:00 to Friday 17:00 ET, with a break from 17:00 to 18:00 each day";
  return `${m.sessions.map(([a, b]) => `${hhmm(a)}–${hhmm(b)}`).join(", ")} ${zone(m)}`;
}
/** A publisher's calendar by name, with "(personal use)" right after a name the owner's P4 covers (JPX's: LV-4 of
 *  round 3b, the owner's answer of 21 Nov 2026 on JPX's holiday calendar). */
const calName = (publisher: string): string => `${publisher}'s calendar${PERSONAL_USE_PUBLISHERS.has(publisher) ? " (personal use)" : ""}`;
/** The calendar a holiday is from, by its publisher's name. */
const calendarOf = (m: Market): string => (HOLIDAY_SOURCES[m.id] ? calName(HOLIDAY_SOURCES[m.id]!.publisher) : "the Monitor's calendar");
/** Whose calendar stands behind a time, or why it is only the scheduled one (`then`: what a holiday would mean). */
function calendarWords(m: Market, firm: boolean, then: string, cal: Cal): string {
  const src = HOLIDAY_SOURCES[m.id];
  if (firm && src) return `Holidays${EARLY_CLOSES[m.id] ? " and early closes" : ""}: ${calName(src.publisher)}.`;
  if (!src) return `The Monitor does not hold this market's holidays: on one ${then}.`;
  if (cal.state !== "ok") return `${calName(src.publisher)} could not be loaded: on a holiday ${then}.`.replace(/^./, (c) => c.toUpperCase());
  return `The Monitor holds ${calName(src.publisher)} to ${fmtDate(src.through)}: on a holiday after it ${then}.`;
}
/** The time as every line here writes it: "22:30 SGT" today in Singapore, "23 Nov 22:30 SGT" on another day. */
const when = (at: Date, now: Date): string => `${fmtWhen(at, now)} SGT`;
const trades = (m: Market): string => `${m.name}: ${m.id === "FX" || m.id === "CME" ? "trades" : "regular session"} ${hoursText(m)}`;

function opensNote(m: Market, n: NextOpen, now: Date, cal: Cal): SessionNote {
  const today = marketStatus(m, now, cal.holidays).localDate, early = EARLY_CLOSES[m.id]?.[today];
  const later = n.skipped.filter((d) => d !== today);
  const why = n.why === "break" ? (m.id === "CME" ? "In its daily break. " : "In its midday break. ")
    : n.why === "holiday" ? `Shut today: a holiday in ${calendarOf(m)}. `
    : n.why === "early" && early != null ? `Closed early today, at ${hhmm(early)} ${zone(m)} (${calendarOf(m)}). ` : "";
  const skipped = later.length ? `${later.map((d) => fmtDate(d)).join(", ")}: ${later.length === 1 ? "a holiday" : "holidays"} in ${calendarOf(m)}. ` : "";
  return {
    kind: "opens", at: n.at, market: m, scheduled: !n.firm, ...(n.why === "hours" || (n.why === "early" && early == null) ? {} : { why: n.why }), ...(later.length ? { skipped: later } : {}),
    text: `opens ${when(n.at, now)}${n.firm ? "" : ", scheduled"}`,
    tip: `${trades(m)}. ${why}${skipped}${n.firm ? "Next opens" : "Scheduled to open"} ${fmtStamp(n.at)}. ${calendarWords(m, n.firm, "the market stays shut", cal)}`,
  };
}
/** How long after a session's first print is due (its start plus the feed's delay) the line still says when it was
 *  due: the server calls a print live while it is no older than the feed's delay plus fifteen minutes (table.ts). */
export const DUE_GRACE_MIN = 15;
/** A row that is not live while its market's timetable has a session (`s`: from openSince). Three cases, none of which
 *  says more than the Monitor knows (the reviewer's O-4, 21 Nov 2026):
 *  - the session's first minutes on a delayed feed: when its first print is due, "first print due ~08:20 SGT";
 *  - after them, a market whose holidays the Monitor holds: today is not one, so "open since 08:00 SGT";
 *  - after them, any other market: it may be a local holiday, on which the row was rightly called closed before
 *    21 Nov 2026 and wrongly "open since" on that day: the timetable's session, "session 16:00–00:30 SGT, scheduled". */
function sinceNote(m: Market, s: { at: Date; end: Date; firm: boolean }, now: Date, cal: Cal): SessionNote {
  const late = `The last print the Monitor has is older than a live one${m.delayMin > 0 ? `; this feed is delayed about ${m.delayMin} minutes` : ""}.`;
  const due = new Date(s.at.getTime() + m.delayMin * 60e3), sched = s.firm ? "" : ", scheduled";
  if (m.delayMin > 0 && now.getTime() < due.getTime() + DUE_GRACE_MIN * 60e3) return {
    kind: "due", at: due, market: m, scheduled: !s.firm,
    text: `first print due ~${when(due, now)}${sched}`,
    tip: `${trades(m)}; ${s.firm ? "in session since" : "its timetable's session began"} ${fmtStamp(s.at)}. This feed is delayed about ${m.delayMin} minutes: the session's first print is due about ${fmtStamp(due)}. ${calendarWords(m, s.firm, "there is no session", cal)}`,
  };
  if (s.firm) return {
    kind: "since", at: s.at, market: m, scheduled: false,
    text: `open since ${when(s.at, now)}`,
    tip: `${trades(m)}; in session since ${fmtStamp(s.at)}. ${late} ${calendarWords(m, true, "there is no session", cal)}`,
  };
  // a session of a day or more (the FX week) gives its end alone; a shorter one its two times of day
  const long = s.end.getTime() - s.at.getTime() >= 24 * 3600e3;
  return {
    kind: "session", at: s.at, market: m, scheduled: true,
    text: long ? `session to ${fmtDayTime(s.end)} SGT, scheduled` : `session ${fmtClock(s.at)}–${fmtClock(s.end)} SGT, scheduled`,
    tip: `${trades(m)}. Its timetable's session: ${fmtStamp(s.at)} to ${fmtStamp(s.end)}. ${late} ${calendarWords(m, false, "there is no session", cal)}`,
  };
}

// ---- an instrument that is only read in New York's hours (the reviewer's O-2, 21 Nov 2026) ----
/** Whether a row is read in New York's regular hours though New York's exchange is not its market. The instruments
 *  table gives the dollar index (ICE) and the Cboe yield and volatility indices (^FVX, ^TNX, ^TYX; VIX, VXN) the market
 *  NYSE: the server reads them, and calls them live, while New York is open. That is the Monitor's reading schedule,
 *  not their venue's session, and the Monitor holds neither Cboe's nor ICE's hours. So: a row whose market is NYSE and
 *  whose class is not Equities (New York's regular session is the market of US stocks and equity indices). */
export const readInNewYork = (r: { market?: string | null; cls?: string | null }): boolean => r.market === "NYSE" && !!r.cls && r.cls !== "Equities";
/** Such a row while New York is shut: when the Monitor next reads it. Nothing is said of its own market. */
function readNote(n: SessionNote, now: Date): SessionNote {
  const ny = n.market;
  return {
    kind: "read", at: n.at, market: ny, scheduled: n.scheduled,
    text: `next read ${when(n.at, now)}${n.scheduled ? ", scheduled" : ""}`,
    tip: `The Monitor reads this instrument during New York's regular session (${hoursText(ny)}${EARLY_CLOSES[ny.id] ? "; to 13:00 on NYSE's early closes" : ""}). New York's exchange is not its market, and the Monitor does not hold its own market's hours: it is called neither open nor closed here. Next read ${fmtStamp(n.at)}${n.scheduled ? ", by the timetable" : ""}.`,
  };
}

/** A market by the session table, now: shut with when it opens, or in its hours with since when. While the calendar
 *  of a market whose holidays the Monitor holds is still on its way, its hours alone are read and no line is given:
 *  today could be a holiday there. */
export function marketSession(id: string | null | undefined, now: Date = new Date(), cal: Cal = calNow()): RowSession {
  const m = marketOf(id);
  if (!m || m.id === "CRYPTO") return { now: "unknown", note: null };
  const waiting = cal.state === "wait" && !!HOLIDAY_SOURCES[m.id];
  if (marketStatus(m, now, cal.holidays).state === "OPEN") {
    const s = waiting ? null : openSince(m, now, cal.holidays, cal.state);
    return { now: waiting ? "unknown" : "open", note: s ? sinceNote(m, s, now, cal) : null };
  }
  const n = waiting ? null : nextOpen(m, now, cal.holidays, cal.state);
  return { now: "closed", note: n ? opensNote(m, n, now, cal) : null };
}
/** What a row needs for its session: its market, whether it is live, its provider, and (for an instrument that is
 *  only read in New York's hours) its class. */
export interface SessionRow { market?: string | null; live: boolean; source?: string | null; cls?: string | null }
/** A row of the market table: nothing for a live row or an official yield; for an instrument that is only read in New
 *  York's hours, when it is next read and nothing of its market ("unknown"); otherwise its market's session. */
export function rowSession(r: SessionRow, now: Date = new Date(), cal: Cal = calNow()): RowSession {
  if (isOfficialRow(r)) return { now: "unknown", note: null };
  if (r.live) return { now: "open", note: null };
  if (readInNewYork(r)) { const ny = marketSession("NYSE", now, cal); return { now: "unknown", note: ny.now === "closed" && ny.note ? readNote(ny.note, now) : null }; }
  return marketSession(r.market, now, cal);
}
/** Why a market is shut, as a phone line's state word (the designer's D-65, 21 Nov 2026: the reasons were in tooltips,
 *  and a phone has none): "Holiday", "Midday break" ("Daily break" for Globex), "Closed early"; "Closed" where it is
 *  shut by its hours. One word or two, so the line stays one line beside "opens 24 Nov 08:00 SGT". */
export const closedWord = (n: Pick<SessionNote, "why" | "market"> | null | undefined): string =>
  (n?.why === "holiday" ? "Holiday" : n?.why === "break" ? (n.market.id === "CME" ? "Daily break" : "Midday break") : n?.why === "early" ? "Closed early" : "Closed");
/** A row's state in a word or two, for a phone's line and a tooltip: "Closed", or why it is shut where the Monitor
 *  knows ("Holiday", "Midday break", "Closed early"); in its timetable's hours "Delayed ~20m" while the session's
 *  first print is due and "No new print" after; null where the Monitor says neither (the caller then says what the
 *  figure is as of). */
export function stateWord(s: RowSession): string | null {
  if (s.now === "closed") return closedWord(s.note);
  if (s.now !== "open") return null;
  return s.note?.kind === "due" ? delayed(s.note.market.delayMin) : "No new print";   // the same words as a live row's delay mark (lib/labels.ts)
}
/** Whether a row holds an old price while its market's timetable has a session: not live, the session's first
 *  minutes on a delayed feed over. The phone's line then reads what the figure is as of, "Last print 08:40", and that
 *  and a tile's LAST PRINT are amber (the designer's D-66). A row the Monitor only reads in New York's hours is never
 *  in this state: its print is not late. */
export const staleInSession = (s: RowSession): boolean => s.now === "open" && !!s.note && s.note.kind !== "due";
/** The holidays a next open passes over, short: "23 Nov: holiday", "31 Dec, 1 Jan: holidays"; null for none. */
export const skippedWords = (n: Pick<SessionNote, "skipped"> | null | undefined): string | null => (n?.skipped?.length ? `${n.skipped.map((d) => fmtDayMon(d)).join(", ")}: ${n.skipped.length === 1 ? "holiday" : "holidays"}` : null);
/** The same in full, for an opened phone row and a tooltip: "23 Nov 2026: a holiday in JPX's calendar". */
const skippedFull = (n: SessionNote): string | null => (n.skipped?.length ? `${n.skipped.map((d) => fmtDate(d)).join(", ")}: ${n.skipped.length === 1 ? "a holiday" : "holidays"} in ${calendarOf(n.market)}` : null);
/** Why a market is shut, in full: "a holiday in JPX's calendar", "its midday break", "an early close today, at 13:00 ET". */
function whyFull(n: SessionNote, now: Date, cal: Cal): string | null {
  if (n.why === "holiday") return `a holiday in ${calendarOf(n.market)}`;
  if (n.why === "break") return n.market.id === "CME" ? "its daily break" : "its midday break";
  if (n.why !== "early") return null;
  const early = EARLY_CLOSES[n.market.id]?.[marketStatus(n.market, now, cal.holidays).localDate];
  return early != null ? `an early close today, at ${hhmm(early)} ${zone(n.market)}` : "an early close today";
}
/** The line beside CLOSED on a page's own chart (a stock's, an instrument's, EQUITIES' index; D-65): the reason first,
 *  then the opening, then a holiday it passes over: "holiday · opens 24 Nov 08:00 SGT", "midday break · opens 11:30
 *  SGT", "early close · opens 30 Nov 22:30 SGT", "opens 24 Nov 08:00 SGT · 23 Nov: holiday". Any other note as it is. */
export function pageLine(n: SessionNote): string {
  if (n.kind !== "opens") return n.text;
  const why = whyWord(n), skip = skippedWords(n);
  return `${why ? `${why} · ` : ""}${n.text}${skip ? ` · ${skip}` : ""}`;
}
/** The same for a row's tooltip and an opened phone row: " · market open", " · market closed · opens 23 Nov 22:30 SGT",
 *  " · market closed: a holiday in JPX's calendar · opens 24 Nov 08:00 SGT", " · market closed · opens 24 Nov 08:00 SGT
 *  · 23 Nov 2026: a holiday in JPX's calendar", " · delayed ~20m · first print due ~08:20 SGT", " · no new print · open
 *  since 08:00 SGT", " · next read 22:30 SGT"; nothing for an official yield or a market the table does not keep. */
export function rowStateWords(r: SessionRow, now: Date = new Date(), cal: Cal = calNow()): string {
  if (isOfficialRow(r)) return "";
  if (r.live) return " · market open";
  const s = rowSession(r, now, cal), w = stateWord(s), note = s.note ? ` · ${s.note.text}` : "";
  if (s.now !== "closed") return w ? ` · ${w.toLowerCase()}${note}` : note;
  const why = s.note ? whyFull(s.note, now, cal) : null, skip = s.note ? skippedFull(s.note) : null;
  return ` · market closed${why ? `: ${why}` : ""}${note}${skip ? ` · ${skip}` : ""}`;
}

// ---- rows whose `live` the server does not send: a stock's page, an instrument outside the market table ----
/** How old a print may be, beyond its feed's delay, for the page to call it live: the server keeps a stock's quote ten
 *  minutes and the page asks every five (the server's own rule for a market-table row is the delay plus fifteen). */
export const PAGE_FRESH_MIN = 30;
/** Whether a print is live by the page's own reading: its market in its regular hours, and the print recent. */
export function pageLive(market: string | null | undefined, lastAt: string | null | undefined, now: Date = new Date(), holidays: HolidayMap = holidaysNow()): boolean {
  const m = marketOf(market), t = lastAt ? Date.parse(lastAt) : NaN;
  if (!m || !Number.isFinite(t) || /T00:00:00(\.000)?Z$/.test(lastAt ?? "")) return false;   // a booked close has a date, no time of day
  return marketStatus(m, now, holidays).state === "OPEN" && (now.getTime() - t) / 60000 < m.delayMin + PAGE_FRESH_MIN;
}
/** The market of a symbol the Monitor's table does not carry, where the symbol itself says it: a currency pair
 *  trades the FX week, a coin never stops, a stock is on the exchange of its suffix. Null otherwise: an index or a
 *  future from the search can be anywhere, and the Monitor then says nothing of its hours. */
export function symbolMarket(symbol: string): MarketId | null {
  if (/=X$/.test(symbol)) return "FX";
  if (/-USD$/.test(symbol)) return "CRYPTO";
  return stockMarket(symbol);
}

// ---- a panel's rows: one line for the markets that are shut (the designer's D-62, 21 Nov 2026; A-41, B-35) ----
// "Closed now: New York opens 22:30 SGT · Seoul opens 23 Nov 08:00 SGT, scheduled · Hong Kong and Shanghai open 23 Nov
// 09:30 SGT, scheduled · Tokyo (holiday) opens 24 Nov 08:00 SGT · next read 22:30 SGT: VIX, DXY, UST 10Y": above the
// table on MARKETS, RATES & FX's FX and WATCHLIST's MY NAMES, in both computer layouts, and above a phone's WATCHLIST
// list. The markets are those of the panel's own rows, the soonest to open first; markets that open at the same moment
// share one entry; where the Monitor knows why a market is shut beyond its hours (a holiday in the calendar it holds,
// its break, an early close today) the reason stands in brackets. The rows the Monitor only reads in New York's hours
// (lib readInNewYork) end the line while New York is shut. Nothing when no market of the rows is shut.
/** What a row gives the line: its market by the session table (null: none kept), or that it is only read in New York's
 *  hours (`read`: its short name; `live`: it is being read now). */
export interface PanelRow { market?: string | null; read?: string | null; live?: boolean }
/** One entry of the line: the markets that open at the same moment, for the same reason. */
export interface ShutEntry {
  names: string[]; why: string | null; when: string; at: Date; scheduled: boolean; tip: string;
  /** The markets ("Hong Kong and Shanghai"), what follows them (" (holiday) opens 24 Nov 08:00 SGT"), and the two together. */
  label: string; rest: string; text: string;
}
/** `lead`: what stands before the entries, "Closed now: "; nothing where no market is shut and the line is the next
 *  read alone. */
export interface ClosedLine { lead: string; entries: ShutEntry[]; read: { lead: string; names: string[]; text: string; tip: string } | null }
/** The reason in the line's brackets: "holiday", "midday break" ("daily break" for Globex), "early close". */
export const whyWord = (n: Pick<SessionNote, "why" | "market">): string | null => (n.why === "holiday" ? "holiday" : n.why === "break" ? (n.market.id === "CME" ? "daily break" : "midday break") : n.why === "early" ? "early close" : null);
const listed = (xs: string[]): string => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** The line of a panel's rows: the markets that are shut, each with when it opens, then the rows that are only read in
 *  New York's hours with when they are next read. Where no market of the rows is shut but such a row is not being
 *  priced (RATES & FX's FX panel on a weekday: the FX week runs, New York is shut and the dollar index holds last
 *  night's print), the line is that last part alone, "Next read 22:30 SGT: DXY" (the designer's note of 21 Nov 2026: the
 *  panel said nothing then). Null when every row is being priced. */
export function closedLine(rows: PanelRow[], now: Date = new Date(), cal: Cal = calNow()): ClosedLine | null {
  const shut = shutMarkets(rows.filter((r) => !r.read).map((r) => r.market), now, cal);
  const entries: ShutEntry[] = [];
  for (const n of shut) {
    // a holiday the opening passes over stands after it, in brackets (D-65): "Tokyo opens 24 Nov 08:00 SGT (23 Nov: holiday)"
    const why = whyWord(n), skip = skippedWords(n), when2 = `${n.text.replace(/^opens /, "")}${skip ? ` (${skip})` : ""}`;
    const e = entries.find((x) => x.at.getTime() === n.at.getTime() && x.scheduled === n.scheduled && x.why === why && x.when === when2);
    if (e) { e.names.push(n.market.name); e.tip = `${e.tip}\n${n.tip}`; }
    else entries.push({ names: [n.market.name], why, when: when2, label: "", rest: "", text: "", tip: n.tip, at: n.at, scheduled: n.scheduled });
  }
  for (const e of entries) { e.label = listed(e.names); e.rest = `${e.why ? ` (${e.why})` : ""} ${e.names.length > 1 ? "open" : "opens"} ${e.when}`; e.text = e.label + e.rest; }
  // the rows read in New York's hours, while New York is shut and none of them is being read
  const names = [...new Set(rows.filter((r) => r.read && !r.live).map((r) => r.read!))], ny = names.length ? marketSession("NYSE", now, cal) : null;
  const rd = ny && ny.now === "closed" && ny.note ? readNote(ny.note, now) : null;
  if (!entries.length && !rd) return null;
  const lone = !entries.length, words = rd ? (lone ? rd.text.replace(/^next read/, "Next read") : rd.text) : "";
  return { lead: lone ? "" : "Closed now: ", entries, read: rd ? { lead: `${words}: `, names, text: `${words}: ${names.join(", ")}`, tip: rd.tip } : null };
}
/** A market-table row for the line: nothing for an official yield (it has no session); a row the Monitor only reads in
 *  New York's hours by its short name; any other by its market. */
export const panelRowOf = (r: SessionRow & { symbol: string; name: string }): PanelRow => (isOfficialRow(r) ? {} : readInNewYork(r) ? { read: shortName(r.symbol, r.name), live: r.live } : { market: r.market });
/** The line as text: "Closed now: New York opens 22:30 SGT · … · next read 22:30 SGT: VIX, DXY, UST 10Y". */
export const closedLineText = (c: ClosedLine): string => `${c.lead}${[...c.entries.map((e) => e.text), ...(c.read ? [c.read.text] : [])].join(" · ")}`;

// ---- a list of markets: each that is shut, with when it opens ----
/** The markets among `ids` that are shut now, each with when it opens, the soonest first. */
export function shutMarkets(ids: Array<string | null | undefined>, now: Date = new Date(), cal: Cal = calNow()): SessionNote[] {
  const out: SessionNote[] = [];
  for (const id of new Set(ids)) { const s = marketSession(id, now, cal); if (s.now === "closed" && s.note) out.push(s.note); }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime() || a.market.name.localeCompare(b.market.name));
}
/** "New York opens 23 Nov 22:30 SGT · Tokyo opens 24 Nov 08:00 SGT · Hong Kong opens 23 Nov 09:30 SGT, scheduled". */
export const shutLine = (notes: SessionNote[]): string => notes.map((n) => `${n.market.name} ${n.text}`).join(" · ");
