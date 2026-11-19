// The layout guard (19 Nov 2026; the designer's D-06/D-09 finding that figures were cut, and "for C" item 1: a check
// before every publish). On all eight screens, at every size the scrolling layout and the phone layout are used at
// (the designer's plan review §3.7: C1 1440x900, C2 1280x720, C6 1920x1080, C7 2560x1440, C8 1440x900 at text size
// S; P1 iPhone SE, P2 iPhone 13), it checks what a reader would call cut or hidden:
//   - no figure is cut: no run of digits sits past the side of a box that hides its overflow, behind an ellipsis, or
//     with more than 30% of its line outside such a box at its top or foot (the text's own position is measured,
//     character by character, so a cut name whose digits all show passes and a cut price fails);
//   - no chart label is cut: no ink at a chart canvas's edge inside its y-axis band (labels are drawn on the canvas);
//   - nothing scrolls sideways: not the page, not a panel (a phone's statements table and wide phone tables scroll
//     by design, with their names fixed);
//   - on a phone, every tap target is 44 x 44 px or more, measured on the element that takes the tap: a drop-down's
//     <select> (its frame plus 10 px), a toggle's or a chip's ::before (the designer's I-2 note (h)). The targets the
//     designer listed as really under 44 px are printed and pass until the increment named beside them.
// Then it proves it can fail: throwaway styles injected into the test page cut figures in each of those ways, the guard
// must report them, and with the style removed it must report nothing again.
// XL text and the one-screen (COMPACT) layout join when increment I-9 fixes them (the designer's D-06 and D-21).
// Run from web/:  node e2e/run.cjs layout-guard   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 1500)}`); };
const SCREENS = ["market", "news", "research", "equities", "rates", "watch", "asset/NVDA", "asset/7203.T"];
const SIZES = [
  { code: "C1", label: "1440x900", ctx: { viewport: { width: 1440, height: 900 } }, prefs: { size: "AUTO", compact: false, v: 2 } },
  { code: "C2", label: "1280x720", ctx: { viewport: { width: 1280, height: 720 } }, prefs: { size: "AUTO", compact: false, v: 2 } },
  { code: "C6", label: "1920x1080", ctx: { viewport: { width: 1920, height: 1080 } }, prefs: { size: "AUTO", compact: false, v: 2 } },
  { code: "C7", label: "2560x1440", ctx: { viewport: { width: 2560, height: 1440 } }, prefs: { size: "AUTO", compact: false, v: 2 } },
  { code: "C8", label: "1440x900, text S", ctx: { viewport: { width: 1440, height: 900 } }, prefs: { size: "S", compact: false, v: 2 } },
  { code: "P1", label: "iPhone SE", ctx: { ...devices["iPhone SE (3rd gen)"] }, phone: true },
  { code: "P2", label: "iPhone 13", ctx: { ...devices["iPhone 13"] }, phone: true },
];
// what scrolls sideways by design on a phone: the statements under their fixed line names, and the wide phone tables
const SIDEWAYS_OK = [".finbox", ".mp-xs"];
// tap targets the designer measured as really under 44 px (plan review, I-22 "What is really under 44 px"), each with
// the increment that brings it to 44; a target not on this list fails
const KNOWN_TAPS = [
  { sel: ".star", why: "the star, 40 x 40 (44 x 44 in I-22)" },
  { sel: ".nw-tk button", why: "a headline's company buttons, 32 px (I-22 gives them a 44-px reach)" },
  { sel: ".mp-legacy .lnk", why: "a name in the phone's short-interest tables (I-22 makes the row the tap)" },
  { sel: ".tleaf", why: "a heat-map tile (the heat map leaves the phone once the owner agrees, I-22)" },
  { sel: ".mp-moves .s a", why: "a big move's source link, 24 px (I-3)" },
];

