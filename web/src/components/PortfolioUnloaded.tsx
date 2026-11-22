// When PORTFOLIO's own file cannot be loaded in this page (the second review of P-1, DC-4; the designer's B.1 words).
// The paper book's screens are a file of their own, asked for when the tab is first opened (App.tsx). A page of an
// earlier build asks for a file that a later publish has replaced, and a device that has never opened the tab on its
// build does not keep the file offline. In place of the crash notice ("Something in its data was not as expected",
// which is not so, with the browser's message and the file's address) the tab says what the page knows and offers what
// works: a failed load is kept until the page is loaded again, so only a reload or the published version helps.
//   the version check names a build other than this page's: the first sentence, with UPDATE (the update bar's action);
//   the device is offline: the second, with RELOAD;
//   otherwise (online; the check names this page's build or does not answer): the third, with RELOAD.
// Nothing is said of what the other version holds, nor whether it is newer. The console keeps the error.
// Only a build that carries the paper book reaches this file (App.tsx asks for it behind __PAPER_BUILD__).
import { useEffect, useState } from "react";
import { BUILD_ID, latestBuild, loadBuild } from "../lib/update";

type State = { k: "asking" } | { k: "other"; id: string } | { k: "offline" } | { k: "server" };
const offline = (): boolean => typeof navigator !== "undefined" && navigator.onLine === false;

export function PortfolioUnloaded({ error }: { error: unknown }) {
  const [s, set] = useState<State>(() => (offline() ? { k: "offline" } : { k: "asking" }));
  useEffect(() => {
    console.error("the PORTFOLIO tab could not be loaded in this page:", error);
    if (offline()) { set({ k: "offline" }); return; }
    let live = true;
    void latestBuild().then((id) => { if (live) set(id && id !== BUILD_ID ? { k: "other", id } : offline() ? { k: "offline" } : { k: "server" }); });
    return () => { live = false; };
  }, [error]);
  if (s.k === "asking") return <div className="c12 mut" id="pf-wait">loading…</div>;
  const reload = <button type="button" className="chip-sm" id="pf-reload" onClick={() => location.reload()}>RELOAD</button>;
  return (
    <div className="tabcrash pf-unloaded" id="pf-unloaded" role="alert" data-state={s.k}>
      {s.k === "other" && <p>PORTFOLIO could not be loaded in this page. The version of the Monitor published now is not this page's. <button type="button" className="chip-sm" id="pf-update" onClick={() => loadBuild(s.id)}>UPDATE</button></p>}
      {s.k === "offline" && <p>PORTFOLIO is not kept on this device, and the device is offline. {reload} once you are online.</p>}
      {s.k === "server" && <p>PORTFOLIO could not be loaded from the server. {reload}</p>}
    </div>
  );
}

/** What App.tsx's lazy import resolves to when the file could not be loaded: a tab that says so, never a throw. */
export const unloadedTab = (error: unknown) => function Unloaded(_props: { sub: string; tick: number; phone: boolean; classic: boolean }) { return <PortfolioUnloaded error={error} />; };
