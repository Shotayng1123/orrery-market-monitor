import { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { rollingBands, SIGMA_WINDOWS } from "../lib/stats";
import type { SeriesPoint } from "../lib/types";
import { fmtStamp, SGT } from "../lib/time";

// Orrery Analytics tile grammar: one line on black, green or red by the sign of the change, no axes.
// The σ corridors are thin monochrome lines, told apart by dash pattern (1M solid, 12M dashed, 36M dotted),
// with the rolling mean a little more visible. Intraday and hourly views space bars evenly (gaps collapsed,
// a short break at each session boundary), as on the Analytics tiles. Click-hold-drag pans the window back
// through the loaded history; double-click returns to the latest.
export const UP = "#3fd07e", DN = "#ff4d42", FLAT = "#b3afa4";
const SIG: Record<"m1" | "m12" | "m36", { stroke: string; dash?: number[] }> = { m1: { stroke: "rgba(232,229,222,0.30)" }, m12: { stroke: "rgba(232,229,222,0.24)", dash: [5, 4] }, m36: { stroke: "rgba(232,229,222,0.20)", dash: [1.5, 3] } };
const AXIS = { stroke: "#8a877e", grid: { stroke: "#141518", width: 1 }, ticks: { stroke: "#26272b", width: 1 }, font: "9.5px 'IBM Plex Mono', ui-monospace, monospace" };

export interface SigmaChartProps {
  points: SeriesPoint[];          // full series including history behind the window (for bands and panning)
  windowSec?: number;             // width of the visible window in seconds; defaults to the whole series
  intraday?: boolean;             // one-minute or hourly bars: evenly spaced, no bands, SGT labels
  decimals?: number;
  showTwoSigma?: boolean;
  height?: number;                // fixed height; ignored when fill is set
  fill?: boolean;                 // take the container's height (square and large tiles)
  axes?: boolean;                 // Analytics tiles have none; large charts may show them
  color?: string;                 // price line colour (UP / DN / FLAT)
  onReadout?: (r: { t: number; v: number; z1: number | null; z12: number | null; z36: number | null } | null) => void;
  onPan?: (offsetSec: number) => void;   // how far back the window has been dragged (0 = latest)
}

const nf = (d: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });

