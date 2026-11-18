// Draws the welcome email's two pictures and saves them as PNG (web/public/mail, served by the site; the email
// is supabase/functions/_shared/welcome.ts). Run from web/ after changing the drawing:
//   node tools/mail-pictures.cjs public/mail
//   orrery.png   the banner: a brass orrery seen from above and a little to one side (1200x440, shown at 600x220)
//   mark.png     the Monitor's own mark (web/src/components/Logo.tsx), ivory on nothing (128x128, shown at 30x30)
const { chromium } = require("playwright");
const out = process.argv[2];
let seed = 20261119; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const W = 1200, H = 440, cx = 600, cy = 226, TILT = 0.30, ROT = -7;
const orbits = [78, 132, 196, 270, 356, 452, 556];
// planets: orbit index, angle in degrees, radius, colour, ring?
const planets = [[0, 205, 5, "#d8c49a"], [1, 318, 8, "#e8e5de"], [2, 62, 9.5, "#1fd1c1"], [3, 148, 7, "#ff6f61"], [4, 12, 17, "#e3c98f"], [5, 226, 14, "#d9cdb4", true], [6, 338, 10, "#9fd8e8"]];
const pt = (r, deg) => { const a = (deg * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * TILT * Math.sin(a)]; };
let stars = ""; for (let i = 0; i < 150; i++) { const x = rnd() * W, y = rnd() * H, r = 0.5 + rnd() * 1.1, o = 0.12 + rnd() * 0.5; stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#e8e5de" opacity="${o.toFixed(2)}"/>`; }
let rings = ""; orbits.forEach((r, i) => { rings += `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${(r * TILT).toFixed(1)}" fill="none" stroke="url(#brass)" stroke-width="${i === orbits.length - 1 ? 2.4 : 1.6}" opacity="${(0.78 - i * 0.06).toFixed(2)}"/>`; });
// the engraved scale on the outer ring: a tick every 5 degrees, longer every 30
let ticks = ""; const R = orbits[orbits.length - 1]; for (let d = 0; d < 360; d += 5) { const long = d % 30 === 0, [x1, y1] = pt(R + 5, d), [x2, y2] = pt(R + (long ? 20 : 12), d); ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#c9a66b" stroke-width="${long ? 1.8 : 1}" opacity="${long ? 0.6 : 0.34}"/>`; }
let arms = "", bodies = "";
for (const [oi, deg, pr, col, ring] of planets) { const [x, y] = pt(orbits[oi], deg);
  arms += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#c9a66b" stroke-width="1.1" opacity="0.26"/>`;
  bodies += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${pr * 2.6}" fill="${col}" opacity="0.10"/>`
    + (ring ? `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${pr * 2.1}" ry="${pr * 0.62}" fill="none" stroke="${col}" stroke-width="2" opacity="0.8" transform="rotate(-18 ${x.toFixed(1)} ${y.toFixed(1)})"/>` : "")
    + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${pr}" fill="url(#p${oi})"/>`; }
const grads = planets.map(([oi, , , col]) => `<radialGradient id="p${oi}" cx="35%" cy="32%" r="75%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="0.28" stop-color="${col}"/><stop offset="1" stop-color="${col}" stop-opacity="0.55"/></radialGradient>`).join("");
const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <radialGradient id="glow" cx="50%" cy="51%" r="60%"><stop offset="0" stop-color="#3a1a14" stop-opacity="0.95"/><stop offset="0.35" stop-color="#170b09" stop-opacity="0.75"/><stop offset="1" stop-color="#050505" stop-opacity="0"/></radialGradient>
  <linearGradient id="brass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d7448"/><stop offset="0.5" stop-color="#e6cf9c"/><stop offset="1" stop-color="#8d7448"/></linearGradient>
  <radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff3e0"/><stop offset="0.38" stop-color="#ffb199"/><stop offset="0.72" stop-color="#ff6f61"/><stop offset="1" stop-color="#ff6f61" stop-opacity="0"/></radialGradient>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.78" stop-color="#050505" stop-opacity="0"/><stop offset="1" stop-color="#050505"/></linearGradient>
  ${grads}
</defs>
<rect width="${W}" height="${H}" fill="#050505"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
${stars}
<g transform="rotate(${ROT} ${cx} ${cy})">${ticks}${rings}${arms}
  <circle cx="${cx}" cy="${cy}" r="64" fill="url(#sun)" opacity="0.5"/><circle cx="${cx}" cy="${cy}" r="30" fill="url(#sun)"/><circle cx="${cx}" cy="${cy}" r="13" fill="#fff6ea"/>
  ${bodies}</g>
<rect width="${W}" height="${H}" fill="url(#fade)"/>
</svg>`;
const mark = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 200 200" fill="none" stroke="#e8e5de" stroke-width="7" stroke-linecap="round"><circle cx="100" cy="92" r="70"/><ellipse cx="100" cy="92" rx="70" ry="22"/><ellipse cx="100" cy="92" rx="70" ry="46" transform="rotate(-32 100 92)"/><circle cx="100" cy="92" r="7" fill="#e8e5de" stroke="none"/><circle cx="114.1" cy="38.8" r="5.25" fill="#e8e5de" stroke="none"/><line x1="100" y1="162" x2="100" y2="182"/><path d="M72 186 Q100 176 128 186"/></svg>`;
(async () => { const b = await chromium.launch();
  for (const [name, svg, w, h, clear] of [["orrery.png", banner, W, H, false], ["mark.png", mark, 128, 128, true]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.setContent(`<html><body style="margin:0;background:${clear ? "transparent" : "#050505"}">${svg}</body></html>`);
    await p.screenshot({ path: `${out}/${name}`, omitBackground: clear, clip: { x: 0, y: 0, width: w, height: h } }); await p.close(); }
  await b.close(); })();
