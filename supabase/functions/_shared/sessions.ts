// Exchange sessions for the server side (same rules as web/src/lib/sessions.ts; keep the two in step).
export type MarketId = "TSE" | "HKEX" | "SSE" | "KRX" | "TWSE" | "NSE" | "SGX" | "XETRA" | "LSE" | "NYSE" | "CME" | "FX";
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
  { id: "LSE", name: "London", tz: "Europe/London", sessions: [[hm(8), hm(16, 30)]], days: MF, delayMin: 15 },
  { id: "NYSE", name: "New York", tz: "America/New_York", sessions: [[hm(9, 30), hm(16)]], days: MF, delayMin: 0 },
  { id: "CME", name: "CME Globex", tz: "America/New_York", sessions: [[hm(0), hm(17)], [hm(18), hm(24)]], days: [0, 1, 2, 3, 4, 5], delayMin: 10 },
  { id: "FX", name: "FX", tz: SGT, sessions: [[hm(0), hm(24)]], days: [1, 2, 3, 4, 5, 6], delayMin: 0 },
];
export const marketById = (id: string): Market | undefined => MARKETS.find((m) => m.id === id);

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
    const sg = partsIn(SGT, now), mm = sg.h * 60 + sg.m;
    return (sg.wd >= 2 && sg.wd <= 5) || (sg.wd === 1 && mm >= hm(5)) || (sg.wd === 6 && mm < hm(6)) ? "OPEN" : "CLOSED";
  }
  if (m.id === "CME") {
    const open = (p.wd >= 1 && p.wd <= 4 && (minute < hm(17) || minute >= hm(18))) || (p.wd === 5 && minute < hm(17)) || (p.wd === 0 && minute >= hm(18));
    return open ? "OPEN" : "CLOSED";
  }
  if (!m.days.includes(p.wd)) return "CLOSED";
  if (holidays[m.id]?.has(p.ymd)) return "HOLIDAY";
  const first = m.sessions[0][0], last = m.sessions[m.sessions.length - 1][1];
  if (minute < first || minute >= last) return "CLOSED";
  for (const [a, b] of m.sessions) if (minute >= a && minute < b) return "OPEN";
  return "BREAK";
}

/** True within `graceMin` minutes after the regular close (the official closing level often posts late). */
export function recentlyClosed(m: Market, now: Date, graceMin = 45, holidays: Holidays = {}): boolean {
  if (m.id === "FX" || m.id === "CME") return false;
  const p = partsIn(m.tz, now), minute = p.h * 60 + p.m;
  if (!m.days.includes(p.wd) || holidays[m.id]?.has(p.ymd)) return false;
  const last = m.sessions[m.sessions.length - 1][1];
  return minute >= last && minute < last + graceMin;
}
