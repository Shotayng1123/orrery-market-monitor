// The opening (Shota, 19 Nov 2026): from the sun, out to the whole solar system, into the Orrery mark and the
// name. Eight seconds: four pulling back, four on the mark. Drawn on a canvas, one frame from one time, so the
// same code gives the same picture on every screen and can be checked frame by frame (e2e/opening.cjs).
//
// The look, as asked: a real sun (limb darkening, granulation, spots; amber as through a filter while it fills
// the frame, white-gold once it is a star), planets as lit spheres in their own muted colours with the night
// side away from the sun, hairline orbits, a field of faint stars that stretch while the eye moves fastest.
// No flat colour fills the frame at any time. The planet that stays is the Earth: it becomes the mark's small
// dot. The mark it ends on is the header's own (components/Logo.tsx), stroke for stroke.
//
// When it plays (components/Opening.tsx): once a day on each device.

const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a));
const E = {
  inOut: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOut5: (t: number): number => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  out: (t: number): number => 1 - Math.pow(1 - t, 3),
  out5: (t: number): number => 1 - Math.pow(1 - t, 5),
  in2: (t: number): number => t * t,
};
const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (c1: string, c2: string, t: number): string => { const a = hex(c1), b = hex(c2); return "#" + a.map((v, i) => Math.round(lerp(v, b[i], clamp(t))).toString(16).padStart(2, "0")).join(""); };
const rgba = (c: string, a: number): string => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${clamp(a).toFixed(3)})`; };

/** Seconds of the whole piece, and of its first part (the pull-back). */
export const OPENING_S = 8, ZOOM_S = 4;
// the frames are written on a clock of four units, two for each part
const PACE = OPENING_S / 4;

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

// ---- what is made once: the stars, the asteroid belt, the sun's grain ----
let seed = 20261119;
const rnd = (): number => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const TINTS = ["#ffffff", "#ffffff", "#dfe8ff", "#fff3dc", "#ffe2c2"];
const STARS = Array.from({ length: 440 }, () => { const b = rnd(); return { a: rnd() * Math.PI * 2, d: 0.05 + Math.sqrt(rnd()) * 1.0, r: b > 0.93 ? 1.2 + rnd() * 0.7 : 0.45 + rnd() * 0.6, o: b > 0.93 ? 0.8 + rnd() * 0.2 : 0.22 + rnd() * 0.5, c: TINTS[Math.floor(rnd() * TINTS.length)], halo: b > 0.965 }; });
const BELT = Array.from({ length: 150 }, () => ({ a: rnd() * 360, R: 63 + rnd() * 16, o: 0.15 + rnd() * 0.3, sweep: 190 + rnd() * 40 }));
const SPOTS = [{ x: -0.3, y: 0.14, r: 0.034 }, { x: -0.22, y: 0.19, r: 0.017 }, { x: 0.34, y: -0.24, r: 0.024 }, { x: 0.06, y: 0.42, r: 0.015 }];

let grain: CanvasPattern | null = null, grainFor: CanvasRenderingContext2D | null = null;
const GRAIN = 256;
/** The sun's granulation: a tile of light cells and dark lanes that repeats without a seam. */
function grainOf(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grain && grainFor === ctx) return grain;
  const c = document.createElement("canvas"); c.width = c.height = GRAIN;
  const g = c.getContext("2d"); if (!g) return null;
  g.fillStyle = "#808080"; g.fillRect(0, 0, GRAIN, GRAIN);
  let s = 77; const r = (): number => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const blob = (x: number, y: number, rad: number, col: string): void => { for (const dx of [-GRAIN, 0, GRAIN]) for (const dy of [-GRAIN, 0, GRAIN]) { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(128,128,128,0)"); g.fillStyle = gr; g.beginPath(); g.arc(x + dx, y + dy, rad, 0, 7); g.fill(); } };
  for (let i = 0; i < 520; i++) blob(r() * GRAIN, r() * GRAIN, 5 + r() * 7, "rgba(255,255,255,0.34)");
  for (let i = 0; i < 620; i++) blob(r() * GRAIN, r() * GRAIN, 2.5 + r() * 4, "rgba(0,0,0,0.36)");
  grain = ctx.createPattern(c, "repeat"); grainFor = ctx;
  return grain;
}

interface Lockup { M: number; fs: number; tw: number; cx: number; cy: number; tx: number; ty: number }
/** Where the mark and the name end: side by side as in the header, centred, never wider than the screen. */
function lockup(ctx: CanvasRenderingContext2D, W: number, H: number): Lockup {
  const s = Math.min(W, H), gapK = 0.16;
  let M = Math.min(s * 0.2, 124), fs = M * 0.56;
  const width = (f: number): number => { ctx.font = `600 ${f}px ${FONT}`; return ctx.measureText(NAME).width + f * 0.06 * (NAME.length - 1); };
  let tw = width(fs);
  const total = M + M * gapK + tw, room = W * 0.84;
  if (total > room) { const k = room / total; M *= k; fs *= k; tw = width(fs); }
  const left = W / 2 - (M + M * gapK + tw) / 2;
  return { M, fs, tw, cx: left + M / 2, cy: H / 2 - (M * 8) / 200, tx: left + M + M * gapK, ty: H / 2 + fs * 0.3 };
}
const onEllipse = (rx: number, ry: number, rotDeg: number, aDeg: number): [number, number] => { const a = (aDeg * Math.PI) / 180, r = (rotDeg * Math.PI) / 180, x = rx * Math.cos(a), y = ry * Math.sin(a); return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]; };

// The pull-back, on the clock of four units. Three movements: from the sun out to the whole system (to T_SYS),
// a moment with all of it in view while the eye still drifts back (to T_HOLD), then the fall into the mark
// (to T_MARK). `lk` are the natural logs of the scale (pixels per mark unit) at the sun, the system and the mark.
const T_SYS = 1.2, T_HOLD = 1.5, T_MARK = 2.05, DRIFT = Math.log(0.86);
const logScale = (t: number, lk0: number, lkS: number, lk1: number): number =>
  t <= T_SYS ? lerp(lk0, lkS, 0.25 * E.out(t / T_SYS) + 0.75 * E.inOut(t / T_SYS))
  : t <= T_HOLD ? lerp(lkS, lkS + DRIFT, E.inOut(seg(t, T_SYS, T_HOLD)))
  : lerp(lkS + DRIFT, lk1, E.inOut5(seg(t, T_HOLD, T_MARK)));

/** A planet as a sphere lit from the sun, which is at the origin: the day side towards it, the night side away. */
function sphere(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, a: number, p?: Planet): void {
  const d = Math.hypot(x, y) || 1, lx = -x / d, ly = -y / d;
  if (p?.rings) { ctx.strokeStyle = rgba(mix(col, "#000000", 0.25), 0.7 * a); ctx.lineWidth = Math.max(0.8, r * 0.3); ctx.beginPath(); ctx.ellipse(x, y, r * 2.05, r * 0.62, (-18 * Math.PI) / 180, Math.PI, Math.PI * 2); ctx.stroke(); }
  const g = ctx.createRadialGradient(x + lx * r * 0.5, y + ly * r * 0.5, 0, x + lx * r * 0.15, y + ly * r * 0.15, r * 1.25);
  g.addColorStop(0, rgba(mix(col, "#ffffff", 0.42), a)); g.addColorStop(0.38, rgba(col, a)); g.addColorStop(0.74, rgba(mix(col, "#000000", 0.74), a)); g.addColorStop(1, rgba(mix(col, "#000000", 0.93), a));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  if (p?.bands && r > 4) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip(); ctx.fillStyle = rgba("#5a3a1e", 0.24 * a); for (const o of [-0.42, -0.08, 0.3]) ctx.fillRect(x - r, y + o * r, r * 2, r * 0.16); ctx.restore(); }
  if (p?.rings) { ctx.strokeStyle = rgba(mix(col, "#ffffff", 0.15), 0.85 * a); ctx.lineWidth = Math.max(0.8, r * 0.3); ctx.beginPath(); ctx.ellipse(x, y, r * 2.05, r * 0.62, (-18 * Math.PI) / 180, 0, Math.PI); ctx.stroke(); }
}

/** One frame: the opening at `seconds` (0 to OPENING_S) on a canvas of W by H CSS pixels. */
export function renderOpening(ctx: CanvasRenderingContext2D, W: number, H: number, seconds: number): void {
  const t = clamp(seconds / PACE, 0, 4);
  const L = lockup(ctx, W, H), u = L.M / 200, diag = Math.hypot(W, H), minS = Math.min(W, H);
  const m = E.inOut(seg(t, T_HOLD, T_MARK));   // how far the system has settled into the mark
  // the scale, pixels per mark unit: the sun filling the frame, the whole system fitted to the screen, the mark
  const tall = H > W * 1.15, spinTo = tall ? SPIN_TALL : SPIN_WIDE, th = (spinTo * Math.PI) / 180;
  const kSys = Math.min((0.47 * W) / (R_OUT * Math.hypot(Math.cos(th), TILT * Math.sin(th))), (0.46 * H) / (R_OUT * Math.hypot(Math.sin(th), TILT * Math.cos(th))));
  const lk0 = Math.log((SUN0 * minS) / S0), lkS = Math.log(Math.max(kSys, u * 1.5)), lk1 = Math.log(u);
  const k = Math.exp(logScale(t, lk0, lkS, lk1)), zt = seg(lk0 - Math.log(k), 0, lk0 - lk1);
  const speed = Math.abs(logScale(Math.min(4, t + 0.016), lk0, lkS, lk1) - logScale(Math.max(0, t - 0.016), lk0, lkS, lk1)) / 0.032;   // how fast the eye is moving
  // the system's centre: a little off the middle at first, the middle with the whole system in view, then its place in the lockup
  const off = 1 - E.out(seg(t, 0, T_SYS)), g = E.inOut(seg(t, T_HOLD + 0.05, 2.3));
  const cx = lerp(W / 2 - 0.1 * W * off, L.cx, g), cy = lerp(H / 2 + 0.07 * H * off, L.cy, g);
  const spin = lerp(spinTo - 26, spinTo, E.out(seg(t, 0, T_MARK))) * (1 - m), tilt = lerp(TILT, 1, m);
  const turn = seg(t, 0, T_MARK), sweep = 0.5 * E.out(turn) + 0.5 * turn;   // the planets keep going round while the system is in view

  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = SPACE; ctx.fillRect(0, 0, W, H);
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // --- deep space: a faint band of light across the frame, then the stars ---
  const starFade = lerp(0.3, 1, seg(t, 0.25, 1.1)) * (1 - 0.78 * seg(t, 1.8, 2.5)) * (1 - seg(t, 2.9, 3.6));
  if (starFade > 0.004) {
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.42);
    const band = ctx.createLinearGradient(0, -minS * 0.34, 0, minS * 0.34);
    band.addColorStop(0, "rgba(120,140,190,0)"); band.addColorStop(0.5, rgba("#8fa3cf", 0.04 * starFade)); band.addColorStop(1, "rgba(120,140,190,0)");
    ctx.fillStyle = band; ctx.fillRect(-diag, -minS * 0.34, diag * 2, minS * 0.68); ctx.restore();
    const R = diag * 0.62, drift = 1 + 0.5 * (1 - zt);
    for (const st of STARS) {
      const d = st.d * R * drift, x = W / 2 + Math.cos(st.a) * d, y = H / 2 + Math.sin(st.a) * d * 0.86;
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      const len = Math.min(44, speed * 5 * st.d), a = st.o * starFade;
      if (len > 2.2) { ctx.strokeStyle = rgba(st.c, a * 0.7); ctx.lineWidth = Math.max(0.6, st.r * 0.8); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(st.a) * len, y + Math.sin(st.a) * len * 0.86); ctx.stroke(); continue; }
      if (st.halo) { const h = ctx.createRadialGradient(x, y, 0, x, y, st.r * 5); h.addColorStop(0, rgba(st.c, 0.3 * a)); h.addColorStop(1, rgba(st.c, 0)); ctx.fillStyle = h; ctx.beginPath(); ctx.arc(x, y, st.r * 5, 0, 7); ctx.fill(); }
      ctx.fillStyle = rgba(st.c, a); ctx.beginPath(); ctx.arc(x, y, st.r, 0, 7); ctx.fill();
    }
  }

  ctx.save(); ctx.translate(cx, cy); ctx.rotate((spin * Math.PI) / 180);

  // --- the orbits that are not part of the mark, and the asteroid belt: they go as the system settles ---
  const aOrb = (1 - m) * seg(t, 0.2, 0.7);
  if (aOrb > 0.004) {
    ctx.lineWidth = 1;
    for (let i = 0; i < ORBITS.length; i++) { const r = ORBITS[i] * k; if (r > diag * 1.2) continue; ctx.strokeStyle = rgba(IVORY, aOrb * 0.22); ctx.beginPath(); ctx.ellipse(0, 0, r, r * tilt, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (k * 80 < diag) for (const b of BELT) { const [x, y] = onEllipse(b.R * k, b.R * k * tilt, 0, b.a + b.sweep * sweep); ctx.fillStyle = rgba("#b9b2a6", b.o * aOrb); ctx.fillRect(x, y, 1.1, 1.1); }
  }

  // --- the three orbits that become the mark's rings ---
  const lw = lerp(1.1, MARK.stroke * u, E.in2(m)), aRing = seg(t, 0.25, 0.8);
  const ring = RINGS.map((r) => ({ rx: lerp(r.r0, MARK.R, m) * k, ry: lerp(r.r0 * TILT, r.ry, m) * k, rot: r.rot * m }));
  for (const r of ring) { if (r.rx > diag * 1.3) continue; ctx.strokeStyle = rgba(IVORY, aRing * lerp(0.42, 1, m)); ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0.01, r.rx), Math.max(0.01, r.ry), (r.rot * Math.PI) / 180, 0, Math.PI * 2); ctx.stroke(); }

  // --- the planets: they go round while the eye pulls back, and leave a faint wake when it moves fastest ---
  const aPl = (1 - E.inOut(seg(t, T_HOLD + 0.05, 1.9))) * seg(t, 0.2, 0.6), wake = Math.min(46, 3 + speed * 8);
  // a wake is an arc of the orbit behind the planet, fading in three steps; never longer than a short stroke on screen
  const trail = (rx: number, ry: number, rotDeg: number, a: number, w: number, alpha: number): void => { const deg = Math.min(wake, (90 / Math.max(1, rx)) * (180 / Math.PI)); for (let i = 0; i < 3; i++) { ctx.strokeStyle = rgba(IVORY, alpha * (0.16 - i * 0.05)); ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, (rotDeg * Math.PI) / 180, ((a - (deg * (i + 1)) / 3) * Math.PI) / 180, ((a - (deg * i) / 3) * Math.PI) / 180); ctx.stroke(); } };
  if (aPl > 0.004) for (const p of PLANETS) {
    const a = p.a0 + p.sweep * sweep, [x, y] = onEllipse(p.R * k, p.R * k * tilt, 0, a), r = Math.max(1.1, p.r * clamp(k, 0.5, 3.1));
    if (Math.abs(x) > diag || Math.abs(y) > diag) continue;
    if (wake > 5) trail(p.R * k, p.R * k * tilt, 0, a, Math.max(0.7, r * 0.22), aPl);
    sphere(ctx, x, y, r, p.col, aPl, p);
  }
  // the Earth stays: it rides the second orbit and comes to rest where the mark has its small dot
  { const r2 = ring[1], a = EARTH_END - 330 * (1 - sweep), [x, y] = onEllipse(r2.rx, r2.ry, r2.rot, a), pr = lerp(Math.max(2, 2.5 * clamp(k, 0.5, 3)), MARK.planet * u, m), flat = E.inOut(seg(t, 1.7, T_MARK));
    if (wake > 5 && m < 0.9) trail(r2.rx, r2.ry, r2.rot, a, Math.max(0.7, pr * 0.22), aRing * (1 - m));
    ctx.globalAlpha = aRing;
    if (flat < 1) sphere(ctx, x, y, pr, EARTH, 1);
    if (flat > 0) { ctx.fillStyle = rgba(IVORY, flat); ctx.beginPath(); ctx.arc(x, y, pr, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1; }

  // --- the sun: most of the frame at first, the mark's centre at the end ---
  { const rs = lerp(S0, MARK.sun, m) * k, hot = 1 - E.inOut(seg(t, 1.62, T_MARK)), near = clamp(rs / (0.3 * minS));
    if (hot > 0.004) {
      // its light around it: slight while it fills the frame (as through a filter), a bloom once it is a star
      const glow = lerp(0.5, 0.1, near) * hot, gr = rs * lerp(4.2, 1.9, near), cor = ctx.createRadialGradient(0, 0, rs * 0.85, 0, 0, gr);
      cor.addColorStop(0, rgba("#ffd9a0", glow)); cor.addColorStop(0.3, rgba("#ffae5e", glow * 0.32)); cor.addColorStop(1, rgba("#ff9a3c", 0));
      ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(0, 0, gr, 0, 7); ctx.fill();
      // the disc, darker towards its limb
      const disc = ctx.createRadialGradient(0, 0, 0, 0, 0, rs);
      disc.addColorStop(0, rgba(mix("#fffaf0", "#ffd98a", near), hot)); disc.addColorStop(0.5, rgba(mix("#fff0cf", "#ffb347", near), hot)); disc.addColorStop(0.8, rgba(mix("#ffd59a", "#f08a24", near), hot));
      disc.addColorStop(0.93, rgba(mix("#ffb561", "#c9560f", near), hot)); disc.addColorStop(1, rgba(mix("#f08a2a", "#7d2c08", near), hot));
      ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(0, 0, rs, 0, 7); ctx.fill();
      // its surface, while it is large enough to be seen: the grain, and a few spots
      if (rs > 26 && near > 0.03) {
        const pat = grainOf(ctx), tile = clamp(rs * 0.42, 70, 250) / GRAIN;
        ctx.save(); ctx.beginPath(); ctx.arc(0, 0, rs, 0, 7); ctx.clip(); ctx.rotate(t * 0.05);
        if (pat) { ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = 0.55 * near * hot; ctx.scale(tile, tile); ctx.fillStyle = pat; ctx.fillRect(-rs / tile, -rs / tile, (2 * rs) / tile, (2 * rs) / tile); ctx.scale(1 / tile, 1 / tile); }
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        for (const s of SPOTS) { const x = s.x * rs, y = s.y * rs, r = s.r * rs, sg = ctx.createRadialGradient(x, y, 0, x, y, r * 1.9); sg.addColorStop(0, rgba("#2a0d02", 0.9 * near * hot)); sg.addColorStop(0.45, rgba("#5a2206", 0.7 * near * hot)); sg.addColorStop(1, rgba("#8a3a0c", 0)); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, 7); ctx.fill(); }
        ctx.restore();
      }
      // once it is a star, the thin cross a lens makes of a point of light
      const point = (1 - near) * hot * seg(t, 0.7, 1.1);
      if (point > 0.01) { ctx.save(); ctx.rotate((-spin * Math.PI) / 180); for (const [dx, dy] of [[1, 0], [0, 1]]) { const len = (rs * 3.2 + 10) * (dy ? 0.7 : 1), lg = ctx.createLinearGradient(-dx * len, -dy * len, dx * len, dy * len); lg.addColorStop(0, "rgba(255,236,200,0)"); lg.addColorStop(0.5, rgba("#fff1d6", 0.3 * point)); lg.addColorStop(1, "rgba(255,236,200,0)"); ctx.strokeStyle = lg; ctx.lineWidth = Math.max(0.8, rs * 0.1); ctx.beginPath(); ctx.moveTo(-dx * len, -dy * len); ctx.lineTo(dx * len, dy * len); ctx.stroke(); } ctx.restore(); }
    }
    ctx.fillStyle = rgba(IVORY, 1 - hot); ctx.beginPath(); ctx.arc(0, 0, rs, 0, 7); ctx.fill(); }
  ctx.restore();

  // --- the edges of the frame fall away, as in a lens ---
  { const v = ctx.createRadialGradient(W / 2, H / 2, minS * 0.38, W / 2, H / 2, diag * 0.62); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(0,0,0,${(0.62 * (1 - seg(t, 2.4, 3.2))).toFixed(3)})`); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H); }

  // --- the stand of the mark draws itself once the rings have settled ---
  const ps = E.out(seg(t, 1.95, 2.3)), pb = E.out(seg(t, 2.05, 2.45));
  ctx.strokeStyle = IVORY; ctx.lineWidth = MARK.stroke * u;
  if (ps > 0) { ctx.beginPath(); ctx.moveTo(cx, cy + MARK.R * u); ctx.lineTo(cx, cy + lerp(MARK.R, MARK.standTo, ps) * u); ctx.stroke(); }
  if (pb > 0) { ctx.beginPath(); const n = 24; for (let i = 0; i <= n; i++) { const q = lerp(0.5 - pb / 2, 0.5 + pb / 2, i / n), x = lerp(lerp(-MARK.baseX, 0, q), lerp(0, MARK.baseX, q), q), y = lerp(lerp(MARK.baseY, MARK.baseCY, q), lerp(MARK.baseCY, MARK.baseY, q), q); if (i) ctx.lineTo(cx + x * u, cy + y * u); else ctx.moveTo(cx + x * u, cy + y * u); } ctx.stroke(); }

  // --- the mark lands: a glint across it, as a lens gives a bright point, and gone in a moment ---
  { const fl = seg(t, 1.97, 2.05) * (1 - seg(t, 2.05, 2.35));
    if (fl > 0.004) {
      const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, L.M * 0.62); bloom.addColorStop(0, rgba("#fff6e6", 0.2 * fl)); bloom.addColorStop(1, "rgba(255,246,230,0)"); ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(cx, cy, L.M * 0.62, 0, 7); ctx.fill();
      const len = L.M * 1.7, lg = ctx.createLinearGradient(cx - len, cy, cx + len, cy); lg.addColorStop(0, "rgba(255,246,230,0)"); lg.addColorStop(0.5, rgba("#fff6e6", 0.55 * fl)); lg.addColorStop(1, "rgba(255,246,230,0)");
      ctx.strokeStyle = lg; ctx.lineWidth = Math.max(1, L.M * 0.012); ctx.beginPath(); ctx.moveTo(cx - len, cy); ctx.lineTo(cx + len, cy); ctx.stroke();
    } }

  // --- the name, letter by letter ---
  ctx.font = `600 ${L.fs}px ${FONT}`; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  const ls = L.fs * 0.06;
  for (let i = 0; i < NAME.length; i++) {
    const p = E.out5(seg(t, 2.1 + i * 0.038, 2.5 + i * 0.038));
    if (p > 0) { ctx.fillStyle = rgba(IVORY, p); ctx.fillText(NAME[i], L.tx + ctx.measureText(NAME.slice(0, i)).width + i * ls + (1 - p) * L.fs * 0.5, L.ty); }
  }
  // the first frames come up out of the dark
  const dark = 1 - E.out(seg(t, 0, 0.3));
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
