import { useState } from "react";
import { Empty } from "../components/Panel";
import { ChartPanel, CHART_PERIODS, type ChartPeriod } from "../components/ChartPanel";
import type { SigmaWindow } from "../components/SigmaChart";
import { Pick } from "../components/Pick";
import { Flash } from "../components/Flash";
import { openAsset } from "../components/CompanyCard";
import { Screen } from "../components/PhoneKit";
import { useApi, DEV_MOCK } from "../lib/useApi";
import { fmtNum, fmtPct, fmtChg, fmtStampSafe, isYield, signCls } from "./shared";
import { PERIODS, type PeriodKey, type TableRow } from "../lib/types";
import { marketById } from "../lib/sessions";
import { shortName } from "../lib/short";
import { cellBp, cellPct, CurvePanel, lvlDec } from "./Market";

/** MARKET for a phone (preview, lib/phone.ts; Shota, 17 Nov 2026). The same rows and figures as the desktop table,
 *  laid out for a phone instead of shrunk to fit one: a list by asset class with the name, the last level and one
 *  change (over the period picked at the top) at reading size, on rows a finger can hit. A tap opens the row: its
 *  chart, every period, the 1M σ, the 52-week position and the distance to the 200-day average, and a way to its page. */
const KEY: Record<ChartPeriod, PeriodKey> = { "1D": "d1", "1W": "w1", "1M": "m1", "3M": "m3", "12M": "m12", "36M": "m36" };

/** The move over a period as the table shows it: a % for prices, the difference in yield (bp) for rates. */
const move = (r: TableRow, k: PeriodKey): number | null => {
  if (!isYield(r)) return r.pct[k] ?? null;
  const c = r.closes[k];
  return c != null && r.last != null ? r.last - c : null;
};
const fmtMove = (r: TableRow, v: number | null) => (isYield(r) ? cellBp(v) : cellPct(v));
const level = (r: TableRow) => `${fmtNum(r.last, lvlDec(r.last, r.decimals))}${isYield(r) && r.last != null ? "%" : ""}`;

function Status({ r }: { r: TableRow }) {
  const m = marketById(r.market);
  return (
    <span className="mp-st">
      {r.live ? (m && m.delayMin > 0 ? <span className="delay" title={`${m.name} feed is delayed about ${m.delayMin} minutes`}>Delayed {m.delayMin}m</span> : <span className="live">Live</span>) : <span>Closed</span>}
      {r.proxyFor && <span title={`${r.name} stands in for ${r.proxyFor}`}>via {r.symbol}</span>}
    </span>
  );
}

/** The height of a chart that heads a tab (the index on EQUITIES), in px: about a third of the screen, between
 *  240 and 340. Shota, 19 Nov 2026: at the 150px of a line opened in a list it was too small to read. Measured once,
 *  when the page loads: a phone's browser changes the window's height as its bars slide away, and a chart that
 *  followed it would be rebuilt in the middle of a scroll. */
const HEAD_CHART = Math.round(Math.min(340, Math.max(240, (typeof window === "undefined" ? 700 : window.innerHeight) * 0.34)));

function Detail({ r, period, tick, sigmaWindow, head = false }: { r: TableRow; period: ChartPeriod; tick: number; sigmaWindow?: SigmaWindow; head?: boolean }) {
  const rate = isYield(r);
  return (
    <div className="mp-det">
      <div className="mp-full">{r.name} · {r.symbol} · last print {fmtStampSafe(r.lastAt)}</div>
      <ChartPanel row={r} period={period} tick={tick} sigmaWindow={sigmaWindow} axes chartHeight={head ? HEAD_CHART : undefined} />
      <div className="mp-grid">
        {PERIODS.map((p) => { const v = move(r, p.key); return <div key={p.key} className={p.label === period ? "cur" : undefined}><span className="k">{p.label}</span><span className={`v ${signCls(v)}`}>{fmtMove(r, v)}</span></div>; })}
      </div>
      <div className="mp-grid">
        <div title="Last print against the 21-session mean, in standard deviations"><span className="k">σ 1M</span><span className={`v ${signCls(r.z1m)}`}>{r.z1m == null ? "–" : `${r.z1m > 0 ? "+" : ""}${r.z1m.toFixed(1)}σ`}</span></div>
        <div title="Where the last print sits in the 52-week range (0 = low, 100 = high)"><span className="k">52-week range</span><span className="v">{r.pos52 == null ? "–" : Math.round(r.pos52)}</span>{r.pos52 != null && <span className="bar"><i style={{ left: `${Math.max(0, Math.min(100, r.pos52))}%` }} /></span>}</div>
        <div title="Last print against the 200-day average"><span className="k">vs 200-day</span><span className={`v ${signCls(r.vs200)}`}>{r.vs200 == null ? "–" : rate ? fmtChg(r.vs200, 3, true) : fmtPct(r.vs200, 1)}</span></div>
      </div>
      <button type="button" className="mp-more" onClick={() => openAsset(r.symbol)}>Open {shortName(r.symbol, r.name)}'s page &#8250;</button>
    </div>
  );
}

