// Pieces of the paper portfolio's form that its book's pages show again (P-1): what the targets mean, the ladder's
// three bases, what a start can and cannot trade, the Reference's line. The words are the engine's (lib/pf/).
import { useState } from "react";
import { STARTS, notBuiltLines, referenceLabel, canLines } from "../../lib/pf/presets.ts";
import { BASE_LINE, BASE_NAME, BASE_RULE, equivalentLine, ladderInVols, SCALE_LINE, SCALE_TIP, SHARPE_TIP, sharpeLine, varStep, varTie } from "../../lib/pf/targets.ts";
import type { Base, CashRate, LadderBase, StartId, Field } from "../../lib/pf/types.ts";
import { TARGET_VOLATILITY } from "../../lib/labels";

/** Under the target return: its absolute equivalent at the latest stored rate, with the rate's date and source. */
export const EquivalentLine = ({ x, rate, base }: { x: number | null; rate: CashRate | null; base: Base }) => (x == null ? null : <span className="pf-line" id="pf-equiv">{equivalentLine(x, rate, base)}</span>);

/** Under the target volatility: the implied Sharpe ratio, the tie to the VaR limit in its three states, and the
 *  ladder's first step in target volatilities, with the scale line under 0.8. Each follows the fields as typed. */
export function VolLines({ x, vol, cut1, varLimit, start }: { x: number | null; vol: number | null; cut1: number | null; varLimit: number | null; start: StartId }) {
  if (vol == null) return null;
  const tie = varLimit != null ? varTie(vol, varLimit, varStep(start)) : null, lad = cut1 != null ? ladderInVols(cut1, vol) : null;
  return (
    <>
      {x != null && <span className="pf-line" id="pf-sharpe" title={SHARPE_TIP}>{sharpeLine(x, vol)}</span>}
      {tie && <TieLine state={tie.state} line={tie.line} id="pf-tie" />}
      {lad && <span className="pf-line" id="pf-ladvol">{lad.line}</span>}
      {lad?.scale && <span className="pf-line" id="pf-scale" title={SCALE_TIP}>{SCALE_LINE}</span>}
    </>
  );
}
/** The VaR tie as a line: muted when clear, amber with WARN when warned, red when refused. The word is always there;
 *  colour is never the only sign. */
export const TieLine = ({ state, line, id }: { state: "clear" | "warned" | "refused"; line: string; id?: string }) => (
  <span className={`pf-line tie ${state}`} id={id} data-state={state} role={state === "refused" ? "alert" : undefined}>{state === "warned" && <b className="w">! WARN </b>}{state === "refused" && <b className="w">✕ </b>}{line}</span>
);

/** The Reference of a start on a base currency: its label, PROXY, the tracker it is mirrored from and its state. Never
 *  an input: the start fixes it. */
export function ReferenceLine({ start, base, blend, short = false }: { start: StartId; base: Base; blend: number | null; short?: boolean }) {
  const r = referenceLabel(start, base, blend);
  if (!r) return null;
  if (short) return <><span>{r.short}</span> <span className="badge proxy" title="A stand-in series: the index's own data is by subscription">PROXY</span></>;
  return (
    <span className="pf-ref" id="pf-reference">
      <span className="l">{r.label} <span className="badge proxy" title="A stand-in series: the index's own data is by subscription">PROXY</span></span>
      {r.note && <span className="pf-line">{r.note}</span>}
      <span className="pf-line">{r.proxy} · {r.state}</span>
    </span>
  );
}

/** What a start can trade, what is not built yet, and what it cannot trade here, with the reason in each line.
 *  Text only: nothing in the three lists takes a click, a tap or the focus. */
export function TradeLists({ start, values }: { start: StartId; values?: Partial<Record<string, number | string>> }) {
  const t = STARTS[start].trade, can = canLines(start, values);
  const lead = (line: string) => { const i = line.indexOf(":"); return i > 0 ? <><b>{line.slice(0, i)}</b>{line.slice(i)}</> : line; };
  return (
    <div className="pf-trade" id="pf-trade">
      <div className="minih">Can trade</div>
      <ul className="can" data-list="can">{can.map((x) => <li key={x}>{x}</li>)}</ul>
      <div className="minih">Not built yet</div>
      <ul className="not" data-list="notbuilt">{notBuiltLines(start).map((x) => <li key={x}>{x}</li>)}</ul>
      <div className="minih">Cannot trade here, and why</div>
      <ul className="not" data-list="cannot">{t.cannot.map((x, i) => <li key={x}>{i < (t.bold ?? 0) ? <b>{x}</b> : lead(x)}</li>)}</ul>
    </div>
  );
}

/** The funding of a dollar book's Tokyo names, in one wording for the form and for Settings (the designer's B.2, lead 5):
 *  the one way built, its line once, and the other way muted, with why it waits; no control until currencies are
 *  built. */
export function FundingLine({ field }: { field: Field }) {
  const o = field.choices?.options ?? [];
  return <span className="pf-fund" data-row-text="funding"><span className="on">{o[0]?.label}</span><span className="pf-line">{field.why}</span>{o[1] && <span className="pf-line pf-mut">{o[1].label}: {o[1].off}</span>}</span>;
}

/** The ladder's base: three radio rows, the first preselected and marked "default", each with one line on what it does
 *  to capital and limits; "the whole rule" opens it under the rows (the designer's B.2: the link says what it opens). */
export function LadderBases({ value, onChange, phone = false }: { value: LadderBase; onChange: (v: LadderBase) => void; phone?: boolean }) {
  const [more, setMore] = useState(false);
  return (
    <div className={`pf-bases${phone ? " ph" : ""}`} id="pf-bases" role="radiogroup" aria-label="The ladder's base">
      {(["guarded", "yearly", "start"] as const).map((b) => (
        <label key={b} className={`pf-base${value === b ? " on" : ""}`} data-base={b}>
          <input type="radio" name="pf-base" value={b} checked={value === b} onChange={() => onChange(b)} />
          <span className="rd" aria-hidden="true" />
          <span className="tx"><span className="n">{BASE_NAME[b]}{b === "guarded" && <span className="def"> · default · Owner</span>}</span><span className="pf-line">{BASE_LINE[b]}</span></span>
        </label>
      ))}
      <button type="button" className="pf-link" id="pf-base-more" aria-expanded={more} onClick={() => setMore((m) => !m)}>{more ? "hide the whole rule" : "the whole rule"}</button>
      {more && <p className="pf-mut" id="pf-base-rule">{BASE_RULE}</p>}
    </div>
  );
}
/** The word a figure of the tie uses for its field, kept with the glossary. */
export const TARGET_VOL_WORD = TARGET_VOLATILITY;
