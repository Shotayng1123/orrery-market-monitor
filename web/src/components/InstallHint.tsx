import { askInstallHint, closeInstallSheet, hideInstallHint, runInstall, useInstall } from "../lib/install";
import { Sheet } from "./Sheet";

/** "Add Orrery to your Home Screen" (lib/install.ts), since 21 Nov 2026 in two parts (the designer's note on the
 *  phone's first MARKETS screen: the card with its steps stood 199 px between the data and the list).
 *  The line: one 44-px row on MARKETS, under the morning note in the same block. A tap opens the sheet with the steps;
 *  ✕ hides the line on this browser for good. Shown in a browser until hidden, never in the installed app. */
export function InstallLine() {
  const s = useInstall();
  if (s.installed || s.hidden) return null;
  return (
    <div className="mp-line" id="mk-install">
      <button type="button" className="open" aria-haspopup="dialog" onClick={askInstallHint}>
        <span className="tx"><span className="t one">Add Orrery to your Home Screen</span></span>
        <span className="go" aria-hidden="true">&rsaquo;</span>
      </button>
      <button type="button" className="x" aria-label="Hide this line" title="Hide this line. It can be opened again from the menu" onClick={hideInstallHint}>&times;</button>
    </div>
  );
}

/** The sheet: the hint's own words and the steps for this phone (the Share menu on an iPhone; one tap where the
 *  browser offers an install; else the browser's menu), then a way to hide the line on MARKETS. Opened from the line or
 *  from the menu's ADD TO HOME SCREEN on any tab; drawn once, by the app. */
export function InstallSheet() {
  const s = useInstall();
  if (s.installed || !s.asked) return null;
  const share = <svg className="sh" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-label="Share" role="img"><path d="M12 15V3.5M8 7l4-4 4 4M7 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1" /></svg>;
  return (
    <Sheet title="Add Orrery to your Home Screen" id="a2hs-sheet" onClose={closeInstallSheet}>
      <div className="a2hs-tx">
        <p>It opens full screen like an app, with the same data.</p>
        {s.ios
          ? <p className="how">Open the Share menu {share} (on newer iPhones tap <b>···</b> first, then Share), choose <b>Add to Home Screen</b>, then <b>Add</b>. You sign in once more inside the app.</p>
          : s.canPrompt
            ? <p className="how">One tap: your browser adds the icon.</p>
            : <p className="how">Open your browser's menu and choose <b>Add to Home screen</b> or <b>Install app</b>.</p>}
        {!s.ios && s.canPrompt && <button type="button" className="go" onClick={() => void runInstall()}>Install</button>}
      </div>
      {!s.hidden && <button type="button" className="sheet-link" id="a2hs-hide" onClick={() => { hideInstallHint(); }}>Hide the line on Markets</button>}
    </Sheet>
  );
}
