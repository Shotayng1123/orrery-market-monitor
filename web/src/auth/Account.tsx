import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminSet, api, changePassword, type AccountRow, type Me } from "../lib/api";
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

/** Manager only: who has an account, with approve / switch off / switch on / reset password. */
function Accounts({ me }: { me: Me }) {
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [err, setErr] = useState("");
  const [temp, setTemp] = useState<{ email: string; pw: string } | null>(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try { setRows((await api<{ rows: AccountRow[] }>("admin_users")).rows); setErr(""); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function act(email: string, op: "approve" | "enable" | "disable" | "reset") {
    setBusy(email + op); setErr("");
    const r = await adminSet(email, op);
    setBusy("");
    if (!r.ok) { setErr(r.error); return; }
    if (op === "reset" && r.tempPassword) setTemp({ email, pw: r.tempPassword });
    void load();
  }
  const pending = (rows ?? []).filter((r) => r.status === "pending").length;
  return (
    <div className="acct-adm">
      <div className="minih">Accounts{rows ? ` · ${rows.length}` : ""}{pending ? ` · ${pending} waiting for approval` : ""}</div>
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
              <td className="l" title={`created ${fmtStampSafe(r.createdAt)} · ${r.logins} sign-ins`}>{r.email}{r.role === "manager" && <span className="badge">MANAGER</span>}</td>
              <td className={`l ${r.status === "pending" ? "warn" : r.status === "disabled" ? "dn" : ""}`}>{r.status}{r.mustChange ? " · temp pw" : ""}</td>
              <td className="num mut">{r.lastSeen ? fmtStampSafe(r.lastSeen) : "–"}</td>
              <td className="num">{r.watch}</td>
              <td className="num acts">
                {r.status === "pending" && <span className="chip-sm on" onClick={() => void act(r.email, "approve")}>{busy === r.email + "approve" ? "…" : "APPROVE"}</span>}
                {r.status === "disabled" && <span className="chip-sm" onClick={() => void act(r.email, "enable")}>{busy === r.email + "enable" ? "…" : "SWITCH ON"}</span>}
                {r.status !== "disabled" && r.email !== me.email && <span className="chip-sm" onClick={() => void act(r.email, "disable")}>{busy === r.email + "disable" ? "…" : r.status === "pending" ? "REJECT" : "SWITCH OFF"}</span>}
                {r.status === "active" && r.email !== me.email && <span className="chip-sm" onClick={() => void act(r.email, "reset")}>{busy === r.email + "reset" ? "…" : "RESET PW"}</span>}
              </td>
            </tr>
          ))}</tbody>
        </table>
        {rows && rows.length === 0 && <div className="mut">No accounts yet.</div>}
      </div>
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
