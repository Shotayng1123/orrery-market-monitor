import { useState } from "react";
import { SigmaChart } from "./SigmaChart";
import { useApi, DEV_MOCK } from "../lib/useApi";
import type { Series, TableRow } from "../lib/types";
import { fmtChg, fmtNum, fmtPct, signCls } from "../lib/fmt";
import { fmtStamp, SGT } from "../lib/time";
import { marketById } from "../lib/sessions";

export type ChartPeriod = "1D" | "1W" | "1M" | "3M" | "12M" | "36M";
export const CHART_PERIODS: ChartPeriod[] = ["1D", "1W", "1M", "3M", "12M", "36M"];
const PERIOD_KEY: Record<ChartPeriod, keyof TableRow["pct"]> = { "1D": "d1", "1W": "w1", "1M": "m1", "3M": "m3", "12M": "m12", "36M": "m36" };

/** One instrument: chart left, exact last price and the period change on the side, σ read-out on hover. */
export function ChartPanel({ row, period, tick, twoSigma }: { row: TableRow; period: ChartPeriod; tick: number; twoSigma: boolean }) {
  const s = useApi<Series & { shownFrom?: string }>("series", { symbol: row.symbol, range: period }, tick);
  const [rd, setRd] = useState<{ t: number; v: number; z1: number | null; z12: number | null; z36: number | null } | null>(null);
  const k = PERIOD_KEY[period];
  const isRate = row.group === "rates";
  const m = marketById(row.market);
  const points = s.data?.points ?? [];
  const shownFrom = s.data?.shownFrom ? Date.parse(s.data.shownFrom + "T00:00:00Z") / 1000 : undefined;
  const z = (x: number | null) => (x == null ? "–" : (x > 0 ? "+" : "") + x.toFixed(2) + "σ");
  return (
    <div className="mtile cp">
      <div className="lb">
        <span className="lbtxt" title={row.symbol}>{row.name}{row.proxyFor && <span className="badge proxy">PROXY</span>}{row.live && m && m.delayMin > 0 && <span className="badge delay">~{m.delayMin}m</span>}{DEV_MOCK && <span className="badge est">MOCK</span>}</span>
        <span className="asof" title="Source time of the last print">{row.lastAt ? fmtStamp(row.lastAt, SGT) : "–"}</span>
      </div>
      <div className="cpanel">
        <div>
          {points.length ? <SigmaChart points={points} shownFrom={shownFrom} intraday={period === "1D"} decimals={row.decimals} showTwoSigma={twoSigma} onReadout={setRd} /> : <div className="empty" style={{ minHeight: 190 }}>{s.error ?? (s.loading ? "loading…" : "no history yet")}</div>}
          <div className="rdout mut">
            {rd ? <>{new Date(rd.t * 1000).toISOString().slice(0, 10)} · {fmtNum(rd.v, row.decimals)} · 1M {z(rd.z1)} · 12M {z(rd.z12)} · 36M {z(rd.z36)}</> : <>&nbsp;</>}
          </div>
        </div>
        <div className="side">
          <span className="k">Last</span>
          <span className="px">{fmtNum(row.last, row.decimals)}</span>
          <span className="k">{period}</span>
          <span className={`pc ${signCls(row.pct[k])}`}>{isRate ? fmtChg(row.last != null && row.closes[k] != null ? row.last - row.closes[k]! : null, 3, true) : fmtPct(row.pct[k])}</span>
          <span className="k" title={row.closeDates[k] ?? ""}>{period} close</span>
          <span className="num mut">{fmtNum(row.closes[k], row.decimals)}</span>
        </div>
      </div>
    </div>
  );
}
