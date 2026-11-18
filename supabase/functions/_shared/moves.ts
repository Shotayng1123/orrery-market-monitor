// The measuring half of the stock alerts, kept free of the database so it can be checked without one
// (sim/logic.test.ts). The thresholds and the writing half are in alerts.ts.
import { marketState, recentlyClosed, type Holidays, type Market } from "./sessions.ts";

export interface SessionMove {
  pct: number;      // the largest move of the session against the previous close, signed, in %
  price: number;    // the price at that point
  crossT: number;   // epoch seconds of the first one-minute bar beyond the threshold
  lastT: number;    // epoch seconds of the session's latest bar (it dates the session)
  lastPct: number;  // where the latest bar stands, in %
}

/** The largest move of a session beyond ±`threshold` %, read from all of its one-minute closes; null when no bar
 *  passed the threshold. Until 18 Nov 2026 only the latest bar was tested, once every five minutes: a stock that
 *  went through the threshold and came back between two scans raised nothing (Rakuten Group that day: as low as
 *  -7.5% in the morning, -5.7% at the close, no alert). */
export function sessionMove(timestamp: number[], close: Array<number | null>, prev: number | null | undefined, threshold: number): SessionMove | null {
  if (prev == null || !(prev > 0)) return null;
  let best: number | null = null, bestPx = 0, crossT = 0, lastT = 0, lastPct = 0;
  for (let i = 0; i < close.length; i++) {
    const v = close[i];
    if (v == null || !(v > 0)) continue;
    const p = (v / prev - 1) * 100;
    lastT = timestamp[i]; lastPct = p;
    if (Math.abs(p) < threshold - 1e-9) continue;   // 930 against 1000 is -6.999999999999995 in floating point: a move of exactly the threshold counts
    if (best == null) crossT = timestamp[i];
    if (best == null || Math.abs(p) > Math.abs(best)) { best = p; bestPx = v; }
  }
  return best == null ? null : { pct: best, price: bestPx, crossT, lastT, lastPct };
}

/** Minutes the stock scan goes on after the close, on top of the feed's own delay. */
export const AFTER_CLOSE_MIN = 15;

/** Whether a market's stocks are due for the alert scan: while it is open or in its lunch break, and after the
 *  close for as long as the feed is behind plus a quarter of an hour. Tokyo prices reach us twenty minutes late,
 *  so a scan that stopped at the close (as it did until 18 Nov 2026) never saw the last twenty-five minutes of
 *  the session or the closing auction. */
export function scanDue(m: Market, now: Date, holidays: Holidays = {}): boolean {
  const st = marketState(m, now, holidays);
  return st === "OPEN" || st === "BREAK" || recentlyClosed(m, now, m.delayMin + AFTER_CLOSE_MIN, holidays);
}
