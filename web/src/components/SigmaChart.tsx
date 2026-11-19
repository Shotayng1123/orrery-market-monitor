import { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import { AXIS as SHARED_AXIS, boxHeight, insideEl, zoomMove } from "../lib/chart";
import { termMode, zoomNow } from "../lib/prefs";
import "uplot/dist/uPlot.min.css";
import { rollingBands } from "../lib/stats";
import type { SeriesPoint } from "../lib/types";
import { fmtStamp, SGT } from "../lib/time";

// Orrery Analytics tile grammar: one line on black, green or red by the sign of the change, no axes.
// The σ corridors are thin monochrome lines, told apart by dash pattern (1M solid, 12M dashed, 36M dotted),
// with the rolling mean a little more visible. Intraday and hourly views space bars evenly (gaps collapsed,
// a short break at each session boundary), as on the Analytics tiles. Click, hold and drag: the chart follows
// the hand, so dragging it to the right brings the earlier history in; double-click returns to the latest.
export const UP = "#3fd07e", DN = "#ff4d42", FLAT = "#b3afa4";
export type SigmaWindow = "m1" | "m12" | "m36";
const WIN_DAYS: Record<SigmaWindow, number> = { m1: 21, m12: 252, m36: 756 };
const S1 = "rgba(90,167,255,0.85)", S2 = "rgba(255,197,61,0.80)", MEAN = "rgba(232,229,222,0.65)";   // ±1σ blue, ±2σ yellow, mean grey
const VOL = "rgba(179,175,164,0.30)";   // volume bars: a quiet grey along the foot of the chart
const VOL_SHARE = 0.2;                  // the tallest bar in view takes a fifth of the chart's height
/** Compact count for a volume: 1.23bn, 45.6m, 789k. */
export const fmtVol = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? "–" : v >= 1e9 ? `${(v / 1e9).toFixed(2)}bn` : v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}m` : v >= 1e3 ? `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}k` : String(Math.round(v)));
const AXIS = SHARED_AXIS;

/** A mark on the chart: a small circle on the close of day `t` (Unix seconds, any time that day), green for a
 *  rise and red for a fall. Pointing at it (or tapping it) shows `title` and then each item: what moved, and
 *  why. Daily charts only. */
export interface ChartMark { t: number; dir: 1 | -1; small?: boolean; title: string; items: Array<{ text: string; why: string }> }
const MARK_R = 4.5, MARK_R_SMALL = 3.4;   // a circle's radius in CSS pixels; the smaller one is a smaller peak or bottom

export interface SigmaChartProps {
  points: SeriesPoint[];          // full series including history behind the window (for bands and panning)
  windowSec?: number;             // width of the visible window in seconds; defaults to the whole series
  intraday?: boolean;             // one-minute or hourly bars: evenly spaced, no bands, SGT labels
  decimals?: number;
  sigmaWindow?: SigmaWindow;      // the one rolling window drawn: mean, ±1σ and ±2σ
  height?: number;                // fixed height; ignored when fill is set
  fill?: boolean;                 // take the container's height (square and large tiles)
  axes?: boolean;                 // Analytics tiles have none; large charts may show them
  color?: string;                 // price line colour (UP / DN / FLAT)
  volume?: boolean;               // draw the bars' volumes (points[].q) along the foot of the chart
  marks?: ChartMark[];            // big moves and the like, as circles on the line (daily charts only)
  onReadout?: (r: { t: number; v: number; z: number | null; q?: number | null } | null) => void;
  onPan?: (offsetSec: number) => void;   // how far back the window has been dragged (0 = latest)
}

const nf = (d: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });

export function SigmaChart({ points, windowSec, intraday = false, decimals = 2, sigmaWindow = "m12", height = 160, fill = false, axes = false, color = FLAT, volume = false, marks, onReadout, onPan }: SigmaChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const panRef = useRef(0);   // bars back from the latest, kept across rebuilds
  // The marks as their content, not as the array they arrive in. A page hands over a fresh array on every one of
  // its renders, and the Monitor renders once a second for its countdown: keyed on the array, the chart was
  // rebuilt every second, and a mark's card opened by a tap was gone again at once (Shota, 19 Nov 2026).
  const marksKey = useMemo(() => JSON.stringify(marks ?? null), [marks]);
  const marksRef = useRef(marks); marksRef.current = marks;
  const pinRef = useRef<string | null>(null);   // the mark a tap has opened (its day and direction), kept across rebuilds

  // data: [x, price, (bands…), (volume)]; `ts` holds the real timestamp of every x (x is a bar index on intraday
  // views). Volume, when drawn, is always the last column, so the columns before it keep their places.
  const hasVol = volume && points.some((p) => p.q != null && p.q > 0);
  const prepared = useMemo(() => {
    let ts = points.map((p) => p.t), ys: Array<number | null> = points.map((p) => p.v), qs: Array<number | null> = points.map((p) => p.q ?? null);
    if (intraday && points.length > 2) {
      const diffs = ts.slice(1).map((t, i) => t - ts[i]).filter((d) => d > 0).sort((a, b) => a - b);
      const step = diffs[Math.floor(diffs.length / 2)] || 60;
      const bt: number[] = [], by: Array<number | null> = [], bq: Array<number | null> = [];
      for (let i = 0; i < ts.length; i++) {
        if (i > 0 && ts[i] - ts[i - 1] > 4 * step) { bt.push(ts[i - 1] + step); by.push(null); bq.push(null); }   // a one-slot break per session gap
        bt.push(ts[i]); by.push(ys[i]); bq.push(qs[i]);
      }
      ts = bt; ys = by; qs = bq;
    }
    const xs = intraday ? ts.map((_, i) => i) : ts;
    const cols: Array<Array<number | null>> = [xs, ys];
    if (!intraday) {
      const { mean, sd } = rollingBands(ys, WIN_DAYS[sigmaWindow]);
      cols.push(mean.map((m, i) => (m == null || sd[i] == null ? null : m + sd[i]!)));
      cols.push(mean.map((m, i) => (m == null || sd[i] == null ? null : m - sd[i]!)));
      cols.push(mean.map((m, i) => (m == null || sd[i] == null ? null : m + 2 * sd[i]!)));
      cols.push(mean.map((m, i) => (m == null || sd[i] == null ? null : m - 2 * sd[i]!)));
      cols.push(mean); cols.push(sd);
    }
    if (hasVol) cols.push(qs);
    return { data: cols as uPlot.AlignedData, ts };
  }, [points, intraday, sigmaWindow, hasVol]);

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
      series.push({ label: "+1σ", stroke: S1, width: 0.7, points: { show: false } });
      series.push({ label: "-1σ", stroke: S1, width: 0.7, points: { show: false } });
      series.push({ label: "+2σ", stroke: S2, width: 0.7, dash: [4, 3], points: { show: false } });
      series.push({ label: "-2σ", stroke: S2, width: 0.7, dash: [4, 3], points: { show: false } });
      series.push({ label: "mean", stroke: MEAN, width: 0.9, points: { show: false } });
      series.push({ label: "sd", show: false });
    }
    const volAt = hasVol ? series.length : -1;   // the volume column's place in the data
    if (hasVol) series.push({ label: "vol", scale: "vol", stroke: "rgba(0,0,0,0)", fill: VOL, width: 0, paths: uPlot.paths.bars!({ size: [0.7, 14] }), points: { show: false } });
    const axisFmt = (v: number) => (Math.abs(v) >= 1000 ? nf(0).format(v) : fmt.format(v));
    const ys = points.map((p) => p.v);
    const yMax = Math.max(...ys), yMin = Math.min(...ys);
    const axisSize = 16 + Math.max(axisFmt(yMax).length, axisFmt(yMin).length, 4) * 7.3;   // 12px mono digits are 7.2px wide; room for the tick and gap
    // the visible window: the bars within windowSec of the latest one; panning moves it by whole bars
    const xsAll = data[0] as number[];
    const nAll = xsAll.length, lastT = ts[nAll - 1];
    // each mark sits on the bar of its day (a day with no bar, a holiday or one outside the history, has none)
    const dayAt = new Map<number, number>(); if (!intraday) ts.forEach((t, i) => dayAt.set(Math.floor(t / 86400), i));
    const placed = (intraday ? [] : marksRef.current ?? []).map((m) => ({ m, i: dayAt.get(Math.floor(m.t / 86400)) })).filter((x): x is { m: ChartMark; i: number } => x.i != null && data[1][x.i] != null);
    let i1 = nAll - 1, i0 = 0;
    if (windowSec) { i0 = i1; while (i0 > 0 && lastT - ts[i0 - 1] <= windowSec) i0--; }
    // never a window of one bar: uPlot cannot divide an axis of zero width into ticks ("Invalid array length").
    // It happens for the first bar of a session on 1D, and for the moment a daily history is still held after
    // the period is switched to 1D (found 17 Nov 2026 on the charts that show axes).
    if (i0 >= i1) i0 = i1 - 1;
    const winN = Math.max(1, i1 - i0);
    const hourly = intraday && (ts[nAll - 1] - ts[Math.max(0, nAll - 2)]) >= 1800;
    const xLabel = (x: number) => { const t = intraday ? ts[Math.min(nAll - 1, Math.max(0, Math.round(x)))] : x; if (t == null) return ""; return intraday ? fmtStamp(t * 1000, SGT).replace(" SGT", "").slice(hourly ? 0 : 6) : new Date(t * 1000).toISOString().slice(0, 7); };
    const size = () => ({ width: box.clientWidth || 300, height: fill ? Math.max(termMode() ? 24 : 60, box.clientHeight) : boxHeight(box, height) });
    const opts: uPlot.Options = {
      ...size(),
      padding: axes ? [6, 8, 0, 0] : [4, 2, 4, 2],
      tzDate: (t) => uPlot.tzDate(new Date(t * 1e3), "UTC"),
      scales: { x: { time: !intraday, range: () => [xsAll[i0], xsAll[i1]] }, y: { range: (_u, min, max) => { const pad = (max - min) * 0.03 || Math.abs(max) * 0.002 || 1; return [min - pad, max + pad]; } },   // a flat window still gets a height
        ...(hasVol ? { vol: { range: (_u: uPlot, _min: number, max: number) => [0, (max > 0 ? max : 1) / VOL_SHARE] as [number, number] } } : {}) },
      axes: axes
        ? [{ ...AXIS, space: 80, ...(intraday ? { values: (_u, vals) => vals.map(xLabel) } : {}) }, { ...AXIS, size: axisSize, values: (_u, vals) => vals.map(axisFmt) }]
        : [{ show: false }, { show: false }],
      series,
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { show: false }, move: zoomMove },   // no cross-panel sync: only the panel under the pointer responds
      hooks: {
        draw: [(u) => {
          if (!placed.length) return;
          const g = u.ctx, pr = devicePixelRatio || 1, x0 = u.scales.x.min ?? -Infinity, x1 = u.scales.x.max ?? Infinity;
          g.save();
          for (const { m, i } of placed) {
            const xv = xsAll[i]; if (xv < x0 || xv > x1) continue;
            g.beginPath(); g.arc(u.valToPos(xv, "x", true), u.valToPos(data[1][i] as number, "y", true), (m.small ? MARK_R_SMALL : MARK_R) * pr, 0, Math.PI * 2);
            g.fillStyle = m.dir > 0 ? UP : DN; g.fill(); g.lineWidth = (m.small ? 1 : 1.5) * pr; g.strokeStyle = "#0b0b0c"; g.stroke();
          }
          g.restore();
        }],
        setCursor: [(u) => {
          // near a mark: its own read-out (what moved, and why) instead of the price at the pointer
          const hit = pinned ?? markNear(u.cursor.left ?? -99, u.cursor.top ?? -99, 9);
          if (hit) { showMark(hit); tip.style.display = "none"; onReadout?.(null); return; }
          hideMark();
          const i = u.cursor.idx;
          const v = i == null || i < 0 ? null : (u.data[1][i] as number | null);
          if (i == null || i < 0 || v == null) { onReadout?.(null); tip.style.display = "none"; return; }
          const zsel = (() => { if (intraday) return null; const m = u.data[6][i] as number | null, s = u.data[7][i] as number | null; return m == null || s == null || s === 0 ? null : (v - m) / s; })();
          const q = volAt < 0 ? null : (u.data[volAt][i] as number | null);
          onReadout?.({ t: ts[i], v, z: zsel, q });
          // the price at the pointer: time and level, plus the σ distance of the selected window on daily charts
          const when = intraday ? fmtStamp(ts[i] * 1000, SGT) : new Date(ts[i] * 1000).toISOString().slice(0, 10);
          tip.textContent = `${when}  ${fmt.format(v)}${zsel == null ? "" : `  ${zsel >= 0 ? "+" : ""}${zsel.toFixed(2)}σ`}${q == null ? "" : `  vol ${fmtVol(q)}`}`;
          tip.style.display = "block";
          const w = u.over.clientWidth, left = u.cursor.left ?? 0, top = u.cursor.top ?? 0;
          tip.style.left = `${left + 12 + tip.offsetWidth > w ? Math.max(0, left - 12 - tip.offsetWidth) : left + 12}px`;
          tip.style.top = `${Math.max(0, top - 26)}px`;
        }],
      },
    };
    // the marks' read-out: a small card beside the circle. `pinned` is the mark a tap has opened (touch has no hover).
    // It is remembered in pinRef, so a chart rebuilt for fresh data opens the same card again.
    const pinKey = (x: { m: ChartMark }): string => `${x.m.t}|${x.m.dir}`;
    let pinned: { m: ChartMark; i: number } | null = null, uRef: uPlot | null = null;
    const pin = (x: { m: ChartMark; i: number } | null) => { pinned = x; pinRef.current = x ? pinKey(x) : null; };
    const card = document.createElement("div");
    card.className = "mvtip"; card.style.display = "none";
    const xy = (x: { i: number }) => (uRef ? { x: uRef.valToPos(xsAll[x.i], "x"), y: uRef.valToPos(data[1][x.i] as number, "y") } : { x: -99, y: -99 });
    const markNear = (left: number, top: number, reach: number) => {
      let best: { m: ChartMark; i: number } | null = null, bd = reach * reach;
      for (const x of placed) { const p = xy(x), d = (p.x - left) ** 2 + (p.y - top) ** 2; if (d <= bd) { bd = d; best = x; } }
      return best;
    };
    const showMark = (x: { m: ChartMark; i: number }) => {
      if (!uRef) return;
      card.replaceChildren();
      const add = (cls: string, text: string) => { const d = document.createElement("div"); d.className = cls; d.textContent = text; card.appendChild(d); };
      add(`t ${x.m.dir > 0 ? "up" : "dn"}`, x.m.title); for (const it of x.m.items) { add("l", it.text); add("w", it.why); }
      card.style.display = "block";
      const w = uRef.over.clientWidth, h = uRef.over.clientHeight, p = xy(x);
      card.style.maxWidth = `${Math.max(160, Math.min(300, w - 12))}px`;
      card.style.left = `${Math.max(0, Math.min(w - card.offsetWidth, p.x + 12 + card.offsetWidth > w ? p.x - 12 - card.offsetWidth : p.x + 12))}px`;
      card.style.top = `${Math.max(0, Math.min(h - card.offsetHeight, p.y - card.offsetHeight / 2))}px`;
    };
    const hideMark = () => { card.style.display = "none"; };
    const u = new uPlot(opts, data, box);
    uRef = u;
    const tip = document.createElement("div");
    tip.className = "ctip";
    tip.style.display = "none";
    u.over.appendChild(tip);
    u.over.appendChild(card);
    const ro = new ResizeObserver(() => u.setSize(size()));
    ro.observe(box);

    // panning with pointer events (mouse, pen and touch; the pointer is captured so the drag survives leaving the
    // tile). The offset from the latest bar is kept in a ref so a data refresh rebuilds the chart where it was.
    const over = u.over;
    over.style.cursor = "grab";
    over.style.touchAction = "none";
    const keep = panRef.current;
    if (keep > 0 && keep < nAll - winN) { i1 = nAll - 1 - keep; i0 = i1 - winN; u.setScale("x", { min: xsAll[i0], max: xsAll[i1] }); }
    // a card that was open before this rebuild opens again, if its mark is still on the chart and inside the view
    if (pinRef.current) {
      const again = placed.find((x) => pinKey(x) === pinRef.current);
      if (again && xsAll[again.i] >= xsAll[i0] && xsAll[again.i] <= xsAll[i1]) { pinned = again; showMark(again); } else pinRef.current = null;
    }
    let drag: { x0: number; y0: number; i1_0: number; id: number; moved: boolean } | null = null;
    const apply = () => { u.setScale("x", { min: xsAll[i0], max: xsAll[i1] }); panRef.current = nAll - 1 - i1; onPan?.(Math.round(lastT - ts[i1])); };
    const onDown = (e: PointerEvent) => { if (e.button !== 0 && e.pointerType === "mouse") return; drag = { x0: e.clientX, y0: e.clientY, i1_0: i1, id: e.pointerId, moved: false }; over.setPointerCapture?.(e.pointerId); over.style.cursor = "grabbing"; e.preventDefault(); };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (Math.abs(e.clientX - drag.x0) > 6 || Math.abs(e.clientY - drag.y0) > 6) { drag.moved = true; if (pinned) { pin(null); hideMark(); } }
      // The chart follows the hand (Shota, 19 Nov 2026): drag it to the right and the earlier bars come in from the
      // left; to the left and it comes forward again. The plot's width is taken in the pointer's own (screen)
      // pixels, so the bar that was grabbed stays under the pointer whatever the page's scale.
      const pxW = (over.clientWidth || u.bbox.width / devicePixelRatio) * zoomNow();
      const dIdx = Math.round(((e.clientX - drag.x0) / Math.max(1, pxW)) * winN);
      i1 = Math.min(nAll - 1, Math.max(winN, drag.i1_0 - dIdx)); i0 = i1 - winN; apply();
    };
    // a press that did not move is a tap: on a mark it opens that mark's read-out and keeps it open; elsewhere it closes it
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tap = !drag.moved && e.type === "pointerup";
      drag = null; over.style.cursor = "grab";
      if (!tap || !placed.length) return;
      const [mx, my] = insideEl(e.clientX, e.clientY, over.getBoundingClientRect(), over.offsetWidth, over.offsetHeight, zoomNow());
      const hit = markNear(mx, my, e.pointerType === "mouse" ? 9 : 22);
      pin(hit && hit !== pinned ? hit : null);
      if (pinned) { showMark(pinned); tip.style.display = "none"; } else hideMark();
    };
    const onDbl = () => { i1 = nAll - 1; i0 = i1 - winN; apply(); };
    over.addEventListener("pointerdown", onDown);
    over.addEventListener("pointermove", onMove);
    over.addEventListener("pointerup", onUp);
    over.addEventListener("pointercancel", onUp);
    over.addEventListener("dblclick", onDbl);
    return () => { ro.disconnect(); over.removeEventListener("pointerdown", onDown); over.removeEventListener("pointermove", onMove); over.removeEventListener("pointerup", onUp); over.removeEventListener("pointercancel", onUp); over.removeEventListener("dblclick", onDbl); u.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, windowSec, intraday, decimals, height, fill, axes, color, hasVol, marksKey]);

  return <div className={`chartbox${fill ? " fill" : ""}`} ref={el} style={fill ? undefined : { height }} />;
}
