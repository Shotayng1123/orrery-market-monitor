// The opening (components/Opening.tsx, lib/opening.ts): from the sun out to the solar system and into the mark,
// once a day on each device, over the Monitor while it loads. A browser driven by a program gets none (every
// other suite opens a fresh browser and must find the Monitor at once), so the suites here say they are a person
// (navigator.webdriver false) except where that rule itself is checked.
// Run from web/:  node e2e/run.cjs opening   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const path = require("path");
const MOCK = "http://localhost:5179/orrery-market-monitor/", OUT = path.join(__dirname, ".out");
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const person = (ctx) => ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }); });
const today = (p) => p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
// what the layer shows: its box, and what is painted in the canvas (share of pixels that are not the ground,
// the warmest pixel, and how far the paint reaches towards the left and right edges on the middle band)
const look = (p) => p.evaluate(() => { const o = document.querySelector("#opening"); if (!o) return null; const c = o.querySelector("canvas"), r = o.getBoundingClientRect(), g = c.getContext("2d"), W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
  let lit = 0, warm = 0, minX = W, maxX = -1; const y0 = Math.round(H * 0.4), y1 = Math.round(H * 0.6);
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) { const i = (y * W + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2]; if (R + G + B > 60) { lit++; if (y >= y0 && y <= y1 && R + G + B > 330) { if (x < minX) minX = x; if (x > maxX) maxX = x; } } if (R > 170 && R - B > 70) warm++; }
  const n = Math.ceil(W / 3) * Math.ceil(H / 3), top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  return { cls: o.className, w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, cw: W, ch: H, lit: lit / n, warm: warm / n, left: minX / W, right: maxX / W, onTop: !!top && !!top.closest("#opening"), skip: !!o.querySelector(".skip") }; });
// the piece's own clock (seconds), which the canvas carries: the checks wait on it, not on the wall clock
const at = (p, sec) => p.waitForFunction((s) => Number(document.querySelector("#opening canvas")?.dataset.t ?? -1) >= s, sec, { timeout: 15000, polling: 50 });
const gone = (p, ms = 3000) => p.waitForFunction(() => !document.querySelector("#opening"), null, { timeout: ms }).then(() => true, () => false);

