// Notes on a paper portfolio, and what happened to it (P-1). A note is the account's own text, visible to that
// account only: at most 2,000 characters, never edited (a later note says what changed), removable by its writer, and
// then its text goes for good while a line with the time stays. Under the box, always, the statement's gist.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNet } from "../../lib/net";
import { Consent } from "./Consent";
import { failureWords, pfNoteAdd, pfNoteRemove, PfError } from "../../lib/pf";
import { noteLeft, noteRefusal, NOTE_MAX } from "../../lib/pf/form.ts";
import { NOTE_GIST } from "../../lib/pf/statement.ts";
import { notesLeftLine } from "../../lib/pf/words.ts";
import { stampSgt, timeSgt } from "../../lib/pf/calendar.ts";
import type { ActivityRow } from "../../lib/pf/view.ts";
import type { ConsentState, NoteRow } from "../../lib/pf/types.ts";
import { fmtFull } from "../../lib/pf/money.ts";

const PAGE = 20;
export function Notes({ id, notes, consent, phone, onChanged }: { id: string; notes: NoteRow[]; consent: ConsentState; phone: boolean; onChanged: () => void }) {
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null), [card, setCard] = useState(false), [agreed, setAgreed] = useState(consent);
  const [shown, setShown] = useState(PAGE), [asking, setAsking] = useState<number | null>(null), [open, setOpen] = useState<Set<number>>(() => new Set());
  const [rmNo, setRmNo] = useState<{ n: number; text: string } | null>(null);   // a removal that failed, said at its note
  const left = noteLeft(text), over = left < 0, refusal = over ? noteRefusal(text) : null, net = useNet();
  // a sentence of a failure goes once the thing has worked, and an "Offline" one when the connection is back (UI-16)
  useEffect(() => { if (!net.offline) { setMsg((m) => (m && m.startsWith("Offline") ? null : m)); setRmNo((r) => (r && r.text.startsWith("Offline") ? null : r)); } }, [net.offline]);
  const save = (c = agreed) => {
    if (busy || !text.trim() || over) return;
    if (!c.agreedAt) { setCard(true); return; }
    setBusy(true); setMsg(null);
    // the box is emptied only if it still holds the text that was sent: what was typed while it was on its way stays
    // (UI-8: it was wiped without a word)
    const sent = text;
    pfNoteAdd(id, sent).then(() => { setText((t) => (t === sent ? "" : t)); setBusy(false); setMsg(null); onChanged(); })
      .catch((e: unknown) => { setBusy(false); if (e instanceof PfError && e.status === 409) { setAgreed({ ...c, agreedAt: null }); setCard(true); return; }
        setMsg(failureWords(e, { offline: "Offline: a note needs the server. Your text is kept in the box on this device.", signedOut: "Signed out: sign in again. Nothing was saved.", refused: (w) => `Not saved: ${w}. Your text is still in the box.` })); });
  };
  const remove = (n: number) => { setAsking(null); setRmNo(null); pfNoteRemove(id, n).then(() => { setRmNo(null); setMsg((m) => (m && /removing|removed/i.test(m) ? null : m)); onChanged(); }).catch((e: unknown) => setRmNo({ n, text: failureWords(e, { offline: "Offline: removing a note needs the server.", signedOut: "Signed out: sign in again. Nothing was removed.", refused: (w) => `Not removed: ${w}. Nothing was removed.` }) })); };
  const rows = Math.min(8, Math.max(3, text.split("\n").length + Math.floor(text.length / 90)));
  return (
    <div className={`pf-notes${phone ? " ph" : ""}`} id="pf-notes">
      <textarea id="pf-note-box" rows={rows} value={text} placeholder="add a note …" aria-label="A note on this portfolio" aria-invalid={over ? true : undefined} aria-describedby="pf-note-gist"
        onChange={(e) => { setText(e.target.value); setMsg(null); }} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } }} />
      <p className="pf-mut gist" id="pf-note-gist">{NOTE_GIST}</p>
      <div className="pf-noteact">
        <button type="button" className={phone ? "pf-btn big" : "pf-btn"} id="pf-note-save" disabled={busy || !text.trim() || over} onClick={() => save()} title={phone ? undefined : "Ctrl+Enter saves"}>{busy ? "Saving…" : phone ? "Save note" : "SAVE NOTE"}</button>
        {refusal ? <span className="pf-no" id="pf-note-count" role="alert">{refusal}</span> : left <= NOTE_MAX - 1500 ? <span className="pf-mut" id="pf-note-count">{fmtFull(left)} left</span> : null}
      </div>
      {msg && <p className="pf-msg" id="pf-note-msg" role="status">{msg}</p>}
      {notesLeftLine(notes.length) && <p className="pf-mut" id="pf-notes-left">{notesLeftLine(notes.length)}</p>}
      {notes.length === 0 ? <p className="pf-mut" id="pf-nonotes">No notes yet.</p> : (
        <ul className="pf-notelist">
          {notes.slice(0, shown).map((n) => {
            if (n.body == null) return <li key={n.id} className="gone" data-note="removed">note removed {n.removedAt ? timeSgt(n.removedAt) : ""}</li>;
            const all = open.has(n.id);
            return (
              <li key={n.id} data-note={n.id}>
                <div className="hd"><span className="t" title={stampSgt(n.at)}>{timeSgt(n.at)}</span>
                  {asking === n.id ? null : <button type="button" className="pf-link rm" onClick={() => setAsking(n.id)}>REMOVE</button>}</div>
                <NoteText body={n.body} all={all} onAll={() => setOpen((s) => new Set(s).add(n.id))} />
                {rmNo?.n === n.id && <p className="pf-msg" data-note-msg={n.id} role="status">{rmNo.text}</p>}
                {asking === n.id && <p className="pf-ask" role="alertdialog">Remove this note? Its text goes for good; a line saying a note was removed stays. <button type="button" className="pf-btn" onClick={() => setAsking(null)}>KEEP</button> <button type="button" className="pf-btn danger" data-act="remove" onClick={() => remove(n.id)}>REMOVE</button></p>}
              </li>
            );
          })}
        </ul>
      )}
      {notes.length > shown && <button type="button" className={phone ? "mp-more" : "pf-link more"} id="pf-notes-more" onClick={() => setShown((s) => s + PAGE)}>{phone ? "Show 20 more" : "SHOW 20 MORE"}</button>}
      {card && <Consent consent={agreed} what="note" phone={phone} onAgreed={(c) => { setAgreed(c); setCard(false); save(c); }} onNotNow={() => { setCard(false); setMsg("Not saved: the statement was not agreed. Your text is still in the box."); }} />}
    </div>
  );
}

