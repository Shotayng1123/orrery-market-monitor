import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminSet, api, changePassword, mailTest, type AccountRow, type AdminUsers, type Me } from "../lib/api";
import { fmtStampSafe } from "../views/shared";

/** The change-password form. `forced` is the screen after a manager's reset: nothing else opens until it is done. */
export function ChangePassword({ forced, onDone }: { forced?: boolean; onDone: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setOk(false);
    if (!cur) { setErr("Enter your current password"); return; }
    if (next.length < 8) { setErr("New password: at least 8 characters"); return; }
    if (next !== next2) { setErr("The two new passwords do not match"); return; }
    setBusy(true); setErr("");
    const r = await changePassword(cur, next);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setCur(""); setNext(""); setNext2(""); setOk(true);
    onDone();
  }
  return (
    <form onSubmit={submit} autoComplete="on">
      <div className="row"><label className="k" htmlFor="c-cur">{forced ? "The password you signed in with" : "Current password"}</label><input id="c-cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></div>
      <div className="row"><label className="k" htmlFor="c-new">New password</label><input id="c-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="at least 8 characters" autoComplete="new-password" /></div>
      <div className="row"><label className="k" htmlFor="c-new2">Confirm new password</label><input id="c-new2" type="password" value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" /></div>
      <div className={ok && !err ? "err okmsg" : "err"}>{err || (ok ? "Password changed. Other devices are signed out." : "")}</div>
      <button type="submit" className={`go${busy ? " busy" : ""}`} disabled={busy}>{busy ? "SAVING…" : "CHANGE PASSWORD"}</button>
    </form>
  );
}

/** Asked before an account is deactivated (or a waiting one rejected): what it does, in full, and a way back. */
function ConfirmOff({ row, busy, onYes, onNo }: { row: AccountRow; busy: boolean; onYes: () => void; onNo: () => void }) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onNo(); } }; window.addEventListener("keydown", f, true); return () => window.removeEventListener("keydown", f, true); }, [onNo]);
  const waiting = row.status === "pending";
  return (
    <div className="modal-bg confirm" onClick={(e) => { e.stopPropagation(); onNo(); }}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-title" aria-describedby="cf-text" onClick={(e) => e.stopPropagation()}>
        <h3 id="cf-title">{waiting ? "Reject this account?" : "Deactivate this account?"}</h3>
        <div className="cf-who">{row.email}</div>
        <div className="sub2" id="cf-text">
          {waiting ? "This person asked for an account and has not been let in. Rejected, they can neither sign in nor ask again with this address."
            : "They are signed out on every device within a minute and stop receiving alerts on their phone. They can neither sign in nor create the account again."}
          {" "}Their watchlist is kept. You can switch the account back on at any time (REACTIVATE){waiting ? "." : "; they then sign in again and turn notifications back on themselves."}
        </div>
        <div className="cf-btns">
          <button type="button" className="go ghost" id="cf-no" onClick={onNo} autoFocus>CANCEL</button>
          <button type="button" className={`go danger${busy ? " busy" : ""}`} id="cf-yes" disabled={busy} onClick={onYes}>{busy ? "…" : waiting ? "REJECT" : "DEACTIVATE"}</button>
        </div>
      </div>
    </div>
  );
}

const STATUS: Record<AccountRow["status"], string> = { active: "active", pending: "waiting", disabled: "deactivated" };

/** Manager only: who has an account, with deactivate (asked twice) / reactivate / reset password, and approve for
 *  an account that still waits (only where the server has no email sender, or from before accounts by email). */
