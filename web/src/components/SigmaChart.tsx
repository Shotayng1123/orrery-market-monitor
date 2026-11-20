import { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import { AXIS as SHARED_AXIS, boxHeight, insideEl, TIME_VALUES, zoomMove } from "../lib/chart";
import { termMode, zoomNow } from "../lib/prefs";
import "uplot/dist/uPlot.min.css";
import { rollingBands } from "../lib/stats";
import type { SeriesPoint } from "../lib/types";
import { fmtDate, fmtDayTime, fmtStamp, SGT } from "../lib/time";
import { axisDecimals, fmtSigma } from "../lib/fmt";

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
 *  why. Daily charts only. An item that comes in parts (`word`, `fig`, `rest`: lib/stock.ts moveParts) is written
 *  with its figure in the colour of the figure's sign and the rest muted; the circle keeps its own colour (the
 *  designer's D-27). */
export interface ChartMark { t: number; dir: 1 | -1; small?: boolean; roll?: boolean /* a future's change of contract (B-27): a hollow grey diamond, not a move */; title: string; items: Array<{ text: string; why: string; pct?: number; word?: string | null; fig?: string; rest?: string }> }
const ROLL = "#c6c2b7";   // --txt2: a roll is no rise or fall, so neither green nor red
const MARK_R = 4.5, MARK_R_SMALL = 3.4;   // a circle's radius in CSS pixels; the smaller one is a smaller peak or bottom
const RING_MS = 2000, RING = "#e8e5de";   // a mark opened from the list (A-25) is ringed for two seconds

export interface SigmaChartProps {
  points: SeriesPoint[];          // full series including history behind the window (for bands and panning)
  windowSec?: number;             // width of the visible window in seconds; defaults to the whole series
  intraday?: boolean;             // one-minute or hourly bars: evenly spaced, no bands, SGT labels
  decimals?: number;              // the instrument's own (lib/fmt.ts); the axis uses no more than its ticks need
  pct?: boolean;                  // a yield: its level ends in "%" in the read-outs
  sigmaWindow?: SigmaWindow;      // the one rolling window drawn: mean, ±1σ and ±2σ
  height?: number;                // fixed height; ignored when fill is set
  fill?: boolean;                 // take the container's height (square and large tiles)
  axes?: boolean;                 // Analytics tiles have none; large charts may show them
  color?: string;                 // price line colour (UP / DN / FLAT)
  volume?: boolean;               // draw the bars' volumes (points[].q) along the foot of the chart
  marks?: ChartMark[];            // big moves and the like, as circles on the line (daily charts only)
  onReadout?: (r: { t: number; v: number; z: number | null; q?: number | null } | null) => void;
  onPan?: (offsetSec: number) => void;   // how far back the window has been dragged (0 = latest)
  focus?: { t: number; n: number } | null;   // open the mark of day `t` (a move tapped in the list, A-25), once per `n`
}

const nf = (d: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });

