// A paper portfolio's Settings (P-1): what is fixed, what changes, the reason and the history.
// A fixed row has no control at all: its value is text and "fixed" follows it. A limit or an assumption changes with a
// reason of 10 to 500 characters and is in force from the next session, the date the server gives; every row ever
// written stays in HISTORY. The targets may be re-set only from 1 Dec to a January reset, under a yearly base. A
// portfolio is deleted only after its name is typed exactly.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Panel } from "../Panel";
import { JumpPick, Section } from "../PhoneKit";
import { Sheet } from "../Sheet";
import { Assumed, ByTag, Chips, flash, go, href, Muted, NumInput, setLastBook, useHeaderTop } from "./shared";
import { EquivalentLine, ReferenceLine, VolLines } from "./Blocks";
import { byCard } from "./Book";
import { failureWords, pfDelete, pfRename, pfSettingSet, pfTargetsSet, type BookAnswer } from "../../lib/pf";
import { checkChange, checkTargets, inputText, nameRefusal, reasonRefusal, showValue, usdLine, REASON_MAX } from "../../lib/pf/form.ts";
import { fmtFull, fromMinor } from "../../lib/pf/money.ts";
import { fieldOf, STARTS } from "../../lib/pf/presets.ts";
import { NOTE_GIST } from "../../lib/pf/statement.ts";
import { BASE_LINE, BASE_NAME, cumulative, drawdownLine, restoreLine } from "../../lib/pf/targets.ts";
import { dmy, stampSgt, wdmy } from "../../lib/pf/calendar.ts";
import { WINDOW_WORDS } from "../../lib/pf/calendar.ts";
import { historyOf, rowsOf, settingsNow, shortValue, targetsNow, targetsWords, valuesNow, type HistoryRow, type NowRow } from "../../lib/pf/view.ts";
import type { After } from "../../lib/pf/types.ts";
import { ONLY_YOU, TARGET_RETURN, TARGET_VOLATILITY } from "../../lib/labels";

export const SETTINGS_SECTIONS = [["portfolio", "Portfolio"], ["targets", "Targets"], ["ladder", "Ladder"], ["limits", "Limits"], ["assumptions", "Assumptions"], ["statement", "Statement"], ["delete", "Delete"]] as const;
type SectionKey = (typeof SETTINGS_SECTIONS)[number][0];
const numbered = (k: SectionKey): string => String(SETTINGS_SECTIONS.findIndex((s) => s[0] === k) + 1).padStart(2, "0");

