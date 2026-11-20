// The pointer on a chart, and dragging one (Shota, 19 Nov 2026: "the pointer on the chart sometimes locates very
// different from where my cursor is"; "drag and move chart should be opposite direction").
//  - The crosshair is under the pointer at every scale of the page (the page is scaled to the window, and by the
//    size chosen by hand), and stays there when the chart has moved on the page since the pointer entered it.
//  - A chart that is dragged follows the hand: to the right brings the earlier history in, and the bar that was
//    grabbed stays under the pointer.
// Run from web/:  node e2e/run.cjs chart-pointer   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const size = (ctx, s) => ctx.addInitScript((k) => { try { localStorage.setItem("om_prefs", JSON.stringify({ size: k, compact: false, v: 2 })); } catch {} }, s);
// the crosshair's two lines, where they are on the screen
const cross = (p, sel) => p.evaluate((s) => { const o = document.querySelector(s + " .u-over"), x = o.querySelector(".u-cursor-x"), y = o.querySelector(".u-cursor-y"), bx = x.getBoundingClientRect(), by = y.getBoundingClientRect(); return { x: bx.left + bx.width / 2, y: by.top + by.height / 2, z: Number(document.body.style.getPropertyValue("--z")) || 1 }; }, sel);
const hover = async (p, x, y) => { await p.mouse.move(x, y, { steps: 3 }); await p.waitForTimeout(120); };

