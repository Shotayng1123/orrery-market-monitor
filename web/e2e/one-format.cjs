// One precision per instrument, one date format, one word per idea (I-5, 20 Nov 2026; the designer's D-05, D-16,
// D-17, D-36 and D-44): USD/JPY carries the same decimals on MARKETS (computer and phone), RATES & FX, WATCHLIST, a
// chart's head and a note's table; every yield level ends in "%"; no figure that rounds to zero carries a sign; no
// date anywhere reads "11/19", "16-Nov-26" or "2026-11-19"; the glossary's words are the same on both layouts. Also: a
// watchlist from a server older than this change (no decimals in its rows) still writes USD/JPY with three.
// Run from web/:  node e2e/run.cjs one-format   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { routes } = require("./harness.cjs");
const { watchRoutes, state } = require("./watchdata.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", FAKE = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const pick = (p, label) => p.locator(".pick", { has: p.locator(`.lbl:text-is("${label}")`) });
const AUTO = { size: "AUTO", compact: false, v: 2 };
async function page(b, opts, prefs = AUTO) {
  const ctx = await b.newContext({ deviceScaleFactor: 1, ...opts });
  await ctx.addInitScript((x) => { try { localStorage.setItem("om_prefs", JSON.stringify(x)); } catch {} }, prefs);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs };
}
const go = async (p, base, hash, sel) => { await p.goto(base + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel); await p.waitForTimeout(700); };
const decs = (s) => { const m = /\.(\d+)/.exec(s ?? ""); return m ? m[1].length : 0; };
// what may never be on a screen (D-16, D-36). A fiscal year ("FY3/26") is a period's name, not a date; a quarter is
// "2Q FY3/27". Zero: "-0.0%", "−0.0", "+0.0bp" and the like; "-0.05%" is a real move.
const BAD = {
  "a numeric day/month (11/19)": /(?<!FY)(?<![\w/])\d{1,2}\/\d{1,2}(?![\d/])/g,
  "a dd-Mon-yy date": /\b\d{2}-[A-Z][a-z]{2}-\d{2}\b/g,
  "an ISO date (2026-11-19)": /\b\d{4}-\d{2}-\d{2}\b/g,
  "a signed zero (−0.0, +0.0)": /[-−+]0(?:\.0+)?(?![\d.])(?:%|bp|σ)?/g,
};
// the visible text of the page and its tooltips, with what matched
const scan = (p) => p.evaluate((bad) => {
  const out = {}, text = document.body.innerText, tips = [...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title")).join("\n");
  for (const [k, src] of Object.entries(bad)) { const re = new RegExp(src, "g"), hits = [...`${text}\n${tips}`.matchAll(re)].map((m) => `${text}\n${tips}`.slice(Math.max(0, m.index - 30), m.index + m[0].length + 12).replace(/\s+/g, " ")); if (hits.length) out[k] = hits.slice(0, 4); }
  return out;
}, Object.fromEntries(Object.entries(BAD).map(([k, re]) => [k, re.source])));
const through = (p) => p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); });
const D = /^\d{1,2} [A-Z][a-z]{2} \d{4}$/, STAMP = /^\d{1,2} [A-Z][a-z]{2} \d\d:\d\d SGT$/;

