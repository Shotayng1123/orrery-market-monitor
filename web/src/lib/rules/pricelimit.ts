// COPY of supabase/functions/_shared/rules/pricelimit.ts: edit that file, then run `node tools/sync-pf.cjs` from web/.
// Tokyo's daily price limits (the limit chip, LIMIT-1; C/limit-chip-plan.md §1): whether a print of a Tokyo stock is at
// its day's upper or lower limit, and why not when that cannot be known. One rule for every screen: the server works
// out the state of each row from the print the row shows, and the page runs this same file only for its stand-in rows
// (web/src/lib/rules/ is a copy, written by `node tools/sync-pf.cjs` from web/). Pure: it imports nothing, and the
// moment, the lists and the holidays are handed in. Misses are allowed, a false chip is not: wherever the limit cannot
// be known there is no chip, and the state says why (`why`).

export const LIMIT_PAGE = "https://www.jpx.co.jp/english/equities/trading/domestic/06.html";
export const LIMIT_SOURCE = "JPX daily price limits, read 21 Nov 2026 (page of 20 Nov) · personal use";

/** One band of JPX's table: a base price below `below` yen (null: the last band, "50 million or more") has a limit of
 *  ± `width` yen. `confirmed`: a second read agrees with the probe's (C/limit-chip-source.md §1.1); a band read once
 *  gives no chip until pf_jpx's compare run reads it again (P-L1). */
export interface LimitBand { below: number | null; width: number; confirmed: boolean }
// The 34 rows as pf_jpx printed JPX's page on 21 Nov 2026 (C/probes/pf_jpx.log l.93-126): [below, width, read twice]
const ROWS: Array<[number | null, number, boolean]> = [
  [100, 30, true], [200, 50, true], [500, 80, true], [700, 100, true], [1_000, 150, true], [1_500, 300, true], [2_000, 400, true],
  [3_000, 500, true], [5_000, 700, true], [7_000, 1_000, true], [10_000, 1_500, true], [15_000, 3_000, true], [20_000, 4_000, false],
  [30_000, 5_000, false], [50_000, 7_000, true], [70_000, 10_000, false], [100_000, 15_000, true], [150_000, 30_000, false],
  [200_000, 40_000, false], [300_000, 50_000, true], [500_000, 70_000, false], [700_000, 100_000, false], [1_000_000, 150_000, true],
  [1_500_000, 300_000, false], [2_000_000, 400_000, false], [3_000_000, 500_000, false], [5_000_000, 700_000, false],
  [7_000_000, 1_000_000, false], [10_000_000, 1_500_000, false], [15_000_000, 3_000_000, false], [20_000_000, 4_000_000, false],
  [30_000_000, 5_000_000, false], [50_000_000, 7_000_000, false], [null, 10_000_000, true],
];
export const LIMIT_TABLE: readonly LimitBand[] = ROWS.map(([below, width, confirmed]) => ({ below, width, confirmed }));

/** Equal means within half the finest tick (0.1 yen): Yahoo's closes carry float noise (386.20001220703125). */
export const EQUAL_YEN = 0.05;

/** The band of a base price ("less than" is strict: 1,000 is in the band below 1,500), or null for no base. */
export function limitBand(base: number): LimitBand | null {
  if (!Number.isFinite(base) || base <= 0) return null;
  return LIMIT_TABLE.find((b) => b.below === null || base < b.below) ?? null;
}
/** The day's limits for a base: base ± width, plain arithmetic (no read says how JPX sets a limit between ticks, so a
 *  limit off the grid is a miss). A base of 30 yen or less has no lower limit the Monitor knows (30 − 30 is 0). */
export function limitsOf(base: number): { width: number; upper: number; lower: number | null; confirmed: boolean } | null {
  const b = limitBand(base);
  return b ? { width: b.width, upper: base + b.width, lower: base > b.width ? base - b.width : null, confirmed: b.confirmed } : null;
}

// ---- Tokyo's sessions (09:00-15:30 JST; Japan keeps no summer time) from the holiday rows handed in ----
const JST_MS = 9 * 3600e3, DAY_MS = 86400e3;
const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** The date in Tokyo of a moment: a print's session. */
export function tseDay(at: string | Date): string { return new Date(new Date(at).getTime() + JST_MS).toISOString().slice(0, 10); }
/** Whether the TSE holds a session on a date: a weekday that is not a holiday of the rows. */
export function isSession(day: string, holidays: ReadonlySet<string>): boolean { const wd = new Date(`${day}T00:00:00Z`).getUTCDay(); return wd >= 1 && wd <= 5 && !holidays.has(day); }
/** The session before a date ("" when the rows leave none in a month: then no base is the one before it). */
export function prevSession(day: string, holidays: ReadonlySet<string>): string {
  for (let k = 1; k <= 31; k++) { const d = addDays(day, -k); if (isSession(d, holidays)) return d; }
  return "";
}
/** Whether a session is the TSE's second-to-last business day of its month: month-end record dates put dividends and
 *  splits ex then (7203.T on 30 Mar and 29 Sep 2026), and JPX's base takes the forecast dividend off, Yahoo's close not. */
