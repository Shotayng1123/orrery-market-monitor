// NEW PAPER PORTFOLIO (P-1): a start, its settings in seven sections, a summary, CREATE. Every field shows its default,
// its range, one line of why and whose it is; a value out of its range or off its step is refused in words under the
// field, never corrected. The same rules run on the server before anything is stored (lib/pf/form.ts is the server's
// file). A computer shows the form beside its summary; a phone two screens (the start, then Review) and one screen per
// section to edit. What is typed is kept on this device while the form is open elsewhere (sessionStorage,
// `om_pf_draft`), and is never sent anywhere before CREATE.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Panel } from "../Panel";
import { Section } from "../PhoneKit";
import { Consent } from "./Consent";
import { Assumed, ByTag, Chips, flash, go, href, Muted, NumInput, setLastBook, useHeaderTop } from "./shared";
import { EquivalentLine, LadderBases, ReferenceLine, TieLine, TradeLists, VolLines } from "./Blocks";
import { failureWords, pfCreate, PfError, serverWords, useRead } from "../../lib/pf";
import { useNet } from "../../lib/net";
import { checkForm, defaultName, defaultRaw, inputText, outOfRange, usdLine, type Checked, type Raw } from "../../lib/pf/form.ts";
import { fmtFull, NAV_RANGE, parseAmount } from "../../lib/pf/money.ts";
import { ADJ_GROSS_CARD, AR_STARTS, CAP_LINE, fieldOf, fieldsOf, FIXED_LINE, isStart, leverageHelp, RR_STARTS, SECTIONS, STARTS } from "../../lib/pf/presets.ts";
import { NOT_AGREED } from "../../lib/pf/statement.ts";
import { cumulative, drawdownLine, ladderShort, restoreLine } from "../../lib/pf/targets.ts";
import { hmSgt } from "../../lib/pf/calendar.ts";
import type { Base, ConsentState, Field, FormFacts, LadderBase, Refusal, SectionId, StartId } from "../../lib/pf/types.ts";
import { REFERENCE, TARGET_RETURN, TARGET_VOLATILITY } from "../../lib/labels";