/** In the page: what is cut, hidden or too small (see the head of this file). Rects are screen px, client* layout px. */
function MEASURE(opt) {
  const RUN = /\d[\d,.:]*/g;
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width > 0.5;
  const where = (el) => {
    let s = el.tagName.toLowerCase(); if (el.id) s += "#" + el.id;
    if (typeof el.className === "string" && el.className.trim()) s += "." + el.className.trim().split(/\s+/).slice(0, 3).join(".");
    const pn = el.closest(".panel, .mp-sec, .mtile, #topbar");
    const t = pn ? ((pn.matches(".panel") ? pn.querySelector(":scope > .phead .t") : pn.matches(".mp-sec") ? pn.querySelector(":scope > h2 > span") : pn.matches(".mtile") ? pn.querySelector(".lbtxt") : null) ?? pn).textContent.trim().replace(/\s+/g, " ").slice(0, 32) : "";
    return s + (t ? ` @[${t}]` : "");
  };
  const clips = (v) => v === "hidden" || v === "clip", scrolls = (v) => v === "auto" || v === "scroll";
  const out = { ox: document.documentElement.scrollWidth - document.documentElement.clientWidth, scrollX: [], clipped: [], canvasCut: [], taps: [], figures: 0, hiding: 0, axes: 0, targets: 0 };
  const tw0 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw0.nextNode(); n; n = tw0.nextNode()) { RUN.lastIndex = 0; if (RUN.test(n.data) && n.parentElement && shown(n.parentElement)) out.figures++; }
  const all = [...document.querySelectorAll("body *")], flagged = new Set(), cv = document.createElement("canvas").getContext("2d");
  for (const el of all) {
    if (el instanceof SVGElement) continue;
    const ovx = el.scrollWidth > el.clientWidth + 1, ovy = el.scrollHeight > el.clientHeight + 1;
    if (!ovx && !ovy) continue;
    const cs = getComputedStyle(el);
    if (!shown(el)) continue;
    if (ovx && scrolls(cs.overflowX)) out.scrollX.push({ el: where(el), cw: el.clientWidth, sw: el.scrollWidth, ok: opt.sidewaysOk.some((s) => el.matches(s)) });
    const cx = ovx && clips(cs.overflowX), cy = ovy && clips(cs.overflowY);
    if (!cx && !cy) continue;
    out.hiding++;
    const r = el.getBoundingClientRect(), k = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const box = { l: r.left + el.clientLeft * k, t: r.top + el.clientTop * k, r: r.left + (el.clientLeft + el.clientWidth) * k, b: r.top + (el.clientTop + el.clientHeight) * k };
    let ell = 0; if (cs.textOverflow === "ellipsis" && cx) { cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; ell = cv.measureText("…").width * k; }
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      RUN.lastIndex = 0; if (!RUN.test(n.data)) continue;
      const pe = n.parentElement; if (!pe || flagged.has(pe) || !shown(pe)) continue;
      // the boxes between this one and the text that scroll: a figure outside one of them is scrolled away inside
      // it, so it is reached by scrolling, not cut (a box between that only clips does not excuse anything)
      const scrollers = []; for (let a = pe; a && a !== el; a = a.parentElement) { const s = getComputedStyle(a); if (scrolls(s.overflowX) || scrolls(s.overflowY)) scrollers.push({ r: a.getBoundingClientRect(), x: scrolls(s.overflowX), y: scrolls(s.overflowY) }); }
      RUN.lastIndex = 0; let m, hit = null;
      while (!hit && (m = RUN.exec(n.data))) {
        const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
        for (const q of rg.getClientRects()) {
          if (q.width < 0.5 || q.height < 0.5) continue;
          if (scrollers.some((s) => (s.x && (q.right > s.r.right + 0.5 || q.left < s.r.left - 0.5)) || (s.y && (q.bottom > s.r.bottom + 0.5 || q.top < s.r.top - 0.5)))) continue;
          const side = cx && (q.right > box.r - ell + 0.5 || q.left < box.l - 0.5);
          const inY = Math.min(q.bottom, box.b) - Math.max(q.top, box.t), foot = cy && inY < q.height * 0.7;
          if (side || foot) { hit = { run: m[0], how: side ? (ell ? "behind an ellipsis" : "cut at the side") : "cut at the top or foot" }; break; }
        }
      }
      if (hit) { flagged.add(pe); out.clipped.push({ el: where(pe), how: hit.how, figure: hit.run, text: (pe.textContent || n.data).trim().replace(/\s+/g, " ").slice(0, 80) }); }
    }
  }
  for (const u of document.querySelectorAll(".uplot")) {
    if (!shown(u)) continue;
    const c = u.querySelector("canvas"); if (!c || !c.width || !c.clientWidth) continue;
    const k = c.width / c.clientWidth, g = c.getContext("2d", { willReadFrequently: true });
    for (const a of u.querySelectorAll(".u-axis")) {
      const L = parseFloat(a.style.left) || 0, W = parseFloat(a.style.width) || 0;
      if (!(L === 0 && W > 0 && W < c.clientWidth / 2)) continue;   // a y-axis at the chart's left
      out.axes++;
      const ink = (x, y, w, h) => { if (w < 1 || h < 1) return false; const d = g.getImageData(x, y, w, h).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 80 && (d[i] + d[i + 1] + d[i + 2]) / 3 > 90) return true; return false; };
      const band = Math.max(1, Math.round((W - 12) * k)), px = Math.max(1, Math.round(k)), edges = [];
      if (ink(0, 0, px, c.height)) edges.push("left");
      if (ink(0, 0, band, px)) edges.push("top");
      if (ink(0, c.height - px, band, px)) edges.push("foot");
      if (edges.length) out.canvasCut.push({ el: where(u), edges });
    }
  }
  if (opt.phone) {
    const TAP = "a[href], button, select, input:not([type=hidden]), textarea, summary, [role=button], [role=link], [tabindex]:not([tabindex='-1'])";
    const cand = new Set(document.querySelectorAll(TAP));
    for (const el of all) { if (cand.has(el) || el instanceof SVGElement) continue; if (getComputedStyle(el).cursor !== "pointer") continue; const p = el.parentElement; if (p && getComputedStyle(p).cursor === "pointer") continue; cand.add(el); }
    // what takes a tap need not be seen: a drop-down's <select> is transparent over its frame
    const tappable = (el) => el.checkVisibility({ checkVisibilityCSS: true }) && el.getBoundingClientRect().width > 0.5 && getComputedStyle(el).pointerEvents !== "none";
    for (const el of cand) {
      if (!tappable(el) || el.matches("label.pick, .pick *:not(select), option")) continue;   // a drop-down's tap is taken by its <select>
      out.targets++;
      const r = el.getBoundingClientRect(), z = el.offsetWidth ? r.width / el.offsetWidth : 1; let L = r.left, T = r.top, R = r.right, B = r.bottom;
      for (const ps of ["::before", "::after"]) {   // a pseudo-element laid over the element widens what takes the tap
        const s = getComputedStyle(el, ps);
        if (!s.content || s.content === "none" || s.content === "normal" || s.position !== "absolute" || s.pointerEvents === "none" || s.display === "none") continue;
        const px = (v) => (v && v !== "auto" ? parseFloat(v) : null), t = px(s.top), b = px(s.bottom), l = px(s.left), rr = px(s.right);
        if (t != null && b != null) { T = Math.min(T, r.top + t * z); B = Math.max(B, r.bottom - b * z); }
        if (l != null && rr != null) { L = Math.min(L, r.left + l * z); R = Math.max(R, r.right - rr * z); }
      }
      const w = R - L, h = B - T;
      if (w >= 43.5 && h >= 43.5) continue;
      const pt = el.parentElement, own = (el.textContent || "").trim(), around = pt ? (pt.textContent || "").trim() : "";
      if (el.matches("a, .lnk") && getComputedStyle(el).display === "inline" && around.length > own.length + 3 && !/flex|grid/.test(pt ? getComputedStyle(pt).display : "")) continue;   // a link inside a sentence (the designer's D-19)
      out.taps.push({ el: where(el), w: Math.round(w), h: Math.round(h), text: own.replace(/\s+/g, " ").slice(0, 40), known: opt.known.findIndex((k) => el.matches(k)) });
    }
  }
  return out;
}