/** CHANGE: the value in force, the new value against its range, the reason, and the date it is in force from. */
function ChangeForm({ a, row, phone, onDone, onCancel }: { a: BookAnswer; row: NowRow; phone: boolean; onDone: () => void; onCancel: () => void }) {
  const f = row.field, values = useMemo(() => valuesNow(settingsNow(a.book, a.valuationDay)), [a]);
  const [val, setVal] = useState(f.num && typeof row.value === "number" ? "" : String(row.value)), [reason, setReason] = useState(""), [seen, setSeen] = useState({ v: false, r: false }), [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null);
  const p = val === "" && f.num ? null : checkChange(a.book, f.key, val, values), vNo = p && !p.ok ? p.text : null, rNo = reasonRefusal(reason), over = [...reason.trim()].length > REASON_MAX;
  const can = !!p && p.ok && !rNo && !busy;
  const save = () => {
    if (!can) return;
    setBusy(true); setMsg(null);
    pfSettingSet(a.book.id, f.key, val, reason).then(() => { onDone(); })
      .catch((e: unknown) => { setBusy(false); setMsg(failureWords(e, { offline: "Offline: a change needs the server.", signedOut: "Signed out: sign in again. Nothing was changed.", refused: (w) => `Not saved: ${w}. Nothing changed.` })); });
  };
  const body = (
    <div className={`pf-change${phone ? " ph" : ""}`} id="pf-change" data-key={f.key}>
      <div className="ln"><span className="k">In force now</span><span>{showValue(f, row.value)} · {row.by} · since {dmy(row.since)}</span></div>
      <div className="ln"><label className="k" htmlFor="pf-change-value">New value</label>
        <span className="v">{f.choices ? <Chips field={f} value={val} onChange={(v) => { setVal(v); setSeen((s) => ({ ...s, v: true })); }} phone={phone} /> : <NumInput id="pf-change-value" field={f} value={val} onChange={(v) => { setVal(v); setSeen((s) => ({ ...s, v: true })); }} refusal={seen.v ? vNo : null} phone={phone} autoFocus={!phone} />}<span className="pf-unit2">{f.range}</span>{f.choices && seen.v && vNo && <span className="pf-no" role="alert">{vNo}</span>}</span></div>
      <div className="ln"><label className="k" htmlFor="pf-change-reason">Reason</label>
        <span className="v"><textarea id="pf-change-reason" rows={phone ? 3 : 2} value={reason} placeholder="why this change" aria-invalid={seen.r && rNo ? true : undefined} aria-describedby="pf-change-gist" onChange={(e) => setReason(e.target.value)} onBlur={() => setSeen((s) => ({ ...s, r: true }))} />
          {(seen.r || over) && rNo && <span className="pf-no" id="pf-change-reason-no" role="alert">{rNo}</span>}
          <span className="pf-mut" id="pf-change-gist">kept in the history · {ONLY_YOU} see it · {NOTE_GIST.replace("Notes are for your own reasoning. ", "")}</span></span></div>
      <div className="ln when" id="pf-change-when">In force from the next session: {wdmy(a.nextSession)}</div>
      {msg && <p className="pf-msg" role="status">{msg}</p>}
      <div className="pf-btns"><button type="button" className={`pf-btn${phone ? " big" : ""}`} id="pf-change-cancel" onClick={onCancel}>{phone ? "Cancel" : "CANCEL"}</button><button type="button" className={`pf-go${phone ? " big" : ""}`} id="pf-change-save" disabled={!can} onClick={save}>{busy ? "Saving…" : phone ? "Save change" : "SAVE CHANGE"}</button></div>
    </div>
  );
  return phone ? <Sheet title={`Change · ${f.label}`} onClose={onCancel} id="pf-change-sheet">{body}</Sheet> : <div className="pf-changebox" role="group" aria-label={`Change ${f.label}`}><div className="t">CHANGE · {f.label.toUpperCase()}<button type="button" className="x" aria-label="Close" onClick={onCancel}>&times;</button></div>{body}</div>;
}

