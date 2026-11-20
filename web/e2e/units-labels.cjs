// Units and labels (19 Nov 2026; the designer's D-01, D-02, D-04, D-11, D-24 and D-30, and B-04's watchlist line):
// a yield on the watchlist moves in bp, the same figures as MARKETS; every phone change pill says its window; MOVERS
// has headed columns; σ is never a capital Σ and the 52-week column is a range in %, under one name everywhere; every
// watchlist row says what it is as of; the phone's EQUITIES figures carry labels. Also: the page still reads a server
// older than these changes (it never shows a yield's change in per cent).
// Run from web/:  node e2e/run.cjs units-labels   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { routes } = require("./harness.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", FAKE = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const pick = (p, label) => p.locator(".pick", { has: p.locator(`.lbl:text-is("${label}")`) });
const sec = (p, startsWith) => p.locator(".mp-sec", { has: p.locator(`h2 > span:first-child:text-matches("^${startsWith}")`) });
const XL = { size: "XL", compact: false, v: 2 };
const AS_DATE = /^\d{1,2} [A-Z][a-z]{2}$/, AS_PRINT = /^(\d\d:\d\d|\d{1,2} [A-Z][a-z]{2} \d\d:\d\d)$/;
const STOCKS = ["7203.T", "NVDA", "6758.T", "7182.T", "AVGO"], INSTRUMENTS = ["^N225", "^SOX", "USDJPY=X", "^TNX", "GC=F"];
const utcDay = () => new Date().toISOString().slice(0, 10);
async function page(b, opts, prefs) {
  const ctx = await b.newContext(opts);
  if (prefs) await ctx.addInitScript((x) => { try { localStorage.setItem("om_prefs", JSON.stringify(x)); } catch {} }, prefs);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs };
}
// every change pill on a phone screen (or in one section): the figure, the window under it, whether either is cut
const pills = (scope) => scope.evaluateAll((els) => els.map((e) => { const f = e.querySelector(":scope > .fig"), w = e.querySelector(":scope > .w"); return { fig: f?.textContent ?? null, w: w?.textContent ?? null, cut: [f, w].some((x) => x && x.scrollWidth > x.clientWidth + 1), px: w ? parseFloat(getComputedStyle(w).fontSize) : 0 }; }));
// the cells of MARKETS' UST 10Y row and of the watchlist's ^TNX row, read in one page (both come from the same table)
async function tnxBoth(p) {
  await p.evaluate(() => { location.hash = "market"; }); await p.waitForSelector("table.mkt tbody tr:not(.cls)");
  const m = await p.evaluate(() => { const tr = [...document.querySelectorAll("table.mkt tbody tr:not(.cls)")].find((r) => r.children[0].textContent.startsWith("UST 10Y")); const c = [...tr.children].map((x) => x.textContent); return { last: c[1], d1: c[2], w1: c[3], m1: c[4], m3: c[5], m12: c[6], vs200: c[10] }; });
  await p.evaluate(() => { location.hash = "watch"; }); await p.waitForSelector('.panel[data-k="wl"] tbody tr');
  const w = await p.evaluate(() => { const heads = [...document.querySelectorAll('.panel[data-k="wl"] thead th')].map((x) => x.textContent); const tr = [...document.querySelectorAll('.panel[data-k="wl"] tbody tr')].find((r) => r.querySelector("td.nm .mut").textContent === "^TNX"); const c = [...tr.children].map((x) => x.textContent), at = (h) => c[heads.indexOf(h)]; return { last: at("Last"), d1: at("1D"), w1: at("1W"), m1: at("1M"), m3: at("3M"), m12: at("12M"), vs200: at("vs 200D"), vs50: at("vs 50D") }; });
  return { m, w };
}

