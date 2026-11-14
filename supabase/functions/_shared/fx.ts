// FX daily closes. Yahoo's daily bar for a currency pair ("…=X") does not carry the day's close: its "close"
// is the price at the start of the stamped day (00:00 London), i.e. roughly the previous day's level. Checked
// on 2026-11-14 against Yahoo's own hourly bars for USD/JPY, EUR/USD and USD/ZAR: daily close = first hourly
// open of the same day on every day compared. Indices, futures, yields and crypto are not affected.
// The Monitor therefore books an FX day the way the market does: the day ends at 17:00 New York, and the close
// is the last price before it, taken from the hourly bars. Pure functions, shared by the Edge Function and jobs/.
import { localDate } from "./sessions.ts";

export const isFxPair = (symbol: string): boolean => symbol.endsWith("=X");

const weekday = (ymd: string): number => new Date(ymd + "T00:00:00Z").getUTCDay();
const prevWeekday = (ymd: string): string => {
  const t = new Date(ymd + "T00:00:00Z");
  do t.setUTCDate(t.getUTCDate() - 1); while (t.getUTCDay() === 0 || t.getUTCDay() === 6);
  return t.toISOString().slice(0, 10);
};

/** The FX day an instant belongs to: the New York date, rolling over at 17:00 (so Sunday's open is Monday).
 *  The market is shut from Friday 17:00 to Sunday 17:00 New York; anything stamped in that gap (Yahoo re-stamps
 *  the last Friday quote of some pairs on Saturday) still belongs to Friday. */
export const fxDay = (epochSec: number): string => {
  const d = localDate("America/New_York", epochSec + 7 * 3600);
  return weekday(d) === 0 || weekday(d) === 6 ? prevWeekday(d) : d;
};

export const FX_SOURCE_HOURLY = "yahoo 1h (last price before 17:00 New York)";
export const FX_SOURCE_SHIFTED = "yahoo 1d (next day's 00:00 London level, about two hours after the 17:00 New York close)";

export interface FxClose { d: string; close: number }

/** How far a daily close may sit from both its neighbours before it is treated as a misprint. */
const EM_PAIRS = /^(TRY|ZAR|BRL|MXN|KRW|INR)=X$/;
export const spikeThreshold = (symbol: string, wild = false): number => (isFxPair(symbol) ? (EM_PAIRS.test(symbol) ? 0.12 : 0.05) : wild ? 0.6 : 0.3);

/** Closes from hourly bars (ascending): the last price of each FX day. Only finished days (17:00 New York passed). */
export function fxClosesFromHourly(ts: number[], close: Array<number | null>, nowSec: number): FxClose[] {
  const by = new Map<string, number>();
  for (let k = 0; k < ts.length; k++) {
    const v = close[k];
    if (v == null || !Number.isFinite(v) || ts[k] > nowSec) continue;
    const d = localDate("America/New_York", ts[k] + 7 * 3600);
    if (weekday(d) === 0 || weekday(d) === 6) continue;         // stamped after Friday's close (a re-stamped quote): not part of any day's close
    by.set(d, v);                                               // ascending bars: the last one of the day wins
  }
  // a day is finished once its 17:00 New York close has passed: compare with the calendar day "now" falls in
  // after the roll (a Saturday or Sunday at the weekend, so Friday counts as finished then)
  const today = localDate("America/New_York", nowSec + 7 * 3600);
  return [...by.entries()].filter(([d]) => d < today && weekday(d) >= 1 && weekday(d) <= 5).map(([d, c]) => ({ d, close: c })).sort((a, b) => a.d.localeCompare(b.d));
}

/** For history older than the hourly bars reach: a daily bar's value is the level about two hours after the
 *  17:00 New York close of the previous FX day, so it is booked on that previous day. (A Monday bar stands in
 *  for Friday and includes the weekend gap; rows from this path carry FX_SOURCE_SHIFTED.) */
export function fxClosesFromDaily(ts: number[], close: Array<number | null>): FxClose[] {
  const by = new Map<string, number>();
  for (let k = 0; k < ts.length; k++) {
    const v = close[k];
    if (v == null || !Number.isFinite(v)) continue;
    const d = fxDay(ts[k] - 4 * 3600);                          // four hours before the bar: inside the day that just closed, also in the weeks when London and New York clocks are an hour apart
    if (!by.has(d)) by.set(d, v);                               // first bar after the close wins (for Friday: a Saturday-stamped bar if there is one, else Monday's)
  }
  return [...by.entries()].map(([d, c]) => ({ d, close: c })).sort((a, b) => a.d.localeCompare(b.d));
}

/** Bars that cannot be real: far from both the three bars before and the (two or three) bars after, which agree
 *  with each other. Catches a vendor's one- or two-day misprints (a pair quoted 18% off for a day, an ETF reported
 *  at a tenth of its price) without touching a genuine move, where the later bars stay at the new level.
 *  The newest two bars are never judged: there is nothing after them to compare with yet. */
export function suspectBars(series: FxClose[], threshold: number): FxClose[] {
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
  const bad = new Set<number>();
  for (let k = 3; k < series.length - 2; k++) {
    const before = med(series.slice(k - 3, k).map((x) => x.close)), after = med(series.slice(k + 1, k + 4).map((x) => x.close));
    if (!(before > 0) || !(after > 0)) continue;
    const a = series[k].close / before - 1, b = series[k].close / after - 1;
    if (Math.abs(a) > threshold && Math.abs(b) > threshold && Math.sign(a) === Math.sign(b) && Math.abs(after / before - 1) < threshold / 2) bad.add(k);
  }
  return [...bad].map((k) => series[k]);
}
