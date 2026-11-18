// The numbers on a stock's page that are worked out from its price history (Shota, 18 Nov 2026): the change
// over each horizon against the benchmark, the 52-week range, realised volatility, beta, and average turnover.
// No network and no database here: everything is a function of daily bars, checked in sim/logic.test.ts.
//
// A bar is one trading day: `t` is the day in Unix seconds at 00:00 UTC, `c` the close. Prices are as the feed
// gives them: adjusted for splits, not for dividends, so every change here is a price change, not a total return.
export interface Bar { t: number; c: number; h?: number | null; l?: number | null; v?: number | null }

const DAY = 86400;
const dayOf = (t: number): number => Math.floor(t / DAY);
const iso = (t: number): string => new Date(t * 1000).toISOString().slice(0, 10);

/** The same day of the month `months` earlier (30 Mar minus one month is the last day of February). */
export function monthsBack(t: number, months: number): number {
  const d = new Date(dayOf(t) * DAY * 1000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() - months, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(day, last)) / 1000;
}

/** The last bar on or before `t` (bars in time order), or null when the history starts later. */
export function barOnOrBefore(bars: Bar[], t: number): Bar | null {
  let lo = 0, hi = bars.length - 1, at = -1;
  const d = dayOf(t);
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (dayOf(bars[mid].t) <= d) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  return at < 0 ? null : bars[at];
}

export const HORIZONS: Array<{ h: string; months: number }> = [{ h: "1M", months: 1 }, { h: "3M", months: 3 }, { h: "6M", months: 6 }, { h: "12M", months: 12 }, { h: "36M", months: 36 }, { h: "60M", months: 60 }];
export interface PerfRow { h: string; from: string | null; base: number | null; stock: number | null; bench: number | null; rel: number | null }
const pct = (now: number | null | undefined, then: number | null | undefined): number | null => (now == null || then == null || !(then > 0) ? null : (now / then - 1) * 100);

/** The price now against the close one day, 1, 3, 6, 12, 36 and 60 months ago, the benchmark over the same
 *  dates, and the difference in percentage points (plus = the stock did better).
 *    last / prev        the stock's price now and its previous close (the quote), for the 1D row
 *    own, bench         daily bars; the latest bar may be today's
 *  A horizon is measured from the last close on or before the same calendar day N months before the stock's
 *  latest bar. Where the history does not reach that far the row is empty, never shortened. The benchmark is
 *  read at the same two dates (its last close on or before each), so both cover the same stretch of time. */
export function perfRows(own: Bar[], bench: Bar[], last: number | null, prev: number | null): PerfRow[] {
  const rows: PerfRow[] = [];
  const end = own.length ? own[own.length - 1] : null;
  const px = last ?? end?.c ?? null;
  const bEnd = end ? barOnOrBefore(bench, end.t) : null;
  // 1D: the quote's own previous close; the benchmark's close before its latest bar
  {
    const before = end ? barOnOrBefore(own, end.t - DAY) : null;
    const base = prev ?? before?.c ?? null;
    const bPrev = bEnd ? barOnOrBefore(bench, bEnd.t - DAY) : null;
    const s = pct(px, base), b = pct(bEnd?.c, bPrev?.c);
    rows.push({ h: "1D", from: before ? iso(before.t) : null, base, stock: s, bench: b, rel: s == null || b == null ? null : s - b });
  }
  for (const { h, months } of HORIZONS) {
    if (!end) { rows.push({ h, from: null, base: null, stock: null, bench: null, rel: null }); continue; }
    const at = monthsBack(end.t, months);
    const a = barOnOrBefore(own, at);
    // an anchor more than ten days older than asked for means the history has a hole there (or has only just begun)
    const ok = a != null && at - a.t <= 10 * DAY;
    const bA = ok ? barOnOrBefore(bench, a!.t) : null;
    const bOk = bA != null && a!.t - bA.t <= 10 * DAY;
    const s = ok ? pct(px, a!.c) : null, b = bOk ? pct(bEnd?.c, bA!.c) : null;
    rows.push({ h, from: ok ? iso(a!.t) : null, base: ok ? a!.c : null, stock: s, bench: b, rel: s == null || b == null ? null : s - b });
  }
  return rows;
}

export interface RangeStats { hi: number | null; hiDate: string | null; lo: number | null; loDate: string | null; fromHi: number | null; fromLo: number | null; pos: number | null }
/** The highest high and lowest low of the last 52 weeks (the closes where the feed has no highs and lows), how
 *  far the price now stands from each (per cent), and where it sits between them (0 = at the low, 100 = at the high). */
