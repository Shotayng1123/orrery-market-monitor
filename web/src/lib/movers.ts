// Moves in σ on MARKETS (I-6, 20 Nov 2026; B-06 (a) and the designer's I-6 note): the MOVERS IN σ strip and the 1D IN σ
// column, from the market table's rows. Display only: every figure is the server's (supabase/functions/_shared/sigma.ts
// works them out: the day's change over the σ of the instrument's daily changes in the 63 sessions before it). Pure:
// sim/logic.test.ts checks it.
import type { TableRow } from "./types";
import { fmtDate } from "./time";
import { isOfficialRow, rowSource } from "./time";
import { cellBp, cellPct, fmtLevel, isYield } from "./fmt";
import { monthOf } from "./futures";

/** Ten cells, largest |σ| first; the alert line (2.5σ) gets an amber border, under 1.5σ the cell is lettered muted. */
export const STRIP_N = 10, SIGMA_LINE = 2.5, SIGMA_QUIET = 1.5;
const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** The largest moves of the day in σ, any class: the rows the MARKETS table shows that have a σ, largest |σ| first. */
export function moversInSigma(rows: TableRow[], n = STRIP_N): TableRow[] {
  return rows.filter((r) => r.marketTab !== false && ok(r.z1d)).sort((a, b) => Math.abs(b.z1d!) - Math.abs(a.z1d!) || a.order - b.order).slice(0, n);
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
export function commonWindow(rows: TableRow[]): { from: string; to: string } | null {
  const n = new Map<string, number>();
  for (const r of rows) if (r.zFrom && r.zTo) { const k = `${r.zFrom}|${r.zTo}`; n.set(k, (n.get(k) ?? 0) + 1); }
  const top = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const [from, to] = top[0].split("|");
  return { from, to };
}
/** The day's move as the strip writes it under the σ: "+1.9% · 158.420", a yield's in bp. */
export function moveLine(r: TableRow): string {
  const y = isYield(r), c = r.closes.d1;
  const v = y ? (c != null && r.last != null ? r.last - c : null) : r.pct.d1 ?? null;
  return `${y ? cellBp(v) : cellPct(v)} · ${fmtLevel(r.last, r.decimals, y)}`;
}
/** What a 1D IN σ figure is, for its cell and strip tooltip: the σ, the closes it is worked out from, and, for an official
 *  yield, the day it was measured on (it is published a day late); for a future across a roll, the change of contract
 *  left out. */
export function sigmaTip(r: TableRow): string {
  if (!ok(r.z1d)) {
    if (r.roll && r.roll.step == null) return `A change of contract today (to ${monthOf(r.roll.to)}): the source does not give the new contract's close before it, so the day has no σ`;
    if (r.z1d === undefined) return "No σ yet: the server sends it with the table once its update is deployed";
    if (!ok(r.sd1d)) return ok(r.zN) && r.zN < 60 ? `No σ: ${r.zN} daily changes stored, 60 needed` : ok(r.zN) ? `No σ: its ${r.zN} daily changes before the day do not move` : "No σ: fewer than 60 daily changes stored";
    return "No σ: there is no close to measure the day's change from";
  }
  const y = isYield(r), sd = r.sd1d;
  const sdTxt = ok(sd) ? (y ? `${(sd * 100).toFixed(1)}bp` : `${sd.toFixed(2)}%`) : "–";
  const parts = [`The day's change over the σ of the ${r.zN ?? 63} daily changes before it (${sdTxt} a day), worked out † from the daily closes of ${fmtDate(r.zFrom)} – ${fmtDate(r.zTo)} (${rowSource(r)})`];
  if (isOfficialRow(r) && r.lastAt) parts.push(`measured on ${fmtDate(r.lastAt.slice(0, 10))}'s close (published a day late)`);
  if (r.roll && r.roll.step != null) parts.push(`a change of contract today: ${r.roll.step >= 0 ? "+" : ""}${r.roll.step.toFixed(2)}% from ${monthOf(r.roll.from)} to ${monthOf(r.roll.to)}, left out (the day is the change within ${monthOf(r.roll.to)})`);
  return parts.join(" · ");
}
