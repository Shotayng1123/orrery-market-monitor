// An instrument's own page (I-4, 20 Nov 2026; B-04, B-23 = D-15, B-12's currency filter, B's defects 1, 2, 5 and 6, and the
// designer's I-4 note). The figures are the mock feed's; the events and headlines the stand-in rows
// (web/src/lib/standin.json), counted from when the suite starts, so nothing here depends on the time of day.
//   - #asset/USDJPY%3DX, ^TNX, JGB10Y, GC=F and ^STOXX50E open as an instrument's page on a computer and on a phone, with
//     no stock-only line (no market cap, shares, valuation, results, short interest, big moves or statements); ^N225
//     still opens the Nikkei 225 on EQUITIES (the designer's rule: one page per name).
//   - A yield's changes, distances, volatility and largest moves are in bp, on the page and on its chart tile (B's defect
//     1); its level ends in %. JGB 10Y, which Yahoo does not carry, opens (defect 2) and names Japan MOF and its date.
//   - USD/JPY's EVENTS are the stand-in USD and JPY events; its NEWS the stand-in headlines matched by yen, JPY, BoJ and
//     Bank of Japan, and says so. The Nikkei 225 future (NKD=F, quoted in dollars on the CME) lists Japan's events and
//     then the dollar's (B-04 (b), B's verdict of 20 Nov 2026), on both layouts; on a computer EVENTS starts with the
//     banks' next meeting as a dash, "not kept yet", as the phone's first block has it.
//   - On a computer every instrument name on MARKETS and RATES & FX is a teal link and its row opens the page (D-15, B-23,
//     defect 5): "USD/JPY" on MARKETS opens #asset/USDJPY%3DX, the JGB 10Y tile's name opens #asset/JGB10Y.
//   - NEWS: the calendar's Currency picker; JPY leaves only Japan's events, on both layouts (B-12).
//   - The one-screen layout shows the designer's two screens (§4.7) switched by GO TO: the chart, KEY DATA, PERFORMANCE
//     and EVENTS, then NEWS; KEY DATA and PERFORMANCE without an empty block, no panel head cut (the designer's I-4
//     verdict, 20 Nov 2026). Text XL places the panels in one column; a server from before 20 Nov 2026 (a stock's
//     answer for every name, "no quote for JGB10Y") still gives a page that works.
//   - Fixes after the check (20 Nov 2026): a yield an official curve publishes once a day, which the market table stamps
//     with its date at midnight UTC, shows that date and never a made-up time of day, on its chart tile, in its tooltip
//     and in MARKETS' row and phone line (R2B-01); every other tile gives its time with its zone (R2B-06); KEY DATA marks
//     what the Monitor works out itself with † after the label, with a line under the panel (R2B-05). Both layouts.
// Run from web/:  node e2e/run.cjs instrument-pages   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { S } = require("./standin.cjs");
const { routes } = require("./harness.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 1500)}`); };
const CYAN = "rgb(31, 209, 193)";
const PAGES = [
  { hash: "#asset/USDJPY%3DX", name: "USD/JPY", yield: false, ccys: ["USD", "JPY"] },
  { hash: "#asset/%5ETNX", name: "UST 10Y yield", yield: true, ccys: ["USD"] },
  { hash: "#asset/JGB10Y", name: "JGB 10Y yield", yield: true, ccys: ["JPY"], official: "Japan MOF" },
  { hash: "#asset/GC%3DF", name: "Gold", yield: false, ccys: ["USD"] },
  { hash: "#asset/%5ESTOXX50E", name: "Euro Stoxx 50", yield: false, ccys: ["EUR"] },
  // an index future quoted in another currency than its index's: its index's calendar first (B-04 (b))
  { hash: "#asset/NKD%3DF", name: "Nikkei 225 future (CME)", yield: false, ccys: ["JPY", "USD"] },
];
// B's check for the Nikkei 225 future: Japan's events in its calendar
const NKD_JP = ["JP CPI y/y", "JP PMI Manufacturing (flash)", "JP GDP q/q (preliminary)"];
// the designer's † after a label the Monitor works out itself (R2B-05); σ vs 1M avg and vs 200D are MARKETS' own here
const KEY_ROWS = ["Day's range", "Previous close", "52W range †", "From 52W high / low †", "σ vs 1M avg", "vs 200D", "Realised vol, 1M / 3M / 12M †", "Largest rise, 12M †", "Largest fall, 12M †", "Source · as of"];
// a future also names its contract and its last change of contract, after the previous close (B-27, I-6)
const keyRows = (hash) => (/%3DF$/.test(hash) ? [...KEY_ROWS.slice(0, 2), "Contract", "Last change of contract", ...KEY_ROWS.slice(2)] : KEY_ROWS);
const DATE = "\\d{1,2} [A-Z][a-z]{2} \\d{4}";
const STOCK_ONLY = /Mkt cap|Shares outstanding|Diluted shares|P\/E|P\/B|Dividend yield|Next results|Short interest|Beta vs|Avg daily|Volume today|FINANCIALS|BIG MOVES|SHORT INTEREST|Statements/;
async function page(b, opts, prefs) {
  const ctx = await b.newContext(opts);
  await ctx.addInitScript((pr) => { try { if (pr) localStorage.setItem("om_prefs", JSON.stringify(pr)); } catch {} }, prefs || null);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs };
}
const go = async (p, base, hash, sel) => { await p.goto(base + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel); await p.evaluate(() => document.fonts.ready); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(400); };
// the stand-in rows the mock's instrument page shows: the events of the currencies in time order; the headlines whose
// title holds one of the words, newest first (the server's rule, supabase/functions/_shared/instrfeed.ts)
const eventsOf = (ccys) => S.calendar.filter((e) => ccys.includes(e.currency ?? e.country)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
const wordRe = (words) => new RegExp(`(?:^|[^A-Za-z0-9_])(?:${words.join("|")})(?![A-Za-z0-9_])`, "i");
const decode = (t) => t.replace(/&#x2019;/g, "’").replace(/&amp;/g, "&");
const headlinesOf = (words) => S.news.filter((n) => wordRe(words).test(n.title)).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
// the computer page as data
const desk = (p) => p.evaluate(() => {
  const pn = [...document.querySelectorAll("#grid .panel")];
  const key = document.querySelector("#in-key");
  return {
    panels: pn.map((x) => `${x.dataset.no} ${x.querySelector(".phead .t").textContent}`).sort(),
    text: pn.map((x) => x.innerText).join("\n"),
    fin: !!document.querySelector("table.fin"),
    krow: [...document.querySelectorAll('.panel[data-k="in-key"] .krow .k')].map((e) => e.textContent),
    last: document.querySelector("#in-last")?.textContent ?? null, day: document.querySelector("#in-day")?.textContent ?? null,
    rows: key ? Object.fromEntries([...key.querySelectorAll("tr")].map((tr) => [tr.cells[0].textContent.replace(/\s+/g, " "), tr.cells[1].innerText.replace(/\s+/g, " ").trim()])) : {},
    src: document.querySelector("#in-src")?.textContent ?? "", worked: document.querySelector("#in-worked")?.textContent ?? "",
    stamp: document.querySelector(".bigwrap .vl .asof")?.textContent.replace(/\s+/g, " ").trim() ?? "", stampTip: document.querySelector(".bigwrap .vl .asof")?.getAttribute("title") ?? "",
    chartAux: document.querySelector('.panel[data-k="in-chart"] .phead .aux')?.textContent ?? "",
    tile: document.querySelector(".bigwrap .ch")?.textContent ?? "", tilePx: document.querySelector(".bigwrap .px")?.textContent ?? "",
    perfHead: [...document.querySelectorAll("#in-perf thead th")].slice(1).map((x) => x.textContent),
    then: [...document.querySelectorAll('#in-perf tr[data-r="then"] td')].slice(1).map((x) => x.textContent),
    chg: [...document.querySelectorAll('#in-perf tr[data-r="chg"] td')].slice(1).map((x) => x.textContent),
    periods: [...document.querySelectorAll(".c12 .pick")].find((x) => /PERIOD/i.test(x.querySelector(".lbl").textContent))?.querySelector("select") ? [...[...document.querySelectorAll(".c12 .pick")].find((x) => /PERIOD/i.test(x.querySelector(".lbl").textContent)).querySelectorAll("option")].map((o) => o.value) : [],
    events: [...document.querySelectorAll("#in-events tbody tr.ecrow")].map((tr) => ({ ccy: tr.cells[1].textContent, title: tr.cells[2].childNodes[1]?.textContent ?? tr.cells[2].textContent })),
    evAux: document.querySelector('.panel[data-k="in-events"] .phead .aux')?.textContent ?? "",
    meet: document.querySelector("#in-meet")?.textContent.replace(/\s+/g, " ").trim() ?? null,
    newsAux: document.querySelector('.panel[data-k="in-news"] .phead .aux')?.textContent ?? "",
    news: [...document.querySelectorAll("#st-news .snrow")].map((r) => ({ kind: r.dataset.kind, title: r.querySelector(".snt").textContent, src: r.querySelector(".snm .src")?.textContent ?? null })),
    newsEmpty: document.querySelector('.panel[data-k="in-news"] .empty')?.textContent ?? null,
    ox: document.documentElement.scrollWidth - innerWidth,
  };
});
const bp = (t) => /^[+-]?\d+(\.\d)?bp$/.test(t) || t === "–";
const pc = (t) => /^[+-]?\d[\d,]*\.\d+%$/.test(t) || t === "–";

(async () => { const b = await chromium.launch();
  console.log("\n[a computer, 1440x900: five instruments' pages]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, { size: "AUTO", compact: false, v: 2 });
    for (const pg of PAGES) {
      await go(p, MOCK, pg.hash, "#in-key"); await p.waitForSelector(".bigwrap canvas, .bigwrap .chartbox");
      const d = await desk(p);
      ck(`${pg.name}: an instrument's page, panels in reading order (${d.panels.join(" · ")}), and no stock-only line: no market cap, shares, valuation, results, short interest, big moves or statements`, d.panels.join("|") === `01 ${pg.name.toUpperCase()}|02 KEY DATA|03 PERFORMANCE|04 EVENTS|05 NEWS` && !d.fin && !STOCK_ONLY.test(d.text), { panels: d.panels, stockOnly: (STOCK_ONLY.exec(d.text) || [])[0] });
      ck(`${pg.name}: KEY DATA in the designer's order (Last and Day, then the day's range … the source and as-of)`, d.krow.join() === "Last,Day" && Object.keys(d.rows).join("|") === keyRows(pg.hash).join("|"), { krow: d.krow, rows: Object.keys(d.rows) });
      if (pg.yield) {
        const [hi, lo] = d.rows["From 52W high / low †"].split(" / "), [rise] = d.rows["Largest rise, 12M †"].split(" · "), [fall] = d.rows["Largest fall, 12M †"].split(" · ");
        ck(`${pg.name}: every change in bp (B's defect 1): the day ${d.day}, 1D … 36M ${d.chg.join(" ")}, from the 52W high and low ${hi} / ${lo}, vs 200D ${d.rows["vs 200D"]}, largest rise ${rise} and fall ${fall}; the tile "${d.tile.trim()}"`, bp(d.day) && d.chg.length === 6 && d.chg.every(bp) && bp(hi) && bp(lo) && bp(d.rows["vs 200D"]) && bp(rise) && bp(fall) && /^[+-]?\d+(\.\d)?bp\s/.test(d.tile.trim()), d);
        ck(`${pg.name}: its volatility in bp a day and a year ("${d.rows["Realised vol, 1M / 3M / 12M †"]}"); its levels in % (${d.last}, then ${d.then.join(" ")})`, /^[\d.–]+ \/ [\d.–]+ \/ [\d.–]+ bp\/day [\d–]+ \/ [\d–]+ \/ [\d–]+ bp ann\. · 3Y pctl /.test(d.rows["Realised vol, 1M / 3M / 12M †"]) && /^\d\.\d{3}%$/.test(d.last) && d.then.every((t) => /^\d\.\d{3}%$/.test(t)) && /%$/.test(d.tilePx), d.rows);
      } else {
        ck(`${pg.name}: a price's changes in per cent (the day ${d.day}, 1D … 36M ${d.chg.join(" ")}) and its volatility a yearly per cent ("${d.rows["Realised vol, 1M / 3M / 12M †"]}")`, pc(d.day) && d.chg.every(pc) && /^[\d.–]+ \/ [\d.–]+ \/ [\d.–]+% ann\. 3Y pctl /.test(d.rows["Realised vol, 1M / 3M / 12M †"]), d.rows);
      }
      if (pg.official) {
        ck(`${pg.name}: opens though Yahoo does not carry it (B's defect 2), names ${pg.official} and the day it was published for ("${d.src}"); no day's range; daily charts only (${d.periods.join(" ")})`, new RegExp(`^${pg.official} · published for ${DATE}$`).test(d.src) && d.chartAux.includes(`${pg.official} · published once a day`) && d.rows["Day's range"] === "–" && d.periods.join() === "3M,12M,36M,5Y,10Y", { src: d.src, aux: d.chartAux, range: d.rows["Day's range"], periods: d.periods });
        // R2B-01: the chart tile above KEY DATA gives the same date, and no time of day
        const day = d.src.replace(`${pg.official} · published for `, "");
        ck(`${pg.name}: its chart tile says "${d.stamp}" ("${d.stampTip}"): the date KEY DATA gives, never a time of day (it read "CLOSED 19 Nov 08:00", midnight UTC in SGT)`, d.stamp === `PUBLISHED ${day}` && d.stampTip === `${pg.official} · published for ${day}` && !/\d\d:\d\d/.test(d.stamp + d.stampTip), { stamp: d.stamp, tip: d.stampTip, day });
      } else ck(`${pg.name}: Yahoo Finance and the time of its print; a day's range; every period from 1D to 10Y; the tile's time with its zone ("${d.stamp}")`, /^Yahoo Finance · /.test(d.src) && /\d%? – \d/.test(d.rows["Day's range"]) && d.periods.join() === "1D,1W,1M,3M,12M,36M,5Y,10Y" && /^(LIVE|CLOSED) (\d{1,2} [A-Z][a-z]{2} )?\d\d:\d\d SGT$/.test(d.stamp) && /^Yahoo Finance · last print /.test(d.stampTip), { src: d.src, range: d.rows["Day's range"], periods: d.periods, stamp: d.stamp });
      // R2B-05: what the Monitor works out itself is marked, and the line under KEY DATA says from what and over which dates
      const from = pg.official ? `${pg.official}'s published daily yields` : "the daily closes the Monitor stores from Yahoo Finance";
      ck(`${pg.name}: KEY DATA's worked-out lines carry † and its source row says so; under it "${d.worked}"`, new RegExp(`^† worked out here from ${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, ${DATE} – ${DATE}; the other figures as on MARKETS\\.$`).test(d.worked) && /† worked out by the Monitor$/.test(d.rows["Source · as of"]), { worked: d.worked, src: d.rows["Source · as of"] });
      const want = eventsOf(pg.ccys);
      await p.locator('.panel[data-k="in-events"] .pick select').selectOption("all"); await p.waitForTimeout(250);
      const all = await desk(p);
      ck(`${pg.name}: EVENTS of ${pg.ccys.join(" and ")} (${all.events.length} with Impact All), the stand-in ones in time order and no other currency's`, all.evAux.includes(`${pg.ccys.join(" and ")} · times in SGT`) && all.events.length === want.length && all.events.every((e, i) => pg.ccys.includes(e.ccy) && e.title === want[i].title), { aux: all.evAux, got: all.events.map((e) => `${e.ccy} ${e.title}`), want: want.map((e) => `${e.currency} ${e.title}`) });
      // B-04 (b): the banks' next meetings are said to be still to come, as on the phone, never left out unsaid
      ck(`${pg.name}: EVENTS starts with "${all.meet}"`, /^Next meeting – not kept yet: the central banks' next meetings join here when the Monitor keeps their calendars$/.test(all.meet ?? ""), all.meet);
      if (pg.hash === "#asset/NKD%3DF") ck(`${pg.name}: its head names JPY ("${all.evAux}") and Impact All lists Japan's events (${NKD_JP.join(", ")}), not only the dollar's`, all.evAux.includes("JPY and USD · times in SGT") && NKD_JP.every((t) => all.events.some((e) => e.ccy === "JPY" && e.title === t)) && all.events.some((e) => e.ccy === "USD"), { aux: all.evAux, got: all.events.map((e) => `${e.ccy} ${e.title}`) });
      await p.locator('.panel[data-k="in-events"] .pick select').selectOption("high"); await p.waitForTimeout(150);
    }
    // USD/JPY's headlines: those that say yen, JPY, BoJ or Bank of Japan, and the page says how they were matched
    await go(p, MOCK, "#asset/USDJPY%3DX", "#in-key");
    const d = await desk(p), heads = headlinesOf(["yen", "JPY", "BoJ", "Bank of Japan"]);
    // with its own alerts on it, in one list newest first (the stand-in 2.7σ move of I-6 among them)
    const since = Date.now() - 30 * 864e5, own = [...S.watch.feed.alerts.map((a) => ({ ...a, id: a.id + 1000 })), ...S.alerts].filter((a) => a.symbol === "USDJPY=X" && Date.parse(a.at) >= since);
    const want = [...heads.map((n) => ({ kind: "headline", title: decode(n.title), t: Date.parse(n.publishedAt), key: `h${n.id}` })), ...own.map((a) => ({ kind: "alert", title: a.msg, t: Date.parse(a.at), key: `a${a.id}`, a }))].sort((x, y) => y.t - x.t || x.key.localeCompare(y.key));
    ck(`USD/JPY: NEWS says how it matched ("${d.newsAux}") and lists the yen headlines and its own alerts, newest first (${heads.length} headlines and ${own.length} alert in the stand-in rows, fifteen shown)`, d.newsAux === "matched by: yen, JPY, BoJ, Bank of Japan · 30 days · times in SGT" && heads.length > 15 && own.length >= 1 && d.news.length === 15 && d.news.every((n, i) => n.kind === want[i].kind && n.title === want[i].title), { aux: d.newsAux, got: d.news.slice(0, 3), want: want.slice(0, 3).map((n) => n.title) });
    const sg = d.news.find((n) => n.kind === "alert"), sa = own.find((a) => a.kind === "sigma");
    ck(`USD/JPY: its σ move names its window and source where a move names its exchange ("${sg?.title}", "${sg?.src}")`, !!sg && !!sa && sg.title === sa.msg && sg.src === `σ move, ${sa.note}`, sg);
    await go(p, MOCK, "#asset/GC%3DF", "#in-key");
    const g = await desk(p);
    ck(`Gold: no stand-in headline says gold or bullion, and the list says which words it looked for ("${g.newsEmpty}")`, g.newsEmpty === "In the last 30 days no headline matched gold or bullion, and there was no alert on Gold." && g.newsAux.startsWith("matched by: gold, bullion · 30 days"), g);
    ck("no page errors; nothing sideways", errs.length === 0 && d.ox <= 0 && g.ox <= 0, errs); await ctx.close(); }

  console.log("\n[a computer: every instrument name opens its page (D-15, B-23)]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, { size: "AUTO", compact: false, v: 2 });
    await go(p, MOCK, "#market", "table.mkt tbody tr.click");
    const row = p.locator("table.mkt tbody tr.click", { hasText: "USD/JPY" }).first();
    const look = await row.evaluate((tr) => { const a = tr.querySelector("a.lnk"); return { href: a?.getAttribute("href"), col: a ? getComputedStyle(a).color : null, cursor: getComputedStyle(tr).cursor, name: a?.textContent }; });
    await row.locator("td").nth(3).hover(); await p.waitForTimeout(100);
    const under = await row.evaluate((tr) => getComputedStyle(tr.querySelector("a.lnk")).textDecorationLine);
    ck(`MARKETS: the name is a teal link to its page (${look.href}), the row a pointer, and hovering anywhere on the row underlines the name`, look.href === "#asset/USDJPY%3DX" && look.col === CYAN && look.cursor === "pointer" && under === "underline", { ...look, under });
    await row.locator("td").nth(3).click(); await p.waitForSelector("#in-key");
    ck("MARKETS: clicking USD/JPY's row opens #asset/USDJPY%3DX, the instrument's page", (await p.evaluate(() => location.hash)) === "#asset/USDJPY%3DX" && (await p.locator('.panel[data-k="in-chart"] .phead .t').textContent()) === "USD/JPY");
    await go(p, MOCK, "#market", "table.mkt tbody tr.click");
    await p.locator("table.mkt tbody tr.click a.lnk", { hasText: "Nikkei 225" }).first().click(); await p.waitForTimeout(700);
    ck("MARKETS: the Nikkei 225 opens on EQUITIES, its own page there", (await p.evaluate(() => location.hash)) === "#equities/nk225");
    await go(p, MOCK, "#market", ".mtile.cp a.lbtxt");
    const tiles = await p.evaluate(() => [...document.querySelectorAll(".mtile.cp .lb > a.lbtxt")].map((a) => ({ t: a.textContent, href: a.getAttribute("href"), col: getComputedStyle(a).color })));
    ck(`MARKETS: every chart tile's title is a teal link to its page (${tiles.length} tiles: equities, rates, FX, commodities)`, tiles.length >= 15 && tiles.every((x) => x.col === CYAN && /^#(asset|equities)\//.test(x.href)) && tiles.some((x) => x.t === "UST 10Y yield" && x.href === "#asset/%5ETNX") && tiles.some((x) => x.t === "Gold" && x.href === "#asset/GC%3DF"), tiles.slice(0, 6));
    await p.locator(".mtile.cp a.lbtxt", { hasText: "UST 10Y yield" }).first().click(); await p.waitForSelector("#in-key");
    ck("MARKETS: the UST 10Y tile's title opens #asset/%5ETNX", (await p.evaluate(() => location.hash)) === "#asset/%5ETNX");
    await go(p, MOCK, "#rates", '.panel[data-k="fx"] tbody tr.click');
    const fx = await p.evaluate(() => [...document.querySelectorAll('.panel[data-k="fx"] tbody tr')].map((tr) => ({ click: tr.classList.contains("click"), href: tr.querySelector("a.lnk")?.getAttribute("href") ?? null })));
    ck(`RATES & FX: every FX row opens its pair's page (${fx.length} rows)`, fx.length >= 3 && fx.every((r) => r.click && /^#asset\//.test(r.href)), fx);
    await p.locator('.panel[data-k="fx"] tbody tr.click', { hasText: "USD/JPY" }).locator("td").nth(2).click(); await p.waitForSelector("#in-key");
    ck("RATES & FX: clicking USD/JPY's FX row opens its page", (await p.evaluate(() => location.hash)) === "#asset/USDJPY%3DX");
    await go(p, MOCK, "#rates", '.panel[data-k="yields"] a.lbtxt');
    await p.locator('.panel[data-k="yields"] a.lbtxt', { hasText: "JGB 10Y yield" }).first().click(); await p.waitForSelector("#in-key");
    const j = await desk(p);
    ck(`RATES & FX: the JGB 10Y tile's name opens #asset/JGB10Y, and that page works (B-23): ${j.last}, ${j.src}`, (await p.evaluate(() => location.hash)) === "#asset/JGB10Y" && /^\d\.\d{3}%$/.test(j.last) && /^Japan MOF · published for /.test(j.src), j.rows);
    await p.evaluate(() => { location.hash = "asset/%5EN225"; }); await p.waitForTimeout(800);
    ck("an address of ^N225's single-name page lands on the Nikkei 225 on EQUITIES (the designer's I-4 check)", (await p.evaluate(() => location.hash)) === "#equities/nk225");
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[a figure with a date and no time of day (R2B-01); every tile's time with its zone (R2B-06)]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, { size: "AUTO", compact: false, v: 2 });
    await go(p, MOCK, "#market", "table.mkt tbody tr.click");
    for (let y = 0; y < 4000; y += 600) { await p.evaluate((yy) => scrollTo(0, yy), y); await p.waitForTimeout(80); }
    const t = await p.evaluate(() => ({
      tiles: [...document.querySelectorAll(".mtile.cp")].filter((x) => x.querySelector(":scope > .vl .asof")).map((x) => ({ name: x.querySelector(".lbtxt").textContent, stamp: x.querySelector(".vl .asof").textContent.replace(/\s+/g, " ").trim(), tip: x.querySelector(".vl .asof").getAttribute("title") })),
      rows: Object.fromEntries([...document.querySelectorAll("table.mkt tbody tr.click")].map((tr) => [tr.querySelector("a.lnk").textContent, tr.title])),
    }));
    const pub = t.tiles.filter((x) => /^(UST 2Y|JGB 10Y) yield$/.test(x.name)), rest = t.tiles.filter((x) => !pub.includes(x));
    ck(`MARKETS: the yields an official curve publishes once a day show the date they were published for, never a time (${pub.map((x) => `${x.name}: "${x.stamp}", "${x.tip}"`).join("; ")})`, pub.length === 2 && pub.every((x) => new RegExp(`^PUBLISHED ${DATE}$`).test(x.stamp) && x.tip === `${x.name.startsWith("JGB") ? "Japan MOF" : "US Treasury"} · published for ${x.stamp.slice(10)}`), pub);
    ck(`MARKETS: every other tile gives its time with its zone and names its source (${rest.length}: "${rest[0]?.stamp}", "${rest[0]?.tip}")`, rest.length >= 15 && rest.every((x) => /^(LIVE|CLOSED) (\d{1,2} [A-Z][a-z]{2} )?\d\d:\d\d SGT$/.test(x.stamp) && /^Yahoo Finance · last print \d{1,2} [A-Z][a-z]{2} \d{4} \d\d:\d\d SGT$/.test(x.tip)), rest.filter((x) => !/ SGT$/.test(x.stamp)).slice(0, 4));
    const jr = t.rows["JGB 10Y"] ?? t.rows["JGB 10Y yield"] ?? Object.entries(t.rows).find(([k]) => /JGB/.test(k))?.[1];
    ck(`MARKETS: JGB 10Y's row says when it was published, with no time of day ("${jr}")`, new RegExp(`^JGB10Y · Japan MOF · published for ${DATE} · open its page$`).test(jr ?? ""), t.rows);
    await go(p, MOCK, "#rates", '.panel[data-k="yields"] .mtile.cp');
    const r = await p.evaluate(() => [...document.querySelectorAll('.panel[data-k="yields"] .mtile.cp')].map((x) => ({ name: x.querySelector(".lbtxt").textContent, stamp: x.querySelector(".vl .asof")?.textContent.replace(/\s+/g, " ").trim() ?? "" })));
    ck(`RATES & FX: the JGB 10Y tile too ("${r.find((x) => /JGB 10Y/.test(x.name))?.stamp}"); the others with their zone`, r.some((x) => /JGB 10Y/.test(x.name) && new RegExp(`^PUBLISHED ${DATE}$`).test(x.stamp)) && r.filter((x) => !/^(UST 2Y|JGB 10Y) yield$/.test(x.name)).every((x) => / SGT$/.test(x.stamp)), r);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, { ...devices["iPhone 13"] });
    await go(p, MOCK, "#market", ".mp-row");
    await p.locator(".mp-row", { hasText: "JGB 10Y" }).first().tap(); await p.waitForSelector(".mp-item.open .mp-full"); await p.waitForTimeout(300);
    const line = await p.locator(".mp-item.open .mp-full").textContent();
    ck(`phone MARKETS: JGB 10Y's opened line says when it was published, with no time of day ("${line}")`, new RegExp(`^JGB 10Y yield · JGB10Y · Japan MOF · published for ${DATE}$`).test(line), line);
    await p.locator(".mp-row", { hasText: "USD/JPY" }).first().tap(); await p.waitForTimeout(400);
    const l2 = await p.locator(".mp-item.open .mp-full").textContent();
    ck(`phone MARKETS: a print's line keeps its time and zone ("${l2}")`, /^USD\/JPY · USDJPY=X · Yahoo Finance · last print \d{1,2} [A-Z][a-z]{2} \d{4} \d\d:\d\d SGT$/.test(l2), l2);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[NEWS: the calendar's Currency picker (B-12), on a computer and on a phone]");
  const jpEvents = S.calendar.filter((e) => e.impact === "High" && (e.currency ?? e.country) === "JPY");
  for (const dev of ["desk", "iPhone 13"]) {
    const { ctx, p, errs } = await page(b, dev === "desk" ? { viewport: { width: 1440, height: 900 } } : { ...devices[dev] }, { size: "AUTO", compact: false, v: 2 });
    await go(p, MOCK, "#news", dev === "desk" ? "table.calT tr.ecrow" : ".ev-row");
    const opts = await p.locator("#cal-ccy select option").evaluateAll((os) => os.map((o) => o.value));
    await p.locator("#cal-ccy select").selectOption("JPY"); await p.waitForTimeout(400);
    const rows = await p.evaluate((desk) => desk ? [...document.querySelectorAll("table.calT tr.ecrow")].map((tr) => ({ ccy: tr.cells[1].textContent, title: tr.cells[2].childNodes[0].textContent })) : [...document.querySelectorAll(".ev-row")].map((r) => ({ ccy: r.querySelector(".ev-t small").textContent, title: r.querySelector(".ev-n").childNodes[1].textContent })), dev === "desk");
    ck(`${dev === "desk" ? "computer" : dev}: Currency beside Countries offers ${opts.slice(0, 5).join(", ")} …; JPY leaves only Japan's events (${rows.length}: ${rows.map((r) => r.title).join(" · ")})`, opts[0] === "All" && opts.slice(1, 4).join() === "USD,EUR,JPY" && rows.length === jpEvents.length && rows.every((r, i) => r.ccy === "JPY" && r.title === jpEvents[i].title), { opts, rows, want: jpEvents.map((e) => e.title) });
    await p.locator("#cal-ccy select").selectOption("All"); await p.waitForTimeout(300);
    const back = await p.evaluate((desk) => new Set([...document.querySelectorAll(desk ? "table.calT tr.ecrow td:nth-child(2)" : ".ev-row .ev-t small")].map((x) => x.textContent)).size, dev === "desk");
    ck(`${dev === "desk" ? "computer" : dev}: All brings every currency back; no page errors`, back > 3 && errs.length === 0, { back, errs }); await ctx.close();
  }

  console.log("\n[a phone, iPhone 13: the same five pages]");
  { const { ctx, p, errs } = await page(b, { ...devices["iPhone 13"] });
    for (const pg of PAGES) {
      await go(p, MOCK, pg.hash, "#in-first");
      const ph = await p.evaluate(() => ({
        meta: [...document.querySelectorAll(".mp-doc.asset .meta span")].map((s) => s.textContent), h1: document.querySelector(".mp-doc.asset h1")?.textContent,
        first: [...document.querySelectorAll("#in-first .mp-grid > div")].map((c) => [c.querySelector(".k").textContent.replace(/\s+/g, " "), c.querySelector(".v").childNodes[0]?.textContent ?? ""]),
        keys: [...document.querySelectorAll("#in-key tr td:first-child")].map((td) => td.childNodes[0]?.textContent.replace(/\s+/g, " ") + (td.querySelector(".wk") ? " †" : "")), worked: document.querySelector("#in-worked")?.textContent ?? "",
        stamp: document.querySelector(".mp-hero .vl .asof")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        secs: [...document.querySelectorAll(".mp-sec > h2 > span:first-child")].map((e) => e.textContent), text: document.querySelector(".mp").innerText,
        perf: [...document.querySelectorAll("#in-perf tbody tr")].map((tr) => tr.cells[2].textContent), periods: [...document.querySelector(".mp-picks .pick select").options].map((o) => o.value),
        ox: document.documentElement.scrollWidth - innerWidth,
      }));
      const firstK = ph.first.map((c) => c[0]).join("|");
      ck(`${pg.name}: the stock page's frame, "${ph.meta.join(" · ")}" over "${ph.h1}"; the first block (${firstK}); then Key data, Performance, Events and News, and no stock-only section`, ph.meta[0] === decodeURIComponent(pg.hash.replace("#asset/", "")) && ph.h1 === pg.name && firstK === "Day|52W range|σ vs 1M avg|Realised vol 3M †|vs 200D|Next meeting" && ph.first[5][1] === "–" && ph.secs.join() === "Key data,Performance,Events,News" && !STOCK_ONLY.test(ph.text) && ph.ox <= 0, ph);
      if (pg.yield) ck(`${pg.name}: in bp on the phone too: the day ${ph.first[0][1]}, vs 200D ${ph.first[4][1]}, the volatility ${ph.first[3][1]} a day, 1D … 36M ${ph.perf.join(" ")}`, bp(ph.first[0][1]) && bp(ph.first[4][1]) && /^\d+\.\dbp$/.test(ph.first[3][1]) && ph.perf.length === 6 && ph.perf.every(bp), ph.first);
      if (pg.official) ck(`${pg.name}: daily charts only on the phone (${ph.periods.join(" ")}); the chart says "${ph.stamp}", a date and no time of day`, ph.periods.join() === "3M,12M,36M,5Y,10Y" && new RegExp(`^PUBLISHED ${DATE}$`).test(ph.stamp), { periods: ph.periods, stamp: ph.stamp });
      else ck(`${pg.name}: the chart's time with its zone on the phone too ("${ph.stamp}")`, /^(LIVE|CLOSED) (\d{1,2} [A-Z][a-z]{2} )?\d\d:\d\d SGT$/.test(ph.stamp), ph.stamp);
      ck(`${pg.name}: Key data marks the same lines with † (${ph.keys.filter((k) => k.endsWith("†")).length}) and its note names the closes and their dates`, ph.keys.filter((k) => k.endsWith("†")).length === 5 && ["52W range", "From 52W high / low", "Realised vol, 1M / 3M / 12M", "Largest rise, 12M", "Largest fall, 12M"].every((k) => ph.keys.some((x) => x.startsWith(k) && x.endsWith("†"))) && new RegExp(`^† worked out here from .+, ${DATE} – ${DATE}; the other figures as on MARKETS\\. `).test(ph.worked), { keys: ph.keys, worked: ph.worked });
    }
    // B-04 (b) on the phone: the Nikkei 225 future's Events are Japan's and the dollar's
    await go(p, MOCK, "#asset/NKD%3DF", "#in-first");
    await p.locator("#in-imp .mp-tog", { hasText: "All" }).tap(); await p.waitForTimeout(300);
    const nk = await p.evaluate(() => { const sec = [...document.querySelectorAll(".mp-sec")].find((x) => x.querySelector(":scope > h2 > span:first-child")?.textContent === "Events");
      return { aux: sec?.querySelector(":scope > h2 .aux, :scope > h2 > span:nth-child(2)")?.textContent ?? "", rows: [...document.querySelectorAll("#in-events .ev-row")].map((r) => ({ ccy: r.querySelector(".ev-t small").textContent, title: r.querySelector(".ev-n").childNodes[1]?.textContent ?? "" })), note: sec?.querySelector(".mp-note")?.textContent ?? "" }; });
    ck(`Nikkei 225 future (CME) on the phone: Events of "${nk.aux}", and Impact All lists Japan's (${NKD_JP.join(", ")}) beside the dollar's`, /JPY and USD/.test(nk.aux) && NKD_JP.every((t) => nk.rows.some((r) => r.ccy === "JPY" && r.title === t)) && nk.rows.some((r) => r.ccy === "USD") && /^JPY and USD events from five days back/.test(nk.note), nk);
    await p.evaluate(() => { location.hash = "asset/%5EN225"; }); await p.waitForTimeout(800);
    ck("^N225 on the phone: the Nikkei 225 on EQUITIES", (await p.evaluate(() => location.hash)) === "#equities/nk225");
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[the one-screen layout (1440x900, compact): the designer's two screens, switched by GO TO; text XL (1440x900: one column in reading order)]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, { size: "AUTO", compact: true, v: 2 });
    // each panel on the screen: where it is, how much of its body is left empty under its content (a list that ends
    // early shows its rows and its end), and whether its head is cut
    const screenOf = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll("#grid .panel")].map((x) => {
      const r = x.getBoundingClientRect(), pb = x.querySelector(":scope > .pbody"), br = pb.getBoundingClientRect(), pad = parseFloat(getComputedStyle(pb).paddingBottom) || 0;
      const inner = [...pb.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== "contents"), end = Math.max(br.top, ...inner.map((e) => Math.min(e.getBoundingClientRect().bottom, br.bottom)));
      const head = [x.querySelector(".phead .t"), x.querySelector(".phead .aux")].filter(Boolean), cut = head.filter((h) => h.scrollWidth > h.clientWidth + 1 || h.getBoundingClientRect().right > r.right + 0.5).map((h) => h.textContent);
      return [x.dataset.k, { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), empty: Math.round(br.bottom - pad - end), cut }];
    })));
    const chips = (p) => p.evaluate(() => [...document.querySelectorAll("#scrbar .chip-sm")].map((c) => ({ t: c.textContent, on: c.classList.contains("on"), screen: c.dataset.screen })));
    for (const [hash, name] of [["#asset/USDJPY%3DX", "USD/JPY"], ["#asset/%5ETNX", "UST 10Y yield"], ["#asset/%5ESTOXX50E", "Euro Stoxx 50"]]) {
      await go(p, MOCK, hash, "#in-key");
      const c = await chips(p), r = await screenOf(p);
      ck(`${name}: GO TO at the right of the strip (${c.map((x) => `${x.t}${x.on ? "*" : ""}`).join(" · ")}); the first screen holds the chart beside KEY DATA, PERFORMANCE under the chart and EVENTS under KEY DATA, and no NEWS`, c.map((x) => x.t).join() === "KEY DATA,PERFORMANCE,EVENTS,NEWS" && c.filter((x) => x.on).map((x) => x.t).join() === "KEY DATA,PERFORMANCE,EVENTS" && Object.keys(r).sort().join() === "in-chart,in-events,in-key,in-perf" && r["in-key"].l > r["in-chart"].r - 2 && Math.abs(r["in-key"].t - r["in-chart"].t) < 3 && r["in-perf"].t >= r["in-chart"].b - 2 && r["in-events"].t >= r["in-key"].b - 2 && Math.abs(r["in-perf"].b - r["in-events"].b) < 3 && Math.max(...Object.values(r).map((x) => x.b)) <= 900, { c, r });
      ck(`${name}: KEY DATA and PERFORMANCE take their own height, the chart the rest (empty under their content: KEY DATA ${r["in-key"].empty} px, PERFORMANCE ${r["in-perf"].empty} px; the list in EVENTS ends ${r["in-events"].empty} px above its foot); no head cut`, r["in-key"].empty <= 40 && r["in-perf"].empty <= 40 && Object.values(r).every((x) => x.cut.length === 0), r);
      await p.locator("#scrbar .chip-sm", { hasText: "NEWS" }).click(); await p.waitForTimeout(400);
      const c2 = await chips(p), r2 = await screenOf(p);
      ck(`${name}: GO TO › NEWS shows the second screen: NEWS across, its head whole ("${await p.locator('.panel[data-k="in-news"] .phead .aux').textContent()}"), NEWS lit`, Object.keys(r2).join() === "in-news" && c2.filter((x) => x.on).map((x) => x.t).join() === "NEWS" && r2["in-news"].cut.length === 0 && r2["in-news"].b <= 900 && r2["in-news"].r - r2["in-news"].l > 1300, { c2, r2 });
    }
    // and back: GO TO › KEY DATA brings the first screen again
    await p.locator("#scrbar .chip-sm", { hasText: "KEY DATA" }).click(); await p.waitForTimeout(400);
    ck("GO TO › KEY DATA brings the first screen back", Object.keys(await screenOf(p)).sort().join() === "in-chart,in-events,in-key,in-perf");
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, { size: "AUTO", compact: false, v: 2 });
    await go(p, MOCK, "#asset/USDJPY%3DX", "#in-key");
    ck("the scrolling layout has no GO TO and every panel on its one page", (await p.locator("#scrbar").count()) === 0 && (await p.locator("#grid .panel").count()) === 5);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, { size: "XL", compact: false, v: 2 });
    await go(p, MOCK, "#asset/%5ETNX", "#in-key");
    const r = await p.evaluate(() => [...document.querySelectorAll("#grid .panel")].map((x) => ({ no: x.dataset.no, t: x.getBoundingClientRect().top, w: x.getBoundingClientRect().width })).sort((a, b) => a.t - b.t));
    ck(`text XL: one column, the panels in their reading order (${r.map((x) => x.no).join(" ")}), each the page's width`, r.map((x) => x.no).join() === "01,02,03,04,05" && r.every((x) => Math.abs(x.w - r[0].w) < 2), r);
    ck("no page errors; nothing sideways", errs.length === 0 && (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, errs); await ctx.close(); }

  console.log("\n[one format (I-5) on the new pages: no day/month, dd-Mon-yy or ISO date and no signed zero, in the text or a tooltip; USD/JPY with its own three decimals]");
  { const BAD = { "a numeric day/month (11/19)": /(?<!FY)(?<![\w/])\d{1,2}\/\d{1,2}(?![\d/])/g, "a dd-Mon-yy date": /\b\d{2}-[A-Z][a-z]{2}-\d{2}\b/g, "an ISO date (2026-11-19)": /\b\d{4}-\d{2}-\d{2}\b/g, "a signed zero (−0.0, +0.0)": /[-−+]0(?:\.0+)?(?![\d.])(?:%|bp|σ)?/g };
    const scan = (p) => p.evaluate((bad) => { const all = `${document.body.innerText}\n${[...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title")).join("\n")}`, out = {};
      for (const [k, src] of Object.entries(bad)) { const hits = [...all.matchAll(new RegExp(src, "g"))].map((m) => all.slice(Math.max(0, m.index - 30), m.index + m[0].length + 12).replace(/\s+/g, " ")); if (hits.length) out[k] = hits.slice(0, 4); } return out; }, Object.fromEntries(Object.entries(BAD).map(([k, re]) => [k, re.source])));
    for (const dev of ["desk", "iPhone 13"]) {
      const { ctx, p, errs } = await page(b, dev === "desk" ? { viewport: { width: 1440, height: 900 } } : { ...devices[dev] }, { size: "AUTO", compact: false, v: 2 });
      const found = {};
      for (const pg of PAGES) { await go(p, MOCK, pg.hash, dev === "desk" ? "#in-key" : "#in-first"); const s = await scan(p); if (Object.keys(s).length) found[pg.name] = s; }
      await go(p, MOCK, "#asset/USDJPY%3DX", dev === "desk" ? "#in-key" : "#in-first");
      const lv = await p.evaluate((desk) => desk ? [document.querySelector("#in-last").textContent, ...[...document.querySelectorAll('#in-perf tr[data-r="then"] td.num')].map((x) => x.textContent), document.querySelector("#in-key tr:nth-child(2) td.num").textContent] : [...document.querySelectorAll("#in-perf tbody tr td:nth-child(2)")].map((x) => x.textContent), dev === "desk");
      ck(`${dev === "desk" ? "computer" : dev}: none on the five pages; USD/JPY's levels all with three decimals (${lv.slice(0, 3).join(", ")} …)`, Object.keys(found).length === 0 && lv.length >= 6 && lv.every((t) => /^\d{3}\.\d{3}$/.test(t)) && errs.length === 0, { found, lv, errs });
      await ctx.close();
    }
  }

  console.log("\n[a server from before 20 Nov 2026: a stock's answer for every name, and no quote for JGB 10Y]");
  { const old = { symbol: "USDJPY=X", name: "USD/JPY", exchange: "CCY", currency: "JPY", quoteType: "CURRENCY", sector: null, industry: null, indices: [], price: 158.4, prevClose: 158.0, pct: 0.25, asOf: new Date().toISOString(), open: 158.1, high: 158.6, low: 157.9, volume: 0, mcap: null, benchmarks: [], perf: [{ h: "1D", from: null, base: 158, stock: 0.25, bench: [], rel: [] }], range: { hi: 162, hiDate: "2026-07-01", lo: 140, loDate: "2026-02-01", fromHi: -2.2, fromLo: 13.1, pos: 84 }, vol: { m1: 9, m3: 8.9, m12: 7.8 }, beta: [], drawdown: { pct: -11.7, from: "2026-07-01", to: "2026-11-18" }, turnover: { d20: { shares: null, value: null }, d60: { shares: null, value: null } }, shares: { outstanding: null, diluted: null, dilutedNote: null, treasury: null, float: null, asOf: null, source: null }, short: null, moves: { eligible: false, rule: "classic", rows: [] }, earningsAt: null, earningsEst: null, val: { pe: null, peGuide: null, pb: null, yield: null, yieldGuide: null, basis: null }, fin: null, finNote: "Statements are available for equities only." };
    for (const dev of ["desk", "iPhone 13"]) {
      const { ctx, p, errs } = await page(b, dev === "desk" ? { viewport: { width: 1440, height: 900 } } : { ...devices[dev] });
      await routes(p);
      await p.route("**/fakeapi?*", (r) => { const q = new URL(r.request().url()).searchParams, a = q.get("action"), h = { "access-control-allow-origin": "*" };
        if (a === "stock" && q.get("symbol") === "USDJPY=X") return r.fulfill({ status: 200, contentType: "application/json", headers: h, body: JSON.stringify(old) });
        if (a === "stock") return r.fulfill({ status: 500, contentType: "application/json", headers: h, body: JSON.stringify({ error: `no quote for ${q.get("symbol")}` }) });
        return r.fallback(); });
      await go(p, STANDIN, "#asset/USDJPY%3DX", dev === "desk" ? "#st-key" : "#st-key");
      const s1 = await p.evaluate(() => ({ stock: !!document.querySelector("#st-key"), instr: !!document.querySelector("#in-key, #in-first") }));
      await p.evaluate(() => { location.hash = "asset/JGB10Y"; }); await p.waitForTimeout(1200);
      const s2 = await p.evaluate(() => document.body.innerText.includes("no quote for JGB10Y"));
      ck(`${dev === "desk" ? "computer" : dev}: a stock's answer draws the page as before (no instrument layout, nothing broken); "no quote for JGB10Y" says so; no page errors`, s1.stock && !s1.instr && s2 && errs.length === 0, { s1, s2, errs }); await ctx.close();
    }
  }

  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
