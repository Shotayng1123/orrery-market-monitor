import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { termMode } from "../lib/prefs";

/** The grid of chart tiles. In the scrolling layout the stylesheet lays it out (as many 300px columns as fit).
 *  In the one-screen layout the tiles share a fixed box, so the column count is chosen from the box's own
 *  size: the split that leaves the fewest empty slots with tiles closest to a 16:9 shape. Tiles in a short
 *  last row stretch, so the panel is always full and no tile is squeezed under its minimum. */
const GAP = 3, MIN_W = 96, MIN_H = 58, ASPECT = 1.8;
export function TileGrid({ n, className = "cgrid", children }: { n: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      if (!termMode() || n < 1) { setCols(null); return; }
      const W = el.clientWidth, H = el.clientHeight;
      let best = 1, bestScore = -1;
      for (let c = 1; c <= n; c++) {
        const rows = Math.ceil(n / c);
        const w = (W - GAP * (c - 1)) / c, h = (H - GAP * (rows - 1)) / rows;
        if (c > 1 && w < MIN_W) break;
        const a = w / Math.max(1, h);
        const score = (n / (c * rows)) * (Math.min(a, ASPECT) / Math.max(a, ASPECT)) * Math.min(1, h / MIN_H);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      setCols(best);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);
  return <div ref={ref} className={`${className}${cols ? " fit" : ""}`} style={cols ? ({ "--c": cols } as CSSProperties) : undefined}>{children}</div>;
}