export function exDay(day: string, holidays: ReadonlySet<string>): boolean {
  const next = addDays(`${day.slice(0, 7)}-01`, 40).slice(0, 7);   // the month after
  let last = addDays(`${next}-01`, -1);
  while (last.slice(0, 7) === day.slice(0, 7) && !isSession(last, holidays)) last = addDays(last, -1);
  return last.slice(0, 7) !== day.slice(0, 7) || prevSession(last, holidays) === day;   // a month with no session: no day is known not to be
}
/** The end of a session, 15:30 JST, as epoch ms. */
const bellMs = (day: string): number => Date.parse(`${day}T06:30:00Z`);

/** Whether a close is at or beyond its own normal limits (1 at, 2 beyond), 0 inside, null when it cannot be told. */
function closeAt(close: number | null, prev: number | null): 0 | 1 | 2 | null {
  if (close === null || prev === null || !Number.isFinite(close) || close <= 0) return null;
  const l = limitsOf(prev);
  if (!l) return null;
  if (close - l.upper >= EQUAL_YEN || (l.lower !== null && l.lower - close >= EQUAL_YEN)) return 2;
  return Math.abs(close - l.upper) < EQUAL_YEN || (l.lower !== null && Math.abs(close - l.lower) < EQUAL_YEN) ? 1 : 0;
}
/** The sessions in a row, ending with the last of `sessions` (oldest first), that closed at or beyond their own normal
 *  limit or had no trade (a volume of 0, where it is known). A session the series cannot tell (no close, or no close
 *  before it) counts as one, as do those before the series starts, up to two; a close beyond its normal limit means the
 *  limit was broadened that day, so it counts as two at least. Two or more: the limit may be broadened (JPX broadens
 *  after two such days in a row), and the Monitor does not draw broadened limits. */
export function limitRun(sessions: Array<{ close: number | null; volume?: number | null }>): number {
  let n = 0, floor = 0;
  for (let i = sessions.length - 1; i >= 1; i--) {
    const s = sessions[i], at = s.volume === 0 ? 1 : closeAt(s.close, sessions[i - 1].close);
    if (at === 0) return Math.max(n, floor);
    n++;
    if (at === 2) floor = 2;
  }
  return Math.max(n + 1, floor, 2);
}

/** Why a print gets no chip (the first that holds, in this order):
 *  not-placed: not a .T member of the Monitor's Nikkei 225 or TOPIX lists (ETFs, REITs, US names, other .T names);
 *  no-print: no last price or time, or a time on no Tokyo session; no-base: no booked close for the session before
 *  the print's; unconfirmed: the base's band rests on one read; base-in-doubt: Yahoo's previous close differs from the
 *  booked close by 0.05 or more (a split Yahoo adjusts), or the previous session's last trade was before the 15:30
 *  closing auction or is not known, or its volume was 0 or is not known (the base may be JPX's special quote); ex-day:
 *  the print's session is the second-to-last business day of its month; run: two sessions before it at their limit or
 *  without a trade, or not known (the limit may be broadened); beyond: the last, the day's high or its low outside the
 *  computed limits (the Monitor's base or width is not JPX's that day). */
export type LimitWhy = "not-placed" | "no-print" | "no-base" | "unconfirmed" | "base-in-doubt" | "ex-day" | "run" | "beyond";
/** A row's print and the facts the rule needs. null: not known. */
export interface LimitInput {
  symbol: string;
  /** the .T symbols of the Monitor's Nikkei 225 and TOPIX lists (domestic stocks by construction) */
  members: ReadonlySet<string>;
  /** the last trade's price and time (ISO), and the day's high and low where they are held */
  price: number | null; at: string | null; high?: number | null; low?: number | null;
  /** the booked close used as the base, and the session it closed */
  base: number | null; baseDay: string | null;
  /** Yahoo's quote's previous close, where the print is a quote */
  quotePrev?: number | null;
  /** the base session's volume and its last trade's time (ISO) */
  prevVolume: number | null; prevLastAt: string | null;
  /** limitRun of the sessions up to the base's (its sign, where a caller keeps one, is ignored) */
  run: number | null;
  /** the TSE's holidays, and the moment of reading */
  holidays: ReadonlySet<string>; now: Date;
}
/** The state of a print: `side` "up" or "down" when its last trade is at that limit, else null; `why` when the chip
 *  cannot be known. The limits are JPX's only when `why` is null. `closed`: the print's session is over (after 15:30
 *  JST, a holiday or a weekend), and the words are then "closed at" its session. */
