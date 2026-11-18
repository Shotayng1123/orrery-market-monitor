// Has the price feed stopped? (19 Nov 2026.) On 18 Nov, from 15:52 UTC, every quote the source handed the Monitor
// carried the same print time for more than an hour and a half, with New York open and currencies trading: the
// S&P 500, USD/JPY, the futures, all 503 constituents. The pulls themselves succeeded every minute, so the header
// went on saying DATA OK. A job that runs on time proves that the Monitor asked, not that the answer was new.
//
// The reading here: among the instruments whose market is open now, and has been for half an hour, take the one
// that printed most recently, allowing each market its feed's own delay. If even that one is more than twenty
// minutes behind, no price is arriving. One quiet instrument proves nothing; all of them at once do.
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

export function feedState(prints: Print[], nowMs: number, holidays: Holidays = {}): FeedState {
  const now = new Date(nowMs);
  let best: { late: number; p: Print } | null = null;
  for (const p of prints) {
    const m = marketById(p.market), t = Date.parse(p.marketTime);
    if (!m || !Number.isFinite(t)) continue;
    // currencies and futures have no exchange calendar here, and on the two days the whole world is shut they do
    // not trade either: without this, 25 December and 1 January would read as a feed that has stopped
    if ((m.id === "FX" || m.id === "CME") && WORLD_SHUT.has(now.toISOString().slice(5, 10))) continue;
    // open now, and already open a while ago: just after an open or a lunch break the newest print is the one
    // from before it, and says nothing about the feed
    if (marketState(m, now, holidays) !== "OPEN" || marketState(m, new Date(nowMs - (FEED_OPEN_MIN + m.delayMin) * 60000), holidays) !== "OPEN") continue;
    const late = (nowMs - t) / 60000 - m.delayMin;
    if (!best || late < best.late) best = { late, p };
  }
  if (!best) return { expected: false, ok: true, newest: null, symbol: null, lateMin: null };
  const lateMin = Math.max(0, Math.round(best.late));
  return { expected: true, ok: best.late <= FEED_LATE_MIN, newest: new Date(Date.parse(best.p.marketTime)).toISOString(), symbol: best.p.symbol, lateMin };
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