/** The settings' own log: every row ever written, newest first. Thirty rows, then SHOW 30 MORE. */
function History({ rows, phone }: { rows: HistoryRow[]; phone: boolean }) {
  const [shown, setShown] = useState(30);
  const more = rows.length > shown && <button type="button" className={phone ? "mp-more" : "pf-link more"} data-act="more" onClick={() => setShown((s) => s + 30)}>{phone ? "Show 30 more" : "SHOW 30 MORE"}</button>;
  if (phone) return (
    <div className="pfp-hist" data-view="history">
      {rows.slice(0, shown).map((h) => <div className="h" key={h.id} data-key={h.key} data-origin={h.origin}><span className="a">{h.label} · {h.from} → {h.to}</span><span className="b">in force from {h.inForceFrom ? dmy(h.inForceFrom) : "–"} · set {stampSgt(h.at)}{h.state ? ` · ${h.state}` : ""}</span><span className="c">{h.reason ?? h.by}</span></div>)}
      {more}
    </div>
  );
  return (
    <div data-view="history">
      <table className="secT pf-hist"><thead><tr><th className="l">When</th><th className="l">Setting</th><th>From</th><th>To</th><th className="l">In force from</th><th className="l">Reason</th><th className="l">By</th></tr></thead>
        <tbody>{rows.slice(0, shown).map((h) => <tr key={h.id} data-key={h.key} data-origin={h.origin}><td className="l mut nb">{stampSgt(h.at)}</td><td className="l wrap">{h.label}</td><td className="num">{h.from}</td><td className="num">{h.to}</td><td className="l nb">{h.inForceFrom ? dmy(h.inForceFrom) : "–"}{h.state && <span className="st"> · {h.state}</span>}</td><td className="l wrap rs">{h.reason ?? "–"}</td><td className="l wrap mut">{h.by}</td></tr>)}</tbody></table>
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
    <>{r ? showValue(f, r.value) : f.text}{f.key === "funding" && <span className="pf-line">the other way comes with currencies</span>}{r?.pending && <span className="pf-pending" data-pending={f.key}>{shortValue(f, r.pending.value)} from {wdmy(r.pending.from)} · pending</span>}</>
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
            const inner = <><span className="nm"><span className="n">{f.label}{f.mark && <Assumed />}</span><span className="s">{f.range === "fixed" ? "fixed" : f.range} · {r ? r.by : f.who.tag} · since {dmy(r?.since ?? a.book.startedOn)}</span></span><span className="v">{valueCell(f, r)}</span></>;
            // a value in words (a fixed line of text) takes the row's whole width under its name: beside it, it would be a column of a few words
            const long = !f.num && String(r ? showValue(f, r.value) : f.text ?? "").length > 36;
            return tap ? <button type="button" className="pfp-set tap" key={f.key} data-row={f.key} onClick={() => setOpen(f.key)}>{inner}<span className="go" aria-hidden="true">&#8250;</span></button> : <div className={`pfp-set${long ? " long" : ""}`} key={f.key} data-row={f.key}>{inner}</div>; })}
        </div>
      ))}
      {open && can(rows.find((x) => x.key === open)) && <ChangeForm a={a} row={rows.find((x) => x.key === open)!} phone onDone={done} onCancel={() => setOpen(null)} />}
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
                <tr key={f.key} data-row={f.key}><td className="l wrap">{f.label}{f.mark && <Assumed />}</td><td className="l wrap vl">{valueCell(f, r)}</td><td className="l mut nb">{f.range}</td><td className="l wrap mut">{f.why}</td><td className="l"><ByTag tag={r ? r.by : f.who.tag} card={r ? byCard(r) : f.who.card} /></td><td className="l mut nb">{dmy(r?.since ?? a.book.startedOn)}</td>
                  <td>{can(r) && <button type="button" className="pf-link" data-act="change" aria-expanded={open === f.key} onClick={() => setOpen(open === f.key ? null : f.key)}>CHANGE</button>}</td></tr>,
                open === f.key && can(r) ? <tr key={`${f.key}-change`} className="pf-changerow"><td colSpan={7}><ChangeForm a={a} row={r} phone={false} onDone={done} onCancel={() => setOpen(null)} /></td></tr> : null,
              ]; })}
          </tbody>
        ))}
      </table>
    </>
  );
}

