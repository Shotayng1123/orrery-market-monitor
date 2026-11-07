import { useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { ChartPanel, type ChartPeriod } from "../components/ChartPanel";
import { PeriodBar } from "../components/PeriodBar";
import { CurveChart, spread } from "../components/CurveChart";
import { PolicyChart, type PolicyStep } from "../components/PolicyChart";
import { useApi } from "../lib/useApi";
import type { Curve, TableRow } from "../lib/types";
import { fmtChg, fmtNum, fmtPct, fmtStampSafe, signCls } from "./shared";
import { PERIODS } from "../lib/types";
import { filterCurve, type TenorSet } from "../lib/curveTenors";


interface PolicyRow { bank: string; name: string; rateLabel: string; rate: number | null; asOf: string | null; lastChange: string | null; nextMeeting: string | null; sourceUrl: string | null; sourceNote: string | null }

function FxTable({ rows }: { rows: TableRow[] }) {
  return (
    <table className="mini">
      <thead><tr><th className="l">Pair</th><th>Last</th>{PERIODS.map((p) => <th key={p.key}>{p.label} %</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r.symbol}><td className="l">{r.name}</td><td className="num"><b>{fmtNum(r.last, r.decimals)}</b></td>{PERIODS.map((p) => <td key={p.key} className={`num ${signCls(r.pct[p.key])}`}>{fmtPct(r.pct[p.key])}</td>)}</tr>)}</tbody>
    </table>
  );
}

const CURVE_ORDER = ["US", "JP", "DE", "EA", "EB", "GB", "CA"];
const CURVE_TITLES: Record<string, string> = { USB: "US T-BILLS (1Y AND UNDER)", US: "US TREASURY CURVE", JP: "JGB CURVE", DE: "GERMANY BUND CURVE", EA: "EURO AREA AAA CURVE", EB: "EURO AREA ALL-RATINGS CURVE", GB: "UK GILT CURVE", CA: "CANADA CURVE" };

function CurvesGrid({ ago, tick }: { ago: ChartPeriod; tick: number }) {
  const list = useApi<{ rows: Array<{ country: string; label: string; latest: string; tenors: number }> }>("curves", undefined, tick);
  const have = new Set((list.data?.rows ?? []).map((r) => r.country));
  const codes = CURVE_ORDER.filter((c) => have.has(c) || c === "US" || c === "JP");
  return (
    <>
      {codes.map((c, i) => <CurveBlock key={c} country={c} label={CURVE_TITLES[c] ?? c} ago={ago} tick={tick} no={String(i + 3).padStart(2, "0")} span={i < 2 ? 6 : 4} />)}
      <CurveBlock key="USB" country="US" set="bills" label={CURVE_TITLES.USB} ago={ago} tick={tick} no={String(codes.length + 3).padStart(2, "0")} span={4} />
    </>
  );
}

function CurveBlock({ country, label, ago, tick, no, span, set = "std" }: { country: string; label: string; ago: ChartPeriod; tick: number; no: string; span: 4 | 6; set?: TenorSet }) {
  const a = ago === "1D" || ago === "1W" ? "1M" : ago;
  const d = useApi<{ current: Curve | null; ghost: Curve | null }>("curve", { country, ago: a }, tick);
  const c = filterCurve(d.data?.current ?? null, set), g = filterCurve(d.data?.ghost ?? null, set);
  const row = (t: string, v: number | null, gv: number | null) => <tr key={t}><td className="l">{t}</td><td className="num">{v == null ? "–" : v.toFixed(3)}</td><td className="num mut">{gv == null ? "–" : gv.toFixed(3)}</td><td className={`num ${signCls(v != null && gv != null ? v - gv : null)}`}>{v != null && gv != null ? fmtChg(v - gv, 1, true) : "–"}</td></tr>;
  return (
    <Panel no={no} title={label} span={span} aux={c ? <>{c.date} · ghost {g?.date ?? "–"} ({a} ago) · {c.source}</> : d.error ? <span className="warn">{d.error}</span> : ""}>
      {c ? (
        <>
          <CurveChart current={c} ghost={g} height={230} />
          {set === "std" && <div className="krow" style={{ marginTop: 6 }}>
            <span><span className="k">2s10s</span><span className={`v ${signCls(spread(c, 2, 10))}`}>{fmtChg(spread(c, 2, 10), 0)}bp</span></span>
            <span><span className="k">10s30s</span><span className={`v ${signCls(spread(c, 10, 30))}`}>{fmtChg(spread(c, 10, 30), 0)}bp</span></span>
            {g && <span><span className="k">2s10s vs {a} ago</span><span className="v">{fmtChg((spread(c, 2, 10) ?? 0) - (spread(g, 2, 10) ?? 0), 0)}bp</span></span>}
          </div>}
          <table className="mini"><thead><tr><th className="l">Tenor</th><th>Today</th><th>{a} ago</th><th>Change</th></tr></thead>
            <tbody>{c.points.map((p) => row(p.tenor, p.yield, g?.points.find((q) => q.tenor === p.tenor)?.yield ?? null))}</tbody></table>
        </>
      ) : <Empty title="No curve yet">{d.error ?? "Loads once the curves job has run."}</Empty>}
    </Panel>
  );
}

