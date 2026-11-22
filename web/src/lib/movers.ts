// Moves in σ on MARKETS (I-6, 20 Nov 2026; B-06 (a) and the designer's I-6 note): the MOVERS IN σ strip and the 1D IN σ
// column, from the market table's rows. Display only: every figure is the server's (supabase/functions/_shared/sigma.ts
// works them out: the day's change over the σ of the instrument's daily changes in the 63 sessions before it). Pure:
// sim/logic.test.ts checks it.
//
// B-32 (21 Nov 2026; the designer's note (a) of round 3b). At 07:00 SGT a currency's day is an hour old, and the session
// that has just ended was in no cell. So the strip has two readings, TODAY (as before: the change since the last booked
// close) and LAST SESSION (each instrument's newest completed day, between its last two booked closes: the row's `ls`),
// and one rule says which day a figure is of, for the strip's cells, the phone's cards, the table and the phone's lines:
//   - a figure that is not from today's date in Singapore carries its day ("20 Nov") beside it; a live row carries none;
//   - under Last session every cell carries its session's date, with the session's change and its close under it;
//   - under Today, a currency or a CME future whose day began under three hours ago shows "last session -2.2σ" in place
//     of the change and the level.
// The choice and the days are drawn only where the server sends `ls`: with a server from before, the page is as before.
import type { TableRow } from "./types";
import { fmtDate, fmtDayMon, isOfficialRow, partsIn, rowAsOf, rowSource, SGT } from "./time";
import { cellBp, cellPct, fmtLevel, fmtSigma, isYield } from "./fmt";
import { monthOf } from "./futures";
import { FX_BELL, FX_TZ, marketOf, zonedMs } from "./sessions";
import { LAST_SESSION } from "./labels";

/** Ten cells, largest |σ| first; the alert line (2.5σ) gets an amber border, under 1.5σ the cell is lettered muted. */
export const STRIP_N = 10, SIGMA_LINE = 2.5, SIGMA_QUIET = 1.5;
const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** The two readings of the strip: the change since the last booked close, or each instrument's newest completed day. */
export type SigmaMode = "today" | "last";
/** The σ a cell shows large under a reading. */
export const sigmaOf = (r: TableRow, mode: SigmaMode = "today"): number | null | undefined => (mode === "last" ? r.ls?.z : r.z1d);
/** Whether the server sends the last session with the table (B-32): the choice is offered only then. */
export const hasLastSession = (rows: TableRow[]): boolean => rows.some((r) => r.marketTab !== false && ok(r.ls?.z));

/** The largest moves in σ, any class: the rows the MARKETS table shows that have a σ, largest |σ| first; of the day, or
 *  (`mode` "last") of each instrument's newest completed session. */
export function moversInSigma(rows: TableRow[], n = STRIP_N, mode: SigmaMode = "today"): TableRow[] {
  return rows.filter((r) => r.marketTab !== false && ok(sigmaOf(r, mode))).sort((a, b) => Math.abs(sigmaOf(b, mode)!) - Math.abs(sigmaOf(a, mode)!) || a.order - b.order).slice(0, n);
}
/** The table's rows by |σ| within each class bar (the designer: the bars keep the table's structure; the strip gives the
 *  ranking across classes). Rows without a σ keep their order after the others of their class. */
export function sortBySigma(rows: TableRow[]): TableRow[] {
  const cls: string[] = [];
  for (const r of rows) if (!cls.includes(r.cls)) cls.push(r.cls);
  return cls.flatMap((c) => rows.filter((r) => r.cls === c).map((r, i) => ({ r, i })).sort((a, b) => (ok(b.r.z1d) ? Math.abs(b.r.z1d) : -1) - (ok(a.r.z1d) ? Math.abs(a.r.z1d) : -1) || a.i - b.i).map((x) => x.r));
}
/** The window most of the strip's figures are worked out from (markets close on different days, so a few differ: each
 *  figure's own is on its tooltip): the first and last close, or null when none has one. */
export function commonWindow(rows: TableRow[], mode: SigmaMode = "today"): { from: string; to: string } | null {
  const n = new Map<string, number>();
  for (const r of rows) { const f = mode === "last" ? r.ls?.wFrom : r.zFrom, t = mode === "last" ? r.ls?.wTo : r.zTo; if (f && t) { const k = `${f}|${t}`; n.set(k, (n.get(k) ?? 0) + 1); } }
  const top = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const [from, to] = top[0].split("|");
  return { from, to };
}
/** A move's two parts as a cell writes them: the change ("+1.9%", a yield's in bp) and the level it ends on
 *  ("158.420"). Of the day (to the last print), or of the newest completed session (to its close). */
