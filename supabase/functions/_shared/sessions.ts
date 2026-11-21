// Exchange sessions for the server side (same rules as web/src/lib/sessions.ts; keep the two in step:
// sim/logic.test.ts compares the two tables, their early closes and their states).
export type MarketId = "TSE" | "HKEX" | "SSE" | "KRX" | "TWSE" | "NSE" | "SGX" | "ASX" | "XETRA" | "SIX" | "LSE" | "NYSE" | "B3" | "BMV" | "CME" | "FX" | "CRYPTO";
export type MarketState = "OPEN" | "BREAK" | "CLOSED" | "HOLIDAY";
export interface Market { id: MarketId; name: string; tz: string; sessions: Array<[number, number]>; days: number[]; delayMin: number }

const hm = (h: number, m = 0) => h * 60 + m;
const MF = [1, 2, 3, 4, 5];
export const SGT = "Asia/Singapore";

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
  { id: "CME", name: "CME Globex", tz: "America/New_York", sessions: [[hm(0), hm(17)], [hm(18), hm(24)]], days: [0, 1, 2, 3, 4, 5], delayMin: 10 },
  { id: "B3", name: "São Paulo", tz: "America/Sao_Paulo", sessions: [[hm(10), hm(17)]], days: MF, delayMin: 15 },
  { id: "BMV", name: "Mexico City", tz: "America/Mexico_City", sessions: [[hm(8, 30), hm(15)]], days: MF, delayMin: 20 },
  // Spot FX: one session a week by New York's clock, Sunday 17:00 to Friday 17:00 there (marketState below); this
  // row's `tz`, `sessions` and `days` are not read for it.
  { id: "FX", name: "FX", tz: SGT, sessions: [[hm(0), hm(24)]], days: [1, 2, 3, 4, 5, 6], delayMin: 0 },
  { id: "CRYPTO", name: "Crypto", tz: "UTC", sessions: [[hm(0), hm(24)]], days: [0, 1, 2, 3, 4, 5, 6], delayMin: 0 },
];
export const marketById = (id: string): Market | undefined => MARKETS.find((m) => m.id === id);
/** The FX week's clock: New York's. The week opens on Sunday at 17:00 there and closes on Friday at 17:00. */
export const FX_TZ = "America/New_York", FX_BELL = hm(17);

// ---- what the Monitor knows of each market's calendar, and from whom (20 Nov 2026; the page's copy says more) ----
// Holidays are rows of `sessions_cal` (loadHolidays in table.ts): Tokyo's and New York's for 2026 and 2027, checked
// against JPX's and NYSE's own pages on 7 Nov 2026 (migration 20261107000010). No other market's are held.
export interface HolidaySource { publisher: string; page: string; read: string; through: string }
export const HOLIDAY_SOURCES: Partial<Record<MarketId, HolidaySource>> = {
  TSE: { publisher: "JPX", page: "https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html", read: "2026-11-07", through: "2027-12-31" },
  NYSE: { publisher: "NYSE", page: "https://www.nyse.com/trade/hours-calendars", read: "2026-11-07", through: "2027-12-31" },
};
// Early closes: the minute (local time) a market's regular session ends on a day it closes early. NYSE's, as its page
// "Holidays & Trading Hours" gave them to the source-probe `pf_rules` on 20 Nov 2026, 12:41 UTC (run 44737850579):
//   "** Each market will close early at 1:00 p.m. (1:15 p.m. for eligible options) on Monday, July 3, 2028. …"
//   "*** Each market will close early at 1:00 p.m. (1:15 p.m. for eligible options) on Friday, November 27, 2026,
//    Friday, November 26, 2027, and Friday, November 24, 2028 (the day after Thanksgiving). …"
//   "**** Each market will close early at 1:00 p.m. (1:15 p.m. for eligible options) on Thursday, December 24, 2026. …"
// "All times are Eastern Time." After an early close the market is CLOSED here: its rows stop being LIVE, and the
// minute job reads it for 45 minutes more, as after any close. No other market's early closes are known here. The
// paper portfolio's P-2 moves these into the database (`sessions_cal.early_close`).
export const EARLY_CLOSES: Partial<Record<MarketId, Record<string, number>>> = {
  NYSE: { "2026-11-27": hm(13), "2026-12-24": hm(13), "2027-11-26": hm(13), "2028-07-03": hm(13), "2028-11-24": hm(13) },
};
/** The minute (local time) the market's regular session ends on the local date `ymd`: an early close where one is
 *  known, otherwise the end of its last session. */
