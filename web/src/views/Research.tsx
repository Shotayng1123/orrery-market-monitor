import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { Md } from "../components/Md";
import { Pick } from "../components/Pick";
import { Overnight, WeeklyTables, type Pack, type WeeklyPack } from "../components/NoteTables";
import { useApi } from "../lib/useApi";
import { usePhone } from "../lib/phone";
import type { Note, Report } from "../lib/types";
import { fmtDate } from "../lib/time";
import { fmtStampSafe } from "./shared";

/** Kinds of research (Shota, 15 Nov). Daily = the morning note, Weekly = Emma's Friday strategy report.
 *  Alpha and Deep-dive are reserved: shown, not yet published. */
export const KINDS = ["Daily", "Weekly", "Alpha", "Deep-dive"] as const;
export type Kind = (typeof KINDS)[number];
export const kindOf = (k: string | undefined): Kind => { const s = (k ?? "").toLowerCase(); return s.startsWith("week") ? "Weekly" : s.startsWith("alpha") ? "Alpha" : s.startsWith("deep") ? "Deep-dive" : "Daily"; };
/** The daily note's opening summary (yesterday in brief, then today's view): shown under the title, above the tables. */
const IN_BRIEF = /^in brief/i;
/** A piece's date as every date on the Monitor (the designer's D-16; I-5): "15 Nov 2026", from a date (YYYY-MM-DD,
 *  as written) or a timestamp read in Singapore time. The list used to write "15-Nov-26". */
export const pieceDate = (t: string): string => fmtDate(t);

export interface Item { key: string; src: "note" | "report"; id: number; d: string; sort: string; kind: Kind; title: string }

/** RESEARCH: everything the desk writes, in one list (date, kind, title), and the selected piece as a document.
 *  A note opens with its tables on top and the text below; a report with title, standfirst, sections and sources.
 *  On a phone the tab opens on the list of titles and a tap opens the piece in place of the list (Shota, 16 Nov).
 *  The open piece is named in the address (#research/note:2026-11-14), so the phone's Back returns to the list,
 *  at the place it was left. Tablets and narrow desktop windows keep the list above the document. */
