import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";

export interface PolicyStep { bank: string; d: string; rate: number }
const COLORS: Record<string, string> = { FED: "#e8e5de", ECB: "#5aa7ff", BOE: "#ff6f61", BOJ: "#3fd07e", HKMA: "#b08cff", RBA: "#ffc53d", BOK: "#1fd1c1", PBOC: "#ff9f43", MAS: "#9aa8b8" };
const ORDER = ["FED", "ECB", "BOJ", "BOE", "RBA", "BOK", "HKMA", "PBOC"];
const AXIS = { stroke: "#8a877e", grid: { stroke: "#141518", width: 1 }, ticks: { stroke: "#26272b", width: 1 }, font: "9.5px 'IBM Plex Mono', ui-monospace, monospace" };

/** Thirty years of policy rates as step lines, one per central bank; click a legend chip to hide or show a bank. */
export function PolicyChart({ steps, height = 260 }: { steps: PolicyStep[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const banks = useMemo(() => ORDER.filter((b) => steps.some((s) => s.bank === b)), [steps]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const data = useMemo(() => {
    // union of all change dates plus today; each bank's value carried forward (step)
    const from = Date.now() / 1000 - 30 * 365.25 * 86400;
    const ts = [...new Set(steps.map((s) => Date.parse(s.d) / 1000))].filter((t) => t >= from - 400 * 86400).sort((a, b) => a - b);
    ts.push(Math.floor(Date.now() / 86400) * 86400);
    const cols: Array<Array<number | null>> = [ts];
    for (const b of banks) {
      const own = steps.filter((s) => s.bank === b).map((s) => ({ t: Date.parse(s.d) / 1000, v: s.rate })).sort((a, c) => a.t - c.t);
      let i = 0, cur: number | null = null;
      cols.push(ts.map((t) => { while (i < own.length && own[i].t <= t) { cur = own[i].v; i++; } return cur; }));
    }
    return { ts, cols: cols as uPlot.AlignedData };
  }, [steps, banks]);
  useEffect(() => {
    const box = el.current;
    if (!box || !banks.length) return;
    const from = Date.now() / 1000 - 30 * 365.25 * 86400;
    const opts: uPlot.Options = {
      width: box.clientWidth || 300, height,
      tzDate: (t) => uPlot.tzDate(new Date(t * 1e3), "UTC"),
      scales: { x: { time: true, range: () => [from, data.ts[data.ts.length - 1]] }, y: { range: (_u, min, max) => [Math.min(0, min) - 0.25, max + 0.25] } },
      axes: [{ ...AXIS, space: 70 }, { ...AXIS, size: 42, values: (_u, vals) => vals.map((v) => v.toFixed(1)) }],
      series: [{ value: (_u, v) => (v == null ? "" : new Date(v * 1000).toISOString().slice(0, 10)) }, ...banks.map((b) => ({ label: b, stroke: COLORS[b] ?? "#9aa8b8", width: b === "FED" ? 1.6 : 1.2, points: { show: false }, paths: uPlot.paths.stepped!({ align: 1 }), show: !hidden.has(b) }))],
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { show: false } },
    };
    const u = new uPlot(opts, data.cols, box);
    const tip = document.createElement("div"); tip.className = "ctip"; tip.style.display = "none"; u.over.appendChild(tip);
    u.hooks.setCursor = [...(u.hooks.setCursor ?? []), (uu: uPlot) => {
      const i = uu.cursor.idx; if (i == null || i < 0) { tip.style.display = "none"; return; }
      const parts = banks.map((b, k) => hidden.has(b) ? null : `${b} ${uu.data[k + 1][i] == null ? "–" : (uu.data[k + 1][i] as number).toFixed(2)}`).filter(Boolean);
      tip.textContent = `${new Date((uu.data[0][i] as number) * 1000).toISOString().slice(0, 10)}  ${parts.join("  ")}`;
      tip.style.display = "block"; const w = uu.over.clientWidth, left = uu.cursor.left ?? 0, top = uu.cursor.top ?? 0;
      tip.style.left = `${left + 12 + tip.offsetWidth > w ? Math.max(0, left - 12 - tip.offsetWidth) : left + 12}px`; tip.style.top = `${Math.max(0, top - 26)}px`;
    }];
    const ro = new ResizeObserver(() => u.setSize({ width: box.clientWidth || 300, height }));
    ro.observe(box);
    return () => { ro.disconnect(); u.destroy(); };
  }, [data, banks, hidden, height]);
  return (
    <div>
      <div className="chips" style={{ margin: "0 0 4px" }}>
        {banks.map((b) => <span key={b} className={`chip-sm${hidden.has(b) ? "" : " on"}`} style={hidden.has(b) ? undefined : { background: COLORS[b], borderColor: COLORS[b], color: "#000" }} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(b)) n.delete(b); else n.add(b); return n; })}>{b}</span>)}
        <span className="mut" style={{ marginLeft: 8, fontSize: 10 }}>30 years · step lines on change dates · click a bank to hide it</span>
      </div>
      <div className="chartbox" ref={el} style={{ height }} />
    </div>
  );
}