const DRAFT = "om_pf_draft";
interface Draft { start: StartId; name: string; nameEdited: boolean; raw: Raw; rid: string; at: string }
const newRid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 8)}`;
const readDraft = (): Draft | null => { try { const d = JSON.parse(sessionStorage.getItem(DRAFT) ?? "null") as Draft | null; return d && isStart(d.start) && STARTS[d.start].offered && d.raw && typeof d.name === "string" ? d : null; } catch { return null; } };
const writeDraft = (d: Draft | null): void => { try { if (d) sessionStorage.setItem(DRAFT, JSON.stringify(d)); else sessionStorage.removeItem(DRAFT); } catch { /* not kept */ } };

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
  const first = useRef<Draft | null | undefined>(undefined);
  if (first.current === undefined) { const d = readDraft(); first.current = d && (addr.start == null || addr.start === d.start) ? d : null; }
  const init = first.current;
  const [start, setStart] = useState<StartId>(init?.start ?? addr.start ?? AR_STARTS[0]);
  const [raw, setRawAll] = useState<Raw>(() => init?.raw ?? defaultRaw(init?.start ?? addr.start ?? AR_STARTS[0], "USD"));
  const [name, setName] = useState<string>(init?.name ?? defaultName(init?.start ?? addr.start ?? AR_STARTS[0], facts.today));
  const [nameEdited, setNameEdited] = useState<boolean>(init?.nameEdited ?? false);
  const [rid, setRid] = useState<string>(init?.rid ?? newRid());
  const [back, setBack] = useState<string | null>(init?.at ?? null);              // "Your unsaved settings from 17:02 are back"
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [ask, setAsk] = useState<StartId | null>(null);                             // a change of start waiting for KEEP or CHANGE
  const [costsOpen, setCostsOpen] = useState(false);
  const [consent, setConsent] = useState<ConsentState>(facts.consent);
  const [card, setCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [server, setServer] = useState<Refusal[]>([]);
  const net = useNet();
  const sum = useRef<HTMLElement>(null);
  useHeaderTop(sum);
  const base: Base = raw.base === "JPY" ? "JPY" : "USD", def = STARTS[start];
  const c = useMemo<Checked>(() => checkForm(start, name, raw, facts.names), [start, name, raw, facts.names]);
  const dirty = c.changed.length > 0 || nameEdited;

  // the draft follows the form while anything differs from the start's defaults
  useEffect(() => { writeDraft(dirty ? { start, name, nameEdited, raw, rid, at: new Date().toISOString() } : null); }, [dirty, start, name, nameEdited, raw, rid]);
  const fresh = (s: StartId) => { setStart(s); setRawAll(defaultRaw(s, "USD")); setName(defaultName(s, facts.today)); setNameEdited(false); setTouched(new Set()); setServer([]); setMsg(null); setRid(newRid()); setBack(null); setAsk(null); };
  // the address names the start: Back and Forward, or an address typed, switch it without a question
  useEffect(() => { if (addr.start && addr.start !== start) fresh(addr.start); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [addr.start]);
  const pickStart = (s: StartId) => { if (s === start) return; if (c.changed.length > 0) { setAsk(s); return; } fresh(s); go(`new/${s}`); };

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
      .then((r) => { writeDraft(null); setLastBook(r.id); flash(`Paper portfolio created · ${name.trim()}`); go(r.id); })
      .catch((e: unknown) => {
        setBusy(false);
        if (e instanceof PfError && e.status === 409) { setConsent(e.consent ?? { ...consent, agreedAt: null }); setCard(true); return; }
        if (e instanceof PfError && e.refusals) { setServer(e.refusals); setTouched((t) => new Set(t).add("*")); setMsg(e.message); reloadFacts(); return; }
        setMsg(failureWords(e, { offline: "Offline: a portfolio needs the server. Your settings are kept on this device.", signedOut: "Signed out: sign in again. Nothing was created; your settings are kept.", refused: (w) => `Not created: ${w}. Nothing was saved.` }));
      });
  };
  const toFirst = () => { const k = c.refusals[0]?.key; if (!k) return; setTouched((t) => new Set(t).add("*")); if (k === "name" || !fieldOf(start, k)) { document.querySelector<HTMLElement>(k === "nav" ? '[data-key="nav"]' : "#pf-name")?.focus(); return; }
    const sec = fieldOf(start, k)!.section; if (sec === "costs") setCostsOpen(true); if (phone) { go(`new/${start}/edit/${sec}`); return; } setTimeout(() => document.querySelector<HTMLElement>(`[data-key="${k}"]`)?.focus(), 30); };
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
    if (f.key === "funding") { const o = f.choices!.options; return <span className="pf-fund"><span className="on">(●) {o[0].label}: {o[0].line}</span><span className="pf-line">{o[1].label}: {o[1].off}</span></span>; }
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
        {f.key === "target_vol" && <VolLines x={num("target_x")} vol={num("target_vol")} cut1={num("cut1")} varLimit={num("var")} />}
        {f.key === "var" && c.tie && (c.tie.state !== "clear" || touched.has("var")) && <TieLine state={c.tie.state} line={c.tie.line} id="pf-tie-var" />}
        {f.key === "adj_gross" && <span className="pf-line">{ADJ_GROSS_CARD}</span>}
      </>
    );
  };
  const rowsOf = (sec: SectionId): Field[] => fieldsOf(start, sec, base);
  const badIn = (sec: SectionId): number => c.refusals.filter((r) => (r.key === "nav" ? sec === "kind" : fieldOf(start, r.key)?.section === sec)).length;
  const extraOf = (sec: SectionId): ReactNode => (sec === "trade" ? <TradeLists start={start} /> : sec === "limits" && start === "ar-macro" ? <Muted id="pf-levhelp">{leverageHelp(num("target_vol") ?? 5, null)}</Muted> : sec === "ladder" ? <Muted id="pf-drawdown">Drawdown: {drawdownLine(ladderBase)}</Muted> : null);
  const auxOf = (sec: SectionId): string => (sec === "targets" ? "the book aims at no index · neither target is a limit" : sec === "ladder" ? "the owner's rule · fixed after creation" : sec === "trade" ? "what the start can trade, and what it cannot trade here" : sec === "limits" ? "each changes later with a reason, from the next session" : "");
  const summary = (
    <div className="pf-sumbody" id="pf-summary">
      <div>{def.name} · {def.kind} · {base}</div>
      <div>Starting NAV {c.nav != null ? `${fmtFull(c.nav)} ${base}` : "–"}</div>
      <div>{TARGET_RETURN} {num("target_x") != null ? `cash + ${num("target_x")}% (${facts.rates[base]?.name ?? (base === "JPY" ? "TONA" : "EFFR")})` : "–"}</div>
      <div>{TARGET_VOLATILITY} {num("target_vol") != null ? `${num("target_vol")}% of capital` : "–"}</div>
      <div>{REFERENCE} <ReferenceLine start={start} base={base} blend={blend} short /></div>
      <div>Ladder {num("cut1") != null && num("cut2") != null && num("out") != null ? ladderShort({ cut1: num("cut1")!, cut2: num("cut2")!, out: num("out")!, cap1: 0, cap2: 0, cooling: 0, deadline: 0 }, ladderBase) : "–"}</div>
      {def.summary(c.values).map((l) => <div key={l}>{l}</div>)}
      <div className="chg" id="pf-changedcount" title={c.changed.map((k) => (k === "nav" ? "Starting NAV" : k === "base" ? "Base currency" : fieldOf(start, k)?.label ?? k)).join(" · ") || undefined}>{c.changed.length} setting{c.changed.length === 1 ? "" : "s"} changed from the defaults</div>
      <p className="pf-mut fixedline">{ladderBase === "start" ? FIXED_LINE.replace("re-set only from 1 Dec to a January reset, under a yearly base", "re-set: never") : FIXED_LINE}</p>
    </div>
  );
  const draftLine = back && dirty ? <p className="pf-draft" id="pf-draft">Your unsaved settings from {hmSgt(back)} are back · <button type="button" className="pf-link" onClick={() => { writeDraft(null); fresh(start); }}>START AGAIN</button></p> : null;
  const askLine = ask ? <p className="pf-ask" id="pf-ask" role="alertdialog">Change the start? Your {c.changed.length} changed setting{c.changed.length === 1 ? "" : "s"} go back to the new start's defaults. <button type="button" className="pf-btn" onClick={() => setAsk(null)}>KEEP</button> <button type="button" className="pf-btn" onClick={() => { const s = ask; fresh(s); go(`new/${s}`); }}>CHANGE</button></p> : null;
  const nameNo = touched.has("name") || touched.has("*") || server.some((r) => r.key === "name") ? (server.find((r) => r.key === "name")?.text ?? c.refusals.find((r) => r.key === "name")?.text ?? null) : null;
  const nameField = (
    <span className={`pf-num${nameNo ? " bad" : ""}${phone ? " ph" : ""}`}>
      <span className="pf-in"><input id="pf-name" className="name" type="text" autoComplete="off" value={name} aria-label="Name" aria-invalid={nameNo ? true : undefined} aria-describedby={nameNo ? "pf-name-no" : undefined} onChange={(e) => { setName(e.target.value); setNameEdited(true); setServer((x) => x.filter((r) => r.key !== "name")); }} onBlur={() => touch("name")} /></span>
      {nameNo && <span className="pf-no" id="pf-name-no" role="alert">{nameNo}</span>}
    </span>
  );

  // ---------------- a phone ----------------
  if (phone) {
    const sumOf = (sec: SectionId): string => (sec === "kind" ? `${base} · ${c.nav != null ? fmtFull(c.nav) : "–"} · absolute return`
      : sec === "targets" ? `cash + ${num("target_x") ?? "–"}% · ${num("target_vol") ?? "–"}% of capital · ${def.reference?.short ?? ""} PROXY`
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
                <div className="rg">{f.range !== "fixed" && f.range !== "–" ? `${f.range} · ` : f.range === "fixed" ? "fixed · " : ""}{f.why}</div>
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
          <div className="mp-card pfp-folds">
            {SECTIONS.map((s) => (
              <a className="pfp-fold" key={s.id} href={href(`new/${start}/edit/${s.id}`)} data-sec={s.id}>
                <span className="t">{s.title}</span><span className="s">{sumOf(s.id)}{badIn(s.id) > 0 && <b className="bad"> · {badIn(s.id)} out of range</b>}</span><span className="e">Edit &#8250;</span>
              </a>
            ))}
          </div>
          <p className="pf-mut pfp-pad">{FIXED_LINE}</p>
          <div className="pfp-foot">{createBlock}</div>
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
      <div className="c wy">{f.why}</div>
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
