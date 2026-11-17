import { useState, type FormEvent } from "react";
import { Logo } from "../components/Logo";
import { apiConfigured, login, signup } from "../lib/api";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The gate: sign in with your email and your own password, or create an account (email, password, password
 *  again). A new account opens once the manager has approved it; a forgotten password is reset by the manager. */
export function Gate({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const up = mode === "up";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    setNote("");
    if (!EMAIL.test(em)) { setErr("Enter a valid email address"); return; }
    if (!pw) { setErr("Password required"); return; }
    if (up && pw.length < 8) { setErr("Password: at least 8 characters"); return; }
    if (up && pw !== pw2) { setErr("The two passwords do not match"); return; }
    setBusy(true); setErr("");
    if (up) {
      const r = await signup(em, pw);
      setBusy(false);
      if (!r.ok) { setErr(r.error); return; }
      setMode("in"); setPw(""); setPw2("");
      setNote("Account created. It opens once the manager has approved it; then sign in here.");
      return;
    }
    const r = await login(em, pw, remember);
    setBusy(false);
    if (r.ok) onSignedIn(); else setErr(r.error);
  }
  const swap = (m: "in" | "up") => { setMode(m); setErr(""); setNote(""); setPw(""); setPw2(""); };

  return (
    <div className="modal-bg">
      <form className="modal" onSubmit={submit} autoComplete="on">
        <h3><Logo />Orrery Monitor</h3>
        <div className="sub2">Market numbers, flow and trending data for professional investors. Information only; nothing here is investment advice.</div>
        <div className="gtabs"><span className={up ? "" : "on"} onClick={() => swap("in")}>SIGN IN</span><span className={up ? "on" : ""} onClick={() => swap("up")}>CREATE ACCOUNT</span></div>
        <div className="row"><label className="k" htmlFor="g-id">Email</label><input id="g-id" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="username" autoFocus /></div>
        <div className="row"><label className="k" htmlFor="g-pw">Password</label><input id="g-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={up ? "at least 8 characters" : "your password"} autoComplete={up ? "new-password" : "current-password"} /></div>
        {up && <div className="row"><label className="k" htmlFor="g-pw2">Confirm password</label><input id="g-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="the same password again" autoComplete="new-password" /></div>}
        {!up && <div className="row"><label className="chk"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember me on this browser (30 days)</label></div>}
        <div className={note && !err ? "err okmsg" : "err"}>{err || note || (!apiConfigured ? "API not configured on this build (VITE_API_URL)" : "")}</div>
        <button type="submit" className={`go${busy ? " busy" : ""}`} disabled={busy}>{busy ? (up ? "CREATING…" : "SIGNING IN…") : up ? "CREATE ACCOUNT" : "SIGN IN"}</button>
        <div className="foot">{up ? "One account per person. New accounts are approved by the manager before they open." : "Forgot your password? Ask the manager to reset it; you then choose a new one at your next sign-in."} Prices and index levels come from third-party feeds and may be delayed. Default clock: Singapore time.</div>
      </form>
    </div>
  );
}
