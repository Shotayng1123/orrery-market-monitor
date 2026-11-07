import { useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { useApi } from "../lib/useApi";
import { fmtNum, fmtPct, fmtStampSafe, signCls } from "./shared";
import { PERIODS, type TableRow } from "../lib/types";
import { marketById } from "../lib/sessions";

const CHART_PERIODS = ["1M", "3M", "12M", "36M"] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];

function Badges({ r }: { r: TableRow }) {
  const m = marketById(r.market);
  return (
    <>
      {r.proxyFor && <span className="badge proxy" title={`${r.name} stands in for ${r.proxyFor}; the table closes use the official index value when available`}>PROXY</span>}
      {r.live && m.delayMin > 0 && <span className="badge delay" title={`${m.name} feed is delayed about ${m.delayMin} minutes`}>DELAYED ~{m.delayMin}m</span>}
      {r.live && m.delayMin === 0 && <span className="badge live">LIVE</span>}
    </>
  );
}

function MarketsTable({ rows }: { rows: TableRow[] }) {
  const groups = new Map<string, TableRow[]>();
  for (const r of [...rows].sort((a, b) => a.order - b.order)) groups.set(r.cls, [...(groups.get(r.cls) ?? []), r]);
  return (
    <table className="mkt">
      <thead>
        <tr>
          <th className="l">Asset class</th><th className="l">Name</th><th>Last</th>
          {PERIODS.map((p) => <th key={p.key} className={p.key === "d1" ? "grp" : ""} title={`Close at the start of the ${p.label} window`}>{p.label} close</th>)}
          {PERIODS.map((p) => <th key={p.key} className={p.key === "d1" ? "grp" : ""} title={`Change from the ${p.label} close to the last print`}>{p.label} %</th>)}
        </tr>
      </thead>
      <tbody>
        {[...groups.entries()].map(([cls, rs]) => (
          <GroupRows key={cls} cls={cls} rs={rs} />
        ))}
      </tbody>
    </table>
  );
}

function GroupRows({ cls, rs }: { cls: string; rs: TableRow[] }) {
  return (
    <>
      <tr className="cls"><td colSpan={3 + PERIODS.length * 2}>{cls}</td></tr>
      {rs.map((r) => (
        <tr key={r.symbol} title={`${r.symbol} · last ${fmtStampSafe(r.lastAt)}`}>
          <td className="l mut">{r.cls}</td>
          <td className="l">{r.name}<Badges r={r} /></td>
          <td className="num"><b>{fmtNum(r.last, r.decimals)}</b></td>
          {PERIODS.map((p) => <td key={p.key} className={`num${p.key === "d1" ? " grp" : ""}`} title={r.closeDates[p.key] ?? ""}>{fmtNum(r.closes[p.key], r.decimals)}</td>)}
          {PERIODS.map((p) => <td key={p.key} className={`num ${signCls(r.pct[p.key])}${p.key === "d1" ? " grp" : ""}`}>{fmtPct(r.pct[p.key])}</td>)}
        </tr>
      ))}
    </>
  );
}

export function MarketView({ tick }: { tick: number }) {
  const table = useApi<{ rows: TableRow[]; asOf: string }>("table", undefined, tick);
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const rows = table.data?.rows ?? [];
  const periodChips = (
    <span className="chips" style={{ margin: 0 }}>
      <span className="lbl">Period</span>
      {CHART_PERIODS.map((p) => <span key={p} className={`chip-sm${p === period ? " on" : ""}`} onClick={() => setPeriod(p)}>{p}</span>)}
    </span>
  );
  const legend = (
    <div className="legend">
      <span><span className="sw" style={{ background: "var(--s1m)" }} />1M σ (21d)</span>
      <span><span className="sw" style={{ background: "var(--s12m)" }} />12M σ (252d)</span>
      <span><span className="sw" style={{ background: "var(--s36m)" }} />36M σ (756d)</span>
      <span className="mut">rolling mean ± 1σ</span>
    </div>
  );
  return (
    <>
      <Panel no="01" title="MARKETS" aux={table.data ? <>as of {fmtStampSafe(table.data.asOf)} · Yahoo Finance, Treasury, MOF</> : table.error ? <span className="warn">{table.error}</span> : "loading…"}>
        {rows.length ? <MarketsTable rows={rows} /> : <Empty title="Awaiting the data feed">{table.error ?? "The market table fills once the Monitor backend is deployed and its first daily history run has completed."}</Empty>}
        <div className="hint2">Closes are the last session on or before each window start (1W = 7 calendar days, 1M/3M/12M/36M = calendar months). % = change from that close to the last print. Delayed feeds carry a badge.</div>
      </Panel>
      <Panel no="02" title="EQUITIES" span={12} aux={periodChips}>
        {legend}
        <Empty title="Chart panels">One panel per equity index and future, {period} window, rolling σ bands. Rendered once the history endpoint is live.</Empty>
      </Panel>
      <Panel no="03" title="RATES" span={6} aux={periodChips}>
        <Empty title="Yields, policy rates and the curve">UST and JGB yields with σ bands, policy-rate table, and the yield curve with a translucent curve from the selected period ago.</Empty>
      </Panel>
      <Panel no="04" title="CURRENCY" span={6} aux={periodChips}>
        <Empty title="FX pairs">USD/JPY, EUR/USD, GBP/USD, AUD/USD, USD/CNH, USD/KRW, USD/SGD, EUR/JPY and DXY with σ bands.</Empty>
      </Panel>
    </>
  );
}