(async () => { const b = await chromium.launch();
  console.log("\n[the crosshair is under the pointer, at every scale of the page]");
  for (const [name, w, h, sz] of [["a 1,920-pixel window, size AUTO", 1920, 1080, "AUTO"], ["a 1,440-pixel window, size XL", 1440, 900, "XL"], ["a 1,440-pixel window, size S", 1440, 900, "S"], ["a 2,560-pixel window, size AUTO", 2560, 1300, "AUTO"]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }); await size(ctx, sz); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#asset/NVDA", { waitUntil: "networkidle" }); await p.waitForSelector(".bigwrap .u-over"); await p.waitForTimeout(700);
    await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(200);
    const box = await p.locator(".bigwrap .u-over").boundingBox(); let worst = 0, z = 1; const at = [];
    for (const [fx, fy] of [[0.08, 0.2], [0.5, 0.5], [0.93, 0.85]]) { const mx = box.x + box.width * fx, my = box.y + box.height * fy; await hover(p, mx, my); const c = await cross(p, ".bigwrap"); z = c.z; worst = Math.max(worst, Math.abs(c.x - mx), Math.abs(c.y - my)); at.push([Math.round(mx), Math.round(c.x), Math.round(my), Math.round(c.y)]); }
    ck(`${name} (the page drawn at ${z}): at the left, the middle and the right of the chart the crosshair is within ${worst.toFixed(1)} px of the pointer`, worst <= 1.5 && errs.length === 0, { at, errs });
    // the chart moves on the page while the pointer rests inside it (something above or beside it changes size): no
    // scroll, no resize. Moved here by a set share of its own size and without a new layout, so that the pointer is
    // still inside it whatever the fonts and the wrapping of the machine the check runs on (on GitHub's the first
    // version of this check, which gave the grid a margin, moved the chart 138 px down and from under the pointer).
    const mx = box.x + box.width * 0.7, my = box.y + box.height * 0.5; await hover(p, mx, my);
    await p.evaluate(([dx, dy]) => { const g = document.querySelector("#grid"); g.style.position = "relative"; g.style.left = dx + "px"; g.style.top = dy + "px"; }, [box.width * 0.15 / z, box.height * 0.25 / z]); await p.waitForTimeout(150);
    const moved = await p.locator(".bigwrap .u-over").boundingBox();
    const inside = mx + 6 > moved.x + 20 && mx + 6 < moved.x + moved.width - 20 && my + 4 > moved.y + 20 && my + 4 < moved.y + moved.height - 20;
    await hover(p, mx + 6, my + 4); const c2 = await cross(p, ".bigwrap"), off = Math.max(Math.abs(c2.x - (mx + 6)), Math.abs(c2.y - (my + 4)));
    ck(`after the chart has moved ${Math.round(moved.x - box.x)} px across and ${Math.round(moved.y - box.y)} px down under a pointer that stayed inside it, the crosshair is still within ${off.toFixed(1)} px of the pointer`, moved.x - box.x > 40 && moved.y - box.y > 30 && Math.abs(moved.width - box.width) < 1 && inside && off <= 1.5, { box, moved, inside, c2, want: [mx + 6, my + 4] });
    await ctx.close();
  }

  console.log("\n[every chart of the Monitor: the yield curves, the policy rates and the tiles as well]");
  for (const [tab, least] of [["market", 8], ["rates", 8], ["equities", 4]]) {
    const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } }); await size(ctx, "AUTO"); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#" + tab, { waitUntil: "networkidle" }); await p.waitForSelector(".u-over"); await p.waitForTimeout(1200);
    await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(200);
    const n = await p.locator(".u-over").count(); let worst = 0, seen = 0; const bad = [];
    for (let i = 0; i < n; i++) {
      const el = p.locator(".u-over").nth(i); await el.scrollIntoViewIfNeeded().catch(() => undefined); await p.waitForTimeout(120);
      const box = await el.boundingBox(); if (!box || box.width < 30 || box.height < 30) continue;
      // near the right edge: where the old reading was furthest out
      const mx = box.x + box.width * 0.9, my = box.y + box.height * 0.5; await p.mouse.move(mx - 20, my); await hover(p, mx, my);
      const c = await el.evaluate((o) => { const bx = o.querySelector(".u-cursor-x").getBoundingClientRect(), by = o.querySelector(".u-cursor-y").getBoundingClientRect(); return { x: bx.left + bx.width / 2, y: by.top + by.height / 2 }; });
      const off = Math.max(Math.abs(c.x - mx), Math.abs(c.y - my)); worst = Math.max(worst, off); seen++; if (off > 1.5) bad.push([i, Math.round(mx), Math.round(c.x), Math.round(my), Math.round(c.y)]);
    }
    ck(`${tab.toUpperCase()}, a 1,920-pixel window: on each of its ${seen} charts the crosshair is within ${worst.toFixed(1)} px of a pointer near the chart's right edge`, seen >= least && !bad.length && errs.length === 0, { seen, bad, errs });
    await ctx.close();
  }

  console.log("\n[the same in a browser that gives an element's rectangle in layout pixels]");
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    await p.goto(MOCK + "#market", { waitUntil: "domcontentloaded" }); await p.waitForSelector("#topbar");
    const r = await p.evaluate(async () => { const m = await import("/orrery-market-monitor/src/lib/chart.ts"), z = 1.28;
      // one chart, 500 layout pixels wide, 640 on screen, whose left edge is 640 screen pixels from the window's; the pointer 360 screen pixels into it
      const screen = m.insideEl(1000, 700, { left: 640, top: 384, width: 640, height: 256 }, 500, 200, z);
      const layout = m.insideEl(1000, 700, { left: 500, top: 300, width: 500, height: 200 }, 500, 200, z);
      const plain = m.insideEl(1000, 700, { left: 640, top: 384, width: 500, height: 200 }, 500, 200, 1);
      const rounded = m.insideEl(1000, 700, { left: 640, top: 384, width: 640.3, height: 256.2 }, 500, 200, z);
      return { screen, layout, plain, rounded }; });
    const near = (a, b2) => Math.abs(a[0] - b2[0]) < 0.01 && Math.abs(a[1] - b2[1]) < 0.01;
    ck("the pointer's place in the chart comes out the same whether the browser gives the chart's rectangle in screen pixels or in layout pixels (281.25, 246.875), and plainly when the page is not scaled", near(r.screen, [281.25, 246.875]) && near(r.layout, [281.25, 246.875]) && near(r.plain, [360, 316]) && near(r.rounded, [281.25, 246.875]), r);
    await ctx.close(); }

  console.log("\n[a dragged chart follows the hand]");
  for (const [name, w, h, sz] of [["a 1,440-pixel window", 1440, 900, "AUTO"], ["a 1,920-pixel window, the page drawn larger", 1920, 1080, "AUTO"]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }); await size(ctx, sz); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#asset/NVDA", { waitUntil: "networkidle" }); await p.waitForSelector(".bigwrap .u-over"); await p.waitForTimeout(700);
    await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(200);
    const box = await p.locator(".bigwrap .u-over").boundingBox(), y = box.y + box.height * 0.45;
    // the day under the pointer, from the tip's "31 Jul 2026  182.44 …" (the Monitor's one date format, I-5), as
    // "2026-07-31" so that days compare as text and Date.parse reads them
    const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const isoOf = (t) => { const m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})\b/.exec(t ?? ""); return m && MONS.includes(m[2]) ? `${m[3]}-${String(MONS.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}` : `unread: ${t}`; };
    const tipAt = async (x) => { await hover(p, x, y); return isoOf(await p.locator(".bigwrap .ctip").textContent()); };
    const label = async () => (await p.locator(".bigwrap .rdout").textContent()) ?? "";
    const drag = async (x0, x1) => { await p.mouse.move(x0, y); await p.mouse.down(); await p.mouse.move((x0 + x1) / 2, y, { steps: 4 }); await p.mouse.move(x1, y, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(200); };
    const x0 = box.x + box.width * 0.35, grabbed = await tipAt(x0), last0 = await tipAt(box.x + box.width - 3);
    await p.mouse.move(5, 5); await p.waitForTimeout(100); const before = await label();
    // to the left, with the latest bar already at the right edge: there is nothing later to bring in
    await drag(box.x + box.width * 0.6, box.x + box.width * 0.6 - 180); const stillLast = await tipAt(box.x + box.width - 3);
    await p.mouse.move(5, 5); await p.waitForTimeout(100); const afterLeft = await label();
    ck(`${name}: dragged to the left from the latest bar, nothing moves (there is nothing later to show)`, stillLast === last0 && !/back/.test(afterLeft), { last0, stillLast, afterLeft });
    // to the right: the earlier history comes in from the left, and the bar that was grabbed is under the pointer where it was let go
    const dx = Math.round(box.width * 0.3); await drag(x0, x0 + dx);
    const under = await tipAt(x0 + dx), lastNow = await tipAt(box.x + box.width - 3);
    await p.mouse.move(5, 5); await p.waitForTimeout(100); const afterRight = await label();
    const days = (a, b2) => Math.abs(Date.parse(a) - Date.parse(b2)) / 86400e3;
    ck(`dragged ${dx} px to the right, the chart goes back in time (its right edge now ends at ${lastNow}, before ${last0}; the line under it says how far), and the day that was grabbed (${grabbed}) is still under the pointer (${under})`, lastNow < last0 && /←.*back/.test(afterRight) && days(under, grabbed) <= 4, { grabbed, under, last0, lastNow, afterRight, before });
    // and back to the left: it comes forward again by the same amount
    await drag(x0 + dx, x0); const lastBack = await tipAt(box.x + box.width - 3);
    await p.mouse.move(5, 5); await p.waitForTimeout(100);
    ck("dragged back to the left by the same distance, it comes forward to the latest bar again", lastBack === last0 && !/back/.test(await label()) && errs.length === 0, { lastBack, last0, errs });
    await ctx.close();
  }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