/** 02 TARGETS: the two targets with their window, and the band and the amber line, which change as limits do. */
function Targets({ a, phone, onChanged }: { a: BookAnswer; phone: boolean; onChanged: () => void }) {
  const b = a.book, t = targetsNow(b, a.nyDate), now = useMemo(() => settingsNow(b, a.valuationDay), [b, a.valuationDay]), values = valuesNow(now);
  const [form, setForm] = useState(false), [x, setX] = useState(""), [vol, setVol] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null), [open, setOpen] = useState<string | null>(null);
  const fx = fieldOf(b.start, "target_x")!, fv = fieldOf(b.start, "target_vol")!, lim = typeof values.var === "number" ? values.var : null;
  const c = form ? checkTargets(b.start, x, vol, lim) : null, no = (k: string): string | null => (c && !c.ok ? c.refusals.find((r) => r.key === k && !/implies a 99%/.test(r.text))?.text ?? null : null);
  const xv = /^\d+(\.\d+)?$/.test(x.trim()) ? Number(x) : null, vv = /^\d+(\.\d+)?$/.test(vol.trim()) ? Number(vol) : null;
  const start = () => { setX(inputText(fx, t.pending?.x ?? t.x)); setVol(inputText(fv, t.pending?.vol ?? t.vol)); setMsg(null); setForm(true); };
  const save = () => { if (!c?.ok || busy) return; setBusy(true); setMsg(null);
    pfTargetsSet(b.id, x, vol).then(() => { setBusy(false); setForm(false); onChanged(); }).catch((e: unknown) => { setBusy(false); setMsg(failureWords(e, { offline: "Offline: a change needs the server.", signedOut: "Signed out: sign in again. Nothing was changed.", refused: (w) => `Not saved: ${w}. Nothing changed.` })); }); };
  const state = t.window.fixed ? "fixed" : WINDOW_WORDS;
  const band = now.filter((r) => r.field.section === "targets" && r.field.after === "limit"), fixedRows = STARTS[b.start].fields.filter((f) => f.section === "targets" && !f.num && !f.choices && f.key !== "reference");
  const line = (label: string, value: ReactNode, tail: ReactNode, key: string) => <div className="pf-kv" key={key} data-row={key}><span className="k">{label}</span><span className="v">{value}</span><span className="t">{tail}</span></div>;
  return (
    <div className={`pf-targets${phone ? " ph" : ""}`} id="pf-targets">
      {line(TARGET_RETURN, <>cash + {t.x.toFixed(1)}% a year<EquivalentLine x={t.x} rate={a.rates[b.base]} base={b.base} /></>, <span className="pf-fixed" data-state={t.window.fixed ? "fixed" : "window"}>{state}</span>, "target_x")}
      {line(TARGET_VOLATILITY, <>{t.vol.toFixed(1)}% of capital a year</>, <span className="pf-fixed">{state}</span>, "target_vol")}
      <div className="pf-window" id="pf-window">
        {t.since && <Muted>in force since {dmy(t.since)}</Muted>}
        {t.lapsed != null && !t.pending && <Muted id="pf-lapsed">targets not re-set: no year reset</Muted>}
        {t.pending && <Muted id="pf-pending-targets">pending for {t.pending.forYear}: {targetsWords(t.pending.x, t.pending.vol)}</Muted>}
        {!t.window.fixed && !t.window.open && t.window.next && <Muted id="pf-nextwindow">{t.window.next}</Muted>}
        {t.window.open && !form && <button type="button" className={`pf-btn${phone ? " big" : ""}`} id="pf-reset" onClick={start}>{phone ? `Re-set for ${t.window.forYear}` : "RE-SET FOR NEXT YEAR"}</button>}
        {form && (
          <div className="pf-resetform" id="pf-resetform">
            <div className="ln"><label className="k" htmlFor="pf-reset-x">{TARGET_RETURN}</label><span className="v"><NumInput id="pf-reset-x" field={fx} value={x} onChange={setX} refusal={no("target_x")} phone={phone} /><span className="pf-unit2">{fx.range}</span><EquivalentLine x={xv} rate={a.rates[b.base]} base={b.base} /></span></div>
            <div className="ln"><label className="k" htmlFor="pf-reset-vol">{TARGET_VOLATILITY}</label><span className="v"><NumInput id="pf-reset-vol" field={fv} value={vol} onChange={setVol} refusal={no("target_vol")} phone={phone} /><span className="pf-unit2">{fv.range}</span><VolLines x={xv} vol={vv} cut1={b.ladder.cut1} varLimit={lim} /></span></div>
            {msg && <p className="pf-msg" role="status">{msg}</p>}
            <div className="pf-btns"><button type="button" className={`pf-btn${phone ? " big" : ""}`} onClick={() => setForm(false)}>{phone ? "Cancel" : "CANCEL"}</button><button type="button" className={`pf-go${phone ? " big" : ""}`} id="pf-reset-save" disabled={!c?.ok || busy} onClick={save}>{busy ? "Saving…" : phone ? "Save" : "SAVE"}</button></div>
          </div>
        )}
      </div>
      {band.map((r) => (
        <div key={r.key}>
          {line(r.field.label, <>{showValue(r.field, r.value)}{r.pending && <span className="pf-pending" data-pending={r.key}>{shortValue(r.field, r.pending.value)} from {wdmy(r.pending.from)} · pending</span>}</>, <><span className="pf-mut">{r.field.range} · {r.by} · since {dmy(r.since)}</span> <button type="button" className="pf-link" data-act="change" aria-expanded={open === r.key} onClick={() => setOpen(open === r.key ? null : r.key)}>CHANGE</button></>, r.key)}
          {open === r.key && <ChangeForm a={a} row={r} phone={phone} onDone={() => { setOpen(null); onChanged(); }} onCancel={() => setOpen(null)} />}
        </div>
      ))}
      {fixedRows.map((f) => line(f.label, f.text, <span className="pf-fixed">fixed</span>, f.key))}
    </div>
  );
}

