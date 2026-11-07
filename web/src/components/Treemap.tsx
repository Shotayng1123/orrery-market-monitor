import { useEffect, useRef, useState } from "react";

// Squarified treemap (Bruls, Huizing, van Wijk) in two levels: sectors, then names. Tiles fill the box with
// no gaps; each tile's area is its market-cap share. Solid white text; the shade deepens with the day's move.
export interface TreeLeaf { id: string; label: string; name?: string; value: number; pct: number | null; title: string }
export interface TreeGroup { id: string; label: string; leaves: TreeLeaf[] }
interface Rect { x: number; y: number; w: number; h: number }

function squarify<T extends { value: number }>(items: T[], rect: Rect): Array<{ item: T; rect: Rect }> {
  const out: Array<{ item: T; rect: Rect }> = [];
  const total = items.reduce((a, i) => a + i.value, 0);
  if (!total || !items.length || rect.w <= 0 || rect.h <= 0) return out;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  let { x, y, w, h } = rect;
  const scale = (w * h) / total;
  let row: T[] = [], rowArea = 0;
  const worst = (r: T[], area: number, side: number) => { const s2 = side * side; let mx = 0, mn = Infinity; for (const i of r) { const a = i.value * scale; mx = Math.max(mx, a); mn = Math.min(mn, a); } return Math.max((s2 * mx) / (area * area), (area * area) / (s2 * mn)); };
  const layout = (r: T[], area: number) => {
    const horizontal = w >= h;                       // the row runs along the shorter side
    const side = horizontal ? h : w;
    const thick = side ? area / side : 0;
    let off = 0;
    for (const i of r) {
      const len = side ? (i.value * scale) / thick : 0;
      out.push({ item: i, rect: horizontal ? { x, y: y + off, w: thick, h: len } : { x: x + off, y, w: len, h: thick } });
      off += len;
    }
    if (horizontal) { x += thick; w -= thick; } else { y += thick; h -= thick; }
  };
  for (const i of sorted) {
    const side = Math.min(w, h);
    const a = i.value * scale;
    if (!row.length || worst([...row, i], rowArea + a, side) <= worst(row, rowArea, side)) { row.push(i); rowArea += a; }
    else { layout(row, rowArea); row = [i]; rowArea = a; }
  }
  if (row.length) layout(row, rowArea);
  return out;
}

const UP_RGB = "63,208,126", DN_RGB = "255,77,66";
const bg = (v: number | null) => (v == null ? "#2a2b30" : `rgba(${v >= 0 ? UP_RGB : DN_RGB},${(0.22 + Math.min(1, Math.abs(v) / 5) * 0.68).toFixed(3)})`);
const fmtP = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);

export function Treemap({ groups, height = 560, onEnter, onLeave, onClick }: { groups: TreeGroup[]; height?: number; onEnter?: (id: string, e: React.MouseEvent) => void; onLeave?: () => void; onClick?: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setWidth(el.clientWidth || 600)); ro.observe(el); setWidth(el.clientWidth || 600); return () => ro.disconnect(); }, []);
  const gs = groups.map((g) => ({ ...g, value: g.leaves.reduce((a, l) => a + l.value, 0) })).filter((g) => g.value > 0);
  const placed = squarify(gs, { x: 0, y: 0, w: width, h: height });
  return (
    <div className="tmap" ref={box} style={{ height }} onMouseLeave={onLeave}>
      {placed.map(({ item: g, rect }) => (
        <div className="tgrp" key={g.id} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
          {squarify(g.leaves, { x: 0, y: 0, w: rect.w, h: rect.h }).map(({ item: l, rect: r }) => {
            const fs = Math.max(8.5, Math.min(15, Math.sqrt(r.w * r.h) / 5.2));
            const big = r.w > 44 && r.h > 26, mid = r.w > 26 && r.h > 14;
            const text = l.name && r.w > fs * 0.62 * Math.min(l.name.length, 14) + 6 ? l.name : l.label;   // the company name when it fits, the code otherwise
            return (
              <span className={`tleaf${onClick ? " clk" : ""}`} key={l.id} style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: bg(l.pct) }} title={onEnter ? undefined : l.title}
                onMouseEnter={onEnter ? (e) => onEnter(l.id, e) : undefined} onMouseLeave={onLeave} onClick={onClick ? () => onClick(l.id) : undefined}>
                {mid && <b style={{ fontSize: fs }}>{text}</b>}
                {big && <i style={{ fontSize: Math.max(8, fs - 2) }}>{fmtP(l.pct)}</i>}
              </span>
            );
          })}
          {rect.w > 70 && rect.h > 40 && <span className="tglabel">{g.label}</span>}
        </div>
      ))}
    </div>
  );
}
