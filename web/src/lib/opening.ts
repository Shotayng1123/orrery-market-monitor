// The opening (Shota, 19 Nov 2026): from the sun, out to the whole solar system, into the Orrery mark and the
// name. Five seconds. Drawn on a canvas, one frame from one time, so the same code gives the same picture on
// every screen and can be checked frame by frame (e2e/opening.cjs).
//
// The look, as asked: a real sun (limb darkening, granulation, spots; amber as through a filter while it fills
// the frame, white-gold once it is a star), planets as lit spheres in their own muted colours with the night
// side away from the sun, hairline orbits, a field of faint stars that stretch while the eye moves fastest.
// No flat colour fills the frame at any time. The planet that stays is the Earth: it becomes the mark's small
// dot. The mark it ends on is the header's own (components/Logo.tsx), stroke for stroke.
//
// Smoothness (Shota: "why is the clip not perfectly smooth?"). The first version lost it in three places, each
// measured, each answered here or in components/Opening.tsx:
//   1. The eye stopped twice on the way out (the pull-back was three eased movements end to end). It is one
//      movement now: its speed never reaches zero before the mark, it only slows as the whole system comes
//      into view (logScale).
//   2. A frame cost up to 114 ms to draw while the sun filled the screen (its surface was blended in on every
//      frame), against the 16.7 ms a screen allows. Whatever does not change is now drawn once (the kit): the
//      sun with its grain and spots, its glow, the haze behind the stars, the darkening at the edges, the
//      lockup's measures. A frame is then a handful of image copies and thin strokes.
//   3. Things appeared at a threshold (a star became a streak, a wake switched on). Every such quantity now
//      grows from nothing.
// And the Monitor loading underneath shared the one thread that draws: its answers are now held until the
// opening is over (lib/hold.ts).

