// NEW PAPER PORTFOLIO (P-1): a start, its settings in seven sections, a summary, CREATE. Every field shows its default,
// its range, one line of why and whose it is; a value out of its range or off its step is refused in words under the
// field, never corrected. The same rules run on the server before anything is stored (lib/pf/form.ts is the server's
// file). A computer shows the form beside its summary; a phone two screens (the start, then Review) and one screen per
// section to edit. What is typed is kept in this tab while the form is open elsewhere (sessionStorage, `om_pf_draft`),
// and is never sent anywhere before CREATE: one draft per start (the designer's B.1 UI-4), so Back or Forward to another
// start's address shows that start's own draft or its defaults and coming back restores the first; a refused value is
// typed text and is kept like any other; a typed name stays when the start changes. The drafts belong to the account
// that typed them: they carry that account's id, drafts that are another account's are dropped when the form opens, and
// SIGN OUT removes them (lib/api.ts). An expired sign-in keeps them, for the same person to find on signing in again.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Panel } from "../Panel";
import { Section } from "../PhoneKit";
import { Sheet } from "../Sheet";
import { Consent } from "./Consent";
import { Assumed, ByTag, Chips, go, href, markCreated, Muted, NumInput, setLastBook, useHeaderTop } from "./shared";
import { EquivalentLine, FundingLine, LadderBases, ReferenceLine, TieLine, TradeLists, VolLines } from "./Blocks";
import { accountId, failureWords, pfCreate, PfError, serverWords, useRead } from "../../lib/pf";
import { useNet } from "../../lib/net";
import { pageY, scrollToY } from "../../lib/scroller";
import { checkForm, cleanName, defaultRaw, freeName, inputText, outOfRange, usdLine, type Checked, type Raw } from "../../lib/pf/form.ts";
import { fmtFull, NAV_RANGE, parseAmount } from "../../lib/pf/money.ts";
import { ADJ_GROSS_CARD, AR_STARTS, CAP_LINE, fieldOf, fieldsOf, FIXED_LINE, isStart, leverageHelp, referenceLabel, RR_STARTS, SECTIONS, STARTS } from "../../lib/pf/presets.ts";
import { NOT_AGREED } from "../../lib/pf/statement.ts";
import { cumulative, drawdownLine, ladderShort, restoreLine } from "../../lib/pf/targets.ts";
import { shortValue } from "../../lib/pf/view.ts";
import { hmSgt, sgDate, timeSgt, WINDOW_WORDS } from "../../lib/pf/calendar.ts";
import type { Base, ConsentState, Field, FormFacts, LadderBase, Refusal, SectionId, StartId } from "../../lib/pf/types.ts";
import { REFERENCE, TARGET_RETURN, TARGET_VOLATILITY } from "../../lib/labels";

const DRAFT = "om_pf_draft";
/** A start's own draft: what was typed in its fields, its request id, and when it was typed. */
interface StartDraft { raw: Raw; rid: string; at: string }
/** The drafts of one account in this tab (`who`: lib/pf.ts accountId): one per start, and the name typed (null while
 *  the default name stands), with when it was typed. */
