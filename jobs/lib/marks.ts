// A results date's mark, counted (A's A-37, the second half of line 2 of its done-when; RM-2 of the checks of round
// 3b): how many names of each list come in each shape of Yahoo's answer, as the server's own quote request reads it
// (supabase/functions/_shared/yahoo.ts `quotes`, whose `fields=` list names isEarningsDateEstimate, and `earningsOf`).
// The four shapes:
//   a date with the flag true    Yahoo marks the date an estimate: the page writes "est."
//   a date with the flag false   Yahoo marks it confirmed: "conf." (outside Tokyo; a Tokyo company's reads "est.")
//   a date with no flag          the page writes a dash
//   no date ahead                no date at all, or one more than a day behind
// The count is also the only proof that the flag comes back to the server's own request: if no date of any list carries
// a flag of either kind, it does not, and every date outside Tokyo reads a dash for good after the migration of 22 Nov
// 2026 (20261121000002_results_mark_as_given.sql), which turned every stored false into "not said" until each list's
// next weekday quote run. Rows pulled before that deploy carry the migration's mark, not the source's: they are counted
// apart. Pure: the logic checks run it. It counts; it never prints a name (the live check's log is public).

export type Shape = "flagTrue" | "flagFalse" | "noFlag" | "noDate";
/** The moment the migration of 22 Nov 2026 ran on the live database (deploy-server, 04:59 UTC): a row pulled before it
 *  carries the migration's mark. */
export const MARKS_SINCE = "2026-11-22T04:59:00Z";
/** A stored row's shape (constituent_stats.earnings_at, earnings_est) or a quote's (QuoteRow.earningsAt, earningsEst). */
export function shapeOf(at: string | number | null | undefined, est: boolean | null | undefined): Shape {
  if (at == null || at === "") return "noDate";
  return est === true ? "flagTrue" : est === false ? "flagFalse" : "noFlag";
}
export interface ShapeCount { flagTrue: number; flagFalse: number; noFlag: number; noDate: number; total: number; before: number }
/** The four counts of the rows pulled since `since` (each row's `pulled`, ISO), and how many were pulled before it.
 *  Without `since` (or a row without its moment, as a quote asked now) every row counts. */
export function countShapes(rows: Array<{ at: string | number | null | undefined; est: boolean | null | undefined; pulled?: string | null }>, since?: string): ShapeCount {
  const c: ShapeCount = { flagTrue: 0, flagFalse: 0, noFlag: 0, noDate: 0, total: rows.length, before: 0 };
  for (const r of rows) {
    if (since && (!r.pulled || r.pulled < since)) { c.before++; continue; }
    c[shapeOf(r.at, r.est)]++;
  }
  return c;
}
/** One line of the log: "  SPX: 503 names; pulled since 22 Nov 04:59 UTC: a date with the flag true 210, …". */
export function marksLine(label: string, c: ShapeCount, since?: string): string {
  const counted = c.total - c.before;
  const shapes = `a date with the flag true ${c.flagTrue} · with the flag false ${c.flagFalse} · with no flag ${c.noFlag} · no date ahead ${c.noDate}`;
  const flagged = c.flagTrue + c.flagFalse, dated = flagged + c.noFlag;
  const verdict = counted === 0 ? "none counted" : dated === 0 ? "no date to judge the flag by" : flagged === 0 ? "NO DATE CARRIES A FLAG: the flag does not come back to this request" : `the flag comes back on ${flagged} of ${dated} dates`;
  return `  ${label}: ${c.total} names${since ? `; pulled since ${since.slice(0, 16).replace("T", " ")} UTC: ${counted} (before it: ${c.before}, the migration's mark)` : ""} · ${shapes} · ${verdict}`;
}
