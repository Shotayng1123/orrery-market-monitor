// Exchange sessions. Decides which markets are open right now (for the refresh cadence and the top-bar
// chips) and when a market that is shut next opens (the line beside every CLOSED: the owner's request of
// 20 Nov 2026). Hours are the exchanges' published regular sessions, each kept in its own time zone, so
// daylight saving is followed by the zone itself; the FX week and CME Globex are kept by New York's clock.
// Holidays come from the API's calendar (`sessions_cal`) and are merged in with setHolidays(). Until that
// loads, weekends are the only closures, and the chip tooltip says so. The server keeps the same table and
// the same rules (supabase/functions/_shared/sessions.ts); sim/logic.test.ts checks that the two agree, and
// that both give the FX week as the server's own rule for when currencies trade does (feedhealth.ts fxTrading).
import { partsIn, SGT } from "./time";

export type MarketId = "TSE" | "HKEX" | "SSE" | "KRX" | "TWSE" | "NSE" | "SGX" | "ASX" | "XETRA" | "SIX" | "LSE" | "NYSE" | "B3" | "BMV" | "CME" | "FX" | "CRYPTO";
export type MarketState = "OPEN" | "BREAK" | "CLOSED" | "HOLIDAY";

export interface Market {
  id: MarketId;
  name: string;
  tz: string;
  /** Regular sessions as [startMinute, endMinute] in local time; two entries when there is a lunch break. */
  sessions: Array<[number, number]>;
  /** Weekdays (0 = Sunday) on which the market trades. */
  days: number[];
  /** Feed delay in minutes on the chart endpoint (declared per exchange; Yahoo does not report it). */
  delayMin: number;
}

const hm = (h: number, m = 0) => h * 60 + m;
const MF = [1, 2, 3, 4, 5];

export const MARKETS: Market[] = [
  { id: "TSE", name: "Tokyo", tz: "Asia/Tokyo", sessions: [[hm(9), hm(11, 30)], [hm(12, 30), hm(15, 30)]], days: MF, delayMin: 20 },
  { id: "HKEX", name: "Hong Kong", tz: "Asia/Hong_Kong", sessions: [[hm(9, 30), hm(12)], [hm(13), hm(16)]], days: MF, delayMin: 15 },
  { id: "SSE", name: "Shanghai", tz: "Asia/Shanghai", sessions: [[hm(9, 30), hm(11, 30)], [hm(13), hm(15)]], days: MF, delayMin: 15 },
  { id: "KRX", name: "Seoul", tz: "Asia/Seoul", sessions: [[hm(9), hm(15, 30)]], days: MF, delayMin: 20 },
  { id: "TWSE", name: "Taipei", tz: "Asia/Taipei", sessions: [[hm(9), hm(13, 30)]], days: MF, delayMin: 20 },
  { id: "NSE", name: "Mumbai", tz: "Asia/Kolkata", sessions: [[hm(9, 15), hm(15, 30)]], days: MF, delayMin: 15 },
  { id: "SGX", name: "Singapore", tz: "Asia/Singapore", sessions: [[hm(9), hm(12)], [hm(13), hm(17)]], days: MF, delayMin: 20 },
  { id: "XETRA", name: "Frankfurt", tz: "Europe/Berlin", sessions: [[hm(9), hm(17, 30)]], days: MF, delayMin: 15 },
  { id: "ASX", name: "Sydney", tz: "Australia/Sydney", sessions: [[hm(10), hm(16)]], days: MF, delayMin: 20 },
  { id: "SIX", name: "Zurich", tz: "Europe/Zurich", sessions: [[hm(9), hm(17, 30)]], days: MF, delayMin: 15 },
  { id: "LSE", name: "London", tz: "Europe/London", sessions: [[hm(8), hm(16, 30)]], days: MF, delayMin: 15 },
  { id: "NYSE", name: "New York", tz: "America/New_York", sessions: [[hm(9, 30), hm(16)]], days: MF, delayMin: 0 },
  // CME Globex: Sunday 18:00 to Friday 17:00 ET with a daily 17:00–18:00 maintenance break.
  { id: "CME", name: "CME Globex", tz: "America/New_York", sessions: [[hm(0), hm(17)], [hm(18), hm(24)]], days: [0, 1, 2, 3, 4, 5], delayMin: 10 },
  { id: "B3", name: "São Paulo", tz: "America/Sao_Paulo", sessions: [[hm(10), hm(17)]], days: MF, delayMin: 15 },
  { id: "BMV", name: "Mexico City", tz: "America/Mexico_City", sessions: [[hm(8, 30), hm(15)]], days: MF, delayMin: 20 },
  // Spot FX: one session a week, kept by New York's clock (FX_TZ, FX_BELL below): from Sunday 17:00 there to Friday
  // 17:00. This row's `tz`, `sessions` and `days` are not read for it (marketStatus, nextOpen and openSince keep the week).
  { id: "FX", name: "FX", tz: SGT, sessions: [[hm(0), hm(24)]], days: [1, 2, 3, 4, 5, 6], delayMin: 0 },
  { id: "CRYPTO", name: "Crypto", tz: "UTC", sessions: [[hm(0), hm(24)]], days: [0, 1, 2, 3, 4, 5, 6], delayMin: 0 },
];