// the screen settled: fonts in, every chart drawn (none still "loading…"), and the page's size unchanged twice running
async function settle(p) {
  await p.waitForFunction(() => document.fonts.status === "loaded" && ![...document.querySelectorAll(".chartbox.empty")].some((e) => /loading/.test(e.textContent || "")), null, { timeout: 15000 }).catch(() => undefined);
  let last = "";
  for (let i = 0; i < 20; i++) {
    const now = await p.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(`${document.documentElement.scrollWidth}x${document.documentElement.scrollHeight}|${document.querySelectorAll(".uplot").length}`)))));
    if (now === last) return; last = now; await p.waitForTimeout(150);
  }
}
const measure = (p, phone) => p.evaluate(MEASURE, { phone, sidewaysOk: SIDEWAYS_OK, known: KNOWN_TAPS.map((k) => k.sel) });
const problems = (m, phone) => ({ ox: m.ox > 1 ? m.ox : 0, cut: m.clipped, canvas: m.canvasCut, sideways: m.scrollX.filter((s) => !(phone && s.ok)) });
const clean = (x) => !x.ox && !x.cut.length && !x.canvas.length && !x.sideways.length;
const open = async (b, s) => {
  const ctx = await b.newContext(s.ctx);
  // every chart asks for its line at once, as if scrolled into view, so each one is measured drawn
  await ctx.addInitScript((pr) => { try { if (pr) localStorage.setItem("om_prefs", JSON.stringify(pr)); } catch {} try { window.IntersectionObserver = undefined; } catch {} }, s.prefs || null);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs };
};

