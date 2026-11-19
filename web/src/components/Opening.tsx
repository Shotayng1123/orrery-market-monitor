import { useEffect, useRef, useState } from "react";
import { OPENING_KEY, OPENING_S, dayOf, openingDue, renderOpening } from "../lib/opening";

/** The opening (lib/opening.ts) over the whole screen while the Monitor loads behind it. Once a day on each
 *  device: the day it last played is kept on the device. A tap or a click anywhere ends it at once (SKIP at the
 *  foot says so), as do Esc, Enter and Space. The address ending ?opening=1 plays it again whatever the day.
 *  It ends on the click, not on the press: by then the layer is still on top, so the click that ends it cannot
 *  land on a button of the Monitor underneath. */
const FADE_MS = 450;

function due(): boolean {
  let stored: string | null = null;
  try { stored = localStorage.getItem(OPENING_KEY); } catch { /* a browser that keeps nothing: it plays */ }
  const forced = new URLSearchParams(location.search).get("opening") === "1";
  const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return openingDue(dayOf(new Date()), stored, { reducedMotion, automated: navigator.webdriver === true, forced });
}

export function Opening() {
  const [state, setState] = useState<"on" | "out" | "off">(() => (due() ? "on" : "off"));
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (state !== "on") return;
    try { localStorage.setItem(OPENING_KEY, dayOf(new Date())); } catch { /* nothing kept: it plays again next time */ }
    const c = cv.current, ctx = c?.getContext("2d");
    if (!c || !ctx) { setState("off"); return; }
    // drawn at the screen's own sharpness, up to what a phone can paint sixty times a second
    const fit = (): { w: number; h: number } => {
      const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), dpr = Math.max(1, Math.min(devicePixelRatio || 1, 2, Math.sqrt(3.4e6 / (w * h))));
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); ctx.setTransform(c.width / w, 0, 0, c.height / h, 0, 0);
      return { w, h };
    };
    let size = fit(), raf = 0, t0 = 0, over = false;
    const end = (): void => { if (over) return; over = true; setState("out"); };
    const frame = (now: number): void => {
      if (!t0) t0 = now;
      const s = (now - t0) / 1000;
      renderOpening(ctx, size.w, size.h, Math.min(s, OPENING_S));
      c.dataset.t = s.toFixed(2);   // where the piece is, for the browser checks
      if (s >= OPENING_S) end(); else raf = requestAnimationFrame(frame);
    };
    const onResize = (): void => { size = fit(); };
    // the key that ends it goes no further: Enter must not also press what has the focus underneath
    const onKey = (e: KeyboardEvent): void => { if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== "Escape" && e.key !== "Enter" && e.key !== " ")) return; e.preventDefault(); e.stopPropagation(); end(); };
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", onResize); window.addEventListener("keydown", onKey, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); window.removeEventListener("keydown", onKey, true); };
  }, [state]);

  // the last frame fades to the Monitor, then the layer is gone
  useEffect(() => {
    if (state !== "out") return;
    const id = setTimeout(() => setState("off"), FADE_MS);
    return () => clearTimeout(id);
  }, [state]);

  if (state === "off") return null;
  return (
    <div id="opening" className={state === "out" ? "out" : undefined} role="img" aria-label="Orrery Monitor" onClick={() => setState((s) => (s === "on" ? "out" : s))}>
      <canvas ref={cv} />
      <button type="button" className="skip">SKIP</button>
    </div>
  );
}
