// The phone layout: RATES & CURRENCY, WATCHLIST and the stock page.
// Run from web/:  node e2e/run.cjs phone-rates-watchlist-stock   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { routes } = require("./harness.cjs"); const { watchRoutes, state } = require("./watchdata.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", FAKE = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const pick = (p, label) => p.locator(".pick", { has: p.locator(`.lbl:text-is("${label}")`) });
const sec = (p, startsWith) => p.locator(".mp-sec", { has: p.locator(`h2 > span:first-child:text-matches("^${startsWith}")`) });
const secs = (p) => p.evaluate(() => [...document.querySelectorAll(".mp-sec > h2 > span:first-child")].map((e) => e.textContent));
// smallest text, smallest tap target and sideways overflow of the phone screen
const measure = async (p, taps) => { await p.evaluate(() => { document.querySelector("#mockbar")?.style.setProperty("display", "none"); window.__tapH = (el) => { el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(), x = r.left + r.width / 2; let n = 0; for (let y = Math.floor(r.top) - 8; y <= Math.ceil(r.bottom) + 8; y++) { const hit = document.elementFromPoint(x, y); if (hit && (hit === el || el.contains(hit))) n++; } return n; }; }); return p.evaluate((sel) => { const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const fs = []; const small = [];
  const w = document.createTreeWalker(document.querySelector(".mp"), NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const el = n.parentElement; if (!n.textContent.trim() || !vis(el) || el.closest(".uplot, select, canvas")) continue; const f = parseFloat(getComputedStyle(el).fontSize); fs.push(f); if (f < 11) small.push(`${el.className}:${n.textContent.trim().slice(0, 20)}:${f}`); }
  const hs = [...document.querySelectorAll(sel)].filter(vis).map((e) => ({ h: e.matches(".pick, .mp-tog, .chip-sm") ? window.__tapH(e) : e.getBoundingClientRect().height, c: e.className }));
  const low = hs.filter((x) => x.h < 44).map((x) => `${x.c}:${Math.round(x.h)}`);
  return { minFont: Math.min(...fs), minTap: Math.round(Math.min(...hs.map((x) => x.h))), taps: hs.length, seen: [...new Set([...document.querySelectorAll(".mp .pick, .mp-legacy .chips .chip-sm")].filter(vis).map((e) => Math.round(e.getBoundingClientRect().height)))], overflowX: document.documentElement.scrollWidth - innerWidth, small: small.slice(0, 5), low: low.slice(0, 5) }; }, taps); };
