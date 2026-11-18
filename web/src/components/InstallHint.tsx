import { hideInstallHint, runInstall, useInstall } from "../lib/install";

/** The "add to your home screen" hint of the phone layout (lib/install.ts): shown on the first screen until it is
 *  closed, and again from the menu. `home` is true on the screen the Monitor opens on. */
export function InstallHint({ home }: { home: boolean }) {
  const s = useInstall();
  if (s.installed || !(s.asked || (home && !s.hidden))) return null;
  const share = <svg className="sh" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-label="Share" role="img"><path d="M12 15V3.5M8 7l4-4 4 4M7 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1" /></svg>;
  return (
    <aside className="mp-a2hs" aria-label="Add the Monitor to your home screen">
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.6" /><path d="M12 8.5v7M8.5 12h7" /></svg>
      <div className="tx">
        <b>Add Orrery to your Home Screen</b>
        <span>It opens full screen like an app, with the same data.</span>
        {s.ios
          ? <span className="how">Open the Share menu {share} (on newer iPhones tap <b>···</b> first, then Share), choose <b>Add to Home Screen</b>, then <b>Add</b>. You sign in once more inside the app.</span>
          : s.canPrompt
            ? <span className="how">One tap: your browser adds the icon.</span>
            : <span className="how">Open your browser's menu and choose <b>Add to Home screen</b> or <b>Install app</b>.</span>}
        {!s.ios && s.canPrompt && <button type="button" className="go" onClick={() => void runInstall()}>Install</button>}
      </div>
      <button type="button" className="x" aria-label="Hide this hint" title="Hide this hint. It can be opened again from the menu" onClick={hideInstallHint}>&times;</button>
    </aside>
  );
}
