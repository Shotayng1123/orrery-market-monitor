import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import { boxHeight, zoomMove } from "../lib/chart";
import type { Curve } from "../lib/types";

const AXIS = { stroke: "#b3afa4", grid: { stroke: "#1a1b1e", width: 1 }, ticks: { stroke: "#26272b", width: 1 }, font: "12px 'IBM Plex Mono', ui-monospace, monospace" };
const Y_AXIS_PX = 52, PAD_RIGHT = 10, LABEL_PX = 30;
const MAJOR = [1 / 12, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 40];
export const shortTenor = (t: string) => t.replace(/\s*(Mo|Month)$/i, "M").replace(/\s*Yr$/i, "Y");

/** Yield curve: today's curve solid, the curve from the selected period ago translucent. Tenors are equidistant
 *  (ordinal x, as on a terminal curve screen); the tenor labels are drawn as HTML under the plot. */
export function CurveChart({ current, ghost, height = 190 }: { current: Curve; ghost: Curve | null; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const [plotW, setPlotW] = useState(0);   // width of the plot area under the labels, in layout pixels
  const pts = current.points;
  useEffect(() => {
    if (!el.current) return;
    const xs = pts.map((p) => p.years);
    const cur = pts.map((p) => p.yield);
    const gh = ghost ? xs.map((x) => { const p = ghost.points.find((q) => Math.abs(q.years - x) < 1e-9); return p ? p.yield : null; }) : null;
    const data = (gh ? [xs, cur, gh] : [xs, cur]) as uPlot.AlignedData;
    const tenorOf = (v: number) => { let best = pts[0]; for (const p of pts) if (Math.abs(p.years - v) < Math.abs(best.years - v)) best = p; return shortTenor(best.tenor); };
    const opts: uPlot.Options = {
      width: el.current.clientWidth || 300, height: boxHeight(el.current, height - 16, 40),
      padding: [8, PAD_RIGHT, 0, 0],
      scales: { x: { time: false, distr: 2 }, y: { range: (_u, min, max) => [min - (max - min) * 0.08, max + (max - min) * 0.08] } },
      axes: [
        { show: false },
        { ...AXIS, size: Y_AXIS_PX, values: (_u, vals) => vals.map((v) => v.toFixed(2)) },
      ],
      series: [
        { value: (_u, v) => (v == null ? "" : tenorOf(v)) },
        { label: current.date, stroke: "#e8e5de", width: 1.6, points: { show: true, size: 5, fill: "#e8e5de" } },
        ...(gh ? [{ label: ghost!.date, stroke: "rgba(255,111,97,0.55)", width: 1.4, dash: [4, 3], points: { show: true, size: 4, fill: "rgba(255,111,97,0.55)" } }] : []),
      ],
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { show: true }, move: zoomMove },
    };
    const u = new uPlot(opts, data, el.current);
    const measure = () => { if (el.current) setPlotW(Math.max(0, el.current.clientWidth - Y_AXIS_PX - PAD_RIGHT)); };
    measure();
    const ro = new ResizeObserver(() => { if (el.current) u.setSize({ width: el.current.clientWidth || 300, height: boxHeight(el.current, height - 16, 40) }); measure(); });
    ro.observe(el.current);
    return () => { ro.disconnect(); u.destroy(); };
  }, [current, ghost, height, pts]);
  const n = pts.length;
  const wanted = pts.map((p, i) => ({ p, i })).filter(({ p }) => n <= 10 || MAJOR.some((m) => Math.abs(m - p.years) < 1e-6));
  // keep the longest tenor, then every label that sits at least LABEL_PX to the left of the last one kept
  const labelled: typeof wanted = [];
  let lastX = Infinity;
  for (let k = wanted.length - 1; k >= 0; k--) {
    const x = plotW > 0 ? (wanted[k].i / Math.max(1, n - 1)) * plotW : wanted[k].i * LABEL_PX;
    if (lastX - x >= LABEL_PX) { labelled.unshift(wanted[k]); lastX = x; }
  }
  return (
    <div className="chartwrap">
      <div className="chartbox" ref={el} style={{ minHeight: height - 16 }} />
      <div className="curvex" style={{ marginLeft: Y_AXIS_PX, marginRight: PAD_RIGHT }}>
        {labelled.map(({ p, i }) => <span key={p.tenor} style={{ left: `${(i / Math.max(1, n - 1)) * 100}%` }}>{shortTenor(p.tenor)}</span>)}
      </div>
    </div>
  );
}

export function spread(c: Curve, a: number, b: number): number | null {
  const ya = c.points.find((p) => Math.abs(p.years - a) < 1e-9)?.yield, yb = c.points.find((p) => Math.abs(p.years - b) < 1e-9)?.yield;
  return ya == null || yb == null ? null : (yb - ya) * 100;
}