(async () => { const b = await chromium.launch();
  console.log("\n[MARKETS, computer 1440x900: σ and the 52-week range]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } });
    await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForSelector("table.mkt tbody tr:not(.cls)");
    const h = await p.evaluate(() => { const ths = [...document.querySelectorAll("table.mkt thead th")], sig = ths.find((t) => t.querySelector(".sig")); const lbl = [...document.querySelectorAll(".pick .lbl")].find((l) => l.querySelector(".sig"));
      return { heads: ths.map((t) => t.innerText.replace(/\s+/g, " ")), sigCase: sig ? getComputedStyle(sig.querySelector(".sig")).textTransform : null, thCase: sig ? getComputedStyle(sig).textTransform : null, pick: lbl?.innerText.replace(/\s+/g, " ") ?? null, titles: ths.map((t) => t.title).join(" | "), cells: [...document.querySelectorAll("table.mkt tbody tr:not(.cls)")].map((tr) => tr.children[ths.findIndex((t) => /52W/.test(t.innerText))].textContent) }; });
    ck(`the σ column reads "σ VS 1M AVG" with a lower-case σ (computed text-transform ${h.sigCase} inside a ${h.thCase} header), and the drop-down "${h.pick}"`, h.heads.includes("σ VS 1M AVG") && !h.heads.some((x) => /Σ/.test(x)) && h.sigCase === "none" && h.thCase === "uppercase" && h.pick === "σ WINDOW", h.heads);
    ck(`the 52-week column is "52W RANGE" and every one of its ${h.cells.length} cells ends in "%"`, h.heads.includes("52W RANGE") && h.cells.length >= 10 && h.cells.every((c) => /^\d{1,3}%$/.test(c) || c === "–"), h.cells);
    ck("the headers' tooltips say bp for yields, nowhere percentage points", /bp for yields/.test(h.titles) && !/percentage point/i.test(h.titles), h.titles);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[WATCHLIST, computer 1440x900: a yield in bp, the same figures as MARKETS; every row's as-of]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } });
    await p.goto(MOCK + "#watch", { waitUntil: "networkidle" }); await p.waitForSelector('.panel[data-k="wl"] tbody tr');
    let day = utcDay(), r = await tnxBoth(p); if (utcDay() !== day) r = await tnxBoth(p);   // the mock's history is drawn per UTC day: read both again if the day turned in between
    const keys = ["d1", "w1", "m1", "m3", "m12", "vs200"];
    ck(`^TNX's 1D to 12M and vs 200D end in "bp" and equal MARKETS' UST 10Y row (${keys.map((k) => r.w[k]).join(" ")})`, keys.every((k) => /bp$/.test(r.w[k]) && r.w[k] === r.m[k]) && r.w.vs50 === "–", r);
    ck(`its LAST is a yield level in % (${r.w.last}), the same as MARKETS' (${r.m.last}): one precision, the unit on both`, r.w.last === r.m.last && /^\d\.\d{3}%$/.test(r.w.last), r);
    const w = await p.evaluate(() => { const pn = document.querySelector('.panel[data-k="wl"]'), body = pn.querySelector(".pbody"), br = body.getBoundingClientRect(), heads = [...pn.querySelectorAll("thead th")].map((x) => x.innerText);
      const rows = [...pn.querySelectorAll("tbody tr")].map((tr) => { const c = tr.querySelector("td.asof"), cr = c.getBoundingClientRect(); return { sym: tr.querySelector("td.nm .mut").textContent, asof: c.textContent, tip: c.title, whole: c.scrollWidth <= c.clientWidth && cr.left >= br.left - 1 && cr.right <= br.right + 1, r52: tr.children[heads.indexOf("52W RANGE")].textContent }; });
      return { heads, rows, aux: pn.querySelector(".aux").textContent, over: body.scrollWidth - body.clientWidth, span: getComputedStyle(pn).gridColumnEnd }; });
    ck(`the AS OF column follows LAST (${w.heads.slice(3, 6).join(" · ")}); the 52-week column is "52W RANGE" in %, as on MARKETS and in the screener`, w.heads[3] === "LAST" && w.heads[4] === "AS OF" && w.heads.includes("52W RANGE") && !w.heads.includes("52W") && w.rows.every((x) => /^\d{1,3}%$|^–$/.test(x.r52)), w.heads);
    const bad = w.rows.filter((x) => !(STOCKS.includes(x.sym) ? AS_DATE.test(x.asof) && /close of/.test(x.tip) : INSTRUMENTS.includes(x.sym) ? AS_PRINT.test(x.asof) && /last print/.test(x.tip) : false) || !/^Yahoo Finance · /.test(x.tip) || !x.whole);
    ck(`every one of the ${w.rows.length} rows shows its as-of whole: a stock its close's date ("${w.rows[0].asof}"), a market instrument its last print ("${w.rows.find((x) => x.sym === "^TNX")?.asof}"), each with its source`, w.rows.length === 10 && bad.length === 0, bad);
    ck(`the panel names the source and the time zone ("${w.aux}"); MY NAMES spans the page and its table fits (${w.over}px over)`, /Yahoo Finance/.test(w.aux) && /times in SGT/.test(w.aux) && w.over <= 0, w);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[WATCHLIST, computer 1440x900 at text size XL: the as-of stays whole; ^TNX in bp]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, XL);
    await p.goto(MOCK + "#watch", { waitUntil: "networkidle" }); await p.waitForSelector('.panel[data-k="wl"] tbody tr');
    const x = await p.evaluate(() => { const body = document.querySelector('.panel[data-k="wl"] .pbody'), br = body.getBoundingClientRect(); return [...body.querySelectorAll("td.asof")].map((c) => { const r = c.getBoundingClientRect(); return { t: c.textContent, whole: c.scrollWidth <= c.clientWidth && r.left >= br.left - 1 && r.right <= br.right + 1 }; }); });
    ck(`all ${x.length} as-of cells whole and in view`, x.length === 10 && x.every((c) => c.whole && (AS_DATE.test(c.t) || AS_PRINT.test(c.t))), x);
    const t = await p.evaluate(() => { const heads = [...document.querySelectorAll('.panel[data-k="wl"] thead th')].map((h) => h.textContent), tr = [...document.querySelectorAll('.panel[data-k="wl"] tbody tr')].find((r) => r.querySelector("td.nm .mut").textContent === "^TNX"), c = [...tr.children].map((x) => x.textContent); return { last: c[heads.indexOf("Last")], cells: ["1D", "1W", "1M", "3M", "12M", "vs 200D"].map((h) => c[heads.indexOf(h)]) }; });
    ck(`^TNX's changes end in "bp" (${t.cells.join(" ")}) and its LAST in "%" (${t.last})`, t.cells.every((c) => /bp$/.test(c)) && /%$/.test(t.last), t);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[EQUITIES, computer: MOVERS headed; the screener's 52-week column]");
  for (const [name, prefs] of [["1440x900", null], ["1440x900 XL", XL]]) {
    const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, prefs);
    await p.goto(MOCK + "#equities", { waitUntil: "networkidle" }); await p.waitForSelector("table.eqmv tbody tr");
    const m = await p.evaluate(() => { const pn = [...document.querySelectorAll(".panel")].find((x) => x.querySelector(".t")?.textContent === "MOVERS");
      return { titles: [...pn.querySelectorAll(".minih")].map((x) => x.innerText), lists: [...pn.querySelectorAll("table.eqmv")].map((t) => ({ heads: [...t.querySelectorAll("thead th")].filter((th) => th.getBoundingClientRect().width > 0).map((th) => th.innerText), rows: t.querySelectorAll("tbody tr").length, cut: [...t.querySelectorAll("td.num")].filter((c) => c.scrollWidth > c.clientWidth + 1).length, cssW: Math.round(t.closest(".mvwrap").getBoundingClientRect().width / (parseFloat(getComputedStyle(document.body).zoom) || 1)) })),
        screener: [...document.querySelectorAll(".panel")].find((x) => x.querySelector(".t")?.textContent === "SCREENER").querySelector("thead").innerText }; });
    if (!prefs) ck(`MOVERS: ${m.lists.length} lists "${m.titles.join('", "')}", each with five headers, the fifth 1W (${m.lists[0].heads.join(" · ")})`, m.titles.join() === "TOP 15 BY 1D,BOTTOM 15 BY 1D" && m.lists.length === 2 && m.lists.every((l) => l.heads.join() === "NAME,SECTOR,LAST,1D,1W" && l.rows === 15 && l.cut === 0), m);
    else ck(`MOVERS at XL: a list ${m.lists[0].cssW} CSS px wide drops its SECTOR column first (${m.lists[0].heads.join(" · ")}); no figure cut`, m.lists.every((l) => l.heads.join() === "NAME,LAST,1D,1W" && l.cut === 0), m);
    if (!prefs) ck("the screener's 52-week column is \"52W RANGE\"", /\b52W RANGE\b/.test(m.screener) && !/52W POS/.test(m.screener), m.screener);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  for (const dev of ["iPhone SE (3rd gen)", "iPhone 13"]) {
    console.log(`\n[phone, ${dev}: every change pill says its window; one name for σ and the 52-week range]`);
    const { ctx, p, errs } = await page(b, { ...devices[dev] });
    await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.evaluate(() => document.querySelector("#mockbar")?.style.setProperty("display", "none"));
    let ps = await pills(p.locator(".mp-chg"));
    ck(`MARKETS: all ${ps.length} pills say "1D" under the figure, at ${Math.min(...ps.map((x) => x.px))}px or more, nothing cut`, ps.length >= 15 && ps.every((x) => x.w === "1D" && !x.cut && x.px >= 11), ps.filter((x) => x.w !== "1D" || x.cut).slice(0, 3));
    await p.locator(".mp-head .pick select").selectOption("1W"); await p.waitForTimeout(300); ps = await pills(p.locator(".mp-chg"));
    const ust = await p.locator(".mp-row", { hasText: "UST 10Y" }).first().locator(".mp-chg .fig").textContent();
    ck(`Period -> 1W: every pill now says "1W"; UST 10Y's in bp (${ust})`, ps.every((x) => x.w === "1W") && /bp$/.test(ust), ps.filter((x) => x.w !== "1W").slice(0, 3));
    await p.locator(".mp-row", { hasText: "UST 10Y" }).first().tap(); await p.waitForSelector(".mp-item.open .mp-grid");
    const tiles = await p.evaluate(() => [...document.querySelectorAll(".mp-item.open .mp-grid")].pop().innerText.split("\n").filter(Boolean));
    ck(`the opened line's statistics: ${tiles.join(" · ")}`, tiles[0] === "σ vs 1M avg" && /^[+-]?\d+\.\dσ$|^–$/.test(tiles[1]) && tiles[2] === "52W range" && /^\d{1,3}%$/.test(tiles[3]) && /bp$/.test(tiles[5]), tiles);
    await p.evaluate(() => { location.hash = "rates"; }); await p.waitForSelector(".mp-sec .mp-row"); await p.waitForTimeout(300);
    await p.locator(".mp-head .pick select").selectOption("3M"); await p.waitForTimeout(300); ps = await pills(p.locator(".mp-chg"));
    ck(`RATES & FX: Period -> 3M, all ${ps.length} pills say "3M"`, ps.length >= 6 && ps.every((x) => x.w === "3M" && !x.cut), ps.filter((x) => x.w !== "3M").slice(0, 3));

    await p.evaluate(() => { location.hash = "equities"; }); await p.waitForSelector(".mp-row.starred"); await p.waitForTimeout(500);
    const eq = async () => ({ index: await pills(sec(p, "NIKKEI 225").locator(".mp-chg")), drivers: await pills(sec(p, "Drivers").locator(".mp-chg")), sectors: await pills(sec(p, "Sector performance").locator(".mp-chg")), movers: await pills(sec(p, "Movers").locator(".mp-chg")), screener: await pills(sec(p, "Screener").locator(".mp-chg")) });
    let e = await eq(); const all = Object.values(e).flat();
    ck(`EQUITIES: ${all.length} pills, every one with its window: the index, its drivers and the sectors 12M (the Period), the movers 1D, the screener's 1D`, e.index.length === 1 && e.drivers.length === 4 && [...e.index, ...e.drivers, ...e.sectors].every((x) => x.w === "12M") && e.movers.length === 20 && e.movers.every((x) => x.w === "1D") && e.screener.length === 30 && e.screener.every((x) => x.w === "1D") && all.every((x) => !x.cut && x.px >= 11), Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [...new Set(v.map((x) => x.w))]])));
    await pick(p, "Period").locator("select").selectOption("1M"); await p.waitForTimeout(500); e = await eq();
    ck("Period -> 1M: the index, its drivers and the sectors now say 1M; the movers still 1D", [...e.index, ...e.drivers, ...e.sectors].every((x) => x.w === "1M") && e.movers.every((x) => x.w === "1D"), Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [...new Set(v.map((x) => x.w))]])));
    const sc = sec(p, "Screener"), sort = sc.locator(".pick", { has: p.locator('.lbl:text-is("Sort by")') }).locator("select");
    const opts = await sort.locator("option").allTextContents();
    await sort.selectOption("pos52"); await p.waitForTimeout(300); const r52 = await pills(sc.locator(".mp-chg"));
    await sort.selectOption("mcap"); await p.waitForTimeout(300); const rmc = await pills(sc.locator(".mp-chg"));
    await sort.selectOption("mf_net"); await p.waitForTimeout(300); const rmf = await pills(sc.locator(".mp-chg"));
    ck(`the screener sorted by something other than a change names it under the figure: "${r52[0].w}" (${r52[0].fig}), "${rmc[0].w}" (${rmc[0].fig}), "${rmf[0].w}"; its sort option reads "52W range"`, opts.includes("52W range") && !opts.some((o) => /52w position/i.test(o)) && r52.every((x) => x.w === "52W RANGE" && /^\d{1,3}%$|^–$/.test(x.fig) && !x.cut) && rmc.every((x) => x.w === "MKT CAP" && !x.cut) && rmf.every((x) => x.w === "NET FLOW" && !x.cut), { opts, r52: r52.slice(0, 2), rmc: rmc.slice(0, 2) });
    const fl = await sec(p, "Flow by sector").locator(".fl-row:not(.tot) .b").evaluateAll((es) => es.map((b) => [...b.querySelectorAll("small")].map((s) => s.textContent + ":" + parseFloat(getComputedStyle(s).fontSize)).join(",")));
    ck(`flow by sector: every figure labelled ("${fl[0]}")`, fl.length >= 5 && fl.every((x) => x === "net flow:11,1D:11"), fl.slice(0, 3));
    const sh = await sec(p, "Short interest").evaluate((s) => ({ heads: [...s.querySelectorAll("table.secT thead")].map((t) => [...t.querySelectorAll("th")].filter((th) => th.getBoundingClientRect().width > 0).map((th) => th.textContent).join(" · ")), px: Math.min(...[...s.querySelectorAll("table.secT th")].filter((th) => th.getBoundingClientRect().width > 0).map((th) => parseFloat(getComputedStyle(th).fontSize))), dates: [...s.querySelectorAll(".nb")].map((n) => ({ t: n.textContent, lines: n.getClientRects().length })) }));
    ck(`short interest: headed tables (${sh.heads.join(" | ")}, at ${sh.px}px), and each of its ${sh.dates.length} dates on one line`, sh.heads.join(" | ") === "Name · Holders · % of shares | Sector · Turnover · Short %" && sh.px >= 11 && sh.dates.length >= 3 && sh.dates.every((d) => /^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(d.t) && d.lines === 1), sh);

    await p.evaluate(() => { location.hash = "market"; }); await p.waitForSelector(".mp-row"); await p.locator(".mp-head .pick select").selectOption("12M"); await p.waitForTimeout(300);
    const mk12 = await p.locator(".mp-row", { hasText: "UST 10Y" }).first().locator(".mp-chg .fig").textContent();
    await p.locator(".mp-head .pick select").selectOption("1D"); await p.waitForTimeout(300);
    const mk1 = await p.locator(".mp-row", { hasText: "UST 10Y" }).first().locator(".mp-chg .fig").textContent();
    await p.evaluate(() => { location.hash = "watch"; }); await p.waitForSelector(".mp-row.starred"); await p.waitForTimeout(300);
    const lines = await p.evaluate(() => [...document.querySelectorAll(".mp-row.starred")].map((r) => ({ st: r.querySelector(".mp-st").textContent, px: r.querySelector(".mp-px").textContent, fig: r.querySelector(".mp-chg .fig").textContent, w: r.querySelector(".mp-chg .w").textContent, cut: r.querySelector(".mp-st").scrollWidth > r.querySelector(".mp-st").clientWidth + 1 })));
    const tnx = lines.find((x) => x.st.startsWith("^TNX · ")), badLine = lines.filter((x) => { const [sym, ...rest] = x.st.split(" · "), as = rest.join(" · "); return STOCKS.includes(sym) ? !/^close \d{1,2} [A-Z][a-z]{2}$/.test(as) : !AS_PRINT.test(as); });
    ck(`WATCHLIST: every line says what it is as of ("${lines[0].st}", "${tnx?.st}"), whole`, lines.length === 10 && badLine.length === 0 && lines.every((x) => !x.cut), badLine);
    ck(`its pills say "1D"; ^TNX's level ends in % (${tnx?.px}) and its change is MARKETS' own in bp (${tnx?.fig})`, lines.every((x) => x.w === "1D") && /%$/.test(tnx?.px ?? "") && tnx?.fig === mk1, { tnx, mk1 });
    await pick(p, "Period").locator("select").selectOption("pct12m"); await p.waitForTimeout(300);
    const l12 = await p.evaluate(() => [...document.querySelectorAll(".mp-row.starred")].map((r) => ({ st: r.querySelector(".mp-st").textContent, fig: r.querySelector(".mp-chg .fig").textContent, w: r.querySelector(".mp-chg .w").textContent })));
    ck(`Period -> 12M: every pill says "12M"; ^TNX ${l12.find((x) => x.st.startsWith("^TNX"))?.fig}, as MARKETS' 12M`, l12.every((x) => x.w === "12M") && l12.find((x) => x.st.startsWith("^TNX"))?.fig === mk12, { l12: l12.slice(8), mk12 });
    ck(`the sources under the list ("${await p.locator("#wl-src").textContent()}")`, /^Source: Yahoo Finance\./.test(await p.locator("#wl-src").textContent()));
    if (dev === "iPhone 13") {   // no pill anywhere without its window: every tab and both kinds of stock page
      const seen = [];
      for (const h of ["market", "news", "research", "equities", "rates", "watch", "asset/7203.T", "asset/NVDA"]) {
        await p.evaluate((h) => { location.hash = h; }, h); await p.waitForTimeout(900);
        const ps2 = await pills(p.locator(".mp-chg")); seen.push({ h, n: ps2.length, bare: ps2.filter((x) => !x.w).length });
      }
      ck(`on every tab and stock page, every pill carries its window (${seen.map((s) => `${s.h} ${s.n}`).join(", ")})`, seen.every((s) => s.bare === 0) && seen.filter((s) => s.n > 0).length >= 4, seen);
    }
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }

  console.log("\n[an older server's answer (before 19 Nov 2026): a yield shows dashes, never a per cent; the as-of is read from its form]");
  const OLD = [
    { symbol: "7203.T", name: "Toyota Motor Corp", kind: "Stock", sector: "Transportation", ccy: "JPY", last: 3120.5, asOf: "2026-11-18", pct1d: 1.84, pct1w: 3.1, pct1m: -4.2, pct3m: 7.5, pct12m: 17.7, vs50: 2.2, vs200: 5.5, pos52: 68.4, mcap: 4e12, earningsAt: null, earningsEst: null, isYield: false },
    { symbol: "^N225", name: "Nikkei 225", kind: "Equities", sector: null, ccy: "JPY", last: 57434.77, asOf: "2026-11-18T00:00:00Z", pct1d: -1.1, pct1w: -1.9, pct1m: 2.5, pct3m: -4.5, pct12m: -10.6, vs50: null, vs200: -3.3, pos52: 39, mcap: null, earningsAt: null, earningsEst: null, isYield: false },
    { symbol: "^TNX", name: "UST 10Y yield", kind: "Fixed income", sector: null, ccy: "USD", last: 4.859, asOf: new Date(Date.now() - 60e3).toISOString(), pct1d: 0.4, pct1w: 0.68, pct1m: -0.92, pct3m: 1.64, pct12m: 3.84, vs50: null, vs200: null, pos52: 54, mcap: null, earningsAt: null, earningsEst: null, isYield: true },
  ];
  const oldRoutes = async (p) => { await routes(p); await p.route("**/fakeapi?*", (r) => { const a = new URL(r.request().url()).searchParams.get("action"); const ok = (body) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (a === "watch_syms") return ok({ symbols: OLD.map((x) => x.symbol) }); if (a === "watch_list") return ok({ rows: OLD }); if (a === "watch_feed") return ok({ alerts: [], news: [], research: [] }); return r.fallback(); }); };
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }); await oldRoutes(p);
    await p.goto(FAKE + "#watch", { waitUntil: "networkidle" }); await p.waitForSelector('.panel[data-k="wl"] tbody tr'); await p.waitForTimeout(300);
    const o = await p.evaluate(() => { const heads = [...document.querySelectorAll('.panel[data-k="wl"] thead th')].map((x) => x.textContent); return Object.fromEntries([...document.querySelectorAll('.panel[data-k="wl"] tbody tr')].map((tr) => { const c = [...tr.children].map((x) => x.textContent), at = (h) => c[heads.indexOf(h)]; return [tr.querySelector("td.nm .mut").textContent, { asof: at("As of"), cells: ["1D", "1W", "1M", "3M", "12M", "vs 200D"].map(at), last: at("Last") }]; })); });
    ck(`computer: ^TNX's changes are dashes, none a per cent (${o["^TNX"].cells.join(" ")}); its level ${o["^TNX"].last}`, o["^TNX"].cells.every((c) => c === "–") && o["^TNX"].last === "4.859%", o["^TNX"]);
    ck(`a stock's date and a close stamped at midnight UTC read as closes ("${o["7203.T"].asof}", "${o["^N225"].asof}"); a print by its time ("${o["^TNX"].asof}"); prices keep their per cent`, o["7203.T"].asof === "18 Nov" && o["^N225"].asof === "18 Nov" && AS_PRINT.test(o["^TNX"].asof) && o["7203.T"].cells[0] === "+1.8%", o);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, { ...devices["iPhone 13"] }); await oldRoutes(p);
    await p.goto(FAKE + "?phone=new#watch", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row.starred"); await p.waitForTimeout(300);
    const o = await p.evaluate(() => [...document.querySelectorAll(".mp-row.starred")].map((r) => ({ st: r.querySelector(".mp-st").textContent, fig: r.querySelector(".mp-chg .fig").textContent, w: r.querySelector(".mp-chg .w").textContent })));
    ck(`phone: ^TNX's pill is a dash with its window, the Nikkei 225's line reads its close (${o.map((x) => `${x.st}: ${x.fig} ${x.w}`).join("; ")})`, o.length === 3 && o[2].fig === "–" && o[2].w === "1D" && o[1].st === "^N225 · close 18 Nov" && o[0].st === "7203.T · close 18 Nov", o);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[the legend]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } });
    await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.locator("#help-ctl").click(); await p.waitForSelector(".helpbox");
    const t = await p.locator(".helpbox").innerText();
    ck("it names σ vs 1M avg and the 52W range, says bp for yields, and never percentage points or a capital Σ", /σ vs 1M avg/.test(t) && /52W range/.test(t) && /0% is the low, 100% the high/.test(t) && /bp for yields/.test(t) && /window \(1D, 1W/.test(t) && !/percentage point/i.test(t) && !/Σ/.test(t), t.slice(0, 400));
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
