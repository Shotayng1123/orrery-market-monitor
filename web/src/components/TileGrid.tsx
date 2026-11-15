import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { termMode } from "../lib/prefs";

/** The grid of chart tiles. In the scrolling layout the stylesheet lays it out (as many 300px columns as fit).
 *  In the one-screen layout the tiles share a fixed box and are never drawn smaller than the tiles of the
 *  RATES panel on the MARKET tab (Shota: that size reads well). When every tile fits at that size, the column
 *  count is the split that leaves the fewest empty slots with tiles closest to a 16:9 shape, and the tiles
 *  fill the box. When they do not fit, the tiles keep the reference size, whole rows fill the box and the
 *  rest scrolls inside the panel.
 *  `rows` + `group` (MARKET tab): the panel shows exactly `rows` rows and every grid of the same group uses
 *  one tile size, the smallest any of them can give, so all the tiles on the tab are identical (Shota: every
 *  tile the size of UST 2Y yield). */
const GAP = 3, MIN_W = 150, MIN_H = 78, REF_W = 232, ASPECT = 1.8;   // REF_W x ~105 is the RATES tile at 1440 x 800; MIN_H keeps two rows in a short panel

const groups = new Map<string, Map<object, number>>();
const listeners = new Set<() => void>();
const groupMin = (g: string): number | null => { const m = groups.get(g); return m && m.size ? Math.min(...m.values()) : null; };
function report(g: string, key: object, h: number | null) {
  let m = groups.get(g);
  if (!m) groups.set(g, (m = new Map()));
  if (h == null) { if (!m.delete(key)) return; } else { if (m.get(key) === h) return; m.set(key, h); }
  listeners.forEach((f) => f());
}

export function TileGrid({ n, className = "cgrid", rows, group, children }: { n: number; className?: string; rows?: number; group?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = useRef({});
  const [lay, setLay] = useState<{ cols: number; rowH: number; scroll: boolean } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const me = key.current;
    const fit = () => {
      if (!termMode() || n < 1) { if (group) report(group, me, null); setLay(null); return; }
      const W = el.clientWidth, H = el.clientHeight;
      if (rows && group) {                                        // a fixed number of rows, one tile size for the whole group
        const cols = Math.max(1, Math.min(n, Math.floor(W / REF_W + 0.5)));
        report(group, me, Math.floor((H - GAP * (rows - 1)) / rows));
        const rowH = Math.max(40, groupMin(group) ?? MIN_H);
        setLay((p) => (p && p.cols === cols && p.rowH === rowH && p.scroll ? p : { cols, rowH, scroll: true }));
        return;
      }
      let best = 0, bestScore = -1;
      for (let c = 1; c <= n; c++) {
        const r = Math.ceil(n / c);
        const w = (W - GAP * (c - 1)) / c, h = (H - GAP * (r - 1)) / r;
        if (c > 1 && w < MIN_W) break;
        if (h < MIN_H) continue;                                  // would squeeze the tiles: not a fit
        const a = w / Math.max(1, h);
        const score = (n / (c * r)) * (Math.min(a, ASPECT) / Math.max(a, ASPECT));
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (best) {                                                 // everything fits: equal rows that fill the box
        const r = Math.ceil(n / best), rowH = Math.floor((H - GAP * (r - 1)) / r);
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
    if (group) listeners.add(fit);
    return () => { ro.disconnect(); listeners.delete(fit); if (group) report(group, me, null); };
  }, [n, rows, group]);
  const style = lay ? ({ "--c": lay.cols, "--rh": `${lay.rowH}px` } as CSSProperties) : undefined;
  return <div ref={ref} className={`${className}${lay ? " fit" : ""}${lay?.scroll ? " scroll" : ""}`} style={style}>{children}</div>;
}