(async () => { const b = await chromium.launch();
  for (const dev of ["iPhone 13", "Pixel 7"]) {
    console.log(`\n[RATES & CURRENCY, ${dev}]`);
    { const ctx = await b.newContext({ ...devices[dev] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      await p.goto(MOCK + "?phone=new#rates", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-sec .mp-row"); await p.waitForTimeout(1500);
      const s0 = await secs(p); ck("four sections: Currency, Yields, Yield curve, Policy rates", s0.join() === "Currency,Yields,Yield curve,Policy rates", s0);
      const head = await p.evaluate(() => ({ h1: document.querySelector(".mp-head h1").textContent, lines: Math.round(document.querySelector(".mp-head h1").getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector(".mp-head h1")).lineHeight)), nav: document.querySelector("#pnav a.on span")?.textContent }));
      ck("title on one line, the Rates tab lit in the bottom bar", head.lines === 1 && head.nav === "Rates", head);
      const fx = sec(p, "Currency"), yl = sec(p, "Yields"); const nfx = await fx.locator(".mp-row").count(), nyl = await yl.locator(".mp-row").count();
      const u0 = await p.evaluate(() => ({ fx: [...document.querySelectorAll(".mp-sec")][0].querySelector(".mp-chg").textContent, y: [...document.querySelectorAll(".mp-sec")][1].querySelector(".mp-chg").textContent, lvl: [...document.querySelectorAll(".mp-sec")][1].querySelector(".mp-px").textContent }));
      ck(`${nfx} pairs with a % change, ${nyl} yields with a change in bp and a level in %`, nfx >= 3 && nyl >= 3 && /%$/.test(u0.fx) && /bp$/.test(u0.y) && /%$/.test(u0.lvl), u0);
      await fx.locator(".mp-row").first().tap(); await p.waitForTimeout(1000);
      const det = await p.evaluate(() => { const it = document.querySelector(".mp-item.open"); return { chart: it.querySelectorAll("canvas").length, cells: it.querySelectorAll(".mp-grid > div").length, cur: it.querySelector(".mp-grid .cur .k")?.textContent, more: it.querySelector(".mp-more")?.textContent }; });
      ck("tap a pair: its chart, six periods, three statistics and the way to its page", det.chart >= 1 && det.cells === 9 && det.cur === "1D" && /page/.test(det.more ?? ""), det);
      await pick(p, "Change").locator("select").selectOption("3M"); await p.waitForTimeout(900);
      const c3 = await p.evaluate(() => ({ cur: document.querySelector(".mp-item.open .mp-grid .cur .k")?.textContent, th: [...document.querySelectorAll(".mp-sec table.mp-t th")].map((t) => t.textContent), stat: [...document.querySelectorAll(".mp-sec .mp-grid.in .k")].map((k) => k.textContent) }));
      ck("Change -> 3M: the lines, the open chart and the curve comparison follow", c3.cur === "3M" && c3.th.join() === "Tenor,Today,3M ago,Change" && c3.stat.includes("2s10s vs 3M ago"), c3);
      await pick(p, "Change").locator("select").selectOption("1D"); await p.waitForTimeout(700);
      const c1 = await p.evaluate(() => [...document.querySelectorAll(".mp-sec table.mp-t th")].map((t) => t.textContent)); ck("Change -> 1D: the curve is compared with one month ago (as on the desktop)", c1[2] === "1M ago", c1);
      const cv = sec(p, "Yield curve"); const opts = await cv.locator(".pick select option").allTextContents();
      ck(`Curve list: ${opts.length} curves, US Treasury first, US T-bills last`, opts.length >= 3 && opts[0] === "US Treasury" && opts[opts.length - 1] === "US T-bills", opts);
      const before = await cv.locator("table.mp-t tbody tr").count(), spreads = await cv.locator(".mp-grid.in > div").count();
      const fit = await p.evaluate(() => { const s = [...document.querySelectorAll(".mp-sec")].find((x) => x.querySelector("h2 span").textContent === "Yield curve"); const c = s.querySelector(".mp-card").getBoundingClientRect(), t = s.querySelector("table.mp-t").getBoundingClientRect(), u = s.querySelector(".uplot").getBoundingClientRect(); return { card: Math.round(c.width), table: Math.round(t.width), chart: Math.round(u.width), chartH: Math.round(u.height) }; });
      ck(`curve card: chart ${fit.chart}×${fit.chartH}px, ${spreads} spread figures, ${before} tenors; all inside the card (${fit.card}px)`, before >= 6 && spreads === 3 && fit.table <= fit.card && fit.chart <= fit.card && fit.chartH >= 180, fit);
      await cv.locator(".pick select").selectOption("JP"); await p.waitForTimeout(900);
      ck("Curve -> JGB: the card is redrawn for Japan", (await cv.locator(".pick .val").textContent()) === "JGB" && (await cv.locator("canvas").count()) >= 1 && (await cv.locator("table.mp-t tbody tr").count()) >= 5);
      await cv.locator(".pick select").selectOption("USB"); await p.waitForTimeout(900);
      const bills = await p.evaluate(() => { const s = [...document.querySelectorAll(".mp-sec")].find((x) => x.querySelector("h2 span").textContent === "Yield curve"); return { rows: [...s.querySelectorAll("table.mp-t tbody td:first-child")].map((t) => t.textContent), spreads: s.querySelectorAll(".mp-grid.in > div").length }; });
      ck("Curve -> US T-bills: bill tenors only, no 2s10s", bills.rows.length >= 2 && bills.rows.every((t) => /M|W|1Y/.test(t)) && bills.spreads === 0, bills);
      const pol = sec(p, "Policy rates"); const chips = await pol.locator(".chips .chip-sm").count(), banks = await pol.locator(".pl-row").count();
      const fed = await pol.locator(".pl-row").first().evaluate((e) => ({ tag: e.tagName, v: e.querySelector(".v").textContent, n: e.querySelector(".n").textContent, lines: [...e.querySelectorAll(".s")].map((s) => s.textContent), wraps: [...e.querySelectorAll(".s:not(.src)")].map((s) => Math.round(s.getBoundingClientRect().height / parseFloat(getComputedStyle(s).lineHeight))) }));
      ck(`policy rates: chart with ${chips} banks to switch, ${banks} banks listed; the Fed as a range that links to its source`, chips >= 3 && banks >= 3 && fed.tag === "A" && /^\d\.\d\d–\d\.\d\d%$/.test(fed.v) && /^FED/.test(fed.n) && fed.lines.some((l) => /^Source: www\.federalreserve\.gov/.test(l)) && fed.wraps.every((w) => w === 1), fed);
      await pol.locator(".chips .chip-sm").first().tap(); await p.waitForTimeout(500);
      ck("tap a bank chip: its line is hidden (chip no longer lit)", (await pol.locator(".chips .chip-sm.on").count()) === chips - 1);
      await p.evaluate(() => scrollTo(0, 0)); await pick(p, "Go to").locator("select").selectOption("Policy rates"); await p.waitForTimeout(500);
      const j = await p.evaluate(() => { const h = [...document.querySelectorAll(".mp-sec > h2")].find((e) => e.textContent.startsWith("Policy")).getBoundingClientRect().top, hd = document.querySelector(".mp-head").getBoundingClientRect().bottom; return { gap: Math.round(h - hd), y: Math.round(scrollY) }; });
      ck("Go to -> Policy rates: that section sits just under the pinned title", j.y > 600 && j.gap >= 0 && j.gap <= 40, j);
      const m = await measure(p, ".mp-row:not(.fixed):not(.plain), .mp-more, .mp .pick, a.pl-row, .mp-legacy .chip-sm");
      ck(`text ≥ 11px (smallest ${m.minFont}px, chart axes aside), ${m.taps} tap targets ≥ 44px (smallest ${m.minTap}px; drop-downs and bank switches ${m.seen.join("/")}px to the eye), nothing overflows sideways`, m.minFont >= 11 && m.minTap >= 44 && m.seen.join() === "36" && m.overflowX <= 0, m);
      { const chip = pol.locator(".chips .chip-sm").nth(1); await chip.scrollIntoViewIfNeeded(); const bx = await chip.boundingBox(); const n0 = await pol.locator(".chips .chip-sm.on").count(); await p.touchscreen.tap(bx.x + bx.width / 2, bx.y - 3); await p.waitForTimeout(400); const n1 = await pol.locator(".chips .chip-sm.on").count();
        ck("a tap 3px above a bank switch still switches it (the 44px tap area)", n1 === n0 - 1, { n0, n1 }); }
      await p.evaluate(() => scrollTo(0, 0)); await fx.locator(".mp-item.open .mp-more").tap(); await p.waitForTimeout(600); ck("\"Open …'s page\": the stock page opens", p.url().includes("#asset/"), p.url());
      ck("no page errors", errs.length === 0, errs); await ctx.close(); }

    console.log(`\n[STOCK PAGE, ${dev}] (the page itself is checked in e2e/stock-page.cjs)`);
    { const ctx = await b.newContext({ ...devices[dev] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      await p.goto(MOCK + "#asset/7203.T", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-hero canvas"); await p.waitForTimeout(900);
      const top = await p.evaluate(() => ({ h1: document.querySelector(".mp-doc.asset h1").textContent, meta: [...document.querySelectorAll(".mp-doc.asset .meta span")].map((s) => s.textContent), secs: [...document.querySelectorAll(".mp-sec > h2 > span:first-child")].map((e) => e.textContent), star: !!document.querySelector(".mp-head .star"), panels: document.querySelectorAll("#grid .panel").length, ox: document.documentElement.scrollWidth - innerWidth }));
      ck("a stock opens as the phone page, not the desktop panels: name, symbol · exchange · sector · currency, and its five sections", top.panels === 0 && top.h1 === "Mock Motor Corp" && top.meta.join("|") === "7203.T|Tokyo|Consumer Discretionary|JPY" && top.secs.join() === "Key data,Performance,Big moves,Short interest,Financials" && top.star && top.ox <= 0, top);
      await p.locator(".mp-back").tap(); await p.waitForTimeout(500);
      ck("Back leaves the stock page; no page errors", !p.url().includes("#asset/") && errs.length === 0, { url: p.url(), errs }); await ctx.close(); }
    console.log(`\n[WATCHLIST, ${dev}]`);
    { const ctx = await b.newContext({ ...devices[dev] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      state.syms = ["7203.T", "NVDA", "6758.T", "^N225", "USDJPY=X", "^TNX"]; await routes(p); await watchRoutes(p);
      await p.goto(FAKE + "?phone=new#watch", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row.starred"); await p.waitForTimeout(1000);
      const s0 = await secs(p); ck("five sections: My names, Earnings ahead, Alerts, Headlines, In research", s0.join("|") === "My names|Earnings ahead|Alerts on my names|Headlines on my names|In research", s0);
      const my = sec(p, "My names"); const rows = await my.locator(".mp-row").count();
      const r0 = await my.locator(".mp-row").first().evaluate((e) => ({ n: e.querySelector(".n").textContent, st: e.querySelector(".mp-st").textContent, px: e.querySelector(".mp-px").textContent, chg: e.querySelector(".mp-chg").textContent, star: e.querySelector(".star").className, h: Math.round(e.getBoundingClientRect().height) }));
      ck(`my names: ${rows} lines, each with a lit star, the name, symbol · sector, the last level and the 1D change`, rows === 6 && (await p.locator(".mp-asof").textContent()) === "6 names" && r0.n === "Toyota Motor Corp" && r0.st === "7203.T · Transportation" && r0.px === "3,121" && r0.chg === "+1.8%" && /on/.test(r0.star), r0);
      await pick(p, "Change").locator("select").selectOption("pct12m"); await p.waitForTimeout(300);
      ck("Change -> 12M: every line shows the 12-month change", (await my.locator(".mp-row .mp-chg").first().textContent()) === "+17.7%", await my.locator(".mp-row .mp-chg").first().textContent());
      const ea = await p.evaluate(() => { const s = [...document.querySelectorAll(".mp-sec")].find((x) => x.querySelector("h2 span").textContent === "Earnings ahead"); return { days: [...s.querySelectorAll(".ev-day")].map((d) => d.textContent), rows: [...s.querySelectorAll(".ev-row")].map((r) => [r.querySelector(".ev-t").textContent, r.querySelector(".ev-n").textContent, r.querySelector(".ev-a").textContent].join("|")) }; });
      ck("earnings ahead: two dates under their day, earliest first, confirmed and estimated marked", ea.rows.length === 2 && ea.days.length >= 1 && /^\d\d:\d\d\|Toyota Motor Corp\|confirmed$/.test(ea.rows[0]) && /\|NVIDIA Corporation\|est\.$/.test(ea.rows[1]), ea);
      const al = sec(p, "Alerts"); const a0 = await al.locator(".nw-row").evaluateAll((es) => es.map((e) => ({ tag: e.tagName, pct: e.querySelector(".nw-meta b")?.textContent ?? null, col: e.querySelector(".nw-meta b") ? getComputedStyle(e.querySelector(".nw-meta b")).color : null })));
      ck("alerts: the move in red beside the time; an alert with a source is a link", a0.length === 2 && a0[0].tag === "DIV" && a0[0].pct === "-7.4%" && a0[0].col === "rgb(255, 77, 66)" && a0[1].tag === "A", a0);
      const hl = sec(p, "Headlines"); const h0 = await hl.locator(".nw-row").evaluateAll((es) => ({ n: es.length, t: es[0].querySelector(".nw-title").textContent, tk: es.map((e) => [...e.querySelectorAll(".nw-tk button")].map((b) => b.textContent).join("+")) }));
      ck("headlines: twelve, entities decoded, only my own companies as buttons (AMD is not on my list)", h0.n === 12 && /tariffs & costs/.test(h0.t) && h0.tk.every((t) => !/AMD/.test(t)) && h0.tk[1] === "NVIDIA", h0);
      const m = await measure(p, ".mp-row.tap, .ev-row.tap, .nw-row, .rs-row, .mp-add .mp-find, .mp-add .mp-act, .mp .pick");
      ck(`text ≥ 11px (smallest ${m.minFont}px), ${m.taps} tap targets ≥ 44px (smallest ${m.minTap}px), nothing overflows sideways`, m.minFont >= 11 && m.minTap >= 44 && m.overflowX <= 0, m);
      await p.evaluate(() => scrollTo(0, 0)); await p.locator(".mp-add .mp-find").fill("zzzz"); await p.locator(".mp-add .mp-act").tap(); await p.waitForTimeout(500);
      ck("add an unknown symbol: the server's refusal is shown, the list is unchanged", /Unknown symbol ZZZZ/.test(await p.locator(".mp-note.warn").textContent().catch(() => "")) && (await my.locator(".mp-row").count()) === 6 && (await p.locator(".mp-add .mp-find").inputValue()) === "zzzz");
      await p.locator(".mp-add .mp-find").fill("aapl"); await p.locator(".mp-add .mp-find").press("Enter"); await p.waitForTimeout(900);
      ck("add \"aapl\" with the keyboard's Enter: sent as AAPL, the line appears, the box clears", p.__sets.at(-1).symbol === "AAPL" && p.__sets.at(-1).on === true && (await my.locator(".mp-row").count()) === 7 && (await p.locator(".mp-add .mp-find").inputValue()) === "" && (await p.locator(".mp-asof").textContent()) === "7 names" && (await p.locator(".mp-note.warn").count()) === 0, p.__sets);
      await my.locator(".mp-row", { hasText: "Apple" }).locator(".star").tap(); await p.waitForTimeout(900);
      ck("tap a star: the name leaves the list and the page stays on WATCHLIST", (await my.locator(".mp-row").count()) === 6 && /#watch/.test(p.url()) && p.__sets.at(-1).on === false, p.url());
      await sec(p, "In research").locator(".rs-row").first().tap(); await p.waitForTimeout(900);
      ck("tap a research piece: RESEARCH opens on it", /#research\/note/.test(decodeURIComponent(p.url())) && (await p.locator(".mp-doc h1").count()) === 1, p.url());
      await p.goBack(); await p.waitForSelector(".mp-row.starred"); await my.locator(".mp-row").first().locator(".n").tap(); await p.waitForTimeout(600);
      ck("tap a name: its page opens", /#asset\/7203\.T/.test(p.url()), p.url());
      ck("no page errors", errs.length === 0, errs); await ctx.close(); }
    { const ctx = await b.newContext({ ...devices[dev] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      await routes(p); await watchRoutes(p, { empty: true }); await p.goto(FAKE + "?phone=new#watch", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-sec"); await p.waitForTimeout(900);
      const e = await p.evaluate(() => ({ sub: document.querySelector(".mp-asof").textContent, empties: [...document.querySelectorAll(".mp-sec .empty b")].map((x) => x.textContent) }));
      ck("an empty watchlist: every section says so and how to add names, nothing breaks", e.sub === "0 names" && e.empties.length === 5 && e.empties[0] === "Your watchlist is empty" && errs.length === 0, { e, errs }); await ctx.close(); }
  }
  // classic layout untouched: a phone without the preview and a desktop still get the desktop views
  console.log("\n[unchanged elsewhere]");
  { const ctx = await b.newContext({ ...devices["iPhone 13"] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "?phone=old#rates", { waitUntil: "networkidle" }); await p.waitForSelector("#grid .panel"); await p.waitForTimeout(600);
    ck("classic phone: RATES & CURRENCY keeps its panels", (await p.locator(".mp").count()) === 0 && (await p.locator('.panel[data-k="policy"]').count()) === 1);
    await p.goto(MOCK + "#asset/7203.T"); await p.waitForTimeout(900); ck("classic phone: the stock page keeps its panels", (await p.locator(".mp").count()) === 0 && (await p.locator("#grid .panel").count()) >= 3 && errs.length === 0, errs); await ctx.close(); }
  { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "?phone=new#rates", { waitUntil: "networkidle" }); await p.waitForSelector("#grid .panel"); await p.waitForTimeout(600);
    ck("desktop with the preview switched on: still the desktop RATES & CURRENCY", (await p.locator(".mp").count()) === 0 && (await p.locator("#pnav").count()) === 0 && (await p.locator('.panel[data-k="fx"]').count()) === 1 && errs.length === 0, errs); await ctx.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
