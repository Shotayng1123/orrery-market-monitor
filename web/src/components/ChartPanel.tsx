import { useState } from "react";
import { DN, FLAT, SigmaChart, UP } from "./SigmaChart";
import { useApi, DEV_MOCK } from "../lib/useApi";
import type { Series, TableRow } from "../lib/types";
import { fmtChg, fmtNum, fmtPct, signCls } from "../lib/fmt";
import { fmtStamp, SGT } from "../lib/time";
import { marketById } from "../lib/sessions";

export type ChartPeriod = "1D" | "1W" | "1M" | "3M" | "12M" | "36M";
export const CHART_PERIODS: ChartPeriod[] = ["1D", "1W", "1M", "3M", "12M", "36M"];
const PERIOD_KEY: Record<ChartPeriod, keyof TableRow["pct"]> = { "1D": "d1", "1W": "w1", "1M": "m1", "3M": "m3", "12M": "m12", "36M": "m36" };
/** Bar frequency by period (Shota): 1D one-minute bars, 1W and 1M hourly bars, 3M and longer daily closes.
 *  The σ corridors are rolling statistics of daily closes, so they are drawn on the daily charts only. */
export const INTRADAY = new Set<ChartPeriod>(["1D", "1W", "1M"]);
const DAY = 86400;
const WINDOW: Record<ChartPeriod, number> = { "1D": DAY, "1W": 7 * DAY, "1M": 31 * DAY, "3M": 93 * DAY, "12M": 366 * DAY, "36M": 1096 * DAY };

/** The visible window for 1D is the latest session: walk back from the last bar while the gap stays under 3 h. */
function sessionWindow(points: Array<{ t: number }>): number {
  if (points.length < 2) return DAY;
  let i = points.length - 1;
  while (i > 0 && points[i].t - points[i - 1].t < 3 * 3600) i--;
  return Math.max(30 * 60, points[points.length - 1].t - points[i].t + 5 * 60);
}

/** One instrument in the Analytics tile grammar: name row with the session tag and stamp, the price under
 *  the name, the period change under the price, then the chart. `shape` sets the tile proportions. */
export function ChartPanel({ row, period, tick, twoSigma, shape = "wide", axes = false }: { row: TableRow; period: ChartPeriod; tick: number; twoSigma: boolean; shape?: "wide" | "square" | "large"; axes?: boolean }) {
  const s = useApi<Series>("series", { symbol: row.symbol, range: period }, tick);
  const [rd, setRd] = useState<{ t: number; v: number; z1: number | null; z12: number | null; z36: number | null } | null>(null);
  const [pan, setPan] = useState(0);
  const k = PERIOD_KEY[period];
  const isRate = row.group === "rates";
  const m = marketById(row.market);
  const points = s.data?.points ?? [];
  const windowSec = period === "1D" ? sessionWindow(points) : WINDOW[period];
  const chg = isRate ? (row.last != null && row.closes[k] != null ? row.last - row.closes[k]! : null) : row.pct[k];
  const color = chg == null || chg === 0 ? FLAT : chg > 0 ? UP : DN;
  const z = (x: number | null) => (x == null ? "–" : (x > 0 ? "+" : "") + x.toFixed(2) + "σ");
  const stamp = row.lastAt ? fmtStamp(row.lastAt, SGT).replace(" SGT", "") : "–";
  const intraday = INTRADAY.has(period);
  const panLabel = pan > 0 ? `← ${pan >= DAY ? `${Math.round(pan / DAY)}d` : `${Math.round(pan / 3600)}h`} back · double-click = latest` : "";
  return (
    <div className={`mtile cp ${shape}${row.live ? " live" : ""}`}>
      <div className="lb">
        <span className="lbtxt" title={row.symbol}>{row.name}</span>
        {row.proxyFor && <span className="badge proxy" title={`${row.name} stands in for ${row.proxyFor}`}>PROXY</span>}
        {row.live && m && m.delayMin > 0 && <span className="badge delay" title={`${m.name} feed is delayed about ${m.delayMin} minutes`}>~{m.delayMin}m</span>}
        {DEV_MOCK && <span className="badge est">MOCK</span>}
        <span className="asof" title="Source time of the last print, Singapore time"><span className={`st${row.live ? " live" : ""}`}>{row.live ? "LIVE" : "CLOSED"}</span> {stamp}</span>
      </div>
      <div className="vl">{fmtNum(row.last, row.decimals)}{isRate && row.last != null ? "%" : ""}</div>
      <div className={`ch ${signCls(chg)}`}>{isRate ? fmtChg(chg, 3, true) : fmtPct(chg)} <span className="mut">{period}{row.closes[k] != null ? ` · from ${fmtNum(row.closes[k], row.decimals)}` : ""}</span></div>
      {points.length
        ? <SigmaChart points={points} windowSec={windowSec} intraday={intraday} decimals={row.decimals} showTwoSigma={twoSigma} onReadout={setRd} onPan={setPan} color={color} fill={shape !== "wide"} height={shape === "wide" ? 150 : undefined} axes={axes} />
        : <div className="chartbox empty" style={shape === "wide" ? { height: 150 } : undefined}>{s.error ?? (s.loading ? "loading…" : "no history yet")}</div>}
      <div className="rdout mut" title="Click, hold and drag the chart to move back in time; double-click to return to the latest">
        {rd ? (intraday ? <>{fmtStamp(rd.t * 1000, SGT)} · {fmtNum(rd.v, row.decimals)}</> : <>{new Date(rd.t * 1000).toISOString().slice(0, 10)} · {fmtNum(rd.v, row.decimals)} · 1M {z(rd.z1)} · 12M {z(rd.z12)} · 36M {z(rd.z36)}</>)
          : <span style={{ opacity: .6 }}>{panLabel || (period === "1D" ? "1-minute bars · drag to pan" : intraday ? "hourly bars · drag to pan" : "daily closes · σ corridors · drag to pan")}</span>}
      </div>
    </div>
  );
}
