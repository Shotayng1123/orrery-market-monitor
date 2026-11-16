import { useLayoutEffect, type RefObject } from "react";
import { zoomNow } from "./prefs";
import { PHONE } from "./phone";

/** On a phone, sizes a scrolling table box to `n` rows under its column heads (Shota, 16 Nov): a long table shows a
 *  handful of rows and scrolls inside its panel instead of running down the page. Wider windows keep the height the
 *  stylesheet gives the box. The heights are measured, so they follow the text size. `labelSelector` names the rows
 *  that divide the list (a date line): room for one is added, so a date in view does not cost one of the `n` rows;
 *  a second date in view does. `deps` should change when the rows first appear. */
export function useRowCap(box: RefObject<HTMLElement | null>, n: number, rowSelector: string, labelSelector: string | null, deps: readonly unknown[]): void {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const mq = window.matchMedia(PHONE);
    const apply = () => {
      const row = el.querySelector<HTMLElement>(rowSelector), head = el.querySelector<HTMLElement>("thead"), label = labelSelector ? el.querySelector<HTMLElement>(labelSelector) : null;
      if (!mq.matches || !row) { el.style.maxHeight = ""; return; }
      const z = zoomNow(), h = (x: HTMLElement | null) => x?.getBoundingClientRect().height ?? 0;   // rectangles are in visual pixels, style lengths in the zoomed layout's pixels
      el.style.maxHeight = `${Math.ceil((h(head) + h(label) + n * h(row)) / z)}px`;
    };
    apply();
    mq.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    // the rows change height when the web font lands or the text size changes: measure again (the cap does not resize the table, so this cannot loop)
    const table = el.querySelector("table");
    const ro = table && typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    if (ro && table) ro.observe(table);
    return () => { ro?.disconnect(); mq.removeEventListener("change", apply); window.removeEventListener("resize", apply); el.style.maxHeight = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
