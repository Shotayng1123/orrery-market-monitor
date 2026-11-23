// A paper portfolio's Settings (P-1): what is fixed, what changes, the reason and the history.
// A fixed row has no control at all: its value is text and "fixed" follows it. A limit or an assumption changes with a
// reason of 10 to 500 characters and is in force from the session that opens next, the date the server gives (on an
// equity book the day running while none of its stock exchanges has opened: EN-9); a change waiting for its session is
// said under the value in force and can be taken back (RT-3); every row ever written stays in HISTORY. The targets may
// be re-set only from 1 Dec, 06:00 SGT, to a January reset, under a yearly base. A portfolio is deleted only after its
// name is typed exactly. GO TO stays under the header and lights the section in view (UI-15); on a phone a form's two
// buttons stand in its sheet's foot (UI-13).
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react";
import { zoomNow } from "../../lib/prefs";
import { viewBottom } from "../../lib/scroller";
import { Panel } from "../Panel";
import { JumpPick, Section } from "../PhoneKit";
import { Sheet } from "../Sheet";
import { Assumed, ByTag, Chips, flash, go, href, Muted, NumInput, setLastBook, useHeaderTop } from "./shared";
import { EquivalentLine, FundingLine, ReferenceLine, VolLines } from "./Blocks";
import { byCard } from "./Book";
import { failureWords, pfDelete, pfRename, pfSettingSet, pfTargetsSet, type BookAnswer } from "../../lib/pf";
import { checkChange, checkTargets, cleanName, inputText, nameRefusal, reasonRefusal, showValue, usdLine, REASON_MAX } from "../../lib/pf/form.ts";
import { fmtFull, fromMinor } from "../../lib/pf/money.ts";
import { fieldOf, STARTS } from "../../lib/pf/presets.ts";
import { NOTE_GIST } from "../../lib/pf/statement.ts";
import { BASE_LINE, BASE_NAME, cumulative, drawdownLine, restoreLine } from "../../lib/pf/targets.ts";
import { bookDayFrom, DAY_ENDS, inForceWords, stampSgt, timeSgt, wdmy, windowWords } from "../../lib/pf/calendar.ts";
import { changeBasis, historyOf, rowsOf, settingsNow, shortValue, targetsNow, targetsWords, valuesAhead, type HistoryRow, type NowRow } from "../../lib/pf/view.ts";
import type { After } from "../../lib/pf/types.ts";
import { ONLY_YOU, TARGET_RETURN, TARGET_VOLATILITY } from "../../lib/labels";

export const SETTINGS_SECTIONS = [["portfolio", "Portfolio"], ["targets", "Targets"], ["ladder", "Ladder"], ["limits", "Limits"], ["assumptions", "Assumptions"], ["statement", "Statement"], ["delete", "Delete"]] as const;
type SectionKey = (typeof SETTINGS_SECTIONS)[number][0];
const numbered = (k: SectionKey): string => String(SETTINGS_SECTIONS.findIndex((s) => s[0] === k) + 1).padStart(2, "0");

