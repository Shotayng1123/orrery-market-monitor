// Rolling statistics for the sigma bands and period returns. Pure functions, unit-tested in sim/.

/** Rolling mean and population standard deviation over the trailing `window` points (inclusive).
 *  Entries before the window is full are null, so bands start only where they are defined. */
export function rollingBands(values: Array<number | null>, window: number): { mean: Array<number | null>; sd: Array<number | null> } {
  const n = values.length, mean: Array<number | null> = new Array(n).fill(null), sd: Array<number | null> = new Array(n).fill(null);
  if (window < 2) return { mean, sd };
  let sum = 0, sumSq = 0, count = 0;
  const q: Array<number | null> = [];
  for (let i = 0; i < n; i++) {
    const v = values[i];
    q.push(v);
    if (v != null) { sum += v; sumSq += v * v; count++; }
    if (q.length > window) { const out = q.shift()!; if (out != null) { sum -= out; sumSq -= out * out; count--; } }
    if (q.length === window && count === window) {
      const m = sum / count, varc = Math.max(0, sumSq / count - m * m);
      mean[i] = m; sd[i] = Math.sqrt(varc);
    }
  }
  return { mean, sd };
}

/** % change from `from` to `to`; null when either is missing or `from` is 0. */
export function pct(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null || from === 0) return null;
  return (to / from - 1) * 100;
}

export const SIGMA_WINDOWS = [{ key: "m1", days: 21, label: "1M σ" }, { key: "m12", days: 252, label: "12M σ" }, { key: "m36", days: 756, label: "36M σ" }] as const;
