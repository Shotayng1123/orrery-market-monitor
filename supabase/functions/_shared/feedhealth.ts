// Has the price feed stopped? (19 Nov 2026.) On 18 Nov, from 15:52 UTC, every quote the source handed the Monitor
// carried the same print time for more than an hour and a half, with New York open and currencies trading: the
// S&P 500, USD/JPY, the futures, all 503 constituents. The pulls themselves succeeded every minute, so the header
// went on saying DATA OK. A job that runs on time proves that the Monitor asked, not that the answer was new.
//
// The reading here: among the instruments whose market is open now, and has been for half an hour, take the one
// that printed most recently, allowing each market its feed's own delay. If even that one is more than twenty
// minutes behind, no price is arriving. One quiet instrument proves nothing; all of them at once do. It is made
// twice, for crypto and for everything else, and the one further behind is the state (see feedState).
// The week's first hours are read apart: a currency's or a future's print from before the weekend says nothing
// about the feed until the source's own week has begun (WEEK_FIRST_PRINT, below).
// No network and no database here; checked in sim/logic.test.ts.
import { marketById, marketState, partsIn, type Holidays } from "./sessions.ts";

export interface Print { symbol: string; market: string; marketTime: string }
export interface FeedState {
  /** Some market has been open long enough that a price should be arriving. */
  expected: boolean;
  /** False when a price should be arriving and none has for longer than FEED_LATE_MIN. */
  ok: boolean;
  /** The most recent print among the open markets (ISO), the instrument it belongs to, and how many minutes it
   *  is behind once its feed's delay is allowed for. Null when nothing is expected. */
  newest: string | null; symbol: string | null; lateMin: number | null;
}
export const FEED_LATE_MIN = 20;   // behind, after the feed's own delay, before the feed counts as stopped
const WORLD_SHUT = new Set(["12-25", "01-01"]);   // month-day, UTC
export const FEED_OPEN_MIN = 30;   // a market open for less than this (plus its delay) may not have printed yet
/** When the source's week of currency prices has begun, whatever the session table says: the first midnight UTC
 *  after Sunday 17:00 New York (ms), given that Sunday's 17:00 (ms). The session table opens currencies on Sunday at
 *  17:00 New York; Yahoo's bars for them begin on Monday at 00:00 UTC, two hours later in New York's winter and
 *  three in its summer: USD/JPY and EUR/USD on all four weekends of the probe's log (jobs/probes/sessions_check.ts,
 *  21 Nov 2026). What Yahoo's futures do on a Sunday evening is in no log yet. */
export const weekFirstPrint = (sunday17Ms: number): number => (Math.floor(sunday17Ms / 86400e3) + 1) * 86400e3;