export function range52w(bars: Bar[], last: number | null): RangeStats {
  const end = bars.length ? bars[bars.length - 1] : null;
  if (!end) return { hi: null, hiDate: null, lo: null, loDate: null, fromHi: null, fromLo: null, pos: null };
  const from = monthsBack(end.t, 12);
  let hi = -Infinity, lo = Infinity, hiT = 0, loT = 0;
  for (const b of bars) {
    if (b.t <= from) continue;
    const h = b.h ?? b.c, l = b.l ?? b.c;
    if (h > hi) { hi = h; hiT = b.t; }
    if (l < lo) { lo = l; loT = b.t; }
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return { hi: null, hiDate: null, lo: null, loDate: null, fromHi: null, fromLo: null, pos: null };
  const px = last ?? end.c;
  return { hi, hiDate: iso(hiT), lo, loDate: iso(loT), fromHi: pct(px, hi), fromLo: pct(px, lo), pos: hi > lo ? Math.min(100, Math.max(0, ((px - lo) / (hi - lo)) * 100)) : null };
}

const logReturns = (bars: Bar[]): Array<{ d: number; r: number }> => {
  const out: Array<{ d: number; r: number }> = [];
  for (let i = 1; i < bars.length; i++) if (bars[i].c > 0 && bars[i - 1].c > 0) out.push({ d: dayOf(bars[i].t), r: Math.log(bars[i].c / bars[i - 1].c) });
  return out;
};
const mean = (xs: number[]): number => xs.reduce((a, x) => a + x, 0) / xs.length;

/** Realised volatility: the standard deviation of the last `n` daily log returns, as a yearly figure in per
 *  cent (times the square root of 252). Null with fewer than `n` returns. */
export function realisedVol(bars: Bar[], n: number): number | null {
  const r = logReturns(bars).slice(-n).map((x) => x.r);
  if (r.length < n || n < 2) return null;
  const m = mean(r);
  return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252) * 100;
}

/** Beta and correlation against the benchmark over the last `n` days on which both traded (daily log returns
 *  measured between consecutive common days). Null with fewer than `n` such days or a benchmark that did not move. */
export function betaCorr(own: Bar[], bench: Bar[], n: number): { beta: number | null; corr: number | null; days: number } {
  const b = new Map(bench.map((x) => [dayOf(x.t), x.c]));
  const both = own.filter((x) => b.has(dayOf(x.t)) && x.c > 0 && (b.get(dayOf(x.t)) as number) > 0).slice(-(n + 1));
  if (both.length < n + 1) return { beta: null, corr: null, days: Math.max(0, both.length - 1) };
  const ro: number[] = [], rb: number[] = [];
  for (let i = 1; i < both.length; i++) { ro.push(Math.log(both[i].c / both[i - 1].c)); rb.push(Math.log((b.get(dayOf(both[i].t)) as number) / (b.get(dayOf(both[i - 1].t)) as number))); }
  const mo = mean(ro), mb = mean(rb);
  let cov = 0, vo = 0, vb = 0;
  for (let i = 0; i < ro.length; i++) { cov += (ro[i] - mo) * (rb[i] - mb); vo += (ro[i] - mo) ** 2; vb += (rb[i] - mb) ** 2; }
  if (!(vb > 0) || !(vo > 0)) return { beta: null, corr: null, days: ro.length };
  return { beta: cov / vb, corr: cov / Math.sqrt(vo * vb), days: ro.length };
}

/** Average daily volume (shares) and average daily value traded (volume times the close, in the stock's
 *  currency) over the `n` sessions before the latest bar: the latest may be a day still in progress. */
export function avgTurnover(bars: Bar[], n: number): { shares: number | null; value: number | null; days: number } {
  const done = bars.slice(0, -1).filter((b) => b.v != null && b.v > 0).slice(-n);
  if (done.length < n) return { shares: null, value: null, days: done.length };
  return { shares: mean(done.map((b) => b.v as number)), value: mean(done.map((b) => (b.v as number) * b.c)), days: done.length };
}

/** The largest fall from a high to a later low within the last `months` months, in per cent (a negative
 *  number), with the dates of that high and low. Measured on closes. */
export function maxDrawdown(bars: Bar[], months: number): { pct: number | null; from: string | null; to: string | null } {
  const end = bars.length ? bars[bars.length - 1] : null;
  if (!end) return { pct: null, from: null, to: null };
  const start = monthsBack(end.t, months);
  let peak: Bar | null = null, worst = 0, a: Bar | null = null, z: Bar | null = null;
  for (const b of bars) {
    if (b.t < start) continue;
    if (!peak || b.c > peak.c) peak = b;
    const dd = b.c / peak.c - 1;
    if (dd < worst) { worst = dd; a = peak; z = b; }
  }
  return peak ? { pct: worst * 100, from: a ? iso(a.t) : null, to: z ? iso(z.t) : null } : { pct: null, from: null, to: null };
}
