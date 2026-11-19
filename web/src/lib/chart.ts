import type uPlot from "uplot";
import { termMode, zoomNow } from "./prefs";

// Shared chart text and cursor settings.
export const AXIS_FONT = "12px 'IBM Plex Mono', ui-monospace, monospace";
export const AXIS = { stroke: "#a39f94", grid: { stroke: "#141518", width: 1 }, ticks: { stroke: "#26272b", width: 1 }, font: AXIS_FONT };

/** Where the pointer is inside an element, in the element's own layout pixels (the pixels a chart is laid out
 *  in). The page is scaled with the CSS `zoom` property (lib/prefs.ts: 0.9 to 1.8 by the window's width, or the
 *  size chosen by hand), and the pointer always arrives in screen pixels. The element's rectangle does not:
 *  current Chrome and Firefox give it in screen pixels, older engines in layout pixels. The two are told apart
 *  by the rectangle's width against the element's layout width, so the answer is right in both.
 *  `r`: the element's bounding rectangle as the browser gives it; `w`, `h`: its layout size; `z`: the page's zoom. */
export function insideEl(clientX: number, clientY: number, r: { left: number; top: number; width: number; height: number }, w: number, h: number, z: number): [number, number] {
  // how many of the rectangle's pixels make one layout pixel: z where it is in screen pixels, 1 where it is in layout pixels
  const per = (rect: number, layout: number): number => { const k = layout > 0 && rect > 0 ? rect / layout : z; return Math.abs(k - z) <= 0.02 * z ? z : Math.abs(k - 1) <= 0.02 ? 1 : k; };
  const kx = per(r.width, w), ky = per(r.height, h);
  return [(clientX - r.left * (z / kx)) / z, (clientY - r.top * (z / ky)) / z];
}

/** The pointer on a chart. uPlot works the pointer out against a rectangle of the chart that it measures when
 *  the pointer enters and after a scroll or a resize, and in screen pixels, while it lays the plot out in layout
 *  pixels. So the crosshair and the read-out sat away from the pointer whenever the page was scaled (a wide
 *  window: 1.28 at 1,920 pixels) and whenever the chart had moved on the page since the pointer entered it (a
 *  panel above it filling in). Here the pointer is worked out afresh on every move, from the event itself. */
export const zoomMove: NonNullable<uPlot.Cursor["move"]> = (u, left, top) => {
  const z = zoomNow(), e = u.cursor.event as MouseEvent | null | undefined, o = u.over;
  if (!e || typeof e.clientX !== "number") return [left / z, top / z];   // no pointer of its own (a position handed over from another chart)
  return insideEl(e.clientX, e.clientY, o.getBoundingClientRect(), o.offsetWidth, o.offsetHeight, z);
};

/** Chart height: the fixed height in the scrolling layout, the box's own height in the one-screen layout
 *  (where the stylesheet stretches the box to fill its panel). */
export const boxHeight = (box: HTMLElement, fixed: number, min = 24): number => (termMode() ? Math.max(min, box.clientHeight) : fixed);
