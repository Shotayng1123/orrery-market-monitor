import { useLayoutEffect, useRef, useState } from "react";
import { fmtPs, fmtRatio, fmtUnit, type FinPeriod, type FinRow, type FinSection, type FinUnit } from "../lib/stock";
import { finBack, finRest } from "../lib/finscroll";

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
 *  names, a spacer after the last column letting the scroll reach that place. "‹ earlier years" in the names'
 *  header moves one screen back, and is hidden at the start. */
const cell = (r: FinRow, v: number | null, unit: FinUnit): string => (r.fmt === "money" ? fmtUnit(v, unit) : r.fmt === "ps" ? fmtPs(v) : fmtRatio(v, r.fmt === "growth"));
// a missing figure is greyed; growth is green or red; a negative amount is red, except on the two cash-flow lines
// where an outflow is the ordinary case
const tone = (r: FinRow, v: number | null): string => (v == null ? " na" : r.fmt === "growth" ? (v > 0 ? " up" : v < 0 ? " dn" : "") : v < 0 && r.id !== "icf" && r.id !== "fincf" ? " neg" : "");

export function FinTable({ periods, sections, unit, currency }: { periods: FinPeriod[]; sections: FinSection[]; unit: FinUnit; currency: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);       // the periods are wider than the box
  const [atStart, setAtStart] = useState(true);
  const key = periods.map((p) => p.key).join();
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = () => {
      const t = el.querySelector("table"), names = t?.querySelector<HTMLElement>("thead th.l");
      if (!t || !names) return;
      el.style.setProperty("--fin-pad", "0px");
      const stick = names.offsetWidth, tableW = t.offsetWidth;
      el.style.setProperty("--stick", `${stick}px`);
      if (tableW <= el.clientWidth + 1) { setOver(false); el.scrollLeft = 0; return; }
      const starts = [...t.querySelectorAll<HTMLElement>("thead th:not(.l)")].map((th) => th.offsetLeft);
      const r = finRest(stick, el.clientWidth, starts, tableW);
      el.style.setProperty("--fin-pad", `${r.pad}px`);
      el.scrollLeft = r.left;
      setOver(true); setAtStart(el.scrollLeft <= 1);
    };
    place();
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; place(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);
  // one screen back, to a column's edge worked out here (a smooth scrollBy let the snapping choose a column further back)
  const back = () => {
    const el = box.current, t = el?.querySelector("table"), names = t?.querySelector<HTMLElement>("thead th.l");
    if (!el || !t || !names) return;
    const starts = [...t.querySelectorAll<HTMLElement>("thead th:not(.l)")].map((th) => th.offsetLeft);
    el.scrollTo({ left: finBack(names.offsetWidth, el.clientWidth, starts, el.scrollLeft), behavior: "smooth" });
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
            {periods.map((p) => <th key={p.key} className={p.kind === "FC" ? "fc" : undefined} title={[p.kind === "FC" ? "Company guidance" : p.kind === "Q" ? `Three months to ${p.end}` : `Year to ${p.end}`, p.std, p.note].filter(Boolean).join(" · ")}>{p.label}{p.kind === "FC" && <i>E</i>}</th>)}
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
