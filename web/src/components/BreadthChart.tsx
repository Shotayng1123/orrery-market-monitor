import { useEffect, useRef } from "react";
import uPlot from "uplot";

export interface BreadthRow { d: string; n: number; adv: number; dec: number; above50: number; above200: number; new_hi: number; new_lo: number }
const AXIS = { stroke: "#8a877e", grid: { stroke: "#141518", width: 1 }, ticks: { stroke: "#26272b", width: 1 }, font: "9.5px 'IBM Plex Mono', ui-monospace, monospace" };

/** Breadth over time: % of names above the 50- and 200-day averages and the advancers' share, 0–100. */
export function BreadthChart({ rows, height = 170 }: { rows: BreadthRow[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = el.current;
    if (!box || rows.length < 2) return;
    const xs = rows.map((r) => Date.parse(r.d + "T00:00:00Z") / 1000);
    const pc = (f: (r: BreadthRow) => number) => rows.map((r) => (r.n ? (f(r) / r.n) * 100 : null));
    // advancers are noisy day to day: a ten-session average reads as participation
    const advRaw = pc((r) => r.adv), adv: Array<number | null> = advRaw.map((_, i) => { const w = advRaw.slice(Math.max(0, i - 9), i + 1).filter((v): v is number => v != null); return w.length ? w.reduce((a, v) => a + v, 0) / w.length : null; });
    const data = [xs, pc((r) => r.above200), pc((r) => r.above50), adv] as uPlot.AlignedData;
    const opts: uPlot.Options = {
      width: box.clientWidth || 300, height,
      tzDate: (t) => uPlot.tzDate(new Date(t * 1e3), "UTC"),
      scales: { x: { time: true }, y: { range: [0, 100] } },
      axes: [{ ...AXIS, space: 70 }, { ...AXIS, size: 34, values: (_u, vals) => vals.map((v) => `${v}%`) }],
      series: [
        { value: (_u, v) => (v == null ? "" : new Date(v * 1000).toISOString().slice(0, 10)) },
        { label: "> 200d", stroke: "#1fd1c1", width: 1.2, points: { show: false } },
        { label: "> 50d", stroke: "#5aa7ff", width: 1, points: { show: false } },
        { label: "advancers 10d", stroke: "rgba(232,229,222,0.55)", width: 0.9, points: { show: false } },
      ],
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { show: false } },
    };
    const u = new uPlot(opts, data, box);
    const tip = document.createElement("div"); tip.className = "ctip"; tip.style.display = "none"; u.over.appendChild(tip);
    u.hooks.setCursor = [...(u.hooks.setCursor ?? []), (uu: uPlot) => {
      const i = uu.cursor.idx; if (i == null || i < 0) { tip.style.display = "none"; return; }
      const f = (k: number) => { const v = uu.data[k][i] as number | null; return v == null ? "–" : `${v.toFixed(0)}%`; };
      tip.textContent = `${rows[i].d}  >200d ${f(1)}  >50d ${f(2)}  adv 10d ${f(3)}`;
      tip.style.display = "block"; const w = uu.over.clientWidth, left = uu.cursor.left ?? 0, top = uu.cursor.top ?? 0;
      tip.style.left = `${left + 12 + tip.offsetWidth > w ? Math.max(0, left - 12 - tip.offsetWidth) : left + 12}px`; tip.style.top = `${Math.max(0, top - 26)}px`;
    }];
    const ro = new ResizeObserver(() => u.setSize({ width: box.clientWidth || 300, height }));
    ro.observe(box);
    return () => { ro.disconnect(); u.destroy(); };
  }, [rows, height]);
  return (
    <div>
      <div className="legend" style={{ padding: "0 0 2px" }}>
        <span><span className="sw" style={{ borderTop: "2px solid #1fd1c1" }} />above 200d</span>
        <span><span className="sw" style={{ borderTop: "2px solid #5aa7ff" }} />above 50d</span>
        <span><span className="sw" style={{ borderTop: "2px solid rgba(232,229,222,.6)" }} />advancers, 10-session average</span>
      </div>
      <div className="chartbox" ref={el} style={{ height }} />
    </div>
  );
}
