import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "../components/Logo";
import { apiConfigured, authInfo, login, signup, signupFinish, signupStart, type AuthInfo } from "../lib/api";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A code that is on its way is remembered on this device (the address and the time only, never the code or a
// password): on a phone the person leaves for the mail app, and the page may be started afresh when they return.
const PEND = "om_signup";
interface Pending { email: string; at: number; codeMin: number; resendSec: number }
function readPending(): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(PEND) ?? "null") as Pending | null;
    return p && typeof p.email === "string" && typeof p.at === "number" && Date.now() - p.at < (p.codeMin || 15) * 60e3 ? p : null;
  } catch { return null; }
}
function keepPending(p: Pending | null): void { try { if (p) localStorage.setItem(PEND, JSON.stringify(p)); else localStorage.removeItem(PEND); } catch { /* storage blocked: the step still works until the page is closed */ } }

/** The gate: sign in with your email and your own password, or create an account.
 *  A new account: give the email address, receive a 6-digit code there, enter it with a password of your own, and
 *  the Monitor opens. Where the server has no email sender (or is older than this screen) the earlier rule
 *  holds instead: email, password, password again, and the manager approves. A forgotten password is reset by
 *  the manager. */
export function Gate({ onSignedIn }: { onSignedIn: () => void }) {
  const [pend, setPend] = useState<Pending | null>(readPending);
  const [mode, setMode] = useState<"in" | "up">(pend ? "up" : "in");
  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { let live = true; void authInfo().then((i) => { if (live) setInfo(i); }); return () => { live = false; }; }, []);

  const up = mode === "up";
  const byEmail = info?.signup === "email";
  const step2 = up && byEmail && pend ? pend : null;          // the code is out: enter it and choose the password
  const asking = up && !step2 && (byEmail || info == null);   // only the address is asked for
  const wait = step2 ? Math.max(0, Math.ceil((step2.at + step2.resendSec * 1000 - now) / 1000)) : 0;
  const counting = wait > 0;
  useEffect(() => { if (!counting) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [counting]);

  const hold = (p: Pending | null) => { keepPending(p); setPend(p); setNow(Date.now()); };
  async function sendCode(to: string, again: boolean) {
    setBusy(true); setErr(""); setNote("");
    const r = await signupStart(to);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    const i = info ?? { codeMin: 15, resendSec: 60 };
    hold({ email: to, at: Date.now() - (r.sentAgo ?? 0) * 1000, codeMin: i.codeMin, resendSec: i.resendSec });
    setCode("");
    setNote(r.sentAgo != null ? "A code was sent to this address a moment ago. Enter that one." : again ? "A new code was sent. The earlier one no longer works." : "");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setNote("");
    if (step2) {
      const c = code.replace(/[\s-]/g, "");
      if (!/^\d{6}$/.test(c)) { setErr("Enter the 6-digit code from the email"); return; }
      if (pw.length < 8) { setErr("Password: at least 8 characters"); return; }
      if (pw !== pw2) { setErr("The two passwords do not match"); return; }
      setBusy(true); setErr("");
      const r = await signupFinish(step2.email, c, pw, remember);
      setBusy(false);
      if (!r.ok) { setErr(r.error); return; }
      keepPending(null);
      onSignedIn();
      return;
    }
    const em = email.trim().toLowerCase();
    if (!EMAIL.test(em)) { setErr("Enter a valid email address"); return; }
    if (asking) { if (info) await sendCode(em, false); return; }
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
  const otherEmail = () => { setEmail(step2?.email ?? email); hold(null); setCode(""); setPw(""); setPw2(""); setErr(""); setNote(""); };

  const label = step2 ? (busy ? "CREATING…" : "CREATE ACCOUNT") : asking ? (busy ? "SENDING…" : info ? "SEND CODE" : "ONE MOMENT…") : busy ? (up ? "CREATING…" : "SIGNING IN…") : up ? "CREATE ACCOUNT" : "SIGN IN";
  const foot = step2 ? "Nothing after a minute? Look in the spam folder, then send a new code. Only the newest code works."
    : asking ? "One account per person. A 6-digit code is emailed to the address to check that it is yours; you then choose your password."
    : up ? "One account per person. New accounts are approved by the manager before they open."
    : "Forgot your password? Ask the manager to reset it; you then choose a new one at your next sign-in.";

  return (
    <div className="modal-bg">
      <form className="modal" onSubmit={submit} autoComplete="on">
        <h3><Logo />Orrery Monitor</h3>
        <div className="sub2">Market numbers, flow and trending data for professional investors. Information only; nothing here is investment advice.</div>
        <div className="gtabs"><span className={up ? "" : "on"} onClick={() => swap("in")}>SIGN IN</span><span className={up ? "on" : ""} onClick={() => swap("up")}>CREATE ACCOUNT</span></div>
        {step2 ? (
          <>
            <div className="gsent">A 6-digit code was sent to <b>{step2.email}</b>. Enter it here and choose your password. The code is valid for {step2.codeMin} minutes.</div>
            <input type="email" value={step2.email} readOnly autoComplete="username" className="gkeep" tabIndex={-1} aria-hidden="true" />
            <div className="row"><label className="k" htmlFor="g-code">Code from the email</label><input id="g-code" className="gcode" type="text" inputMode="numeric" pattern="[0-9 ]*" maxLength={7} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))} placeholder="6 digits" autoComplete="one-time-code" autoFocus /></div>
            <div className="row"><label className="k" htmlFor="g-pw">Password</label><input id="g-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="at least 8 characters" autoComplete="new-password" /></div>
            <div className="row"><label className="k" htmlFor="g-pw2">Confirm password</label><input id="g-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="the same password again" autoComplete="new-password" /></div>
            <div className="row"><label className="chk"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember me on this browser (30 days)</label></div>
          </>
        ) : (
          <>
            <div className="row"><label className="k" htmlFor="g-id">Email</label><input id="g-id" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="username" autoFocus /></div>
            {!asking && <div className="row"><label className="k" htmlFor="g-pw">Password</label><input id="g-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={up ? "at least 8 characters" : "your password"} autoComplete={up ? "new-password" : "current-password"} /></div>}
            {up && !asking && <div className="row"><label className="k" htmlFor="g-pw2">Confirm password</label><input id="g-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="the same password again" autoComplete="new-password" /></div>}
            {!up && <div className="row"><label className="chk"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember me on this browser (30 days)</label></div>}
          </>
        )}
        <div className={note && !err ? "err okmsg" : "err"}>{err || note || (!apiConfigured ? "API not configured on this build (VITE_API_URL)" : "")}</div>
        <button type="submit" className={`go${busy ? " busy" : ""}`} disabled={busy || (asking && !info)}>{label}</button>
        {step2 && (
          <div className="glinks">
            <button type="button" className="glink" id="g-again" disabled={busy || wait > 0} onClick={() => void sendCode(step2.email, true)}>{wait > 0 ? `NEW CODE IN ${wait} S` : "SEND A NEW CODE"}</button>
            <button type="button" className="glink" id="g-other" disabled={busy} onClick={otherEmail}>USE ANOTHER EMAIL</button>
          </div>
        )}
        <div className="foot">{foot} Prices and index levels come from third-party feeds and may be delayed. Default clock: Singapore time.</div>
      </form>
    </div>
  );
}
