import type uPlot from "uplot";
import { termMode, zoomNow } from "./prefs";

// Shared chart text and cursor settings.
export const AXIS_FONT = "12px 'IBM Plex Mono', ui-monospace, monospace";
export const AXIS = { stroke: "#a39f94", grid: { stroke: "#141518", width: 1 }, ticks: { stroke: "#26272b", width: 1 }, font: AXIS_FONT };

/** The S/M/L/XL sizes use the CSS `zoom` property. uPlot measures the pointer in visual pixels but lays the
 *  plot out in CSS pixels, so without this the crosshair and readout sit to the right of the pointer at L and XL. */
export const zoomMove: NonNullable<uPlot.Cursor["move"]> = (_u, left, top) => {
  const z = zoomNow();
  return [left / z, top / z];
};

/** Chart height: the fixed height in the scrolling layout, the box's own height in the one-screen layout
 *  (where the stylesheet stretches the box to fill its panel). */
export const boxHeight = (box: HTMLElement, fixed: number, min = 24): number => (termMode() ? Math.max(min, box.clientHeight) : fixed);
