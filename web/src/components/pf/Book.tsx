// A paper portfolio's own pages (P-1): the strip with its switcher and its two views, and Overview.
// Overview shows what the book is: its starting NAV, its targets, its ladder's rule, its Reference, what it can
// trade, its limits as set, its notes and what happened to it. Nothing on it stands for something that does not exist
// yet: no NAV but the starting one, no P&L, no chart, no "now" or "used" beside a limit. One muted line under the
// panels says what is not built.
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Panel } from "../Panel";
import { Section } from "../PhoneKit";
import { Sheet } from "../Sheet";
import { ByTag, href, justCreated, Muted, PaperMark, setLastBook, lastBook } from "./shared";
import { TradeLists } from "./Blocks";
import { Activity, Notes } from "./Notes";
import { Settings } from "./Settings";
import { Ticket } from "./Ticket";
import { serverWords, switchedOff, useRead, type BookAnswer, type ListAnswer } from "../../lib/pf";
import { showValue } from "../../lib/pf/form.ts";
import { fmtFull, fmtMoney2, fromMinor } from "../../lib/pf/money.ts";
import { NOT_BUILT_YET, referenceLabel, STARTS } from "../../lib/pf/presets.ts";
import { equivalentLine, equivalentShort, ladderCaps, ladderShort, sharpeLine, BASE_NAME, SHARPE_TIP } from "../../lib/pf/targets.ts";
import { bookDayFrom, createdDay, DAY_ENDS, dm, stampSgt, valuationDay, wdmy } from "../../lib/pf/calendar.ts";
import { bookWord } from "../../lib/csvname";
import { activityOf, createdWords, settingsNow, shortValue, targetsNow, type NowRow } from "../../lib/pf/view.ts";
import { NO_SUCH, NOT_YET } from "../../lib/pf/words.ts";
import type { BookRow } from "../../lib/pf/types.ts";
import { ONLY_YOU, REFERENCE, TARGET_RETURN, TARGET_VOLATILITY } from "../../lib/labels";
import { fmtStamp } from "../../lib/time";

const PROXY_TIP = "A stand-in series: the index's own data is by subscription";

/** The book's name as the way to another: the account's books, then a new one and the list. */
function Switcher({ book, rows, phone }: { book: BookRow; rows: BookRow[]; phone: boolean }) {
  const [open, setOpen] = useState(false), box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open || phone) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", key); };
  }, [open, phone]);
  // on a phone the list is a sheet, which holds an entry of the browser's history while it is open: the address picked
  // takes that entry's place, so Back from the new page returns to this one and not to a closed sheet
  const pick = (sub: string) => (e: ReactMouseEvent) => { setOpen(false); if (phone) { e.preventDefault(); location.replace(href(sub)); } };
  const items = (
    <>
      {rows.map((r) => <a key={r.id} className={`it${r.id === book.id ? " on" : ""}`} href={href(r.id)} aria-current={r.id === book.id ? "page" : undefined} onClick={pick(r.id)}><span className="n">{r.name}</span><span className="s">{STARTS[r.start].short}</span></a>)}
      <a className="it new" href={href("new")} onClick={pick("new")}>+ New paper portfolio</a>
      <a className="it" href={href("all")} onClick={pick("all")}>All portfolios &#8250;</a>
    </>
  );
  if (phone) return (
    <>
      <button type="button" className="pfp-name" id="pf-switch" aria-haspopup="dialog" onClick={() => setOpen(true)}><span className="n">{book.name}</span><span className="dn" aria-hidden="true"> &#9662;</span></button>
      {open && <Sheet title="Paper portfolios" onClose={() => setOpen(false)} id="pf-switch-sheet"><nav className="pfp-switch" aria-label="Paper portfolios">{items}</nav></Sheet>}
    </>
  );
  return (
    <span className="pf-switch" ref={box}>
      <button type="button" id="pf-switch" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}><span className="n">{book.name}</span><span aria-hidden="true"> &#9662;</span></button>
      {open && <nav className="pf-menu" id="pf-menu" aria-label="Paper portfolios">{items}</nav>}
    </span>
  );
}

/** A limit's value with what is pending under it. */
const limitValue = (r: NowRow): ReactNode => <>{showValue(r.field, r.value)}{r.pending && <span className="pf-pending" data-pending={r.key}>{shortValue(r.field, r.pending.value)} from {bookDayFrom(r.pending.from)} · pending</span>}</>;
/** Whose a value is, in full: a default's adviser, or "you · set by the account, 12 Nov 2026 10:02 SGT". */
export const byCard = (r: NowRow): string => (r.own ? `you · ${r.basis}, ${stampSgt(r.at)}` : r.field.who.card);   // the account's own value, also one set back to a default (EN-4)