export const dayEnd = (m: Market, ymd: string): number => EARLY_CLOSES[m.id]?.[ymd] ?? m.sessions[m.sessions.length - 1][1];

export interface TzParts { wd: number; y: number; mo: number; d: number; h: number; m: number; ymd: string }
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const cache = new Map<string, Intl.DateTimeFormat>();
export function partsIn(tz: string, d: Date = new Date()): TzParts {
  let f = cache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); cache.set(tz, f); }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) if (x.type !== "literal") p[x.type] = x.value;
  const y = Number(p.year), mo = Number(p.month), day = Number(p.day);
  return { wd: WD[p.weekday] ?? 0, y, mo, d: day, h: Number(p.hour) % 24, m: Number(p.minute), ymd: `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}
/** Exchange-local calendar date (YYYY-MM-DD) of an epoch-seconds timestamp. */
export const localDate = (tz: string, epochSec: number): string => partsIn(tz, new Date(epochSec * 1000)).ymd;

export type Holidays = Partial<Record<string, Set<string>>>;

export function marketState(m: Market, now: Date, holidays: Holidays = {}): MarketState {
  const p = partsIn(m.tz, now), minute = p.h * 60 + p.m;
  if (m.id === "FX") {
    // The FX week by New York's clock, from Sunday 17:00 to Friday 17:00 there: the rule the feed's health and a
    // pair's day already keep (feedhealth.ts fxTrading; fx.ts fxDay). Until 21 Nov 2026 this was Monday 05:00 to
    // Saturday 06:00 SGT all year: an hour early at the open in New York's winter, an hour late at the close in its
    // summer, so the page said a pair opened at 05:00 SGT when by this rule it opens at 06:00 (the reviewer's O-1).
    const ny = partsIn(FX_TZ, now), mm = ny.h * 60 + ny.m;
    return ny.wd === 6 || (ny.wd === 5 && mm >= FX_BELL) || (ny.wd === 0 && mm < FX_BELL) ? "CLOSED" : "OPEN";
  }
  if (m.id === "CME") {
    const open = (p.wd >= 1 && p.wd <= 4 && (minute < hm(17) || minute >= hm(18))) || (p.wd === 5 && minute < hm(17)) || (p.wd === 0 && minute >= hm(18));
    return open ? "OPEN" : "CLOSED";
  }
  if (!m.days.includes(p.wd)) return "CLOSED";
  if (holidays[m.id]?.has(p.ymd)) return "HOLIDAY";
  const first = m.sessions[0][0], last = dayEnd(m, p.ymd);   // an early close ends the day's last session sooner
  if (minute < first || minute >= last) return "CLOSED";
  for (const [a, b] of m.sessions) if (minute >= a && minute < Math.min(b, last)) return "OPEN";
  return "BREAK";
}

/** True within `graceMin` minutes after the regular close, or after an early close on a day that has one (the
 *  official closing level often posts late). */
export function recentlyClosed(m: Market, now: Date, graceMin = 45, holidays: Holidays = {}): boolean {
  if (m.id === "FX" || m.id === "CME") return false;
  const p = partsIn(m.tz, now), minute = p.h * 60 + p.m;
  if (!m.days.includes(p.wd) || holidays[m.id]?.has(p.ymd)) return false;
  const last = dayEnd(m, p.ymd);   // on a day that closes early, the grace runs from the early close
  return minute >= last && minute < last + graceMin;
}