(async () => { const b = await chromium.launch();
  const knownSeen = new Map();
  for (const s of SIZES) {
    console.log(`\n[${s.code} ${s.label}${s.phone ? ", the phone layout" : ", the scrolling layout"}]`);
    const { ctx, p, errs } = await open(b, s);
    for (const h of SCREENS) {
      await p.goto(MOCK + "#" + h, { waitUntil: "networkidle" }); await settle(p);
      const m = await measure(p, !!s.phone), x = problems(m, !!s.phone);
      const allowed = m.scrollX.filter((q) => s.phone && q.ok).map((q) => q.el.replace(/ @.*/, ""));
      ck(`#${h}: no figure cut (${m.figures} texts with figures, ${m.hiding} boxes that hide what overflows them), no chart label cut (${m.axes} axes), nothing sideways${allowed.length ? ` but ${[...new Set(allowed)].join(", ")}, by design` : ""}`, clean(x), x);
      if (s.phone) {
        const unknown = m.taps.filter((t) => t.known < 0);
        for (const t of m.taps.filter((q) => q.known >= 0)) knownSeen.set(t.known, (knownSeen.get(t.known) ?? 0) + 1);
        ck(`#${h}: every one of ${m.targets} tap targets is 44 x 44 px or more, measured on what takes the tap${m.taps.length - unknown.length ? ` (${m.taps.length - unknown.length} on the designer's list, below)` : ""}`, unknown.length === 0, unknown.slice(0, 12));
      }
    }
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }
  console.log("\n  known, under 44 px until the increment named (the designer's plan review, I-22):");
  for (const [i, n] of [...knownSeen.entries()].sort((a, c) => a[0] - c[0])) console.log(`    · ${KNOWN_TAPS[i].why}: ${n} seen`);

  // ---- the guard fails when a figure is cut: throwaway styles injected into the test page ----
  console.log("\n[the guard catches a cut figure: a throwaway style cuts figures on purpose, then is taken away again]");
  const canary = async (p, css, phone) => { await p.evaluate((css) => { const st = document.createElement("style"); st.id = "canary"; st.textContent = css; document.head.appendChild(st); }, css); await settle(p); const m = await measure(p, phone); await p.evaluate(() => document.getElementById("canary")?.remove()); await settle(p); const after = await measure(p, phone); return { m, after }; };
  { const { ctx, p, errs } = await open(b, SIZES[0]);
    await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await settle(p);
    const tiles = await p.locator(".mtile.cp>.vl>.px").count();
    let r = await canary(p, ".mtile.cp>.vl>.px{display:inline-block!important;width:2.5ch!important;overflow:hidden!important;text-overflow:ellipsis!important}");
    const ellN = r.m.clipped.filter((c) => c.how === "behind an ellipsis").length;
    ck(`MARKETS' ${tiles} chart tiles with their prices narrowed to 2.5 characters: ${ellN} prices reported behind an ellipsis (e.g. "${r.m.clipped[0]?.figure}" in ${r.m.clipped[0]?.el}); without the style, none`, tiles >= 10 && ellN === tiles && clean(problems(r.after)), { tiles, n: r.m.clipped.length, after: problems(r.after) });
    r = await canary(p, "#grid .panel .pbody{overflow:hidden!important} table.mkt{min-width:2600px!important}");
    const sideN = r.m.clipped.filter((c) => c.how === "cut at the side").length;
    ck(`the MARKETS table made wider than its panel, whose body hides what overflows: ${sideN} figures reported cut at the side (e.g. "${r.m.clipped[0]?.figure}" in ${r.m.clipped[0]?.el}); without the style, none`, sideN >= 10 && clean(problems(r.after)), { n: r.m.clipped.length, after: problems(r.after) });
    r = await canary(p, ".mtile.cp{max-height:44px!important}");
    const footN = r.m.clipped.filter((c) => c.how === "cut at the top or foot").length;
    ck(`the chart tiles cut to 44 px tall: ${footN} figures reported cut at the foot (e.g. "${r.m.clipped[0]?.figure}" in ${r.m.clipped[0]?.el}); without the style, none`, footN >= 10 && clean(problems(r.after)), { n: r.m.clipped.length, after: problems(r.after) });
    r = await canary(p, "table.mkt{min-width:2600px!important}");
    ck(`the MARKETS table made wider than its panel: the panel reported scrolling sideways (${r.m.scrollX.map((q) => q.el).join(", ")}); without the style, nothing`, r.m.scrollX.some((q) => /MARKET/.test(q.el)) && clean(problems(r.after)), { m: r.m.scrollX, after: problems(r.after) });
    r = await canary(p, "#grid{min-width:3200px!important}");
    ck(`the page made wider than the window: ${r.m.ox}px reported sideways; without the style, none`, r.m.ox > 100 && clean(problems(r.after)), { ox: r.m.ox, after: problems(r.after) });
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await open(b, SIZES[0]);
    await p.goto(MOCK + "#equities", { waitUntil: "networkidle" }); await settle(p);
    // a chart as uPlot lays it out, with the breadth chart's old 34-px y-axis and its top label "100%" set right-aligned
    // against the axis, as uPlot draws it: the label runs past the canvas's left edge ("00%" on screen until 19 Nov)
    const drawChart = (axisW) => p.evaluate((axisW) => { document.getElementById("canary-chart")?.remove(); const u = document.createElement("div"); u.id = "canary-chart"; u.className = "uplot"; u.style.cssText = "position:absolute;left:30px;top:300px;width:320px;height:140px;z-index:999;background:#0c0c0c";
      const k = devicePixelRatio || 1, c = document.createElement("canvas"); c.width = 320 * k; c.height = 140 * k; c.style.cssText = "display:block;width:320px;height:140px";
      const a = document.createElement("div"); a.className = "u-axis"; a.style.cssText = `position:absolute;left:0px;width:${axisW}px;top:6px;height:120px`; u.append(c, a); document.body.appendChild(u);
      const g = c.getContext("2d"); g.fillStyle = "#a39f94"; g.font = `${12 * k}px 'IBM Plex Mono', monospace`; g.textAlign = "right"; g.textBaseline = "middle"; for (const [t, y] of [["100%", 12], ["50%", 66], ["0%", 120]]) g.fillText(t, (axisW - 10) * k, y * k); }, axisW);
    await drawChart(34); const m34 = await measure(p, false);
    await drawChart(48); const m48 = await measure(p, false);
    await p.evaluate(() => document.getElementById("canary-chart")?.remove());
    ck(`a chart's "100%" right-aligned on a 34-px y-axis runs past the canvas's left edge and is reported (${m34.canvasCut.map((c) => c.edges.join(", ")).join("; ")}); on a 48-px axis, as the breadth chart now has, it is not`, m34.canvasCut.some((c) => /canary-chart/.test(c.el) && c.edges.includes("left")) && !m48.canvasCut.length, { m34: m34.canvasCut, m48: m48.canvasCut });
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await open(b, SIZES[6]);
    await p.goto(MOCK + "#equities", { waitUntil: "networkidle" }); await settle(p);
    let r = await canary(p, "body.pv2 .pick select{top:0!important;height:100%!important}", true);
    const picks = r.m.taps.filter((t) => t.known < 0 && /^select/.test(t.el));
    ck(`phone: the drop-downs' <select> brought back to the 36-px frame: ${picks.length} taps reported under 44 px (e.g. ${picks[0]?.w}x${picks[0]?.h}); with the select reaching 5 px past the frame, as it does, none`, picks.length >= 3 && r.after.taps.filter((t) => t.known < 0).length === 0, { picks: picks.slice(0, 3), after: r.after.taps.filter((t) => t.known < 0) });
    r = await canary(p, ".mp-tog::before{content:none!important}", true);
    const togs = r.m.taps.filter((t) => t.known < 0 && /mp-tog/.test(t.el));
    ck(`phone: the toggles without their ::before reach: ${togs.length} taps reported under 44 px; with it, none`, togs.length >= 3 && r.after.taps.filter((t) => t.known < 0).length === 0, { togs: togs.slice(0, 3), after: r.after.taps.filter((t) => t.known < 0) });
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
