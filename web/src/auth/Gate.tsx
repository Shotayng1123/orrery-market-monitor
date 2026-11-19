import { useEffect, useRef, useState, type FormEvent } from "react";
import { Logo } from "../components/Logo";
import { apiConfigured, authInfo, login, signup, signupFinish, signupStart, signupVerify, type AuthInfo } from "../lib/api";
import type { VerifyLink } from "../lib/verify";
import { keepPending, readPending, type Pending } from "../lib/pending";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The gate: sign in with your email and your own password, or create an account.
 *  A new account: give the email address; an email arrives with a "Verify my email" button; the button opens this
 *  page with the address verified (`verify`), where a password of your own finishes it and the Monitor opens.
 *  The email also shows a 6-digit code, for where the button is no use: on a phone it opens the browser, so
 *  someone in the Home Screen app types the code here instead.
 *  Where the server has no email sender (or is older than this screen) the earlier rule holds: email, password,
 *  password again, and the manager approves. A forgotten password is reset by the manager. */
export function Gate({ onSignedIn, verify }: { onSignedIn: () => void; verify?: VerifyLink | null }) {
  const [pend, setPend] = useState<Pending | null>(readPending);
  const [proof, setProof] = useState<VerifyLink | null>(null);       // an address the server has just confirmed
  const [checking, setChecking] = useState(!!verify);                // the button's link is being checked
  const [mode, setMode] = useState<"in" | "up">(pend || verify ? "up" : "in");
  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [email, setEmail] = useState(verify?.email ?? "");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { let live = true; void authInfo().then((i) => { if (live) setInfo(i); }); return () => { live = false; }; }, []);
  // opened by the button in the email: ask the server whether that link still stands
  const asked = useRef(false);
  useEffect(() => {
    if (!verify || asked.current) return;
    asked.current = true;
    void signupVerify(verify.email, verify.code).then((r) => {
      setChecking(false);
      if (r.ok) setProof(verify); else setErr(r.error);
    });
  }, [verify]);

  const up = mode === "up";
  const byEmail = info?.signup === "email";
  const choosing = up && proof ? proof : null;                             // verified: choose the password
  const waiting = up && !choosing && !checking && byEmail && pend ? pend : null;   // the email is out
  const asking = up && !choosing && !waiting && (checking || byEmail || info == null);   // only the address is asked for
  const wait = waiting ? Math.max(0, Math.ceil((waiting.at + waiting.resendSec * 1000 - now) / 1000)) : 0;
  const counting = wait > 0;
  useEffect(() => { if (!counting) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [counting]);

  const hold = (p: Pending | null) => { keepPending(p); setPend(p); setNow(Date.now()); };
  async function sendMail(to: string, again: boolean) {
    setBusy(true); setErr(""); setNote("");
    const r = await signupStart(to);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    const i = info ?? { codeMin: 15, resendSec: 60 };
    hold({ email: to, at: Date.now() - (r.sentAgo ?? 0) * 1000, codeMin: i.codeMin, resendSec: i.resendSec });
    setCode("");
    setNote(r.sentAgo != null ? "An email was sent to this address a moment ago. Use that one." : again ? "A new email was sent. The earlier one no longer works." : "");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || checking) return;
    setNote("");
    if (choosing) {
      if (pw.length < 8) { setErr("Password: at least 8 characters"); return; }
      if (pw !== pw2) { setErr("The two passwords do not match"); return; }
      setBusy(true); setErr("");
      const r = await signupFinish(choosing.email, choosing.code, pw, remember);
      setBusy(false);
      if (!r.ok) { setErr(r.error); return; }
      keepPending(null);
      onSignedIn();
      return;
    }
    if (waiting) {
      const c = code.replace(/[\s-]/g, "");
      if (!/^\d{6}$/.test(c)) { setErr("Enter the 6-digit code from the email"); return; }
      setBusy(true); setErr("");
      const r = await signupVerify(waiting.email, c);
      setBusy(false);
      if (!r.ok) { setErr(r.error); return; }
      setProof({ email: waiting.email, code: c });
      return;
    }
    const em = email.trim().toLowerCase();
    if (!EMAIL.test(em)) { setErr("Enter a valid email address"); return; }
    if (asking) { if (info) await sendMail(em, false); return; }
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
  const startAgain = () => { setEmail(choosing?.email ?? waiting?.email ?? email); setProof(null); hold(null); setCode(""); setPw(""); setPw2(""); setErr(""); setNote(""); };

  const label = checking ? "CHECKING THE LINK…" : choosing ? (busy ? "CREATING…" : "CREATE ACCOUNT") : waiting ? (busy ? "CHECKING…" : "CONTINUE")
    : asking ? (busy ? "SENDING…" : info ? "SEND VERIFICATION EMAIL" : "ONE MOMENT…") : busy ? (up ? "CREATING…" : "SIGNING IN…") : up ? "CREATE ACCOUNT" : "SIGN IN";
  const foot = choosing ? "From now on you sign in with this email address and this password."
    : waiting ? "Nothing after a minute? Look in the spam folder, then send a new email. Only the newest email works."
    : asking ? "One account per person. An email with a Verify my email button is sent to the address to check that it is yours; you then choose your password."
    : up ? "One account per person. New accounts are approved by the manager before they open."
    : "Forgot your password? Ask the manager to reset it; you then choose a new one at your next sign-in.";
  const remembering = <div className="row"><label className="chk"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember me on this browser (30 days)</label></div>;

  return (
    <div className="modal-bg">
      <form className="modal" onSubmit={submit} autoComplete="on">
        <h3><Logo />Orrery Monitor</h3>
        <div className="sub2">Market numbers, flow and trending data for professional investors. Information only; nothing here is investment advice.</div>
        <div className="gtabs"><span className={up ? "" : "on"} onClick={() => swap("in")}>SIGN IN</span><span className={up ? "on" : ""} onClick={() => swap("up")}>CREATE ACCOUNT</span></div>
        {choosing ? (
          <>
            <div className="gsent" id="g-verified"><span className="gtick" aria-hidden="true">&#10003;</span><b>{choosing.email}</b> is verified. Choose your password.</div>
            <input type="email" value={choosing.email} readOnly autoComplete="username" className="gkeep" tabIndex={-1} aria-hidden="true" />
            <div className="row"><label className="k" htmlFor="g-pw">Password</label><input id="g-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="at least 8 characters" autoComplete="new-password" autoFocus /></div>
            <div className="row"><label className="k" htmlFor="g-pw2">Confirm password</label><input id="g-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="the same password again" autoComplete="new-password" /></div>
            {remembering}
          </>
        ) : waiting ? (
          <>
            <div className="gsent" id="g-sent">A verification email was sent to <b>{waiting.email}</b>. Press <b>Verify my email</b> in it to choose your password. It is valid for {waiting.codeMin} minutes.</div>
            <div className="glinks">
              <button type="button" className="glink" id="g-again" disabled={busy || wait > 0} onClick={() => void sendMail(waiting.email, true)}>{wait > 0 ? `NEW EMAIL IN ${wait} S` : "SEND A NEW EMAIL"}</button>
              <button type="button" className="glink" id="g-other" disabled={busy} onClick={startAgain}>USE ANOTHER EMAIL</button>
            </div>
            <div className="gor">On the Home Screen app the button opens your browser. To carry on here instead, enter the 6-digit code from the same email.</div>
            <div className="row"><label className="k" htmlFor="g-code">Code from the email</label><input id="g-code" className="gcode" type="text" inputMode="numeric" pattern="[0-9 ]*" maxLength={7} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))} placeholder="6 digits" autoComplete="one-time-code" /></div>
          </>
        ) : (
          <>
            <div className="row"><label className="k" htmlFor="g-id">Email</label><input id="g-id" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="username" autoFocus /></div>
            {!asking && <div className="row"><label className="k" htmlFor="g-pw">Password</label><input id="g-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={up ? "at least 8 characters" : "your password"} autoComplete={up ? "new-password" : "current-password"} /></div>}
            {up && !asking && <div className="row"><label className="k" htmlFor="g-pw2">Confirm password</label><input id="g-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="the same password again" autoComplete="new-password" /></div>}
            {!up && remembering}
          </>
        )}
        <div className={note && !err ? "err okmsg" : "err"}>{err || note || (!apiConfigured ? "API not configured on this build (VITE_API_URL)" : "")}</div>
        <button type="submit" className={`go${busy || checking ? " busy" : ""}`} disabled={busy || checking || (asking && !info)}>{label}</button>
        {choosing && <div className="glinks"><button type="button" className="glink" id="g-other" disabled={busy} onClick={startAgain}>START AGAIN WITH ANOTHER EMAIL</button></div>}
        <div className="foot">{foot} Prices and index levels come from third-party feeds and may be delayed. Default clock: Singapore time.</div>
      </form>
    </div>
  );
}