(async () => { const b = await chromium.launch();
  const seen = {};   // USD/JPY as each place writes it
  console.log("\n[computer 1440x900: one precision per instrument (D-05, D-44)]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } });
    await go(p, MOCK, "#market", "table.mkt tbody tr:not(.cls)");
    const m = await p.evaluate(() => { const rows = [...document.querySelectorAll("table.mkt tbody tr")]; const cell = (name) => { const tr = rows.find((r) => r.children[0]?.childNodes[0]?.textContent.trim() === name); const td = tr?.children[1]; return td ? { t: td.textContent.trim(), whole: td.scrollWidth <= td.clientWidth } : null; };
      let cls = null; const yields = []; for (const r of rows) { if (r.classList.contains("cls")) { cls = r.textContent.trim(); continue; } if (cls === "Rates") yields.push(r.children[1].textContent.trim()); }
      return { usdjpy: cell("USD/JPY"), eurusd: cell("EUR/USD"), n225: cell("Nikkei 225"), bars: rows.filter((r) => r.classList.contains("cls")).map((r) => r.textContent.trim()), yields, aux: document.querySelector('.panel[data-k="mkt"] .aux').textContent }; });
    seen["MARKETS (computer)"] = m.usdjpy?.t;
    ck(`MARKETS: USD/JPY ${m.usdjpy?.t}, EUR/USD ${m.eurusd?.t}, the Nikkei ${m.n225?.t}: each its instrument's decimals, whole (it was 158.4 and 57,000.0)`, decs(m.usdjpy?.t) === 3 && decs(m.eurusd?.t) === 4 && decs(m.n225?.t) === 2 && [m.usdjpy, m.eurusd, m.n225].every((c) => c?.whole), m);
    ck(`MARKETS: every yield's level ends in "%" (${m.yields.join(" ")})`, m.yields.length >= 3 && m.yields.every((y) => /^\d+\.\d{3}%$/.test(y)), m.yields);
    ck(`the table's bars in the glossary's words (${m.bars.join(" · ")}): FX and Rates, not Currency and Fixed income`, m.bars.includes("FX") && m.bars.includes("Rates") && !m.bars.some((x) => /Currency|Fixed income/.test(x)), m.bars);
    ck(`its head: "as of" a time written "20 Nov 11:11 SGT" (${m.aux.slice(0, 40)}…)`, /^as of \d{1,2} [A-Z][a-z]{2} \d\d:\d\d SGT · /.test(m.aux), m.aux);
    await go(p, MOCK, "#rates", '.panel[data-k="fx"] tbody tr');
    const r = await p.evaluate(() => { const tr = [...document.querySelectorAll('.panel[data-k="fx"] tbody tr')].find((x) => x.children[0].textContent === "USD/JPY"); const tile = [...document.querySelectorAll('.panel[data-k="pairs"] .mtile')].find((t) => t.querySelector(".lbtxt")?.textContent === "USD/JPY");
      const curve = [...document.querySelectorAll('.panel[data-k="curve"] .curvetab tbody tr')].slice(0, 6).map((x) => [x.children[1].textContent, x.children[2].textContent]);
      return { table: tr?.children[1].textContent, tile: tile?.querySelector(".px")?.textContent, from: tile?.querySelector(".ch .mut")?.textContent, curve, titles: [...document.querySelectorAll(".panel .phead .t")].map((t) => t.textContent) }; });
    seen["RATES & FX table"] = r.table; seen["a chart's head"] = r.tile;
    ck(`RATES & FX: USD/JPY ${r.table} in the table, ${r.tile} at the head of its chart (${r.from})`, decs(r.table) === 3 && decs(r.tile) === 3 && / from \d+\.\d{3}$/.test(r.from ?? ""), r);
    ck(`the curves' tenor tables: a yield's level in "%" (${r.curve.slice(0, 2).map((x) => x.join(" / ")).join(", ")})`, r.curve.length >= 6 && r.curve.every((x) => x.every((v) => /^\d+\.\d{3}%$/.test(v))), r.curve);
    ck(`the panels in the glossary's words: FX, FX CHARTS, YIELD CHARTS (not FOREX, PAIRS, YIELDS)`, ["FX", "FX CHARTS", "YIELD CHARTS"].every((t) => r.titles.includes(t)) && !r.titles.some((t) => /^(FOREX|PAIRS|YIELDS)$/.test(t)), r.titles);
    await go(p, MOCK, "#watch", '.panel[data-k="wl"] tbody tr');
    const w = await p.evaluate(() => { const heads = [...document.querySelectorAll('.panel[data-k="wl"] thead th')].map((x) => x.textContent); const at = (sym, h) => { const tr = [...document.querySelectorAll('.panel[data-k="wl"] tbody tr')].find((x) => x.querySelector("td.nm .mut")?.textContent === sym); return tr ? tr.children[heads.indexOf(h)].textContent : null; }; return { usdjpy: at("USDJPY=X", "Last"), tnx: at("^TNX", "Last"), n225: at("^N225", "Last"), kind: at("USDJPY=X", "Sector / kind"), heads }; });
    seen["WATCHLIST (computer)"] = w.usdjpy;
    ck(`WATCHLIST: USD/JPY ${w.usdjpy} (it was 158.21), ^TNX ${w.tnx}, the Nikkei ${w.n225}: as on MARKETS`, w.usdjpy === m.usdjpy?.t && /^\d\.\d{3}%$/.test(w.tnx ?? "") && w.n225 === m.n225?.t, { w, m: m.usdjpy });
    ck(`its kind and headers in the glossary's words: "${w.kind}", ${w.heads.filter((h) => /vs|Mkt|results/i.test(h)).join(", ")}`, w.kind === "FX" && ["vs 50D", "vs 200D", "Mkt cap", "Next results"].every((h) => w.heads.includes(h)), w);
    await go(p, MOCK, "#research", '.panel[data-k="report"] table.nmaj');
    const n = await p.evaluate(() => { const tr = [...document.querySelectorAll("table.nmaj tr")].find((x) => x.children[0]?.textContent === "USD/JPY"); const ust = [...document.querySelectorAll("table.nmaj tr")].find((x) => /^UST/.test(x.children[0]?.textContent ?? "")); const dt = [...document.querySelectorAll("table.repT td.dt")]; return { usdjpy: tr?.children[1].textContent, ust: ust?.children[1].textContent, dates: dt.slice(0, 5).map((x) => x.textContent), whole: dt.every((x) => x.scrollWidth <= x.clientWidth) }; });
    seen["a note's table"] = n.usdjpy;
    ck(`a morning note's table: USD/JPY ${n.usdjpy}, ${n.ust ? `a yield ${n.ust}` : ""} (it was 158.43)`, decs(n.usdjpy) === 3 && (!n.ust || /%$/.test(n.ust)), n);
    ck(`RESEARCH's list dates as every date ("${n.dates.slice(0, 2).join('", "')}"), whole in their column`, n.dates.length >= 5 && n.dates.every((x) => D.test(x)) && n.whole, n);
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }

  console.log("\n[phone, iPhone 13: the same precision; a yield in %]");
  { const { ctx, p, errs } = await page(b, { ...devices["iPhone 13"] });
    await go(p, MOCK, "#market", ".mp-row");
    const ph = await p.evaluate(() => { const px = (name) => [...document.querySelectorAll(".mp-row")].find((r) => r.querySelector(".n")?.textContent === name)?.querySelector(".mp-px")?.textContent; return { usdjpy: px("USD/JPY"), ust: px("UST 10Y"), n225: px("Nikkei 225") }; });
    seen["MARKETS (phone)"] = ph.usdjpy;
    // an opened line's chart has no head of its own on a phone (the line is its head): its level shows in the read-out
    // under it, after a tap on the chart (the designer's D-42)
    await p.addStyleTag({ content: "#mockbar{display:none!important}" });
    await p.locator("button.mp-row", { hasText: "USD/JPY" }).first().tap(); await p.waitForSelector(".mp-item.open .u-over"); await p.waitForTimeout(700);
    await p.evaluate(() => { const o = document.querySelector(".mp-item.open .u-over"); scrollTo(0, o.getBoundingClientRect().top + scrollY - 150); }); await p.waitForTimeout(300);
    const ov = await p.locator(".mp-item.open .u-over").boundingBox();
    await p.touchscreen.tap(ov.x + ov.width * 0.5, ov.y + ov.height * 0.5); await p.waitForTimeout(300);
    const rd = (await p.locator(".mp-item.open .rdout").textContent()) ?? "", read = (/ · ([\d,]+\.\d+%?)/.exec(rd) ?? [])[1] ?? null;
    seen["a chart's read-out (phone)"] = read;
    ck(`MARKETS (phone): USD/JPY ${ph.usdjpy} on its line and ${read} in its chart's read-out ("${rd}"), UST 10Y ${ph.ust}, the Nikkei ${ph.n225}`, decs(ph.usdjpy) === 3 && decs(read) === 3 && /^\d{1,2} [A-Z][a-z]{2} /.test(rd) && /^\d\.\d{3}%$/.test(ph.ust ?? "") && decs(ph.n225) === 2, { ph, rd });
    await go(p, MOCK, "#rates", ".mp-row");
    const rp = await p.evaluate(() => ({ usdjpy: [...document.querySelectorAll(".mp-row")].find((r) => r.querySelector(".n")?.textContent === "USD/JPY")?.querySelector(".mp-px")?.textContent, tenors: [...document.querySelectorAll(".mp-sec table.mp-t tbody tr")].slice(0, 4).map((r) => r.children[1].textContent) }));
    seen["RATES & FX (phone)"] = rp.usdjpy;
    ck(`RATES & FX (phone): USD/JPY ${rp.usdjpy}; the curve's tenors in "%" (${rp.tenors.join(" ")})`, decs(rp.usdjpy) === 3 && rp.tenors.length >= 4 && rp.tenors.every((v) => /^\d+\.\d{3}%$/.test(v)), rp);
    await go(p, MOCK, "#watch", ".mp-row.starred");
    const wp = await p.evaluate(() => [...document.querySelectorAll(".mp-row.starred")].map((r) => ({ st: r.querySelector(".mp-st").textContent, px: r.querySelector(".mp-px").textContent })));
    seen["WATCHLIST (phone)"] = wp.find((x) => x.st.startsWith("USDJPY=X"))?.px;
    ck(`WATCHLIST (phone): USD/JPY ${seen["WATCHLIST (phone)"]}, ^TNX ${wp.find((x) => x.st.startsWith("^TNX"))?.px}`, decs(seen["WATCHLIST (phone)"]) === 3 && /%$/.test(wp.find((x) => x.st.startsWith("^TNX"))?.px ?? ""), wp);
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }
  const all = Object.entries(seen);
  ck(`USD/JPY with three decimals in every place (${all.map(([k, v]) => `${k} ${v}`).join("; ")})`, all.length === 9 && all.every(([, v]) => decs(v) === 3), seen);

  console.log("\n[an older server's watchlist (no decimals in its rows): USD/JPY still with three]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }); await routes(p); state.syms = ["USDJPY=X", "^TNX", "7203.T"]; await watchRoutes(p);
    await go(p, FAKE, "#watch", '.panel[data-k="wl"] tbody tr');
    const o = await p.evaluate(() => { const heads = [...document.querySelectorAll('.panel[data-k="wl"] thead th')].map((x) => x.textContent); return Object.fromEntries([...document.querySelectorAll('.panel[data-k="wl"] tbody tr')].map((tr) => [tr.querySelector("td.nm .mut").textContent, tr.children[heads.indexOf("Last")].textContent])); });
    ck(`USD/JPY ${o["USDJPY=X"]}, ^TNX ${o["^TNX"]}, Toyota ${o["7203.T"]} (a stock: none from 1,000)`, o["USDJPY=X"] === "158.210" && o["^TNX"] === "4.859%" && o["7203.T"] === "3,121", o);
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }

  console.log("\n[every screen, both layouts: one date format, no signed zero (D-16, D-36)]");
  const SCREENS = ["#market", "#news", "#research", "#equities/nk225", "#equities/sp500", "#rates", "#watch", "#asset/NVDA", "#asset/7203.T"];
  for (const [dev, opts] of [["computer 1440x900", { viewport: { width: 1440, height: 900 } }], ["iPhone 13", { ...devices["iPhone 13"] }]]) {
    const { ctx, p, errs } = await page(b, opts); const found = {};
    for (const h of SCREENS) {
      await p.goto("about:blank"); await go(p, MOCK, h);   // a fresh page for each screen
      if (dev === "iPhone 13" && h === "#research") { await p.locator(".rs-row").first().tap(); await p.waitForTimeout(900); }
      if (h.startsWith("#asset/")) { if (dev === "iPhone 13") await p.locator("#st-view").selectOption("quarterly"); else await p.locator("#st-view .chip-sm").nth(1).click(); await p.waitForTimeout(500); }
      await through(p); await p.waitForTimeout(300);
      const s = await scan(p); if (Object.keys(s).length) found[h] = s;
    }
    ck(`${dev}: no "11/19", no "16-Nov-26", no "2026-11-19", no −0.0 on ${SCREENS.length} screens, their tooltips included, and the statements by quarter`, Object.keys(found).length === 0, found);
    ck(`${dev}: no page errors`, errs.length === 0, errs); await ctx.close();
  }
  { const { ctx, p } = await page(b, { viewport: { width: 1440, height: 900 } });
    await go(p, MOCK, "#equities/nk225", '.panel[data-k="eq-sectors"] tbody tr');
    const z = await p.evaluate(() => [...document.querySelectorAll('.panel[data-k="eq-sectors"] tbody td.num')].filter((td) => /^0\.0%$/.test(td.textContent)).map((td) => ({ t: td.textContent, cls: td.className })));
    ck(`a move that rounds to zero reads "0.0%", grey, without a sign (${z.length} such cells in SECTOR PERFORMANCE)`, z.length >= 1 && z.every((x) => !/\b(up|dn)\b/.test(x.cls)), z);
    await ctx.close(); }

  console.log("\n[one word per idea, the same on both layouts (D-17)]");
  { const c = await page(b, { viewport: { width: 1440, height: 900 } }), ph = await page(b, { ...devices["iPhone 13"] });
    await go(c.p, MOCK, "#market", "table.mkt"); await go(ph.p, MOCK, "#market", ".mp-row");
    const nav = await c.p.evaluate(() => [...document.querySelectorAll("#nav a")].map((a) => a.textContent));
    const bar = await ph.p.evaluate(() => [...document.querySelectorAll("#pnav a span")].map((a) => a.textContent));
    const t1 = await ph.p.locator(".mp-head h1").textContent();
    ck(`the tabs: ${nav.join(" · ")} on the computer; ${bar.join(" · ")} along the phone's foot`, nav.join() === "MARKETS,NEWS,RESEARCH,EQUITIES,RATES & FX,WATCHLIST,PORTFOLIO" && bar.join() === "Markets,News,Research,Equities,Rates,Watchlist,Portfolio" && t1 === "Markets", { nav, bar, t1 });
    const delayC = await c.p.evaluate(() => ({ table: [...document.querySelectorAll("table.mkt .badge.delay")].map((x) => x.textContent), tile: [...document.querySelectorAll(".mtile .badge.delay")].map((x) => x.textContent) }));
    const delayP = await ph.p.evaluate(() => [...document.querySelectorAll(".mp-st .delay")].map((x) => x.textContent));
    ck(`a feed's delay: "${delayC.table[0]}" in the table and on the charts, "${delayP[0]}" on the phone`, delayC.table.length > 0 && delayC.tile.length > 0 && [...delayC.table, ...delayC.tile].every((x) => /^DELAYED ~\d+m$/.test(x)) && delayP.length > 0 && delayP.every((x) => /^Delayed ~\d+m$/.test(x)), { delayC, delayP });
    const perC = await c.p.evaluate(() => [...document.querySelectorAll(".chips .pick .lbl")].map((x) => x.textContent));
    const perP = {}; for (const h of ["#market", "#rates", "#watch", "#equities/nk225", "#asset/7203.T"]) { await go(ph.p, MOCK, h); perP[h] = await ph.p.evaluate(() => [...document.querySelectorAll(".mp .pick .lbl")].map((x) => x.textContent)); }
    ck(`the window of the changes is "Period" on every tab of both layouts (computer ${perC.join(", ")}; phone ${Object.values(perP).map((x) => x[0]).join(", ")})`, perC.includes("Period") && perC.includes("σ window") && Object.values(perP).every((x) => x.includes("Period") && !x.includes("Change")), { perC, perP });
    await go(c.p, MOCK, "#rates", '.panel[data-k="curve"] .phead .aux'); await go(ph.p, MOCK, "#rates", ".mp-cap.plain");
    const dc = await c.p.locator('.panel[data-k="curve"] .phead .aux').first().textContent(), dp = await ph.p.locator(".mp-cap.plain").first().textContent();
    const m = (s) => /dotted line: (\d{1,2} [A-Z][a-z]{2} \d{4}) \((\w+) ago\)/.exec(s);
    ck(`the earlier curve: "${m(dc)?.[0]}" on the computer, "${m(dp)?.[0]}" on the phone (not "ghost", not "earlier")`, !!m(dc) && !!m(dp) && !/ghost|earlier/.test(dc + dp), { dc, dp });
    await go(c.p, MOCK, "#asset/7203.T", "#st-key"); await go(ph.p, MOCK, "#asset/7203.T", "#st-key table.kv");
    const kc = await c.p.evaluate(() => [...document.querySelectorAll("#st-key tr td.l, .panel[data-k='st-key'] .krow .k")].map((x) => x.textContent));
    const kp = await ph.p.evaluate(() => [...document.querySelectorAll("#st-key table.kv tr td:first-child"), ...document.querySelectorAll("#st-key .mp-grid .k")].map((x) => x.childNodes[0].textContent));
    const words = ["Avg daily volume (60d)", "Avg daily turnover (60d)", "Mkt cap", "Next results"];
    ck(`a stock's key data in the same words on both: ${words.join(", ")}`, words.every((w) => kc.includes(w) && kp.includes(w)) && !kc.concat(kp).some((x) => /ADTV|Market cap|Average daily|Next earnings|52-week/.test(x)), { kc, kp });
    await c.ctx.close(); await ph.ctx.close();
  }

  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
