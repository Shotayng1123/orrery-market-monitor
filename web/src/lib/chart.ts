import type uPlot from "uplot";

// Shared chart text and cursor settings.
export const AXIS_FONT = "12px 'IBM Plex Mono', ui-monospace, monospace";
export const AXIS = { stroke: "#a39f94", grid: { stroke: "#141518", width: 1 }, ticks: { stroke: "#26272b", width: 1 }, font: AXIS_FONT };

/** The S/M/L/XL sizes use the CSS `zoom` property. uPlot measures the pointer in visual pixels but lays the
 *  plot out in CSS pixels, so without this the crosshair and readout sit to the right of the pointer at L and XL. */
export const zoomMove: NonNullable<uPlot.Cursor["move"]> = (_u, left, top) => {
  const z = Number(document.body.style.getPropertyValue("--z")) || 1;
  return [left / z, top / z];
};