/** A note's text, clamped to eight lines; SHOW ALL only where the clamp hides something, as drawn (UI-14: it was decided
 *  by a count of characters, and a note already whole carried a link that did nothing). Measured again when its width
 *  changes. */
function NoteText({ body, all, onAll }: { body: string; all: boolean; onAll: () => void }) {
  const box = useRef<HTMLDivElement>(null), [hides, setHides] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || all) return;
    const fit = () => setHides(el.scrollHeight > el.clientHeight + 1);
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [all, body]);
  return <><div ref={box} className={`tx${all ? "" : ` clamp${hides ? " clip" : ""}`}`}>{body}</div>{!all && hides && <button type="button" className="pf-link" data-act="all" onClick={onAll}>SHOW ALL</button>}</>;
}

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
/** "THURSDAY 12 NOV", the day in Singapore. */
function dayBar(iso: string): string {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", weekday: "long", day: "numeric", month: "short" }).formatToParts(new Date(iso)), g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd = DAYS.find((d) => d.toLowerCase() === g("weekday").toLowerCase()) ?? g("weekday").toUpperCase();
  return `${wd} ${g("day")} ${g("month").toUpperCase()}`;
}
const hm = (iso: string): string => timeSgt(iso).split(" ").pop() ?? "";
/** What happened to the book, under day bars, newest first; times in SGT. Thirty lines, then SHOW 30 MORE. */
export function Activity({ rows, phone }: { rows: ActivityRow[]; phone: boolean }) {
  const [shown, setShown] = useState(30);
  let last = "";
  return (
    <div className={`pf-activity${phone ? " ph" : ""}`} id="pf-activity">
      {rows.slice(0, shown).map((r, i) => {
        const bar = dayBar(r.at), head = bar !== last; last = bar;
        return <div key={`${r.at}|${i}`}>{head && <div className="daybar">{bar}</div>}<div className="act" data-kind={r.kind}><span className="t">{hm(r.at)}</span><span className="k">{r.kind}</span><span className="x">{r.text}</span></div></div>;
      })}
      {rows.length > shown && <button type="button" className={phone ? "mp-more" : "pf-link more"} onClick={() => setShown((s) => s + 30)}>{phone ? "Show 30 more" : "SHOW 30 MORE"}</button>}
    </div>
  );
}
