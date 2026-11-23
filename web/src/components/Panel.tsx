import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { csvFile } from "../lib/csvname";

/** The largest table of a panel as CSV text (what is on screen: headers, section rows, figures). A control inside a
 *  cell (`.nocsv`, the statements' "‹ earlier years") is not part of the data.
 *  A cell may hold several things that are one column on screen and several in a file: MARKETS' name cell holds the
 *  name, its marks (PROXY, LIVE …) and the day of a figure that is not today's, and its text run together read
 *  "S&P 50023 Nov" (the checks of round 3b, 21 Nov 2026). Such a cell marks the extra parts `.nocsv` and names them in
 *  `data-csv`, a JSON list of texts: each becomes a column of its own right after the cell's, in the head as in the
 *  rows. */
export function tableCsv(table: HTMLTableElement): string {
  const text = (c: Element) => { const x = c.cloneNode(true) as Element; x.querySelectorAll(".nocsv").forEach((n) => n.remove()); return x.textContent ?? ""; };
  const quote = (raw: string) => { const t = raw.replace(/\s+/g, " ").trim().replace(/−/g, "-"); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const more = (c: Element): string[] => { try { const v: unknown = JSON.parse(c.getAttribute("data-csv") ?? "[]"); return Array.isArray(v) ? v.map((x) => quote(String(x ?? ""))) : []; } catch { return []; } };
  const lines: string[] = [];
  for (const tr of table.querySelectorAll("tr")) {
    const cells: string[] = [];
    for (const c of tr.querySelectorAll("th,td")) { cells.push(quote(text(c)), ...more(c)); for (let i = 1; i < ((c as HTMLTableCellElement).colSpan || 1); i++) cells.push(""); }
    if (cells.some((x) => x !== "")) lines.push(cells.join(","));
  }
  return lines.join("\r\n");
}

/** A source line that is drawn whole or in its short form, never cut (the designer's B.0.3, round 3b, 22 Nov 2026;
 *  LV-1, UI-2). The one-screen layout gives a panel head's source line one line beside the title, and a line longer
 *  than that room was cut with an ellipsis (EQUITIES' SHORT INTEREST lost its "personal use" whole). Where a panel
 *  gives `auxShort`, the head measures what this browser draws, a range over the line against the line's own content
 *  box, with no allowance the wrong way: the whole line beside the title; else the short form beside it; else, where
 *  the panel gives `auxCompact` (the same parts with their dates and times as a cell writes them, "24 Nov", a time of
 *  today alone, "10:12 SGT"), that form beside it; else, where the panel gives `auxMin` (the state's badge, INTRADAY,
 *  STAND-IN, and the time of the panel's figures, nothing else: R2 of the check of fix part 4), that form beside it;
 *  else the shortest form there is on a second line of the head, right-aligned, wrapping there only between its parts
 *  (`SrcParts`). A second line costs the panel or a chart beside it a line of height (DP-1 and R2 of the final review
 *  of pull request #50 and its checks), so it comes last.
 *  A line that is drawn once and leaves out its own descriptive parts instead (`auxDrop`: a stock's line, whose star
 *  and credit must not be drawn twice) marks them `data-drop` 1, 2 and 3, and the fit leaves out 1, then 1 and 2, then
 *  all three, before any second line (N1 of the check of fix part 4: a Tokyo stock's line, longer by its memberships'
 *  credit, was cut with an ellipsis at the least window of each text size). A source's name, a credit, "personal use"
 *  and a badge are never in a part that is left out.
 *  It measures again on every change of the head's width, after each drawing of the panel and once the fonts have
 *  loaded. The whole line is the head's tooltip, and a title longer than its head's whole line (a name far longer than
 *  any listed company's) is cut at its end with the whole title as its own; "personal use" keeps its click in every
 *  form. The scrolling layout wraps a long head and draws the whole line only. */
function useSourceFit(ref: RefObject<HTMLSpanElement | null>, on: boolean, drop: boolean) {
  useLayoutEffect(() => {
    const a = ref.current;
    if (!on || !a) return;
    const long = a.querySelector<HTMLElement>(":scope > .src-long"), short = a.querySelector<HTMLElement>(":scope > .src-short"), compact = a.querySelector<HTMLElement>(":scope > .src-compact"), min = a.querySelector<HTMLElement>(":scope > .src-min"), head = a.closest<HTMLElement>(".phead");
    if (!long || (!short && !drop) || !head) return;
    const title = head.querySelector<HTMLElement>(":scope > .t");
    // the whole line, as words: a control in it (a stock's watchlist star) is no part of what the line says
    const words = () => { const c = long.cloneNode(true) as HTMLElement; c.querySelectorAll(".star").forEach((x) => x.remove()); return (c.textContent ?? "").replace(/\s+/g, " ").trim(); };
    a.title = words();
    const drawn = (el: HTMLElement) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; };
    const room = () => { const cs = getComputedStyle(a), z = Number(document.body.style.getPropertyValue("--z")) || 1; return a.getBoundingClientRect().width - (parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) * z; };
    const levels = drop ? [...new Set([...long.querySelectorAll<HTMLElement>("[data-drop]")].map((e) => Number(e.dataset.drop)).filter((n) => n >= 1 && n <= 3))].sort() : [];
    // In a layout that wraps the line (the scrolling one, the classic one on a phone) a credit drawn on it (a stock's
    // memberships', WD-6) may cost the head at most one line: where it would cost more, the descriptive parts yield
    // first, as in the one-screen layout (N1's nit, the check of fix part 4: on a phone the credit took two lines)
    const credit = drop ? long.querySelector<HTMLElement>("[data-credit]") : null;
    const creditFit = () => {
      if (!credit || !levels.length) return;
      const tall = () => a.getBoundingClientRect().height, line = (parseFloat(getComputedStyle(a).lineHeight) || 0) * (Number(document.body.style.getPropertyValue("--z")) || 1);
      credit.style.display = "none"; const bare = tall(); credit.style.display = "";
      for (const n of [0, ...levels]) { a.classList.remove("d1", "d2", "d3"); if (n) a.classList.add(`d${n}`); if (tall() - bare <= line + 0.5) return; }
    };
    // In a layout that wraps the line, a line drawn once beside a title that leaves it less room than its longest part
    // takes a row of its own under the title (`wrap`, tokens.css), the head's whole width, and flows there as text
    // (N5-1 of the check of fix part 5: as a block beside a title that left it next to no room, its text ran off the
    // panel and the screen, "Yahoo Finance" and "personal use" with it). Each part is measured on one line.
    const ownRow = () => {
      if (!drop) return;
      a.style.whiteSpace = "nowrap";
      const widest = Math.max(0, ...[...long.querySelectorAll<HTMLElement>(".sp")].filter((e) => e.getClientRects().length > 0).map(drawn)), r = room();
      a.style.whiteSpace = "";
      if (widest > r + 0.5) a.classList.add("wrap");
    };
    const fit = () => {
      a.classList.remove("short", "compact", "min", "wrap", "d1", "d2", "d3");
      // a title wider than its head's whole line is cut at its end (tokens.css): its tooltip holds it whole
      const cut = () => { if (!title) return; if (title.scrollWidth > title.clientWidth + 0.5) title.title = (title.textContent ?? "").trim(); else title.removeAttribute("title"); };
      if (!document.body.classList.contains("term")) { ownRow(); creditFit(); return cut(); }
      if (drawn(long) <= room()) return cut();
      if (drop) {
        // one line, drawn once: its descriptive parts left out, the industry first, then the sector, then the exchange
        for (const n of levels) { a.classList.remove("d1", "d2", "d3"); a.classList.add(`d${n}`); if (drawn(long) <= room()) return cut(); }
        a.classList.add("wrap");
        return cut();
      }
      a.classList.add("short");
      if (drawn(short!) <= room()) return cut();
      if (compact) { a.classList.replace("short", "compact"); if (drawn(compact) <= room()) return cut(); }
      if (min) { a.classList.remove("short", "compact"); a.classList.add("min"); if (drawn(min) <= room()) return cut(); }
      a.classList.add("wrap");
      cut();
    };
    fit();
    // a change of the head's width (a window resized, COMPACT or the text size changed): fit again in the next frame,
    // never inside the observer's own call (which would change what it observes while it reports)
    let w = head.getBoundingClientRect().width, raf = 0;
    const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
    const ro = new ResizeObserver(() => { const nw = head.getBoundingClientRect().width; if (nw !== w) { w = nw; later(); } });
    ro.observe(head);
    const fonts = document.fonts;
    void fonts?.ready.then(later);
    fonts?.addEventListener?.("loadingdone", later);
    window.addEventListener("resize", later);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); fonts?.removeEventListener?.("loadingdone", later); window.removeEventListener("resize", later); };
  });
}

