import { useRef, type ReactNode } from "react";

/** The largest table of a panel as CSV text (what is on screen: headers, section rows, figures). A control inside a
 *  cell (`.nocsv`, the statements' "‹ earlier years") is not part of the data. */
function tableCsv(table: HTMLTableElement): string {
  const text = (c: Element) => { const x = c.cloneNode(true) as Element; x.querySelectorAll(".nocsv").forEach((n) => n.remove()); return x.textContent ?? ""; };
  const cell = (c: Element) => { const t = text(c).replace(/\s+/g, " ").trim().replace(/−/g, "-"); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const lines: string[] = [];
  for (const tr of table.querySelectorAll("tr")) {
    const cells: string[] = [];
    for (const c of tr.querySelectorAll("th,td")) { cells.push(cell(c)); for (let i = 1; i < ((c as HTMLTableCellElement).colSpan || 1); i++) cells.push(""); }
    if (cells.some((x) => x !== "")) lines.push(cells.join(","));
  }
  return lines.join("\r\n");
}

/** Numbered panel: `01 TITLE …aux` head, scrolling body. Span is the 12-column grid width in the scrolling
 *  layout; `k` names the panel kind and `ts` its column span for the one-screen layout's placement rules.
 *  A panel that holds a table offers it as a CSV download (the small CSV button in its header). */
export function Panel({ no, title, aux, span = 12, children, id, k, ts }: { no: string; title: string; aux?: ReactNode; span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12; children: ReactNode; id?: string; k?: string; ts?: number }) {
  const body = useRef<HTMLDivElement>(null);
  const exportCsv = () => {
    const tables = [...(body.current?.querySelectorAll("table") ?? [])] as HTMLTableElement[];
    if (!tables.length) return;
    const biggest = tables.sort((a, b) => b.rows.length - a.rows.length)[0];
    const blob = new Blob(["﻿" + tableCsv(biggest)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `orrery-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <div className={`panel c${span}`} id={id} data-no={no} data-k={k} data-ts={ts}>
      <div className="phead"><span className="no">{no}</span><span className="t">{title}</span>{aux !== undefined && <span className="aux">{aux}</span>}<span className="csvbtn" title="Download this panel's table as a CSV file (opens in Excel)" onClick={exportCsv}>CSV</span></div>
      <div className="pbody" ref={body}>{children}</div>
    </div>
  );
}

/** Empty state with a reason, never a blank tile. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children && <><br />{children}</>}</div>;
}