/** CHANGE: the value in force, the new value against its range, the reason, and the date it is in force from. */
function ChangeForm({ a, row, phone, onDone, onCancel, reread }: { a: BookAnswer; row: NowRow; phone: boolean; onDone: () => void; onCancel: () => void; reread?: () => void }) {
  // checked as the server checks it: against what will be in force with it (the changes already saved, the targets
  // after a January re-set: RT-2, RT-3, EN-6), and the book read again as the form opens, so that the date it prints
  // is the one the server will store (RT-9)
  const f = row.field, values = useMemo(() => changeBasis(a.book, a.valuationDay), [a]);
  useEffect(() => { reread?.(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [val, setVal] = useState(f.num && typeof row.value === "number" ? "" : String(row.value)), [reason, setReason] = useState(""), [seen, setSeen] = useState({ v: false, r: false }), [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null);
  const p = val === "" && f.num ? null : checkChange(a.book, f.key, val, values), vNo = p && !p.ok ? p.text : null, rNo = reasonRefusal(reason), over = [...reason.trim()].length > REASON_MAX;
  const can = !!p && p.ok && !rNo && !busy;
  // a change waiting for its session (RT-3, the designer's B.1): said under "In force now"; the value in force typed
  // again takes it back, and the form says so (a reason is still asked)
  const pend = row.pending, back = !!pend && !!p && p.ok && p.v === row.value;
  const save = () => {
    if (!can) return;
    setBusy(true); setMsg(null);
    pfSettingSet(a.book.id, f.key, val, reason).then(() => { onDone(); })
      .catch((e: unknown) => { setBusy(false); setMsg(failureWords(e, { offline: "Offline: a change needs the server.", signedOut: "Signed out: sign in again. Nothing was changed.", refused: (w) => `Not saved: ${w}. Nothing changed.` })); });
  };
  // on a phone the two buttons stand in the sheet's foot, which does not scroll (UI-13); on a computer under the form
  const buttons = phone
    ? <><button type="button" className="pf-btn" id="pf-change-cancel" onClick={onCancel}>Cancel</button><button type="button" className="pf-go" id="pf-change-save" disabled={!can} onClick={save}>{busy ? "Saving…" : "Save change"}</button></>
    : <div className="pf-btns"><button type="button" className="pf-btn" id="pf-change-cancel" onClick={onCancel}>CANCEL</button><button type="button" className="pf-go" id="pf-change-save" disabled={!can} onClick={save}>{busy ? "Saving…" : "SAVE CHANGE"}</button></div>;
  const body = (
    <div className={`pf-change${phone ? " ph" : ""}`} id="pf-change" data-key={f.key}>
      <div className="ln"><span className="k">In force now</span><span>{showValue(f, row.value)} · {row.by} · since {wdmy(row.since)}</span></div>
      {pend && <div className="ln" id="pf-change-pending"><span className="k">Pending</span><span>{showValue(f, pend.value)} from {bookDayFrom(pend.from)}</span></div>}
      <div className="ln"><label className="k" htmlFor="pf-change-value">New value</label>
        <span className="v">{f.choices ? <Chips field={f} value={val} onChange={(v) => { setVal(v); setSeen((s) => ({ ...s, v: true })); }} phone={phone} /> : <NumInput id="pf-change-value" field={f} value={val} onChange={(v) => { setVal(v); setSeen((s) => ({ ...s, v: true })); }} refusal={seen.v ? vNo : null} phone={phone} autoFocus={!phone} />}<span className="pf-unit2">{f.range}</span>{f.choices && seen.v && vNo && <span className="pf-no" role="alert">{vNo}</span>}{back && <span className="pf-mut pf-back" id="pf-change-back">back to the value in force: the pending {shortValue(f, pend!.value)} is withdrawn</span>}</span></div>
      <div className="ln"><label className="k" htmlFor="pf-change-reason">Reason</label>
        <span className="v"><textarea id="pf-change-reason" rows={phone ? 3 : 2} value={reason} placeholder="why this change" aria-invalid={seen.r && rNo ? true : undefined} aria-describedby="pf-change-gist" onChange={(e) => setReason(e.target.value)} onBlur={() => setSeen((s) => ({ ...s, r: true }))} />
          {(seen.r || over) && rNo && <span className="pf-no" id="pf-change-reason-no" role="alert">{rNo}</span>}
          <span className="pf-mut" id="pf-change-gist">kept in the history · {ONLY_YOU} see it · {NOTE_GIST.replace("Notes are for your own reasoning. ", "")}</span></span></div>
      {!back && <div className="ln when" id="pf-change-when">{inForceWords(a.nextSession, a.nextSession === a.valuationDay ? a.nextOpens : null)}</div>}
      {msg && <p className="pf-msg" role="status">{msg}</p>}
      {!phone && buttons}
    </div>
  );
  return phone ? <Sheet title={`Change · ${f.label}`} onClose={onCancel} id="pf-change-sheet" foot={buttons}>{body}</Sheet> : <div className="pf-changebox" role="group" aria-label={`Change ${f.label}`}><div className="t">CHANGE · {f.label.toUpperCase()}<button type="button" className="x" aria-label="Close" onClick={onCancel}>&times;</button></div>{body}</div>;
}

/** The settings' own log: every row ever written, newest first. Thirty rows, then SHOW 30 MORE. */
function History({ rows, phone }: { rows: HistoryRow[]; phone: boolean }) {
  const [shown, setShown] = useState(30);
  const more = rows.length > shown && <button type="button" className={phone ? "mp-more" : "pf-link more"} data-act="more" onClick={() => setShown((s) => s + 30)}>{phone ? "Show 30 more" : "SHOW 30 MORE"}</button>;
  if (phone) return (
    <div className="pfp-hist" data-view="history">
      {rows.slice(0, shown).map((h) => <div className="h" key={h.id} data-key={h.key} data-origin={h.origin} data-state={h.state || undefined}><span className="a">{h.label} · {h.from} → {h.to}</span><span className="b">{h.note ? h.note : `in force from ${h.inForceFrom ? wdmy(h.inForceFrom) : "–"}`} · set {timeSgt(h.at)} SGT{h.state && !h.note ? ` · ${h.state}` : ""}</span><span className="c">{h.reason ?? h.by}</span></div>)}
      {more}
    </div>
  );
  return (
    <div data-view="history">
      <table className="secT pf-hist"><thead><tr><th className="l">When (SGT)</th><th className="l">Setting</th><th>From</th><th>To</th><th className="l">In force from</th><th className="l">Reason</th><th className="l">By</th></tr></thead>
        <tbody>{rows.slice(0, shown).map((h) => <tr key={h.id} data-key={h.key} data-origin={h.origin} data-state={h.state || undefined}><td className="l mut nb">{stampSgt(h.at).replace(/ SGT$/, "")}</td><td className="l wrap">{h.label}</td><td className="num">{h.from}</td><td className="num">{h.to}</td>{h.note ? <td className="l wrap st">{h.note}</td> : <td className="l nb">{h.inForceFrom ? wdmy(h.inForceFrom) : "–"}{h.state && <span className="st"> · {h.state}</span>}</td>}<td className="l wrap rs">{h.reason ?? "–"}</td><td className="l wrap mut">{h.by}</td></tr>)}</tbody></table>
      {more}
    </div>
  );
}

/** LIMITS or ASSUMPTIONS: CURRENT (value, range, why, by, since, CHANGE) and HISTORY. */
function SettingList({ a, after, phone, onChanged }: { a: BookAnswer; after: After; phone: boolean; onChanged: () => void }) {
  const [view, setView] = useState<"current" | "history">("current"), [open, setOpen] = useState<string | null>(null);
  const now = useMemo(() => settingsNow(a.book, a.valuationDay), [a]), rows = rowsOf(now, after), hist = useMemo(() => historyOf(a.book, after, a.valuationDay), [a, after]);   // every limit's rows: the band's and the amber line's too, which 02 TARGETS shows and changes
  // the rows a PM gave no range for stand in the list too: a fixed line of text, "–" for its range, no CHANGE
  const lines = STARTS[a.book.start].fields.filter((f) => f.after === after && f.section !== "targets" && (!f.usdOnly || a.book.base === "USD"));
  const groups = after === "assumption" ? (["Financing", "Borrow", "Margin", "Costs"] as const) : ([null] as const);
  const chips = <div className="chips pf-tabs" role="tablist"><button type="button" role="tab" aria-selected={view === "current"} className={`chip-sm${view === "current" ? " on" : ""}`} data-tab="current" onClick={() => setView("current")}>CURRENT</button><button type="button" role="tab" aria-selected={view === "history"} className={`chip-sm${view === "history" ? " on" : ""}`} data-tab="history" onClick={() => setView("history")}>HISTORY</button></div>;
  const can = (r: NowRow | undefined): r is NowRow => !!r && (!!r.field.num || (!!r.field.choices && r.field.choices.options.filter((o) => !o.off).length > 1));
  const valueCell = (f: (typeof lines)[number], r: NowRow | undefined): ReactNode => (
    <>{f.key === "funding" ? <FundingLine field={f} /> : r ? showValue(f, r.value) : f.text}{r?.pending && <span className="pf-pending" data-pending={f.key}>{shortValue(f, r.pending.value)} from {bookDayFrom(r.pending.from)} · pending</span>}</>
  );
  const done = () => { setOpen(null); onChanged(); };
  if (view === "history") return <>{chips}<History rows={hist} phone={phone} /></>;
  if (phone) return (
    <>
      {chips}
      {groups.map((g) => (
        <div key={g ?? "all"} className="pfp-setlist">
          {g && <div className="mp-cap">{g}</div>}
          {lines.filter((f) => !g || f.group === g).map((f) => { const r = rows.find((x) => x.key === f.key), tap = can(r);
            const inner = <><span className="nm"><span className="n">{f.label}{f.mark && <Assumed />}</span><span className="s">{f.range === "fixed" ? "fixed" : f.range} · {r ? r.by : f.who.tag} · since {wdmy(r?.since ?? a.book.startedOn)}</span></span><span className="v">{valueCell(f, r)}</span></>;
            // a value in words (a fixed line of text) takes the row's whole width under its name: beside it, it would be a column of a few words
            const long = !f.num && String(r ? showValue(f, r.value) : f.text ?? "").length > 36;
            return tap ? <button type="button" className="pfp-set tap" key={f.key} data-row={f.key} onClick={() => setOpen(f.key)}>{inner}<span className="go" aria-hidden="true">&#8250;</span></button> : <div className={`pfp-set${long ? " long" : ""}`} key={f.key} data-row={f.key}>{inner}</div>; })}
        </div>
      ))}
      {open && can(rows.find((x) => x.key === open)) && <ChangeForm a={a} row={rows.find((x) => x.key === open)!} phone onDone={done} onCancel={() => setOpen(null)} reread={onChanged} />}
    </>
  );
  return (
    <>
      {chips}
      <table className="secT pf-set" data-view="current"><thead><tr><th className="l">{after === "limit" ? "Limit" : "Assumption"}</th><th className="l">Value</th><th className="l">Range</th><th className="l">{after === "limit" ? "Why" : "Basis"}</th><th className="l">By</th><th className="l">Since</th><th /></tr></thead>
        {groups.map((g) => (
          <tbody key={g ?? "all"}>
            {g && <tr className="cls"><td colSpan={7}>{g}</td></tr>}
            {lines.filter((f) => !g || f.group === g).map((f) => { const r = rows.find((x) => x.key === f.key);
              return [
                <tr key={f.key} data-row={f.key}><td className="l wrap">{f.label}{f.mark && <Assumed />}</td><td className="l wrap vl">{valueCell(f, r)}</td><td className="l mut nb">{f.range}</td><td className="l wrap mut">{f.key === "funding" ? null /* said once, in its value */ : f.why}</td><td className="l"><ByTag tag={r ? r.by : f.who.tag} card={r ? byCard(r) : f.who.card} /></td><td className="l mut nb">{wdmy(r?.since ?? a.book.startedOn)}</td>
                  <td>{can(r) && <button type="button" className="pf-link" data-act="change" aria-expanded={open === f.key} onClick={() => setOpen(open === f.key ? null : f.key)}>CHANGE</button>}</td></tr>,
                open === f.key && can(r) ? <tr key={`${f.key}-change`} className="pf-changerow"><td colSpan={7}><ChangeForm a={a} row={r} phone={false} onDone={done} onCancel={() => setOpen(null)} reread={onChanged} /></td></tr> : null,
              ]; })}
          </tbody>
        ))}
      </table>
    </>
  );
}

/** 02 TARGETS: the two targets with their window, and the band and the amber line, which change as limits do. */
function Targets({ a, phone, onChanged }: { a: BookAnswer; phone: boolean; onChanged: () => void }) {
  const b = a.book, t = targetsNow(b, a.valuationDay), now = useMemo(() => settingsNow(b, a.valuationDay), [b, a.valuationDay]), values = valuesAhead(now);   // the VaR limit the pair will stand beside, a pending one included (RT-2)
  const [form, setForm] = useState(false), [x, setX] = useState(""), [vol, setVol] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null), [open, setOpen] = useState<string | null>(null);
  const fx = fieldOf(b.start, "target_x")!, fv = fieldOf(b.start, "target_vol")!, lim = typeof values.var === "number" ? values.var : null;
  const c = form ? checkTargets(b.start, x, vol, lim) : null, no = (k: string): string | null => (c && !c.ok ? c.refusals.find((r) => r.key === k && !/implies a 99%/.test(r.text))?.text ?? null : null);
  const xv = /^\d+(\.\d+)?$/.test(x.trim()) ? Number(x) : null, vv = /^\d+(\.\d+)?$/.test(vol.trim()) ? Number(vol) : null;
  const start = () => { setX(inputText(fx, t.pending?.x ?? t.x)); setVol(inputText(fv, t.pending?.vol ?? t.vol)); setMsg(null); setForm(true); };
  const save = () => { if (!c?.ok || busy) return; setBusy(true); setMsg(null);
    pfTargetsSet(b.id, x, vol).then(() => { setBusy(false); setForm(false); onChanged(); }).catch((e: unknown) => { setBusy(false); setMsg(failureWords(e, { offline: "Offline: a change needs the server.", signedOut: "Signed out: sign in again. Nothing was changed.", refused: (w) => `Not saved: ${w}. Nothing changed.` })); }); };
  const state = t.window.fixed ? "fixed" : windowWords(t.window);
  // RE-SET FOR NEXT YEAR: inline on a computer; on a phone a sheet whose two buttons stand in its foot (UI-13)
  const resetFields = (
    <div className="pf-resetform" id="pf-resetform">
      <div className="ln"><label className="k" htmlFor="pf-reset-x">{TARGET_RETURN}</label><span className="v"><NumInput id="pf-reset-x" field={fx} value={x} onChange={setX} refusal={no("target_x")} phone={phone} /><span className="pf-unit2">{fx.range}</span><EquivalentLine x={xv} rate={a.rates[b.base]} base={b.base} /></span></div>
      <div className="ln"><label className="k" htmlFor="pf-reset-vol">{TARGET_VOLATILITY}</label><span className="v"><NumInput id="pf-reset-vol" field={fv} value={vol} onChange={setVol} refusal={no("target_vol")} phone={phone} /><span className="pf-unit2">{fv.range}</span><VolLines x={xv} vol={vv} cut1={b.ladder.cut1} varLimit={lim} start={b.start} /></span></div>
      {msg && <p className="pf-msg" role="status">{msg}</p>}
    </div>
  );
  const resetButtons = phone
    ? <><button type="button" className="pf-btn" id="pf-reset-cancel" onClick={() => setForm(false)}>Cancel</button><button type="button" className="pf-go" id="pf-reset-save" disabled={!c?.ok || busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></>
    : <div className="pf-btns"><button type="button" className="pf-btn" id="pf-reset-cancel" onClick={() => setForm(false)}>CANCEL</button><button type="button" className="pf-go" id="pf-reset-save" disabled={!c?.ok || busy} onClick={save}>{busy ? "Saving…" : "SAVE"}</button></div>;
  const band = now.filter((r) => r.field.section === "targets" && r.field.after === "limit"), fixedRows = STARTS[b.start].fields.filter((f) => f.section === "targets" && !f.num && !f.choices && f.key !== "reference");
  const line = (label: string, value: ReactNode, tail: ReactNode, key: string) => <div className="pf-kv" key={key} data-row={key}><span className="k">{label}</span><span className="v">{value}</span><span className="t">{tail}</span></div>;
  return (
    <div className={`pf-targets${phone ? " ph" : ""}`} id="pf-targets">
      {line(TARGET_RETURN, <>cash + {t.x.toFixed(1)}% a year<EquivalentLine x={t.x} rate={a.rates[b.base]} base={b.base} /></>, <span className="pf-fixed" data-state={t.window.fixed ? "fixed" : "window"}>{state}</span>, "target_x")}
      {line(TARGET_VOLATILITY, <>{t.vol.toFixed(1)}% of capital a year</>, <span className="pf-fixed">{state}</span>, "target_vol")}
      <div className="pf-window" id="pf-window">
        {t.since && <Muted>in force since {wdmy(t.since)}</Muted>}
        {t.lapsed != null && !t.pending && <Muted id="pf-lapsed">targets not re-set for {t.lapsed}: no year reset</Muted>}
        {t.pending && <Muted id="pf-pending-targets">pending for {t.pending.forYear}: {targetsWords(t.pending.x, t.pending.vol)}</Muted>}
        {!t.window.fixed && !t.window.open && t.window.next && <Muted id="pf-nextwindow">{t.window.next}</Muted>}
        {t.window.open && !form && <button type="button" className={`pf-btn${phone ? " big" : ""}`} id="pf-reset" onClick={start}>{phone ? `Re-set for ${t.window.forYear}` : "RE-SET FOR NEXT YEAR"}</button>}
        {form && (phone
          ? <Sheet title={`Re-set for ${t.window.forYear ?? ""}`} onClose={() => setForm(false)} id="pf-reset-sheet" foot={resetButtons}>{resetFields}</Sheet>
          : <div className="pf-resetwrap">{resetFields}{resetButtons}</div>)}
      </div>
      {band.map((r) => (
        <div key={r.key}>
          {line(r.field.label, <>{showValue(r.field, r.value)}{r.pending && <span className="pf-pending" data-pending={r.key}>{shortValue(r.field, r.pending.value)} from {bookDayFrom(r.pending.from)} · pending</span>}</>, <><span className="pf-mut">{r.field.range} · {r.by} · since {wdmy(r.since)}</span> <button type="button" className="pf-link" data-act="change" aria-expanded={open === r.key} onClick={() => setOpen(open === r.key ? null : r.key)}>CHANGE</button></>, r.key)}
          {open === r.key && <ChangeForm a={a} row={r} phone={phone} onDone={() => { setOpen(null); onChanged(); }} onCancel={() => setOpen(null)} reread={onChanged} />}
        </div>
      ))}
      {fixedRows.map((f) => line(f.label, f.text, <span className="pf-fixed">fixed</span>, f.key))}
    </div>
  );
}

function Rename({ a, others, phone, onChanged }: { a: BookAnswer; others: string[]; phone: boolean; onChanged: () => void }) {
  const [edit, setEdit] = useState(false), [name, setName] = useState(a.book.name), [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null);
  const no = nameRefusal(name, others), same = cleanName(name) === a.book.name;
  const save = () => { if (no || same || busy) return; setBusy(true); setMsg(null); pfRename(a.book.id, name.trim()).then(() => { setBusy(false); setEdit(false); onChanged(); }).catch((e: unknown) => { setBusy(false); setMsg(failureWords(e, { offline: "Offline: a change needs the server.", signedOut: "Signed out: sign in again. Nothing was changed.", refused: (w) => `Not saved: ${w}. Nothing changed.` })); }); };
  if (!edit) return <><span className="pf-name">{a.book.name}</span> <button type="button" className="pf-link" id="pf-rename" onClick={() => { setName(a.book.name); setEdit(true); }}>RENAME</button></>;
  return (
    <span className={`pf-num${no ? " bad" : ""}${phone ? " ph" : ""}`}>
      <span className="pf-in"><input id="pf-rename-in" className="name" type="text" value={name} autoComplete="off" aria-label="The portfolio's name" aria-invalid={no ? true : undefined} onChange={(e) => setName(e.target.value)} onBlur={() => setName((n) => cleanName(n))} autoFocus />
        <button type="button" className="pf-btn" id="pf-rename-save" disabled={!!no || same || busy} onClick={save}>SAVE</button><button type="button" className="pf-btn" onClick={() => setEdit(false)}>CANCEL</button></span>
      {no && <span className="pf-no" role="alert">{no}</span>}{msg && <span className="pf-msg">{msg}</span>}
    </span>
  );
}

/** 07 DELETE: the sentence, the button, then the name to type. No UNDO: the sentence said so. */
function Delete({ a, phone, last }: { a: BookAnswer; phone: boolean; last: boolean }) {
  const [open, setOpen] = useState(false), [typed, setTyped] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null);
  const exact = cleanName(typed) === a.book.name, wrong = !exact && typed.trim().length >= 6;   // as the server compares it (RT-5)
  const del = () => { if (!exact || busy) return; setBusy(true); setMsg(null);
    pfDelete(a.book.id, a.book.name).then(() => { setLastBook(null); flash(`Paper portfolio deleted · ${a.book.name}`); go(last ? "" : "all"); })
      .catch((e: unknown) => { setBusy(false); setMsg(failureWords(e, { offline: "Offline: deleting needs the server.", signedOut: "Signed out: sign in again. Nothing was removed.", refused: (w) => `Not deleted: ${w}. Nothing was removed.` })); }); };
  return (
    <div className={`pf-delete${phone ? " ph" : ""}`} id="pf-delete">
      <p>Delete this paper portfolio and everything in it: its settings and their history, and its notes. It cannot be undone.</p>
      {!open ? <button type="button" className={`pf-btn danger${phone ? " big" : ""}`} id="pf-delete-open" onClick={() => setOpen(true)}>{phone ? "Delete this portfolio…" : "DELETE THIS PORTFOLIO…"}</button> : (
        <>
          <p className="ask">Type the portfolio's name to delete it: <b id="pf-delete-name">{a.book.name}</b></p>
          <span className={`pf-num${phone ? " ph" : ""}`}><span className="pf-in"><input id="pf-delete-in" className="name" type="text" value={typed} autoComplete="off" spellCheck={false} aria-label="The portfolio's name, to delete it" onChange={(e) => setTyped(e.target.value)} onBlur={() => setTyped((n) => cleanName(n))} autoFocus /></span></span>
          {wrong && <p className="pf-mut" id="pf-delete-wrong">that is not this portfolio's name</p>}
          {msg && <p className="pf-msg" role="status">{msg}</p>}
          <div className="pf-btns"><button type="button" className={`pf-btn${phone ? " big" : ""}`} onClick={() => { setOpen(false); setTyped(""); }}>{phone ? "Cancel" : "CANCEL"}</button><button type="button" className={`pf-btn danger${phone ? " big" : ""}`} id="pf-delete-go" disabled={!exact || busy} onClick={del}>{busy ? "Deleting…" : phone ? "Delete" : "DELETE"}</button></div>
        </>
      )}
    </div>
  );
}

/** What scrolls the page: the page's own box in the one-screen layout, else the window's. */
function scrollerOf(el: HTMLElement): Element {
  for (let x = el.parentElement; x; x = x.parentElement) { const o = getComputedStyle(x).overflowY; if ((o === "auto" || o === "scroll") && x.scrollHeight > x.clientHeight) return x; }
  return document.scrollingElement ?? document.documentElement;
}
/** The section in view, for GO TO's lit chip (UI-15, plan review §3.4's bar): the section that crosses the line just
 *  under the bar, the one the address names where two stand side by side; above every section, the first. Watched on
 *  every scroll of the window or of the page's own box (the one-screen layout) and on a resize. The bar's own height
 *  is written to `--pf-goto-h`, so that a section brought into view stands under it. */
function useInView(root: RefObject<HTMLDivElement | null>, bar: RefObject<HTMLDivElement | null>, section: string, on: boolean): string {
  const [seen, setSeen] = useState<string>(section || SETTINGS_SECTIONS[0][0]);
  const want = useRef(section);
  want.current = section;
  useEffect(() => {
    if (!on) return;
    let frame = 0;
    const look = () => {
      frame = 0;
      const box = root.current, b = bar.current;
      if (!box || !b) return;
      const r = b.getBoundingClientRect(), line = r.bottom + 8;
      box.style.setProperty("--pf-goto-h", `${Math.ceil(r.height / zoomNow())}px`);
      const secs = [...box.querySelectorAll<HTMLElement>("[data-sec]")].map((el) => ({ k: el.dataset.sec ?? "", r: el.getBoundingClientRect() }));
      const cross = secs.filter((x) => x.r.top <= line && x.r.bottom > line);
      // at the end of the page the last sections cannot reach the line: the last row in view is the one in view
      const sc = scrollerOf(box), end = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2 && sc.scrollTop > 0;
      const foot = viewBottom(), lastRow = end ? secs.filter((x) => x.r.top >= line && x.r.top < foot) : [];
      const last = lastRow.length ? lastRow.filter((x) => Math.abs(x.r.top - lastRow[lastRow.length - 1].r.top) < 2) : [];
      // the section the address names, wherever it stands in view, before the rule (a chip pressed is the chip lit)
      const named = secs.find((x) => x.k === want.current && x.r.bottom > line && x.r.top < foot);
      const pick = (end ? named ?? last[0] : null) ?? cross.find((x) => x.k === want.current) ?? cross[0] ?? secs.find((x) => x.r.bottom > line) ?? secs[secs.length - 1];
      if (pick) setSeen(pick.k);
    };
    const ask = () => { if (!frame) frame = requestAnimationFrame(look); };
    look();
    document.addEventListener("scroll", ask, true);
    window.addEventListener("resize", ask);
    return () => { document.removeEventListener("scroll", ask, true); window.removeEventListener("resize", ask); if (frame) cancelAnimationFrame(frame); };
  }, [root, bar, on]);
  useEffect(() => { if (section) setSeen(section); }, [section]);
  return seen;
}

export function Settings({ a, section, others, phone, onChanged, csvBook = "book" }: { a: BookAnswer; section: string; others: string[]; phone: boolean; onChanged: () => void; csvBook?: string }) {
  const tSince = !!targetsNow(a.book, a.valuationDay).since;
  const b = a.book, def = STARTS[b.start], L = b.ladder, cum = cumulative(L), usd = b.fx ? usdLine(fromMinor(b.base, b.startingNav), b.fx).line : null;
  const fixed = (label: string, value: ReactNode, key: string) => <div className="pf-kv" key={key} data-row={key}><span className="k">{label}</span><span className="v">{value}</span><span className="t"><span className="pf-fixed">fixed</span></span></div>;
  // an address that names a section opens there (#portfolio/<id>/settings/limits); a chip goes to its panel's head.
  // The section is brought to the top of whatever scrolls (the window; the page's own box in the one-screen layout),
  // under what stays there: the header on a computer (--pf-top, kept by useHeaderTop), the two views on a phone
  // (styles/pf.css gives each section that margin).
  const root = useRef<HTMLDivElement>(null), bar = useRef<HTMLDivElement>(null);
  useHeaderTop(root);
  const inView = useInView(root, bar, section, !phone);
  // a chip of the section the address already names brings it back into view (the address does not change then)
  const toSection = (k: string) => (e: ReactMouseEvent) => { if (location.hash === href(`${b.id}/settings/${k}`)) { e.preventDefault(); root.current?.querySelector<HTMLElement>(`[data-sec="${k}"]`)?.scrollIntoView({ block: "start" }); } };
  useEffect(() => {
    if (!section) return;
    const t = setTimeout(() => { root.current?.querySelector<HTMLElement>(`[data-sec="${section}"]`)?.scrollIntoView({ block: "start" }); }, 60);
    return () => clearTimeout(t);
  }, [section, phone, b.id]);
  const parts: Record<SectionKey, { aux?: ReactNode; body: ReactNode }> = {
    portfolio: { body: (
      <div className="pf-kvs">
        <div className="pf-kv" data-row="name"><span className="k">Name</span><span className="v"><Rename a={a} others={others} phone={phone} onChanged={onChanged} /></span><span className="t" /></div>
        {fixed("Start and kind", `${def.name} · ${def.kind === "AR" ? "absolute return" : "relative return"}`, "start")}
        {fixed("Base currency", b.base, "base")}
        {fixed("Starting NAV", <>{fmtFull(fromMinor(b.base, b.startingNav))} {b.base}{usd && <span className="pf-line">{usd}</span>}</>, "nav")}
        {fixed("Created", stampSgt(b.createdAt), "created")}
        {fixed("Valuation point", fieldOf(b.start, "valuation")?.text ?? b.valuation, "valuation")}
        {fixed("Reference", <ReferenceLine start={b.start} base={b.base} blend={b.blend} />, "reference")}
        {b.blend != null && fixed("The blend's shares", `${b.blend}% MSCI ACWI / ${100 - b.blend}% Global Aggregate`, "blend")}
        {fixed("House margin multiple", `× ${b.houseMultiple.toFixed(1)}`, "house_multiple")}
      </div>) },
    // the day's words only once the panel shows a book day ("in force since", P-3): B.0.1, revision 2
    targets: { aux: tSince ? `neither target is a limit · ${DAY_ENDS}` : "neither target is a limit", body: <Targets a={a} phone={phone} onChanged={onChanged} /> },
    ladder: { aux: <span className="pf-fixed" id="pf-ladder-fixed">fixed</span>, body: (
      <div className="pf-kvs" id="pf-ladder">
        <div className="pf-kv" data-row="ladder_base"><span className="k">Base</span><span className="v">{BASE_NAME[b.ladderBase]}<span className="pf-line">{BASE_LINE[b.ladderBase]}</span></span><span className="t" /></div>
        <div className="pf-kv" data-row="cut1"><span className="k">First cut</span><span className="v">at a drawdown of {L.cut1.toFixed(1)}% → capital {L.cap1}% of the reference capital</span><span className="t" /></div>
        <div className="pf-kv" data-row="cut2"><span className="k">Second cut</span><span className="v">+ {L.cut2}% (at {cum.second.toFixed(1)}%) → capital {L.cap2}%</span><span className="t" /></div>
        <div className="pf-kv" data-row="out"><span className="k">Out</span><span className="v">+ {L.out}% (at {cum.out.toFixed(1)}%): final; the only restart is a new portfolio</span><span className="t" /></div>
        <div className="pf-kv" data-row="restore"><span className="k">Restore</span><span className="v">{restoreLine(L)}: each 2 points below the step that cut; after at least {L.cooling} final NAV{L.cooling === 1 ? "" : "s"} since the cut or the last restore</span><span className="t" /></div>
        <div className="pf-kv" data-row="deadline"><span className="k">Deadline</span><span className="v">{L.deadline} session{L.deadline === 1 ? "" : "s"}: inside the new limits by the first NAV after each market's next session, at the 20% cap's pace</span><span className="t" /></div>
        <div className="pf-kv" data-row="drawdown"><span className="k">Drawdown</span><span className="v">{drawdownLine(b.ladderBase)}</span><span className="t" /></div>
        <div className="pf-kv" data-row="warning"><span className="k">Warning</span><span className="v">{fieldOf(b.start, "warning")?.text}</span><span className="t" /></div>
      </div>) },
    limits: { aux: `each changes with a reason, from the next session · ${DAY_ENDS}`, body: <SettingList a={a} after="limit" phone={phone} onChanged={onChanged} /> },
    assumptions: { aux: <>each marked <Assumed /> · changes with a reason, from the next session · {DAY_ENDS}</>, body: <SettingList a={a} after="assumption" phone={phone} onChanged={onChanged} /> },
    statement: { body: <div id="pf-agreed"><p className="pf-agreedline">{a.consent.agreedAt ? `Agreed ${stampSgt(a.consent.agreedAt)} · version ${a.consent.version}` : "Not agreed yet"}</p><p className="pf-statement small">{a.consent.text}</p></div> },
    delete: { body: <Delete a={a} phone={phone} last={others.length === 0} /> },
  };
  if (phone) return (
    <div className="pfp-settings" id="pf-settings" ref={root}>
      <div className="mp-picks top pfp-pad"><JumpPick dep={`${b.id}|settings`} /></div>
      {SETTINGS_SECTIONS.map(([k, title]) => <div key={k} data-sec={k}><Section title={title} aux={k === "ladder" ? "fixed" : (k === "targets" && tSince) || k === "limits" || k === "assumptions" ? <small className="dayend">{DAY_ENDS}</small> : undefined} card={false}><div className="mp-card pad">{parts[k].body}</div></Section></div>)}
    </div>
  );
  return (
    <div id="pf-settings" ref={root}>
      <div className="chips pf-goto" id="pf-goto" ref={bar}><span className="lbl">GO TO</span>{SETTINGS_SECTIONS.map(([k, title]) => <a key={k} className={`chip-sm${inView === k ? " on" : ""}`} aria-current={inView === k ? "location" : undefined} href={href(`${b.id}/settings/${k}`)} onClick={toSection(k)}>{title.toUpperCase()}</a>)}</div>
      <div className="pf-grid">
        {SETTINGS_SECTIONS.map(([k, title]) => <div key={k} className={k === "ladder" || k === "limits" || k === "assumptions" ? "w12" : "w6"} data-sec={k}><Panel no={numbered(k)} title={title.toUpperCase()} k={`pfs-${k}`} aux={parts[k].aux} csv={k === "limits" || k === "assumptions"} csvName={() => `paper-${csvBook}-${k}${root.current?.querySelector(`[data-sec="${k}"] [data-view="history"]`) ? "-history" : ""}`}>{parts[k].body}</Panel></div>)}
      </div>
    </div>
  );
}
