import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Empty } from "../components/Panel";
import { Md } from "../components/Md";
import { Pick } from "../components/Pick";
import { Overnight, WeeklyTables, type Pack, type WeeklyPack } from "../components/NoteTables";
import { Screen } from "../components/PhoneKit";
import { useApi } from "../lib/useApi";
import type { Note, Report } from "../lib/types";
import { fmtStampSafe } from "./shared";
import { kindOf, KINDS, pieceDate, type Item, type Kind } from "./Research";

/** RESEARCH for a phone (preview, lib/phone.ts; Shota, 17 Nov 2026). The tab opens on the titles, newest first; a
 *  tap opens the piece in their place, at reading size, and the phone's Back (or the button) returns to the list
 *  where it was left, with the search and the kind kept. The open piece is named in the address
 *  (#research/note:2026-11-14), as on the desktop tab, so links to a piece open it directly. */
export function ResearchPhone({ tick, sub, onSub }: { tick: number; sub?: string; onSub: (s: string) => void }) {
  const reports = useApi<{ rows: Report[] }>("reports", { n: 1000 }, Math.floor(tick / 10));
  const notes = useApi<{ rows: Array<{ id: number; d: string; title: string; generatedAt: string; kind?: string }> }>("notes", { n: 1000 }, Math.floor(tick / 10));
  const [find, setFind] = useState("");
  const [filter, setFilter] = useState<Kind | "All">("All");
  const items = useMemo<Item[]>(() => {
    const a: Item[] = (notes.data?.rows ?? []).filter((n) => (n.kind ?? "daily") !== "weekly").map((n) => ({ key: `note:${n.d}`, src: "note", id: n.id, d: n.d, sort: n.generatedAt, kind: kindOf(n.kind), title: n.title }));
    const b: Item[] = (reports.data?.rows ?? []).map((r) => ({ key: `report:${r.id}`, src: "report", id: r.id, d: r.publishedAt, sort: r.publishedAt, kind: kindOf(r.kind), title: r.title }));
    return [...a, ...b].sort((x, y) => y.sort.localeCompare(x.sort));
  }, [notes.data, reports.data]);
  const words = find.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((i) => (filter === "All" || i.kind === filter) && (!words.length || words.every((w) => `${i.title} ${pieceDate(i.d)} ${i.kind}`.toLowerCase().includes(w))));
  const has = (k: Kind) => items.some((i) => i.kind === k);
  const sel = sub ? items.find((i) => i.key === sub) ?? null : null;
  const reading = !!sel;
  const listY = useRef(0), viaList = useRef(false);   // where the list was left, and whether the piece was opened from it
  const [last, setLast] = useState<string | null>(null);
  const openRow = (key: string) => { listY.current = window.scrollY; viaList.current = true; onSub(key); };
  const back = () => { if (viaList.current) history.back(); else onSub(""); };
  useEffect(() => { if (sel) setLast(sel.key); }, [sel?.key]);
  useLayoutEffect(() => { window.scrollTo(0, reading ? 0 : listY.current); if (!reading) viaList.current = false; }, [reading]);
  const rep = useApi<{ report: Report }>(sel?.src === "report" ? "report" : null, { id: sel?.id }, Math.floor(tick / 10));
  const note = useApi<{ note: (Note & { pack?: Pack | WeeklyPack }) | null }>(sel?.src === "note" ? "note" : null, { d: sel?.d }, Math.floor(tick / 10));
  // never the piece opened before under this title (a refresh keeps the last payload until the new one lands)
  const r = sel?.src === "report" && rep.data?.report?.id === sel.id ? rep.data.report : null;
  const n = sel?.src === "note" && note.data?.note?.d === sel.d ? note.data.note : null;

  if (sel) {
    const sources = r ? r.meta?.sources ?? [] : n ? n.sources : [];
    return (
      <div className="mp">
        <header className="mp-head doc">
          <button type="button" className="mp-back" onClick={back}>&#8249; All titles</button>
          {(r || n) && <button type="button" className="mp-act" title="Print this piece or save it as a PDF" onClick={() => window.print()}>PDF</button>}
        </header>
        <article className="mp-doc">
          <div className="meta"><span className={`kchip k-${sel.kind.toLowerCase()}`}>{sel.kind}</span><span>{pieceDate(sel.d)}</span>{r?.meta?.author && <span>{r.meta.author}</span>}{n && <span>written {fmtStampSafe(n.generatedAt)}</span>}</div>
          <h1>{sel.title}</h1>
          {r ? (
            <div className="brnar report">
              {r.summary && <p className="stand">{r.summary}</p>}
              <Md text={r.md} sources={sources} />
            </div>
          ) : n ? (
            <div className="brnar report note">
              <div className="ntabs">{n.pack ? (n.pack.kind === "weekly" ? <WeeklyTables pack={n.pack} /> : <Overnight pack={n.pack} />) : <Empty title="No data pack with this note" />}</div>
              {n.sections.map((s) => <div key={s.heading}><h3>{s.heading}</h3><Md text={s.md} sources={sources} /></div>)}
            </div>
          ) : <Empty title="Loading">{rep.error ?? note.error ?? ""}</Empty>}
          {sources.length > 0 && <div className="src"><b>Sources</b><ol>{sources.map((s) => <li key={s.n} value={s.n}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ol></div>}
          {(r || n) && <button type="button" className="mp-more" onClick={back}>&#8249; All titles</button>}
        </article>
      </div>
    );
  }
  return (
    <Screen title="Research" sub={`${shown.length} of ${items.length} pieces`} right={<Pick<Kind | "All"> label="Kind" value={filter} options={[{ value: "All" }, ...KINDS.map((k) => ({ value: k, label: has(k) ? k : `${k} (to be added)`, disabled: !has(k) }))]} onChange={setFilter} />}>
      <input className="mp-find" type="text" placeholder="Search titles, e.g. nvidia or 14 nov" value={find} onChange={(e) => setFind(e.target.value)} />
      {shown.length ? (
        <div className="mp-card">
          {shown.map((x) => (
            <button type="button" key={x.key} className={`rs-row${last === x.key ? " read" : ""}`} onClick={() => openRow(x.key)}>
              <span className="meta"><span className={`kchip k-${x.kind.toLowerCase()}`}>{x.kind}</span><span>{pieceDate(x.d)}</span></span>
              <span className="t">{x.title}</span>
            </button>
          ))}
        </div>
      ) : <div className="mp-card"><Empty title={items.length ? "Nothing matches" : "Nothing published yet"}>{items.length ? "Clear the search box or pick another kind." : reports.error ?? notes.error ?? "Daily notes arrive around 07:00 SGT, the weekly strategy report on Fridays at 15:00 SGT."}</Empty></div>}
    </Screen>
  );
}