export function moveParts(r: TableRow, mode: SigmaMode = "today"): { chg: string; lvl: string } {
  const y = isYield(r);
  if (mode === "last") return { chg: y ? cellBp(r.ls?.chg) : cellPct(r.ls?.chg), lvl: fmtLevel(r.ls?.close, r.decimals, y) };
  const c = r.closes.d1, v = y ? (c != null && r.last != null ? r.last - c : null) : r.pct.d1 ?? null;
  return { chg: y ? cellBp(v) : cellPct(v), lvl: fmtLevel(r.last, r.decimals, y) };
}
/** The move as the strip writes it under the σ: "+1.9% · 158.420", a yield's in bp. */
export function moveLine(r: TableRow, mode: SigmaMode = "today"): string {
  const p = moveParts(r, mode);
  return `${p.chg} · ${p.lvl}`;
}

// ---- which day a figure is of (B-32) ----
/** Today's date in Singapore ("2026-11-24"). */
export const sgtDay = (now: Date = new Date()): string => partsIn(SGT, now).ymd;
/** The day a row's last figure is of: a print's date in Singapore, a booked close's or a published figure's own date. */
export const rowDay = (r: Pick<TableRow, "lastAt" | "source">, now: Date = new Date()): string | null => rowAsOf(r, now)?.ymd ?? null;
/** For how long after its print a row the server called live still counts as live on the page: the server's own rule
 *  (the feed's delay plus fifteen minutes: table.ts) and three minutes for the page's own refresh. */
export const LIVE_PRINT_MIN = 15, LIVE_SLACK_MIN = 3;
/** Whether a row is live NOW. `live` is the server's word at the moment of its answer, and the page can show an answer
 *  long after: the table it kept on the device, read with no connection the next morning, or a page left open while
 *  its refreshes fail. A row that was live then carried no day beside figures of the day before, while the closed rows
 *  beside it were dated (the checks of round 3b, 21 Nov 2026: H-3). So the page keeps the server's word only while the
 *  row's own print is recent; past that the print's date decides, as for any other row. A row without a print time
 *  keeps the server's word. */
export function stillLive(r: { lastAt?: string | null; live: boolean; market?: string | null }, now: Date = new Date()): boolean {
  if (!r.live) return false;
  const t = r.lastAt ? Date.parse(r.lastAt) : NaN;
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t <= ((marketOf(r.market)?.delayMin ?? 0) + LIVE_PRINT_MIN + LIVE_SLACK_MIN) * 60e3;
}
/** The day to write beside a row's figures where they are not today's: none for a row that is live now, for a figure
 *  dated today in Singapore, and for a row from a server that does not send the last session (the page is then as
 *  before). */
export function staleDay(r: Pick<TableRow, "lastAt" | "source" | "live" | "ls" | "market">, now: Date = new Date()): string | null {
  if (r.ls === undefined || stillLive(r, now)) return null;
  const d = rowDay(r, now);
  return d && d !== sgtDay(now) ? d : null;
}
/** The day beside a cell's σ: under Last session the session's own date (its newest close's, as stored); under Today the
 *  row's day where its move is not today's. */
export const cellDay = (r: TableRow, mode: SigmaMode, now: Date = new Date()): string | null => (mode === "last" ? r.ls?.d ?? null : staleDay(r, now));
/** "20 Nov": a day as a cell, a name cell and a phone's pill write it (the year is on the tooltip). */
export const dayWords = (ymd: string | null | undefined): string => fmtDayMon(ymd);

/** For how long after 17:00 New York a currency's or a CME future's new day counts as young. */
export const YOUNG_HOURS = 3;
const ymdPlus = (ymd: string, days: number): string => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86400e3).toISOString().slice(0, 10);
const weekdayOf = (ymd: string): number => new Date(`${ymd}T00:00:00Z`).getUTCDay();   // 0 Sunday … 6 Saturday
/** The most recent 17:00 New York at or before `now` (the bell a currency's and a future's day ends and begins at),
 *  and the New York date it falls on. */