(async () => { const b = await chromium.launch();
  console.log("\n[desktop: the piece from its first second to its end]");
  { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await person(ctx); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    const t0 = Date.now(); await p.goto(MOCK + "#market", { waitUntil: "domcontentloaded" }); await p.waitForSelector("#opening canvas", { timeout: 8000 });
    await at(p, 0.9); const sun = await look(p); await p.screenshot({ path: path.join(OUT, "opening-1s.png") });
    ck("on a first visit of the day the opening lies over the whole screen, above the Monitor", !!sun && sun.w === sun.vw && sun.h === sun.vh && sun.onTop && sun.cls === "" && sun.skip, sun);
    ck(`at one second the sun is in the frame, warm and not filling it: ${sun ? Math.round(sun.warm * 100) : "?"}% of the screen is sunlit, the rest is dark space`, !!sun && sun.warm > 0.04 && sun.warm < 0.6 && sun.lit < 0.75, sun);
    const behind = await p.evaluate(() => ({ rows: document.querySelectorAll("#root table tbody tr, #root .mp-row").length, root: document.querySelector("#root").children.length }));
    ck("the Monitor loads behind it meanwhile", behind.root > 0, behind);
    await at(p, 2.8); const sys = await look(p); await p.screenshot({ path: path.join(OUT, "opening-3s.png") });
    ck("by the third second the eye has pulled back: the sun is a star, the orbits are in view", !!sys && sys.warm < sun.warm / 4 && sys.lit > 0.002, { warm1: sun?.warm, warm3: sys?.warm, lit: sys?.lit });
    await at(p, 7.2); const end = await look(p); await p.screenshot({ path: path.join(OUT, "opening-7s.png") });
    ck("in its last second the mark and the name stand alone in the middle of a dark screen", !!end && end.warm === 0 && end.lit > 0.002 && end.lit < 0.06 && end.left > 0.2 && end.right < 0.8 && end.left < 0.5 && end.right > 0.5, end);
    const off = await gone(p, 3500), took = (Date.now() - t0) / 1000;
    ck(`it ends by itself after eight seconds and is gone (${took.toFixed(1)} s from opening the page)`, off && took > 7.5 && took < 12.5, took);
    await p.waitForSelector("#root table tbody tr", { timeout: 8000 }); await p.locator("#topbar a[href='#news']").first().click(); await p.waitForTimeout(400);
    ck("the Monitor underneath is whole and takes clicks", (await p.evaluate(() => location.hash)) === "#news");
    ck("the day is kept on the device", (await p.evaluate(() => localStorage.getItem("om.opening.day"))) === (await today(p)));
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(700);
    ck("opened again the same day there is no opening", (await look(p)) === null);
    // the next day
    await p.evaluate(() => localStorage.setItem("om.opening.day", "2026-01-01")); await p.goto(MOCK + "#market", { waitUntil: "domcontentloaded" }); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector("#opening canvas", { timeout: 8000 }); await p.waitForTimeout(900);
    const hashBefore = await p.evaluate(() => location.hash);
    await p.mouse.click(300, 60);   // where a tab of the Monitor is, underneath
    const clicked = await gone(p, 2000);
    ck("on another day it plays again; a click anywhere ends it within a moment, and the click does not land on the Monitor underneath", clicked && (await p.evaluate(() => location.hash)) === hashBefore, { clicked, hashBefore });
    await p.evaluate(() => localStorage.setItem("om.opening.day", "2026-01-01")); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector("#opening canvas", { timeout: 8000 }); await p.waitForTimeout(700);
    await p.keyboard.press("2"); await p.waitForTimeout(300); const still = (await look(p)) !== null; await p.keyboard.press("Escape");
    ck("Esc ends it too; another key does not", still && (await gone(p, 2000)));
    await p.evaluate(() => localStorage.setItem("om.opening.day", "2026-01-01")); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector("#opening .skip", { timeout: 8000 }); await p.waitForTimeout(500);
    const sk = await p.evaluate(() => { const r = document.querySelector("#opening .skip").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom), text: document.querySelector("#opening .skip").textContent }; });
    await p.locator("#opening .skip").click();
    ck("SKIP sits at the foot of the screen and ends it", sk.text === "SKIP" && sk.w >= 40 && sk.h >= 40 && sk.right >= 0 && sk.bottom >= 0 && (await gone(p, 2000)), sk);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[phone]");
  { const ctx = await b.newContext({ ...devices["iPhone 13"] }); await person(ctx); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#market", { waitUntil: "domcontentloaded" }); await p.waitForSelector("#opening canvas", { timeout: 8000 }); await at(p, 2.8);
    const sys = await look(p); await p.screenshot({ path: path.join(OUT, "opening-phone-3s.png") });
    ck("on a phone it covers the screen, and the canvas is sharp without being larger than a phone can paint", !!sys && sys.w === sys.vw && sys.h === sys.vh && sys.onTop && sys.cw >= sys.vw && sys.cw * sys.ch <= 3.5e6, sys);
    await at(p, 7.2); const end = await look(p); await p.screenshot({ path: path.join(OUT, "opening-phone-7s.png") });
    ck("the mark and the name end inside the screen's width, in its middle", !!end && end.left > 0.04 && end.right < 0.96 && end.left < 0.4 && end.right > 0.6 && end.warm === 0, end);
    await p.evaluate(() => localStorage.setItem("om.opening.day", "2026-01-01")); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector("#opening canvas", { timeout: 8000 }); await p.waitForTimeout(700);
    const sk = await p.evaluate(() => { const r = document.querySelector("#opening .skip").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom) }; });
    await p.touchscreen.tap(195, 400);
    ck(`a tap anywhere ends it; SKIP is large enough for a finger (${sk.w}×${sk.h}px) and inside the screen`, (await gone(p, 2000)) && sk.w >= 44 && sk.h >= 44 && sk.right >= 0 && sk.bottom >= 0, sk);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[when it does not play]");
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" }); await person(ctx); const p = await ctx.newPage();
    await p.goto(MOCK + "#market", { waitUntil: "domcontentloaded" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(800);
    ck("a reader who has asked their device for less motion gets none, and no day is marked", (await look(p)) === null && (await p.evaluate(() => localStorage.getItem("om.opening.day"))) === null);
    await ctx.close(); }
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();   // as every other suite: a browser driven by a program
    await p.goto(MOCK + "#market", { waitUntil: "domcontentloaded" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(800);
    ck("a browser driven by a program gets none: the other checks find the Monitor at once", (await look(p)) === null);
    await p.evaluate(() => localStorage.setItem("om.opening.day", new Date().toISOString().slice(0, 10)));
    await p.goto(MOCK + "?opening=1#market", { waitUntil: "domcontentloaded" }); const forced = await p.waitForSelector("#opening canvas", { timeout: 8000 }).then(() => true, () => false);
    ck("the address ending ?opening=1 plays it whatever the day, for looking at it again", forced);
    await ctx.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
