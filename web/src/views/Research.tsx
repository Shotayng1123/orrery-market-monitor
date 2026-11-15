import { useEffect, useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { Md } from "../components/Md";
import { useApi } from "../lib/useApi";
import type { Report } from "../lib/types";
import { fmtStampSafe } from "./shared";

/** RESEARCH: the list of published reports and the selected one, laid out as a document (title, standfirst,
 *  sections, numbered sources). The newest report opens by default. */
export function ResearchView({ tick }: { tick: number }) {
  const list = useApi<{ rows: Report[] }>("reports", { n: 100 }, Math.floor(tick / 10));
  const [open, setOpen] = useState<number | null>(null);
  const rows = list.data?.rows ?? [];
  useEffect(() => { if (open == null && rows.length) setOpen(rows[0].id); }, [rows.length, open]);
  const rep = useApi<{ report: Report }>(open != null ? "report" : null, { id: open ?? undefined }, Math.floor(tick / 10));
  const r = rep.data?.report ?? null;
  const sources = r?.meta?.sources ?? [];
  return (
    <>
      <Panel no="01" title="REPORTS" span={4} k="replist" aux={rows.length ? `${rows.length} published` : ""}>
        {rows.length ? (
          <table className="mini repT">
            <thead><tr><th className="l">Date</th><th className="l">Kind</th><th className="l">Title</th></tr></thead>
            <tbody>{rows.map((x) => <tr key={x.id} className={`click${open === x.id ? " sel" : ""}`} onClick={() => setOpen(x.id)}><td className="l num">{fmtStampSafe(x.publishedAt).slice(0, 5)}</td><td className="l">{x.kind}</td><td className="l">{x.title}</td></tr>)}</tbody>
          </table>
        ) : <Empty title="No reports yet">{list.error ?? "The research desk publishes here."}</Empty>}
      </Panel>
      <Panel no="02" title="REPORT" span={8} k="report" aux={r ? <>{r.kind} · {fmtStampSafe(r.publishedAt)}{r.meta?.author ? ` · ${r.meta.author}` : ""}</> : ""}>
        {r ? (
          <div className="brnar report">
            <h2>{r.title}</h2>
            {r.summary && <p className="stand">{r.summary}</p>}
            <Md text={r.md} sources={sources} />
            {sources.length > 0 && <div className="src"><b>Sources</b><ol>{sources.map((s) => <li key={s.n} value={s.n}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ol></div>}
          </div>
        ) : <Empty title="Select a report">{open != null && rep.error ? rep.error : "The full note opens here."}</Empty>}
      </Panel>
    </>
  );
}
