// Whether a page opens at its top (B's B-28, 20 Nov 2026): the rule alone. lib/nav.ts applies it to the browser's
// history and keeps where Back returns; it imports React for a list's kept state, and the logic checks
// (sim/logic.test.ts) run on GitHub where only jobs/ is installed, with none of the page's packages. On 21 Nov 2026
// they read this rule from lib/nav.ts and stopped there with "Cannot find module 'react'". So the rule lives here,
// in a file that imports nothing. Pure: sim/logic.test.ts checks it.

export interface NavRoute { view: string; sub: string }

/** A page of the paper portfolio's tab: its address without the section of Settings it opens at
 *  ("<id>/settings/limits" is the page "<id>/settings", which places itself at that section). */
export const portfolioPage = (sub: string): string => sub.replace(/^([^/]+\/settings)\/.*$/, "$1");

/** Whether a new page opens at its top: a name's page (another name than the one on screen), an index's page on
 *  EQUITIES opened from another tab, or another page of the paper portfolio's tab (a book from the list, Settings from
 *  Overview, the next step of the form). The tabs themselves keep what they do (on a phone the bottom bar goes to the
 *  top itself), and a piece of RESEARCH places itself. */
export function opensAtTop(from: NavRoute | null, to: NavRoute): boolean {
  if (to.view === "asset") return !!to.sub && !(from?.view === "asset" && from.sub === to.sub);
  if (to.view === "equities") return !!to.sub && !!from && from.view !== "equities";
  if (to.view === "portfolio") return from?.view === "portfolio" ? portfolioPage(from.sub) !== portfolioPage(to.sub) : !!to.sub;
  return false;
}
