// Time helpers. Everything is stored in UTC and displayed in Singapore time by default (Shota's brief).
export const SGT = "Asia/Singapore";

export const TZ_ABBR: Record<string, string> = {
  "Asia/Singapore": "SGT",
  "Asia/Tokyo": "JST",
  "Asia/Hong_Kong": "HKT",
  "Asia/Shanghai": "CST",
  "Asia/Seoul": "KST",
  "Asia/Taipei": "TST",
  "Asia/Kolkata": "IST",
  "Europe/London": "UK",
  "Europe/Berlin": "CET",
  "America/New_York": "ET",
  "America/Chicago": "CT",
  UTC: "UTC",
};

export interface TzParts { wd: number; y: number; mo: number; d: number; h: number; m: number; s: number; ymd: string }

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmtFor(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Calendar parts of `d` in time zone `tz` (weekday 0 = Sunday, hour 0–23). */
export function partsIn(tz: string, d: Date = new Date()): TzParts {
  const p: Record<string, string> = {};
  for (const x of fmtFor(tz).formatToParts(d)) if (x.type !== "literal") p[x.type] = x.value;
  const y = Number(p.year), mo = Number(p.month), day = Number(p.day);
  return { wd: WD[p.weekday] ?? 0, y, mo, d: day, h: Number(p.hour) % 24, m: Number(p.minute), s: Number(p.second), ymd: `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** "HH:MM" or "HH:MM:SS" in `tz`. */
export function fmtClock(d: Date, tz = SGT, seconds = false): string {
  const p = partsIn(tz, d);
  return seconds ? `${p2(p.h)}:${p2(p.m)}:${p2(p.s)}` : `${p2(p.h)}:${p2(p.m)}`;
}

/** "MM/DD HH:MM SGT" for as-of stamps. Accepts ISO strings, epoch ms or Dates. */
export function fmtStamp(t: string | number | Date | null | undefined, tz = SGT): string {
  if (t == null) return "–";
  const d = t instanceof Date ? t : new Date(t);
  if (Number.isNaN(d.getTime())) return "–";
  const p = partsIn(tz, d);
  return `${p2(p.mo)}/${p2(p.d)} ${p2(p.h)}:${p2(p.m)} ${TZ_ABBR[tz] ?? tz}`;
}

/** "DD MMM YYYY" in `tz`. */
export function fmtDate(t: string | number | Date, tz = SGT): string {
  const d = t instanceof Date ? t : new Date(t);
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short", year: "numeric" }).format(d);
}

/** Minutes since `t`, or null when unknown. */
export function ageMin(t: string | number | Date | null | undefined, now: Date = new Date()): number | null {
  if (t == null) return null;
  const d = t instanceof Date ? t : new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((now.getTime() - d.getTime()) / 60000);
}