function Rename({ a, others, phone, onChanged }: { a: BookAnswer; others: string[]; phone: boolean; onChanged: () => void }) {
  const [edit, setEdit] = useState(false), [name, setName] = useState(a.book.name), [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null);
  const no = nameRefusal(name, others), same = name.trim() === a.book.name;
  const save = () => { if (no || same || busy) return; setBusy(true); setMsg(null); pfRename(a.book.id, name.trim()).then(() => { setBusy(false); setEdit(false); onChanged(); }).catch((e: unknown) => { setBusy(false); setMsg(failureWords(e, { offline: "Offline: a change needs the server.", signedOut: "Signed out: sign in again. Nothing was changed.", refused: (w) => `Not saved: ${w}. Nothing changed.` })); }); };
  if (!edit) return <><span className="pf-name">{a.book.name}</span> <button type="button" className="pf-link" id="pf-rename" onClick={() => { setName(a.book.name); setEdit(true); }}>RENAME</button></>;
  return (
    <span className={`pf-num${no ? " bad" : ""}${phone ? " ph" : ""}`}>
      <span className="pf-in"><input id="pf-rename-in" className="name" type="text" value={name} autoComplete="off" aria-label="The portfolio's name" aria-invalid={no ? true : undefined} onChange={(e) => setName(e.target.value)} autoFocus />
        <button type="button" className="pf-btn" id="pf-rename-save" disabled={!!no || same || busy} onClick={save}>SAVE</button><button type="button" className="pf-btn" onClick={() => setEdit(false)}>CANCEL</button></span>
      {no && <span className="pf-no" role="alert">{no}</span>}{msg && <span className="pf-msg">{msg}</span>}
    </span>
  );
}

/** 07 DELETE: the sentence, the button, then the name to type. No UNDO: the sentence said so. */
function Delete({ a, phone, last }: { a: BookAnswer; phone: boolean; last: boolean }) {
  const [open, setOpen] = useState(false), [typed, setTyped] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null);
  const exact = typed.trim() === a.book.name, wrong = !exact && typed.trim().length >= 6;
  const del = () => { if (!exact || busy) return; setBusy(true); setMsg(null);
    pfDelete(a.book.id, a.book.name).then(() => { setLastBook(null); flash(`Paper portfolio deleted · ${a.book.name}`); go(last ? "" : "all"); })
      .catch((e: unknown) => { setBusy(false); setMsg(failureWords(e, { offline: "Offline: deleting needs the server.", signedOut: "Signed out: sign in again. Nothing was removed.", refused: (w) => `Not deleted: ${w}. Nothing was removed.` })); }); };
  return (
    <div className={`pf-delete${phone ? " ph" : ""}`} id="pf-delete">
      <p>Delete this paper portfolio and everything in it: its settings and their history, and its notes. It cannot be undone.</p>
      {!open ? <button type="button" className={`pf-btn danger${phone ? " big" : ""}`} id="pf-delete-open" onClick={() => setOpen(true)}>{phone ? "Delete this portfolio…" : "DELETE THIS PORTFOLIO…"}</button> : (
        <>
          <p className="ask">Type the portfolio's name to delete it: <b id="pf-delete-name">{a.book.name}</b></p>
          <span className={`pf-num${phone ? " ph" : ""}`}><span className="pf-in"><input id="pf-delete-in" className="name" type="text" value={typed} autoComplete="off" spellCheck={false} aria-label="The portfolio's name, to delete it" onChange={(e) => setTyped(e.target.value)} autoFocus /></span></span>
          {wrong && <p className="pf-mut" id="pf-delete-wrong">that is not this portfolio's name</p>}
          {msg && <p className="pf-msg" role="status">{msg}</p>}
          <div className="pf-btns"><button type="button" className={`pf-btn${phone ? " big" : ""}`} onClick={() => { setOpen(false); setTyped(""); }}>{phone ? "Cancel" : "CANCEL"}</button><button type="button" className={`pf-btn danger${phone ? " big" : ""}`} id="pf-delete-go" disabled={!exact || busy} onClick={del}>{busy ? "Deleting…" : phone ? "Delete" : "DELETE"}</button></div>
        </>
      )}
    </div>
  );
}

