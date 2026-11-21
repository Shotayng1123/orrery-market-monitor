// The page's switch for the paper portfolio (P-1, 21 Nov 2026).
//
// P-1 to P-4a go live together: a paper book whose limits and ladder are not yet enforced would start a record under
// rules that change midway. Until P-4a is accepted the published page shows nothing of the paper book: no PORTFOLIO
// tab, no item in the phone's bar, no key 7, and "#portfolio" opens MARKETS as any unknown address does. Its screens
// are not in the published files at all: they are a file of their own, asked for behind __PAPER_BUILD__, which
// vite.config.ts sets from the constant below when it builds the page, so a build with the switch off does not make
// that file. The local copy and the checks' stand-in servers show all of it: they are development servers.
//
// To turn the paper book on: set PAPER_ON_LIVE_SITE to true here, and PAPER_ON_SERVER to true in
// supabase/functions/_shared/pf/switch.ts, in the same pull request (README.md, "The paper portfolio's two
// switches"). web/e2e/local-copy.cjs checks the built site for the state this constant says.
export const PAPER_ON_LIVE_SITE = false;

/** Whether this build carries the paper book: every development server, and the published site once the switch is on.
 *  Where code must be left out of a build without it (a file asked for on demand, words only that tab shows), the
 *  condition names __PAPER_BUILD__ itself: a build folds that name, and does not fold a constant of another file. */
export const PAPER_BUILD: boolean = __PAPER_BUILD__;

/** Whether the page shows it. On a development server `om_paper = "0"` in the browser's storage shows the page as it
 *  is published today (six tabs), so that a check can set the two side by side. */
function shown(): boolean {
  if (!PAPER_BUILD) return false;
  if (import.meta.env.DEV) { try { return localStorage.getItem("om_paper") !== "0"; } catch { return true; } }
  return true;
}
export const PAPER: boolean = shown();
