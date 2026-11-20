// The layout guard (19 Nov 2026; the designer's D-06/D-09 finding that figures were cut, and "for C" item 1: a check
// before every publish). On all eight screens, at every size the scrolling layout and the phone layout are used at
// (the designer's plan review §3.7: C1 1440x900, C2 1280x720, C6 1920x1080, C7 2560x1440, C8 1440x900 at text size
// S; P1 iPhone SE, P2 iPhone 13), it checks what a reader would call cut or hidden:
//   - no figure is cut: no figure (its digits and the unit written after them: %, bp, pp, σ, ×, x, tn, bn, m, k) sits
//     past the side of a box that hides its overflow, behind an ellipsis, or with more than 30% of its line outside
//     such a box at its top or foot (the text's own position is measured, character by character, so a cut name whose
//     figures all show passes, and a price, or a bp cell cut down to its digits, fails);
//   - no figure is painted over or clipped (the reviewer's R2A-03): with the window moved down the page 60% of its
//     height at a time, every figure inside it is hit-tested near both ends and in the middle. Another element met
//     there paints over it, unless that element is fixed or sticky (the header over scrolled content, a sticky column)
//     or a drop-down's transparent <select> over its own label; the figure's own box missing there, with a clip-path
//     on it or around it, is a clipped figure;
//   - no chart label is cut: no ink at a chart canvas's edge inside its y-axis band (labels are drawn on the canvas);
//   - nothing scrolls sideways: not the page, not a panel (a phone's statements table and wide phone tables scroll
//     by design, with their names fixed);
//   - on a phone, every tap target is 44 x 44 px or more, measured on the element that takes the tap: a drop-down's
//     <select> (its frame plus 10 px), a toggle's or a chip's ::before (the designer's I-2 note (h)). The targets the
//     designer listed as really under 44 px are printed and pass until the increment named beside them;
//   - a stock's statements, which scroll sideways under their fixed line names on a phone, are walked as a reader
//     moves them, not only where they open (the designer's verdict on D-03, 20 Nov 2026: after a press or a swipe a
//     period was cut at the right edge, "2,9" of 2,971.0): where they rest, after each press of "‹ earlier years" to
//     the start, and after swipes of 40 px each way, on four phones (iPhone SE, iPhone 13, Pixel 7, iPhone 14 Pro Max),
//     both stocks, annual and quarterly, and on a computer where they are wider than their panel today (1100x800 at
//     text XL). No period may be drawn in part beside the names or at the box's right edge.
// Then it proves it can fail: throwaway styles injected into the test page cut figures in each of those ways (also a
// unit cut off whole digits, on a computer and in a phone's pills, a clip-path, a box laid over figures, and the
// statements' periods held at their own widths, as before 20 Nov), the guard must report them, and with the style
// removed it must report nothing again.
// Text L joins at 1440x900 (the designer's D-51, 20 Nov 2026: a Tokyo stock's SHORT INTEREST cut its figures to "1."
// at L, where the right column is about 400 CSS px) on every screen but EQUITIES, and a stock's two pages are guarded
// at the other windows D-51 named: 1366x768 and 1536x864 at L, 1680x1050 at XL. EQUITIES joins at L with I-9: there
// its breadth chart is laid over its table's figures and FLOW BY SECTOR and SCREENER scroll sideways (C/backlog.md).
// XL text and the one-screen (COMPACT) layout join when increment I-9 fixes them (the designer's D-06 and D-21).
// Run from web/:  node e2e/run.cjs layout-guard   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 1500)}`); };
// an instrument's page (I-4: a pair, a yield read from the market and one from an official curve, an index without an
// EQUITIES page) is guarded the same way by a suite of its own, layout-guard-instruments, which names its screens in
// GUARD_SCREENS and leaves out the statements' walks and the proofs below: the two runs side by side keep each well
// inside the runner's six minutes
const ONLY = process.env.GUARD_SCREENS ? process.env.GUARD_SCREENS.split(",").filter(Boolean) : null;
const SCREENS = ONLY ?? ["market", "news", "research", "equities", "rates", "watch", "asset/NVDA", "asset/7203.T"];
const SIZES = [
  { code: "C1", label: "1440x900", ctx: { viewport: { width: 1440, height: 900 } }, prefs: { size: "AUTO", compact: false, v: 2 } },
  { code: "C2", label: "1280x720", ctx: { viewport: { width: 1280, height: 720 } }, prefs: { size: "AUTO", compact: false, v: 2 } },
  { code: "C6", label: "1920x1080", ctx: { viewport: { width: 1920, height: 1080 } }, prefs: { size: "AUTO", compact: false, v: 2 } },
  { code: "C7", label: "2560x1440", ctx: { viewport: { width: 2560, height: 1440 } }, prefs: { size: "AUTO", compact: false, v: 2 } },
  { code: "C8", label: "1440x900, text S", ctx: { viewport: { width: 1440, height: 900 } }, prefs: { size: "S", compact: false, v: 2 } },
  { code: "CL", label: "1440x900, text L", ctx: { viewport: { width: 1440, height: 900 } }, prefs: { size: "L", compact: false, v: 2 }, skip: ["equities"] },
  { code: "P1", label: "iPhone SE", ctx: { ...devices["iPhone SE (3rd gen)"] }, phone: true },
  { code: "P2", label: "iPhone 13", ctx: { ...devices["iPhone 13"] }, phone: true },
  // D-51's other windows, on a stock's page only: its right column is 380 to 430 CSS px there
  ...[[1366, 768, "L"], [1536, 864, "L"], [1680, 1050, "XL"]].map(([w, h, size]) => ({ code: `${w}${size}`, label: `${w}x${h}, text ${size}`, ctx: { viewport: { width: w, height: h } }, prefs: { size, compact: false, v: 2 }, screens: ["asset/7203.T", "asset/NVDA"] })),
];
// what scrolls sideways by design on a phone: the statements under their fixed line names, and the wide phone tables
const SIDEWAYS_OK = [".finbox", ".mp-xs"];
// where the statements are walked: the two phones above and the designer's two wider ones (the verdict on D-03), and a
// computer whose statements are wider than their panel today: 1100x800 at text XL, a zoom of 1.35, where a period's
// edge falls between screen pixels unless the widths are worked out in them
// a size by its code (the proofs below and the walks name the phones; the list above grows)
const SIZE = (code) => SIZES.find((s) => s.code === code);
const FIN_WALKS = [...[SIZE("P1"), SIZE("P2"), { code: "PX7", label: "Pixel 7", ctx: { ...devices["Pixel 7"] }, phone: true }, { code: "PM", label: "iPhone 14 Pro Max", ctx: { ...devices["iPhone 14 Pro Max"] }, phone: true }].map((s) => ({ ...s, syms: ["7203.T", "NVDA"] })),
  { code: "CX", label: "1100x800, text XL", ctx: { viewport: { width: 1100, height: 800 } }, prefs: { size: "XL", compact: false, v: 2 }, syms: ["7203.T"] }];
