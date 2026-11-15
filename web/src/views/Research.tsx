import { useEffect, useMemo, useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { Md } from "../components/Md";
import { Overnight, WeeklyTables, type Pack, type WeeklyPack } from "../components/NoteTables";
import { useApi } from "../lib/useApi";
import type { Note, Report } from "../lib/types";
import { SGT } from "../lib/time";
import { fmtStampSafe } from "./shared";

/** Kinds of research (Shota, 15 Nov). Daily = the morning note, Weekly = Emma's Friday strategy report.
 *  Alpha and Deep-dive are reserved: shown, not yet published. */
const KINDS = ["Daily", "Weekly", "Alpha", "Deep-dive"] as const;
type Kind = (typeof KINDS)[number];
const kindOf = (k: string | undefined): Kind => { const s = (k ?? "").toLowerCase(); return s.startsWith("week") ? "Weekly" : s.startsWith("alpha") ? "Alpha" : s.startsWith("deep") ? "Deep-dive" : "Daily"; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 15-Nov-26, from a date (YYYY-MM-DD) or a timestamp read in Singapore time. */
const ddMmmYy = (t: string): string => { const d = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : new Date(t).toLocaleDateString("en-CA", { timeZone: SGT }); const [y, m, day] = d.split("-"); return `${day}-${MONTHS[Number(m) - 1] ?? m}-${y.slice(2)}`; };

interface Item { key: string; src: "note" | "report"; id: number; d: string; sort: string; kind: Kind; title: string }

/** RESEARCH: everything the desk writes, in one list (date, kind, title), and the selected piece as a document.
 *  A note opens with its tables on top and the text below; a report with title, standfirst, sections and sources. */
export function ResearchView({ tick }: { tick: number }) {
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
  const shown = items.filter((i) => (filter === "All" || i.kind === filter) && (!words.length || words.every((w) => `${i.title} ${ddMmmYy(i.d)} ${i.kind}`.toLowerCase().includes(w))));
  useEffect(() => { if ((open == null || !shown.some((i) => i.key === open)) && shown.length) setOpen(shown[0].key); }, [shown.map((i) => i.key).join("|"), open]);
  const sel = items.find((i) => i.key === open) ?? null;
  const rep = useApi<{ report: Report }>(sel?.src === "report" ? "report" : null, { id: sel?.id }, Math.floor(tick / 10));
  const note = useApi<{ note: (Note & { pack?: Pack | WeeklyPack }) | null }>(sel?.src === "note" ? "note" : null, { d: sel?.d }, Math.floor(tick / 10));
  const r = sel?.src === "report" ? rep.data?.report ?? null : null;
  const n = sel?.src === "note" ? note.data?.note ?? null : null;
  const has = (k: Kind) => items.some((i) => i.kind === k);
  const err = reports.error ?? notes.error;
  return (
    <>
      <Panel no="01" title="RESEARCH" span={4} k="replist" aux={<span className="chips" style={{ margin: 0 }}><span className={`chip-sm${filter === "All" ? " on" : ""}`} onClick={() => setFilter("All")}>All</span>{KINDS.map((k) => <span key={k} className={`chip-sm kind k-${k.toLowerCase()}${filter === k ? " on" : ""}${has(k) ? "" : " tbu"}`} title={has(k) ? `${k} only` : `${k}: to be added`} onClick={() => has(k) && setFilter(k)}>{k}</span>)}</span>}>
        <div className="searchrow"><input type="text" placeholder="search titles, e.g. nvidia or nov-26" value={find} onChange={(e) => setFind(e.target.value)} /><span className="cnt">{shown.length} of {items.length}</span></div>
        {shown.length ? (
          <table className="mini repT">
            <colgroup><col className="dt" /><col className="kd" /><col /></colgroup>
            <thead><tr><th className="l">Date</th><th className="l">Kind</th><th className="l">Title</th></tr></thead>
            <tbody>{shown.map((x) => <tr key={x.key} className={`click${open === x.key ? " sel" : ""}`} onClick={() => setOpen(x.key)}><td className="l num dt">{ddMmmYy(x.d)}</td><td className="l"><span className={`kchip k-${x.kind.toLowerCase()}`}>{x.kind}</span></td><td className="l">{x.title}</td></tr>)}</tbody>
          </table>
        ) : <Empty title={items.length ? "Nothing matches" : "Nothing published yet"}>{items.length ? "Clear the search box or pick another kind." : err ?? "Daily notes arrive around 07:00 SGT, the weekly strategy report on Fridays at 15:00 SGT."}</Empty>}
      </Panel>
      <Panel no="02" title={sel ? sel.kind.toUpperCase() : "REPORT"} span={8} k="report" aux={<>{r ? <>{fmtStampSafe(r.publishedAt)}{r.meta?.author ? ` · ${r.meta.author}` : ""}</> : n ? <>generated {fmtStampSafe(n.generatedAt)} · {n.model}</> : ""}{(r || n) && <span className="chip-sm pdfbtn" title="Print this piece or save it as a PDF" onClick={() => window.print()}>PDF</span>}</>}>
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
            <div className="ntabs">{n.pack ? (n.pack.kind === "weekly" ? <WeeklyTables pack={n.pack} /> : <Overnight pack={n.pack} />) : <Empty title="No data pack with this note" />}</div>
            {n.sections.map((s) => <div key={s.heading}><h3>{s.heading}</h3><Md text={s.md} sources={n.sources} /></div>)}
            {n.sources.length > 0 && <div className="src"><b>Sources</b><ol>{n.sources.map((s) => <li key={s.n} value={s.n}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ol></div>}
          </div>
        ) : <Empty title={sel ? "Loading" : "Select a piece"}>{sel ? (rep.error ?? note.error ?? "") : "The full text opens here."}</Empty>}
      </Panel>
    </>
  );
}