interface Drafts { v: 2; who: string; name: string | null; nameAt: string | null; starts: Partial<Record<StartId, StartDraft>> }
const newRid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 8)}`;
const noDrafts = (who: string): Drafts => ({ v: 2, who, name: null, nameAt: null, starts: {} });
/** The drafts this tab holds, if they are this account's. Drafts of another account (or naming none) are removed. A
 *  draft of a page of before 22 Nov 2026 (one start) is read as that start's. */
function readDrafts(): Drafts | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT) ?? "null") as (Partial<Drafts> & { start?: string; raw?: Raw; rid?: string; at?: string; nameEdited?: boolean; name?: string | null }) | null;
    if (!d) return null;
    const who = accountId();
    if (!who || d.who !== who) { sessionStorage.removeItem(DRAFT); return null; }
    if (d.v === 2 && d.starts && typeof d.starts === "object") {
      const starts: Drafts["starts"] = {};
      for (const [s, x] of Object.entries(d.starts)) if (isStart(s) && STARTS[s].offered && x && typeof x === "object" && x.raw && typeof x.rid === "string") starts[s] = x;
      return { v: 2, who, name: typeof d.name === "string" ? d.name : null, nameAt: typeof d.nameAt === "string" ? d.nameAt : null, starts };
    }
    if (typeof d.start === "string" && isStart(d.start) && STARTS[d.start].offered && d.raw && typeof d.rid === "string" && typeof d.at === "string")
      return { v: 2, who, name: d.nameEdited && typeof d.name === "string" ? d.name : null, nameAt: d.nameEdited ? d.at : null, starts: { [d.start]: { raw: d.raw, rid: d.rid, at: d.at } } };
    return null;
  } catch { return null; }
}
/** Writes the drafts back with one start's draft (or none) and the name as typed (or none); nothing left: removed. */
function writeDrafts(start: StartId, mine: StartDraft | null, name: { text: string; at: string } | null): void {
  try {
    const who = accountId();
    if (!who) { sessionStorage.removeItem(DRAFT); return; }
    const d = readDrafts() ?? noDrafts(who);
    if (mine) d.starts[start] = mine; else delete d.starts[start];
    const was = d.name;
    d.name = name ? name.text : null; d.nameAt = name ? (was === name.text && d.nameAt ? d.nameAt : name.at) : null;
    if (!d.name && !Object.keys(d.starts).length) sessionStorage.removeItem(DRAFT); else sessionStorage.setItem(DRAFT, JSON.stringify(d));
  } catch { /* not kept */ }
}
/** Whether what is typed differs from a start's defaults, as text: a refused value counts (UI-4 (b)). */
const typedDiffers = (raw: Raw, def: Raw): boolean => Object.keys({ ...raw, ...def }).some((k) => (raw[k] ?? "") !== (def[k] ?? ""));

/** Focuses a field once its screen is drawn (`go` changes the address after any open sheet has settled, so it is
 *  looked for again for up to about a second); with `rowSel` (a phone's section screen) its row is first scrolled to
 *  just under the page's sticky header, where the screen's title stands at the top (UI-18). */
function focusRow(sel: string | string[], rowSel?: string, tries = 30): void {
  // a list of selectors is tried in its order: the first that finds an element is the field
  const el = (Array.isArray(sel) ? sel : [sel]).map((x) => document.querySelector<HTMLElement>(x)).find((x) => !!x) ?? null;
  if (!el) { if (tries > 0) setTimeout(() => focusRow(sel, rowSel, tries - 1), 40); return; }
  const row = rowSel ? document.querySelector<HTMLElement>(rowSel) : null;
  // the header sticks at the top once the page scrolls: the row goes to its height (not to where it stands now)
  if (row) { const head = document.querySelector<HTMLElement>(".pfp > .mp-head")?.getBoundingClientRect().height ?? 0; scrollToY(Math.max(0, pageY(row) - head - 8)); }
  el.focus({ preventScroll: !!row });
}

/** `new`, `new/ar-ls-jp`, and on a phone `new/ar-ls-jp/review` and `new/ar-ls-jp/edit/limits`. An older address
 *  (`new/ar-ls`) opens the Japan start; a start that is not offered yet opens the form's own first start. */
function parseNew(sub: string): { start: StartId | null; step: "start" | "review" | "edit"; section: SectionId | null } {
  const [, s = "", step = "", sec = ""] = sub.split("/");
  const start = s === "ar-ls" ? "ar-ls-jp" : isStart(s) && STARTS[s].offered ? s : null;
  const section = SECTIONS.find((x) => x.id === sec)?.id ?? null;
  return { start, step: step === "review" ? "review" : step === "edit" && section ? "edit" : "start", section };
}

export function NewPortfolio({ sub, phone, tick }: { sub: string; phone: boolean; tick: number }) {
  const facts = useRead<FormFacts>("pf_form", {}, Math.floor(tick / 5));
  if (!facts.data) {
    return facts.error
      ? <Shell phone={phone}><p className="pf-err" id="pf-form-error">The starts' defaults could not be read: {serverWords(facts.error)}. <button type="button" className="pf-link" onClick={facts.reload}>RETRY</button></p></Shell>
      : <Shell phone={phone}><Muted>loading…</Muted></Shell>;
  }
  if (facts.data.open >= facts.data.cap) return <Shell phone={phone}><p className="pf-capline" id="pf-cap">{CAP_LINE} <a className="pf-link" href={href("all")}>ALL PORTFOLIOS ›</a></p></Shell>;
  return <Form sub={sub} phone={phone} facts={facts.data} reloadFacts={facts.reload} />;
}
const Shell = ({ phone, children }: { phone: boolean; children: ReactNode }) => (phone
  ? <div className="mp pfp"><header className="mp-head doc"><a className="mp-back" href={href("")}>&#8249; Portfolio</a></header><h1 className="pfp-title">New paper portfolio</h1><div className="pfp-pad">{children}</div></div>
  : <div className="pf"><div className="pf-head"><h2>NEW PAPER PORTFOLIO</h2><a className="pf-link" href={href("all")}>&#8249; ALL PORTFOLIOS</a></div>{children}</div>);

function Form({ sub, phone, facts, reloadFacts }: { sub: string; phone: boolean; facts: FormFacts; reloadFacts: () => void }) {
  const addr = parseNew(sub);
  // the drafts as the form opens: the start the address names, or with none the start typed in last, else the first
  const first = useRef<{ d: Drafts | null; start: StartId } | undefined>(undefined);
  if (first.current === undefined) {
    const d = readDrafts(), latest = d ? (Object.entries(d.starts) as Array<[StartId, StartDraft]>).sort((x, y) => y[1].at.localeCompare(x[1].at))[0]?.[0] : undefined;
    first.current = { d, start: addr.start ?? latest ?? AR_STARTS[0] };
  }
  const init = first.current, own0 = init.d?.starts[init.start] ?? null;
  const [start, setStart] = useState<StartId>(init.start);
  const [raw, setRawAll] = useState<Raw>(() => own0?.raw ?? defaultRaw(init.start, "USD"));
  // the name typed; while none is, the start's default, free by rule (freeName: " · 2" when an open book has it, UI-1)
  const [typedName, setName] = useState<string>(init.d?.name ?? "");
  const [nameEdited, setNameEdited] = useState<boolean>(init.d?.name != null);
  const name = nameEdited ? typedName : freeName(start, facts.today, facts.names);
  const [rid, setRid] = useState<string>(own0?.rid ?? newRid());
  const [back, setBack] = useState<string | null>(own0?.at ?? init.d?.nameAt ?? null);   // "Your unsaved settings from 17:02 SGT are back"
  const refusedIn = (s: StartId, r: Raw): boolean => checkForm(s, nameEdited ? typedName : freeName(s, facts.today, facts.names), r, facts.names).refusals.length > 0;
  // a field already refused when the form opens (a draft restored, or a name taken since) shows its sentence at once
  const [touched, setTouched] = useState<Set<string>>(() => (checkForm(init.start, init.d?.name ?? freeName(init.start, facts.today, facts.names), own0?.raw ?? defaultRaw(init.start, "USD"), facts.names).refusals.length > 0 && (own0 || init.d?.name != null) ? new Set(["*"]) : new Set()));
  const [showChanged, setShowChanged] = useState(false);
  const [ask, setAsk] = useState<StartId | null>(null);                             // a change of start waiting for KEEP or CHANGE
  const [costsOpen, setCostsOpen] = useState(false);
  const [consent, setConsent] = useState<ConsentState>(facts.consent);
  const [card, setCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [server, setServer] = useState<Refusal[]>([]);
  const net = useNet();
  useEffect(() => { if (!net.offline) setMsg((m) => (m && m.startsWith("Offline") ? null : m)); }, [net.offline]);
  const sum = useRef<HTMLElement>(null);
  useHeaderTop(sum);
  const base: Base = raw.base === "JPY" ? "JPY" : "USD", def = STARTS[start];
  const c = useMemo<Checked>(() => checkForm(start, name, raw, facts.names), [start, name, raw, facts.names]);
  // this start's draft: what is typed differs from its defaults as text (a refused value counts: UI-4 (b))
  const startDirty = typedDiffers(raw, defaultRaw(start, base)), dirty = startDirty || nameEdited;

  // the drafts follow the form: this start's while anything typed differs from its defaults, the name while one is typed
  useEffect(() => { const at = new Date().toISOString(); writeDrafts(start, startDirty ? { raw, rid, at } : null, nameEdited ? { text: typedName, at } : null); }, [startDirty, start, nameEdited, typedName, raw, rid]);
  /** Another start: its own draft or its defaults; the name typed stays (UI-4). */
  const switchTo = (s: StartId) => {
    const own = readDrafts()?.starts[s] ?? null;
    setStart(s); setRawAll(own?.raw ?? defaultRaw(s, "USD")); setRid(own?.rid ?? newRid()); setBack(own?.at ?? null);
    setTouched(own && refusedIn(s, own.raw) ? new Set(["*"]) : new Set()); setServer([]); setMsg(null); setAsk(null); setShowChanged(false);
  };
  /** START AGAIN: this start's defaults and the default name; the other starts' drafts stay. */
  const startAgain = () => { writeDrafts(start, null, null); setName(""); setNameEdited(false); setRawAll(defaultRaw(start, "USD")); setRid(newRid()); setBack(null); setTouched(new Set()); setServer([]); setMsg(null); setShowChanged(false); };
  // the address names the start: Back and Forward, or an address typed, switch it without a question
  useEffect(() => { if (addr.start && addr.start !== start) switchTo(addr.start); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [addr.start]);
  // a change of start asks first when this start's settings were changed and the other start has no draft of its own
  // (its own draft comes back, and this one stays kept: nothing is lost then)
  const pickStart = (s: StartId) => { if (s === start) return; if (c.changed.length > 0 && !readDrafts()?.starts[s]) { setAsk(s); return; } switchTo(s); go(`new/${s}`); };

  const set = (k: string, v: string) => { setRawAll((r) => ({ ...r, [k]: v })); setServer((x) => x.filter((r) => r.key !== k)); setMsg(null); };
  const touch = (k: string) => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)));
  const setBase = (b: string) => {
    const nb: Base = b === "JPY" ? "JPY" : "USD";
    setRawAll((r) => {
      const out: Raw = { ...r, base: nb };
      if (parseAmount(r.nav ?? "") === NAV_RANGE[base].def) out.nav = fmtFull(NAV_RANGE[nb].def);   // the amount follows the currency while it is still the default
      if (nb === "JPY") delete out.funding; else out.funding = out.funding ?? "pb";
      return out;
    });
  };
  const leaveNav = () => { touch("nav"); const v = parseAmount(raw.nav ?? ""); if (v != null) setRawAll((r) => ({ ...r, nav: fmtFull(v) })); };   // written out in full with separators
  const typed = (k: string): string => raw[k] ?? defaultRaw(start, base)[k] ?? "";
  const isDefault = (f: Field): boolean => (f.key === "nav" ? parseAmount(typed("nav")) === NAV_RANGE[base].def : f.num ? typed(f.key).trim() === inputText(f, f.num.def) || c.values[f.key] === f.num.def : typed(f.key) === f.choices?.def);
  const resetField = (f: Field) => set(f.key, f.key === "nav" ? fmtFull(NAV_RANGE[base].def) : f.num ? inputText(f, f.num.def) : f.choices?.def ?? "");
  const pair: Record<string, string[]> = { cap2: ["cap1", "cap2"], amber: ["amber", "band"], target_vol: ["target_vol", "var"] };
  /** A field's refusal, shown once the field has been left (or at once where the server refused it). */
  const refusalOf = (k: string): string | null => {
    const s = server.find((r) => r.key === k); if (s) return s.text;
    const r = c.refusals.find((x) => x.key === k);
    if (!r) return null;
    if (k === "target_vol" && c.tie?.state === "refused" && r.text === c.tie.line) return null;   // the tie's own line says it, under the field
    return (pair[k] ?? [k]).some((x) => touched.has(x)) || touched.has("*") ? r.text : null;
  };
  const num = (k: string): number | null => (typeof c.values[k] === "number" ? (c.values[k] as number) : null);
  const blend = typeof c.values.blend === "string" ? Number(c.values.blend) : null;
  const ladderBase = (c.values.ladder_base as LadderBase | undefined) ?? "guarded";

  // ---- CREATE ----
  const count = c.refusals.length, offline = net.offline;
  const create = (agreed = consent) => {
    if (busy || count > 0) return;
    if (!agreed.agreedAt) { setCard(true); return; }
    setBusy(true); setMsg(null);
    pfCreate({ requestId: rid, start, name, values: raw })
      .then((r) => { writeDrafts(start, null, null); setLastBook(r.id); markCreated(r.id, cleanName(name)); go(r.id); })
      .catch((e: unknown) => {
        setBusy(false);
        if (e instanceof PfError && e.status === 409) { setConsent(e.consent ?? { ...consent, agreedAt: null }); setCard(true); return; }
        if (e instanceof PfError && e.refusals) { setServer(e.refusals); setTouched((t) => new Set(t).add("*")); setMsg(e.message); reloadFacts(); return; }
        // An earlier press of this form did create a book (its answer never arrived) and the form has changed since:
        // nothing is announced, the page says what exists, and the form as it now stands is a request of its own.
        if (e instanceof PfError && e.made) { setRid(newRid()); reloadFacts(); setMsg(`Nothing new was created: an earlier press of this form created "${e.made.name}", which is among your portfolios. Press ${phone ? "Create" : "CREATE"} again to create this one as well.`); return; }
        setMsg(failureWords(e, { offline: "Offline: a portfolio needs the server. Your settings are kept on this device.", signedOut: "Signed out: sign in again. Nothing was created; your settings are kept.", refused: (w) => `Not created: ${w}. Nothing was saved.` }));
      });
  };
  // the count goes to the first refused field: on a phone the name is on the first screen, a setting on its section's
  // screen, scrolled to just under the screen's title (UI-1, UI-18)
  const toFirst = () => { const k = c.refusals[0]?.key; if (!k) return; setTouched((t) => new Set(t).add("*"));
    if (k === "name" || !fieldOf(start, k)) {
      if (phone && k === "name" && addr.step !== "start") { go(`new/${start}`); setTimeout(() => focusRow("#pf-name"), 60); return; }
      document.querySelector<HTMLElement>(k === "nav" ? '[data-key="nav"]' : "#pf-name")?.focus(); return;
    }
    const sec = fieldOf(start, k)!.section; if (sec === "costs") setCostsOpen(true);
    if (phone) { go(`new/${start}/edit/${sec}`); setTimeout(() => focusRow(`[data-key="${k}"]`, `[data-row="${k}"]`), 60); return; }
    setTimeout(() => document.querySelector<HTMLElement>(`[data-key="${k}"]`)?.focus(), 30); };
  const createBlock = (
    <div className="pf-create" id="pf-create-block">
      <button type="button" className={`pf-go${phone ? " big" : ""}`} id="pf-create" disabled={busy || count > 0 || offline} onClick={() => create()}>{busy ? "Creating…" : phone ? "Create paper portfolio" : "CREATE PAPER PORTFOLIO"}</button>
      {count > 0 ? <button type="button" className="pf-count bad" id="pf-count" onClick={toFirst}>{outOfRange(count)}</button> : <span className="pf-count" id="pf-count">{outOfRange(0)}</span>}
      {offline && !msg && <span className="pf-msg" id="pf-create-msg">Offline: a portfolio needs the server. Your settings are kept on this device.</span>}
      {msg && <span className="pf-msg" id="pf-create-msg" role="status">{msg}</span>}
    </div>
  );
  const consentCard = card && <Consent consent={consent} what="portfolio" phone={phone} onAgreed={(x) => { setConsent(x); setCard(false); create(x); }} onNotNow={() => { setCard(false); setMsg(NOT_AGREED); }} />;

  // ---- one row's value cell, whatever the field ----
  const valueOf = (f: Field): ReactNode => {
    if (f.key === "nav") {
      const fx = base === "JPY" && c.nav != null ? usdLine(c.nav, facts.usdjpy) : null;
      return <><NumInput field={{ ...f, num: undefined }} value={typed("nav")} onChange={(v) => set("nav", v)} onBlur={leaveNav} refusal={refusalOf("nav")} phone={phone} wide /><span className="pf-unit2">{base}</span>{fx && <span className="pf-line" id="pf-usd">{fx.line}</span>}</>;
    }
    if (f.key === "base") return <Chips field={f} value={base} onChange={setBase} phone={phone} />;
    if (f.key === "ladder_base") return <LadderBases value={ladderBase} onChange={(b) => set("ladder_base", b)} phone={phone} />;
    if (f.key === "blend") return <select className="pf-select" id="pf-blend" aria-label={f.label} value={typed("blend")} onChange={(e) => set("blend", e.target.value)}>{f.choices!.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    if (f.key === "funding") return <FundingLine field={f} />;
    if (f.key === "reference") return <ReferenceLine start={start} base={base} blend={blend} />;
    if (f.key === "restore") { const c1 = num("cut1"), c2 = num("cut2"), cp = num("cap1"); return <span id="pf-restore">{c1 != null && c2 != null && cp != null ? `${restoreLine({ cut1: c1, cut2: c2, cap1: cp })}: ` : ""}{f.text}</span>; }
    if (f.key === "cash5") return <span>{f.text}{num("target_x") === 5 ? " (here it is the target)" : ""}</span>;
    if (f.choices) return <Chips field={f} value={typed(f.key)} onChange={(v) => set(f.key, v)} phone={phone} />;
    if (!f.num) return <span className="pf-fixedtext">{f.text}</span>;
    const cum = num("cut1") != null && num("cut2") != null ? cumulative({ cut1: num("cut1")!, cut2: num("cut2")!, out: num("out") ?? 0 }) : null;
    return (
      <>
        <NumInput field={f} value={typed(f.key)} onChange={(v) => set(f.key, v)} onBlur={() => touch(f.key)} refusal={refusalOf(f.key)} phone={phone} />
        {f.key === "band" && num("band") != null && <span className="pf-unit2">({100 - num("band")!}–{100 + num("band")!}%)</span>}
        {f.key === "cut2" && cum && <span className="pf-unit2" id="pf-at2">(at {cum.second.toFixed(1)}%)</span>}
        {f.key === "out" && cum && num("out") != null && <span className="pf-unit2" id="pf-at3">(at {cum.out.toFixed(1)}%)</span>}
        {!isDefault(f) && <span className="pf-changed">changed · <button type="button" className="pf-link" onClick={() => resetField(f)}>reset</button></span>}
        {f.key === "target_x" && <EquivalentLine x={num("target_x")} rate={facts.rates[base]} base={base} />}
        {f.key === "target_vol" && <VolLines x={num("target_x")} vol={num("target_vol")} cut1={num("cut1")} varLimit={num("var")} start={start} />}
        {f.key === "var" && c.tie && (c.tie.state !== "clear" || touched.has("var")) && <TieLine state={c.tie.state} line={c.tie.line} id="pf-tie-var" />}
        {f.key === "adj_gross" && <span className="pf-line">{ADJ_GROSS_CARD}</span>}
      </>
    );
  };
  const rowsOf = (sec: SectionId): Field[] => fieldsOf(start, sec, base);
  const badIn = (sec: SectionId): number => c.refusals.filter((r) => (r.key === "nav" ? sec === "kind" : fieldOf(start, r.key)?.section === sec)).length;
  const extraOf = (sec: SectionId): ReactNode => (sec === "trade" ? <TradeLists start={start} values={c.values} /> : sec === "limits" && start === "ar-macro" ? <Muted id="pf-levhelp">{leverageHelp(num("target_vol") ?? 5, null)}</Muted> : sec === "ladder" ? <Muted id="pf-drawdown">Drawdown: {drawdownLine(ladderBase)}</Muted> : null);
  const auxOf = (sec: SectionId): string => (sec === "targets" ? "the book aims at no index · neither target is a limit" : sec === "ladder" ? "the owner's rule · fixed after creation" : sec === "trade" ? "what the start can trade, and what it cannot trade here" : sec === "limits" ? "each changes later with a reason, from the next session" : "");
  // ---- what was changed from the defaults (UI-17, the designer's §4.9 "a click lists them"): a click on the line lists
  // them under it on a computer, each a way to its field; on a phone the line is a 44-px row that opens the sheet
  // CHANGED FROM THE DEFAULTS, one row each with Edit › to its section's screen ----
  const changedRows = c.changed.map((k) => {
    const f = fieldOf(start, k), label = k === "nav" ? "Starting NAV" : k === "base" ? "Base currency" : f?.label ?? k;
    const words = (v: number | string | undefined): string => (!f || v == null ? "–" : f.num && typeof v === "number" ? shortValue(f, v) : f.choices?.options.find((o) => o.value === v)?.label ?? String(v));
    const from = k === "nav" ? `${fmtFull(NAV_RANGE[base].def)} ${base}` : k === "base" ? "USD" : words(f?.num ? f.num.def : f?.choices?.def);
    const to = k === "nav" ? `${c.nav != null ? fmtFull(c.nav) : "–"} ${base}` : k === "base" ? base : words(c.values[k]);
    return { k, label, from, to, sec: (k === "nav" || k === "base" ? "kind" : f?.section ?? "kind") as SectionId };
  });
  const countWords = `${c.changed.length} setting${c.changed.length === 1 ? "" : "s"} changed from the defaults`;
  /** The field of a setting in its row: its input or select, else its chosen chip, else its first button. */
  const fieldSels = (k: string): string[] => [`[data-row="${k}"] .vl input:checked, [data-row="${k}"] .vl input:not([type=radio])`, `[data-row="${k}"] .vl select`, `[data-row="${k}"] .vl .pf-chip.on`, `[data-row="${k}"] .vl button`];
  /** A computer: the field of a changed setting, focused (07 opened where it is folded). */
  const toField = (k: string, sec: SectionId) => { if (sec === "costs") setCostsOpen(true); setTimeout(() => { fieldSels(k).map((x) => document.querySelector<HTMLElement>(x)).find((x) => !!x)?.focus(); }, 30); };
  /** A phone: the section's screen, the changed row just under its title, its field focused. */
  const toEdit = (k: string, sec: SectionId) => { setShowChanged(false); go(`new/${start}/edit/${sec}`); setTimeout(() => focusRow(fieldSels(k), `[data-row="${k}"]`), 60); };
  const changedLine = c.changed.length === 0 ? <div className="chg" id="pf-changedcount">{countWords}</div>
    : phone ? <button type="button" className="chg pfp-chgrow" id="pf-changedcount" aria-haspopup="dialog" onClick={() => setShowChanged(true)}>{countWords}</button>
      : <><button type="button" className="chg pf-link pf-chgbtn" id="pf-changedcount" aria-expanded={showChanged} aria-controls="pf-changedlist" onClick={() => setShowChanged((o) => !o)}>{countWords}</button>
        {showChanged && <ul className="pf-changedlist" id="pf-changedlist">{changedRows.map((r) => <li key={r.k} data-key={r.k}><button type="button" className="pf-link" onClick={() => toField(r.k, r.sec)}>{r.label} · {r.from} → {r.to}</button></li>)}</ul>}</>;
  const changedSheet = phone && showChanged && c.changed.length > 0 && (
    <Sheet title="Changed from the defaults" onClose={() => setShowChanged(false)} id="pf-changed-sheet">
      <div className="pfp-chglist" id="pf-changedlist">{changedRows.map((r) => <button type="button" className="pfp-chg" key={r.k} data-key={r.k} onClick={() => toEdit(r.k, r.sec)}><span className="tx">{r.label} · {r.from} → {r.to}</span><span className="e">Edit &#8250;</span></button>)}</div>
    </Sheet>
  );
  const summary = (
    <div className="pf-sumbody" id="pf-summary">
      <div>{def.name} · {def.kind} · {base}</div>
      <div>Starting NAV {c.nav != null ? `${fmtFull(c.nav)} ${base}` : "–"}</div>
      <div>{TARGET_RETURN} {num("target_x") != null ? `cash + ${num("target_x")}% (${facts.rates[base]?.name ?? (base === "JPY" ? "TONA" : "EFFR")})` : "–"}</div>
      <div>{TARGET_VOLATILITY} {num("target_vol") != null ? `${num("target_vol")}% of capital` : "–"}</div>
      <div>{REFERENCE} <ReferenceLine start={start} base={base} blend={blend} short /></div>
      <div>Ladder {num("cut1") != null && num("cut2") != null && num("out") != null ? ladderShort({ cut1: num("cut1")!, cut2: num("cut2")!, out: num("out")!, cap1: 0, cap2: 0, cooling: 0, deadline: 0 }, ladderBase) : "–"}</div>
      {def.summary(c.values).map((l) => <div key={l}>{l}</div>)}
      {changedLine}
      <p className="pf-mut fixedline">{ladderBase === "start" ? FIXED_LINE.replace(`${WINDOW_WORDS}, under a yearly base`, "re-set: never") : FIXED_LINE}</p>
    </div>
  );
  const draftWhen = (iso: string): string => `${sgDate(new Date(iso)) === sgDate(new Date()) ? hmSgt(iso) : timeSgt(iso)} SGT`;
  const draftLine = back && dirty ? <p className="pf-draft" id="pf-draft">Your unsaved settings from {draftWhen(back)} are back · <button type="button" className="pf-link" onClick={startAgain}>START AGAIN</button></p> : null;
  const askLine = ask ? <p className="pf-ask" id="pf-ask" role="alertdialog">Change the start? Your {c.changed.length} changed setting{c.changed.length === 1 ? " goes" : "s go"} back to the new start's defaults.{nameEdited ? " Your name stays." : ""} <button type="button" className="pf-btn" onClick={() => setAsk(null)}>KEEP</button> <button type="button" className="pf-btn" onClick={() => { const s = ask; switchTo(s); go(`new/${s}`); }}>CHANGE</button></p> : null;
  const nameNo = touched.has("name") || touched.has("*") || server.some((r) => r.key === "name") ? (server.find((r) => r.key === "name")?.text ?? c.refusals.find((r) => r.key === "name")?.text ?? null) : null;
  const nameField = (
    <span className={`pf-num${nameNo ? " bad" : ""}${phone ? " ph" : ""}`}>
      <span className="pf-in"><input id="pf-name" className="name" type="text" autoComplete="off" value={name} aria-label="Name" aria-invalid={nameNo ? true : undefined} aria-describedby={nameNo ? "pf-name-no" : undefined} onChange={(e) => { setName(e.target.value); setNameEdited(true); setServer((x) => x.filter((r) => r.key !== "name")); }} onBlur={() => { touch("name"); if (nameEdited) setName((n) => cleanName(n)); }} /></span>
      {nameNo && <span className="pf-no" id="pf-name-no" role="alert">{nameNo}</span>}
    </span>
  );

  // ---------------- a phone ----------------
  if (phone) {
    const sumOf = (sec: SectionId): string => (sec === "kind" ? `${base} · ${c.nav != null ? fmtFull(c.nav) : "–"} · absolute return`
      : sec === "targets" ? `cash + ${num("target_x") ?? "–"}% · ${num("target_vol") ?? "–"}% of capital · ${referenceLabel(start, base, blend)?.short ?? ""} PROXY`
      : sec === "trade" ? `${def.trade.can[0]} · ${def.trade.cannot.length} lines of what it cannot trade here`
      : sec === "limits" ? def.summary(c.values)[0]
      : sec === "ladder" ? (num("cut1") != null && num("cut2") != null && num("out") != null ? ladderShort({ cut1: num("cut1")!, cut2: num("cut2")!, out: num("out")!, cap1: 0, cap2: 0, cooling: 0, deadline: 0 }, ladderBase) : "–")
      : sec === "cash" ? `floor ${num("floor") ?? "–"}% of NAV · house margin × ${num("house_multiple")?.toFixed(1) ?? "–"}`
      : `${rowsOf("costs").length} assumptions at the PMs' advice`);
    if (addr.step === "edit" && addr.section) {
      const sec = SECTIONS.find((s) => s.id === addr.section)!;
      return (
        <div className="mp pfp" data-step="edit">
          <header className="mp-head doc"><a className="mp-back" href={href(`new/${start}/review`)}>&#8249; Review</a></header>
          <h1 className="pfp-title">{sec.title}</h1>
          {auxOf(sec.id) && <p className="pf-mut pfp-pad">{auxOf(sec.id)}</p>}
          <div className="pfp-fields">
            {rowsOf(sec.id).map((f) => (
              <div className="pfp-field" key={f.key} data-row={f.key}>
                <div className="hd"><span className="lb">{f.label}{f.mark && <Assumed />}</span><ByTag tag={f.who.tag} card={f.who.card} phone /></div>
                <div className="vl">{valueOf(f)}</div>
                <div className="rg">{f.range !== "fixed" && f.range !== "–" ? `${f.range} · ` : f.range === "fixed" ? "fixed · " : ""}{f.key === "funding" ? null : f.why}</div>
              </div>
            ))}
          </div>
          <div className="pfp-pad">{extraOf(sec.id)}</div>
          {consentCard}
        </div>
      );
    }
    if (addr.step === "review") {
      return (
        <div className="mp pfp" data-step="review">
          <header className="mp-head doc"><a className="mp-back" href={href(`new/${start}`)}>&#8249; New paper portfolio</a></header>
          <h1 className="pfp-title">Review</h1>
          {c.changed.length > 0 && <div className="pfp-pad pfp-chgline">{changedLine}</div>}
          <div className="mp-card pfp-folds">
            {SECTIONS.map((s) => (
              <a className="pfp-fold" key={s.id} href={href(`new/${start}/edit/${s.id}`)} data-sec={s.id}>
                <span className="t">{s.title}</span><span className="s">{sumOf(s.id)}{badIn(s.id) > 0 && <b className="bad"> · {badIn(s.id)} out of range</b>}</span><span className="e">Edit &#8250;</span>
              </a>
            ))}
          </div>
          <p className="pf-mut pfp-pad">{FIXED_LINE}</p>
          <div className="pfp-foot">{createBlock}</div>
          {changedSheet}
          {consentCard}
        </div>
      );
    }
    return (
      <div className="mp pfp" data-step="start">
        <header className="mp-head doc"><a className="mp-back" href={href("")}>&#8249; Portfolio</a></header>
        <h1 className="pfp-title">New paper portfolio</h1>
        {draftLine}
        <Section title="Start from" aux="absolute return">
          <div role="radiogroup" aria-label="Start from">
            {AR_STARTS.map((s) => (
              <button type="button" role="radio" aria-checked={s === start} className={`pfp-start${s === start ? " on" : ""}`} key={s} data-start={s} onClick={() => pickStart(s)}>
                <span className="rd" aria-hidden="true" /><span className="tx"><span className="n">{STARTS[s].name}</span><span className="l">{STARTS[s].card.phone}</span></span>
              </button>
            ))}
          </div>
        </Section>
        {askLine}
        <div className="pfp-pad">{RR_STARTS.map((s) => <Muted key={s} cls="notyet">{STARTS[s].notYet?.phone}</Muted>)}</div>
        <Section title="Name" aux="only you see it" card={false}><div className="pfp-pad">{nameField}</div></Section>
        <Section title="What you are creating"><div className="pfp-sum">{summary}</div></Section>
        <div className="pfp-foot"><a className="pf-go big" id="pf-review" href={href(`new/${start}/review`)} role="button">Review</a></div>
        {changedSheet}
        {consentCard}
      </div>
    );
  }

  // ---------------- a computer ----------------
  const row = (f: Field): ReactNode => (
    <div className="pf-row" key={f.key} data-row={f.key}>
      <div className="c lb">{f.label}{f.mark && <Assumed />}</div>
      <div className="c vl">{valueOf(f)}</div>
      <div className="c rg">{f.range}</div>
      <div className="c wy">{f.key === "funding" ? null /* its why stands once, in its value (FundingLine) */ : f.why}</div>
      <div className="c by"><ByTag tag={f.who.tag} card={f.who.card} /></div>
    </div>
  );
  return (
    <div className="pf">
      <div className="pf-two">
        <div className="pf-form">
          <div className="pf-head"><h2>NEW PAPER PORTFOLIO</h2><a className="pf-link" href={href("all")}>&#8249; ALL PORTFOLIOS</a></div>
          {draftLine}
          <div className="pf-startrow" id="pf-starts">
            <span className="k">START FROM</span><span className="g">ABSOLUTE RETURN</span>
            <span className="pf-chips" role="radiogroup" aria-label="Start from">{AR_STARTS.map((s) => <button type="button" role="radio" aria-checked={s === start} key={s} data-start={s} className={`pf-chip${s === start ? " on" : ""}`} onClick={() => pickStart(s)}>{STARTS[s].name}</button>)}</span>
            <span className="g">RELATIVE RETURN</span><span className="pf-mut">Equity long-only and Fixed-income long-only: not offered yet</span>
          </div>
          {askLine}
          <div className="pf-namerow"><label className="k" htmlFor="pf-name">NAME</label>{nameField}<span className="pf-mut">only you see it</span></div>
          {SECTIONS.map((s) => {
            const fields = rowsOf(s.id), folded = s.id === "costs" && !costsOpen;
            return (
              <Panel key={s.id} no={s.no} title={s.title.toUpperCase()} k={`pfn-${s.id}`} csv={false}
                aux={s.id === "costs" ? <>{fields.length} assumptions at the PMs' advice · <button type="button" className="pf-link" id="pf-costs-edit" aria-expanded={costsOpen} onClick={() => setCostsOpen((o) => !o)}>{costsOpen ? "FOLD" : "EDIT"}</button></> : auxOf(s.id)}>
                {!folded && (
                  <>
                    {s.id === "limits" && extraOf("limits")}
                    {fields.length > 0 && <div className="pf-rows"><div className="pf-row hd"><div className="c">Setting</div><div className="c">Value</div><div className="c">Range</div><div className="c">Why</div><div className="c">By</div></div>{fields.map(row)}</div>}
                    {s.id !== "limits" && extraOf(s.id)}
                  </>
                )}
              </Panel>
            );
          })}
        </div>
        <aside className="pf-sum" ref={sum} aria-label="What you are creating">
          <div className="phead"><span className="t">WHAT YOU ARE CREATING</span></div>
          {summary}
          {createBlock}
        </aside>
      </div>
      {consentCard}
    </div>
  );
}