export function SigmaChart({ points, windowSec, intraday = false, decimals = 2, pct = false, sigmaWindow = "m12", height = 160, fill = false, axes = false, color = FLAT, volume = false, marks, onReadout, onPan, focus }: SigmaChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const panRef = useRef(0);   // bars back from the latest, kept across rebuilds
  // The marks as their content, not as the array they arrive in. A page hands over a fresh array on every one of
  // its renders, and the Monitor renders once a second for its countdown: keyed on the array, the chart was
  // rebuilt every second, and a mark's card opened by a tap was gone again at once (Shota, 19 Nov 2026).
  const marksKey = useMemo(() => JSON.stringify(marks ?? null), [marks]);
  const marksRef = useRef(marks); marksRef.current = marks;
  const pinRef = useRef<string | null>(null);   // the mark a tap has opened (its day and direction), kept across rebuilds
  // A finger has no hover: a tap puts the crosshair on the tapped bar and the read-out under the chart says its date,
  // level and σ (the designer's D-42). It stays until the next tap, also when the chart is rebuilt for fresh data:
  // the bar's time is kept here (a drag moves the crosshair with the chart, and this follows the bar under it).
  const crossRef = useRef<number | null>(null);
  // a mark asked to be opened from outside (A-25): the last request done, and the ring drawn round it for a moment
  const focusDone = useRef(-1);
  const ringRef = useRef<{ day: number; until: number } | null>(null);
  const focusKey = focus ? `${focus.t}|${focus.n}` : "";

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
    // the y axis: the fewest decimals its ticks need, never more than the instrument's (the designer's D-05 note:
    // 158.400 over ticks of 159.5 and 159.0); room for the widest label it could write
    const axisFmt = (v: number, incr: number) => nf(axisDecimals(incr, decimals)).format(v);
    const ys = points.map((p) => p.v);
    const yMax = Math.max(...ys), yMin = Math.min(...ys);
    const axisSize = 16 + Math.max(fmt.format(yMax).length, fmt.format(yMin).length, 4) * 7.3;   // 12px mono digits are 7.2px wide; room for the tick and gap
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
    // an intraday axis is bars, not time: each label is its bar's time in Singapore ("23:18"), with its day when the
    // view spans more than a day ("19 Nov 23:00"; the chart's read-out says SGT)
    const days = intraday && lastT - ts[i0] > 86400;
    const xLabel = (x: number) => { const t = ts[Math.min(nAll - 1, Math.max(0, Math.round(x)))]; if (t == null) return ""; const s = fmtDayTime(t * 1000, SGT); return days ? s : s.slice(s.lastIndexOf(" ") + 1); };
    const size = () => ({ width: box.clientWidth || 300, height: fill ? Math.max(termMode() ? 24 : 60, box.clientHeight) : boxHeight(box, height) });
    const opts: uPlot.Options = {
      ...size(),
      padding: axes ? [6, 8, 0, 0] : [4, 2, 4, 2],
      tzDate: (t) => uPlot.tzDate(new Date(t * 1e3), "UTC"),
      scales: { x: { time: !intraday, range: () => [xsAll[i0], xsAll[i1]] }, y: { range: (_u, min, max) => { const pad = (max - min) * 0.03 || Math.abs(max) * 0.002 || 1; return [min - pad, max + pad]; } },   // a flat window still gets a height
        ...(hasVol ? { vol: { range: (_u: uPlot, _min: number, max: number) => [0, (max > 0 ? max : 1) / VOL_SHARE] as [number, number] } } : {}) },
      axes: axes
        ? [{ ...AXIS, space: 80, values: intraday ? (_u, vals) => vals.map(xLabel) : TIME_VALUES }, { ...AXIS, size: axisSize, values: (_u, vals, _i, _sp, incr) => vals.map((v) => axisFmt(v, incr)) }]
        : [{ show: false }, { show: false }],
      series,
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { show: false }, move: zoomMove },   // no cross-panel sync: only the panel under the pointer responds
      hooks: {
        draw: [(u) => {
          if (!placed.length) return;
          const g = u.ctx, pr = devicePixelRatio || 1, x0 = u.scales.x.min ?? -Infinity, x1 = u.scales.x.max ?? Infinity;
          g.save();
          const ring = ringRef.current && Date.now() < ringRef.current.until ? ringRef.current.day : null;
          for (const { m, i } of placed) {
            const xv = xsAll[i]; if (xv < x0 || xv > x1) continue;
            const cx = u.valToPos(xv, "x", true), cy = u.valToPos(data[1][i] as number, "y", true), r = (m.small ? MARK_R_SMALL : MARK_R) * pr;
            if (m.roll) {
              // a change of contract: a hollow diamond on the bar of the roll day, in the muted text colour
              const d = r * 1.25;
              g.beginPath(); g.moveTo(cx, cy - d); g.lineTo(cx + d, cy); g.lineTo(cx, cy + d); g.lineTo(cx - d, cy); g.closePath();
              g.fillStyle = "#0b0b0c"; g.fill(); g.lineWidth = 1.6 * pr; g.strokeStyle = ROLL; g.stroke();
            } else {
              g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
              g.fillStyle = m.dir > 0 ? UP : DN; g.fill(); g.lineWidth = (m.small ? 1 : 1.5) * pr; g.strokeStyle = "#0b0b0c"; g.stroke();
            }
            if (ring != null && Math.floor(m.t / 86400) === ring) { g.beginPath(); g.arc(cx, cy, r + 5 * pr, 0, Math.PI * 2); g.lineWidth = 2 * pr; g.strokeStyle = RING; g.stroke(); }
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
          if (crossOn) crossRef.current = ts[i];
          onReadout?.({ t: ts[i], v, z: zsel, q });
          // the price at the pointer: time and level, plus the σ distance of the selected window on daily charts
          const when = intraday ? fmtStamp(ts[i] * 1000, SGT) : fmtDate(ts[i] * 1000, "UTC");
          tip.textContent = `${when}  ${fmt.format(v)}${pct ? "%" : ""}${zsel == null ? "" : `  ${fmtSigma(zsel, 2)}`}${q == null ? "" : `  vol ${fmtVol(q)}`}`;
          if (crossOn) { tip.style.display = "none"; return; }   // a finger reads the line under the chart, not a tip under the finger
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
    let pinned: { m: ChartMark; i: number } | null = null, uRef: uPlot | null = null, crossOn = false;
    // While a tapped crosshair is shown, uPlot's own pointer handling is held (its `_lock`): after a touch the browser
    // sends mouse events of its own (an enter, then a leave at 0,0), and uPlot would move or clear the crosshair on
    // them. A real mouse moving over the chart lets go again. Setting the cursor from here is never held.
    const hold = (on: boolean) => { if (uRef) (uRef.cursor as { _lock?: boolean })._lock = on; };
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
      const el = (tag: string, cls: string, text?: string) => { const d = document.createElement(tag); d.className = cls; if (text != null) d.textContent = text; return d; };
      const add = (cls: string, text: string) => card.appendChild(el("div", cls, text));
      // the day, after a dot in the turn's colour (the circle's own); the figures in their sign's colour, the words muted
      const head = el("div", "t"); head.append(el("span", `dot ${x.m.roll ? "roll" : x.m.dir > 0 ? "up" : "dn"}${x.m.small ? " sm" : ""}`), x.m.title); card.appendChild(head);
      for (const it of x.m.items) {
        if (it.fig == null) add("l", it.text);
        else { const l = el("div", "l"); if (it.word) l.append(el("span", "mvw", it.word), " "); l.append(el("span", `mvf ${it.pct != null && it.pct > 0 ? "up" : it.pct != null && it.pct < 0 ? "dn" : ""}`.trim(), it.fig), " ", el("span", "mvr", it.rest ?? "")); card.appendChild(l); }
        add("w", it.why);
      }
      card.style.display = "block";
      // Beside the circle, on the side with more room and no wider than that room, so the card never covers its own
      // circle (on a phone the chart is narrower than a card, which used to fall back over the circle); above or
      // below it only when neither side has 150 px.
      const w = uRef.over.clientWidth, h = uRef.over.clientHeight, p = xy(x), right = w - p.x - 12, left = p.x - 12, side = Math.max(right, left);
      if (side >= 150) {
        card.style.maxWidth = `${Math.min(300, side)}px`;
        const cw = card.offsetWidth;
        card.style.left = `${Math.max(0, Math.min(w - cw, right >= cw || right >= left ? p.x + 12 : p.x - 12 - cw))}px`;
        card.style.top = `${Math.max(0, Math.min(h - card.offsetHeight, p.y - card.offsetHeight / 2))}px`;
      } else {
        card.style.maxWidth = `${Math.max(160, Math.min(300, w - 12))}px`;
        const cw = card.offsetWidth, ch = card.offsetHeight;
        card.style.left = `${Math.max(0, Math.min(w - cw, p.x - cw / 2))}px`;
        card.style.top = `${p.y + 12 + ch <= h || p.y < h / 2 ? p.y + 12 : Math.max(0, p.y - 12 - ch)}px`;
      }
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
    // A mark asked for from the list (A-25): bring the latest window back if the mark is outside the view, open its
    // card and ring the circle for two seconds. A request the chart cannot meet yet (its history still loading, or a
    // window too short for the day) waits for the next build.
    let ringTimer = 0;
    if (focus && focus.n !== focusDone.current) {
      const want = placed.find((x) => Math.floor(x.m.t / 86400) === Math.floor(focus.t / 86400));
      if (want) {
        if (xsAll[want.i] < xsAll[i0] || xsAll[want.i] > xsAll[i1]) { i1 = nAll - 1; i0 = Math.max(0, i1 - winN); u.setScale("x", { min: xsAll[i0], max: xsAll[i1] }); panRef.current = 0; onPan?.(0); }
        if (xsAll[want.i] >= xsAll[i0] && xsAll[want.i] <= xsAll[i1]) {
          focusDone.current = focus.n; crossRef.current = null; pinned = want; pinRef.current = pinKey(want); showMark(want); tip.style.display = "none";
          ringRef.current = { day: Math.floor(want.m.t / 86400), until: Date.now() + RING_MS }; u.redraw(false, false);
        }
      }
    }
    if (ringRef.current && Date.now() < ringRef.current.until) ringTimer = window.setTimeout(() => { ringRef.current = null; u.redraw(false, false); }, ringRef.current.until - Date.now() + 20);
    // the crosshair a tap put down, on the same bar again (a chart rebuilt for fresh data, or for another σ window)
    if (!pinned && crossRef.current != null) {
      const at = ts.indexOf(crossRef.current);
      if (at >= i0 && at <= i1 && data[1][at] != null) { crossOn = true; (u.cursor as { event?: unknown }).event = null; u.setCursor({ left: u.valToPos(xsAll[at], "x") * zoomNow(), top: u.valToPos(data[1][at] as number, "y") * zoomNow() }); hold(true); }
      else crossRef.current = null;
    }
    let drag: { x0: number; y0: number; i1_0: number; id: number; moved: boolean } | null = null;
    const apply = () => { u.setScale("x", { min: xsAll[i0], max: xsAll[i1] }); panRef.current = nAll - 1 - i1; onPan?.(Math.round(lastT - ts[i1])); };
    const onDown = (e: PointerEvent) => { if (e.button !== 0 && e.pointerType === "mouse") return; drag = { x0: e.clientX, y0: e.clientY, i1_0: i1, id: e.pointerId, moved: false }; over.setPointerCapture?.(e.pointerId); over.style.cursor = "grabbing"; e.preventDefault(); };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && crossOn) { crossOn = false; crossRef.current = null; hold(false); }   // a mouse has its hover again
      if (!drag || e.pointerId !== drag.id) return;
      if (Math.abs(e.clientX - drag.x0) > 6 || Math.abs(e.clientY - drag.y0) > 6) { drag.moved = true; if (pinned) { pin(null); hideMark(); } }
      // The chart follows the hand (Shota, 19 Nov 2026): drag it to the right and the earlier bars come in from the
      // left; to the left and it comes forward again. The plot's width is taken in the pointer's own (screen)
      // pixels, so the bar that was grabbed stays under the pointer whatever the page's scale.
      const pxW = (over.clientWidth || u.bbox.width / devicePixelRatio) * zoomNow();
      const dIdx = Math.round(((e.clientX - drag.x0) / Math.max(1, pxW)) * winN);
      i1 = Math.min(nAll - 1, Math.max(winN, drag.i1_0 - dIdx)); i0 = i1 - winN; apply();
    };
    // A press that did not move is a tap: on a mark it opens that mark's read-out and keeps it open (a second tap on it
    // closes it). Elsewhere it closes an open card and, for a finger, puts the crosshair on the tapped bar with its
    // read-out (D-42), where it stays until the next tap. A mouse has its hover for that.
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tap = !drag.moved && e.type === "pointerup";
      drag = null; over.style.cursor = "grab";
      if (!tap) return;
      const z = zoomNow(), [mx, my] = insideEl(e.clientX, e.clientY, over.getBoundingClientRect(), over.offsetWidth, over.offsetHeight, z);
      const hit = placed.length ? markNear(mx, my, e.pointerType === "mouse" ? 9 : 22) : null;
      if (hit) {
        crossOn = false; crossRef.current = null; hold(false);
        pin(hit !== pinned ? hit : null);
        if (pinned) { u.setCursor({ left: -10, top: -10 }); showMark(pinned); tip.style.display = "none"; } else hideMark();
        return;
      }
      if (pinned) { pin(null); hideMark(); }
      if (e.pointerType === "mouse") return;
      // uPlot reads the position through zoomMove, which takes a position with no pointer event of its own as screen
      // pixels: the stale mouse event it may still hold is cleared, and the position is handed over in screen pixels
      crossOn = true; (u.cursor as { event?: unknown }).event = null;
      u.setCursor({ left: mx * z, top: my * z });
      hold(true);
    };
    const onDbl = () => { i1 = nAll - 1; i0 = i1 - winN; apply(); };
    over.addEventListener("pointerdown", onDown);
    over.addEventListener("pointermove", onMove);
    over.addEventListener("pointerup", onUp);
    over.addEventListener("pointercancel", onUp);
    over.addEventListener("dblclick", onDbl);
    return () => { ro.disconnect(); if (ringTimer) clearTimeout(ringTimer); over.removeEventListener("pointerdown", onDown); over.removeEventListener("pointermove", onMove); over.removeEventListener("pointerup", onUp); over.removeEventListener("pointercancel", onUp); over.removeEventListener("dblclick", onDbl); u.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, windowSec, intraday, decimals, pct, height, fill, axes, color, hasVol, marksKey, focusKey]);

  return <div className={`chartbox${fill ? " fill" : ""}`} ref={el} style={fill ? undefined : { height }} />;
}
