// RESEARCH on a desktop: the list and the document scroll separately, the document fills its panel.
// Run from web/:  node e2e/run.cjs research   (the runner starts the servers this needs; see e2e/run.cjs)
const { open } = require("./harness.cjs");
const M = (p) => p.evaluate(() => { const q = (s) => document.querySelector(s); const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const lbs = [q('.panel[data-k="replist"] .reprows'), q('.panel[data-k="replist"] .pbody')], lb = lbs.find((e) => e && e.scrollHeight > e.clientHeight + 2) ?? lbs[0], pb = q('.panel[data-k="report"] .pbody'), doc = q('.panel[data-k="report"] .brnar'), cs = getComputedStyle(pb), f = q("footer");
  return { z: document.body.style.zoom, term: document.body.classList.contains("term"), pageY: Math.round(scrollY), pageScrollable: document.documentElement.scrollHeight > innerHeight + 2, list: r(q('.panel[data-k="replist"]')), listScroll: Math.round(lb.scrollTop), listScrollable: lb.scrollHeight > lb.clientHeight + 2, report: r(q('.panel[data-k="report"]')), repScroll: Math.round(pb.scrollTop), repScrollable: pb.scrollHeight > pb.clientHeight + 2,
    searchY: Math.round(q('.searchrow').getBoundingClientRect().y), headY: Math.round(q('table.repT th').getBoundingClientRect().y), headGap: Math.round(q('table.repT th').getBoundingClientRect().y - q('.panel[data-k="replist"] .reprows').getBoundingClientRect().y), listBodyOverflowX: q('.panel[data-k="replist"] .reprows').scrollWidth - q('.panel[data-k="replist"] .reprows').clientWidth,
    docW: doc.offsetWidth, bodyInnerW: pb.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), hOverflow: pb.scrollWidth - pb.clientWidth, footerBottom: f && getComputedStyle(f).display !== "none" ? Math.round(f.getBoundingClientRect().bottom) : null, winH: innerHeight }; });
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
(async () => {
  for (const cfg of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 2560, height: 1440 }, { width: 1440, height: 900, size: "S" }, { width: 1440, height: 900, size: "XL" }]) {
    const name = `${cfg.width}x${cfg.height} ${cfg.size ?? "AUTO"}`; console.log(`\n[wide] ${name}`);
    const { b, p, errs } = await open(cfg); const { width: w, height: h } = cfg;
    const m0 = await M(p);
    ck("page does not scroll", !m0.pageScrollable && m0.pageY === 0, m0);
    ck("both panels scroll inside themselves", m0.listScrollable && m0.repScrollable, m0);
    ck("panels end inside the window", m0.list.y + m0.list.h <= h && m0.report.y + m0.report.h <= h, m0);
    ck("footer visible inside the window", m0.footerBottom != null && m0.footerBottom <= h + 1, m0);
    ck("document fills the panel width", Math.abs(m0.docW - m0.bodyInnerW) <= 1, m0);
    ck("no sideways overflow in the document panel", m0.hOverflow <= 0, m0);
    await p.mouse.move(Math.round(w * 0.66), Math.round(h * 0.6)); await p.mouse.wheel(0, 900); await p.waitForTimeout(300);
    const m1 = await M(p);
    ck("wheel over the document: document scrolls", m1.repScroll > 0, m1);
    ck("wheel over the document: list stays put", m1.listScroll === 0 && m1.list.y === m0.list.y && m1.pageY === 0, m1);
    if (cfg.width === 1440 && !cfg.size) await p.screenshot({ path: "after-1440-doc-scrolled.png" });
    await p.mouse.move(Math.round(w * 0.15), Math.round(h * 0.6)); await p.mouse.wheel(0, 500); await p.waitForTimeout(300);
    const m2 = await M(p);
    ck("wheel over the list: list scrolls, document stays put", m2.listScroll > 0 && m2.repScroll === m1.repScroll && m2.pageY === 0, m2);
    ck("list scrolled: search box and column heads stay put, no gap above the heads", m2.searchY === m0.searchY && m2.headY === m0.headY && m2.headGap === 0 && m2.listBodyOverflowX <= 0, { m0: [m0.searchY, m0.headY], m2: [m2.searchY, m2.headY, m2.headGap, m2.listBodyOverflowX] });
    // wheel far past the end of the document: nothing else moves
    await p.mouse.move(Math.round(w * 0.66), Math.round(h * 0.6)); for (let i = 0; i < 12; i++) await p.mouse.wheel(0, 2000); await p.waitForTimeout(300);
    const m3 = await M(p);
    ck("wheel past the document's end: list and page still put", m3.listScroll === m2.listScroll && m3.pageY === 0, m3);
    // open another piece: the document starts at its top
    // a plain mouse click on a row that is on screen (a locator click would first scroll the row into view itself)
    const before = await p.evaluate(() => document.querySelector('table.repT tr.sel')?.textContent);
    await p.mouse.click(Math.round(w * 0.15), Math.round(h * 0.6)); await p.waitForTimeout(500);
    const after = await p.evaluate(() => document.querySelector('table.repT tr.sel')?.textContent);
    ck("the click opened a different piece", !!after && after !== before, { before, after });
    const m4 = await M(p);
    ck("another piece opens at its top; list keeps its place", m4.repScroll === 0 && m4.listScroll === m2.listScroll, m4);
    if (cfg.width === 1440 && !cfg.size) await p.screenshot({ path: "after-1440-report.png" });
    ck("no page errors", errs.length === 0, errs);
    await b.close();
  }
  { console.log("\n[COMPACT one-screen] 1440x900");
    const { b, p, errs } = await open({ width: 1440, height: 900, compact: true }); const m = await M(p);
    ck("one-screen layout on", m.term, m); ck("document fills the panel width", Math.abs(m.docW - m.bodyInnerW) <= 1, m); ck("no sideways overflow", m.hOverflow <= 0, m);
    await p.mouse.move(950, 540); await p.mouse.wheel(0, 900); await p.waitForTimeout(300); const m1 = await M(p);
    ck("document scrolls, list stays put", m1.repScroll > 0 && m1.listScroll === 0 && m1.pageY === 0, m1);
    await p.mouse.move(220, 540); await p.mouse.wheel(0, 500); await p.waitForTimeout(300); const mc = await M(p);
    ck("list scrolls; search box and column heads stay put", mc.listScroll > 0 && mc.searchY === m.searchY && mc.headY === m.headY && mc.headGap === 0 && mc.repScroll === m1.repScroll, { m: [m.searchY, m.headY], mc: [mc.listScroll, mc.searchY, mc.headY, mc.headGap] });
    await p.mouse.click(220, 540); await p.waitForTimeout(500);
    ck("another piece opens at its top", (await M(p)).repScroll === 0);
    await p.screenshot({ path: "after-1440-compact.png" }); ck("no page errors", errs.length === 0, errs); await b.close(); }
  for (const cfg of [{ width: 1000, height: 800 }, { width: 800, height: 1100 }]) {
    console.log(`\n[stacked: narrow window or tablet] ${cfg.width}x${cfg.height}`);
    const { b, p, errs } = await open(cfg); const m = await M(p);
    ck("panels stacked (document under the list), as before", m.report.y >= m.list.y + m.list.h - 1, m);
    ck("page scrolls as before; panels do not scroll inside", m.pageScrollable && !m.repScrollable && !m.listScrollable, m);
    ck("no back button, address unchanged by a click on a title", (await p.locator(".rsback").count()) === 0);
    ck("no sideways overflow", m.hOverflow <= 0, m); ck("no page errors", errs.length === 0, errs); await b.close(); }
  { console.log("\n[phone width] 390x844");
    const { b, p, errs } = await open({ width: 390, height: 844, waitFor: "table.repT" });
    const s = await p.evaluate(() => ({ list: document.querySelectorAll('.panel[data-k="replist"]').length, doc: document.querySelectorAll('.panel[data-k="report"]').length, pageScrollable: document.documentElement.scrollHeight > innerHeight + 2, overflowX: document.documentElement.scrollWidth - innerWidth }));
    ck("titles only; the page scrolls; nothing overflows sideways", s.list === 1 && s.doc === 0 && s.pageScrollable && s.overflowX <= 0, s); ck("no page errors", errs.length === 0, errs); await b.close(); }
  { console.log("\n[short window] 1300x420");
    const { b, p } = await open({ width: 1300, height: 420 }); const m = await M(p);
    ck("page scrolls instead of squeezing the panels", m.pageScrollable && m.report.h >= 250, m); await b.close(); }
  { console.log("\n[other tabs] 1440x900");
    const { b, p } = await open({ width: 1440, height: 900 });
    await p.evaluate(() => { location.hash = "#market"; }); await p.waitForTimeout(800);
    const s = await p.evaluate(() => ({ bodyDisplay: getComputedStyle(document.body).display, bodyH: document.body.style.height, scrollable: document.documentElement.scrollHeight > innerHeight + 2, view: document.querySelector("#grid").dataset.view }));
    ck("MARKET keeps its normal page layout", s.view === "market" && s.bodyDisplay === "block", s);
    await p.evaluate(() => { location.hash = "#research"; }); await p.waitForTimeout(800); const m = await M(p);
    ck("back on RESEARCH: independent panels again", !m.pageScrollable && m.repScrollable, m); await b.close(); }
  { console.log("\n[print / PDF] 1440x900");
    const { b, p } = await open({ width: 1440, height: 900 });
    await p.mouse.move(950, 540); await p.mouse.wheel(0, 700); await p.waitForTimeout(200);
    await p.emulateMedia({ media: "print" }); await p.waitForTimeout(200);
    const s = await p.evaluate(() => { const pb = document.querySelector('.panel[data-k="report"] .pbody'), doc = document.querySelector('.brnar.report'); return { listShown: getComputedStyle(document.querySelector('.panel[data-k="replist"]')).display !== "none", clipped: pb.scrollHeight > pb.clientHeight + 2, bodyH: getComputedStyle(document.body).height, docH: doc.offsetHeight, bodyDisplay: getComputedStyle(document.body).display }; });
    ck("print: list hidden, document not clipped", !s.listShown && !s.clipped && s.bodyDisplay === "block", s);
    const pdf = await p.pdf({ format: "A4" }); const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    ck(`print: the whole document reaches the PDF (${pages} pages)`, pages >= 2, pages); await b.close(); }
  console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})();
