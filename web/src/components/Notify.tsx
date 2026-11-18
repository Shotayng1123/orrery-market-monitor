import { useEffect, useState } from "react";
import { Pick } from "./Pick";
import { PUSH_SCOPES, pushInfo, pushOff, pushOn, pushScope, pushTest, type PushInfo, type PushScope } from "../lib/push";

const WHY: Record<Exclude<PushInfo["why"], "">, string> = {
  "ios-browser": "On an iPhone, notifications work in the app on your Home Screen (iOS 16.4 or later), not in a browser tab. Add the Monitor to your Home Screen, open it from there and turn them on.",
  browser: "This browser cannot receive notifications from a web page.",
  worker: "Not available on this page yet. Reload it once and open this window again.",
  server: "Notifications are not set up on the server yet.",
};

/** The notifications window: alerts as notifications on this device, on or off, and which alerts (lib/push.ts). */
export function Notify({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<PushInfo | null>(null);
  const [scope, setScope] = useState<PushScope>("all");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = async () => { try { const i = await pushInfo(); setInfo(i); if (i.scope) setScope(i.scope); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); setInfo({ can: false, why: "", blocked: false, on: false, scope: null }); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const run = async (what: string, f: () => Promise<void>, done: string) => {
    setBusy(what); setMsg(null);
    try { await f(); setMsg(done ? { ok: true, text: done } : null); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    setBusy(""); await load();
  };
  const pick = (s: PushScope) => { setScope(s); if (info?.on) void run("scope", () => pushScope(s), s === "all" ? "This device now gets every alert." : "This device now gets alerts on your watchlist names only."); };
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal acct ntf" role="dialog" aria-label="Notifications">
        <h3><span>Notifications</span><span className="x" role="button" aria-label="Close" onClick={onClose}>&times;</span></h3>
        <div className="sub2">Alerts arrive on this device as notifications, also when the Monitor is closed: excessive moves, buybacks, guidance changes and large deals.</div>
        {!info ? <div className="sub2">Checking this device…</div> : !info.can ? (info.why && <div className="ntf-why">{WHY[info.why]}</div>) : (
          <>
            <div className={`ntf-state${info.on ? " on" : ""}`}><i aria-hidden="true" />{info.on ? "On for this device" : "Off for this device"}</div>
            <div className="row"><Pick<PushScope> label="Which alerts" value={scope} options={PUSH_SCOPES} onChange={pick} title="Every alert, or only alerts on the names of your watchlist" /></div>
            {info.blocked && !info.on && <div className="ntf-why">Notifications from the Monitor are blocked in this browser's settings. Allow them there, then turn them on here.</div>}
            {info.on ? (
              <>
                <button type="button" className={`go${busy === "test" ? " busy" : ""}`} disabled={!!busy} onClick={() => void run("test", pushTest, "Sent. It should arrive within a few seconds.")}>{busy === "test" ? "SENDING…" : "SEND A TEST"}</button>
                <button type="button" className={`go ghost${busy === "off" ? " busy" : ""}`} disabled={!!busy} onClick={() => void run("off", pushOff, "")}>{busy === "off" ? "TURNING OFF…" : "TURN OFF"}</button>
              </>
            ) : <button type="button" className={`go${busy === "on" ? " busy" : ""}`} disabled={!!busy} onClick={() => void run("on", () => pushOn(scope), "Notifications are on for this device.")}>{busy === "on" ? "TURNING ON…" : "TURN ON NOTIFICATIONS"}</button>}
          </>
        )}
        <div className={msg?.ok ? "err okmsg" : "err"}>{msg?.text ?? ""}</div>
        <div className="foot">Each device is switched on by itself. A burst of more than four alerts arrives as one notification.</div>
      </div>
    </div>
  );
}