// tap targets the designer measured as really under 44 px (plan review, I-22 "What is really under 44 px"), each with
// the increment that brings it to 44; a target not on this list fails
const KNOWN_TAPS = [
  { sel: ".star", why: "the star, 40 x 40 (44 x 44 in I-22)" },
  { sel: ".nw-tk button", why: "a headline's company buttons, 32 px (I-22 gives them a 44-px reach)" },
  { sel: ".mp-legacy .lnk", why: "a name in the phone's short-interest tables (I-22 makes the row the tap)" },
  { sel: ".tleaf", why: "a heat-map tile (the heat map leaves the phone once the owner agrees, I-22)" },
  { sel: ".mp-moves .s a", why: "a big move's source link, 24 px (I-3)" },
];

/** In the page: what is cut, hidden or too small (see the head of this file). Rects are screen px, client* layout px.
 *  With `opt.occlusion`, only the paint-over probe of the figures now inside the window (see `occlusion` below). */
function MEASURE(opt) {
  // a figure is its digits and the unit written after them: "-4.8bp" cut to "-4.8", "4.859%" to "4.859" is a cut figure
  const RUN = /\d[\d,.:]*(?:%|bp|pp|σ|×|tn|bn|x(?![A-Za-z])|m(?![A-Za-z])|k(?![A-Za-z]))?/g;
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width > 0.5;
  const where = (el) => {
    let s = el.tagName.toLowerCase(); if (el.id) s += "#" + el.id;
    if (typeof el.className === "string" && el.className.trim()) s += "." + el.className.trim().split(/\s+/).slice(0, 3).join(".");
    const pn = el.closest(".panel, .mp-sec, .mtile, #topbar");
    const t = pn ? ((pn.matches(".panel") ? pn.querySelector(":scope > .phead .t") : pn.matches(".mp-sec") ? pn.querySelector(":scope > h2 > span") : pn.matches(".mtile") ? pn.querySelector(".lbtxt") : null) ?? pn).textContent.trim().replace(/\s+/g, " ").slice(0, 32) : "";
    return s + (t ? ` @[${t}]` : "");
  };
  const clips = (v) => v === "hidden" || v === "clip", scrolls = (v) => v === "auto" || v === "scroll";
  if (opt.occlusion) {
    // Each figure fully inside the window is hit-tested near both ends and in the middle. The figure's own element (or
    // what it holds) must be what a pointer meets there. Another element met instead paints over it, unless that
    // element is fixed or sticky (the header, a sticky column over scrolled content, by design) or is a drop-down's
    // transparent <select> over its own label. The figure's own ancestor met instead means its box is not there
    // (clip-path), unless something between does not take the pointer. A figure cut or scrolled away inside a box
    // that hides or scrolls its overflow is the rest of MEASURE's business.
    const pinned = (el) => { for (let a = el; a && a !== document.body; a = a.parentElement) { const p = getComputedStyle(a).position; if (p === "fixed" || p === "sticky") return true; } return false; };
    const covered = []; let probed = 0;
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      RUN.lastIndex = 0; if (!RUN.test(n.data)) continue;
      const pe = n.parentElement; if (!pe) continue;
      const pr = pe.getBoundingClientRect(); if (pr.bottom < 0 || pr.top > innerHeight || pr.right < 0 || pr.left > innerWidth) continue;
      if (!shown(pe) || pinned(pe)) continue;
      const boxes = []; for (let a = pe; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX !== "visible" || cs.overflowY !== "visible") boxes.push(a.getBoundingClientRect()); }
      RUN.lastIndex = 0; let m, hit = null;
      while (!hit && (m = RUN.exec(n.data))) {
        const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
        for (const q of rg.getClientRects()) {
          if (q.width < 2 || q.height < 2 || q.top < 0 || q.bottom > innerHeight || q.left < 0 || q.right > innerWidth) continue;
          if (boxes.some((r) => q.left < r.left - 0.5 || q.right > r.right + 0.5 || q.top < r.top - 0.5 || q.bottom > r.bottom + 0.5)) continue;
          probed++;
          for (const fx of [0.12, 0.5, 0.88]) {
            const h = document.elementFromPoint(q.left + q.width * fx, q.top + q.height / 2);
            if (!h || h === pe || pe.contains(h)) continue;
            if (h.contains(pe)) {
              let free = false; for (let a = pe; a && a !== h; a = a.parentElement) if (getComputedStyle(a).pointerEvents === "none") { free = true; break; }
              if (free) continue;
              let cp = null; for (let a = pe; a && !cp; a = a.parentElement) if (getComputedStyle(a).clipPath !== "none") cp = a;
              if (cp) { hit = { how: "clipped by clip-path", by: where(cp) }; break; }
              continue;
            }
            if (pinned(h) || (h.tagName === "SELECT" && h.closest(".pick")?.contains(pe))) continue;
            hit = { how: "painted over", by: where(h) }; break;
          }
          if (hit) break;
        }
      }
      if (hit) covered.push({ el: where(pe), figure: m[0], ...hit, text: (pe.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60) });
    }
    return { covered, probed };
  }
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
        // it is placed against the element when the element is positioned, otherwise against its nearest positioned
        // ancestor (a statements header's link fills its whole header cell this way: I-3, 20 Nov 2026)
        let cb = el; if (getComputedStyle(el).position === "static") { cb = el.parentElement; while (cb && cb !== document.body && getComputedStyle(cb).position === "static") cb = cb.parentElement; }
        const c = (cb || el).getBoundingClientRect();
        const px = (v) => (v && v !== "auto" ? parseFloat(v) : null), t = px(s.top), b = px(s.bottom), l = px(s.left), rr = px(s.right);
        if (t != null && b != null) { T = Math.min(T, c.top + t * z); B = Math.max(B, c.bottom - b * z); }
        if (l != null && rr != null) { L = Math.min(L, c.left + l * z); R = Math.max(R, c.right - rr * z); }
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
/** The paint-over probe over the whole page: the window is moved down 60% of its height at a time, so every figure is
 *  wholly inside it at least once, and each figure is reported once. */