export function feedState(prints: Print[], nowMs: number, holidays: Holidays = {}): FeedState {
  const now = new Date(nowMs);
  // Currencies and futures trade from Sunday 17:00 New York to Friday 17:00 (fxTrading, which also knows 25 December
  // and 1 January; sessions.ts keeps the same FX week since 21 Nov 2026, and Globex from 18:00). Outside it their old
  // prints say nothing about the feed.
  const open = (m: NonNullable<ReturnType<typeof marketById>>, at: Date): boolean => marketState(m, at, holidays) === "OPEN" && ((m.id !== "FX" && m.id !== "CME") || fxTrading(at.getTime()));
  // Two readings, crypto and everything else. On 18 Nov 2026 crypto went on arriving while every other price
  // stood still for seven and a half hours: read together, crypto's fresh prints vouched for a feed that had
  // stopped, and the bar this reading exists for was never raised.
  const best: Record<"crypto" | "rest", { late: number; p: Print } | null> = { crypto: null, rest: null };
  // The week's first hours (Sunday evening in New York). Until the source's own week has begun and had its half
  // hour, a currency's or a future's print from before Sunday 17:00 New York is last week's: it says nothing about
  // the feed, as a print from before an open says nothing in that open's first half hour. Without this the Monitor
  // would call the feed stopped every Monday from 06:30 SGT until the first bar of the week (08:00 SGT), and ask the
  // second path to take over (the checks of round 3b, 21 Nov 2026: PR-11; the rule of 19 Nov met its first Monday
  // on the 23rd). One that has printed since the week began is judged as at any other hour.
  const ny = partsIn("America/New_York", now), weekBegan = ny.wd === 0 && ny.h >= 17 ? zonedMs("America/New_York", ny.ymd, 17 * 60) : null;
  for (const p of prints) {
    const m = marketById(p.market), t = Date.parse(p.marketTime);
    if (!m || !Number.isFinite(t)) continue;
    if ((m.id === "FX" || m.id === "CME") && weekBegan != null && t < weekBegan && nowMs < weekFirstPrint(weekBegan) + (FEED_OPEN_MIN + m.delayMin) * 60000) continue;
    // currencies and futures have no exchange calendar here, and on the two days the whole world is shut they do
    // not trade either: without this, 25 December and 1 January would read as a feed that has stopped
    if ((m.id === "FX" || m.id === "CME") && WORLD_SHUT.has(now.toISOString().slice(5, 10))) continue;
    // open now, and already open a while ago: just after an open or a lunch break the newest print is the one
    // from before it, and says nothing about the feed
    if (!open(m, now) || !open(m, new Date(nowMs - (FEED_OPEN_MIN + m.delayMin) * 60000))) continue;
    const late = (nowMs - t) / 60000 - m.delayMin, k = m.id === "CRYPTO" ? "crypto" : "rest";
    if (!best[k] || late < best[k]!.late) best[k] = { late, p };
  }
  // the reading that is further behind is the state: either one stopped is a feed that has stopped
  const worst = [best.rest, best.crypto].filter((x): x is { late: number; p: Print } => !!x).sort((x, y) => y.late - x.late)[0];
  if (!worst) return { expected: false, ok: true, newest: null, symbol: null, lateMin: null };
  const lateMin = Math.max(0, Math.round(worst.late));
  return { expected: true, ok: worst.late <= FEED_LATE_MIN, newest: new Date(Date.parse(worst.p.marketTime)).toISOString(), symbol: worst.p.symbol, lateMin };
}

// ---- after the close: did the prices stop before it? ----
// The Morning Note is written after New York has closed, from the last prices the Monitor holds. If the feed
// stopped during the session those are not closing levels, and the note must not present them as such
// (jobs/lib/pack.ts). The reading: the market's most recent regular close, and whether the last print falls more
// than half an hour short of it.

/** The moment (ms) that is `minute` minutes after midnight of the local date `ymd` in time zone `tz`. */
function zonedMs(tz: string, ymd: string, minute: number): number {
  const [y, mo, d] = ymd.split("-").map(Number), want = Date.UTC(y, mo - 1, d, 0, minute);
  let t = want;
  for (let k = 0; k < 3; k++) { const p = partsIn(tz, new Date(t)); t += want - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.m); }
  return t;
}
/** New York's usual half days (the session ends at 13:00): the Friday after Thanksgiving, 24 December, 3 July. */
const nyseHalfDay = (ymd: string, wd: number): boolean => { const md = ymd.slice(5), day = Number(ymd.slice(8)); return md === "12-24" || md === "07-03" || (ymd.slice(5, 7) === "11" && wd === 5 && day >= 23 && day <= 29); };
export const CLOSE_SHORT_MIN = 30;
/** For an exchange (not currencies or futures): null when its last print reaches its most recent regular close,
 *  or is newer; otherwise the close it fell short of and the print, both ISO. A close counts once the feed has
 *  had time to deliver it (its delay and twenty minutes). On New York's usual half days a last print at 13:00
 *  is taken as that day's close, not as a feed that stopped. */
export function stoppedBeforeClose(marketId: string, lastPrint: string | null, nowMs: number, holidays: Holidays = {}): { close: string; last: string } | null {
  const m = marketById(marketId), last = lastPrint ? Date.parse(lastPrint) : NaN;
  if (!m || m.id === "FX" || m.id === "CME" || m.id === "CRYPTO" || !Number.isFinite(last)) return null;
  const end = m.sessions[m.sessions.length - 1][1];
  for (let back = 0; back < 12; back++) {
    const p = partsIn(m.tz, new Date(nowMs - back * 86400e3));
    if (!m.days.includes(p.wd) || holidays[m.id]?.has(p.ymd)) continue;
    const close = zonedMs(m.tz, p.ymd, end);
    if (close + (m.delayMin + 20) * 60000 > nowMs) continue;   // not closed yet, or its close not yet delivered
    if (last >= close - CLOSE_SHORT_MIN * 60000) return null;
    const lp = partsIn(m.tz, new Date(last));
    if (m.id === "NYSE" && lp.ymd === p.ymd && nyseHalfDay(p.ymd, p.wd) && Math.abs(lp.h * 60 + lp.m - 13 * 60) <= 5) return null;
    return { close: new Date(close).toISOString(), last: new Date(last).toISOString() };
  }
  return null;
}