export function lastBell(now: Date = new Date()): { ms: number; ymd: string } {
  const today = partsIn(FX_TZ, now).ymd, t = zonedMs(FX_TZ, today, FX_BELL);
  if (now.getTime() >= t) return { ms: t, ymd: today };
  const y = ymdPlus(today, -1);
  return { ms: zonedMs(FX_TZ, y, FX_BELL), ymd: y };
}
/** Whether a row's day began under three hours ago: its market is FX or CME (the two the session table keeps round the
 *  clock), now is less than three hours after the last 17:00 New York, and its 1D is measured from the close of the
 *  day that ended there. From Monday to Thursday that day is the bell's own date: in New York's winter the rule holds
 *  from the booking at 06:35 SGT until 09:00 SGT, in its summer until 08:00 SGT (before the booking the 1D still runs
 *  from the close before, so the figure is the whole day that has just ended). At Sunday's bell the week opens and no
 *  day has ended since Friday's: the day before is then Friday's, so the week's first hours count too, from the first
 *  print (the checks of round 3b, 21 Nov 2026: LS-3; the rule counted from the bell of the close's own date, which on
 *  a Monday morning is two days back, so the line never showed then). After Friday's bell and Saturday's no day begins. */
export function youngDay(r: Pick<TableRow, "market" | "closeDates">, now: Date = new Date()): boolean {
  if (r.market !== "FX" && r.market !== "CME") return false;
  const d = r.closeDates.d1;
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const bell = lastBell(now);
  if (now.getTime() - bell.ms >= YOUNG_HOURS * 3600e3) return false;
  const wd = weekdayOf(bell.ymd), ended = wd >= 1 && wd <= 4 ? bell.ymd : wd === 0 ? ymdPlus(bell.ymd, -2) : null;
  return ended !== null && d === ended;
}
/** Whether a cell under Today shows the last session's figure in place of the change and the level: a young day whose
 *  1D is measured from that session's close, with that session's σ in hand. */
export const showsLast = (r: TableRow, now: Date = new Date()): boolean => youngDay(r, now) && ok(r.ls?.z) && r.ls!.d === r.closeDates.d1;
/** "last session -2.2σ": the words lower case in a cell (the designer), the figure as every σ is written. */
export const lastWords = (r: TableRow): string => `${LAST_SESSION.toLowerCase()} ${fmtSigma(r.ls?.z)}`;
/** "last session -2.2σ · 23 Nov": an opened phone row, under its 1D in σ (a phone has no tooltip). */
export const lastLine = (r: TableRow): string | null => (ok(r.ls?.z) ? `${lastWords(r)} · ${dayWords(r.ls!.d)}` : null);

// ---- tooltips ----
const sdText = (sd: number | null | undefined, y: boolean): string => (ok(sd) ? (y ? `${(sd * 100).toFixed(1)}bp` : `${sd.toFixed(2)}%`) : "–");
const FUTURES_CLAUSE = "its changes of contract are left out from when the Monitor records them; any before stay in (its page says from when)";
/** Japan, the euro area, the UK and Canada publish their curves a day late (Help, "Curves"); the US Treasury publishes
 *  its own on the day itself, so its bracket said something that is not so (the designer's D-67, 21 Nov 2026). */
const officialClause = (r: TableRow, ymd: string): string => `measured on ${fmtDate(ymd)}'s close${rowSource(r) === "US Treasury" ? ", its newest published day" : " (published a day late)"}`;
/** What a 1D IN σ figure is, for its cell and strip tooltip: the σ, the closes it is worked out from, and, for an official
 *  yield, the day it was measured on (published a day late, except the US Treasury's); for a future, that its changes of contract are left
 *  out only from when the Monitor records them (a change before its record stays in the 63 sessions: the reviewer's S4),
 *  and across a roll today, the change of contract left out. */