function PolicyTable({ tick }: { tick: number }) {
  const p = useApi<{ rows: PolicyRow[] }>("policy", undefined, tick);
  const h = useApi<{ rows: PolicyStep[]; sources: Record<string, string> }>("policy_history", undefined, tick);
  const rows = p.data?.rows ?? [];
  const steps = h.data?.rows ?? [];
  return (
    <Panel no="10" title="POLICY RATES" span={12} aux="values only when a job or a person has filled them from the source; blanks are blanks">
      {steps.length ? <PolicyChart steps={steps} /> : <Empty title="No rate history yet">{h.error ?? "Loads once the policy jobs have run."}</Empty>}
      {h.data && Object.keys(h.data.sources).length > 0 && <div className="hint2" style={{ marginBottom: 8 }}>{Object.entries(h.data.sources).map(([b, src]) => <span key={b} style={{ marginRight: 12 }}><b>{b}</b> {src}</span>)}</div>}
      {rows.length ? (
        <table className="mini">
          <thead><tr><th className="l">Central bank</th><th className="l">Rate</th><th>Level</th><th className="l">As of</th><th className="l">Last change</th><th className="l">Next meeting</th><th className="l">Source</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.bank}><td className="l"><b>{r.bank}</b> <span className="mut">{r.name}</span></td><td className="l">{r.rateLabel}</td><td className="num">{r.rate == null ? "–" : `${r.rate.toFixed(2)}%`}</td><td className="l">{r.asOf ?? "–"}</td><td className="l">{r.lastChange ?? "–"}</td><td className="l">{r.nextMeeting ?? "–"}</td><td className="l">{r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noreferrer">{new URL(r.sourceUrl).hostname}</a> : "–"}{r.sourceNote && <span className="mut"> · {r.sourceNote}</span>}</td></tr>)}</tbody>
        </table>
      ) : <Empty title="No policy rates loaded">{p.error ?? "Fed from FRED; the others follow."}</Empty>}
    </Panel>
  );
}

export function RatesFxView({ tick }: { sub: string; onSub: (s: string) => void; tick: number }) {
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [twoSigma, setTwoSigma] = useState(false);
  const table = useApi<{ rows: TableRow[]; asOf: string }>("table", undefined, tick);
  const fx = (table.data?.rows ?? []).filter((r) => r.group === "fx").sort((a, b) => a.order - b.order);
  const rates = (table.data?.rows ?? []).filter((r) => r.group === "rates").sort((a, b) => a.order - b.order);
  return (
    <>
      <div className="c12"><PeriodBar period={period} onPeriod={setPeriod} twoSigma={twoSigma} onTwoSigma={setTwoSigma} /></div>
      <Panel no="01" title="FOREX" span={12} aux={table.data ? <>as of {fmtStampSafe(table.data.asOf)} · Yahoo Finance</> : ""}>
        {fx.length ? <FxTable rows={fx} /> : <Empty title="Awaiting the data feed">{table.error ?? "Pairs load with the market table."}</Empty>}
      </Panel>
      <Panel no="02" title="PAIRS" span={12} aux={`${fx.length} panels · ${period}`}>
        {fx.length ? <div className="cgrid">{fx.map((r) => <ChartPanel key={r.symbol} row={r} period={period} tick={tick} twoSigma={twoSigma} />)}</div> : <Empty title="No pairs yet" />}
      </Panel>
      <CurvesGrid ago={period} tick={tick} />
      <PolicyTable tick={tick} />
      <Panel no="11" title="YIELDS" span={12} aux={`${rates.length} panels · ${period}`}>
        {rates.length ? <div className="cgrid">{rates.map((r) => <ChartPanel key={r.symbol} row={r} period={period} tick={tick} twoSigma={twoSigma} />)}</div> : <Empty title="No yields yet" />}
      </Panel>
    </>
  );
}
