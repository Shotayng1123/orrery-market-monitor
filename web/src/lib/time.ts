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

// ---- what a watchlist row's figures are as of (the designer's D-24, 19 Nov 2026) ----
/** A booked daily close, a print with its time, or an official publisher's daily figure (a yield from a curve). */
export type AsOfKind = "close" | "print" | "published";
export interface AsOf { kind: AsOfKind; ymd: string; date: string; time: string | null; today: boolean }
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "19 Nov" for "2026-11-19", as written: a session's date is its own, in no other time zone. */
const dayMon = (ymd: string): string => `${Number(ymd.slice(8, 10))} ${MON[Number(ymd.slice(5, 7)) - 1] ?? "?"}`;

/** Reads the watch_list route's as-of: a date ("2026-11-19") for a close or a published figure, an ISO time for a
 *  print, shown in Singapore time. A server older than 19 Nov 2026 sends no kind: a date, or a time stamped at
 *  exactly midnight UTC (how its market table stamped a booked close), is then a close; any other time a print. */
export function asOfOf(asOf: string | null | undefined, kind?: AsOfKind | null, now: Date = new Date()): AsOf | null {
  if (!asOf) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(asOf), midnight = /^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(asOf);
  const k: AsOfKind = kind ?? (dateOnly || midnight ? "close" : "print");
  if (k !== "print" || dateOnly) { const ymd = asOf.slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? { kind: k === "print" ? "close" : k, ymd, date: dayMon(ymd), time: null, today: false } : null; }
  const t = new Date(asOf);
  if (Number.isNaN(t.getTime())) return null;
  const p = partsIn(SGT, t);
  return { kind: "print", ymd: p.ymd, date: dayMon(p.ymd), time: `${p2(p.h)}:${p2(p.m)}`, today: p.ymd === partsIn(SGT, now).ymd };
}
/** The AS OF column: "19 Nov" for a close or a published figure, "23:18" for a print of today, "18 Nov 23:18" for an
 *  earlier print; "–" when the row has none. */
export const asOfCell = (a: AsOf | null): string => (!a ? "–" : a.time == null ? a.date : a.today ? a.time : `${a.date} ${a.time}`);
/** The phone's line under a name: "close 19 Nov", "18 Nov" (a published figure), "23:18", "18 Nov 23:18". */
export const asOfLine = (a: AsOf | null): string => (!a ? "as of –" : a.kind === "close" ? `close ${a.date}` : asOfCell(a));
/** The whole of it, for a tooltip: "Yahoo Finance · close of 19 Nov 2026", "Japan MOF · published for 18 Nov 2026",
 *  "Yahoo Finance · last print 19 Nov 2026 23:18 SGT". */
export function asOfTitle(a: AsOf | null, source?: string | null): string {
  const who = source ? `${source} · ` : "";
  if (!a) return `${who}no as-of time`;
  const full = `${a.date} ${a.ymd.slice(0, 4)}`;
  return who + (a.kind === "close" ? `close of ${full}` : a.kind === "published" ? `published for ${full}` : `last print ${full} ${a.time} SGT`);
}
