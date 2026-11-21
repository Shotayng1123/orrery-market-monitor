// Whether a page opens at its top (B's B-28, 20 Nov 2026): the rule alone. lib/nav.ts applies it to the browser's
// history and keeps where Back returns; it imports React for a list's kept state, and the logic checks
// (sim/logic.test.ts) run on GitHub where only jobs/ is installed, with none of the page's packages. On 21 Nov 2026
// they read this rule from lib/nav.ts and stopped there with "Cannot find module 'react'". So the rule lives here,
// in a file that imports nothing. Pure: sim/logic.test.ts checks it.

export interface NavRoute { view: string; sub: string }

/** Whether a new page opens at its top: a name's page (another name than the one on screen), or an index's page on
 *  EQUITIES opened from another tab. The tabs themselves keep what they do (on a phone the bottom bar goes to the top
 *  itself), and a piece of RESEARCH places itself. */
export function opensAtTop(from: NavRoute | null, to: NavRoute): boolean {
  if (to.view === "asset") return !!to.sub && !(from?.view === "asset" && from.sub === to.sub);
  if (to.view === "equities") return !!to.sub && !!from && from.view !== "equities";
  return false;
}
