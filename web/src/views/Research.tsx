import { useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { useApi } from "../lib/useApi";
import type { Report } from "../lib/types";
import { fmtStampSafe } from "./shared";

export function ResearchView({ tick }: { tick: number }) {
  const list = useApi<{ rows: Report[] }>("reports", { n: 100 }, Math.floor(tick / 10));
  const [open, setOpen] = useState<number | null>(null);
  const rep = useApi<{ report: Report }>(open != null ? "report" : null, { id: open ?? undefined }, Math.floor(tick / 10));
  const rows = list.data?.rows ?? [];
  return (
    <>
      <Panel no="01" title="REPORTS" span={4} aux={rows.length ? `${rows.length} published` : ""}>
        {rows.length ? (
          <table className="mini">
            <thead><tr><th className="l">Date</th><th className="l">Kind</th><th className="l">Title</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id} className={`click${open === r.id ? " sel" : ""}`} onClick={() => setOpen(r.id)}><td className="l num">{fmtStampSafe(r.publishedAt).slice(0, 5)}</td><td className="l">{r.kind}</td><td className="l">{r.title}</td></tr>)}</tbody>
          </table>
        ) : <Empty title="No reports yet">{list.error ?? "The research desk publishes here through the Monitor&apos;s own report endpoint. Layout as in Orrery Analytics."}</Empty>}
      </Panel>
      <Panel no="02" title="REPORT" span={8} aux={rep.data ? fmtStampSafe(rep.data.report.publishedAt) : ""}>
        {rep.data ? <div className="brnar"><p><b>{rep.data.report.title}</b></p><p style={{ whiteSpace: "pre-wrap" }}>{rep.data.report.md}</p></div> : <Empty title="Select a report">{open != null && rep.error ? rep.error : "The full note opens here."}</Empty>}
      </Panel>
    </>
  );
}