export function sigmaTip(r: TableRow): string {
  if (!ok(r.z1d)) {
    if (r.roll && r.roll.step == null) return `A change of contract today (to ${monthOf(r.roll.to)}): the source does not give the new contract's close before it, so the day has no σ`;
    if (r.z1d === undefined) return "No σ yet: the server sends it with the table once its update is deployed";
    if (!ok(r.sd1d)) return ok(r.zN) && r.zN < 60 ? `No σ: ${r.zN} daily changes stored, 60 needed` : ok(r.zN) ? `No σ: its ${r.zN} daily changes before the day do not move` : "No σ: fewer than 60 daily changes stored";
    return "No σ: there is no close to measure the day's change from";
  }
  const y = isYield(r);
  const parts = [`The day's change over the σ of the ${r.zN ?? 63} daily changes before it (${sdText(r.sd1d, y)} a day), worked out † from the daily closes of ${fmtDate(r.zFrom)} – ${fmtDate(r.zTo)} (${rowSource(r)})`];
  if (isOfficialRow(r) && r.lastAt) parts.push(officialClause(r, r.lastAt.slice(0, 10)));
  if (/=F$/.test(r.symbol)) parts.push(FUTURES_CLAUSE);
  if (r.roll && r.roll.step != null) parts.push(`a change of contract today: ${r.roll.step >= 0 ? "+" : ""}${r.roll.step.toFixed(2)}% from ${monthOf(r.roll.from)} to ${monthOf(r.roll.to)}, left out (the day is the change within ${monthOf(r.roll.to)})`);
  return parts.join(" · ");
}
/** A cell under Today: what its figure is (sigmaTip) and, where the row is not from today, whose day the move is:
 *  "· the move of 20 Nov 2026". */
export function todayTip(r: TableRow, now: Date = new Date()): string {
  const d = staleDay(r, now);
  return d ? `${sigmaTip(r)} · the move of ${fmtDate(d)}` : sigmaTip(r);
}
/** A cell under Last session, and the "last session -2.2σ" line: the two closes with their dates and levels, the σ and
 *  its window; then the clauses of sigmaTip (an official yield's publication, a future's changes of contract). */
export function lastTip(r: TableRow): string {
  const s = r.ls;
  if (!s) return s === undefined ? "No last session yet: the server sends it with the table once its update is deployed" : "No last session: the Monitor holds fewer than two daily closes of it";
  const y = isYield(r), lv = (v: number | null | undefined) => fmtLevel(v, r.decimals, y);
  const head = `The change between the closes of ${fmtDate(s.from)} and ${fmtDate(s.d)} (${lv(s.base)} to ${lv(s.close)}, ${y ? cellBp(s.chg) : cellPct(s.chg)})`;
  if (!ok(s.z)) {
    if (s.roll && s.roll.step == null) return `${head}, across a change of contract (to ${monthOf(s.roll.to)}) whose size the source does not give: the session has no σ`;
    return `${head}: no σ, ${ok(s.n) && s.n < 60 ? `${s.n} daily changes stored before it, 60 needed` : "fewer than 60 daily changes stored before it, or none that move"}`;
  }
  const parts = [`${head} over the σ of the ${s.n ?? 63} daily changes before it (${sdText(s.sd, y)} a day), worked out † from the daily closes of ${fmtDate(s.wFrom)} – ${fmtDate(s.wTo)} (${rowSource(r)})`];
  if (isOfficialRow(r)) parts.push(officialClause(r, s.d));
  if (/=F$/.test(r.symbol)) parts.push(FUTURES_CLAUSE);
  if (s.roll && s.roll.step != null) parts.push(`a change of contract that day: ${s.roll.step >= 0 ? "+" : ""}${s.roll.step.toFixed(2)}% from ${monthOf(s.roll.from)} to ${monthOf(s.roll.to)}, left out (the session is the change within ${monthOf(s.roll.to)}, from its own close before)`);
  return parts.join(" · ");
}
/** What the table's 1D IN σ tooltip adds (B: "the last session's figure and its dates as well"): "last session
 *  (23 Nov 2026): -2.2σ, between the closes of 20 Nov 2026 and 23 Nov 2026"; null where there is none. */
export const lastClause = (r: TableRow): string | null => (ok(r.ls?.z) ? `last session (${fmtDate(r.ls!.d)}): ${fmtSigma(r.ls!.z)}, between the closes of ${fmtDate(r.ls!.from)} and ${fmtDate(r.ls!.d)}` : null);
/** The table's 1D IN σ cell: today's figure and what it is worked out from, then the last session. */
export function columnTip(r: TableRow): string {
  const last = lastClause(r);
  return last ? `${sigmaTip(r)} · ${last}` : sigmaTip(r);
}
/** A name cell's day in the table ("20 Nov" after the name): what it says on its tooltip. */
export const rowDayTip = (ymd: string): string => `The row's last figure is of ${fmtDate(ymd)}: its LAST, 1D and 1D in σ are that day's`;