export function ResearchView({ tick, sub, onSub }: { tick: number; sub?: string; onSub: (s: string) => void }) {
  const reports = useApi<{ rows: Report[] }>("reports", { n: 1000 }, Math.floor(tick / 10));
  const notes = useApi<{ rows: Array<{ id: number; d: string; title: string; generatedAt: string; kind?: string }> }>("notes", { n: 1000 }, Math.floor(tick / 10));   // the whole archive
  const [find, setFind] = useState("");
  const [filter, setFilter] = useState<Kind | "All">("All");
  const [open, setOpen] = useState<string | null>(null);
  const items = useMemo<Item[]>(() => {
    // the old Sunday wrap-up notes are not listed: the weekly piece is Emma's Weekly Strategy (Shota, 15 Nov)
    const a: Item[] = (notes.data?.rows ?? []).filter((n) => (n.kind ?? "daily") !== "weekly").map((n) => ({ key: `note:${n.d}`, src: "note", id: n.id, d: n.d, sort: n.generatedAt, kind: kindOf(n.kind), title: n.title }));
    const b: Item[] = (reports.data?.rows ?? []).map((r) => ({ key: `report:${r.id}`, src: "report", id: r.id, d: r.publishedAt, sort: r.publishedAt, kind: kindOf(r.kind), title: r.title }));
    return [...a, ...b].sort((x, y) => y.sort.localeCompare(x.sort));
  }, [notes.data, reports.data]);
  const words = find.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((i) => (filter === "All" || i.kind === filter) && (!words.length || words.every((w) => `${i.title} ${pieceDate(i.d)} ${i.kind}`.toLowerCase().includes(w))));
  useEffect(() => { if ((open == null || !shown.some((i) => i.key === open)) && shown.length) setOpen(shown[0].key); }, [shown.map((i) => i.key).join("|"), open]);
  // a link from elsewhere (#research/report:1, #research/note:2026-11-14) opens that piece once the list is in
  // (the search and the kind filter are cleared only when they would hide the linked piece: a tap in the list keeps them)
  useEffect(() => { if (sub && items.some((i) => i.key === sub)) { if (!shown.some((i) => i.key === sub)) { setFilter("All"); setFind(""); } setOpen(sub); } }, [sub, items.length]);
  // phone: the list alone, or the piece named in the address alone
  const phone = usePhone();
  const reading = phone && !!sub && items.some((i) => i.key === sub);
  const openKey = phone ? (reading ? sub ?? null : null) : open;
  const listY = useRef(0), viaList = useRef(false);   // where the list was left, and whether the piece was opened from it
  const [last, setLast] = useState<string | null>(null);   // the piece read last stays marked in the list
  const openRow = (key: string) => { if (!phone) { setOpen(key); return; } listY.current = window.scrollY; viaList.current = true; setLast(key); onSub(key); };
  const back = () => { if (viaList.current) history.back(); else onSub(""); };
  useEffect(() => { if (reading && sub) setLast(sub); }, [reading, sub]);
  useLayoutEffect(() => { if (!phone) return; window.scrollTo(0, reading ? 0 : listY.current); if (!reading) viaList.current = false; }, [reading, phone]);
  // the document panel scrolls on its own, so a newly opened piece starts at its top, not where the last one was left
  const docTop = useRef<HTMLDivElement>(null);
  useEffect(() => { const body = docTop.current?.parentElement; if (body) body.scrollTop = 0; }, [openKey]);
  const sel = items.find((i) => i.key === openKey) ?? null;
  const rep = useApi<{ report: Report }>(sel?.src === "report" ? "report" : null, { id: sel?.id }, Math.floor(tick / 10));
  const note = useApi<{ note: (Note & { pack?: Pack | WeeklyPack }) | null }>(sel?.src === "note" ? "note" : null, { d: sel?.d }, Math.floor(tick / 10));
  // the payload on hand may still be the piece opened before (a refresh keeps the last one until the new one lands): never show it under another title
  const r = sel?.src === "report" && rep.data?.report?.id === sel.id ? rep.data.report : null;
  const n = sel?.src === "note" && note.data?.note?.d === sel.d ? note.data.note : null;
  const backBtn = phone ? <div className="rsback"><span className="chip-sm" onClick={back}>&#8592; All titles</span></div> : null;
  const has = (k: Kind) => items.some((i) => i.kind === k);
  const err = reports.error ?? notes.error;
  return (
    <>
      {(!phone || !reading) && <Panel no="01" title="RESEARCH" span={4} k="replist" aux={<span className="chips" style={{ margin: 0 }}><Pick<Kind | "All"> label="Kind" value={filter} options={[{ value: "All" }, ...KINDS.map((k) => ({ value: k, label: has(k) ? k : `${k} (to be added)`, disabled: !has(k) }))]} onChange={setFilter} /></span>}>
        <div className="searchrow"><input type="text" placeholder="search titles, e.g. nvidia or 14 nov" value={find} onChange={(e) => setFind(e.target.value)} /><span className="cnt">{shown.length} of {items.length}</span></div>
        <div className="reprows">{shown.length ? (
          <table className="mini repT">
            <colgroup><col className="dt" /><col className="kd" /><col /></colgroup>
            <thead><tr><th className="l">Date</th><th className="l">Kind</th><th className="l">Title</th></tr></thead>
            <tbody>{shown.map((x) => <tr key={x.key} className={`click${(phone ? last : open) === x.key ? " sel" : ""}`} onClick={() => openRow(x.key)}><td className="l num dt">{pieceDate(x.d)}</td><td className="l"><span className={`kchip k-${x.kind.toLowerCase()}`}>{x.kind}</span></td><td className="l">{x.title}</td></tr>)}</tbody>
          </table>
        ) : <Empty title={items.length ? "Nothing matches" : "Nothing published yet"}>{items.length ? "Clear the search box or pick another kind." : err ?? "Daily notes arrive around 07:00 SGT, the weekly strategy report on Fridays at 15:00 SGT."}</Empty>}</div>
      </Panel>}
      {(!phone || reading) && <Panel no="02" title={sel ? sel.kind.toUpperCase() : "REPORT"} span={8} k="report" aux={<>{r ? <>{fmtStampSafe(r.publishedAt)}{r.meta?.author ? ` · ${r.meta.author}` : ""}</> : n ? <>generated {fmtStampSafe(n.generatedAt)} · {n.model}</> : ""}{(r || n) && <span className="chip-sm pdfbtn" title="Print this piece or save it as a PDF" onClick={() => window.print()}>PDF</span>}</>}>
        <div ref={docTop} />
        {backBtn}
        {r ? (
          <div className="brnar report">
            <h2>{r.title}</h2>
            {r.summary && <p className="stand">{r.summary}</p>}
            <Md text={r.md} sources={r.meta?.sources ?? []} />
            {(r.meta?.sources ?? []).length > 0 && <div className="src"><b>Sources</b><ol>{(r.meta?.sources ?? []).map((s) => <li key={s.n} value={s.n}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ol></div>}
          </div>
        ) : n ? (
          <div className="brnar report note">
            <h2>{n.title}</h2>
            {n.sections.filter((s) => IN_BRIEF.test(s.heading)).map((s) => <div key={s.heading} className="stand"><Md text={s.md} sources={n.sources} /></div>)}
            <div className="ntabs">{n.pack ? (n.pack.kind === "weekly" ? <WeeklyTables pack={n.pack} /> : <Overnight pack={n.pack} />) : <Empty title="No data pack with this note" />}</div>
            {n.sections.filter((s) => !IN_BRIEF.test(s.heading)).map((s) => <div key={s.heading}><h3>{s.heading}</h3><Md text={s.md} sources={n.sources} /></div>)}
            {n.sources.length > 0 && <div className="src"><b>Sources</b><ol>{n.sources.map((s) => <li key={s.n} value={s.n}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ol></div>}
          </div>
        ) : <Empty title={sel ? "Loading" : "Select a piece"}>{sel ? (rep.error ?? note.error ?? "") : "The full text opens here."}</Empty>}
        {(r || n) && backBtn}
      </Panel>}
    </>
  );
}