export function SigmaChart({ points, windowSec, intraday = false, decimals = 2, showTwoSigma = false, height = 160, fill = false, axes = false, color = FLAT, onReadout, onPan }: SigmaChartProps) {
  const el = useRef<HTMLDivElement>(null);

  // data: [x, price, (bands…)]; `ts` holds the real timestamp of every x (x is a bar index on intraday views)
  const prepared = useMemo(() => {
    let ts = points.map((p) => p.t), ys: Array<number | null> = points.map((p) => p.v);
    if (intraday && points.length > 2) {
      const diffs = ts.slice(1).map((t, i) => t - ts[i]).filter((d) => d > 0).sort((a, b) => a - b);
      const step = diffs[Math.floor(diffs.length / 2)] || 60;
      const bt: number[] = [], by: Array<number | null> = [];
      for (let i = 0; i < ts.length; i++) {
        if (i > 0 && ts[i] - ts[i - 1] > 4 * step) { bt.push(ts[i - 1] + step); by.push(null); }   // a one-slot break per session gap
        bt.push(ts[i]); by.push(ys[i]);
      }
      ts = bt; ys = by;
    }
    const xs = intraday ? ts.map((_, i) => i) : ts;
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
    return { data: cols as uPlot.AlignedData, ts };
  }, [points, intraday]);

  useEffect(() => {
    const box = el.current;
    const { data, ts } = prepared;
    if (!box || ts.length < 2) return;
    const fmt = nf(decimals);
    const series: uPlot.Series[] = [
      { value: (_u, v) => (v == null ? "" : String(v)) },
      { label: "px", stroke: color, width: 1.2, points: { show: false } },
    ];
    if (!intraday) {
      for (const w of SIGMA_WINDOWS) {
        const s = SIG[w.key];
        const d1 = s.dash ? [...s.dash] : undefined, d2 = s.dash ? [...s.dash] : [8, 4];
        series.push({ label: `${w.label}+1`, stroke: s.stroke, width: 0.8, dash: d1, points: { show: false } });
        series.push({ label: `${w.label}-1`, stroke: s.stroke, width: 0.8, dash: d1, points: { show: false } });
        series.push({ label: `${w.label}+2`, stroke: s.stroke, width: 0.6, dash: d2, points: { show: false }, show: showTwoSigma });
        series.push({ label: `${w.label}-2`, stroke: s.stroke, width: 0.6, dash: d2, points: { show: false }, show: showTwoSigma });
        series.push({ label: `${w.label} mean`, stroke: "rgba(232,229,222,0.55)", width: 1, dash: d1, points: { show: false } });
        series.push({ label: `${w.label} sd`, show: false });
      }
    }
    const axisFmt = (v: number) => (Math.abs(v) >= 1000 ? nf(0).format(v) : fmt.format(v));
    const ys = points.map((p) => p.v);
    const yMax = Math.max(...ys), yMin = Math.min(...ys);
    const axisSize = 12 + Math.max(axisFmt(yMax).length, axisFmt(yMin).length, 4) * 6;
    // the visible window: the bars within windowSec of the latest one; panning moves it by whole bars
    const xsAll = data[0] as number[];
    const nAll = xsAll.length, lastT = ts[nAll - 1];
    let i1 = nAll - 1, i0 = 0;
    if (windowSec) { i0 = i1; while (i0 > 0 && lastT - ts[i0 - 1] <= windowSec) i0--; }
    const winN = Math.max(1, i1 - i0);
    const hourly = intraday && (ts[nAll - 1] - ts[Math.max(0, nAll - 2)]) >= 1800;
    const xLabel = (x: number) => { const t = intraday ? ts[Math.min(nAll - 1, Math.max(0, Math.round(x)))] : x; if (t == null) return ""; return intraday ? fmtStamp(t * 1000, SGT).replace(" SGT", "").slice(hourly ? 0 : 6) : new Date(t * 1000).toISOString().slice(0, 7); };
    const size = () => ({ width: box.clientWidth || 300, height: fill ? Math.max(60, box.clientHeight) : height });
    const opts: uPlot.Options = {
      ...size(),
      padding: axes ? [6, 8, 0, 0] : [4, 2, 4, 2],
      tzDate: (t) => uPlot.tzDate(new Date(t * 1e3), "UTC"),
      scales: { x: { time: !intraday, range: () => [xsAll[i0], xsAll[i1]] }, y: { range: (_u, min, max) => [min - (max - min) * 0.03, max + (max - min) * 0.03] } },
      axes: axes
        ? [{ ...AXIS, space: 80, ...(intraday ? { values: (_u, vals) => vals.map(xLabel) } : {}) }, { ...AXIS, size: axisSize, values: (_u, vals) => vals.map(axisFmt) }]
        : [{ show: false }, { show: false }],
      series,
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { show: false } },   // no cross-panel sync: only the panel under the pointer responds
      hooks: {
        setCursor: [(u) => {
          const i = u.cursor.idx;
          const v = i == null || i < 0 ? null : (u.data[1][i] as number | null);
          if (i == null || i < 0 || v == null) { onReadout?.(null); tip.style.display = "none"; return; }
          const z = (k: number) => { if (intraday) return null; const m = u.data[2 + k * 6 + 4][i] as number | null, s = u.data[2 + k * 6 + 5][i] as number | null; return m == null || s == null || s === 0 ? null : (v - m) / s; };
          onReadout?.({ t: ts[i], v, z1: z(0), z12: z(1), z36: z(2) });
          // the price at the pointer: time and level, plus the 1M σ distance on daily charts
          const when = intraday ? fmtStamp(ts[i] * 1000, SGT) : new Date(ts[i] * 1000).toISOString().slice(0, 10);
          const z1 = z(0);
          tip.textContent = `${when}  ${fmt.format(v)}${z1 == null ? "" : `  ${z1 >= 0 ? "+" : ""}${z1.toFixed(2)}σ`}`;
          tip.style.display = "block";
          const w = u.over.clientWidth, left = u.cursor.left ?? 0, top = u.cursor.top ?? 0;
          tip.style.left = `${left + 12 + tip.offsetWidth > w ? Math.max(0, left - 12 - tip.offsetWidth) : left + 12}px`;
          tip.style.top = `${Math.max(0, top - 26)}px`;
        }],
      },
    };
    const u = new uPlot(opts, data, box);
    const tip = document.createElement("div");
    tip.className = "ctip";
    tip.style.display = "none";
    u.over.appendChild(tip);
    const ro = new ResizeObserver(() => u.setSize(size()));
    ro.observe(box);

    const over = u.over;
    over.style.cursor = "grab";
    let drag: { x0: number; i1_0: number } | null = null;
    const apply = () => { u.setScale("x", { min: xsAll[i0], max: xsAll[i1] }); onPan?.(Math.round(lastT - ts[i1])); };
    const onDown = (e: MouseEvent) => { if (e.button !== 0) return; drag = { x0: e.clientX, i1_0: i1 }; over.style.cursor = "grabbing"; e.preventDefault(); };
    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      const pxW = u.bbox.width / devicePixelRatio;
      const dIdx = Math.round(((drag.x0 - e.clientX) / Math.max(1, pxW)) * winN);   // drag left = move the window back in time
      i1 = Math.min(nAll - 1, Math.max(winN, drag.i1_0 - dIdx)); i0 = i1 - winN; apply();
    };
    const onUp = () => { if (drag) { drag = null; over.style.cursor = "grab"; } };
    const onDbl = () => { i1 = nAll - 1; i0 = i1 - winN; apply(); };
    over.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    over.addEventListener("dblclick", onDbl);
    return () => { ro.disconnect(); over.removeEventListener("mousedown", onDown); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); over.removeEventListener("dblclick", onDbl); u.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, windowSec, intraday, decimals, showTwoSigma, height, fill, axes, color]);

  return <div className={`chartbox${fill ? " fill" : ""}`} ref={el} style={fill ? undefined : { height }} />;
}