/** One instrument as a line: name and status, the last level, the change over `period`. Opened, it shows the chart,
 *  every period and the statistics under the line. `fixed` keeps it open and makes the line a plain heading (the
 *  index at the top of EQUITIES). Shared by every phone tab that lists instruments from the market table. */
export function InstrumentRow({ r, period, tick, open, onToggle, fixed = false, sigmaWindow }: { r: TableRow; period: ChartPeriod; tick: number; open: boolean; onToggle?: () => void; fixed?: boolean; sigmaWindow?: SigmaWindow }) {
  const v = move(r, KEY[period]);
  const line = <><span className="mp-nm"><span className="n">{shortName(r.symbol, r.name)}</span><Status r={r} /></span><span className="mp-px"><Flash value={r.last}>{level(r)}</Flash></span><span className={`mp-chg ${signCls(v)}`}>{fmtMove(r, v)}</span></>;
  return (
    <div className={`mp-item${open || fixed ? " open" : ""}`}>
      {fixed ? <div className="mp-row fixed">{line}</div> : <button type="button" className="mp-row" aria-expanded={open} onClick={onToggle}>{line}</button>}
      {(open || fixed) && <Detail r={r} period={period} tick={tick} sigmaWindow={sigmaWindow} head={fixed} />}
    </div>
  );
}

export function MarketPhone({ tick }: { tick: number }) {
  const table = useApi<{ rows: TableRow[]; asOf: string }>("table", undefined, tick);
  const [period, setPeriod] = useState<ChartPeriod>("1D");
  const [open, setOpen] = useState<string | null>(null);
  const rows = (table.data?.rows ?? []).filter((r) => r.marketTab !== false).sort((a, b) => a.order - b.order);   // the curated table set
  const groups = new Map<string, TableRow[]>();
  for (const r of rows) groups.set(r.cls, [...(groups.get(r.cls) ?? []), r]);
  return (
    <Screen title="Markets"
      sub={<>{table.data ? <>as of {fmtStampSafe(table.data.asOf)}</> : table.error ? <span className="warn">{table.error}</span> : "loading…"}{DEV_MOCK && <span className="badge est">MOCK</span>}</>}
      right={<Pick label="Change" value={period} options={CHART_PERIODS} onChange={setPeriod} title="The change shown on every line: from the close at the start of this period to the last print (bp for yields)" />}>
      {rows.length ? [...groups.entries()].map(([cls, rs]) => (
        <section key={cls} className="mp-sec">
          <h2>{cls}</h2>
          <div className="mp-card">
            {rs.map((r) => {
              const isOpen = open === r.symbol;
              return <InstrumentRow key={r.symbol} r={r} period={period} tick={tick} open={isOpen} onToggle={() => setOpen(isOpen ? null : r.symbol)} />;
            })}
          </div>
        </section>
      )) : <Empty title="Awaiting the data feed">{table.error ?? "The market list fills once the first prices arrive."}</Empty>}
      {rows.length > 0 && (
        <section className="mp-sec">
          <h2>Yield curves</h2>
          <div className="mp-card pad"><CurvePanel period={period} tick={tick} /></div>
        </section>
      )}
      <p className="mp-src">Yahoo Finance, US Treasury, Japan MOF. Delayed and stand-in feeds are marked on their line.</p>
    </Screen>
  );
}
