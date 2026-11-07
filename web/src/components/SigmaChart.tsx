import { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { rollingBands, SIGMA_WINDOWS } from "../lib/stats";
import type { SeriesPoint } from "../lib/types";
import { SGT } from "../lib/time";

// Band colours (canvas needs literal colours; these match --s1m / --s12m / --s36m in tokens.css).
const BAND = { m1: "#1fd1c1", m12: "#ffc53d", m36: "#b08cff" } as const;
const AXIS = { stroke: "#b3afa4", grid: { stroke: "#1a1b1e", width: 1 }, ticks: { stroke: "#26272b", width: 1 }, font: "10px 'IBM Plex Mono', ui-monospace, monospace" };

export interface SigmaChartProps {
  points: SeriesPoint[];          // full series including the lookback needed by the longest band
  shownFrom?: number;             // epoch seconds; the x range starts here (bands are computed on everything before it too)
  intraday?: boolean;             // 1D view: no bands, time axis in SGT
  decimals?: number;
  showTwoSigma?: boolean;
  height?: number;
  onReadout?: (r: { t: number; v: number; z1: number | null; z12: number | null; z36: number | null } | null) => void;
  syncKey?: string;
}

const nf = (d: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });

export function SigmaChart({ points, shownFrom, intraday = false, decimals = 2, showTwoSigma = false, height = 190, onReadout, syncKey = "om" }: SigmaChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  const data = useMemo(() => {
    const xs = points.map((p) => p.t), ys = points.map((p) => p.v);
    const cols: Array<Array<number | null>> = [xs, ys];
    if (!intraday) {
      for (const w of SIGMA_WINDOWS) {
        const { mean, sd } = rollingBands(ys, w.days);
        cols.push(mean.map((m, i) => (m == null || sd[i] == null ? null : m + sd[i]!)));
        cols.push(mean.map((m, i) => (m == null || sd[i] == null ? null : m - sd[i]!)));
        cols.push(mean.map((m, i) => (m == null || sd[i] == null ? null : m + 2 * sd[i]!)));
        cols.push(mean.map((m, i) => (m == null || sd[i] == null ? null : m - 2 * sd[i]!)));
        cols.push(mean); cols.push(sd);
      }
    }
    return cols as uPlot.AlignedData;
  }, [points, intraday]);

  useEffect(() => {
    if (!el.current) return;
    const fmt = nf(decimals);
    const series: uPlot.Series[] = [
      { value: (_u, v) => (v == null ? "" : new Date(v * 1000).toISOString()) },
      { label: "px", stroke: "#e8e5de", width: 1.4, points: { show: false } },
    ];
    if (!intraday) {
      for (const w of SIGMA_WINDOWS) {
        const c = BAND[w.key];
        series.push({ label: `${w.label}+1`, stroke: c, width: 1, points: { show: false } });
        series.push({ label: `${w.label}-1`, stroke: c, width: 1, points: { show: false } });
        series.push({ label: `${w.label}+2`, stroke: c, width: 1, dash: [3, 3], points: { show: false }, show: showTwoSigma });
        series.push({ label: `${w.label}-2`, stroke: c, width: 1, dash: [3, 3], points: { show: false }, show: showTwoSigma });
        series.push({ label: `${w.label} mean`, show: false });   // kept in data for the readout
        series.push({ label: `${w.label} sd`, show: false });
      }
    }
    const tz = intraday ? SGT : "UTC";
    // y-axis labels: the instrument's decimals below 1,000, none above; the axis is as wide as its longest label
    const axisFmt = (v: number) => (Math.abs(v) >= 1000 ? nf(0).format(v) : fmt.format(v));
    const ys = points.map((p) => p.v);
    const yMax = ys.length ? Math.max(...ys) : 0, yMin = ys.length ? Math.min(...ys) : 0;
    const axisSize = 14 + Math.max(axisFmt(yMax).length, axisFmt(yMin).length, 4) * 6.4;
    const xRange: [number, number] | null = shownFrom && points.length ? [shownFrom, points[points.length - 1].t] : null;
    const opts: uPlot.Options = {
      width: el.current.clientWidth || 300,
      height,
      tzDate: (ts) => uPlot.tzDate(new Date(ts * 1e3), tz),
      scales: { x: { time: true, ...(xRange ? { range: () => xRange } : {}) }, y: { range: (_u, min, max) => [min - (max - min) * 0.04, max + (max - min) * 0.04] } },
      axes: [
        { ...AXIS, space: 70 },
        { ...AXIS, size: axisSize, values: (_u, vals) => vals.map(axisFmt) },
      ],
      series,
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { show: false }, sync: intraday ? undefined : { key: syncKey } },
      hooks: {
        setCursor: [(u) => {
          if (!onReadout) return;
          const i = u.cursor.idx;
          if (i == null || i < 0) { onReadout(null); return; }
          const t = u.data[0][i] as number, v = u.data[1][i] as number | null;
          if (v == null) { onReadout(null); return; }
          const z = (k: number) => { if (intraday) return null; const m = u.data[2 + k * 6 + 4][i] as number | null, s = u.data[2 + k * 6 + 5][i] as number | null; return m == null || s == null || s === 0 ? null : (v - m) / s; };
          onReadout({ t, v, z1: z(0), z12: z(1), z36: z(2) });
        }],
      },
    };
    const u = new uPlot(opts, data, el.current);
    plot.current = u;
    const ro = new ResizeObserver(() => { if (el.current) u.setSize({ width: el.current.clientWidth || 300, height }); });
    ro.observe(el.current);
    return () => { ro.disconnect(); u.destroy(); plot.current = null; };
    // the chart is rebuilt when the data or the options change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, shownFrom, intraday, decimals, showTwoSigma, height, syncKey]);

  return <div className="chartbox" ref={el} style={{ minHeight: height }} />;
}
