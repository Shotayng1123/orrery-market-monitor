import { useNet } from "../lib/net";
import { useUpdate } from "../lib/update";
import { fmtStamp } from "../lib/time";

/** The bars at the foot of every screen, sign-in included (above the tab bar on a phone):
 *  - the connection: shown when the server cannot be reached, or when a panel is showing what it last received
 *    instead of a fresh answer (lib/useApi.ts, lib/keep.ts), with the time of that data;
 *  - "A new version is ready" when a newer build than this page has been published (lib/update.ts). Update loads
 *    it and keeps the tab the reader was on. */
export function FootBars() {
  const net = useNet(), upd = useUpdate();
  const conn = net.offline || net.keptAt != null;
  if (!conn && !upd.id) return null;
  return (
    <div id="footbars">
      {conn && (
        <div id="netbar" role="status" className={net.offline ? "off" : "slow"}>
          <i aria-hidden="true" />
          <span>{net.offline ? "No connection." : "Slow connection."}{net.keptAt != null ? ` Data from ${fmtStamp(net.keptAt)}.` : ""}</span>
        </div>
      )}
      {upd.id && (
        <div id="updbar" role="status">
          <span>A new version is ready.</span>
          <button type="button" onClick={upd.apply}>Update</button>
        </div>
      )}
    </div>
  );
}