// ---- a daily bar is a close only once the answers in hand reach the end of its day ----
// On 18 Nov 2026 the source went on answering the Monitor's server with the prices of 10:52 New York time, while
// it gave GitHub's machines the real ones. After the bell the daily history, on the server, booked that last
// price as the day's close for every market still open at the stop: 7303.98 for the S&P 500, which closed at
// 7323.63. Crypto went on arriving the whole time, so the stop is read twice: for crypto, and for everything
// else together. The history now reads how far the answers in hand reach (the newest minute bar it is given)
// and books a bar only when they reach the end of that bar's day (_shared/history.ts). A run that is handed
// old answers books nothing new and overwrites nothing; a run that is handed current ones books as before.

/** When the day of a daily bar dated `ymd` ends (ms): an exchange's at the end of its last session (13:00 on New
 *  York's usual half days), a currency pair's and a CME future's at 17:00 New York, a crypto day at midnight
 *  UTC. Null for a market not known. */
export function barDayEnd(marketId: string, ymd: string): number | null {
  const m = marketById(marketId);
  if (!m) return null;
  if (m.id === "FX" || m.id === "CME") return zonedMs("America/New_York", ymd, 17 * 60);
  if (m.id === "CRYPTO") return zonedMs("UTC", ymd, 24 * 60);
  const [y, mo, d] = ymd.split("-").map(Number);
  if (m.id === "NYSE" && nyseHalfDay(ymd, new Date(Date.UTC(y, mo - 1, d)).getUTCDay())) return zonedMs(m.tz, ymd, 13 * 60);
  return zonedMs(m.tz, ymd, m.sessions[m.sessions.length - 1][1]);
}
/** Whether answers that reach `freshMs` can hold the close of this market's bar dated `ymd`: they must reach
 *  the end of that day, less the half hour an index may stop printing before its close. */
export function barSettled(marketId: string, ymd: string, freshMs: number, graceMin = CLOSE_SHORT_MIN): boolean {
  const end = barDayEnd(marketId, ymd);
  return end == null || end - graceMin * 60000 <= freshMs;
}
/** The grace when a market is read on its own minute bars alone: wider, because the Monitor's hours for a market
 *  can be off (Mexico's index is given minute bars that end an hour before the bell kept in sessions.ts). */
export const OWN_SHORT_MIN = 75;

// ---- a stop that is over leaves a silence in the stored minute bars ----
// Once prices arrive again the quotes no longer show that they had stopped, but the closes booked meanwhile are
// still there. The stop itself stays on record: an instrument that prints every minute round the clock on
// weekdays (USD/JPY) has a hole in its stored minute bars (bars_intraday).

/** Whether currencies trade at this moment: not from Friday 17:00 New York to Sunday 17:00, nor on 25 December
 *  or 1 January. */
export function fxTrading(ms: number): boolean {
  const p = partsIn("America/New_York", new Date(ms)), md = p.ymd.slice(5);
  if (md === "12-25" || md === "01-01") return false;
  return !(p.wd === 6 || (p.wd === 5 && p.h >= 17) || (p.wd === 0 && p.h < 17));
}
/** The longest silence of `minMin` minutes or more in the print times (ms, ascending) of an instrument that
 *  trades round the clock, among those that began while currencies trade; a silence that has not ended runs to
 *  `nowMs`. Null when there is none. `from` is the last print before it, `to` the first after it. */
export function silence(printsMs: number[], nowMs: number, minMin = 45): { from: number; to: number } | null {
  let best: { from: number; to: number } | null = null;
  for (let k = 1; k <= printsMs.length; k++) {
    const a = printsMs[k - 1], b = k < printsMs.length ? printsMs[k] : nowMs;
    if (b - a >= minMin * 60000 && fxTrading(a + 60000) && (!best || b - a > best.to - best.from)) best = { from: a, to: b };
  }
  return best;
}
