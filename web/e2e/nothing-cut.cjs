// Nothing cut, nothing hidden (19 Nov 2026): the designer's findings of increment I-2, each checked where it was seen.
//   D-03  the phone's statements land on whole columns: no fragment of a number beside the line names, nor at the
//         right edge after a press of "‹ earlier years" or a 40-px swipe (the designer's verdict, 20 Nov 2026)
//   D-07  SHORT INTEREST at its natural height in three columns, headed, a sector column of 9 em (with D-45: English
//         source names first; D-46: the sector drawer's short column says which short figure it is)
//   D-08  chart tile titles whole, their badges and stamp on the price line; EQUITIES in the designer's order
//   D-09  a headline of 120 characters naming three companies shows all its words (with D-47: SGT once, in the head)
//   D-10  phone search: rows a finger can hit, under the field, whole names (with D-37: the placeholder)
//   D-25  WATCHLIST: alert and research texts whole, on the two-column page (the designer's §3.4)
//   D-48  WATCHLIST at the feed's real lengths (40 alerts, 60 headlines): RESULTS AHEAD first in the left column,
//         ten alerts and fifteen headlines with "SHOW n MORE", no box that scrolls inside the page (20 Nov 2026)
//   D-28  every curve's lowest yield label whole; the phone curve's source line wraps
// and the header's alert line, whose time was cut on every screen (the layout guard's first finding): its figure says
// what it is (intraday, at close, 1D), and a news alert that names no company shows its headline and its publisher.
// The day bars and the alert line are checked in ways that hold at any time of day (the reviewer's R2A-01).
// The general rules (no figure cut, nothing sideways, 44-px taps) on every screen are e2e/layout-guard.cjs.
// Run from web/:  node e2e/run.cjs nothing-cut   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { S } = require("./standin.cjs");
const { routes } = require("./harness.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", FAKE = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 1500)}`); };
const H120 = S.news[0].title;
const DESK = { C1: { viewport: { width: 1440, height: 900 } }, C2: { viewport: { width: 1280, height: 720 } }, C6: { viewport: { width: 1920, height: 1080 } }, C7: { viewport: { width: 2560, height: 1440 } } };
const AUTO = { size: "AUTO", compact: false, v: 2 }, XL = { size: "XL", compact: false, v: 2 }, COMPACT = { size: "AUTO", compact: true, v: 2 };
async function page(b, opts, prefs) {
  const ctx = await b.newContext(opts);
  await ctx.addInitScript((pr) => { try { if (pr) localStorage.setItem("om_prefs", JSON.stringify(pr)); } catch {} try { window.IntersectionObserver = undefined; } catch {} }, prefs || null);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs };
}
const go = async (p, hash, sel) => { await p.goto(MOCK + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500); };
// a panel by its title, inside the page
const PANEL = (title) => [...document.querySelectorAll("#grid .panel")].find((x) => x.querySelector(".phead .t")?.textContent === title);
// Day bars over a list of headlines, newest first, read as the reader sees it ({ bar: "Friday 20 Nov" } or { t: "23:22" }
// in page order). Going down the list the time of day falls until midnight in Singapore is crossed, where it jumps up:
// a bar must stand exactly there, and each bar is the day before the one above it. Nothing here depends on the time
// the check runs: the stand-in headlines span 31 hours, so the list always crosses at least one midnight.
function dayBars(seq) {
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)), WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const bad = [], bars = seq.filter((x) => x.bar).map((x) => x.bar);
  if (!seq.length || !seq[0].bar) bad.push("the list does not open with a day bar");
  let prev = null, bar = false;
  for (const x of seq) {
    if (x.bar) { bar = true; continue; }
    if (prev != null && (mins(x.t) > mins(prev)) !== bar) bad.push(`${prev} then ${x.t}: ${bar ? "a bar where the day did not turn" : "the day turned with no bar"}`);
    prev = x.t; bar = false;
  }
  for (let i = 1; i < bars.length; i++) { const a = WD.indexOf(bars[i - 1].split(" ")[0]), b = WD.indexOf(bars[i].split(" ")[0]); if (a < 0 || b !== (a + 6) % 7) bad.push(`"${bars[i]}" under "${bars[i - 1]}" is not the day before`); }
  return { bars, bad };
}
// the statements box at rest after a scroll: a snap or a smooth scroll takes a moment, so the box must keep its place
// for eight frames running (each drawn frame shows where the scroll is; nothing here is timed against the machine)
const rest = (p) => p.evaluate(() => new Promise((res) => { const bx = document.querySelector(".finbox"); let last = NaN, same = 0; const t0 = performance.now();
  const tick = () => { const v = bx.scrollLeft; if (v === last) same++; else { same = 0; last = v; } if ((same >= 8 && performance.now() - t0 >= 200) || performance.now() - t0 > 8000) return res(v); requestAnimationFrame(tick); };
  requestAnimationFrame(tick); }));
// the statements table on a phone: a period drawn in part beside the line names or at the box's right edge (the
// designer's D-03, and the right edge in the verdict of 20 Nov 2026), and the periods shown whole
const finState = (p) => p.evaluate(() => {
  const box = document.querySelector(".finbox"), names = box.querySelector("thead th.l"), edge = names.getBoundingClientRect().right, b = box.getBoundingClientRect(), right = b.right - parseFloat(getComputedStyle(box).borderRightWidth);
  const textRect = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return rg.getBoundingClientRect(); };
  const heads = [...box.querySelectorAll("thead th:not(.l)")], revenue = [...box.querySelectorAll('tr[data-line="revenue"] td:not(.l)')];
  const partial = [...heads, ...revenue].filter((c) => { const r = c.getBoundingClientRect(); return (r.left < edge - 0.5 && r.right > edge + 0.5) || (r.left < right - 0.5 && r.right > right + 0.5); }).map((c) => `${c.textContent} (${Math.round(c.getBoundingClientRect().left < edge - 0.5 ? c.getBoundingClientRect().right - edge : right - c.getBoundingClientRect().left)}px at the ${c.getBoundingClientRect().left < edge - 0.5 ? "names" : "right edge"})`);
  const shown = heads.filter((c) => c.getBoundingClientRect().left >= edge - 0.5 && c.getBoundingClientRect().right <= right + 0.5).map((c) => c.textContent);
  const btn = box.querySelector(".finprev"), br = btn?.getBoundingClientRect(), bs = btn && getComputedStyle(btn, "::before");
  return { left: Math.round(box.scrollLeft), over: box.scrollWidth > box.clientWidth + 1, partial, shown, last: heads[heads.length - 1].textContent, lastWhole: heads[heads.length - 1].getBoundingClientRect().right <= right + 0.5 && textRect(heads[heads.length - 1]).right <= right + 0.5,
    btn: btn ? { vis: getComputedStyle(btn).visibility, text: btn.textContent, h: Math.round(br.height - parseFloat(bs.top) - parseFloat(bs.bottom)), w: Math.round(br.width - parseFloat(bs.left) - parseFloat(bs.right)), x: br.left + br.width / 2, y: br.top + br.height / 2 } : null,
    notes: [...document.querySelectorAll(".mp-note")].map((n) => n.textContent).filter((t) => /swipe|Fetched/.test(t)) };
});

(async () => { const b = await chromium.launch();
  console.log("\n[D-09 · NEWS: a 120-character headline naming three companies, at 1440x900, 1280x720 and 1440x900 with text XL]");
  for (const [name, opts, prefs] of [["1440x900", DESK.C1, AUTO], ["1280x720", DESK.C2, AUTO], ["1440x900 XL", DESK.C1, XL]]) {
    const { ctx, p, errs } = await page(b, opts, prefs);
    await go(p, "#news", ".nwrow");
    const h = await p.evaluate(([H, PS]) => { const panel = eval(PS)("HEADLINES"), row = [...panel.querySelectorAll(".nwrow")].find((r) => r.querySelector(".nwh a")?.textContent === H); if (!row) return null;
      const nwh = row.querySelector(".nwh"), m = row.querySelector(".nwm"), lh = parseFloat(getComputedStyle(nwh).lineHeight), hr = nwh.getBoundingClientRect(), mr = m.getBoundingClientRect(), z = hr.height / nwh.offsetHeight;
      return { whole: nwh.scrollHeight <= nwh.clientHeight + 1 && nwh.scrollWidth <= nwh.clientWidth + 1, lines: Math.round(nwh.clientHeight / lh), second: m.textContent, below: mr.top >= hr.bottom - 1, chips: [...m.querySelectorAll(".tk")].map((x) => x.textContent), time: row.querySelector(".nwt").textContent, tip: nwh.title === H,
        times: [...panel.querySelectorAll(".nwrow .nwt")].map((x) => x.textContent), sgtRows: [...panel.querySelectorAll(".nwrow")].filter((r) => /SGT/.test(r.textContent)).length, head: panel.querySelector(".phead").textContent,
        seq: [...panel.querySelectorAll(".nwlist > .nwday, .nwlist > .nwrow")].map((e) => (e.classList.contains("nwday") ? { bar: e.textContent } : { t: e.querySelector(".nwt").textContent })), z }; }, [H120, PANEL.toString()]);
    ck(`${name}: the headline shows all its words on ${h?.lines} line(s) (at most three), its publisher and its three companies on a muted line under it ("${h?.second}")`, !!h && h.whole && h.lines <= 3 && h.below && h.chips.join() === "NVIDIA,Advantest,Tokyo Electron" && /^FT Markets/.test(h.second) && h.tip, h);
    const d = h ? dayBars(h.seq) : null;
    ck(`${name}: each row gives its time alone ("${h?.time}"), the panel says once that times are SGT, and the rows sit under day bars, a new one exactly where the day turns in Singapore (${d?.bars.join(", ")})`, !!h && h.times.every((t) => /^\d\d:\d\d$/.test(t)) && h.sgtRows === 0 && /HEADLINES/.test(h.head) && /times in SGT/.test(h.head) && d.bars.length >= 2 && d.bad.length === 0 && d.bars.every((x) => /^[A-Z][a-z]+day \d{1,2} [A-Z][a-z]{2}$/.test(x)), h && { times: h.times.slice(0, 3), sgtRows: h.sgtRows, head: h.head, bars: d.bars, bad: d.bad.slice(0, 6) });
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }

  console.log("\n[D-25 and D-48 · WATCHLIST on the two-column page, 1440x900; one column in reading order at text XL (1,067 CSS px)]");
  { const { ctx, p, errs } = await page(b, DESK.C1, AUTO);
    await go(p, "#watch", '.panel[data-k="wl-alerts"] tbody tr');
    const w = await p.evaluate(() => { const box = (k) => document.querySelector(`.panel[data-k="${k}"]`).getBoundingClientRect(); const pn = (k) => document.querySelector(`.panel[data-k="${k}"]`);
      const cut = (k) => [...pn(k).querySelectorAll(".pbody *")].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible").length + (pn(k).querySelector(".pbody").scrollWidth > pn(k).querySelector(".pbody").clientWidth + 1 ? 1 : 0);
      const texts = (k, sel) => [...pn(k).querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(), b = pn(k).querySelector(".pbody").getBoundingClientRect(); return r.right <= b.right + 1 && r.left >= b.left - 1; });
      const [wl, al, ea, nw, rs] = ["wl", "wl-alerts", "wl-earn", "wl-news", "wl-research"].map(box);
      return { cutA: cut("wl-alerts"), cutR: cut("wl-research"), alertsIn: texts("wl-alerts", "td.wrap a, td.wrap .lnk"), researchIn: texts("wl-research", "td.wrap .lnk"), left: { al: Math.round(al.left), ea: Math.round(ea.left) }, right: { nw: Math.round(nw.left), rs: Math.round(rs.left) },
        gapL: Math.round(al.top - ea.bottom), gapR: Math.round(rs.top - nw.bottom), wl: Math.round(wl.width), w4: Math.round(al.width), w8: Math.round(nw.width), top: { ea: Math.round(ea.top), nw: Math.round(nw.top) } }; });
    ck(`every alert and research title is whole: the first ${w.alertsIn.length} alerts and ${w.researchIn.length} pieces wrap inside their panels, nothing cut or scrolling sideways`, w.cutA === 0 && w.cutR === 0 && w.alertsIn.length === 10 && w.alertsIn.every(Boolean) && w.researchIn.every(Boolean), w);
    ck(`two columns: RESULTS AHEAD with ALERTS right under it (${w.gapL}px) on the left, ${w.w4}px wide; HEADLINES with IN RESEARCH under it (${w.gapR}px) on the right, ${w.w8}px; no hole between them`, w.left.al === w.left.ea && w.right.nw === w.right.rs && w.right.nw > w.left.al + w.w4 && w.gapL >= 0 && w.gapL <= 12 && w.gapR >= 0 && w.gapR <= 12 && w.top.ea === w.top.nw && Math.abs(w.w4 / w.wl - 4 / 12) < 0.03 && Math.abs(w.w8 / w.wl - 8 / 12) < 0.03, w);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  // D-48: at the feed's lengths the results dates stay on the first screen, the long lists are cut with "SHOW n MORE",
  // and every row is reached by scrolling the page, never a box inside it
  for (const code of ["C1", "C2"]) {
    const { ctx, p, errs } = await page(b, DESK[code], AUTO), vh = DESK[code].viewport.height;
    await go(p, "#watch", '.panel[data-k="wl-alerts"] tbody tr');
    const state = () => p.evaluate(() => ({ top: Math.round(document.querySelector('.panel[data-k="wl-earn"]').getBoundingClientRect().top), title: document.querySelector('.panel[data-k="wl-earn"] .phead .t').textContent, al: document.querySelectorAll('.panel[data-k="wl-alerts"] tbody tr').length, nw: document.querySelectorAll('.panel[data-k="wl-news"] .nwrow').length,
      moreA: document.querySelector("#wl-alerts-more")?.innerText.replace(/\s+/g, " ").trim() ?? null, moreN: document.querySelector("#wl-news-more")?.innerText.replace(/\s+/g, " ").trim() ?? null,
      boxes: [...document.querySelectorAll("#grid *")].filter((e) => e.scrollHeight > e.clientHeight + 1 && ["auto", "scroll"].includes(getComputedStyle(e).overflowY)).map((e) => e.className) }));
    const r0 = await state();
    ck(`${code}: with the feed's 40 alerts and 60 headlines, ${r0.title} starts at y ${r0.top}, on the first screen (above ${vh}); ALERTS shows 10 ("${r0.moreA}") and HEADLINES 15 ("${r0.moreN}"); no box scrolls inside the page`, S.watch.feed.alerts.length === 40 && S.watch.feed.news.length === 60 && r0.title === "RESULTS AHEAD" && r0.top < vh && r0.al === 10 && r0.nw === 15 && r0.moreA === "SHOW 10 MORE 10 of 40" && r0.moreN === "SHOW 15 MORE 15 of 60" && r0.boxes.length === 0, r0);
    for (let i = 0; i < 8 && (await p.locator("#wl-alerts-more .chip-sm").count()); i++) { await p.locator("#wl-alerts-more .chip-sm").click(); await p.waitForTimeout(120); }
    for (let i = 0; i < 8 && (await p.locator("#wl-news-more .chip-sm").count()); i++) { await p.locator("#wl-news-more .chip-sm").click(); await p.waitForTimeout(120); }
    const r1 = await state();
    const reach = await p.evaluate(() => [document.querySelector('.panel[data-k="wl-alerts"] tbody tr:last-child'), [...document.querySelectorAll('.panel[data-k="wl-news"] .nwrow')].pop()].map((e) => { e.scrollIntoView({ block: "end" }); const r = e.getBoundingClientRect(); return { inView: r.top >= 0 && r.bottom <= innerHeight + 1, pageY: Math.round(scrollY) }; }));
    ck(`${code}: after SHOW MORE all ${r1.al} alerts and ${r1.nw} headlines are on the page, the last of each reached by scrolling the page itself (to y ${reach.map((x) => x.pageY).join(" and ")}); still no box scrolls inside it`, r1.al === 40 && r1.nw === 60 && r1.moreA === null && r1.moreN === null && r1.boxes.length === 0 && reach.every((x) => x.inView && x.pageY > 0), { r1, reach });
    ck(`${code}: no page errors`, errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, DESK.C1, XL);
    await go(p, "#watch", '.panel[data-k="wl-alerts"] tbody tr');
    const o = await p.evaluate(() => [...document.querySelectorAll("#grid .panel")].map((x) => ({ no: x.dataset.no, top: Math.round(x.getBoundingClientRect().top), left: Math.round(x.getBoundingClientRect().left), w: Math.round(x.getBoundingClientRect().width) })).sort((a, c) => a.top - c.top));
    ck(`one column, in reading order (${o.map((x) => x.no).join(", ")}), each across the page`, o.map((x) => x.no).join() === "01,02,03,04,05" && o.every((x) => x.left === o[0].left && Math.abs(x.w - o[0].w) <= 1), o);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[D-07 · EQUITIES, SHORT INTEREST at 1440x900: natural height, three columns, headed (D-45, D-46)]");
  { const { ctx, p, errs } = await page(b, DESK.C1, AUTO);
    await go(p, "#equities/nk225", "#eq-short table.shpos tbody tr");
    const s = await p.evaluate((PS) => { const panel = eval(PS)("SHORT INTEREST"), r = panel.getBoundingClientRect(), cols = [...panel.querySelectorAll(".msg3 > div")].map((d) => { const x = d.getBoundingClientRect(); return { top: Math.round(x.top), left: Math.round(x.left) }; });
      const hidden = [...panel.querySelectorAll("*")].filter((e) => e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== "visible").map((e) => e.className);
      const pos = panel.querySelector("table.shpos"), sec = pos.querySelector("th.sec"), em = parseFloat(getComputedStyle(sec).fontSize), secW = sec.offsetWidth / em;
      const narrow = [...panel.querySelectorAll("td, th")].filter((c) => { if (!c.textContent.trim() || !c.checkVisibility()) return false; const tn = [...c.childNodes].map((n) => (n.nodeType === 3 ? n : n.firstChild)).find((n) => n && n.nodeType === 3 && n.data.trim()); if (!tn) return false; const i = tn.data.search(/\S/), rg = document.createRange(); rg.setStart(tn, i); rg.setEnd(tn, i + 1); return c.getBoundingClientRect().width < rg.getBoundingClientRect().width; }).map((c) => c.textContent);
      const ys = [...panel.querySelectorAll(".barsy span")].map((e) => e.textContent), ax = [...panel.querySelectorAll(".barsax span")].map((e) => e.textContent);
      return { h: Math.round(r.height), hidden, cols, heads: [...pos.querySelectorAll("thead th")].map((t) => t.textContent), secEm: Math.round(secW * 10) / 10, narrow, aux: panel.querySelector(".phead .aux").textContent, ys, ax, sectors: [...pos.querySelectorAll("td.sec")].map((t) => t.textContent) };
    }, PANEL.toString());
    ck(`the panel is ${s.h}px tall (at most 420) and nothing in it hides behind its own scrolling (${s.hidden.length} boxes)`, s.h <= 420 && s.hidden.length === 0, { h: s.h, hidden: s.hidden });
    ck(`three columns side by side: the market's share with its chart, the largest positions, the share by sector with the margin balances`, s.cols.length === 3 && s.cols.every((c) => c.top === s.cols[0].top) && s.cols[0].left < s.cols[1].left && s.cols[1].left < s.cols[2].left, s.cols);
    ck(`the positions are headed ${s.heads.join(" · ")}; the sector column is ${s.secEm} em wide (9 or more), names in English cut at a word ("${s.sectors.find((x) => /…$/.test(x)) ?? s.sectors[0]}"); no cell narrower than its first character`, s.heads.join("|") === "Name|Sector|Holders|% of shares|Date" && s.secEm >= 9 && s.narrow.length === 0 && s.sectors.every((x) => /^[A-Za-z]/.test(x)) && s.sectors.every((x) => !/…$/.test(x) || !/\s…$/.test(x)), { heads: s.heads, secEm: s.secEm, narrow: s.narrow, sectors: s.sectors });
    ck(`the sources in English first, Japanese in brackets, then the owner's "personal use" ("${s.aux}")`, /^JPX short-selling ratio \(空売り集計\) · short-position reports \(空売り残高報告\) · margin balances \(信用取引現在高\) · personal use$/.test(s.aux), s.aux);
    ck(`the bar chart has its scale (${s.ys.join(" to ")}) and its first and last dates (${s.ax.join(" … ")})`, s.ys.length === 2 && s.ys.every((x) => /^\d+\.\d%$/.test(x)) && parseFloat(s.ys[0]) > parseFloat(s.ys[1]) && /^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(s.ax[0]) && /on \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(s.ax[1]), { ys: s.ys, ax: s.ax });
    // D-46: the sector drawer's short column, Tokyo and US
    await p.locator(".panel[data-k='eq-sectors'] .lnk").first().click(); await p.waitForSelector(".drawer thead"); const jpHead = await p.evaluate(() => [...document.querySelectorAll(".drawer thead th")].pop().textContent); await p.keyboard.press("Escape");
    await go(p, "#equities/spx", ".panel[data-k='eq-sectors'] .lnk"); await p.locator(".panel[data-k='eq-sectors'] .lnk").first().click(); await p.waitForSelector(".drawer thead");
    const usHead = await p.evaluate(() => [...document.querySelectorAll(".drawer thead th")].pop().textContent); await p.keyboard.press("Escape");
    const us = await p.evaluate((PS) => { const panel = eval(PS)("SHORT INTEREST"); return { cols: panel.querySelectorAll(".msg3 > div").length, aux: panel.querySelector(".phead .aux").textContent, h: Math.round(panel.getBoundingClientRect().height) }; }, PANEL.toString());
    ck(`the sector drawer's short column says which figure it is: "${jpHead}" for Tokyo (reported positions), "${usHead}" for the S&P 500 (FINRA short volume); the US panel in two columns (${us.h}px)`, /^Short pos %/.test(jpHead) && /^Short vol %/.test(usHead) && us.cols === 2 && /^FINRA/.test(us.aux), { jpHead, usHead, us });
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[D-08 · EQUITIES in the designer's order; every chart title whole, its badges and stamp on the price line]");
  { const { ctx, p, errs } = await page(b, DESK.C1, AUTO);
    await go(p, "#equities/nk225", ".panel[data-k='eq-breadth'] .uplot");
    const e = await p.evaluate(() => { const ps = [...document.querySelectorAll("#grid .panel")]; const r = (k) => document.querySelector(`.panel[data-k="${k}"]`).getBoundingClientRect(); const br = document.querySelector(".brwrap"), t = br.querySelector("table").getBoundingClientRect(), c = br.querySelector(".brchart").getBoundingClientRect();
      return { order: ps.map((x) => `${x.dataset.no} ${x.querySelector(".phead .t").textContent}`), wide: ["eq-movers", "eq-breadth", "eq-short"].map((k) => Math.round(r(k).width)), chartBeside: c.left > t.right && Math.abs(c.top - t.top) < 60 }; });
    ck(`the panels: ${e.order.join(" · ")}`, e.order.join("|") === "01 NIKKEI 225|02 DRIVERS|03 SECTOR PERFORMANCE|04 FLOW BY SECTOR · 1D|05 MOVERS|06 MARKET BREADTH|07 SHORT INTEREST|08 HEAT MAP|09 SCREENER", e.order);
    ck(`MARKET BREADTH and SHORT INTEREST span the page like MOVERS (${e.wide.join(", ")}px); breadth has its three-year chart beside the table`, e.wide.every((x) => Math.abs(x - e.wide[0]) <= 1) && e.chartBeside, e);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  // an instrument's chart tile (a curve tile keeps its dates on its title line)
  const tilesState = (p) => p.evaluate(() => [...document.querySelectorAll(".mtile.cp")].filter((t) => t.querySelector(":scope > .lb > .lbtxt") && t.querySelector(":scope > .vl > .px") && t.checkVisibility()).map((t) => { const x = t.querySelector(".lbtxt"), lh = parseFloat(getComputedStyle(x).lineHeight); return { name: x.textContent, whole: x.scrollWidth <= x.clientWidth + 1 && x.scrollHeight <= x.clientHeight + 1, lines: Math.round(x.clientHeight / lh), onlyTitle: t.querySelector(":scope > .lb").children.length === 1, stamp: !!t.querySelector(":scope > .vl > .tags > .asof") }; }));
  for (const [name, opts, prefs] of [["1280x720", DESK.C2, AUTO], ["1440x900", DESK.C1, AUTO], ["1920x1080", DESK.C6, AUTO], ["2560x1440", DESK.C7, AUTO], ["1440x900 compact", DESK.C1, COMPACT]]) {
    const { ctx, p, errs } = await page(b, opts, prefs); const seen = [];
    for (const h of ["#market", "#equities/nk225", "#equities/topix", "#rates"]) { await go(p, h, ".mtile.cp .lbtxt"); for (const t of await tilesState(p)) seen.push({ h, ...t }); }
    const bad = seen.filter((t) => !t.whole || t.lines > 2 || !t.onlyTitle || !t.stamp);
    ck(`${name}: every one of ${seen.length} chart titles on MARKETS, EQUITIES (two indices) and RATES & FX whole, on at most two lines, alone on its line, with the stamp on the price line ("${seen.find((t) => /CME/.test(t.name))?.name}")`, seen.length >= 20 && bad.length === 0, bad.slice(0, 6));
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }

  console.log("\n[D-10, D-37 · search: on a phone rows a finger can hit, under the field; on a computer the placeholder and the / key]");
  for (const dev of ["iPhone SE (3rd gen)", "iPhone 13"]) {
    const { ctx, p, errs } = await page(b, { ...devices[dev] });
    await go(p, "#market", ".mp-row");
    await p.locator('#pv2-btns button[aria-label^="Search"]').tap(); await p.waitForTimeout(200);
    const ph = await p.locator("#search input").getAttribute("placeholder");
    await p.locator("#search input").fill("toy"); await p.waitForSelector(".sres .sitem b"); await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const inp = document.querySelector("#search input").getBoundingClientRect(), box = document.querySelector(".sres").getBoundingClientRect();
      return { under: box.top >= inp.bottom - 0.5, rows: [...document.querySelectorAll(".sres .sitem")].map((e) => { const x = e.getBoundingClientRect(), nm = e.querySelector(".nm"); return { h: Math.round(x.height), name: nm.textContent, whole: nm.scrollWidth <= nm.clientWidth + 1 && nm.getBoundingClientRect().right <= x.right + 0.5, px: parseFloat(getComputedStyle(nm).fontSize), first: nm.getBoundingClientRect().top < e.querySelector("b").getBoundingClientRect().top, second: `${e.querySelector("b").textContent} ${e.querySelector(".mut").textContent}` }; }) }; });
    ck(`${dev}: "toy" gives ${r.rows.length} rows of ${Math.min(...r.rows.map((x) => x.h))}px or more under the field, never over it; each name whole at ${r.rows[0]?.px}px on the first line ("${r.rows[0]?.name}"), "${r.rows[0]?.second}" under it`, r.rows.length >= 3 && r.under && r.rows.every((x) => x.h >= 52 && x.whole && x.px >= 15 && x.first) && r.rows.some((x) => x.name === "Toyota Motor Corp"), r);
    ck(`${dev}: the placeholder is "${ph}"`, ph === "Search stocks, bonds, currencies");
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }
  { const { ctx, p, errs } = await page(b, DESK.C1, AUTO);
    await go(p, "#market", "#search input");
    const s = await p.evaluate(() => { const i = document.querySelector("#search input"), k = document.querySelector("#search .skey"), ir = i.getBoundingClientRect(), kr = k?.getBoundingClientRect(); return { ph: i.placeholder, key: k?.textContent, inside: !!kr && kr.right <= ir.right && kr.left >= ir.left + ir.width / 2 && kr.top >= ir.top && kr.bottom <= ir.bottom }; });
    await p.keyboard.press("/"); const focused = await p.evaluate(() => document.activeElement === document.querySelector("#search input"));
    ck(`computer: the placeholder "${s.ph}", a "${s.key}" key cap inside the box at its right, and the key itself jumps to the box`, s.ph === "Search stocks, bonds, currencies" && s.key === "/" && s.inside && focused, s);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[D-03 · a stock's statements on a phone: whole columns beside the line names and at the right edge, at the latest periods, pressed back and swiped]");
  for (const dev of ["iPhone SE (3rd gen)", "iPhone 13"]) for (const sym of ["7203.T", "NVDA"]) {
    const { ctx, p, errs } = await page(b, { ...devices[dev] });
    await go(p, "#asset/" + sym, "table.fin");
    await p.evaluate(() => { const t = document.querySelector("table.fin thead").getBoundingClientRect(); window.scrollTo(0, scrollY + t.top - innerHeight / 2); }); await rest(p);
    for (const view of ["annual", "quarterly"]) {
      if (view === "quarterly") { const was = await p.evaluate(() => document.querySelector(".finbox thead th:not(.l)").textContent); await p.locator("#st-view").selectOption("quarterly"); await p.waitForFunction((w) => document.querySelector(".finbox thead th:not(.l)")?.textContent !== w, was); await rest(p); }
      const o = await finState(p);
      ck(`${dev} · ${sym} · ${view}: opens at the latest periods (${o.shown.join(", ")}, the last ending inside the box) with no part of a period beside the line names or at the right edge`, o.over && o.lastWhole && o.shown.includes(o.last) && o.partial.length === 0, o);
      await p.evaluate(() => { const bx = document.querySelector(".finbox"); bx.scrollLeft = Math.max(0, bx.scrollLeft - 50); }); await rest(p);
      const s = await finState(p);
      ck(`${dev} · ${sym} · ${view}: moved 50 px, part of a column, it comes to rest on a column's edge (${s.shown.join(", ")}), nothing of a period at either edge`, s.partial.length === 0 && s.left < o.left, { o: o.left, s });
      // the designer's swipe: 40 px each way from where it rests, and back
      const sw = [];
      for (const [from, dx] of [["latest", -40], ["", 40], ["", 40]]) {
        if (from) { await p.evaluate(() => { const bx = document.querySelector(".finbox"); bx.scrollTo({ left: bx.scrollWidth, behavior: "instant" }); }); await rest(p); }
        await p.evaluate((d) => document.querySelector(".finbox").scrollBy({ left: d, behavior: "instant" }), dx); await rest(p);
        const w = await finState(p); sw.push({ dx, left: w.left, shown: w.shown.join(", "), partial: w.partial });
      }
      ck(`${dev} · ${sym} · ${view}: swiped 40 px back and 40 px on, it rests on whole periods every time (${sw.map((x) => `${x.dx > 0 ? "+" : ""}${x.dx}: ${x.shown}`).join(" · ")})`, sw.every((x) => x.partial.length === 0 && x.shown) && sw[0].left < o.left && sw[1].left === o.left, sw);
      if (o.btn && s.left > 0) {
        await p.evaluate(() => { const bx = document.querySelector(".finbox"); bx.scrollTo({ left: bx.scrollWidth }); }); await rest(p);
        const a = await finState(p), steps = [];
        for (let i = 0; i < 8; i++) { const v = await finState(p); if (!v.btn || v.btn.vis === "hidden") break; await p.touchscreen.tap(v.btn.x, v.btn.y); await rest(p); const w = await finState(p); steps.push(`${w.shown.join(" ")}${w.partial.length ? ` (partial: ${w.partial.join(", ")})` : ""}`); if (w.partial.length) break; }
        const z = await finState(p);
        ck(`${dev} · ${sym} · ${view}: "${a.btn.text}" (${a.btn.w}x${a.btn.h}px to a finger) goes back a screen at a time (${steps.join(" → ")}), never leaving part of a period at either edge, and hides at the start`, a.btn.vis === "visible" && a.btn.h >= 44 && a.btn.w >= 44 && steps.length >= 1 && !steps.some((x) => /partial/.test(x)) && z.left === 0 && z.btn.vis === "hidden" && z.partial.length === 0, { a: a.btn, steps, z: { left: z.left, btn: z.btn } });
      }
    }
    const notes = await p.evaluate(() => [...document.querySelectorAll(".mp-note")].map((n) => n.textContent).filter((t) => /swipe|Fetched/.test(t)));
    ck(`${dev} · ${sym}: the note "swipe the table sideways" has gone; the fetch date stays (${notes.join(" | ")})`, notes.length === 1 && /^Fetched /.test(notes[0]), notes);
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }
  { const { ctx, p, errs } = await page(b, DESK.C1, AUTO);
    for (const sym of ["7203.T", "NVDA"]) { await go(p, "#asset/" + sym, "table.fin"); const o = await p.evaluate(() => { const bx = document.querySelector(".finbox"); return { over: bx.scrollWidth > bx.clientWidth + 1, btn: !!bx.querySelector(".finprev") }; }); ck(`computer 1440x900 · ${sym}: the statements fit their panel, with no "earlier years" control`, !o.over && !o.btn, o); }
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[D-28 · curves: room under the lowest yield label; the phone curve's source line wraps]");
  const curves = (p) => p.evaluate(() => [...document.querySelectorAll(".chartwrap")].filter((w) => w.querySelector(".curvex") && w.querySelector(".uplot") && w.checkVisibility()).map((w) => { const wrap = w.querySelector(".u-wrap").getBoundingClientRect(), over = w.querySelector(".u-over").getBoundingClientRect(), z = wrap.height / w.querySelector(".u-wrap").offsetHeight; return Math.round((wrap.bottom - over.bottom) / z); }));
  { const { ctx, p, errs } = await page(b, DESK.C1, AUTO);
    await go(p, "#market", ".curvex"); const m = await curves(p); await go(p, "#rates", ".curvex"); const r = await curves(p);
    ck(`1440x900: under every curve's plot (${m.length} on MARKETS, ${r.length} on RATES & FX) there are ${Math.min(...m, ...r)} px or more for half of the lowest label (6 px or more needed)`, m.length === 2 && r.length >= 6 && [...m, ...r].every((x) => x >= 7), { m, r });
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, { ...devices["iPhone 13"] });
    await go(p, "#market", ".mp-row"); const m = await curves(p);
    const line = await p.evaluate(() => { const x = [...document.querySelectorAll(".rdout.crv")].find((e) => e.checkVisibility()); if (!x) return null; const r = x.getBoundingClientRect(), t = x.closest(".mtile").getBoundingClientRect(); return { text: x.textContent, whole: x.scrollWidth <= x.clientWidth + 1 && r.right <= t.right + 0.5 && getComputedStyle(x).whiteSpace !== "nowrap" }; });
    await go(p, "#rates", ".mp-row"); const r = await curves(p);
    ck(`iPhone 13: under each curve (MARKETS ${m.length}, RATES & FX ${r.length}) ${Math.min(...m, ...r)} px or more; the source line under MARKETS' curve wraps whole ("…${line?.text.slice(-24)}")`, m.length >= 1 && r.length >= 1 && [...m, ...r].every((x) => x >= 7) && !!line && line.whole, { m, r, line });
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[the header's alert line: label, name, figure with what it is, and time; only the name is ever cut]");
  const lineParts = (p) => p.evaluate(() => { const al = document.querySelector("#alerts .alrt"), ar = al.getBoundingClientRect(); const part = (s) => { const e = al.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { t: e.textContent, whole: e.scrollWidth <= e.clientWidth + 1 && r.right <= ar.right + 0.5 && r.width > 0 }; }; return { k: part(".k"), kd: part(".one .kd"), nm: part(".one .nm"), fig: part(".one .fig"), q: part(".one .q"), src: part(".one .src"), t: part(".t"), msgShown: al.querySelector(".msg").checkVisibility(), tip: al.title.split("\n")[0] }; });
  const said = (a) => [a.k, a.kd, a.nm, a.fig, a.q, a.src, a.t].filter(Boolean).map((x) => x.t).join(" · ");
  for (const [name, opts] of [["1440x900", DESK.C1], ["1280x720", DESK.C2]]) {
    const { ctx, p, errs } = await page(b, opts, AUTO);
    await go(p, "#watch", "#alerts .alrt .one");
    const a = await lineParts(p);
    ck(`${name}: "${said(a)}": the figure says what it is (the session's largest move, "intraday"), whole, as is the time; the whole message on hover ("${a.tip}")`, a.k?.whole && a.fig?.whole && a.q?.whole && a.q.t === "intraday" && a.t?.whole && /^(\d{1,2} [A-Z][a-z]{2} )?\d\d:\d\d$/.test(a.t.t) && /^[+−-]?\d+\.\d%$/.test(a.fig.t) && !a.msgShown && /down 11\.2% intraday/.test(a.tip), a);
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }
  // every kind of latest alert, as the server words it, from the alerts list the stand-in server answers here
  { const ago = new Date(Date.now() - 5 * 60e3).toISOString(), day = ago.slice(0, 10), mv = (o) => ({ id: 900, at: ago, d: day, price: 1, url: null, ...o });
    const orphan = S.alerts.find((x) => /^news:/.test(x.symbol)), company = S.alerts.find((x) => x.kind === "mna" && !/^news:/.test(x.symbol));
    const CASES = [
      { what: "an index while its market is not trading: its 1D", sizes: [DESK.C1], row: mv({ symbol: "^N225", name: "Nikkei 225", kind: "index", pct: -3.4, market: "TSE", msg: "Nikkei 225 down 3.4%" }), ok: (a) => a.fig?.t === "-3.4%" && a.q?.t === "1D" && a.q.whole && !a.src },
      { what: "a stock measured at its official close: at close", sizes: [DESK.C1], row: mv({ symbol: "INTU", name: "Intuit Inc.", kind: "stock", pct: -7.2, market: "NYSE", msg: "Intuit Inc. down 7.2%" }), ok: (a) => a.fig?.t === "-7.2%" && a.q?.t === "at close" && a.q.whole && !a.src },
      { what: "a deal with a company: its kind and the company, no figure", sizes: [DESK.C1], row: company, ok: (a) => a.kd?.t === "M&A" && a.nm?.t === company.name && !a.fig && !a.q && !a.src },
      { what: "a deal that names no company here: the headline's first words where the name goes, and the publisher it came from", sizes: [DESK.C1, DESK.C2], row: orphan, ok: (a) => a.kd?.t === "M&A" && a.nm?.t === orphan.msg.replace(/^M&A: /, "") && a.src?.t === `via ${orphan.market}` && a.src.whole && !a.fig && a.tip.includes(`(${orphan.market}) · `) && /· \d{1,2} [A-Z][a-z]{2} \d\d:\d\d SGT$/.test(a.tip) && a.tip.endsWith(` ${a.t?.t} SGT`) },   // the line's time ("02:09" today, "19 Nov 02:09" before) ends the tip's whole stamp ("20 Nov 02:09 SGT"; I-5)
    ];
    for (const c of CASES) for (const opts of c.sizes) {
      const { ctx, p, errs } = await page(b, opts, AUTO); await routes(p);
      await p.route("**/fakeapi?*", (r) => (new URL(r.request().url()).searchParams.get("action") === "alerts" ? r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ rows: [c.row] }) }) : r.fallback()));
      await p.goto(FAKE + "#news", { waitUntil: "networkidle" }); await p.waitForSelector("#alerts .alrt .one .nm"); await p.waitForTimeout(300);
      const a = await lineParts(p);
      ck(`${opts.viewport.width}x${opts.viewport.height}, ${c.what}: "${said(a)}"; the time whole`, c.ok(a) && a.k?.whole && a.t?.whole, a);
      ck("no page errors", errs.length === 0, errs); await ctx.close();
    } }
  { const { ctx, p, errs } = await page(b, { ...devices["iPhone 13"] });
    // A phone's alert is one line of 40 px since its first MARKETS screen was rebuilt (the designer's note (b), 21 Nov
    // 2026; it showed the whole message on two lines under the label): the label, the name and the figure, with no
    // "intraday" (the list it opens says what the figure is). Only the name may be cut.
    await go(p, "#market", "#alerts .alrt .one"); const m = await p.evaluate(() => { const al = document.querySelector("#alerts .alrt"), ar = al.getBoundingClientRect(), part = (s) => { const e = al.querySelector(s); if (!e || !e.checkVisibility()) return null; const r = e.getBoundingClientRect(); return { t: e.textContent, whole: e.scrollWidth <= e.clientWidth + 1 && r.right <= ar.right + 0.5 && r.width > 0 }; };
      return { h: Math.round(ar.height), k: part(".k"), nm: part(".one .nm"), fig: part(".one .fig"), q: part(".one .q"), t: part(".t"), msg: al.querySelector(".msg").checkVisibility(), tip: al.title.split("\n")[0], ox: document.documentElement.scrollWidth - innerWidth }; });
    ck(`iPhone 13: the header's alert is one line of ${m.h} px: "${[m.k, m.nm, m.fig].filter(Boolean).map((x) => x.t).join(" · ")}", the label and the figure whole, no "intraday" on the line; the whole message is the line's title ("${m.tip}")`, m.h === 40 && m.k?.whole && !!m.nm && m.fig?.whole && /^[+−-]?\d+\.\d%$/.test(m.fig.t) && !m.q && !m.msg && /down 11\.2% intraday/.test(m.tip) && m.ox <= 0, m);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
