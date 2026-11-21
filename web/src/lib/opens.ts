// When a closed market opens (the owner's request of 20 Nov 2026). At 21:16 SGT on a Friday the Monitor said the US
// market was closed and did not say that New York opens at 22:30 SGT (09:30 there, since its clocks went back on
// 1 Nov). So wherever the Monitor says CLOSED it now says when that market next opens, in SGT, in its own time format:
// "opens 22:30 SGT" when that is today in Singapore, "opens 23 Nov 22:30 SGT" on another day.
//   - The time is the start of the market's next regular session in the session table (lib/sessions.ts), worked out in
//     the market's own time zone, so a change of clocks there moves it by itself.
//   - No guesses: a holiday in the calendar the Monitor holds (Tokyo's from JPX, New York's from NYSE) is passed over.
//     For a market whose holidays it does not hold, the line ends ", scheduled": the time the timetable gives, on a
//     local holiday the market stays shut.
//   - A row that is not live while its market is in its regular hours (a delayed feed's first minutes, a feed that has
//     stopped, a holiday the Monitor does not know) is not called CLOSED: it says LAST PRINT and "open since 08:00 SGT".
//   - An official yield is published once a day and has no session: nothing is said of it. Crypto never closes.
import { calendarState, EARLY_CLOSES, HOLIDAY_SOURCES, holidaysNow, marketOf, marketStatus, nextOpen, openSince, stockMarket, type HolidayMap, type Market, type MarketId, type NextOpen } from "./sessions";
import { fmtDate, fmtStamp, fmtWhen, isOfficialRow, TZ_ABBR } from "./time";

/** What the session table says of a market now: shut, in its regular hours, or not known to it (no such market in the
 *  table, one that never closes, or one whose calendar has not arrived yet). */
export type SessionNow = "closed" | "open" | "unknown";
export interface SessionNote {
  /** "opens": the market is shut, and this is when it next opens. "since": it is in its regular hours, since then. */
  kind: "opens" | "since";
  /** "opens 22:30 SGT", "opens 23 Nov 22:30 SGT", "opens 23 Nov 09:30 SGT, scheduled", "open since 08:00 SGT". */
  text: string;
  /** The whole of it for a tooltip: the market, its hours, why it is shut, whose calendar. */
  tip: string;
  /** True when the Monitor does not hold the market's holidays for that day: the time is the timetable's. */
  scheduled: boolean;
  at: Date;
  market: Market;
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
  if (m.id === "FX") return "Monday 05:00 to Saturday 06:00 SGT";
  if (m.id === "CME") return "Sunday 18:00 to Friday 17:00 ET, with a break from 17:00 to 18:00 each day";
  return `${m.sessions.map(([a, b]) => `${hhmm(a)}–${hhmm(b)}`).join(", ")} ${zone(m)}`;
}
/** The calendar a holiday is from, by its publisher's name. */
const calendarOf = (m: Market): string => (HOLIDAY_SOURCES[m.id] ? `${HOLIDAY_SOURCES[m.id]!.publisher}'s calendar` : "the Monitor's calendar");
/** Whose calendar stands behind a time, or why it is only the scheduled one (`then`: what a holiday would mean). */
function calendarWords(m: Market, firm: boolean, then: string, cal: Cal): string {
  const src = HOLIDAY_SOURCES[m.id];
  if (firm && src) return `Holidays${EARLY_CLOSES[m.id] ? " and early closes" : ""}: ${src.publisher}'s calendar.`;
  if (!src) return `The Monitor does not hold this market's holidays: on one ${then}.`;
  if (cal.state !== "ok") return `The holiday calendar (${src.publisher}'s) could not be loaded: on a holiday ${then}.`;
  return `The Monitor holds ${src.publisher}'s calendar to ${fmtDate(src.through)}: on a holiday after it ${then}.`;
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
    kind: "opens", at: n.at, market: m, scheduled: !n.firm,
    text: `opens ${when(n.at, now)}${n.firm ? "" : ", scheduled"}`,
    tip: `${trades(m)}. ${why}${skipped}${n.firm ? "Next opens" : "Scheduled to open"} ${fmtStamp(n.at)}. ${calendarWords(m, n.firm, "the market stays shut", cal)}`,
  };
}
function sinceNote(m: Market, s: { at: Date; firm: boolean }, now: Date, cal: Cal): SessionNote {
  return {
    kind: "since", at: s.at, market: m, scheduled: !s.firm,
    text: `open since ${when(s.at, now)}${s.firm ? "" : ", scheduled"}`,
    tip: `${trades(m)}; in session since ${fmtStamp(s.at)}. The last print the Monitor has is older than a live one${m.delayMin > 0 ? `; this feed is delayed about ${m.delayMin} minutes` : ""}. ${calendarWords(m, s.firm, "there is no session", cal)}`,
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
/** A row of the market table: nothing for a live row or an official yield; otherwise its market's session. */
export function rowSession(r: { market?: string | null; live: boolean; source?: string | null }, now: Date = new Date(), cal: Cal = calNow()): RowSession {
  if (isOfficialRow(r)) return { now: "unknown", note: null };
  if (r.live) return { now: "open", note: null };
  return marketSession(r.market, now, cal);
}
/** The same for a row's tooltip: " · market open", " · market closed · opens 23 Nov 22:30 SGT",
 *  " · no new print · open since 08:00 SGT"; nothing for an official yield or a market the table does not keep. */
export function rowStateWords(r: { market?: string | null; live: boolean; source?: string | null }, now: Date = new Date(), cal: Cal = calNow()): string {
  if (isOfficialRow(r)) return "";
  if (r.live) return " · market open";
  const s = rowSession(r, now, cal);
  return s.now === "closed" ? ` · market closed${s.note ? ` · ${s.note.text}` : ""}` : s.now === "open" ? ` · no new print${s.note ? ` · ${s.note.text}` : ""}` : "";
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

// ---- a list of names (WATCHLIST): one line for the markets that are shut ----
/** The markets among `ids` that are shut now, each with when it opens, the soonest first. */
export function shutMarkets(ids: Array<string | null | undefined>, now: Date = new Date(), cal: Cal = calNow()): SessionNote[] {
  const out: SessionNote[] = [];
  for (const id of new Set(ids)) { const s = marketSession(id, now, cal); if (s.now === "closed" && s.note) out.push(s.note); }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime() || a.market.name.localeCompare(b.market.name));
}
/** "New York opens 23 Nov 22:30 SGT · Tokyo opens 24 Nov 08:00 SGT · Hong Kong opens 23 Nov 09:30 SGT, scheduled". */
export const shutLine = (notes: SessionNote[]): string => notes.map((n) => `${n.market.name} ${n.text}`).join(" · ");