async function occlusion(p) {
  const found = new Map(); let probed = 0;
  for (let y = 0, i = 0; i < 80; i++) {
    const at = await p.evaluate((y) => new Promise((res) => { scrollTo(0, y); requestAnimationFrame(() => requestAnimationFrame(() => res({ y: scrollY, vh: innerHeight, h: document.documentElement.scrollHeight }))); }), y);
    const m = await p.evaluate(MEASURE, { occlusion: true });
    probed += m.probed; for (const c of m.covered) { const k = `${c.el}|${c.figure}|${c.by}`; if (!found.has(k)) found.set(k, c); }
    if (at.y + at.vh >= at.h - 1) break;
    y = at.y + Math.max(200, Math.round(at.vh * 0.6));
  }
  await p.evaluate(() => scrollTo(0, 0));
  return { covered: [...found.values()], probed };
}
const problems = (m, phone, oc) => ({ ox: m.ox > 1 ? m.ox : 0, cut: m.clipped, canvas: m.canvasCut, sideways: m.scrollX.filter((s) => !(phone && s.ok)), covered: oc ? oc.covered : [] });
const clean = (x) => !x.ox && !x.cut.length && !x.canvas.length && !x.sideways.length && !x.covered.length;
const open = async (b, s) => {
  const ctx = await b.newContext(s.ctx);
  // every chart asks for its line at once, as if scrolled into view, so each one is measured drawn
  await ctx.addInitScript((pr) => { try { if (pr) localStorage.setItem("om_prefs", JSON.stringify(pr)); } catch {} try { window.IntersectionObserver = undefined; } catch {} }, s.prefs || null);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs };
};

