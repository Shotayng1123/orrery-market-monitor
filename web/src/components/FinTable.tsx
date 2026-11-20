import { useLayoutEffect, useRef, useState } from "react";
import { fmtPs, fmtRatio, fmtUnit, noDocWhy, periodDoc, periodName, type FinPeriod, type FinRow, type FinSection, type FinUnit } from "../lib/stock";
import { fmtDate } from "../lib/time";
import { finBack, finFit, finRest } from "../lib/finscroll";
import { zoomNow } from "../lib/prefs";

/** The statements of a company as one table (Shota, 18 Nov 2026): every section under the same period columns, so
 *  a year reads straight down from revenue to cash flow. The unit is written once, in the table's header (for
 *  example "bn JPY"), and is the same for every statement; no figure carries a unit of its own. Per-share lines
 *  are in the currency itself (said in the header too) and the ratios' section says per cent in its title. The
 *  line names stay put while the periods scroll, and the table opens at the latest periods. A guidance column is
 *  tinted and marked E.
 *
 *  When the periods are wider than the box (a phone; ten years and twelve quarters on a computer later), a period
 *  that stops part-way under the line names leaves a fragment of a number beside them: ".7" read as 0.7 (the
 *  designer's D-03, 19 Nov 2026). So the periods land on whole columns: the box snaps each one to the names' right
 *  edge (tokens.css, `.finbox`), and it opens with the latest periods whole and the first of them against the
 *  names. "‹ earlier years" in the names' header moves one screen back, and is hidden at the start.
 *  The right edge too (the designer's verdict, 20 Nov 2026: after a press or a swipe, "2,9" of 2,971.0 showed
 *  there): every period takes the same whole-pixel width, the room beside the names divided by as many periods as
 *  fit in it, and the names take the pixels left over (lib/finscroll.ts, `finFit`). Wherever the box comes to rest,
 *  it then shows that many whole periods and nothing of the next. The widths are measured again when the box or
 *  the table changes size (a phone turned; the web font arriving after the first drawing).
 *  A period's header opens the document behind it where the source gave its address (A-01, 20 Nov 2026; lib/stock.ts
 *  periodDoc): teal, the whole header cell taking the click or the tap; a header without one is plain text and its
 *  tip says there is no address from the source. */
const cell = (r: FinRow, v: number | null, unit: FinUnit): string => (r.fmt === "money" ? fmtUnit(v, unit) : r.fmt === "ps" ? fmtPs(v) : fmtRatio(v, r.fmt === "growth"));
// a missing figure is greyed; growth is green or red; a negative amount is red, except on the two cash-flow lines
// where an outflow is the ordinary case
const tone = (r: FinRow, v: number | null): string => (v == null ? " na" : r.fmt === "growth" ? (v > 0 ? " up" : v < 0 ? " dn" : "") : v < 0 && r.id !== "icf" && r.id !== "fincf" ? " neg" : "");

/** The box and its table as laid out now, exactly (fractions kept), in the screen's px, which is what must come out
 *  whole: the box's inner width, the names' width, the widest period, where each period starts in the table, the
 *  table's width; `first`: the period whose edge is against the names, if any. `z` is the page's zoom (the text
 *  size, lib/prefs.ts; 1 on a phone): lengths and scroll offsets are set in the page's CSS px, the screen's ÷ z. */
function geom(el: HTMLElement) {
  const t = el.querySelector("table"), names = t?.querySelector<HTMLElement>("thead th.l");
  if (!t || !names) return null;
  const z = zoomNow(), heads = [...t.querySelectorAll<HTMLElement>("thead th:not(.l)")], cs = getComputedStyle(el), tr = t.getBoundingClientRect(), nr = names.getBoundingClientRect();
  const hr = heads.map((h) => h.getBoundingClientRect());
  return { z, heads, boxW: el.getBoundingClientRect().width - (parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)) * z, stick: nr.width, tableW: tr.width,
    widest: Math.max(0, ...hr.map((r) => r.width)), starts: hr.map((r) => r.left - tr.left), first: hr.findIndex((r) => r.left >= nr.right - 1) };
}
/** A length in the screen's px as the page's CSS px. Under a zoom the browser multiplies it back and drops what is
 *  under 1/64 px, so 1/256 px more keeps a whole screen pixel whole. */
const cssPx = (v: number, z: number): string => `${z === 1 || v === 0 ? v : (v + 1 / 256) / z}px`;