function Overview({ a, phone, onChanged, csvBook }: { a: BookAnswer; phone: boolean; onChanged: () => void; csvBook: string }) {
  const b = a.book, t = targetsNow(b, a.valuationDay), nav = fromMinor(b.base, b.startingNav);
  const now = useMemo(() => settingsNow(b, a.valuationDay), [b, a.valuationDay]);
  // every limit as set, the changed ones first, then those with a change pending, then the rest in the form's order
  const limits = useMemo(() => { const all = now.filter((r) => r.field.after === "limit"); return [...all.filter((r) => r.changed), ...all.filter((r) => !r.changed && r.pending), ...all.filter((r) => !r.changed && !r.pending)]; }, [now]);
  const changed = limits.filter((r) => r.changed).length;
  const eq = equivalentShort(t.x, a.rates[b.base], b.base), ref = referenceLabel(b.start, b.base, b.blend);
  const activity = useMemo(() => activityOf(b), [b]);
  const [allLimits, setAllLimits] = useState(false);
  // a book created a moment ago (B.2 lead 6): its "created" line lit for six seconds, said in a status the eye does not
  // see (the status is drawn empty first, so that a screen reader hears the words arrive)
  const [lit, setLit] = useState<boolean>(() => !!justCreated(b.id)), [said, setSaid] = useState("");
  useEffect(() => {
    const j = justCreated(b.id);
    if (!j) return;
    setLit(true);
    const f = requestAnimationFrame(() => setSaid(`Paper portfolio created · ${j.name}`)), t = setTimeout(() => { setLit(false); setSaid(""); }, j.left);
    return () => { cancelAnimationFrame(f); clearTimeout(t); };
  }, [b.id]);
  const created = `created ${stampSgt(b.createdAt)}`, createdLine = (cls: string) => <span className={`${cls} pf-created${lit ? " lit" : ""}`.trim()} id="pf-created">{created}</span>;
  const status = <span className="pf-vh" role="status" id="pf-made">{said}</span>;
  const notes = <Notes id={b.id} notes={b.notes} consent={a.consent} phone={phone} onChanged={onChanged} />;
  // what the book can trade, with its own limits in the lines that name one (DC-10: "up to 20%" whatever the limit)
  const values = useMemo(() => Object.fromEntries(now.map((r) => [r.key, r.value])) as Record<string, number | string>, [now]);

  if (phone) return (
    <div className="pfp-overview" id="pf-overview">
      <Section title="Book" aux="no NAV yet" pad>
        <div className="pfp-lines" id="pf-book">
          <div><b>{fmtFull(nav)} {b.base}</b> · all cash</div>
          <div>capital {fmtMoney2(nav)} · full capital</div>
          <div className="m">{createdLine("")}</div>
          <div className="m">no NAV yet: the daily NAV is not built</div>
        </div>
        {status}
      </Section>
      <Section title="Targets" pad>
        <div className="pfp-kv" id="pf-targets-now">
          <span className="k">{TARGET_RETURN}</span><span className="v">cash + {t.x.toFixed(1)}% a year<span className="s">{eq ? `${eq.fig} · ${dm(a.rates[b.base]!.d)}` : equivalentLine(t.x, null, b.base)}</span></span>
          <span className="k">{TARGET_VOLATILITY}</span><span className="v">{t.vol.toFixed(1)}% of capital a year<span className="s">{sharpeLine(t.x, t.vol)}</span></span>
        </div>
      </Section>
      <Section title="Ladder" aux="Full capital" pad>
        <div className="pfp-lines"><div>{ladderCaps(b.ladder)}</div><div className="m">{BASE_NAME[b.ladderBase].charAt(0).toLowerCase()}{BASE_NAME[b.ladderBase].slice(1)}</div></div>
      </Section>
      {ref && <Section title={REFERENCE} aux={<span className="badge proxy">PROXY</span>} pad><div className="pfp-lines"><div>{ref.short} · {ref.state}</div><div className="m">{ref.label}</div><div className="m">{ref.proxy}</div></div></Section>}
      <Section title="What it can trade" pad><TradeLists start={b.start} values={values} /></Section>
      <Section title="Limits as set" aux={<>{limits.length} · {changed} changed · <small className="dayend">{DAY_ENDS}</small></>}>
        <div id="pf-limits">
          {(allLimits ? limits : limits.slice(0, 5)).map((r) => <div className="pfp-set" key={r.key} data-row={r.key}><span className="nm"><span className="n">{r.field.label}</span><span className="s">{r.by} · since {wdmy(r.since)}</span></span><span className="v">{limitValue(r)}</span></div>)}
        </div>
        {!allLimits && limits.length > 5 && <button type="button" className="pfp-rowlink" id="pf-limits-all" onClick={() => setAllLimits(true)}>All {limits.length} limits</button>}
        <a className="pfp-rowlink" id="pf-to-settings" href={href(`${b.id}/settings/limits`)}>All settings &#8250;</a>
      </Section>
      <Section title="Notes" aux={`on this portfolio · ${ONLY_YOU} · times in SGT`} pad>{notes}</Section>
      <Section title="Activity" aux="times in SGT" pad><Activity rows={activity} phone /></Section>
      <p className="mp-note pf-notbuilt" id="pf-notbuilt">{NOT_BUILT_YET}</p>
    </div>
  );

  const cell = (k: string, label: string, v: ReactNode, s: ReactNode) => <div className="cell" key={k} data-cell={k}><span className="k">{label}</span><span className="v">{v}</span><span className="s">{s}</span></div>;
  return (
    <div className="pf-overview" id="pf-overview">
      <Panel no="01" title="BOOK" k="pfo-book" csv={false} aux={<span id="pf-book-aux">{createdLine("")} · no NAV yet: the daily NAV is not built</span>}>
        {status}
        <div className="pf-cells" id="pf-book">
          {cell("nav", "Starting NAV", fmtFull(nav), `${b.base} · all cash`)}
          {cell("capital", "Capital", fmtMoney2(nav), "full capital")}
          {cell("target_x", TARGET_RETURN, `cash + ${t.x.toFixed(1)}% a year`, eq ? <>{eq.fig}<br />{eq.when}</> : "the cash rate is not read yet")}
          {cell("target_vol", TARGET_VOLATILITY, `${t.vol.toFixed(1)}% of capital a year`, <span title={SHARPE_TIP}>{sharpeLine(t.x, t.vol)}</span>)}
          {cell("ladder", "Ladder", "Full capital", ladderShort(b.ladder, b.ladderBase))}
          {cell("reference", REFERENCE, ref?.short ?? "–", ref ? <><span className="badge proxy" title={PROXY_TIP}>PROXY</span> · {ref.state}</> : "")}
        </div>
      </Panel>
      <div className="pf-cols">
        <div className="pf-col">
          <Panel no="02" title="WHAT THIS BOOK CAN TRADE" k="pfo-trade" csv={false}><TradeLists start={b.start} values={values} /></Panel>
          <Panel no="03" title="LIMITS AS SET" k="pfo-limits" csvName={() => `paper-${csvBook}-limits-as-set`} after={<span className="pf-after">· {limits.length} · {changed} changed from the defaults · {DAY_ENDS}</span>} aux={<a className="pf-link" id="pf-to-settings" href={href(`${b.id}/settings/limits`)}>SETTINGS &#8250;</a>}>
            <table className="secT pf-limits" id="pf-limits"><thead><tr><th className="l">Limit</th><th className="l">Value</th><th className="l">By</th><th className="l">Since</th></tr></thead>
              <tbody>{limits.map((r) => <tr key={r.key} data-row={r.key}><td className="l wrap">{r.field.label}</td><td className="l wrap vl">{limitValue(r)}</td><td className="l"><ByTag tag={r.by} card={byCard(r)} /></td><td className="l mut nb">{wdmy(r.since)}</td></tr>)}</tbody></table>
          </Panel>
        </div>
        <div className="pf-col">
          <Panel no="04" title="NOTES" k="pfo-notes" csv={false} after={<span className="pf-after">· on this portfolio · {ONLY_YOU} · times in SGT</span>}>{notes}</Panel>
          <Panel no="05" title="ACTIVITY" k="pfo-activity" csv={false} aux="times in SGT"><Activity rows={activity} phone={false} /></Panel>
        </div>
      </div>
      <p className="finnote mut pf-notbuilt" id="pf-notbuilt">{NOT_BUILT_YET}</p>
    </div>
  );
}

/** What stands in a book's place when its address is not one of the account's (or the book is deleted). */
export const NoSuch = ({ phone }: { phone: boolean }) => (
  <div className={phone ? "mp pfp" : "pf"}><p className="pf-err" id="pf-nosuch">{NO_SUCH} <a className="pf-link" href={href("all")}>ALL PORTFOLIOS &#8250;</a></p></div>
);

/** `#portfolio/<id>` (Overview) and `#portfolio/<id>/settings[/<section>]`. Any other view of a book is not built: it
 *  opens Overview. */
export function Book({ id, view, section, phone, tick, ticket = null }: { id: string; view: "overview" | "settings"; section: string; phone: boolean; tick: number; ticket?: { s: string; side: string } | null }) {
  // what is on screen is the account's own: asked again every few minutes, after every change, and as soon as the
  // valuation day turns at 17:00 New York, so that "in force now" and "from the next session" are the server's (RT-9)
  const slow = `${Math.floor(tick / 5)}|${valuationDay(new Date())}`;
  const book = useRead<BookAnswer>("pf_get", { id }, slow), list = useRead<ListAnswer>("pf_list", {}, slow);
  // a 404 is "no such portfolio in your account" unless it carries the server's own sentence for its switch off: then
  // that sentence stands with RETRY, and the book last opened is kept (DC-3 of the second review of P-1)
  const notYet = !book.data && switchedOff(book.error);
  const missing = !book.data && book.error?.status === 404 && !notYet;
  useEffect(() => { if (book.data) setLastBook(id); else if (missing && lastBook() === id) setLastBook(null); }, [book.data, missing, id]);
  const changed = () => { book.reload(); list.reload(); };
  if (missing) return <NoSuch phone={phone} />;
  if (notYet) return <div className={phone ? "mp pfp" : "pf"}><p className="pf-err" id="pf-notyet">{NOT_YET} <button type="button" className="pf-link" onClick={book.reload}>RETRY</button></p></div>;
  if (!book.data) {
    const body = book.error
      ? <p className="pf-err" id="pf-read-error">Your paper portfolios could not be read: {serverWords(book.error)}. Nothing in them has changed. <button type="button" className="pf-link" onClick={book.reload}>RETRY</button></p>
      : <Muted>loading…</Muted>;
    return <div className={phone ? "mp pfp" : "pf"}>{body}</div>;
  }
  const a = book.data, b = a.book, def = STARTS[b.start], rows = list.data?.rows ?? [b];
  const others = rows.filter((r) => r.id !== b.id).map((r) => r.name), csvBook = bookWord(b, rows.some((r) => r.id === b.id) ? rows : [...rows, b]);
  const kept = book.keptAt != null ? <p className="pf-mut pf-kept" id="pf-kept">Offline: what this device last read, as of {fmtStamp(new Date(book.keptAt))}. A change needs the server.</p> : null;
  const page = view === "settings" ? <Settings a={a} section={section} others={others} phone={phone} onChanged={changed} csvBook={csvBook} /> : <Overview a={a} phone={phone} onChanged={changed} csvBook={csvBook} />;
  // the order ticket (P-2.1): BUY / SELL opens it, on an open book; on a phone in the place of Overview, on a computer
  // beside it at the right (`#portfolio/<id>/ticket`, with `?s=7203.T&side=buy` to fill it in)
  const open = b.status === "open", tk = open && ticket ? <Ticket key={`${b.id}|${ticket.s}|${ticket.side}`} book={b} phone={phone} init={ticket} /> : null;
  if (phone) return (
    <div className="mp pfp pfp-book" data-book={b.id} data-view={view}>
      <header className="mp-head doc"><a className="mp-back" href={href("all")}>&#8249; Portfolios</a></header>
      <div className="pfp-bookhead" id="pf-strip">
        <div className="nm"><Switcher book={b} rows={rows} phone /><PaperMark phone /></div>
        <div className="meta">{def.short} · {def.kind} · {b.base} · {ONLY_YOU} · created {dm(createdDay(b.createdAt))}</div>
        {open && !tk && <a className="pfp-buysell" id="pf-buysell" href={href(`${b.id}/ticket`)}>Buy / Sell</a>}
      </div>
      <nav className="pfp-views" aria-label="This portfolio's pages">
        <a className={view === "overview" && !tk ? "on" : undefined} aria-current={view === "overview" && !tk ? "page" : undefined} href={href(b.id)}>Overview</a>
        <a className={view === "settings" ? "on" : undefined} aria-current={view === "settings" ? "page" : undefined} href={href(`${b.id}/settings`)}>Settings</a>
      </nav>
      {kept}
      {tk ?? page}
    </div>
  );
  return (
    <div className="pf pf-bookpage" data-book={b.id} data-view={view}>
      <div className="pf-strip" id="pf-strip">
        <Switcher book={b} rows={rows} phone={false} />
        <span className="meta">{def.short} · {def.kind} · {b.base} · <PaperMark /> · {createdWords(createdDay(b.createdAt))}</span>
        <nav className="views" aria-label="This portfolio's pages">
          <a className={`chip-sm${view === "overview" ? " on" : ""}`} aria-current={view === "overview" ? "page" : undefined} href={href(b.id)}>OVERVIEW</a>
          <a className={`chip-sm${view === "settings" ? " on" : ""}`} aria-current={view === "settings" ? "page" : undefined} href={href(`${b.id}/settings`)}>SETTINGS</a>
        </nav>
        {open && <a className="pf-go" id="pf-buysell" href={href(`${b.id}/ticket`)} aria-current={tk ? "page" : undefined}>BUY / SELL</a>}
      </div>
      {kept}
      {tk ? <div className="pf-withticket"><div className="pf-main">{page}</div>{tk}</div> : page}
    </div>
  );
}