export function Settings({ a, section, others, phone, onChanged }: { a: BookAnswer; section: string; others: string[]; phone: boolean; onChanged: () => void }) {
  const b = a.book, def = STARTS[b.start], L = b.ladder, cum = cumulative(L), usd = b.fx ? usdLine(fromMinor(b.base, b.startingNav), b.fx).line : null;
  const fixed = (label: string, value: ReactNode, key: string) => <div className="pf-kv" key={key} data-row={key}><span className="k">{label}</span><span className="v">{value}</span><span className="t"><span className="pf-fixed">fixed</span></span></div>;
  // an address that names a section opens there (#portfolio/<id>/settings/limits); a chip goes to its panel's head.
  // The section is brought to the top of whatever scrolls (the window; the page's own box in the one-screen layout),
  // under what stays there: the header on a computer (--pf-top, kept by useHeaderTop), the two views on a phone
  // (styles/pf.css gives each section that margin).
  const root = useRef<HTMLDivElement>(null);
  useHeaderTop(root);
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
    targets: { aux: "neither target is a limit", body: <Targets a={a} phone={phone} onChanged={onChanged} /> },
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
    limits: { aux: "each changes with a reason, from the next session", body: <SettingList a={a} after="limit" phone={phone} onChanged={onChanged} /> },
    assumptions: { aux: <>each marked <Assumed /> · changes with a reason, from the next session</>, body: <SettingList a={a} after="assumption" phone={phone} onChanged={onChanged} /> },
    statement: { body: <div id="pf-agreed"><p className="pf-agreedline">{a.consent.agreedAt ? `Agreed ${stampSgt(a.consent.agreedAt)} · version ${a.consent.version}` : "Not agreed yet"}</p><p className="pf-statement small">{a.consent.text}</p></div> },
    delete: { body: <Delete a={a} phone={phone} last={others.length === 0} /> },
  };
  if (phone) return (
    <div className="pfp-settings" id="pf-settings" ref={root}>
      <div className="mp-picks top pfp-pad"><JumpPick dep={`${b.id}|settings`} /></div>
      {SETTINGS_SECTIONS.map(([k, title]) => <div key={k} data-sec={k}><Section title={title} aux={k === "ladder" ? "fixed" : undefined} card={false}><div className="mp-card pad">{parts[k].body}</div></Section></div>)}
    </div>
  );
  return (
    <div id="pf-settings" ref={root}>
      <div className="chips pf-goto" id="pf-goto"><span className="lbl">GO TO</span>{SETTINGS_SECTIONS.map(([k, title]) => <a key={k} className={`chip-sm${section === k ? " on" : ""}`} href={href(`${b.id}/settings/${k}`)}>{title.toUpperCase()}</a>)}</div>
      <div className="pf-grid">
        {SETTINGS_SECTIONS.map(([k, title]) => <div key={k} className={k === "ladder" || k === "limits" || k === "assumptions" ? "w12" : "w6"} data-sec={k}><Panel no={numbered(k)} title={title.toUpperCase()} k={`pfs-${k}`} aux={parts[k].aux} csv={k === "limits" || k === "assumptions"}>{parts[k].body}</Panel></div>)}
      </div>
    </div>
  );
}