export function FinTable({ periods, sections, unit, currency }: { periods: FinPeriod[]; sections: FinSection[]; unit: FinUnit; currency: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);       // the periods are wider than the box
  const [atStart, setAtStart] = useState(true);
  const key = periods.map((p) => p.key).join();
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let wasOver = false, restK = 0, seen = { box: 0, table: 0 }, raf = 0, alive = true;
    // Lay the periods out and put the box at its place: the latest periods on a first drawing; on a new measure
    // (resize, web font) the period a reader had moved back to stays against the names.
    const place = () => {
      const was = wasOver ? geom(el) : null, keep = was && was.first >= 0 && was.first < restK ? was.first : null;
      el.style.removeProperty("--fin-col"); el.style.removeProperty("--fin-names"); el.style.setProperty("--fin-pad", "0px");
      let g = geom(el);
      if (!g) return;
      if (g.tableW <= g.boxW + 0.5) {
        el.style.setProperty("--stick", cssPx(g.stick, g.z)); el.scrollLeft = 0;
        wasOver = false; seen = { box: g.boxW, table: g.tableW }; setOver(false); return;
      }
      const fit = finFit(g.boxW, g.stick, g.widest, g.heads.length);
      if (fit) { el.style.setProperty("--fin-col", cssPx(fit.col, g.z)); el.style.setProperty("--fin-names", cssPx(fit.names, g.z)); g = geom(el)!; }
      el.style.setProperty("--stick", cssPx(g.stick, g.z));
      const r = finRest(g.stick, g.boxW, g.starts, g.tableW);
      el.style.setProperty("--fin-pad", cssPx(r.pad, g.z));
      el.scrollLeft = (keep != null && keep < r.k ? Math.max(0, g.starts[keep] - g.stick) : r.left) / g.z;
      wasOver = true; restK = r.k; seen = { box: g.boxW, table: g.tableW }; setOver(true); setAtStart(el.scrollLeft <= 1);
    };
    place();
    // measured again a frame later, never inside the observer's own call (a size changed there is an error)
    const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; const g = alive ? geom(el) : null; if (g && (Math.abs(g.boxW - seen.box) > 0.01 || Math.abs(g.tableW - seen.table) > 0.01)) place(); }); };
    const ro = new ResizeObserver(later);
    ro.observe(el);
    const t = el.querySelector("table");
    if (t) ro.observe(t);
    // a web font that arrives narrower changes no size, but may let one more period fit
    document.fonts?.ready.then(() => { if (alive) place(); }).catch(() => undefined);
    return () => { alive = false; ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [key]);
  // one screen back, to a column's edge worked out here (a smooth scrollBy let the snapping choose a column further back)
  const back = () => {
    const el = box.current, g = el && geom(el);
    if (!el || !g) return;
    el.scrollTo({ left: finBack(g.stick, g.boxW, g.starts, el.scrollLeft * g.z) / g.z, behavior: "smooth" });
  };
  const money = `${unit.label} ${currency ?? ""}`.trim();
  return (
    <div className="finbox" ref={box} onScroll={(e) => setAtStart(e.currentTarget.scrollLeft <= 1)}>
      <table className="fin">
        <thead>
          <tr>
            <th className="l"><span className="u">{money}</span><small>per share: {currency ?? "currency"}</small>
              {/* a press does not take the focus: focusing a control in the sticky names would scroll the box first */}
              {over && <button type="button" className="finprev nocsv" style={atStart ? { visibility: "hidden" } : undefined} onMouseDown={(e) => e.preventDefault()} onClick={back} title="Show the earlier periods">‹ earlier years</button>}</th>
            {periods.map((p) => {
              const doc = periodDoc(p), what = [p.kind === "FC" ? "Company guidance" : p.kind === "Q" ? `Three months to ${fmtDate(p.end)}` : `Year to ${fmtDate(p.end)}`, p.std, p.note].filter(Boolean).join(" · ");
              // a quarter's name on two lines ("2Q" over "FY3/27"), so the column is no wider than before
              const n = periodName(p), label = <>{n.top}{n.sub && <> <span className="fy">{n.sub}</span></>}{p.kind === "FC" && <i>E</i>}</>;
              return (
                <th key={p.key} className={[p.kind === "FC" ? "fc" : "", doc ? "doc" : ""].filter(Boolean).join(" ") || undefined} title={doc ? `${doc.tip} · ${what}` : `${what} · ${noDocWhy(p)}`}>
                  {doc ? <a href={doc.href} target="_blank" rel="noreferrer" title={doc.tip}>{label}</a> : label}
                </th>
              );
            })}
          </tr>
        </thead>
        {sections.map((s) => (
          <tbody key={s.id} data-sec={s.id}>
            <tr className="band"><td className="l">{s.title}</td><td colSpan={periods.length} /></tr>
            {s.rows.map((r) => (
              <tr key={r.id} data-line={r.id} className={r.strong ? "strong" : undefined}>
                <td className="l" title={r.title}>{r.label}</td>
                {r.values.map((v, i) => <td key={periods[i]?.key ?? i} className={`num${periods[i]?.kind === "FC" ? " fc" : ""}${tone(r, v)}`}>{cell(r, v, unit)}</td>)}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
