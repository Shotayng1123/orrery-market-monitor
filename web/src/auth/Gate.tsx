import { useState, type FormEvent } from "react";
import { Logo } from "../components/Logo";
import { apiConfigured, login } from "../lib/api";

/** The sign-in gate: an ID the user chooses, the one shared password, and remember-me. */
export function Gate({ onSignedIn }: { onSignedIn: () => void }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cleanId = id.trim();
    if (!/^[A-Za-z0-9_.-]{2,32}$/.test(cleanId)) { setErr("ID: 2 to 32 letters, digits, . _ -"); return; }
    if (!pw) { setErr("Password required"); return; }
    setBusy(true); setErr("");
    const r = await login(cleanId, pw, remember);
    setBusy(false);
    if (r.ok) onSignedIn(); else setErr(r.error);
  }

  return (
    <div className="modal-bg">
      <form className="modal" onSubmit={submit} autoComplete="on">
        <h3><Logo />Orrery Monitor</h3>
        <div className="sub2">Market numbers, flow and trending data for professional investors. Information only; nothing here is investment advice.</div>
        <div className="row"><label className="k" htmlFor="g-id">Your ID</label><input id="g-id" type="text" value={id} onChange={(e) => setId(e.target.value)} placeholder="choose an ID, e.g. your initials" autoComplete="username" autoFocus /></div>
        <div className="row"><label className="k" htmlFor="g-pw">Password</label><input id="g-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="the shared password" autoComplete="current-password" /></div>
        <div className="row"><label className="chk"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember me on this browser (30 days)</label></div>
        <div className="err">{err || (!apiConfigured ? "API not configured on this build (VITE_API_URL)" : "")}</div>
        <button type="submit" className={`go${busy ? " busy" : ""}`} disabled={busy}>{busy ? "SIGNING IN…" : "SIGN IN"}</button>
        <div className="foot">Prices and index levels come from third-party feeds and may be delayed; each panel states its source and as-of time. Default clock: Singapore time.</div>
      </form>
    </div>
  );
}