// ---- what the Monitor knows of each market's calendar, and from whom (20 Nov 2026) ----
// Holidays. The dates themselves are rows of the server's `sessions_cal` (the page receives them with `health`);
// nothing here is a date from memory. For the two markets below the Monitor holds every holiday of 2026 and 2027,
// checked against the publisher's own page on 7 Nov 2026 (supabase/migrations/20261107000010_holidays_verified.sql:
// "JPX … (2026 and 2027 tables)", "NYSE … (2026 and 2027 columns)"). `through` is the last day those tables cover: a
// next open on or before it is said plainly; after it, and for every other market, it is the scheduled time only.
// NYSE's page was read again by the source-probe `pf_rules` on 20 Nov 2026, 12:41 UTC (run 44737850579), which printed:
//   "All NYSE markets observe U.S. holidays as listed below for 2026, 2027, and 2028."
//   "Thanksgiving Day | Thursday, November 26*** | Thursday, November 25*** | Thursday, November 23*** |"
//   "Christmas Day | Friday, December 25**** | Friday, December 24 (Christmas Day observed) | Monday, December 25 |"
// (the same days as the rows of 2026 and 2027; that probe printed four of the page's rows, so 2028 is not held).
// The same probe read the Bank of Japan's holiday page and JPX's trading-hours pages: it printed their headings and
// the session hours ("Morning session is from 9:00 am to 11:30 am, while afternoon session is from 12:30 pm to
// 3:30 pm"), not the holiday dates, so Tokyo's days rest on the check of 7 Nov 2026 alone.
export interface HolidaySource { publisher: string; page: string; read: string; through: string }
export const HOLIDAY_SOURCES: Partial<Record<MarketId, HolidaySource>> = {
  TSE: { publisher: "JPX", page: "https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html", read: "2026-11-07", through: "2027-12-31" },
  NYSE: { publisher: "NYSE", page: "https://www.nyse.com/trade/hours-calendars", read: "2026-11-07", through: "2027-12-31" },
};
// Early closes: the minute (local time) a market's regular session ends on a day it closes early. NYSE's, as its page
// "Holidays & Trading Hours" gave them to the probe of 20 Nov 2026 (above); its three lines, word for word:
//   "** Each market will close early at 1:00 p.m. (1:15 p.m. for eligible options) on Monday, July 3, 2028. …"
//   "*** Each market will close early at 1:00 p.m. (1:15 p.m. for eligible options) on Friday, November 27, 2026,
//    Friday, November 26, 2027, and Friday, November 24, 2028 (the day after Thanksgiving). …"
//   "**** Each market will close early at 1:00 p.m. (1:15 p.m. for eligible options) on Thursday, December 24, 2026. …"
// "All times are Eastern Time." No other market's early closes are known here (CME's pages refused the probe).
// The paper portfolio's P-2 moves these into the database (`sessions_cal.early_close`); until then they are kept here
// and, the same, in the server's copy.
export const EARLY_CLOSES: Partial<Record<MarketId, Record<string, number>>> = {
  NYSE: { "2026-11-27": hm(13), "2026-12-24": hm(13), "2027-11-26": hm(13), "2028-07-03": hm(13), "2028-11-24": hm(13) },
};
/** The minute (local time) the market's regular session ends on the local date `ymd`: an early close where one is
 *  known, otherwise the end of its last session. */