/** A short source line's parts: drawn " · " between them, and broken there only, never inside a part. */
export function SrcParts({ parts }: { parts: ReactNode[] }) {
  return <>{parts.map((x, i) => <span key={i}>{i > 0 && <span className="sd"> · </span>}<span className="sp">{x}</span></span>)}</>;
}

/** Numbered panel: `01 TITLE …aux` head, scrolling body. Span is the 12-column grid width in the scrolling
 *  layout; `k` names the panel kind and `ts` its column span for the one-screen layout's placement rules.
 *  A panel that holds a table offers it as a CSV download (the small CSV button in its header).
 *  `auxShort`: the source line's short form, for a head the one-screen layout cannot give the whole line (above);
 *  `auxCompact`: the same parts written shorter, for a head that cannot give the short form either; `auxMin`: the
 *  state's badge and the time of the figures alone, for a head that cannot give the compact form either; `auxDrop`:
 *  the line is drawn once and leaves out its parts marked `data-drop` instead (a stock's line). */
export function Panel({ no, title, aux, auxShort, auxCompact, auxMin, auxDrop = false, span = 12, children, id, k, ts, after, csv = true, csvName }: { no: string; title: string; aux?: ReactNode; auxShort?: ReactNode; auxCompact?: ReactNode; auxMin?: ReactNode; auxDrop?: boolean; span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12; children: ReactNode; id?: string; k?: string; ts?: number; after?: ReactNode /* a choice that stands right after the title, on its line (MOVERS IN σ's TODAY · LAST SESSION) */; csv?: boolean /* false for a panel that never holds a table: no button that would do nothing */; csvName?: () => string /* the file's name before its day, where the title is not it (a paper book's: "paper-tokyo-l-s-limits") */ }) {
  const body = useRef<HTMLDivElement>(null), auxEl = useRef<HTMLSpanElement>(null);
  const given = (x: ReactNode) => x !== undefined && x !== null && x !== "";
  const fits = given(aux) && (auxDrop || given(auxShort));
  useSourceFit(auxEl, fits, auxDrop);
  const exportCsv = () => {
    const tables = [...(body.current?.querySelectorAll("table") ?? [])] as HTMLTableElement[];
    if (!tables.length) return;
    const biggest = tables.sort((a, b) => b.rows.length - a.rows.length)[0];
    const blob = new Blob(["﻿" + tableCsv(biggest)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    // the day in Singapore, as every date on screen (until 22 Nov 2026 the UTC day: from 00:00 to 08:00 SGT the day
    // before; SF-4, DC-12)
    a.download = csvFile(csvName ? csvName() : title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <div className={`panel c${span}`} id={id} data-no={no} data-k={k} data-ts={ts}>
      <div className="phead"><span className="no">{no}</span><span className="t">{title}</span>{after}{aux !== undefined && (fits ? <span className={`aux src-fit${auxDrop ? " src-drop" : ""}`} ref={auxEl}><span className="src-long">{aux}</span>{!auxDrop && <span className="src-short">{auxShort}</span>}{!auxDrop && given(auxCompact) && <span className="src-compact">{auxCompact}</span>}{!auxDrop && given(auxMin) && <span className="src-min">{auxMin}</span>}</span> : <span className="aux">{aux}</span>)}{csv && <span className="csvbtn" title="Download this panel's table as a CSV file (opens in Excel)" onClick={exportCsv}>CSV</span>}</div>
      <div className="pbody" ref={body}>{children}</div>
    </div>
  );
}

/** Empty state with a reason, never a blank tile. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children && <><br />{children}</>}</div>;
}
