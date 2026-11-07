import { useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { ChartPanel, type ChartPeriod } from "../components/ChartPanel";
import { PeriodBar } from "../components/PeriodBar";
import { CurveChart, spread } from "../components/CurveChart";
import { useApi } from "../lib/useApi";
import type { Curve, TableRow } from "../lib/types";
import { fmtChg, fmtNum, fmtPct, fmtStampSafe, signCls } from "./shared";
import { PERIODS } from "../lib/types";

export const RATES_SUBS = [{ id: "fx", label: "FOREX" }, { id: "curve", label: "CURVE" }, { id: "tbd", label: "TBD" }] as const;

interface PolicyRow { bank: string; name: string; rateLabel: string; rate: number | null; asOf: string | null; lastChange: string | null; nextMeeting: string | null; sourceUrl: string | null; sourceNote: string | null }

function FxTable({ rows }: { rows: TableRow[] }) {
  return (
    <table className="mini">
      <thead><tr><th className="l">Pair</th><th>Last</th>{PERIODS.map((p) => <th key={p.key}>{p.label} %</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r.symbol}><td className="l">{r.name}</td><td className="num"><b>{fmtNum(r.last, r.decimals)}</b></td>{PERIODS.map((p) => <td key={p.key} className={`num ${signCls(r.pct[p.key])}`}>{fmtPct(r.pct[p.key])}</td>)}</tr>)}</tbody>
    </table>
  );
}

function CurveBlock({ country, label, ago, tick }: { country: "US" | "JP"; label: string; ago: ChartPeriod; tick: number }) {
  const a = ago === "1D" || ago === "1W" ? "1M" : ago;
  const d = useApi<{ current: Curve | null; ghost: Curve | null }>("curve", { country, ago: a }, tick);
  const c = d.data?.current ?? null, g = d.data?.ghost ?? null;
  const row = (t: string, v: number | null, gv: number | null) => <tr key={t}><td className="l">{t}</td><td className="num">{v == null ? "–" : v.toFixed(3)}</td><td className="num mut">{gv == null ? "–" : gv.toFixed(3)}</td><td className={`num ${signCls(v != null && gv != null ? v - gv : null)}`}>{v != null && gv != null ? fmtChg(v - gv, 1, true) : "–"}</td></tr>;
  return (
    <Panel no={country === "US" ? "01" : "02"} title={label} span={6} aux={c ? <>{c.date} · ghost {g?.date ?? "–"} ({a} ago) · {c.source}</> : d.error ? <span className="warn">{d.error}</span> : ""}>
      {c ? (
        <>
          <CurveChart current={c} ghost={g} height={230} />
          <div className="krow" style={{ marginTop: 6 }}>
            <span><span className="k">2s10s</span><span className={`v ${signCls(spread(c, 2, 10))}`}>{fmtChg(spread(c, 2, 10), 0)}bp</span></span>
            <span><span className="k">10s30s</span><span className={`v ${signCls(spread(c, 10, 30))}`}>{fmtChg(spread(c, 10, 30), 0)}bp</span></span>
            {g && <span><span className="k">2s10s vs {a} ago</span><span className="v">{fmtChg((spread(c, 2, 10) ?? 0) - (spread(g, 2, 10) ?? 0), 0)}bp</span></span>}
          </div>
          <table className="mini"><thead><tr><th className="l">Tenor</th><th>Today</th><th>{a} ago</th><th>Change</th></tr></thead>
            <tbody>{c.points.map((p) => row(p.tenor, p.yield, g?.points.find((q) => q.tenor === p.tenor)?.yield ?? null))}</tbody></table>
        </>
      ) : <Empty title="No curve yet">{d.error ?? "Loads once the curves job has run."}</Empty>}
    </Panel>
  );
}