export const dayEnd = (m: Market, ymd: string): number => EARLY_CLOSES[m.id]?.[ymd] ?? m.sessions[m.sessions.length - 1][1];

export type HolidayMap = Partial<Record<MarketId, Set<string>>>;
let HOLIDAYS: HolidayMap = {};
/** The calendar: not asked for yet or on its way ("wait"), received ("ok"), or asked for and not received ("none"). */
let calendar: "wait" | "ok" | "none" = "wait";
export function setHolidays(h: Partial<Record<MarketId, string[]>>): void {
  HOLIDAYS = Object.fromEntries(Object.entries(h).map(([k, v]) => [k, new Set(v)])) as typeof HOLIDAYS;
  calendar = "ok";
}
/** The calendar was asked for and did not come (no connection, a server error): a calendar received earlier stays. */
export function noHolidays(): void { if (calendar === "wait") calendar = "none"; }
export const haveHolidays = () => calendar === "ok";
export const calendarState = (): "wait" | "ok" | "none" => calendar;
export const holidaysNow = (): HolidayMap => HOLIDAYS;

// ---- the FX week (the reviewer's O-1, 21 Nov 2026) ----
// Currencies trade from Sunday 17:00 New York to Friday 17:00 New York: the Monitor's own rule since 19 Nov 2026
// (the server's fxTrading in feedhealth.ts, which the feed's health and the booking of a pair's day already follow;
// supabase/README.md). In Singapore that is Monday 06:00 to Saturday 06:00 while New York is on winter time, and
// Monday 05:00 to Saturday 05:00 on its summer time. Until 21 Nov 2026 this table kept the week in SGT, Monday 05:00
// to Saturday 06:00 all year: an hour early at the open in New York's winter, an hour late at the close in its summer.
// What the feed itself does at the two ends of the week is not in any log yet (jobs/probes/sessions_check.ts reads it).
export const FX_TZ = "America/New_York", FX_BELL = hm(17);
/** Whether the FX week is in progress at `now`: not from Friday 17:00 New York to Sunday 17:00. */
const fxOpen = (now: Date): boolean => { const p = partsIn(FX_TZ, now), minute = p.h * 60 + p.m; return !(p.wd === 6 || (p.wd === 5 && minute >= FX_BELL) || (p.wd === 0 && minute < FX_BELL)); };

export interface MarketStatus { market: Market; state: MarketState; local: string; localDate: string }

export function marketStatus(m: Market, now: Date = new Date(), holidays: HolidayMap = HOLIDAYS): MarketStatus {
  const p = partsIn(m.tz, now);
  const local = `${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}`;
  const base = { market: m, local, localDate: p.ymd };
  const minute = p.h * 60 + p.m;
  if (m.id === "FX") return { ...base, state: fxOpen(now) ? "OPEN" : "CLOSED" };   // Sunday 17:00 to Friday 17:00, New York
  if (m.id === "CME") {
    const open = (p.wd >= 1 && p.wd <= 4 && (minute < hm(17) || minute >= hm(18))) || (p.wd === 5 && minute < hm(17)) || (p.wd === 0 && minute >= hm(18));
    return { ...base, state: open ? "OPEN" : "CLOSED" };
  }
  if (!m.days.includes(p.wd)) return { ...base, state: "CLOSED" };
  if (holidays[m.id]?.has(p.ymd)) return { ...base, state: "HOLIDAY" };
  const first = m.sessions[0][0], last = dayEnd(m, p.ymd);   // an early close ends the day's last session sooner
  if (minute < first || minute >= last) return { ...base, state: "CLOSED" };
  for (const [a, b] of m.sessions) if (minute >= a && minute < Math.min(b, last)) return { ...base, state: "OPEN" };
  return { ...base, state: "BREAK" };
}

export const allStatuses = (now: Date = new Date()): MarketStatus[] => MARKETS.map((m) => marketStatus(m, now));