export interface LimitState {
  side: "up" | "down" | null; why: LimitWhy | null;
  base: number | null; baseDay: string | null; width: number | null; upper: number | null; lower: number | null;
  price: number | null; at: string | null; day: string | null; closed: boolean;
}
export function limitState(i: LimitInput): LimitState {
  const t = i.at === null ? Number.NaN : Date.parse(i.at), day = Number.isFinite(t) ? tseDay(i.at as string) : null;
  const l = i.base !== null && i.base > 0 ? limitsOf(i.base) : null;
  const out: LimitState = { side: null, why: null, base: i.base, baseDay: i.baseDay, width: l?.width ?? null, upper: l?.upper ?? null, lower: l?.lower ?? null, price: i.price, at: i.at, day, closed: day !== null && i.now.getTime() >= bellMs(day) };
  const no = (why: LimitWhy): LimitState => ({ ...out, why });
  if (!/\.T$/.test(i.symbol) || !i.members.has(i.symbol)) return no("not-placed");
  if (i.price === null || !Number.isFinite(i.price) || i.price <= 0 || day === null || !isSession(day, i.holidays)) return no("no-print");
  if (!l || i.baseDay === null || i.baseDay !== prevSession(day, i.holidays)) return no("no-base");
  const base = i.base as number;
  if (!l.confirmed) return no("unconfirmed");
  const lastAt = i.prevLastAt === null ? Number.NaN : Date.parse(i.prevLastAt);
  if ((i.quotePrev != null && !(Math.abs(i.quotePrev - base) < EQUAL_YEN)) || !Number.isFinite(lastAt) || lastAt < bellMs(i.baseDay) || i.prevVolume === null || !(i.prevVolume > 0)) return no("base-in-doubt");
  if (exDay(day, i.holidays)) return no("ex-day");
  if (i.run === null || !(Math.abs(i.run) < 2)) return no("run");
  const off = (x: number | null | undefined) => x != null && (x - l.upper >= EQUAL_YEN || (l.lower !== null && l.lower - x >= EQUAL_YEN));
  if (off(i.price) || off(i.high) || off(i.low)) return no("beyond");
  return { ...out, side: Math.abs(i.price - l.upper) < EQUAL_YEN ? "up" : l.lower !== null && Math.abs(i.price - l.lower) < EQUAL_YEN ? "down" : null };
}

// ---- JPX's table as pf_jpx reads it, set against this one (its compare run; the logic checks) ----
/** The yen of a cell of the table: "1,000", "1.5 million", "&plusmn;30", "±30", "50 million or more"; null for none. */
function yenOf(cell: string): number | null {
  const m = /^(?:&plusmn;|±|\+\/-)?\s*(\d[\d,]*(?:\.\d+)?)\s*(million)?(?:\s+or more)?$/i.exec(cell.trim());
  return m ? Math.round(Number(m[1].replace(/,/g, "")) * (m[2] ? 1e6 : 1) * 10) / 10 : null;
}
/** The bands a table's rows give, values only: "Less than | 100 | &plusmn;30" and "50 million or more |  | 10
 *  million" (`from`: the bound the last band starts at). A row that is neither (the head) gives none. */
export function readLimitTable(rows: string[][]): Array<{ below: number | null; width: number; from?: number }> {
  const out: Array<{ below: number | null; width: number; from?: number }> = [];
  for (const r of rows) {
    const c = r.map((x) => x.trim()), width = c.length >= 2 ? yenOf(c[c.length - 1]) : null, more = /^(.+?)\s+or more$/i.exec(c[0] ?? "");
    if (/^less than$/i.test(c[0] ?? "") && c.length >= 3) { const below = yenOf(c[1]); if (below !== null && width !== null) out.push({ below, width }); }
    else if (more && width !== null) { const from = yenOf(more[1]); if (from !== null) out.push({ below: null, width, from }); }
  }
  return out;
}
const yen = (n: number): string => n.toLocaleString("en-US");
const bandText = (b: { below: number | null; width: number; from?: number } | undefined): string => (!b ? "none" : b.below === null ? `${b.from !== undefined ? yen(b.from) : "–"} or more: ±${yen(b.width)}` : `less than ${yen(b.below)}: ±${yen(b.width)}`);
/** How a table read from the page differs from this one, row by row, in values: [] when they are the same. */
export function compareLimitTable(read: Array<{ below: number | null; width: number; from?: number }>): string[] {
  const out: string[] = [];
  if (read.length !== LIMIT_TABLE.length) out.push(`the page gives ${read.length} rows, the Monitor holds ${LIMIT_TABLE.length}`);
  for (let k = 0; k < Math.max(read.length, LIMIT_TABLE.length); k++) {
    const p = read[k], m = LIMIT_TABLE[k], from = k > 0 ? LIMIT_TABLE[k - 1].below ?? undefined : undefined;
    const same = !!p && !!m && p.below === m.below && p.width === m.width && (m.below !== null || p.from === from);
    if (!same) out.push(`row ${k + 1}: the page ${bandText(p)}; the Monitor ${m ? bandText({ ...m, from }) : "none"}`);
  }
  return out;
}