/** In the page: the statements box now. A period drawn in part beside the line names or at the box's right edge
 *  (by more than half a pixel), the periods shown whole, and whether "‹ earlier years" is offered. */
function FINSTATE() {
  const bx = document.querySelector(".finbox"); if (!bx) return null;
  const nr = bx.querySelector("thead th.l").getBoundingClientRect(), br = bx.getBoundingClientRect(), L = nr.right, R = br.right - parseFloat(getComputedStyle(bx).borderRightWidth);
  const cols = [...bx.querySelectorAll("thead th:not(.l)")].map((th) => { const r = th.getBoundingClientRect(); return { t: th.textContent, l: r.left, r: r.right }; });
  const btn = bx.querySelector(".finprev");
  return { left: Math.round(bx.scrollLeft), over: bx.scrollWidth > bx.clientWidth + 1,
    part: cols.filter((c) => (c.l < L - 0.5 && c.r > L + 0.5) || (c.l < R - 0.5 && c.r > R + 0.5)).map((c) => (c.l < L - 0.5 ? `${c.t}: ${Math.round(c.r - L)}px beside the names` : `${c.t}: ${Math.round(R - c.l)}px at the right edge`)),
    shown: cols.filter((c) => c.l >= L - 0.5 && c.r <= R + 0.5).map((c) => c.t), last: cols.length ? cols[cols.length - 1].t : null, back: !!btn && getComputedStyle(btn).visibility !== "hidden" };
}
// the box at rest: the same place for eight drawn frames running (a snap or a smooth scroll takes a moment; each drawn
// frame shows where the scroll is, so nothing here is timed against the machine's speed)
const finRest = (p) => p.evaluate(() => new Promise((res) => { const bx = document.querySelector(".finbox"); let last = NaN, same = 0; const t0 = performance.now();
  const tick = () => { const v = bx.scrollLeft; if (v === last) same++; else { same = 0; last = v; } if ((same >= 8 && performance.now() - t0 >= 200) || performance.now() - t0 > 8000) return res(v); requestAnimationFrame(tick); };
  requestAnimationFrame(tick); }));
