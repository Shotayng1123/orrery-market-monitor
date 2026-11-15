import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { termMode } from "../lib/prefs";

/** The grid of chart tiles. In the scrolling layout the stylesheet lays it out (as many 300px columns as fit).
 *  In the one-screen layout the tiles share a fixed box and are never drawn smaller than the tiles of the
 *  RATES panel on the MARKET tab (Shota: that size reads well). When every tile fits at that size, the column
 *  count is the split that leaves the fewest empty slots with tiles closest to a 16:9 shape, and the tiles
 *  fill the box. When they do not fit, the tiles keep the reference size, whole rows fill the box and the
 *  rest scrolls inside the panel. */
const GAP = 3, MIN_W = 150, MIN_H = 78, REF_W = 232, ASPECT = 1.8;   // REF_W x ~105 is the RATES tile at 1440 x 800; MIN_H keeps two rows in a short panel
export function TileGrid({ n, className = "cgrid", children }: { n: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lay, setLay] = useState<{ cols: number; rowH: number; scroll: boolean } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      if (!termMode() || n < 1) { setLay(null); return; }
      const W = el.clientWidth, H = el.clientHeight;
      let best = 0, bestScore = -1;
      for (let c = 1; c <= n; c++) {
        const rows = Math.ceil(n / c);
        const w = (W - GAP * (c - 1)) / c, h = (H - GAP * (rows - 1)) / rows;
        if (c > 1 && w < MIN_W) break;
        if (h < MIN_H) continue;                                  // would squeeze the tiles: not a fit
        const a = w / Math.max(1, h);
        const score = (n / (c * rows)) * (Math.min(a, ASPECT) / Math.max(a, ASPECT));
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (best) {                                                 // everything fits: equal rows that fill the box
        const rows = Math.ceil(n / best), rowH = Math.floor((H - GAP * (rows - 1)) / rows);
        setLay((p) => (p && p.cols === best && p.rowH === rowH && !p.scroll ? p : { cols: best, rowH, scroll: false }));
        return;
      }
      // not everything fits: reference-size tiles, whole rows visible, the rest scrolls
      const cols = Math.max(1, Math.min(n, Math.floor(W / REF_W + 0.5)));
      const visible = Math.max(1, Math.floor((H + GAP) / (MIN_H + GAP)));
      const rowH = Math.max(MIN_H, Math.floor((H - GAP * (visible - 1)) / visible));
      setLay((p) => (p && p.cols === cols && p.rowH === rowH && p.scroll ? p : { cols, rowH, scroll: true }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);
  const style = lay ? ({ "--c": lay.cols, "--rh": `${lay.rowH}px` } as CSSProperties) : undefined;
  return <div ref={ref} className={`${className}${lay ? " fit" : ""}${lay?.scroll ? " scroll" : ""}`} style={style}>{children}</div>;
}
