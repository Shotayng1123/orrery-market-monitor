// The header's alert line on a computer (the designer's I-9 rule: label · name · figure · time, only the name ever
// cut), with what the figure is and, for a news alert that names no company the Monitor follows, what the alert is
// about and where it came from (the reviewer's R2A-05, 19 Nov 2026). Pure: sim/logic.test.ts checks it.

/** The server's wording of a move alert (supabase/functions/_shared/alerts.ts `alertMsg`): "<name> up|down 4.1%",
 *  with " intraday" when the figure was measured in the session. */
const MOVE = / (?:up|down) \d+(?:\.\d+)?%( intraday)?$/;

/** What a move alert's figure is, read from the server's own words, never guessed:
 *  - "intraday": a stock's largest move of the session (kept after the stock comes back), or an index's move while
 *    its market was open;
 *  - "at close": a stock measured at its official close (the only stock alert worded without "intraday");
 *  - "1D": an index's change on the day while its market was not trading (a lunch break, or after the close).
 *  null for a news alert, or for a message not in the server's wording. */
export function alertFigWord(a: { kind: string; msg: string }): "intraday" | "at close" | "1D" | null {
  if (a.kind !== "stock" && a.kind !== "index") return null;
  const m = MOVE.exec(a.msg);
  if (!m) return null;
  return m[1] ? "intraday" : a.kind === "stock" ? "at close" : "1D";
}

/** A news alert's headline without the kind the server puts in front ("M&A: Two lenders agree …"), for the name's
 *  place on the line when the alert names no company with a page here (newsalerts.ts: symbol "news:<id>"). */
export const alertHeadline = (msg: string): string => msg.replace(/^(?:M&A|Buyback|Guidance):\s*/, "");

/** A σ move's second line in a list that has no column for its kind (WATCHLIST, both layouts): "σ move · σ of 63
 *  daily changes to 19 Nov 2026 · Yahoo Finance", its kind and the window and source the server wrote with it
 *  (supabase/functions/_shared/sigma.ts sigmaNote); the kind alone where an alert carries no note. */
export const sigmaNoteLine = (a: { note?: string | null }): string => (a.note ? `σ move · ${a.note}` : "σ move");
