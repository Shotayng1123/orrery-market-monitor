import { Component, type ReactNode } from "react";

/** Keeps an error thrown while a tab is drawn inside that tab. Without it React takes the whole page down: the
 *  header, the alerts and the other tabs went blank with it (seen on the desktop watchlist of the stand-in site,
 *  19 Nov 2026, when its feed came without one of its lists). The header stays, the other tabs open as usual,
 *  and the tab says what happened and offers to draw itself again. Keyed by the tab in App, so moving to another
 *  tab starts clean. */
export class TabGuard extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error): { error: Error } { return { error }; }
  // another page of the same tab (another stock, another index, another piece) is drawn afresh
  componentDidUpdate(prev: { resetKey?: string }): void { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  componentDidCatch(error: Error): void { console.error("this tab could not be drawn:", error); }
  render(): ReactNode {
    const e = this.state.error;
    if (!e) return this.props.children;
    return (
      <div className="tabcrash" id="tab-crash" role="alert">
        <b>THIS TAB COULD NOT BE DRAWN</b>
        <p>Something in its data was not as expected. The other tabs are not affected.</p>
        <p className="mut">{e.message}</p>
        <button type="button" className="chip-sm" id="tab-retry" onClick={() => this.setState({ error: null })}>TRY AGAIN</button>
      </div>
    );
  }
}

/** For the browser checks only (development builds): throws while drawing when the browser's storage holds
 *  `om_crash` = this tab's id. */
export function CrashSwitch({ view }: { view: string }): null {
  let on = false;
  try { on = localStorage.getItem("om_crash") === view; } catch { /* no storage: no switch */ }
  if (on) throw new Error(`crash switch for the ${view} tab (a browser check)`);
  return null;
}
