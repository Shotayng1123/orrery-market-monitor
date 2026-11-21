import { useEffect, useState } from "react";
import { Pick } from "./Pick";
import { DEFAULT_KINDS, KIND_GROUPS, NOTIFY_CHANGED, PUSH_SCOPES, SIGMA_LINES, openNotify, pushInfo, pushOff, pushOn, pushScope, pushTest, type PushInfo, type PushPrefs, type PushScope } from "../lib/push";
import { Sig } from "./Sig";

const WHY: Record<Exclude<PushInfo["why"], "">, string> = {
  "ios-browser": "On an iPhone, notifications work in the app on your Home Screen (iOS 16.4 or later), not in a browser tab. Add the Monitor to your Home Screen, open it from there and turn them on.",
  browser: "This browser cannot receive notifications from a web page.",
  worker: "Not available on this page yet. Reload it once and open this window again.",
  server: "Notifications are not set up on the server yet.",
};

/** One line where a phone lists alerts (the watchlist): how to get them as notifications. Shown only while this
 *  device does not get them and could, or could once the Monitor is on the Home Screen; gone once they are on.
 *  (19 Nov 2026: notifications were offered only from the menu, where a new reader does not look.) */
export function NotifyNudge() {
  const [info, setInfo] = useState<PushInfo | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => { pushInfo().then((i) => { if (live) setInfo(i); }).catch(() => { /* nothing known: nothing offered */ }); };
    load();
    window.addEventListener(NOTIFY_CHANGED, load);
    return () => { live = false; window.removeEventListener(NOTIFY_CHANGED, load); };
  }, []);
  if (!info || info.on) return null;
  if (info.can) return <div className="mp-nudge" id="ntf-nudge"><span>Get these as notifications on this phone, as they happen.</span><button type="button" onClick={openNotify}>TURN ON</button></div>;
  if (info.why === "ios-browser") return <div className="mp-nudge" id="ntf-nudge"><span>To get these as notifications, add the Monitor to your Home Screen and open it from there.</span></div>;
  return null;
}

/** The notifications window: alerts as notifications on this device, on or off, and which alerts (lib/push.ts). */
export function Notify({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<PushInfo | null>(null);
  const [scope, setScope] = useState<PushScope>("all");
  // which kinds this device receives (I-6): what it received before until it chooses; σ moves are new, and off
  const [kinds, setKinds] = useState<string[]>(DEFAULT_KINDS);
  const [line, setLine] = useState<"2" | "2.5" | "3">("2.5");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = async () => { try { const i = await pushInfo(); setInfo(i); if (i.scope) setScope(i.scope); if (i.kinds) setKinds(i.kinds); if (i.sigmaLine != null) setLine(String(i.sigmaLine) as "2" | "2.5" | "3"); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); setInfo({ can: false, why: "", blocked: false, on: false, scope: null }); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const run = async (what: string, f: () => Promise<void>, done: string) => {
    setBusy(what); setMsg(null);
    try { await f(); setMsg(done ? { ok: true, text: done } : null); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    setBusy(""); await load();
  };
  const prefs = (k: string[] = kinds, l: string = line): PushPrefs => ({ kinds: k, sigmaLine: Number(l) });
  const pick = (s: PushScope) => { setScope(s); if (info?.on) void run("scope", () => pushScope(s, prefs()), s === "all" ? "This device now gets every alert." : "This device now gets alerts on your watchlist names only."); };
  const toggle = (group: string[], on: boolean) => {
    const next = on ? [...new Set([...kinds, ...group])] : kinds.filter((k) => !group.includes(k));
    setKinds(next);
    if (info?.on) void run("kinds", () => pushScope(scope, prefs(next)), "Saved for this device.");
  };
  const pickLine = (l: "2" | "2.5" | "3") => { setLine(l); if (info?.on && kinds.includes("sigma")) void run("line", () => pushScope(scope, prefs(kinds, l)), `σ moves from ${Number(l).toFixed(1)}σ on this device.`); };
  // a kind this device has never been offered shows "new" beside it until the device has chosen its kinds
  const chosen = !!info?.kinds;
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal acct ntf" role="dialog" aria-label="Notifications">
        <h3><span>Notifications</span><span className="x" role="button" aria-label="Close" onClick={onClose}>&times;</span></h3>
        <div className="sub2">Alerts arrive on this device as notifications, also when the Monitor is closed: excessive moves, σ moves, buybacks, guidance changes and large deals.</div>
        {!info ? <div className="sub2">Checking this device…</div> : !info.can ? (info.why && <div className="ntf-why">{WHY[info.why]}</div>) : (
          <>
            <div className={`ntf-state${info.on ? " on" : ""}`}><i aria-hidden="true" />{info.on ? "On for this device" : "Off for this device"}</div>
            <div className="row"><Pick<PushScope> label="Which alerts" value={scope} options={PUSH_SCOPES} onChange={pick} title="Every alert, or only alerts on the names of your watchlist" id="ntf-scope" /></div>
            <div className="ntf-kinds" id="ntf-kinds" role="group" aria-label="Which kinds">
              <div className="k">Which kinds</div>
              {KIND_GROUPS.map((g) => {
                const on = g.kinds.every((k) => kinds.includes(k));
                return (
                  <div className="ntf-kind" key={g.key} data-kind={g.key}>
                    <label className="chk"><input type="checkbox" checked={on} disabled={!!busy} onChange={(e) => toggle(g.kinds, e.target.checked)} /><span><Sig>{g.label}</Sig></span>{g.isNew && !chosen && <span className="badge est ntf-new">new</span>}</label>
                    {g.key === "sigma" && <Pick label="Line" value={line} options={SIGMA_LINES} onChange={pickLine} id="ntf-line" title="A σ move reaches this device once it passes this line: a currency, yield, commodity, volatility index, future or coin against the σ of its own daily changes over 63 sessions. The alert list keeps 2.5σ for everyone" />}
                  </div>
                );
              })}
            </div>
            {info.blocked && !info.on && <div className="ntf-why">Notifications from the Monitor are blocked in this browser's settings. Allow them there, then turn them on here.</div>}
            {info.on ? (
              <>
                <button type="button" className={`go${busy === "test" ? " busy" : ""}`} disabled={!!busy} onClick={() => void run("test", pushTest, "Sent. It should arrive within a few seconds.")}>{busy === "test" ? "SENDING…" : "SEND A TEST"}</button>
                <button type="button" className={`go ghost${busy === "off" ? " busy" : ""}`} disabled={!!busy} onClick={() => void run("off", pushOff, "")}>{busy === "off" ? "TURNING OFF…" : "TURN OFF"}</button>
              </>
            ) : <button type="button" className={`go${busy === "on" ? " busy" : ""}`} disabled={!!busy} onClick={() => void run("on", () => pushOn(scope, prefs()), "Notifications are on for this device.")}>{busy === "on" ? "TURNING ON…" : "TURN ON NOTIFICATIONS"}</button>}
          </>
        )}
        <div className={msg?.ok ? "err okmsg" : "err"}>{msg?.text ?? ""}</div>
        <div className="foot">Each device is switched on by itself. A burst of more than four alerts arrives as one notification.</div>
      </div>
    </div>
  );
}
