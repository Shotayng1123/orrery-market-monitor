import { useEffect, useRef, useState } from "react";
import { OPENING_KEY, OPENING_S, OPENING_SKIP_KEY, T_MARK, dayOf, openingDue, prepareOpening, renderOpening } from "../lib/opening";
import { holdAnswers, letGo } from "../lib/hold";
import { isInstalled } from "../lib/install";
import { PHONE } from "../lib/phone";
import { readPending } from "../lib/pending";
import { openedByButton } from "../lib/verify";

/** The opening (lib/opening.ts) over the whole screen while the Monitor loads behind it. In the app on a phone's
 *  home screen it plays every time the app is opened; in a browser tab and on a computer once a day on each
 *  device (the day it last played is kept on the device). A tap or a click anywhere ends it at once (SKIP at the
 *  foot says so), as do Esc, Enter and Space. It does not play while an account is being created (a
 *  verification email out on this device, or the page opened by that email's button). The address ending ?opening=1 plays it again whatever the day.
 *  It ends on the click, not on the press: by then the layer is still on top, so the click that ends it cannot
 *  land on a button of the Monitor underneath.
 *
 *  Kept smooth by three things beside the drawing itself (lib/opening.ts):
 *   - the Monitor's answers are held until it is over (lib/hold.ts), so nothing else is drawn meanwhile;
 *   - while things move the canvas is drawn coarser (about 1.4 million pixels, a quarter of a large sharp
 *     screen's): a moving picture does not show it. From SHARP_AT on, when only the mark and the name are left
 *     and a frame costs almost nothing, it is drawn at the screen's full sharpness;
 *   - the clock starts once everything that is drawn only once is ready, not before. */
const FADE_MS = 450;
const SHARP_AT = T_MARK - 0.45;   // seconds: the system is small and the mark is forming

/** Whether the opening plays on this visit. Asked once, before the Monitor is drawn (main.tsx), because the
 *  answers have to be held from the first request on. */
export function openingNow(): boolean {
  let stored: string | null = null;
  try { stored = localStorage.getItem(OPENING_KEY); } catch { /* a browser that keeps nothing: it plays */ }
  const forced = new URLSearchParams(location.search).get("opening") === "1";
  const mq = (q: string): boolean => { try { return typeof matchMedia === "function" && matchMedia(q).matches; } catch { return false; } };
  // the page the new-version bar has just loaded is the same visit going on, not the app being opened
  let sameVisit = false;
  try { sameVisit = sessionStorage.getItem(OPENING_SKIP_KEY) === "1"; sessionStorage.removeItem(OPENING_SKIP_KEY); } catch { /* nothing kept */ }
  const play = (forced || !sameVisit) && openingDue(dayOf(new Date()), stored, { reducedMotion: mq("(prefers-reduced-motion: reduce)"), automated: navigator.webdriver === true, forced, everyOpen: isInstalled() && mq(PHONE), signingUp: openedByButton() || readPending() != null });
  if (play) holdAnswers((OPENING_S + 2.5) * 1000);
  return play;
}

export function Opening({ play }: { play: boolean }) {
  const [state, setState] = useState<"on" | "out" | "off">(play ? "on" : "off");
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (state !== "on") return;
    try { localStorage.setItem(OPENING_KEY, dayOf(new Date())); } catch { /* nothing kept: it plays again next time */ }
    const c = cv.current, ctx = c?.getContext("2d", { alpha: false }) ?? null;
    if (!c || !ctx) { setState("out"); return; }
    let w = 1, h = 1, sharp = false, raf = 0, t0 = 0, over = false;
    // the canvas in real pixels: coarse while things move, the screen's own sharpness (up to 2x) for the lockup
    const size = (full: boolean): void => {
      w = Math.max(1, innerWidth); h = Math.max(1, innerHeight);
      const dpr = Math.min(devicePixelRatio || 1, 2), s = full ? Math.max(1, Math.min(dpr, Math.sqrt(4e6 / (w * h)))) : Math.min(dpr, Math.max(0.75, Math.sqrt(1.4e6 / (w * h))));
      const bw = Math.round(w * s), bh = Math.round(h * s);
      if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
      ctx.setTransform(bw / w, 0, 0, bh / h, 0, 0);
      sharp = full;
    };
    // everything that is drawn once, at both sizes, before the clock starts
    size(true); prepareOpening(ctx, w, h); size(false); prepareOpening(ctx, w, h);
    const end = (): void => { if (over) return; over = true; setState("out"); };
    const frame = (now: number): void => {
      if (!t0) t0 = now;
      const s = (now - t0) / 1000;
      if (!sharp && s >= SHARP_AT) size(true);
      renderOpening(ctx, w, h, Math.min(s, OPENING_S));
      c.dataset.t = s.toFixed(2);   // where the piece is, for the browser checks
      if (s >= OPENING_S) end(); else raf = requestAnimationFrame(frame);
    };
    const onResize = (): void => { size(sharp); };
    // the key that ends it goes no further: Enter must not also press what has the focus underneath
    const onKey = (e: KeyboardEvent): void => { if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== "Escape" && e.key !== "Enter" && e.key !== " ")) return; e.preventDefault(); e.stopPropagation(); end(); };
    renderOpening(ctx, w, h, 0);
    raf = requestAnimationFrame(() => { raf = requestAnimationFrame(frame); });   // one frame for the page to settle, then the clock
    window.addEventListener("resize", onResize); window.addEventListener("keydown", onKey, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); window.removeEventListener("keydown", onKey, true); };
  }, [state]);

  // the last frame fades to the Monitor, which now gets its answers and fills in underneath
  useEffect(() => {
    if (state !== "out") return;
    letGo();
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