function PolicyTable({ tick }: { tick: number }) {
  const p = useApi<{ rows: PolicyRow[] }>("policy", undefined, tick);
  const rows = p.data?.rows ?? [];
  return (
    <Panel no="03" title="POLICY RATES" span={12} aux="values only when a job or a person has filled them from the source; blanks are blanks">
      {rows.length ? (
        <table className="mini">
          <thead><tr><th className="l">Central bank</th><th className="l">Rate</th><th>Level</th><th className="l">As of</th><th className="l">Last change</th><th className="l">Next meeting</th><th className="l">Source</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.bank}><td className="l"><b>{r.bank}</b> <span className="mut">{r.name}</span></td><td className="l">{r.rateLabel}</td><td className="num">{r.rate == null ? "–" : `${r.rate.toFixed(2)}%`}</td><td className="l">{r.asOf ?? "–"}</td><td className="l">{r.lastChange ?? "–"}</td><td className="l">{r.nextMeeting ?? "–"}</td><td className="l">{r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noreferrer">{new URL(r.sourceUrl).hostname}</a> : "–"}{r.sourceNote && <span className="mut"> · {r.sourceNote}</span>}</td></tr>)}</tbody>
        </table>
      ) : <Empty title="No policy rates loaded">{p.error ?? "Fed from FRED; the others follow."}</Empty>}
    </Panel>
  );
}

export function RatesFxView({ sub, onSub, tick }: { sub: string; onSub: (s: string) => void; tick: number }) {
  const cur = RATES_SUBS.find((s) => s.id === sub) ?? RATES_SUBS[0];
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [twoSigma, setTwoSigma] = useState(false);
  const table = useApi<{ rows: TableRow[]; asOf: string }>("table", undefined, tick);
  const fx = (table.data?.rows ?? []).filter((r) => r.group === "fx").sort((a, b) => a.order - b.order);
  const rates = (table.data?.rows ?? []).filter((r) => r.group === "rates").sort((a, b) => a.order - b.order);
  const toggle = (
    <div className="chips">
      <span className="lbl">View</span>
      {RATES_SUBS.map((s) => <span key={s.id} className={`chip-sm${s.id === cur.id ? " on" : ""}`} onClick={() => onSub(s.id)}>{s.label}</span>)}
    </div>
  );
  return (
    <>
      <div className="c12">{toggle}{cur.id !== "tbd" && <PeriodBar period={period} onPeriod={setPeriod} twoSigma={twoSigma} onTwoSigma={setTwoSigma} />}</div>
      {cur.id === "fx" && (
        <>
          <Panel no="01" title="FOREX" span={12} aux={table.data ? <>as of {fmtStampSafe(table.data.asOf)} · Yahoo Finance</> : ""}>
            {fx.length ? <FxTable rows={fx} /> : <Empty title="Awaiting the data feed">{table.error ?? "Pairs load with the market table."}</Empty>}
          </Panel>
          <Panel no="02" title="PAIRS" span={12} aux={`${fx.length} panels · ${period}`}>
            {fx.length ? <div className="cgrid">{fx.map((r) => <ChartPanel key={r.symbol} row={r} period={period} tick={tick} twoSigma={twoSigma} />)}</div> : <Empty title="No pairs yet" />}
          </Panel>
        </>
      )}
      {cur.id === "curve" && (
        <>
          <CurveBlock country="US" label="US TREASURY CURVE" ago={period} tick={tick} />
          <CurveBlock country="JP" label="JGB CURVE" ago={period} tick={tick} />
          <PolicyTable tick={tick} />
          <Panel no="04" title="YIELDS" span={12} aux={`${rates.length} panels · ${period}`}>
            {rates.length ? <div className="cgrid">{rates.map((r) => <ChartPanel key={r.symbol} row={r} period={period} tick={tick} twoSigma={twoSigma} />)}</div> : <Empty title="No yields yet" />}
          </Panel>
        </>
      )}
      {cur.id === "tbd" && <Panel no="01" title="TBD" span={12}><Empty title="Reserved">Further rates and currency functions, to be defined with Shota.</Empty></Panel>}
    </>
  );
}