const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a));
const E = {
  inOut: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number): number => 1 - Math.pow(1 - t, 3),
  out5: (t: number): number => 1 - Math.pow(1 - t, 5),
  in2: (t: number): number => t * t,
  smooth: (t: number): number => t * t * (3 - 2 * t),
};
const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (c1: string, c2: string, t: number): string => { const a = hex(c1), b = hex(c2); return "#" + a.map((v, i) => Math.round(lerp(v, b[i], clamp(t))).toString(16).padStart(2, "0")).join(""); };
const rgba = (c: string, a: number): string => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${clamp(a).toFixed(3)})`; };

/** Seconds of the whole piece. */
export const OPENING_S = 5;
/** When the whole system is in view, and when the mark has formed (seconds). */
export const T_SYS = 1.45, T_MARK = 2.6;

const IVORY = "#e8e5de", SPACE = "#050505";
const FONT = `"Cormorant Garamond", Georgia, "Times New Roman", serif`;
const NAME = "Orrery Monitor";
// the mark in its own units (Logo.tsx: a 200 box, the circle's centre at 100,92)
const MARK = { R: 70, stroke: 7, sun: 7, planet: 5.25, standTo: 90, baseX: 28, baseY: 94, baseCY: 84 };
// the three orbits that become the mark's rings: radius before, and the ring's (ry, rotation) after
const RINGS = [{ r0: 70, ry: 70, rot: 0 }, { r0: 44, ry: 46, rot: -32 }, { r0: 26, ry: 22, rot: 0 }];
const EARTH_END = -54.9;         // where the mark's small dot sits on its tilted ring, degrees
const TILT = 0.42;               // the system is seen from above its plane
const SPIN_WIDE = -14, SPIN_TALL = -58;   // and lies across a wide screen, up a tall one; it turns as the eye pulls back
const R_OUT = 184;               // the outermost orbit (Neptune's), in the mark's units
const SUN0 = 0.62;               // the sun's radius in the first frame, as a share of the screen's shorter side
const S0 = 6;                    // and in the mark's units once the whole system is in view

// orbit radius, start angle, sweep over the pull-back (degrees: the inner planets go round faster), size, colour
interface Planet { R: number; a0: number; sweep: number; r: number; col: string; rings?: boolean; bands?: boolean }
const PLANETS: Planet[] = [
  { R: 12, a0: 200, sweep: 520, r: 1.5, col: "#9c948a" },                 // Mercury
  { R: 18, a0: 320, sweep: 430, r: 2.2, col: "#d8c59b" },                 // Venus
  { R: 56, a0: 150, sweep: 240, r: 1.9, col: "#b4633d" },                 // Mars
  { R: 90, a0: 12, sweep: 170, r: 4.6, col: "#c8a57c", bands: true },     // Jupiter
  { R: 116, a0: 226, sweep: 130, r: 3.9, col: "#d6c193", rings: true },   // Saturn
  { R: 150, a0: 338, sweep: 100, r: 2.9, col: "#9cc8cf" },                // Uranus
  { R: 184, a0: 96, sweep: 80, r: 2.8, col: "#4f6fb0" },                  // Neptune
];
const EARTH = "#5b86bd";
const ORBITS = PLANETS.map((p) => p.R);

// ---- what never changes: the stars, the asteroid belt, the sun's spots ----
let seed = 20261119;
const rnd = (): number => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const TINTS = ["#ffffff", "#ffffff", "#dfe8ff", "#fff3dc", "#ffe2c2"];
const STARS = Array.from({ length: 320 }, () => { const b = rnd(); return { cos: 0, sin: 0, a: rnd() * Math.PI * 2, d: 0.05 + Math.sqrt(rnd()) * 1.0, r: b > 0.93 ? 1.2 + rnd() * 0.7 : 0.45 + rnd() * 0.6, o: b > 0.93 ? 0.8 + rnd() * 0.2 : 0.22 + rnd() * 0.5, c: TINTS[Math.floor(rnd() * TINTS.length)], halo: b > 0.965 }; });
for (const s of STARS) { s.cos = Math.cos(s.a); s.sin = Math.sin(s.a) * 0.86; }
const BELT = Array.from({ length: 150 }, () => ({ a: rnd() * 360, R: 63 + rnd() * 16, o: 0.15 + rnd() * 0.3, sweep: 190 + rnd() * 40 }));
const SPOTS = [{ x: -0.3, y: 0.14, r: 0.034 }, { x: -0.22, y: 0.19, r: 0.017 }, { x: 0.34, y: -0.24, r: 0.024 }, { x: 0.06, y: 0.42, r: 0.015 }];

// ---- the kit: everything that is the same in every frame on this screen, drawn once ----
interface Lockup { M: number; fs: number; tw: number; cx: number; cy: number; tx: number; ty: number; xs: number[]; font: boolean }
interface Kit { key: string; sun: HTMLCanvasElement; star: HTMLCanvasElement; halo: HTMLCanvasElement; L: Lockup }
/** The two soft layers that cover the whole frame (the haze behind the stars, the darkening at the edges), at
 *  one canvas size in real pixels: they are copied pixel for pixel, which costs a fifth of a stretched copy. */
interface Full { haze: HTMLCanvasElement; edge: HTMLCanvasElement }
let kit: Kit | null = null;
const fulls = new Map<string, Full>();
const sheet = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return [c, c.getContext("2d")!]; };
const fontReady = (): boolean => { try { return document.fonts.check(`600 40px "Cormorant Garamond"`); } catch { return true; } };

/** Where the mark and the name end: side by side as in the header, centred, never wider than the screen; and
 *  where each letter of the name starts. */
function lockup(ctx: CanvasRenderingContext2D, W: number, H: number): Lockup {
  const s = Math.min(W, H), gapK = 0.16;
  let M = Math.min(s * 0.2, 124), fs = M * 0.56;
  const width = (f: number): number => { ctx.font = `600 ${f}px ${FONT}`; return ctx.measureText(NAME).width + f * 0.06 * (NAME.length - 1); };
  let tw = width(fs);
  const total = M + M * gapK + tw, room = W * 0.84;
  if (total > room) { const k = room / total; M *= k; fs *= k; tw = width(fs); }
  const left = W / 2 - (M + M * gapK + tw) / 2;
  ctx.font = `600 ${fs}px ${FONT}`;
  const xs = Array.from(NAME, (_, i) => ctx.measureText(NAME.slice(0, i)).width + i * fs * 0.06);
  return { M, fs, tw, cx: left + M / 2, cy: H / 2 - (M * 8) / 200, tx: left + M + M * gapK, ty: H / 2 + fs * 0.3, xs, font: fontReady() };
}

/** The sun as it is seen close: darker towards its limb, grained, with a few spots. */
function sunSheet(px: number): HTMLCanvasElement {
  const [c, g] = sheet(px, px), r = px / 2;
  const disc = g.createRadialGradient(r, r, 0, r, r, r);
  disc.addColorStop(0, "#ffd98a"); disc.addColorStop(0.5, "#ffb347"); disc.addColorStop(0.8, "#f08a24"); disc.addColorStop(0.93, "#c9560f"); disc.addColorStop(1, "#7d2c08");
  g.fillStyle = disc; g.beginPath(); g.arc(r, r, r - 0.5, 0, 7); g.fill();
  // the grain: a tile of light cells and dark lanes that repeats without a seam
  const T = 256, [tile, tg] = sheet(T, T);
  tg.fillStyle = "#808080"; tg.fillRect(0, 0, T, T);
  let s = 77; const rr = (): number => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const blob = (x: number, y: number, rad: number, col: string): void => { for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) { const gr = tg.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(128,128,128,0)"); tg.fillStyle = gr; tg.beginPath(); tg.arc(x + dx, y + dy, rad, 0, 7); tg.fill(); } };
  for (let i = 0; i < 520; i++) blob(rr() * T, rr() * T, 5 + rr() * 7, "rgba(255,255,255,0.34)");
  for (let i = 0; i < 620; i++) blob(rr() * T, rr() * T, 2.5 + rr() * 4, "rgba(0,0,0,0.36)");
  const pat = g.createPattern(tile, "repeat"), k = clamp(px * 0.21, 70, 250) / T;
  g.save(); g.beginPath(); g.arc(r, r, r - 0.5, 0, 7); g.clip();
  if (pat) { g.globalCompositeOperation = "overlay"; g.globalAlpha = 0.55; g.scale(k, k); g.fillStyle = pat; g.fillRect(0, 0, px / k, px / k); g.setTransform(1, 0, 0, 1, 0, 0); }
  g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
  for (const sp of SPOTS) { const x = r + sp.x * r, y = r + sp.y * r, rad = sp.r * r * 1.9, sg = g.createRadialGradient(x, y, 0, x, y, rad); sg.addColorStop(0, "rgba(42,13,2,0.9)"); sg.addColorStop(0.45, "rgba(90,34,6,0.7)"); sg.addColorStop(1, "rgba(138,58,12,0)"); g.fillStyle = sg; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
  g.restore();
  return c;
}
/** The sun as a star: white-gold, still darker at its edge. */
function starSheet(): HTMLCanvasElement {
  const px = 160, [c, g] = sheet(px, px), r = px / 2, d = g.createRadialGradient(r, r, 0, r, r, r);
  d.addColorStop(0, "#fffaf0"); d.addColorStop(0.5, "#fff0cf"); d.addColorStop(0.8, "#ffd59a"); d.addColorStop(0.93, "#ffb561"); d.addColorStop(1, "#f08a2a");
  g.fillStyle = d; g.beginPath(); g.arc(r, r, r - 0.5, 0, 7); g.fill();
  return c;
}
function radial(px: number, stops: Array<[number, string]>): HTMLCanvasElement {
  const [c, g] = sheet(px, px), r = px / 2, d = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [o, col] of stops) d.addColorStop(o, col);
  g.fillStyle = d; g.fillRect(0, 0, px, px);
  return c;
}

function fullOf(ctx: CanvasRenderingContext2D, W: number, H: number): Full {
  const bw = ctx.canvas.width, bh = ctx.canvas.height, key = `${Math.round(W)}x${Math.round(H)}@${bw}x${bh}`, had = fulls.get(key);
  if (had) return had;
  const minS = Math.min(W, H), diag = Math.hypot(W, H), [haze, hg] = sheet(bw, bh), [edge, eg] = sheet(bw, bh);
  hg.scale(bw / W, bh / H); hg.translate(W / 2, H / 2); hg.rotate(-0.42);
  const band = hg.createLinearGradient(0, -minS * 0.34, 0, minS * 0.34);
  band.addColorStop(0, "rgba(143,163,207,0)"); band.addColorStop(0.5, "rgba(143,163,207,0.04)"); band.addColorStop(1, "rgba(143,163,207,0)");
  hg.fillStyle = band; hg.fillRect(-diag, -minS * 0.34, diag * 2, minS * 0.68);
  eg.scale(bw / W, bh / H);
  const v = eg.createRadialGradient(W / 2, H / 2, minS * 0.3, W / 2, H / 2, diag * 0.62); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.35, "rgba(0,0,0,0.05)"); v.addColorStop(0.7, "rgba(0,0,0,0.3)"); v.addColorStop(1, "rgba(0,0,0,0.62)");   // eased in: a ramp that starts at once shows as a ring
  eg.fillStyle = v; eg.fillRect(0, 0, W, H);
  if (fulls.size > 3) fulls.clear();
  const f = { haze, edge }; fulls.set(key, f);
  return f;
}
/** Copies a full-frame layer pixel for pixel, whatever the canvas's own scale. */
function copy(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, alpha: number): void {
  const tr = ctx.getTransform();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(img, 0, 0); ctx.globalAlpha = 1; ctx.setTransform(tr);
}

/** Draws what is drawn once, for a canvas of W by H CSS pixels at its present size in real pixels (the canvas
 *  may be drawn coarser while things move: call it once at each size). Called by the first frame if nobody
 *  called it before; calling it ahead keeps that work out of the frames. */
export function prepareOpening(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  fullOf(ctx, W, H);
  const key = `${Math.round(W)}x${Math.round(H)}`;
  if (kit && kit.key === key) { if (!kit.L.font && fontReady()) kit.L = lockup(ctx, W, H); return; }
  const sunPx = Math.min(1024, Math.ceil(2 * SUN0 * Math.min(W, H) * 1.2));
  kit = {
    key, L: lockup(ctx, W, H),
    sun: kit && kit.sun.width >= sunPx ? kit.sun : sunSheet(sunPx),
    star: kit?.star ?? starSheet(),
    halo: kit?.halo ?? radial(48, [[0, "rgba(255,255,255,0.3)"], [1, "rgba(255,255,255,0)"]]),
  };
}

const onEllipse = (rx: number, ry: number, rotDeg: number, aDeg: number): [number, number] => { const a = (aDeg * Math.PI) / 180, r = (rotDeg * Math.PI) / 180, x = rx * Math.cos(a), y = ry * Math.sin(a); return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]; };
const hermite = (p0: number, m0: number, p1: number, m1: number, x: number, dt: number): number => { const x2 = x * x, x3 = x2 * x; return (2 * x3 - 3 * x2 + 1) * p0 + (x3 - 2 * x2 + x) * dt * m0 + (-2 * x3 + 3 * x2) * p1 + (x3 - x2) * dt * m1; };

/** The pull-back: the natural log of the scale (pixels per mark unit) at `t` seconds, from the sun filling the
 *  frame (lk0) through the whole system in view (lkS, at T_SYS) to the mark (lk1, at T_MARK and after). One
 *  movement: it starts from rest, is at its slowest but never still as the system comes into view (half the
 *  mean speed of what follows), and comes to rest on the mark. Its speed has no jump anywhere. */
export function logScale(t: number, lk0: number, lkS: number, lk1: number): number {
  const vS = (0.5 * (lk1 - lkS)) / (T_MARK - T_SYS);
  if (t <= 0) return lk0;
  if (t <= T_SYS) return hermite(lk0, 0, lkS, vS, t / T_SYS, T_SYS);
  if (t < T_MARK) return hermite(lkS, vS, lk1, 0, (t - T_SYS) / (T_MARK - T_SYS), T_MARK - T_SYS);
  return lk1;
}

/** A planet as a sphere lit from the sun, which is at the origin: the day side towards it, the night side away. */
function sphere(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, a: number, p?: Planet): void {
  const d = Math.hypot(x, y) || 1, lx = -x / d, ly = -y / d;
  if (p?.rings) { ctx.strokeStyle = rgba(mix(col, "#000000", 0.25), 0.7 * a); ctx.lineWidth = Math.max(0.8, r * 0.3); ctx.beginPath(); ctx.ellipse(x, y, r * 2.05, r * 0.62, (-18 * Math.PI) / 180, Math.PI, Math.PI * 2); ctx.stroke(); }
  const g = ctx.createRadialGradient(x + lx * r * 0.5, y + ly * r * 0.5, 0, x + lx * r * 0.15, y + ly * r * 0.15, r * 1.25);
  g.addColorStop(0, rgba(mix(col, "#ffffff", 0.42), a)); g.addColorStop(0.38, rgba(col, a)); g.addColorStop(0.74, rgba(mix(col, "#000000", 0.74), a)); g.addColorStop(1, rgba(mix(col, "#000000", 0.93), a));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  const bands = p?.bands ? seg(r, 3, 6) : 0;
  if (bands > 0) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip(); ctx.fillStyle = rgba("#5a3a1e", 0.24 * a * bands); for (const o of [-0.42, -0.08, 0.3]) ctx.fillRect(x - r, y + o * r, r * 2, r * 0.16); ctx.restore(); }
  if (p?.rings) { ctx.strokeStyle = rgba(mix(col, "#ffffff", 0.15), 0.85 * a); ctx.lineWidth = Math.max(0.8, r * 0.3); ctx.beginPath(); ctx.ellipse(x, y, r * 2.05, r * 0.62, (-18 * Math.PI) / 180, 0, Math.PI); ctx.stroke(); }
}

/** One frame: the opening at `seconds` (0 to OPENING_S) on a canvas of W by H CSS pixels. */
export function renderOpening(ctx: CanvasRenderingContext2D, W: number, H: number, seconds: number): void {
  prepareOpening(ctx, W, H);
  const K = kit!, F = fullOf(ctx, W, H), L = K.L, t = clamp(seconds, 0, OPENING_S);
  const u = L.M / 200, diag = Math.hypot(W, H), minS = Math.min(W, H);
  const m = E.inOut(seg(t, 1.75, T_MARK));   // how far the system has settled into the mark
  // the scale, pixels per mark unit: the sun filling the frame, the whole system fitted to the screen, the mark
  const tall = H > W * 1.15, spinTo = tall ? SPIN_TALL : SPIN_WIDE, th = (spinTo * Math.PI) / 180;
  const kSys = Math.min((0.47 * W) / (R_OUT * Math.hypot(Math.cos(th), TILT * Math.sin(th))), (0.46 * H) / (R_OUT * Math.hypot(Math.sin(th), TILT * Math.cos(th))));
  const lk0 = Math.log((SUN0 * minS) / S0), lkS = Math.log(Math.max(kSys, u * 1.5)), lk1 = Math.log(u);
  const lk = logScale(t, lk0, lkS, lk1), k = Math.exp(lk), zt = seg(lk0 - lk, 0, lk0 - lk1);
  const speed = Math.abs(logScale(t + 0.01, lk0, lkS, lk1) - logScale(t - 0.01, lk0, lkS, lk1)) / 0.02;   // how fast the eye is moving, per second
  // the system's centre: a little off the middle at first, the middle with the whole system in view, then its place in the lockup
  const off = 1 - E.smooth(seg(t, 0, T_SYS)), g = E.inOut(seg(t, 1.85, 2.9));
  const cx = lerp(W / 2 - 0.1 * W * off, L.cx, g), cy = lerp(H / 2 + 0.07 * H * off, L.cy, g);
  const turn = seg(t, 0, T_MARK), sweep = 0.5 * E.out(turn) + 0.5 * turn;   // the planets keep going round all the way
  const spin = lerp(spinTo - 26, spinTo, sweep) * (1 - m), tilt = lerp(TILT, 1, m);

  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = SPACE; ctx.fillRect(0, 0, W, H);
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // --- deep space: a faint band of light across the frame, then the stars ---
  const starFade = lerp(0.3, 1, seg(t, 0.3, 1.3)) * (1 - 0.78 * seg(t, 2.2, 3.0)) * (1 - seg(t, 3.4, 4.2));
  if (starFade > 0.004) {
    const hz = starFade * seg(starFade, 0.35, 0.8); if (hz > 0.02) copy(ctx, F.haze, hz);   // too faint to see before the stars are up
    const R = diag * 0.62 * (1 + 0.5 * (1 - zt));
    for (const st of STARS) {
      const d = st.d * R, x = W / 2 + st.cos * d, y = H / 2 + st.sin * d;
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      const len = Math.min(34, speed * 6 * st.d), a = st.o * starFade;
      // a star is a short stroke along its line of flight: of no length while the eye is slow, longer as it speeds up
      if (len > 0.6) { ctx.strokeStyle = rgba(st.c, a * lerp(1, 0.7, seg(len, 0.6, 6))); ctx.lineWidth = st.r * 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + st.cos * len, y + st.sin * len); ctx.stroke(); }
      else { ctx.fillStyle = rgba(st.c, a); ctx.beginPath(); ctx.arc(x, y, st.r, 0, 7); ctx.fill(); }
      if (st.halo) { const h = st.r * 5; ctx.globalAlpha = a; ctx.drawImage(K.halo, x - h, y - h, h * 2, h * 2); ctx.globalAlpha = 1; }
    }
  }

  ctx.save(); ctx.translate(cx, cy); ctx.rotate((spin * Math.PI) / 180);

  // --- the orbits that are not part of the mark, and the asteroid belt: they go as the system settles ---
  const aOrb = (1 - m) * seg(t, 0.25, 0.9);
  if (aOrb > 0.004) {
    ctx.lineWidth = 1; ctx.strokeStyle = rgba(IVORY, aOrb * 0.22);
    for (let i = 0; i < ORBITS.length; i++) { const r = ORBITS[i] * k; if (r > diag * 1.2) continue; ctx.beginPath(); ctx.ellipse(0, 0, r, r * tilt, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (k * 80 < diag) { ctx.fillStyle = "#b9b2a6"; for (const b of BELT) { const [x, y] = onEllipse(b.R * k, b.R * k * tilt, 0, b.a + b.sweep * sweep); ctx.globalAlpha = b.o * aOrb; ctx.fillRect(x, y, 1.1, 1.1); } ctx.globalAlpha = 1; }
  }

  // --- the three orbits that become the mark's rings ---
  const lw = lerp(1.1, MARK.stroke * u, E.in2(m)), aRing = seg(t, 0.3, 1.0);
  const ring = RINGS.map((r) => ({ rx: lerp(r.r0, MARK.R, m) * k, ry: lerp(r.r0 * TILT, r.ry, m) * k, rot: r.rot * m }));
  ctx.strokeStyle = rgba(IVORY, aRing * lerp(0.42, 1, m)); ctx.lineWidth = lw;
  for (const r of ring) { if (r.rx > diag * 1.3) continue; ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0.01, r.rx), Math.max(0.01, r.ry), (r.rot * Math.PI) / 180, 0, Math.PI * 2); ctx.stroke(); }

  // --- the planets: they go round while the eye pulls back, and leave a faint wake while it moves fast ---
  const aPl = (1 - E.inOut(seg(t, 1.8, 2.35))) * seg(t, 0.25, 0.75), wakeA = E.smooth(seg(speed, 0.5, 2.4)), wakeDeg = Math.min(40, 3 + speed * 9);
  // a wake is an arc of the orbit behind the planet, fading in three steps; never longer than a short stroke on screen
  const trail = (rx: number, ry: number, rotDeg: number, a: number, w: number, alpha: number): void => { const deg = Math.min(wakeDeg, (90 / Math.max(1, rx)) * (180 / Math.PI)); for (let i = 0; i < 3; i++) { ctx.strokeStyle = rgba(IVORY, alpha * (0.16 - i * 0.05)); ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, (rotDeg * Math.PI) / 180, ((a - (deg * (i + 1)) / 3) * Math.PI) / 180, ((a - (deg * i) / 3) * Math.PI) / 180); ctx.stroke(); } };
  if (aPl > 0.004) for (const p of PLANETS) {
    const a = p.a0 + p.sweep * sweep, [x, y] = onEllipse(p.R * k, p.R * k * tilt, 0, a), r = Math.max(1.1, p.r * clamp(k, 0.5, 3.1));
    if (Math.abs(x) > diag || Math.abs(y) > diag) continue;
    if (wakeA > 0.01) trail(p.R * k, p.R * k * tilt, 0, a, Math.max(0.7, r * 0.22), aPl * wakeA);
    sphere(ctx, x, y, r, p.col, aPl, p);
  }
  // the Earth stays: it rides the second orbit and comes to rest where the mark has its small dot
  { const r2 = ring[1], a = EARTH_END - 330 * (1 - sweep), [x, y] = onEllipse(r2.rx, r2.ry, r2.rot, a), pr = lerp(Math.max(2, 2.5 * clamp(k, 0.5, 3)), MARK.planet * u, m), flat = E.inOut(seg(t, 2.1, T_MARK));
    if (wakeA > 0.01 && m < 0.9) trail(r2.rx, r2.ry, r2.rot, a, Math.max(0.7, pr * 0.22), aRing * (1 - m) * wakeA);
    ctx.globalAlpha = aRing;
    if (flat < 1) sphere(ctx, x, y, pr, EARTH, 1);
    if (flat > 0) { ctx.fillStyle = rgba(IVORY, flat); ctx.beginPath(); ctx.arc(x, y, pr, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1; }

  ctx.restore();

  // --- the sun: most of the frame at first, the mark's centre at the end. Drawn upright, not turned with the
  // system: a round thing looks the same turned, and a turned image costs twice an upright one to draw ---
  ctx.save(); ctx.translate(cx, cy);
  { const rs = lerp(S0, MARK.sun, m) * k, hot = 1 - E.inOut(seg(t, 2.0, T_MARK)), near = E.smooth(seg(rs, 0.04 * minS, 0.3 * minS));
    if (hot > 0.004) {
      // its light around it: slight while it fills the frame (as through a filter), a bloom once it is a star
      const gr = rs * lerp(4.2, 1.9, near), ga = lerp(0.5, 0.1, near) * hot, cor = ctx.createRadialGradient(0, 0, rs * 0.85, 0, 0, gr);
      cor.addColorStop(0, rgba("#ffd9a0", ga)); cor.addColorStop(0.3, rgba("#ffae5e", ga * 0.32)); cor.addColorStop(1, "rgba(255,154,60,0)");
      ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(0, 0, gr, 0, 7); ctx.fill();
      // the star it is from afar and, over it, the disc it is from near; only the one that shows is drawn
      if (near < 0.996) { ctx.globalAlpha = hot; ctx.drawImage(K.star, -rs, -rs, rs * 2, rs * 2); }
      if (near > 0.004) { ctx.globalAlpha = hot * near; ctx.drawImage(K.sun, -rs, -rs, rs * 2, rs * 2); }
      ctx.globalAlpha = 1;
      // once it is a star, the thin cross a lens makes of a point of light
      const point = (1 - near) * hot * seg(t, 0.9, 1.4);
      if (point > 0.01) { for (const [dx, dy] of [[1, 0], [0, 1]]) { const len = (rs * 3.2 + 10) * (dy ? 0.7 : 1), lg = ctx.createLinearGradient(-dx * len, -dy * len, dx * len, dy * len); lg.addColorStop(0, "rgba(255,236,200,0)"); lg.addColorStop(0.5, rgba("#fff1d6", 0.3 * point)); lg.addColorStop(1, "rgba(255,236,200,0)"); ctx.strokeStyle = lg; ctx.lineWidth = Math.max(0.8, rs * 0.1); ctx.beginPath(); ctx.moveTo(-dx * len, -dy * len); ctx.lineTo(dx * len, dy * len); ctx.stroke(); } }
    }
    if (hot < 0.996) { ctx.fillStyle = rgba(IVORY, 1 - hot); ctx.beginPath(); ctx.arc(0, 0, rs, 0, 7); ctx.fill(); } }
  ctx.restore();

  // --- the edges of the frame fall away, as in a lens ---
  { const a = 1 - seg(t, 3.0, 4.0); if (a > 0.004) copy(ctx, F.edge, a); }

  // --- the stand of the mark draws itself once the rings have settled ---
  const ps = E.out(seg(t, 2.5, 2.9)), pb = E.out(seg(t, 2.6, 3.05));
  ctx.strokeStyle = IVORY; ctx.lineWidth = MARK.stroke * u;
  if (ps > 0) { ctx.beginPath(); ctx.moveTo(cx, cy + MARK.R * u); ctx.lineTo(cx, cy + lerp(MARK.R, MARK.standTo, ps) * u); ctx.stroke(); }
  if (pb > 0) { ctx.beginPath(); const n = 24; for (let i = 0; i <= n; i++) { const q = lerp(0.5 - pb / 2, 0.5 + pb / 2, i / n), x = lerp(lerp(-MARK.baseX, 0, q), lerp(0, MARK.baseX, q), q), y = lerp(lerp(MARK.baseY, MARK.baseCY, q), lerp(MARK.baseCY, MARK.baseY, q), q); if (i) ctx.lineTo(cx + x * u, cy + y * u); else ctx.moveTo(cx + x * u, cy + y * u); } ctx.stroke(); }

  // --- the mark lands: a glint across it, as a lens gives a bright point, and gone in a moment ---
  { const fl = E.smooth(seg(t, 2.5, 2.62)) * (1 - E.smooth(seg(t, 2.62, 3.0)));
    if (fl > 0.004) {
      const b = L.M * 0.62; ctx.globalAlpha = 0.5 * fl; ctx.drawImage(K.halo, cx - b, cy - b, b * 2, b * 2); ctx.globalAlpha = 1;
      const len = L.M * 1.7, lg = ctx.createLinearGradient(cx - len, cy, cx + len, cy); lg.addColorStop(0, "rgba(255,246,230,0)"); lg.addColorStop(0.5, rgba("#fff6e6", 0.55 * fl)); lg.addColorStop(1, "rgba(255,246,230,0)");
      ctx.strokeStyle = lg; ctx.lineWidth = Math.max(1, L.M * 0.012); ctx.beginPath(); ctx.moveTo(cx - len, cy); ctx.lineTo(cx + len, cy); ctx.stroke();
    } }

  // --- the name, letter by letter ---
  if (t > 2.7) {
    ctx.font = `600 ${L.fs}px ${FONT}`; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    for (let i = 0; i < NAME.length; i++) {
      const p = E.out5(seg(t, 2.7 + i * 0.045, 3.2 + i * 0.045));
      if (p > 0 && NAME[i] !== " ") { ctx.fillStyle = rgba(IVORY, p); ctx.fillText(NAME[i], L.tx + L.xs[i] + (1 - p) * L.fs * 0.5, L.ty); }
    }
  }
  // the first frames come up out of the dark
  const dark = 1 - E.out(seg(t, 0, 0.4));
  if (dark > 0.003) { ctx.fillStyle = rgba(SPACE, dark); ctx.fillRect(0, 0, W, H); }
}

// ---- when it plays: once a day on each device ----
export const OPENING_KEY = "om.opening.day";
/** The device's own calendar day, as 2026-11-19. */
export const dayOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Whether the opening plays now. Once a day on each device: the day it last played is kept on the device
 *  (`stored`). Not for a reader who has asked their device for less motion, and not in a browser driven by a
 *  program (the browser checks open a fresh one for every suite). `forced` (the address ends ?opening=1) plays
 *  it whatever the day, for looking at it again. */
export function openingDue(today: string, stored: string | null, o: { reducedMotion: boolean; automated: boolean; forced: boolean }): boolean {
  if (o.forced) return true;
  if (o.reducedMotion || o.automated) return false;
  return stored !== today;
}
