// Has the price feed stopped? (19 Nov 2026.) On 18 Nov, from 15:52 UTC, every quote the source handed the Monitor
// carried the same print time for more than an hour and a half, with New York open and currencies trading: the
// S&P 500, USD/JPY, the futures, all 503 constituents. The pulls themselves succeeded every minute, so the header
// went on saying DATA OK. A job that runs on time proves that the Monitor asked, not that the answer was new.
//
// The reading here: among the instruments whose market is open now, and has been for half an hour, take the one
// that printed most recently, allowing each market its feed's own delay. If even that one is more than twenty
// minutes behind, no price is arriving. One quiet instrument proves nothing; all of them at once do.
// No network and no database here; checked in sim/logic.test.ts.
import { marketById, marketState, type Holidays } from "./sessions.ts";

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
export const FEED_OPEN_MIN = 30;   // a market open for less than this (plus its delay) may not have printed yet

export function feedState(prints: Print[], nowMs: number, holidays: Holidays = {}): FeedState {
  const now = new Date(nowMs);
  let best: { late: number; p: Print } | null = null;
  for (const p of prints) {
    const m = marketById(p.market), t = Date.parse(p.marketTime);
    if (!m || !Number.isFinite(t)) continue;
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