/** The statements walked as a reader moves them (the designer's verdict on D-03): where they rest, each press of
 *  "‹ earlier years" to the start, a swipe of 40 px on and back from there, then from the latest periods a swipe of
 *  40 px back and on. A swipe is the scroll a finger leaves (40 px), after which the box snaps where it will. */
async function walkFin(p) {
  const states = [], at = async (what) => { await finRest(p); const s = await p.evaluate(FINSTATE); states.push({ what, ...s }); return s; };
  const swipe = (dx) => p.evaluate((d) => document.querySelector(".finbox").scrollBy({ left: d, behavior: "instant" }), dx);
  await p.evaluate(() => { const t = document.querySelector(".finbox thead").getBoundingClientRect(); window.scrollTo(0, scrollY + t.top - innerHeight / 2); });
  const rest = await at("at rest");
  for (let i = 1; i <= 12 && states[states.length - 1].back; i++) { await p.evaluate(() => document.querySelector(".finprev").click()); await at(`press ${i}`); }
  await swipe(40); await at("swipe on from the start"); await swipe(-40); await at("swipe back");
  await p.evaluate(() => { const bx = document.querySelector(".finbox"); bx.scrollTo({ left: bx.scrollWidth, behavior: "instant" }); }); await at("at the latest again");
  await swipe(-40); await at("swipe back from the latest"); await swipe(40); await at("swipe on");
  return { rest, states, bad: states.filter((s) => s.part.length), presses: states.filter((s) => /^press/.test(s.what)).length, places: new Set(states.map((s) => s.left)).size };
}
const span = (s) => (s.shown.length ? `${s.shown[0]}–${s.shown[s.shown.length - 1]}` : "none");

