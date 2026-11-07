// Exchange sessions. Decides which markets are open right now (for the refresh cadence and the top-bar
// chips). Hours are the exchanges' published regular sessions; holidays come from the API's calendar
// (`sessions_cal`) and are merged in with setHolidays(). Until that loads, weekends are the only closures,
// and the chip tooltip says so.
import { partsIn, SGT } from "./time";

export type MarketId = "TSE" | "HKEX" | "SSE" | "KRX" | "TWSE" | "NSE" | "SGX" | "XETRA" | "LSE" | "NYSE" | "CME" | "FX";
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
  { id: "LSE", name: "London", tz: "Europe/London", sessions: [[hm(8), hm(16, 30)]], days: MF, delayMin: 15 },
  { id: "NYSE", name: "New York", tz: "America/New_York", sessions: [[hm(9, 30), hm(16)]], days: MF, delayMin: 0 },
  // CME Globex: Sunday 18:00 to Friday 17:00 ET with a daily 17:00–18:00 maintenance break.
  { id: "CME", name: "CME Globex", tz: "America/New_York", sessions: [[hm(0), hm(17)], [hm(18), hm(24)]], days: [0, 1, 2, 3, 4, 5], delayMin: 10 },
  // Spot FX: continuous from the Sydney open on Monday morning to the New York close on Friday evening, in SGT.
  { id: "FX", name: "FX", tz: SGT, sessions: [[hm(0), hm(24)]], days: [1, 2, 3, 4, 5, 6], delayMin: 0 },
];

let HOLIDAYS: Partial<Record<MarketId, Set<string>>> = {};
let holidaysLoaded = false;
export function setHolidays(h: Partial<Record<MarketId, string[]>>): void {
  HOLIDAYS = Object.fromEntries(Object.entries(h).map(([k, v]) => [k, new Set(v)])) as typeof HOLIDAYS;
  holidaysLoaded = true;
}
export const haveHolidays = () => holidaysLoaded;

export interface MarketStatus { market: Market; state: MarketState; local: string; localDate: string }

export function marketStatus(m: Market, now: Date = new Date()): MarketStatus {
  const p = partsIn(m.tz, now);
  const local = `${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}`;
  const base = { market: m, local, localDate: p.ymd };
  const minute = p.h * 60 + p.m;
  if (m.id === "FX") {
    // open Monday 05:00 SGT to Saturday 06:00 SGT
    const sg = partsIn(SGT, now), mm = sg.h * 60 + sg.m;
    const open = (sg.wd >= 2 && sg.wd <= 5) || (sg.wd === 1 && mm >= hm(5)) || (sg.wd === 6 && mm < hm(6));
    return { ...base, state: open ? "OPEN" : "CLOSED" };
  }
  if (m.id === "CME") {
    const open = (p.wd >= 1 && p.wd <= 4 && (minute < hm(17) || minute >= hm(18))) || (p.wd === 5 && minute < hm(17)) || (p.wd === 0 && minute >= hm(18));
    return { ...base, state: open ? "OPEN" : "CLOSED" };
  }
  if (!m.days.includes(p.wd)) return { ...base, state: "CLOSED" };
  if (HOLIDAYS[m.id]?.has(p.ymd)) return { ...base, state: "HOLIDAY" };
  const first = m.sessions[0][0], last = m.sessions[m.sessions.length - 1][1];
  if (minute < first || minute >= last) return { ...base, state: "CLOSED" };
  for (const [a, b] of m.sessions) if (minute >= a && minute < b) return { ...base, state: "OPEN" };
  return { ...base, state: "BREAK" };
}

export const allStatuses = (now: Date = new Date()): MarketStatus[] => MARKETS.map((m) => marketStatus(m, now));

/** True when any tracked market (including FX and futures) is open. Drives the 60 s refresh. */
export const anyOpen = (now: Date = new Date()): boolean => allStatuses(now).some((s) => s.state === "OPEN");

export const marketById = (id: MarketId): Market => MARKETS.find((m) => m.id === id)!;
