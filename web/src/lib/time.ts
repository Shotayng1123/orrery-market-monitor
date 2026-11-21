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

// ---- one date format and one time format (the designer's D-16 and §3.2; I-5, 20 Nov 2026) ----
// A date of the data is "19 Nov 2026"; a time is "19 Nov 23:18 SGT", or "23:18" in a panel whose head says "times in
// SGT" for a row of today; a list spanning days gets day bars. Never "11/19", "16-Nov-26" or "2026-11-19".
const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type When = string | number | Date | null | undefined;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A moment, or null. A plain date ("2026-11-19") is not a moment: it is read as written (below). */
const momentOf = (t: When): Date | null => { if (t == null || t === "") return null; const d = t instanceof Date ? t : new Date(t); return Number.isNaN(d.getTime()) ? null : d; };
/** The calendar day of `t`: a plain date as written (a session's date is its own, in no other time zone), anything
 *  else in `tz`. Null when there is none. */
function dayParts(t: When, tz: string): { y: number; mo: number; d: number } | null {
  if (typeof t === "string") { const m = ISO_DAY.exec(t.trim()); if (m) return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) }; }
  const x = momentOf(t);
  if (!x) return null;
  const p = partsIn(tz, x);
  return { y: p.y, mo: p.mo, d: p.d };
}

/** "19 Nov 2026": a date of the data. Accepts "2026-11-19" (as written), ISO times, epoch ms or Dates (in `tz`);
 *  "–" for none. */
export function fmtDate(t: When, tz = SGT): string {
  const p = dayParts(t, tz);
  return p ? `${p.d} ${MONS[p.mo - 1]} ${p.y}` : "–";
}
/** "19 Nov": the same without its year, where the year goes without saying (a short column of recent days). */
export function fmtDayMon(t: When, tz = SGT): string {
  const p = dayParts(t, tz);
  return p ? `${p.d} ${MONS[p.mo - 1]}` : "–";
}
/** "19 Nov 23:18 SGT" for as-of stamps. Accepts ISO strings, epoch ms or Dates; "–" for none. */
export function fmtStamp(t: When, tz = SGT): string {
  const d = momentOf(t);
  if (!d) return "–";
  const p = partsIn(tz, d);
  return `${p.d} ${MONS[p.mo - 1]} ${p2(p.h)}:${p2(p.m)} ${TZ_ABBR[tz] ?? tz}`;
}
/** A time in a panel or list whose head says "times in SGT": "23:18" for today (Singapore's day), "19 Nov 23:18"
 *  for another day; "–" for none. */
export function fmtWhen(t: When, now: Date = new Date(), tz = SGT): string {
  const d = momentOf(t);
  if (!d) return "–";
  const p = partsIn(tz, d), hm = `${p2(p.h)}:${p2(p.m)}`;
  return p.ymd === partsIn(tz, now).ymd ? hm : `${p.d} ${MONS[p.mo - 1]} ${hm}`;
}
/** "19 Nov 23:18": a time with its day, for a list whose head says "times in SGT" and that has no day bars. */
export function fmtDayTime(t: When, tz = SGT): string {
  const d = momentOf(t);
  if (!d) return "–";
  const p = partsIn(tz, d);
  return `${p.d} ${MONS[p.mo - 1]} ${p2(p.h)}:${p2(p.m)}`;
}
/** A text that may hold a plain date ("As of 2026-11-18", a source's own wording): each "YYYY-MM-DD" in it written
 *  as "18 Nov 2026". For the few fields the server sends as words with a date inside. */
export const datesIn = (s: string): string => s.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, y: string, mo: string, d: string) => (Number(mo) >= 1 && Number(mo) <= 12 ? `${Number(d)} ${MONS[Number(mo) - 1]} ${y}` : _m));

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

// ---- a market-table row's as-of: its chart tile, its tooltips (the reviewer's R2B-01 and R2B-06, 20 Nov 2026) ----
// The table stamps a booked close "<date>T00:00:00Z" (an official yield, which has no quote, and any instrument whose
// quote is missing): a date with no time of day, which read in SGT became "19 Nov 08:00", a print that never was.
/** The providers whose figure is an official publisher's daily one: a yield read from a stored curve (the instruments
 *  table's `provider`, which the market table sends as `source`; the server's watchrow.ts and instrstats.ts). */
