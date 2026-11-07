import { useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { ChartPanel, CHART_PERIODS, type ChartPeriod } from "../components/ChartPanel";
import { CurveChart, spread } from "../components/CurveChart";
import { useApi, DEV_MOCK } from "../lib/useApi";
import { fmtNum, fmtPct, fmtChg, fmtStampSafe, signCls } from "./shared";
import { PERIODS, type Curve, type TableRow } from "../lib/types";
import { marketById } from "../lib/sessions";

function Badges({ r }: { r: TableRow }) {
  const m = marketById(r.market);
  return (
    <>
      {r.proxyFor && <span className="badge proxy" title={`${r.name} stands in for ${r.proxyFor}; table closes use the official index value when available`}>PROXY</span>}
      {r.live && m && m.delayMin > 0 && <span className="badge delay" title={`${m.name} feed is delayed about ${m.delayMin} minutes`}>DELAYED ~{m.delayMin}m</span>}
      {r.live && m && m.delayMin === 0 && <span className="badge live">LIVE</span>}
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
          {PERIODS.map((p) => <th key={p.key} className={p.key === "d1" ? "grp" : ""} title={`Change from the ${p.label} close to the last print (bp for yields)`}>{p.label} %</th>)}
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

// Conditional shading, as in a spreadsheet: the level cells of a row are shaded on a red-to-green scale between
// the row's lowest and highest level (last print included), so the eye sees where today sits in three years;
// the change cells are shaded by sign and size (full tint at ±10%, or ±50bp for yields).
const UP_RGB = "63,208,126", DN_RGB = "255,77,66";
function levelShade(v: number | null | undefined, lo: number, hi: number): string | undefined {
  if (v == null || !(hi > lo)) return undefined;
  const x = (v - lo) / (hi - lo);                       // 0 = lowest level of the row, 1 = highest
  const a = Math.abs(x - 0.5) * 2 * 0.32;               // transparent in the middle, tinted at the ends
  return `rgba(${x >= 0.5 ? UP_RGB : DN_RGB},${a.toFixed(3)})`;
}
function changeShade(v: number | null | undefined, full: number): string | undefined {
  if (v == null || v === 0) return undefined;
  const a = Math.min(1, Math.abs(v) / full) * 0.38;
  return `rgba(${v > 0 ? UP_RGB : DN_RGB},${a.toFixed(3)})`;
}

function GroupRows({ cls, rs }: { cls: string; rs: TableRow[] }) {
  return (
    <>
      <tr className="cls"><td colSpan={3 + PERIODS.length * 2}>{cls}</td></tr>
      {rs.map((r) => {
        const isRate = r.group === "rates";
        const levels = [r.last, ...PERIODS.map((p) => r.closes[p.key])].filter((x): x is number => x != null);
        const lo = Math.min(...levels), hi = Math.max(...levels);
        return (
          <tr key={r.symbol} className={r.live ? "live" : undefined} title={`${r.symbol} · last ${fmtStampSafe(r.lastAt)}${r.live ? " · market open" : ""} · level shading: red = lowest of the row's levels, green = highest`}>
            <td className="l mut">{r.cls}</td>
            <td className="l">{r.name}<Badges r={r} /></td>
            <td className="num" style={{ background: levelShade(r.last, lo, hi) }}><b>{fmtNum(r.last, r.decimals)}</b></td>
            {PERIODS.map((p) => <td key={p.key} className={`num${p.key === "d1" ? " grp" : ""}`} style={{ background: levelShade(r.closes[p.key], lo, hi) }} title={r.closeDates[p.key] ?? ""}>{fmtNum(r.closes[p.key], r.decimals)}</td>)}
            {PERIODS.map((p) => {
              const c = r.closes[p.key];
              const v = isRate ? (c != null && r.last != null ? r.last - c : null) : r.pct[p.key];
              return <td key={p.key} className={`num ${signCls(v)}${p.key === "d1" ? " grp" : ""}`} style={{ background: changeShade(v, isRate ? 0.5 : 10) }}>{isRate ? fmtChg(v, 3, true) : fmtPct(v)}</td>;
            })}
          </tr>
        );
      })}
    </>
  );
}

function ChartGroup({ no, title, rows, period, tick, twoSigma, children }: { no: string; title: string; rows: TableRow[]; period: ChartPeriod; tick: number; twoSigma: boolean; children?: React.ReactNode }) {
  return (
    <Panel no={no} title={title} span={12} aux={`${rows.length} panels · ${period}`}>
      {children}
      {rows.length ? <div className="cgrid">{rows.map((r) => <ChartPanel key={r.symbol} row={r} period={period} tick={tick} twoSigma={twoSigma} />)}</div> : <Empty title="No instruments in this group yet" />}
    </Panel>
  );
}

function CurvePanel({ period, tick }: { period: ChartPeriod; tick: number }) {
  const ago = period === "1D" || period === "1W" ? "1M" : period;
  const us = useApi<{ current: Curve | null; ghost: Curve | null }>("curve", { country: "US", ago }, tick);
  const jp = useApi<{ current: Curve | null; ghost: Curve | null }>("curve", { country: "JP", ago }, tick);
  const one = (label: string, d: { current: Curve | null; ghost: Curve | null } | null, err: string | null) => (
    <div className="mtile cp">
      <div className="lb"><span className="lbtxt">{label}</span><span className="asof">{d?.current ? `${d.current.date} · ghost ${d.ghost?.date ?? "–"} (${ago} ago)` : ""}</span></div>
      {d?.current ? (
        <>
          <CurveChart current={d.current} ghost={d.ghost} />
          <div className="rdout mut">
            2s10s {fmtChg(spread(d.current, 2, 10), 0)}bp · 10s30s {fmtChg(spread(d.current, 10, 30), 0)}bp
            {d.ghost && <> · vs {ago} ago: 2s10s {fmtChg((spread(d.current, 2, 10) ?? 0) - (spread(d.ghost, 2, 10) ?? 0), 0)}bp</>} · {d.current.source}
          </div>
        </>
      ) : <div className="empty" style={{ minHeight: 190 }}>{err ?? "no curve yet"}</div>}
    </div>
  );
  return <div className="cgrid two">{one("US TREASURY CURVE", us.data, us.error)}{one("JGB CURVE", jp.data, jp.error)}</div>;
}

export function MarketView({ tick }: { tick: number }) {
  const table = useApi<{ rows: TableRow[]; asOf: string }>("table", undefined, tick);
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [twoSigma, setTwoSigma] = useState(false);
  const rows = table.data?.rows ?? [];
  const by = (g: string) => rows.filter((r) => r.group === g).sort((a, b) => a.order - b.order);
  const selector = (
    <div className="chips" style={{ margin: "0 0 6px" }}>
      <span className="lbl">Period</span>
      {CHART_PERIODS.map((p) => <span key={p} className={`chip-sm${p === period ? " on" : ""}`} onClick={() => setPeriod(p)}>{p}</span>)}
      <span className="lbl" style={{ marginLeft: 14 }}>Bands</span>
      <span className="chip-sm on" title="Rolling mean ± 1σ over 21 / 252 / 756 trading days">±1σ</span>
      <span className={`chip-sm${twoSigma ? " on" : ""}`} onClick={() => setTwoSigma(!twoSigma)} title="Also draw ±2σ (dashed)">±2σ</span>
      <span className="legend" style={{ padding: 0, marginLeft: 14 }}>
        <span><span className="sw" style={{ background: "var(--s1m)" }} />1M</span>
        <span><span className="sw" style={{ background: "var(--s12m)" }} />12M</span>
        <span><span className="sw" style={{ background: "var(--s36m)" }} />36M</span>
      </span>
    </div>
  );
  return (
    <>
      <Panel no="01" title="MARKETS" aux={table.data ? <>as of {fmtStampSafe(table.data.asOf)} · Yahoo Finance, US Treasury, MOF{DEV_MOCK && <span className="badge est">MOCK</span>}</> : table.error ? <span className="warn">{table.error}</span> : "loading…"}>
        {rows.length ? <MarketsTable rows={rows} /> : <Empty title="Awaiting the data feed">{table.error ?? "The market table fills once the Monitor backend is deployed and its first daily history run has completed."}</Empty>}
        <div className="hint2">Closes are the last session on or before each window start (1W = 7 calendar days, 1M/3M/12M/36M = calendar months). % = change from that close to the last print; yields show the change in bp. After a market closes its closing level and day change are held until the next session&apos;s first print. Rows of open markets are highlighted; delayed feeds carry a badge; hover a row for the source time.</div>
      </Panel>
      <div className="c12">{selector}</div>
      <ChartGroup no="02" title="EQUITIES" rows={by("equity")} period={period} tick={tick} twoSigma={twoSigma} />
      <ChartGroup no="03" title="RATES" rows={by("rates")} period={period} tick={tick} twoSigma={twoSigma}>
        <div className="minih">Yield curves · today vs {period === "1D" || period === "1W" ? "1M" : period} ago</div>
        <CurvePanel period={period} tick={tick} />
        <div className="minih" style={{ marginTop: 8 }}>Yields</div>
      </ChartGroup>
      <ChartGroup no="04" title="CURRENCY" rows={by("fx")} period={period} tick={tick} twoSigma={twoSigma} />
      <ChartGroup no="05" title="COMMODITIES" rows={by("cmdty")} period={period} tick={tick} twoSigma={twoSigma} />
    </>
  );
}