function Accounts({ me }: { me: Me }) {
  const [data, setData] = useState<AdminUsers | null>(null);
  const [err, setErr] = useState("");
  const [temp, setTemp] = useState<{ email: string; pw: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [ask, setAsk] = useState<AccountRow | null>(null);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const rows = data?.rows ?? null;
  const load = useCallback(async () => {
    try { setData(await api<AdminUsers>("admin_users")); setErr(""); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function act(email: string, op: "approve" | "enable" | "disable" | "reset") {
    setBusy(email + op); setErr("");
    const r = await adminSet(email, op);
    setBusy("");
    if (op === "disable") setAsk(null);
    if (!r.ok) { setErr(r.error); return; }
    if (op === "reset" && r.tempPassword) setTemp({ email, pw: r.tempPassword });
    void load();
  }
  async function sendTest() {
    setBusy("mailtest"); setTest(null);
    const r = await mailTest();
    setBusy("");
    setTest(r.ok ? { ok: true, text: `Sent to ${r.to}. If it is not in the inbox within a minute, look in the spam folder.` } : { ok: false, text: r.error });
  }
  const pending = (rows ?? []).filter((r) => r.status === "pending").length;
  const mail = data?.mail;
  return (
    <div className="acct-adm">
      <div className="minih">Accounts{rows ? ` · ${rows.length}` : ""}{pending ? ` · ${pending} waiting for approval` : ""}</div>
      {mail && (
        <div className="mailline" id="mailline">
          {mail.ready ? <>New accounts open by themselves: a code is emailed from <b>{mail.from}</b>{mail.via ? ` (${mail.via})` : ""}.<span className="chip-sm" id="mailtest" onClick={() => { if (busy !== "mailtest") void sendTest(); }}>{busy === "mailtest" ? "SENDING…" : "SEND A TEST EMAIL"}</span></>
            : mail.problem ? <><span className="warn">The email sender's set-up has a mistake: {mail.problem}.</span> Until it is put right, a new account waits here for your approval.</>
            : <>No email sender is set up on the server, so a new account waits here for your approval.</>}
          {test && <div className={test.ok ? "up" : "dn"} id="mailtest-r">{test.text}</div>}
        </div>
      )}
      {temp && (
        <div className="temppw">
          Temporary password for <b>{temp.email}</b>: <code>{temp.pw}</code>
          <span className="chip-sm" onClick={() => { void navigator.clipboard?.writeText(temp.pw); }}>COPY</span>
          <span className="chip-sm" onClick={() => setTemp(null)}>HIDE</span>
          <div className="mut">Shown once. Pass it on privately; they must choose a new password when they sign in with it.</div>
        </div>
      )}
      {err && <div className="err">{err}</div>}
      <div className="acct-scroll">
        <table className="secT"><thead><tr><th className="l">Email</th><th className="l">Status</th><th>Last sign-in</th><th>Watch</th><th /></tr></thead>
          <tbody>{(rows ?? []).map((r) => (
            <tr key={r.email}>
              <td className="l" title={`created ${fmtStampSafe(r.createdAt)} · ${r.logins} sign-ins${r.verifiedAt ? ` · address confirmed by code ${fmtStampSafe(r.verifiedAt)}` : ""}`}>{r.email}{r.role === "manager" && <span className="badge">MANAGER</span>}</td>
              <td className={`l ${r.status === "pending" ? "warn" : r.status === "disabled" ? "dn" : ""}`}>{STATUS[r.status] ?? r.status}{r.mustChange ? " · temp pw" : ""}</td>
              <td className="num mut">{r.lastSeen ? fmtStampSafe(r.lastSeen) : "–"}</td>
              <td className="num">{r.watch}</td>
              <td className="num acts">
                {r.status === "pending" && <span className="chip-sm on" onClick={() => void act(r.email, "approve")}>{busy === r.email + "approve" ? "…" : "APPROVE"}</span>}
                {r.status === "disabled" && <span className="chip-sm" onClick={() => void act(r.email, "enable")}>{busy === r.email + "enable" ? "…" : "REACTIVATE"}</span>}
                {r.status !== "disabled" && r.email !== me.email && <span className="chip-sm" onClick={() => setAsk(r)}>{r.status === "pending" ? "REJECT" : "DEACTIVATE"}</span>}
                {r.status === "active" && r.email !== me.email && <span className="chip-sm" onClick={() => void act(r.email, "reset")}>{busy === r.email + "reset" ? "…" : "RESET PW"}</span>}
              </td>
            </tr>
          ))}</tbody>
        </table>
        {rows && rows.length === 0 && <div className="mut">No accounts yet.</div>}
      </div>
      {ask && <ConfirmOff row={ask} busy={busy === ask.email + "disable"} onYes={() => void act(ask.email, "disable")} onNo={() => { if (busy !== ask.email + "disable") setAsk(null); }} />}
    </div>
  );
}

/** The account window behind the name chip: who is signed in, change password, sign out, and for the manager the
 *  list of accounts. */
export function AccountModal({ me, onClose, onSignOut, onChanged }: { me: Me; onClose: () => void; onSignOut: () => void; onChanged: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`modal acct${me.role === "manager" ? " wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <h3>Account<span className="x" onClick={onClose} title="Close">✕</span></h3>
        <div className="sub2">Signed in as <b>{me.email}</b>{me.role === "manager" ? " · manager" : ""}. Your watchlist is saved to this account and follows you to any device.</div>
        <div className="acct-cols">
          <div>
            <div className="minih">Change password</div>
            <ChangePassword onDone={onChanged} />
            <button type="button" className="go ghost" onClick={onSignOut}>SIGN OUT</button>
          </div>
          {me.role === "manager" && <Accounts me={me} />}
        </div>
      </div>
    </div>
  );
}
