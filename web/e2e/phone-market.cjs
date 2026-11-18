// The phone layout: MARKET, the header, the bottom tab bar and the layout switch.
// Run from web/:  node e2e/run.cjs phone-market   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const state = (p) => p.evaluate(() => ({ pv2: document.body.classList.contains("pv2"), zoom: document.body.style.zoom, nav: document.querySelectorAll("#pnav a").length, table: document.querySelectorAll("table.mkt").length, list: document.querySelectorAll(".mp-row").length, url: location.href.replace(location.origin, "") }));
const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
(async () => { const b = await chromium.launch();
  // the classic table's figures, to compare the phone list against
  const classic = {}; { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForSelector("table.mkt tbody tr:not(.cls)"); await p.waitForTimeout(500);
    Object.assign(classic, await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("table.mkt tbody tr:not(.cls)")].map((tr) => { const td = [...tr.children]; const name = td[0].childNodes[0].textContent.trim(); return [name, { last: td[1].textContent.trim(), d1: td[2].textContent.trim(), w1: td[3].textContent.trim(), m12: td[6].textContent.trim() }]; }))));
    const s = await state(p); ck("laptop: unaffected (no phone shell)", !s.pv2 && s.nav === 0 && s.table === 1, s);
    await p.goto(MOCK + "?phone=new#market", { waitUntil: "networkidle" }); await p.waitForTimeout(600); const s2 = await state(p);
    ck("laptop with the preview switched on: still the desktop layout", !s2.pv2 && s2.nav === 0 && s2.table === 1 && s2.list === 0, s2); await ctx.close(); }
  for (const dev of ["iPhone 13", "Pixel 7"]) { console.log(`\n[${dev}]`);
    const ctx = await b.newContext({ ...devices[dev] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.waitForTimeout(500);
    const s0 = await state(p); ck("default on a phone (since 18 Nov): the phone layout at true size, the list, six bottom tabs", s0.pv2 && s0.zoom === "1" && s0.nav === 6 && s0.table === 0 && s0.list > 0, s0);
    await p.goto(MOCK + "?phone=new#market", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.waitForTimeout(600);
    const s1 = await state(p); ck("?phone=new: preview on at true size, six bottom tabs, the switch gone from the address", s1.pv2 && s1.zoom === "1" && s1.nav === 6 && s1.table === 0 && s1.list > 0 && !s1.url.includes("phone="), s1);
    const rows = await p.evaluate(() => [...document.querySelectorAll(".mp-row")].map((r) => ({ name: r.querySelector(".n").textContent.trim(), last: r.querySelector(".mp-px").textContent.trim().replace(/%$/, ""), chg: r.querySelector(".mp-chg").textContent.trim() })));
    const bad = rows.filter((r) => !classic[r.name] || classic[r.name].last !== r.last || classic[r.name].d1 !== r.chg);
    ck(`all ${rows.length} lines carry the desktop table's name, level and 1D change`, rows.length === Object.keys(classic).length && bad.length === 0, bad.slice(0, 3));
    await p.locator(".mp-head .pick select").selectOption("1W"); await p.waitForTimeout(400);
    const w = await p.evaluate(() => [...document.querySelectorAll(".mp-row")].map((r) => ({ name: r.querySelector(".n").textContent.trim(), chg: r.querySelector(".mp-chg").textContent.trim() })));
    ck("Change -> 1W: every line shows the table's 1W figure", w.every((r) => classic[r.name]?.w1 === r.chg), w.filter((r) => classic[r.name]?.w1 !== r.chg).slice(0, 3));
    await p.locator(".mp-head .pick select").selectOption("1D"); await p.waitForTimeout(300);
    await p.evaluate(() => { document.querySelector("#mockbar")?.style.setProperty("display", "none"); window.__tapH = (el) => { el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(), x = r.left + r.width / 2; let n = 0; for (let y = Math.floor(r.top) - 8; y <= Math.ceil(r.bottom) + 8; y++) { const hit = document.elementFromPoint(x, y); if (hit && (hit === el || el.contains(hit))) n++; } return n; }; }); 
    const m = await p.evaluate(() => { const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const fs = []; const w = document.createTreeWalker(document.querySelector(".mp"), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.textContent.trim() && vis(n.parentElement) && !n.parentElement.closest(".mtile, .badge")) fs.push(parseFloat(getComputedStyle(n.parentElement).fontSize)); }
      const h = (sel) => [...document.querySelectorAll(sel)].filter(vis).map((e) => e.getBoundingClientRect().height); return { minFont: Math.min(...fs), rowMin: Math.min(...h(".mp-row")), navMin: Math.min(...h("#pnav a")), pick: window.__tapH(document.querySelector(".mp-head .pick")), pickSeen: Math.min(...h(".mp-head .pick")), btn: Math.min(...h("#pv2-btns button")), overflowX: document.documentElement.scrollWidth - innerWidth, screens: Math.round(10 * document.documentElement.scrollHeight / innerHeight) / 10 }; });
    ck(`sizes: text ≥ 11px (smallest ${m.minFont}px), rows ${Math.round(m.rowMin)}px, tabs ${Math.round(m.navMin)}px, drop-down ${Math.round(m.pick)}px to the finger (${Math.round(m.pickSeen)}px to the eye), header buttons ${Math.round(m.btn)}px (all ≥ 44)`, m.minFont >= 11 && m.rowMin >= 44 && m.navMin >= 44 && m.pick >= 44 && m.pickSeen >= 35 && m.pickSeen <= 38 && m.btn >= 44, m);
    ck("nothing overflows sideways", m.overflowX <= 0, m);
    await p.locator(".mp-row").nth(1).tap(); await p.waitForSelector(".mp-det canvas, .mp-det .chartbox"); await p.waitForTimeout(1200);
    const d = await p.evaluate(() => ({ open: document.querySelectorAll(".mp-item.open").length, chart: document.querySelectorAll(".mp-det canvas").length, cells: document.querySelectorAll(".mp-det .mp-grid > div").length, cur: document.querySelector(".mp-det .mp-grid .cur .k")?.textContent, more: !!document.querySelector(".mp-more") }));
    ck("tap a line: its chart, six periods and three statistics open under it", d.open === 1 && d.chart >= 1 && d.cells === 9 && d.cur === "1D" && d.more, d);
    await p.locator(".mp-row").nth(3).tap(); await p.waitForTimeout(500); ck("tapping another line moves the detail there", (await p.evaluate(() => [...document.querySelectorAll(".mp-item")].map((e, i) => e.classList.contains("open") ? i : -1).filter((i) => i >= 0).join())) === "3");
    await p.locator(".mp-row").nth(3).tap(); await p.waitForTimeout(300); ck("tapping it again closes the detail", (await p.locator(".mp-item.open").count()) === 0);
    await p.locator("#pnav a", { hasText: "News" }).tap(); await p.waitForTimeout(700);
    const n = await p.evaluate(() => ({ hash: location.hash, on: document.querySelector("#pnav a.on")?.textContent, panels: document.querySelectorAll(".mp-sec").length, y: scrollY }));
    ck("bottom tab News: opens NEWS and lights that tab", n.hash === "#news" && n.on === "News" && n.panels >= 2, n);
    await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(300);
    const f = await p.evaluate(() => ({ footer: document.querySelector("footer").getBoundingClientRect().bottom, nav: document.querySelector("#pnav").getBoundingClientRect().top })); ck("the bottom bar does not cover the end of the page", f.footer <= f.nav + 1, f);
    await p.locator("#pnav a", { hasText: "Market" }).tap(); await p.waitForSelector(".mp-row"); await p.evaluate(() => scrollTo(0, 0));
    await p.locator("#pv2-btns button").nth(1).tap(); await p.waitForTimeout(300);
    const menu = await p.evaluate(() => { const v = (s) => { const e = document.querySelector(s); return !!e && e.getBoundingClientRect().height > 0; }; return { search: v("#search input"), clock: v("#clock"), account: v("#userchip"), off: v("#pv2-off"), tabsRow: v("#nav") }; });
    ck("menu: search, clocks, account and the way back to the classic layout", menu.search && menu.clock && menu.account && menu.off && !menu.tabsRow, menu);
    await p.locator("#pv2-off").tap(); await p.waitForSelector("table.mkt"); await p.waitForTimeout(500); const s3 = await state(p);
    ck("CLASSIC LAYOUT: back exactly as before", !s3.pv2 && s3.zoom === "0.88" && s3.nav === 0 && s3.table === 1, s3);
    await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(500); ck("and stays classic after a reload", !(await state(p)).pv2);
    await p.locator("#pv2-on").tap(); await p.waitForSelector(".mp-row"); await p.waitForTimeout(400); const s4 = await state(p);
    ck("NEW LAYOUT button in the classic header: the phone layout again", s4.pv2 && s4.zoom === "1" && s4.nav === 6, s4);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { console.log("\n[iPhone 13 landscape]"); const ctx = await b.newContext({ ...devices["iPhone 13 landscape"] }); const p = await ctx.newPage();
    await p.goto(MOCK + "?phone=new#market", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.waitForTimeout(500); const s = await state(p);
    ck("the preview also applies with the phone on its side", s.pv2 && s.nav === 6 && s.list > 0, s); await ctx.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