(async () => { const b = await chromium.launch();
  const knownSeen = new Map();
  for (const s of SIZES) {
    // a size kept for some screens (D-51's windows: a stock's page) is left out of a run of other screens
    const screens = (s.screens ? SCREENS.filter((h) => s.screens.includes(h)) : SCREENS).filter((h) => !(s.skip ?? []).includes(h));
    if (!screens.length) continue;
    console.log(`\n[${s.code} ${s.label}${s.phone ? ", the phone layout" : ", the scrolling layout"}]`);
    const { ctx, p, errs } = await open(b, s);
    for (const h of screens) {
      await p.goto(MOCK + "#" + h, { waitUntil: "networkidle" }); await settle(p);
      const m = await measure(p, !!s.phone), oc = await occlusion(p), x = problems(m, !!s.phone, oc);
      const allowed = m.scrollX.filter((q) => s.phone && q.ok).map((q) => q.el.replace(/ @.*/, ""));
      ck(`#${h}: no figure cut, unit and all (${m.figures} texts with figures, ${m.hiding} boxes that hide what overflows them), none painted over or clipped (${oc.probed} probed in view), no chart label cut (${m.axes} axes), nothing sideways${allowed.length ? ` but ${[...new Set(allowed)].join(", ")}, by design` : ""}`, clean(x), x);
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
  if (ONLY) { await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); }

  console.log("\n[a stock's statements where they are wider than their box, walked: at rest, each press of ‹ earlier years, swipes of 40 px each way; no period drawn in part beside the names or at the right edge]");
  for (const s of FIN_WALKS) {
    const { ctx, p, errs } = await open(b, s);
    for (const sym of s.syms) {
      await p.goto(MOCK + "#asset/" + sym, { waitUntil: "networkidle" }); await settle(p);
      for (const view of ["annual", "quarterly"]) {
        // the Periods picker (a drop-down on a phone, chips on a computer) keeps its choice from one stock to the next:
        // chosen each time, and its periods awaited
        if (await p.locator("#st-view select").count()) await p.locator("#st-view select").selectOption(view);
        else await p.locator("#st-view .chip-sm", { hasText: view.toUpperCase() }).click();
        await p.waitForFunction((v) => { const hs = [...document.querySelectorAll(".finbox thead th:not(.l)")].map((h) => h.textContent); return hs.length > 0 && hs.every((t) => /^FY/.test(t) === (v === "annual")); }, view);
        const w = await walkFin(p);
        ck(`${s.label} · ${sym} · ${view}: whole periods at both edges in all ${w.states.length} places it came to rest, ${w.presses} press(es) back included (${w.states.map(span).join(" · ")})`, w.rest.over && w.rest.shown.includes(w.rest.last) && w.presses >= 1 && w.places >= 2 && w.bad.length === 0 && w.states.every((x) => x.shown.length >= 1), { bad: w.bad.slice(0, 4).map((x) => ({ what: x.what, part: x.part })), rest: w.rest, presses: w.presses, places: w.places });
      }
    }
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }

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
  // the cuts the guard let through until the reviewer's R2A-03: a unit cut off whole digits ("-4.8bp" reading "-4.8"),
  // a clip-path over figures, and a box laid over them (nothing overflows in the last two)
  const cutUnits = (p, sel) => p.evaluate((sel) => { let n = 0;
    for (const el of document.querySelectorAll(sel)) {
      const t = el.textContent, m = /^([+−-]?[\d.,]+)(bp|%)$/.exec(t); if (!m || el.children.length || !el.firstChild) continue;
      const rg = document.createRange(); rg.setStart(el.firstChild, 0); rg.setEnd(el.firstChild, m[1].length);
      const k = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1, s = document.createElement("span");
      s.style.cssText = `display:inline-block;overflow:hidden;white-space:nowrap;vertical-align:bottom;width:${rg.getBoundingClientRect().width / k}px`; s.textContent = t; el.replaceChildren(s); n++;
    }
    return n; }, sel);
  const unitsOnly = (m) => m.clipped.filter((c) => /(bp|%)$/.test(c.figure) && c.how === "cut at the side");
  { const { ctx, p, errs } = await open(b, SIZES[0]);
    await p.goto(MOCK + "#watch", { waitUntil: "networkidle" }); await settle(p);
    const n = await cutUnits(p, "table.wlT td.num:not(:has(*)), table.wlT td.num > b"); await settle(p);
    const u = unitsOnly(await measure(p, false));
    await p.reload({ waitUntil: "networkidle" }); await settle(p); const back = problems(await measure(p, false));
    ck(`MY NAMES with the unit cut off ${n} figures, every digit still showing: ${u.length} reported cut at the side (e.g. "${u[0]?.figure}" in ${u[0]?.el}); reloaded, none`, n >= 20 && u.length >= n - 2 && clean(back), { n, u: u.length, first: u.slice(0, 2), back });
    await p.evaluate(() => { const st = document.createElement("style"); st.id = "canary"; st.textContent = "table.wlT td.num{clip-path:inset(0 0 0 70%)}"; document.head.appendChild(st); }); await settle(p);
    let oc = await occlusion(p); const clipped = oc.covered.filter((c) => c.how === "clipped by clip-path");
    await p.evaluate(() => document.getElementById("canary")?.remove()); await settle(p); let after = await occlusion(p);
    ck(`MY NAMES' figure cells cut by a clip-path to their right 30%: ${clipped.length} figures reported clipped (e.g. "${clipped[0]?.figure}" in ${clipped[0]?.el}); without it, none of ${after.probed} probed`, clipped.length >= 10 && after.covered.length === 0, { clipped: clipped.length, first: clipped.slice(0, 2), after: after.covered.slice(0, 3) });
    await p.evaluate(() => { const r = document.querySelector("table.wlT").getBoundingClientRect(), d = document.createElement("div"); d.id = "canary-cover"; d.style.cssText = `position:absolute;left:${r.left + scrollX + r.width * 0.45}px;top:${r.top + scrollY}px;width:${r.width * 0.25}px;height:${r.height}px;background:#222;z-index:5`; document.documentElement.appendChild(d); }); await settle(p);
    oc = await occlusion(p); const over = oc.covered.filter((c) => c.how === "painted over" && /canary-cover/.test(c.by));
    await p.evaluate(() => document.getElementById("canary-cover")?.remove()); await settle(p); after = await occlusion(p);
    ck(`a box laid over a quarter of MY NAMES' columns: ${over.length} figures reported painted over (e.g. "${over[0]?.figure}" under ${over[0]?.by}); without it, none`, over.length >= 10 && after.covered.length === 0, { over: over.length, first: over.slice(0, 2), after: after.covered.slice(0, 3) });
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await open(b, SIZE("P2"));
    await p.goto(MOCK + "#watch", { waitUntil: "networkidle" }); await settle(p);
    const n = await cutUnits(p, ".mp-chg > .fig"); await settle(p);
    const u = unitsOnly(await measure(p, true));
    await p.reload({ waitUntil: "networkidle" }); await settle(p); const back = problems(await measure(p, true), true);
    ck(`phone: the watchlist's ${n} change pills with their unit cut off ("-4.8bp" reading "-4.8"): ${u.length} reported (e.g. "${u[0]?.figure}"); reloaded, none`, n >= 8 && u.length >= n - 1 && clean(back), { n, u: u.length, first: u.slice(0, 2), back });
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
  // the statements with their periods held at their own widths, as before 20 Nov: they open whole, but after a press
  // or a swipe the right edge falls inside a period (the designer's verdict on D-03), and the walk must say so
  { const { ctx, p, errs } = await open(b, SIZE("P2"));
    await p.goto(MOCK + "#asset/7203.T", { waitUntil: "networkidle" }); await settle(p);
    await p.addStyleTag({ content: ".finbox{--fin-col:0px!important;--fin-names:128px!important}" });
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const w = await walkFin(p), right = w.bad.filter((x) => x.part.some((q) => /right edge/.test(q)));
    await p.reload({ waitUntil: "networkidle" }); await settle(p); const back = await walkFin(p);
    ck(`iPhone 13 · 7203.T with the periods at their own widths (before 20 Nov): ${right.length} of ${w.states.length} places reported with a period cut at the right edge (e.g. after ${right[0]?.what}, "${right[0]?.part[0]}"); as built, none of ${back.states.length}`, w.rest.part.length === 0 && right.length >= 2 && back.bad.length === 0, { rest: w.rest.part, right: right.slice(0, 3).map((x) => ({ what: x.what, part: x.part })), back: back.bad.slice(0, 3).map((x) => ({ what: x.what, part: x.part })) });
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await open(b, SIZE("P2"));
    await p.goto(MOCK + "#equities", { waitUntil: "networkidle" }); await settle(p);
    let r = await canary(p, "body.pv2 .pick select{top:0!important;height:100%!important}", true);
    const picks = r.m.taps.filter((t) => t.known < 0 && /^select/.test(t.el));
    ck(`phone: the drop-downs' <select> brought back to the 36-px frame: ${picks.length} taps reported under 44 px (e.g. ${picks[0]?.w}x${picks[0]?.h}); with the select reaching 5 px past the frame, as it does, none`, picks.length >= 3 && r.after.taps.filter((t) => t.known < 0).length === 0, { picks: picks.slice(0, 3), after: r.after.taps.filter((t) => t.known < 0) });
    r = await canary(p, ".mp-tog::before{content:none!important}", true);
    const togs = r.m.taps.filter((t) => t.known < 0 && /mp-tog/.test(t.el));
    ck(`phone: the toggles without their ::before reach: ${togs.length} taps reported under 44 px; with it, none`, togs.length >= 3 && r.after.taps.filter((t) => t.known < 0).length === 0, { togs: togs.slice(0, 3), after: r.after.taps.filter((t) => t.known < 0) });
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