/** True when any tracked market (including FX and futures) is open. Drives the 60 s refresh. */
export const anyOpen = (now: Date = new Date()): boolean => allStatuses(now).some((s) => s.state === "OPEN");

export const marketById = (id: MarketId): Market => MARKETS.find((m) => m.id === id)!;
/** The market of an id as a row gives it, or null: a row can name a market this table does not keep, or none. */
export const marketOf = (id: string | null | undefined): Market | null => MARKETS.find((m) => m.id === id) ?? null;

// ---- a single stock's market, read from its symbol: the server's rule (supabase/functions/_shared/moves.ts) ----
const SUFFIX: Record<string, MarketId> = { T: "TSE", HK: "HKEX", KS: "KRX", KQ: "KRX", SS: "SSE", SZ: "SSE", TW: "TWSE", TWO: "TWSE", NS: "NSE", BO: "NSE", SI: "SGX", AX: "ASX", DE: "XETRA", F: "XETRA", SW: "SIX", L: "LSE", SA: "B3", MX: "BMV" };
/** The exchange a single stock trades on, by its Yahoo symbol: the suffix (7203.T, 0700.HK), or none for a US ticker
 *  (NVDA, BRK-B). Null for what is not a stock (^N225, USDJPY=X, GC=F, BTC-USD) and for an exchange the Monitor keeps
 *  no session times for (MC.PA): of those it says neither CLOSED nor when they open. */
export function stockMarket(symbol: string): MarketId | null {
  if (!symbol || /^\^|=|-USD$/.test(symbol)) return null;
  const m = symbol.match(/\.([A-Z]{1,3})$/);
  if (m) return SUFFIX[m[1]] ?? null;
  return /^[A-Z][A-Z0-9-]{0,6}$/.test(symbol) ? "NYSE" : null;
}

// ---- when a market that is shut next opens (20 Nov 2026) ----
/** The moment (ms) that is `minute` minutes after midnight of the local date `ymd` in time zone `tz`: the zone's own
 *  offset on that day, so a session's hour stays its local hour across a change of clocks. */
export function zonedMs(tz: string, ymd: string, minute: number): number {
  const [y, mo, d] = ymd.split("-").map(Number), want = Date.UTC(y, mo - 1, d, 0, minute);
  let t = want;
  for (let k = 0; k < 3; k++) { const p = partsIn(tz, new Date(t)); t += want - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.m); }
  return t;
}
const addDays = (ymd: string, k: number): string => { const [y, mo, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, mo - 1, d + k)).toISOString().slice(0, 10); };
const weekdayOf = (ymd: string): number => { const [y, mo, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); };

/** Whether the Monitor knows this market's holidays on the local date `ymd`: it holds the publisher's calendar for
 *  that day (HOLIDAY_SOURCES), and the calendar in hand carries the market. */
export function holidaysKnown(m: Market, ymd: string, holidays: HolidayMap = HOLIDAYS, state: "wait" | "ok" | "none" = calendar): boolean {
  const src = HOLIDAY_SOURCES[m.id];
  return state === "ok" && !!src && ymd <= src.through && (holidays[m.id]?.size ?? 0) > 0;
}

export interface NextOpen {
  /** The moment the market's next regular session starts. */
  at: Date;
  /** Its date in the market's own zone. */
  day: string;
  /** True when the Monitor knows the market's holidays up to that day: the time is then said plainly. False: it is
   *  the scheduled time, and on a holiday the Monitor does not know the market stays shut. */
  firm: boolean;
  /** Why the market is shut now: its midday break, a holiday in the calendar, an early close today, or its hours. */
  why: "break" | "holiday" | "early" | "hours";
  /** The weekdays passed over because the calendar gives them as holidays (local dates). */
  skipped: string[];
}
/** When a market that is not open now next opens: the start of its next regular session, in its own time zone (so
 *  the change of clocks is the zone's), skipping weekends and the holidays of `holidays`. Null while the market is
 *  open, for one that never closes (crypto), and when no session is found in the next two weeks. */