const OFFICIAL_PROVIDERS: ReadonlySet<string> = new Set(["treasury", "mof", "curve"]);
const CURVE_SOURCES: Array<[RegExp, string]> = [[/^UST/, "US Treasury"], [/^JGB/, "Japan MOF"], [/^DE\d/, "Bundesbank"], [/^GB\d/, "Bank of England"], [/^EA\d/, "ECB"], [/^CA\d/, "Bank of Canada"]];
/** Whether a market-table row's figure is an official publisher's daily figure. */
export const isOfficialRow = (r: { source?: string | null }): boolean => OFFICIAL_PROVIDERS.has(r.source ?? "");
/** Who publishes a market-table row's figures, by name (the server's watchrow.ts sourceName): an official yield's
 *  publisher, otherwise Yahoo Finance (also for a row that names no provider: a stock's page, a server from before). */
export function rowSource(r: { source?: string | null; symbol: string }): string {
  if (r.source === "treasury") return "US Treasury";
  if (r.source === "mof") return "Japan MOF";
  if (r.source === "curve") return CURVE_SOURCES.find(([re]) => re.test(r.symbol))?.[1] ?? "official yield curve";
  return "Yahoo Finance";
}
/** A row's as-of: the date an official yield was published for, the date of a booked close, or a print's time. */
export const rowAsOf = (r: { lastAt: string | null; source?: string | null }, now: Date = new Date()): AsOf | null => asOfOf(r.lastAt, isOfficialRow(r) ? "published" : null, now);
/** A row's as-of for a tooltip, with its source: "Japan MOF · published for 19 Nov 2026", "Yahoo Finance · close of
 *  19 Nov 2026", "Yahoo Finance · last print 20 Nov 2026 13:35 SGT". */
export const rowAsOfTitle = (r: { lastAt: string | null; source?: string | null; symbol: string }, now: Date = new Date()): string => asOfTitle(rowAsOf(r, now), rowSource(r));
export interface TileStamp { label: "LIVE" | "CLOSED" | "PUBLISHED" | "LAST PRINT" | "LAST CLOSE"; text: string; tip: string }
/** A chart tile's stamp: LIVE or CLOSED with the print's time and its zone ("13:35 SGT" today, "19 Nov 13:35 SGT"
 *  before: a tile's panel does not say its times are in SGT); CLOSED with the date of a booked close; PUBLISHED with
 *  the date an official yield was published for ("19 Nov 2026"). Never a time of day for a figure that has none. The
 *  tooltip names the source.
 *  `session` is what the Monitor's session table says of the row's market now (lib/opens.ts). A row that is not live
 *  says CLOSED only where its market is shut, and the line beside it then says when it opens. In its regular hours
 *  ("open": a delayed feed's first minutes of a session, a feed that has stopped, a holiday the Monitor does not know)
 *  and for a market the table does not keep ("unknown") it says what the figure is instead, LAST PRINT with the
 *  print's time or LAST CLOSE with the close's date: the Monitor does not call a market closed against its own table. */
export function tileStamp(r: { lastAt: string | null; live: boolean; source?: string | null; symbol: string }, now: Date = new Date(), session: "closed" | "open" | "unknown" = "closed"): TileStamp {
  const a = rowAsOf(r, now), tip = asOfTitle(a, rowSource(r)), shut = session === "closed";
  if (!a) return { label: r.live ? "LIVE" : shut ? "CLOSED" : "LAST PRINT", text: "–", tip };
  if (a.kind === "published") return { label: "PUBLISHED", text: fmtDate(a.ymd), tip };
  if (a.kind === "close") return { label: shut ? "CLOSED" : "LAST CLOSE", text: fmtDate(a.ymd), tip };
  return { label: r.live ? "LIVE" : shut ? "CLOSED" : "LAST PRINT", text: `${a.today ? a.time : `${a.date} ${a.time}`} SGT`, tip };
}
