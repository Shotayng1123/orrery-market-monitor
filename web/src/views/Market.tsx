import { useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { ChartPanel, type ChartPeriod } from "../components/ChartPanel";
import { PeriodBar } from "../components/PeriodBar";
import { TileGrid } from "../components/TileGrid";
import type { SigmaWindow } from "../components/SigmaChart";
import { CurveChart, spread } from "../components/CurveChart";
import { useApi, DEV_MOCK } from "../lib/useApi";
import { fmtNum, fmtPct, fmtChg, fmtStampSafe, isYield, signCls } from "./shared";
import { Flash } from "../components/Flash";
import { PERIODS, type Curve, type TableRow } from "../lib/types";
import { marketById } from "../lib/sessions";
import { filterCurve } from "../lib/curveTenors";

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

/** Levels in the table: one decimal from 100 up, two between 10 and 100, the instrument's own below 10 (FX crosses). */
const lvlDec = (v: number | null | undefined, d: number) => (v == null ? d : Math.abs(v) >= 100 ? Math.min(d, 1) : Math.abs(v) >= 10 ? Math.min(d, 2) : d);

/** Table cells are narrow: moves of 100% or 100bp and more drop one decimal so the figure is never cut off
 *  (the base level stays in the cell's tooltip). */
const cellPct = (v: number | null | undefined) => (v != null && Math.abs(v) >= 100 ? fmtPct(v, 1) : fmtPct(v));
const cellBp = (v: number | null | undefined) => (v != null && Math.abs(v) >= 1 ? `${v > 0 ? "+" : ""}${Math.round(v * 100)}bp` : fmtChg(v, 3, true));

/** One table (Shota): the level only as of now, every window as a % change, then σ 1M, 52-week position and
 *  distance to the 200-day average. The asset class is the section bar, not a column. */
function MarketsTable({ rows }: { rows: TableRow[] }) {
  return <OneTable rows={[...rows].sort((a, b) => a.order - b.order)} />;
}
function OneTable({ rows }: { rows: TableRow[] }) {
  const groups = new Map<string, TableRow[]>();
  for (const r of rows) groups.set(r.cls, [...(groups.get(r.cls) ?? []), r]);
  return (
    <table className="mkt">
      <colgroup><col className="nm" /><col className="lv" />{PERIODS.map((p) => <col key={p.key} className="n" />)}<col className="n" /><col className="n" /><col className="n" /></colgroup>
      <thead>
        <tr>
          <th className="l">Name</th><th>Last</th>
          {PERIODS.map((p) => <th key={p.key} className={p.key === "d1" ? "grp" : ""} title={`Change from the close at the start of the ${p.label} window to the last print (bp for yields)`}>{p.label}</th>)}
          <th className="grp" title="Last print against the 21-session mean, in standard deviations">σ 1M</th><th title="Where the last print sits in the 52-week range (0 = low, 100 = high)">52w</th><th title="Last print against the 200-day average (% for prices, percentage points for yields)">vs 200d</th>
        </tr>
      </thead>
      <tbody>{[...groups.entries()].map(([cls, rs]) => <GroupRows key={cls} cls={cls} rs={rs} />)}</tbody>
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
      <tr className="cls"><td colSpan={5 + PERIODS.length}>{cls}</td></tr>
      {rs.map((r) => {
        const isRate = isYield(r);
        return (
          <tr key={r.symbol} className={r.live ? "live" : undefined} title={`${r.symbol} · last ${fmtStampSafe(r.lastAt)}${r.live ? " · market open" : ""}`}>
            <td className="l">{r.name}<Badges r={r} /></td>
            <td className="num"><Flash value={r.last}><b>{fmtNum(r.last, lvlDec(r.last, r.decimals))}</b></Flash></td>
            {PERIODS.map((p) => {
              const c = r.closes[p.key];
              const v = isRate ? (c != null && r.last != null ? r.last - c : null) : r.pct[p.key];
              return <td key={p.key} className={`num ${signCls(v)}${p.key === "d1" ? " grp" : ""}`} style={{ background: changeShade(v, isRate ? 0.5 : 10) }} title={c != null ? `from ${fmtNum(c, lvlDec(c, r.decimals))} on ${r.closeDates[p.key] ?? ""}` : ""}>{isRate ? cellBp(v) : cellPct(v)}</td>;
            })}
            <td className={`num grp ${signCls(r.z1m)}`} style={{ background: changeShade(r.z1m ?? null, 3) }}>{r.z1m == null ? "–" : `${r.z1m > 0 ? "+" : ""}${r.z1m.toFixed(1)}σ`}</td>
            <td className="num" style={{ background: r.pos52 == null ? undefined : levelShade(r.pos52, 0, 100) }}>{r.pos52 == null ? "–" : `${Math.round(r.pos52)}`}</td>
            <td className={`num ${signCls(r.vs200)}`} style={{ background: changeShade(r.vs200 ?? null, isRate ? 0.75 : 15) }}>{r.vs200 == null ? "–" : isRate ? fmtChg(r.vs200, 3, true) : fmtPct(r.vs200, 1)}</td>
          </tr>
        );
      })}
    </>
  );
}

function ChartGroup({ no, title, rows, period, tick, sigmaWindow, children }: { no: string; title: string; rows: TableRow[]; period: ChartPeriod; tick: number; sigmaWindow: SigmaWindow; children?: React.ReactNode }) {
  return (
    <Panel no={no} title={title} span={12} aux={`${rows.length} panels · ${period}`}>
      {children}
      {rows.length ? <TileGrid n={rows.length}>{rows.map((r) => <ChartPanel key={r.symbol} row={r} period={period} tick={tick} sigmaWindow={sigmaWindow} />)}</TileGrid> : <Empty title="No instruments in this group yet" />}
    </Panel>
  );
}

function CurvePanel({ period, tick }: { period: ChartPeriod; tick: number }) {
  const ago = period === "1D" || period === "1W" ? "1M" : period;
  const us = useApi<{ current: Curve | null; ghost: Curve | null }>("curve", { country: "US", ago }, tick);
  const jp = useApi<{ current: Curve | null; ghost: Curve | null }>("curve", { country: "JP", ago }, tick);
  const one = (label: string, raw: { current: Curve | null; ghost: Curve | null } | null, err: string | null) => {
    const d = raw ? { current: filterCurve(raw.current, "std"), ghost: filterCurve(raw.ghost, "std") } : null;
    return (
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
  };
  return <div className="cgrid two">{one("US TREASURY CURVE", us.data, us.error)}{one("JGB CURVE", jp.data, jp.error)}</div>;
}

export function MarketView({ tick }: { tick: number }) {
  const table = useApi<{ rows: TableRow[]; asOf: string }>("table", undefined, tick);
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [sigmaWindow, setSigmaWindow] = useState<SigmaWindow>("m12");
  const all = table.data?.rows ?? [];
  const rows = all.filter((r) => r.marketTab !== false);   // the curated table; every instrument keeps a chart below
  const compact = typeof document !== "undefined" && document.body.classList.contains("term");   // one screen: charts for the table set only
  const by = (g: string) => (compact ? rows : all).filter((r) => r.group === g && r.chart !== false).sort((a, b) => a.order - b.order);
  const selector = <PeriodBar period={period} onPeriod={setPeriod} sigmaWindow={sigmaWindow} onSigmaWindow={setSigmaWindow} />;
  return (
    <>
      <Panel no="01" title="MARKETS" aux={table.data ? <>as of {fmtStampSafe(table.data.asOf)} · Yahoo Finance, US Treasury, MOF{DEV_MOCK && <span className="badge est">MOCK</span>}</> : table.error ? <span className="warn">{table.error}</span> : "loading…"}>
        {rows.length ? <MarketsTable rows={rows} /> : <Empty title="Awaiting the data feed">{table.error ?? "The market table fills once the Monitor backend is deployed and its first daily history run has completed."}</Empty>}
      </Panel>
      <div className="c12">{selector}</div>
      <ChartGroup no="02" title="EQUITIES" rows={by("equity")} period={period} tick={tick} sigmaWindow={sigmaWindow} />
      <ChartGroup no="03" title="RATES" rows={by("rates")} period={period} tick={tick} sigmaWindow={sigmaWindow}>
        <div className="mkt-curves">
          <div className="minih">Yield curves · today vs {period === "1D" || period === "1W" ? "1M" : period} ago</div>
          <CurvePanel period={period} tick={tick} />
          <div className="minih" style={{ marginTop: 8 }}>Yields</div>
        </div>
      </ChartGroup>
      <ChartGroup no="04" title="CURRENCY" rows={by("fx")} period={period} tick={tick} sigmaWindow={sigmaWindow} />
      <ChartGroup no="05" title="COMMODITIES" rows={by("cmdty")} period={period} tick={tick} sigmaWindow={sigmaWindow} />
    </>
  );
}