export function nextOpen(m: Market, now: Date = new Date(), holidays: HolidayMap = HOLIDAYS, state: "wait" | "ok" | "none" = calendar): NextOpen | null {
  if (m.id === "CRYPTO") return null;
  const st = marketStatus(m, now, holidays).state;
  if (st === "OPEN") return null;
  if (m.id === "FX") {
    // the week opens on Sunday at 17:00 New York: Monday 06:00 SGT in New York's winter, 05:00 SGT in its summer
    const ny = partsIn(FX_TZ, now), mm = ny.h * 60 + ny.m;
    for (let k = 0; k <= 7; k++) { const ymd = addDays(ny.ymd, k); if (weekdayOf(ymd) === 0 && (k > 0 || mm < FX_BELL)) return { at: new Date(zonedMs(FX_TZ, ymd, FX_BELL)), day: ymd, firm: false, why: "hours", skipped: [] }; }
    return null;
  }
  const p = partsIn(m.tz, now), minute = p.h * 60 + p.m;
  if (m.id === "CME") {
    // Globex opens at 18:00 New York time, Sunday to Thursday
    for (let k = 0; k <= 7; k++) { const ymd = addDays(p.ymd, k), wd = weekdayOf(ymd); if (wd <= 4 && (k > 0 || minute < hm(18))) return { at: new Date(zonedMs(m.tz, ymd, hm(18))), day: ymd, firm: false, why: p.wd >= 1 && p.wd <= 4 ? "break" : "hours", skipped: [] }; }
    return null;
  }
  const skipped: string[] = [];
  const early = EARLY_CLOSES[m.id]?.[p.ymd];
  const why: NextOpen["why"] = st === "BREAK" ? "break" : st === "HOLIDAY" ? "holiday" : early != null && m.days.includes(p.wd) && minute >= early && minute < m.sessions[m.sessions.length - 1][1] ? "early" : "hours";
  for (let k = 0; k <= 14; k++) {
    const ymd = addDays(p.ymd, k);
    if (!m.days.includes(weekdayOf(ymd))) continue;
    if (holidays[m.id]?.has(ymd)) { skipped.push(ymd); continue; }
    const end = dayEnd(m, ymd);
    for (const [a] of m.sessions) {
      if (a >= end) continue;                    // a session an early close leaves out
      if (k === 0 && a <= minute) continue;      // begun or over today
      return { at: new Date(zonedMs(m.tz, ymd, a)), day: ymd, firm: holidaysKnown(m, ymd, holidays, state), why, skipped };
    }
  }
  return null;
}

/** For a market whose timetable has a session in progress now: when that session began (`at`) and when it ends
 *  (`end`: an early close where one is known), and whether the Monitor knows that today is not a holiday there (`firm`,
 *  as in nextOpen). Null when it is not in a session, and for a market that never closes. */
export function openSince(m: Market, now: Date = new Date(), holidays: HolidayMap = HOLIDAYS, state: "wait" | "ok" | "none" = calendar): { at: Date; end: Date; firm: boolean } | null {
  if (m.id === "CRYPTO" || marketStatus(m, now, holidays).state !== "OPEN") return null;
  if (m.id === "FX") {
    // the week in progress: from the last Sunday 17:00 New York to the Friday 17:00 after it
    const ny = partsIn(FX_TZ, now), mm = ny.h * 60 + ny.m;
    for (let k = 0; k <= 7; k++) { const ymd = addDays(ny.ymd, -k); if (weekdayOf(ymd) === 0 && (k > 0 || mm >= FX_BELL)) return { at: new Date(zonedMs(FX_TZ, ymd, FX_BELL)), end: new Date(zonedMs(FX_TZ, addDays(ymd, 5), FX_BELL)), firm: false }; }
    return null;
  }
  const p = partsIn(m.tz, now), minute = p.h * 60 + p.m;
  if (m.id === "CME") { const from = minute >= hm(18) ? p.ymd : addDays(p.ymd, -1); return { at: new Date(zonedMs(m.tz, from, hm(18))), end: new Date(zonedMs(m.tz, addDays(from, 1), hm(17))), firm: false }; }
  const s = m.sessions.find(([a, b]) => minute >= a && minute < b);
  return s ? { at: new Date(zonedMs(m.tz, p.ymd, s[0])), end: new Date(zonedMs(m.tz, p.ymd, Math.min(s[1], dayEnd(m, p.ymd)))), firm: holidaysKnown(m, p.ymd, holidays, state) } : null;
}
