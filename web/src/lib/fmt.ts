// Number formatting shared by every table and tile.
const cache = new Map<string, Intl.NumberFormat>();
function nf(decimals: number): Intl.NumberFormat {
  const k = String(decimals);
  let f = cache.get(k);
  if (!f) { f = new Intl.NumberFormat("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); cache.set(k, f); }
  return f;
}

/** Absolute level with the instrument's decimals; "–" when missing. */
export function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return nf(decimals).format(v);
}

/** Signed percentage, two decimals, "–" when missing. */
export function fmtPct(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const s = nf(decimals).format(Math.abs(v));
  return v > 0 ? `+${s}%` : v < 0 ? `-${s}%` : `${s}%`;
}

/** Signed change in level (for rates, in bp when `bp` is true). */
export function fmtChg(v: number | null | undefined, decimals = 2, bp = false): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const x = bp ? v * 100 : v;
  const s = nf(bp ? 1 : decimals).format(Math.abs(x));
  return (x > 0 ? "+" : x < 0 ? "-" : "") + s + (bp ? "bp" : "");
}

/** CSS class for a signed value. */
export const signCls = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) || v === 0 ? "" : v > 0 ? "up" : "dn");
