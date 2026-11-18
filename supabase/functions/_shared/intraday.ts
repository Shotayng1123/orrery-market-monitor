// EQUITIES during a session (Shota, 19 Nov 2026): a list's names at today's prices while its market is open.
// No network and no database here; checked in sim/logic.test.ts.
//
// A row of constituent_stats holds the last close the daily job has booked (`d`, `close`, `prev`, `pct1d`) and,
// since this change, the last quote the flow job saw (`q_price`, `q_prev`, `q_time`). A quote that printed on a
// later session than `d` is today's: the day's change is then that price against its own previous close. Once the
// daily job has booked the session, `d` catches up and the row reads from its close again. Changes over longer
// periods (1W, 1M, ...) stay as measured to the last close; the page says so.
export interface DayRow { d: string; close: number; prev: number | null; pct1d: number | null; q_price?: number | null; q_prev?: number | null; q_time?: string | null }

/** The rows as they stand now. When at least half of them have a quote from a session later than their last
 *  close, each such row takes its quote: `close` = the last price, `prev` = the quote's previous close, `pct1d` =
 *  the move so far today; `live` says when the newest of those quotes printed and how many rows carry one. With
 *  fewer (a holiday for most names, a feed that stopped), nothing is changed: half a list at today's prices and
 *  half at yesterday's would rank and count wrongly. `sessionDate` gives the exchange's date of an instant. */
export function liveRows<T extends DayRow>(rows: T[], sessionDate: (iso: string) => string): { rows: T[]; live: { asOf: string; n: number } | null } {
  const fresh = (r: T): boolean => r.q_price != null && r.q_price > 0 && r.q_prev != null && r.q_prev > 0 && !!r.q_time && sessionDate(r.q_time) > r.d;
  const n = rows.filter(fresh).length;
  if (!n || n * 2 < rows.length) return { rows, live: null };
  let asOf = "";
  const out = rows.map((r) => {
    if (!fresh(r)) return r;
    if ((r.q_time as string) > asOf) asOf = r.q_time as string;
    return { ...r, close: r.q_price as number, prev: r.q_prev as number, pct1d: ((r.q_price as number) / (r.q_prev as number) - 1) * 100 };
  });
  return { rows: out, live: { asOf, n } };
}
