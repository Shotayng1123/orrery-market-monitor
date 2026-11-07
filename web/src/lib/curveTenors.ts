import type { Curve } from "./types";

/** Standard tenors shown on every curve (Shota): 1, 2, 3, 5, 7, 10, 15, 20 and 30 years. */
export const STD_YEARS = [1, 2, 3, 5, 7, 10, 15, 20, 30];
export type TenorSet = "std" | "bills";

/** Keeps the standard tenors, or the short end (one year and under) for the T-bill panel. */
export function filterCurve(c: Curve | null, set: TenorSet): Curve | null {
  if (!c) return null;
  const keep = set === "bills" ? c.points.filter((p) => p.years <= 1 + 1e-9) : c.points.filter((p) => STD_YEARS.some((y) => Math.abs(y - p.years) < 1e-6));
  return { ...c, points: keep };
}
