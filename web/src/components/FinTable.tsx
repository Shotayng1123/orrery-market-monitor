import { useLayoutEffect, useRef } from "react";
import { fmtPc, fmtPs, fmtUnit, type FinPeriod, type FinRow, type FinSection, type FinUnit } from "../lib/stock";

/** The statements of a company as one table (Shota, 18 Nov 2026): every section under the same period columns, so
 *  a year reads straight down from revenue to cash flow. Money is in one unit for the whole table (named in the
 *  corner); per-share lines and ratios say their own. The line names stay put while the periods scroll, and the
 *  table opens at its right end, the latest periods. A guidance column is tinted and marked E. */
const cell = (r: FinRow, v: number | null, unit: FinUnit): string => (r.fmt === "money" ? fmtUnit(v, unit) : r.fmt === "ps" ? fmtPs(v) : fmtPc(v, r.fmt === "growth"));
// a missing figure is greyed; growth is green or red; a negative amount is red, except on the two cash-flow lines
// where an outflow is the ordinary case
const tone = (r: FinRow, v: number | null): string => (v == null ? " na" : r.fmt === "growth" ? (v > 0 ? " up" : v < 0 ? " dn" : "") : v < 0 && r.id !== "icf" && r.id !== "fincf" ? " neg" : "");

export function FinTable({ periods, sections, unit, currency }: { periods: FinPeriod[]; sections: FinSection[]; unit: FinUnit; currency: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const key = periods.map((p) => p.key).join();
  useLayoutEffect(() => { const el = box.current; if (el) el.scrollLeft = el.scrollWidth; }, [key]);
  const money = `${currency ?? ""} ${unit.label}`.trim();
  return (
    <div className="finbox" ref={box}>
      <table className="fin">
        <thead>
          <tr>
            <th className="l">{money}</th>
            {periods.map((p) => <th key={p.key} className={p.kind === "FC" ? "fc" : undefined} title={[p.kind === "FC" ? "Company guidance" : p.kind === "Q" ? `Three months to ${p.end}` : `Year to ${p.end}`, p.std, p.note].filter(Boolean).join(" · ")}>{p.label}{p.kind === "FC" && <i>E</i>}</th>)}
          </tr>
        </thead>
        {sections.map((s) => (
          <tbody key={s.id} data-sec={s.id}>
            <tr className="band"><td className="l">{s.title}</td><td colSpan={periods.length}>{s.id === "ratios" ? "%" : s.id === "is" ? `${money} · per share in ${currency ?? "currency"}` : money}</td></tr>
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
