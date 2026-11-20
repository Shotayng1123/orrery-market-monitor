// A stock's page, increment I-3 (20 Nov 2026), part one: NEWS, the documents behind the statements' columns, and the
// page's layout. The figures are the mock feed's; the headlines and alerts are the stand-in rows (web/src/lib/standin.json).
//   - NEWS (A-05's headlines and alerts): #asset/7203.T and #asset/NVDA list the stand-in headlines and alerts that
//     name them, newest first, fifteen at a time with "SHOW n MORE" and no box that scrolls inside the page; All,
//     Headlines and Alerts; a name with none says so. On a computer and on a phone.
//   - FINANCIALS (A-01 with A's rules): a column's header opens the document the source gave for it (a year's
//     有価証券報告書, the guidance's or a quarter's 決算短信 PDF), in teal; a header without an address is plain and says
//     so. 7203.T is as EDINET DB gave Toyota's on 20 Nov 2026: no address for the newest quarter nor the guidance.
//     Another Tokyo name has them, so the newest quarter's header opening its 決算短信 is seen too. On both layouts.
//   - Japan's profile rows in KEY DATA (A-27, shown now): fiscal year end, standard, the annual report.
//   - The two-column page (the designer's §4.6): no empty block over 40 px between the panels of a column at 1440×900
//     and at text XL, where the page is one column in reading order; the one-screen layout by kind.
//   - A server from before NEWS (no `feed` in its answer): no NEWS panel, nothing breaks.
// Nothing here depends on the time of day: the stand-in rows are counted from when the suite starts, and every
// expectation is worked out from the same rows with the same rule as the mock (web/src/lib/mock.ts, stockFeed).
// Run from web/:  node e2e/run.cjs stock-news-links   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { S } = require("./standin.cjs");
const { routes } = require("./harness.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 1500)}`); };
const PREFS = (size, compact) => ({ size, compact, v: 2 });
async function page(b, opts, prefs) {
  const ctx = await b.newContext(opts);
  await ctx.addInitScript((pr) => { try { if (pr) localStorage.setItem("om_prefs", JSON.stringify(pr)); } catch {} }, prefs || null);
  // the stand-in documents and headlines are on example.org and example.com: a page opened there gets a stand-in page
  await ctx.route(/^https?:\/\/(www\.)?example\.(org|com)\//, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>stand-in</title>stand-in document" }));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs };
}
const go = async (p, hash, sel) => { await p.goto(MOCK + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel); await p.evaluate(() => document.fonts.ready); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(400); };
const decode = (t) => t.replace(/&amp;/g, "&");
// what the mock's `stock` answer carries as `feed` for a symbol: the same rows, the same rule (lib/mock.ts stockFeed)
// and the page's order (lib/stock.ts feedRows: newest first, then by key)
function expected(sym) {
  const t = (x) => Date.parse(x);
  const news = [...S.news.map((n) => ({ ...n })), ...S.watch.feed.news.map((n) => ({ ...n, id: n.id + 1000 }))].filter((n) => n.tickers.some((x) => x.s === sym)).sort((a, b) => t(b.publishedAt) - t(a.publishedAt)).slice(0, 60);
  const alerts = [...S.watch.feed.alerts.map((a) => ({ ...a, id: a.id + 1000 })), ...S.alerts.filter((a) => a.kind === "stock" || a.kind === "index")].filter((a) => a.symbol === sym).sort((a, b) => t(b.at) - t(a.at)).slice(0, 40);
  const rows = [...news.map((n) => ({ key: `h${n.id}`, at: n.publishedAt, kind: "headline", title: decode(n.title), url: n.url })), ...alerts.map((a) => ({ key: `a${a.id}`, at: a.at, kind: "alert", title: a.msg, url: a.url }))];
  return rows.sort((x, y) => t(y.at) - t(x.at) || x.key.localeCompare(y.key));
}
// the NEWS rows on screen: computer panel or phone section
const newsRows = (p, phone) => p.evaluate((phone) => [...document.querySelectorAll(phone ? "#st-news .nw-row" : "#st-news .snrow")].map((r) => ({ kind: r.dataset.kind, meta: (phone ? r.querySelector(".nw-meta") : r.querySelector(".snm")).innerText.replace(/\s+/g, " ").trim(), title: (phone ? r.querySelector(".nw-title") : r.querySelector(".snt")).textContent, href: phone ? (r.tagName === "A" ? r.href : null) : r.querySelector(".snt a")?.href ?? null, tagCol: getComputedStyle(r.querySelector(".snk")).color })), phone);
const noInnerBox = (p, sel) => p.evaluate((sel) => { const el = document.querySelector(sel); return el ? [...el.querySelectorAll("*")].filter((e) => e.scrollHeight > e.clientHeight + 1 && ["auto", "scroll", "hidden"].includes(getComputedStyle(e).overflowY)).map((e) => e.className) : ["missing"]; }, sel);
const AMBER = "rgb(255, 111, 97)", TXT2 = "rgb(198, 194, 183)", CYAN = "rgb(31, 209, 193)";
// the statements' headers: label, the link's address, its tip, its colour, the header's own tip and its height
const heads = (p) => p.evaluate(() => [...document.querySelectorAll("table.fin thead th:not(.l)")].map((th) => { const a = th.querySelector("a"); return { label: th.textContent, href: a ? a.getAttribute("href") : null, target: a?.target ?? null, rel: a?.rel ?? null, tip: a?.title ?? null, col: a ? getComputedStyle(a).color : null, thTip: th.title, h: Math.round(th.getBoundingClientRect().height) }; }));

(async () => { const b = await chromium.launch();
  const t7203 = expected("7203.T"), tNvda = expected("NVDA");
  console.log(`\n[NEWS on a computer, 1440x900: the stand-in rows naming 7203.T (${t7203.length}) and NVDA (${tNvda.length})]`);
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, PREFS("AUTO", false));
    await go(p, "#asset/7203.T", "#st-news .snrow");
    const head = await p.evaluate(() => { const pn = document.querySelector('.panel[data-k="st-news"]'); return { title: pn.querySelector(".phead .t").textContent, aux: pn.querySelector(".phead .aux").textContent, chips: [...pn.querySelectorAll("#st-news-f .chip-sm")].map((c) => `${c.textContent}${c.classList.contains("on") ? "*" : ""}`) }; });
    ck(`the panel: NEWS, "${head.aux}", chips ${head.chips.join(" · ")}`, head.title === "NEWS" && head.aux === "headlines and alerts naming 7203.T · 90 days · times in SGT" && head.chips.join() === "ALL*,HEADLINES,ALERTS", head);
    let rows = await newsRows(p, false);
    ck(`fifteen rows to start, newest first, the stand-in headlines and alerts that name 7203.T in their order (${t7203.length} in all)`, t7203.length > 15 && rows.length === 15 && rows.map((r) => r.title).join("|") === t7203.slice(0, 15).map((r) => r.title).join("|"), { rows: rows.map((r) => r.title), want: t7203.slice(0, 15).map((r) => r.title) });
    ck("each row: the time in SGT, HEADLINE or ALERT, where it came from; then the headline or the alert", rows.every((r) => /^\d{1,2} [A-Z][a-z]{2} \d\d:\d\d · (HEADLINE|ALERT) · \S.+$/.test(r.meta) && r.meta.includes(r.kind === "alert" ? "ALERT" : "HEADLINE")) && rows.some((r) => r.kind === "alert") && rows.some((r) => r.kind === "headline"), rows.map((r) => r.meta));
    ck("HEADLINE in the muted text colour, ALERT in the coral of titles (the designer's note); an alert from a headline names its kind and publisher, a move its exchange", rows.every((r) => r.tagCol === (r.kind === "alert" ? AMBER : TXT2)) && rows.some((r) => / · ALERT · buyback, Nikkei Asia$/.test(r.meta)) && rows.some((r) => / · ALERT · move, TSE$/.test(r.meta)), rows.map((r) => [r.meta, r.tagCol]));
    ck("a headline opens the publisher's page; a move alert, which has no page, is plain text", rows.filter((r) => r.kind === "headline").every((r, i) => r.href === t7203.filter((x) => x.kind === "headline")[i].url) && rows.filter((r) => r.kind === "alert" && /move,/.test(r.meta)).every((r) => r.href === null), rows.map((r) => [r.kind, r.href]));
    const more = await p.evaluate(() => document.querySelector("#st-news-more")?.innerText.replace(/\s+/g, " ").trim() ?? null);
    ck(`under them "${more}", and no box in the panel that scrolls inside the page`, more === `SHOW ${Math.min(15, t7203.length - 15)} MORE 15 of ${t7203.length}` && (await noInnerBox(p, '.panel[data-k="st-news"]')).length === 0, more);
    await p.locator("#st-news-more .chip-sm").click(); await p.waitForTimeout(250); rows = await newsRows(p, false);
    ck(`SHOW MORE: all ${t7203.length}, in order, and the chip is gone; still nothing scrolls inside the panel`, rows.length === t7203.length && rows.map((r) => r.title).join("|") === t7203.map((r) => r.title).join("|") && (await p.locator("#st-news-more").count()) === 0 && (await noInnerBox(p, '.panel[data-k="st-news"]')).length === 0, rows.length);
    await p.locator("#st-news-f .chip-sm", { hasText: "HEADLINES" }).click(); await p.waitForTimeout(200); rows = await newsRows(p, false);
    const nh = t7203.filter((r) => r.kind === "headline");
    ck(`HEADLINES: only the headlines (${Math.min(15, nh.length)} of ${nh.length} shown), from fifteen again`, rows.every((r) => r.kind === "headline") && rows.length === Math.min(15, nh.length) && rows[0].title === nh[0].title, rows.length);
    await p.locator("#st-news-f .chip-sm", { hasText: "ALERTS" }).click(); await p.waitForTimeout(200); rows = await newsRows(p, false);
    const na = t7203.filter((r) => r.kind === "alert");
    ck(`ALERTS: only the alerts (${na.length}), newest first`, rows.length === Math.min(15, na.length) && rows.every((r) => r.kind === "alert") && rows.map((r) => r.title).join("|") === na.slice(0, 15).map((r) => r.title).join("|"), rows.map((r) => r.title));
    await go(p, "#asset/NVDA", "#st-news .snrow"); rows = await newsRows(p, false);
    ck(`NVDA: its own rows, fifteen of ${tNvda.length}, in order`, rows.length === 15 && rows.map((r) => r.title).join("|") === tNvda.slice(0, 15).map((r) => r.title).join("|") && (await p.locator("#st-news-more").count()) === 1, rows.map((r) => r.title).slice(0, 3));
    await go(p, "#asset/9999.T", '.panel[data-k="st-news"]');
    const empty = await p.evaluate(() => document.querySelector('.panel[data-k="st-news"] .empty')?.textContent ?? null);
    ck(`a name that no headline or alert names says so: "${empty}"`, empty === "No headlines or alerts name 9999.T in the last 90 days.", empty);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[NEWS on a phone (iPhone 13)]");
  { const { ctx, p, errs } = await page(b, { ...devices["iPhone 13"] });
    await go(p, "#asset/7203.T", "#st-news .nw-row");
    const secs = await p.evaluate(() => [...document.querySelectorAll(".mp-sec > h2 > span:first-child")].map((e) => e.textContent));
    ck(`the section "News" comes after Performance (${secs.join(", ")})`, secs.join("|") === "Key data|Performance|News|Big moves|Short interest|Financials", secs);
    const togs = await p.evaluate(() => [...document.querySelectorAll("#st-news-f .mp-tog")].map((e) => ({ t: e.textContent, on: e.classList.contains("on"), reach: Math.round(parseFloat(getComputedStyle(e, "::before").top) * -1 + e.getBoundingClientRect().height + parseFloat(getComputedStyle(e, "::before").bottom) * -1) })));
    ck(`All, Headlines, Alerts as the phone's toggles, each ${togs.map((x) => x.reach).join("/")} px to the finger`, togs.map((x) => `${x.t}${x.on ? "*" : ""}`).join() === "All*,Headlines,Alerts" && togs.every((x) => x.reach >= 44), togs);
    let rows = await newsRows(p, true);
    ck("fifteen rows in the phone's grammar, the same rows in the same order as on the computer", rows.length === 15 && rows.map((r) => r.title).join("|") === t7203.slice(0, 15).map((r) => r.title).join("|") && rows.every((r) => /^\d{1,2} [A-Z][a-z]{2} \d\d:\d\d (HEADLINE|ALERT) \S/.test(r.meta)), rows.map((r) => r.meta).slice(0, 3));
    const more = await p.locator("#st-news-more").textContent();
    await p.locator("#st-news-more").tap(); await p.waitForTimeout(250); rows = await newsRows(p, true);
    ck(`"${more}" shows the rest; nothing scrolls inside the section`, more === `Show ${Math.min(15, t7203.length - 15)} more of ${t7203.length}` && rows.length === t7203.length && (await noInnerBox(p, "#st-news")).length === 0, { more, n: rows.length });
    await p.locator("#st-news-f .mp-tog", { hasText: "Alerts" }).tap(); await p.waitForTimeout(200); rows = await newsRows(p, true);
    ck("Alerts: only the alerts", rows.length === Math.min(15, t7203.filter((r) => r.kind === "alert").length) && rows.every((r) => r.kind === "alert"), rows.length);
    const jump = await p.evaluate(() => [...document.querySelectorAll('.mp-picks select[aria-label="Go to"] option')].map((o) => o.value));
    ck("GO TO lists News", jump.includes("News"), jump);
    const ox = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ck("nothing sideways; no page errors", ox <= 0 && errs.length === 0, { ox, errs }); await ctx.close(); }

  console.log("\n[FINANCIALS: each column's header opens the document behind it, where the source gave its address]");
  for (const [dev, opts] of [["computer 1440x900", { viewport: { width: 1440, height: 900 } }], ["iPhone 13", { ...devices["iPhone 13"] }]]) {
    const phone = dev !== "computer 1440x900";
    const { ctx, p, errs } = await page(b, opts, phone ? null : PREFS("AUTO", false));
    await go(p, "#asset/7203.T", "table.fin");
    let h = await heads(p);
    const fy = h.filter((x) => /^FY3\/\d\d$/.test(x.label)), fc = h.find((x) => x.label === "FY3/27E");
    ck(`${dev} · 7203.T by year: every year from the 有価証券報告書 is a link, in teal, to its filing (a new tab), its tip naming the document`, fy.length === 10 && fy.every((x) => /^https:\/\/example\.org\/mock-edinet\/S100MK\d\d$/.test(x.href) && x.target === "_blank" && /noreferrer/.test(x.rel) && x.col === CYAN && /^Open the 有価証券報告書 for FY3\/\d\d on example\.org \(document S100MK\d\d, filed \d{1,2} Jun 20\d\d\) ↗$/.test(x.tip)), fy.map((x) => [x.label, x.href, x.tip, x.col]));
    ck(`${dev} · the guidance column, whose 決算短信 has no address from the source (as Toyota's newest on 20 Nov 2026), is plain text and says so`, !!fc && fc.href === null && /no document address from the source$/.test(fc.thTip), fc);
    if (phone) ck(`iPhone 13 · a header takes a ${Math.min(...h.map((x) => x.h))}-px tap`, h.every((x) => x.h >= 44), h.map((x) => x.h));
    const want = fy.find((x) => x.label === "FY3/26");
    const th = p.locator("table.fin thead th", { hasText: /^FY3\/26$/ });
    const [pop] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }), phone ? th.tap() : th.click()]);
    await pop.waitForLoadState("domcontentloaded").catch(() => undefined);
    ck(`${dev} · ${phone ? "a tap on" : "a click on"} FY3/26 opens its 有価証券報告書 (${pop.url()})`, pop.url() === want.href, { got: pop.url(), want: want.href }); await pop.close();
    // by quarter: the 決算短信 of each quarter where the stored rows give its address
    if (phone) await p.locator("#st-view").selectOption("quarterly"); else await p.locator("#st-view .chip-sm").nth(1).click();
    await p.waitForTimeout(400); h = await heads(p);
    const q = Object.fromEntries(h.map((x) => [x.label, x]));
    ck(`${dev} · 7203.T by quarter: the newest (2Q 3/27) and 2Q and 1Q 3/26 have no address (as EDINET DB gave Toyota's) and say so; 1Q 3/27 opens its 決算短信, with the day it was disclosed`, h.length === 12 && ["2Q 3/27", "2Q 3/26", "1Q 3/26"].every((k) => q[k] && q[k].href === null && /no document address from the source$/.test(q[k].thTip)) && q["1Q 3/27"].href === "https://example.com/mock-ir/7203T/2027_1q_summary.pdf" && q["1Q 3/27"].tip === "Open the 決算短信 PDF for 1Q 3/27, disclosed 4 Aug 2026 ↗" && q["4Q 3/26"].tip === "Open the 決算短信 PDF for 4Q 3/26, disclosed 8 May 2026 ↗", h.map((x) => [x.label, x.href, x.tip]));
    const q1 = p.locator("table.fin thead th", { hasText: /^1Q 3\/27$/ });
    const [pq] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }), phone ? q1.tap() : q1.click()]);
    ck(`${dev} · 1Q 3/27 opens that quarter's 決算短信 PDF`, pq.url() === "https://example.com/mock-ir/7203T/2027_1q_summary.pdf", pq.url()); await pq.close();
    // another Tokyo name whose newest 決算短信 does carry its address: its newest quarter and its guidance open it (A's added line)
    await go(p, "#asset/6758.T", "table.fin");
    if (phone) await p.locator("#st-view").selectOption("quarterly"); else await p.locator("#st-view .chip-sm").nth(1).click();
    await p.waitForTimeout(400); h = await heads(p);
    const newest = h[h.length - 1];
    ck(`${dev} · 6758.T by quarter: the newest quarter's header (${newest.label}) opens that quarter's 決算短信 PDF`, newest.label === "2Q 3/27" && newest.href === "https://example.com/mock-ir/6758T/2027_2q_summary.pdf" && newest.tip === "Open the 決算短信 PDF for 2Q 3/27, disclosed 5 Nov 2026 ↗", newest);
    const nq = p.locator("table.fin thead th", { hasText: /^2Q 3\/27$/ });
    const [pn] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }), phone ? nq.tap() : nq.click()]);
    ck(`${dev} · ${phone ? "tapping" : "clicking"} it opens the PDF`, pn.url() === newest.href, pn.url()); await pn.close();
    if (phone) await p.locator("#st-view").selectOption("annual"); else await p.locator("#st-view .chip-sm").nth(0).click();
    await p.waitForTimeout(300); h = await heads(p);
    const g = h.find((x) => x.label === "FY3/27E");
    ck(`${dev} · 6758.T's guidance column opens the 決算短信 PDF of its figures ("${g?.tip}")`, !!g && g.href === "https://example.com/mock-ir/6758T/2027_2q_summary.pdf" && g.tip === "Open the 決算短信 PDF, disclosed 5 Nov 2026 ↗" && g.col === CYAN, g);
    await go(p, "#asset/NVDA", "table.fin"); h = await heads(p);
    ck(`${dev} · NVDA (Yahoo, which gives no document): no header is a link, and each says so`, h.length >= 4 && h.every((x) => x.href === null && /no document address from the source$/.test(x.thTip)), h.map((x) => [x.label, x.thTip]));
    ck(`${dev} · no page errors`, errs.length === 0, errs); await ctx.close(); }

  console.log("\n[KEY DATA: a Tokyo company's fiscal year end, accounting standard and annual report (A-27, shown now)]");
  for (const [dev, opts] of [["computer", { viewport: { width: 1440, height: 900 } }], ["iPhone 13", { ...devices["iPhone 13"] }]]) {
    const { ctx, p, errs } = await page(b, opts, dev === "computer" ? PREFS("AUTO", false) : null);
    await go(p, "#asset/7203.T", "#st-key");
    const kv = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("#st-key tr")].map((tr) => [tr.cells[0].childNodes[0].textContent, { v: tr.cells[1].textContent, a: tr.cells[1].querySelector("a")?.getAttribute("href") ?? null }])));
    ck(`${dev} · 7203.T: "${kv["Fiscal year end · standard"]?.v}" and "${kv["Annual report"]?.v}", a link to that 有価証券報告書`, kv["Fiscal year end · standard"]?.v === "March · Japanese GAAP" && kv["Annual report"]?.v === "有報 FY3/26 ↗" && kv["Annual report"].a === "https://example.org/mock-edinet/S100MK26", kv);
    await go(p, "#asset/NVDA", "#st-key");
    const us = await p.evaluate(() => [...document.querySelectorAll("#st-key tr")].map((tr) => tr.cells[0].childNodes[0].textContent));
    ck(`${dev} · NVDA (no EDINET DB statements): no such rows`, !us.includes("Fiscal year end · standard") && !us.includes("Annual report"), us);
    ck(`${dev} · no page errors`, errs.length === 0, errs); await ctx.close(); }

  console.log("\n[the two-column page: 1440x900 and 1280x720; one column at text XL]");
  for (const [code, opts, prefs] of [["C1 1440x900", { viewport: { width: 1440, height: 900 } }, PREFS("AUTO", false)], ["C2 1280x720", { viewport: { width: 1280, height: 720 } }, PREFS("AUTO", false)], ["C3 1440x900 XL", { viewport: { width: 1440, height: 900 } }, PREFS("XL", false)]]) {
    const { ctx, p, errs } = await page(b, opts, prefs);
    for (const sym of ["7203.T", "NVDA"]) {
      await go(p, "#asset/" + sym, "table.fin");
      const L = await p.evaluate(() => [...document.querySelectorAll("#grid .panel")].map((x) => { const r = x.getBoundingClientRect(); return { no: x.dataset.no, k: x.dataset.k, l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top + scrollY), bt: Math.round(r.bottom + scrollY) }; }));
      const cols = new Map(); for (const x of L.filter((x) => x.k !== "st-fin")) cols.set(x.l, [...(cols.get(x.l) ?? []), x]);
      const gaps = [...cols.values()].flatMap((c) => c.sort((a, z) => a.t - z.t).slice(1).map((x, i) => x.t - c[i].bt));
      const order = [...L].sort((a, z) => a.t - z.t || a.l - z.l).map((x) => x.k), nos = L.map((x) => x.no).sort().join();
      if (code.startsWith("C3")) ck(`${code} · ${sym}: one column in reading order (${L.map((x) => x.no).join(" ")}: ${order.join(", ")}), each across the page, ${Math.max(...gaps)} px at most between two panels`, cols.size === 1 && order.join() === "st-chart,st-key,st-perf,st-news,st-moves,st-short,st-fin" && nos === "01,02,03,04,05,06,07" && L.every((x) => x.l === L[0].l && x.r === L[0].r) && gaps.every((g) => g >= 0 && g <= 40), { L, gaps });
      else { const left = [...cols.entries()].sort((a, z) => a[0] - z[0]), lk = left[0][1].map((x) => x.k).join(), rk = left[1]?.[1].map((x) => x.k).join(), fin = L.find((x) => x.k === "st-fin");
        ck(`${code} · ${sym}: the chart, PERFORMANCE and BIG MOVES on the left, KEY DATA, NEWS and SHORT INTEREST on the right, numbered row by row (${L.map((x) => `${x.no} ${x.k}`).join(", ")}); FINANCIALS across under both; ${Math.max(...gaps)} px at most between two panels of a column`, cols.size === 2 && lk === "st-chart,st-perf,st-moves" && rk === "st-key,st-news,st-short" && nos === "01,02,03,04,05,06,07" && L.find((x) => x.k === "st-news").no === "04" && L.find((x) => x.k === "st-moves").no === "05" && gaps.every((g) => g >= 0 && g <= 40) && fin.t > Math.max(...L.filter((x) => x.k !== "st-fin").map((x) => x.bt)) && fin.l === left[0][0] && fin.r === Math.max(...L.map((x) => x.r)), { L, gaps }); }
    }
    ck(`${code} · nothing wider than the window; no page errors`, (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0 && errs.length === 0, errs); await ctx.close(); }

  console.log("\n[the one-screen layout (COMPACT, 1440x900): placed by kind, on one screen]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, PREFS("AUTO", true));
    await go(p, "#asset/7203.T", '.panel[data-k="st-news"]');
    const R = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("#grid .panel")].map((x) => { const r = x.getBoundingClientRect(); return [x.dataset.k, { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }]; })));
    const over = Object.entries(R).flatMap(([k, a]) => Object.entries(R).filter(([j, c]) => j > k && a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1).map(([j]) => `${k}/${j}`));
    const page1 = await p.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: innerHeight }));
    ck("the chart beside KEY DATA, PERFORMANCE beside NEWS, BIG MOVES beside SHORT INTEREST, FINANCIALS across the foot; nothing overlaps, all on one screen", R["st-chart"].r < R["st-key"].l && R["st-perf"].r < R["st-news"].l && Math.abs(R["st-perf"].t - R["st-news"].t) <= 1 && R["st-moves"].r < R["st-short"].l && Math.abs(R["st-moves"].t - R["st-short"].t) <= 1 && R["st-moves"].t > R["st-perf"].b && R["st-fin"].t > R["st-moves"].b && over.length === 0 && Object.values(R).every((x) => x.b <= page1.vh + 1) && page1.h <= page1.vh + 1, { R, over, page1 });
    const cut = await p.evaluate(() => [...document.querySelectorAll('#grid .panel[data-k="st-perf"] td.l, #grid .panel[data-k="st-short"] td.l')].filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent));
    ck("in it, the labels of PERFORMANCE and SHORT INTEREST wrap rather than lose their end (\"Against Nikkei 225, pp\", a report's date)", cut.length === 0, cut);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[a server from before NEWS (its answer has no `feed`): no NEWS panel, nothing breaks]");
  { // the mock's own answer for 7203.T, without `feed`, sent by a stand-in server
    const m = await page(b, { viewport: { width: 1440, height: 900 } });
    await m.p.goto(MOCK, { waitUntil: "networkidle" });
    const answer = await m.p.evaluate(async () => { const mod = await import("/orrery-market-monitor/src/lib/mock.ts"); const a = mod.mockAction("stock", { symbol: "7203.T" }); delete a.feed; return a; });
    await m.ctx.close();
    for (const [dev, opts] of [["computer", { viewport: { width: 1440, height: 900 } }], ["iPhone 13", { ...devices["iPhone 13"] }]]) {
      const ctx = await b.newContext(opts); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      await routes(p);
      await p.route("**/fakeapi?*", (r) => { const a = new URL(r.request().url()).searchParams.get("action"); if (a === "stock") return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(answer) }); return r.fallback(); });
      await p.goto(STANDIN + "#asset/7203.T", { waitUntil: "networkidle" }); await p.waitForSelector("table.fin"); await p.waitForTimeout(500);
      const v = await p.evaluate(() => ({ panels: [...document.querySelectorAll("#grid .panel")].map((x) => `${x.dataset.no} ${x.dataset.k}`).sort(), secs: [...document.querySelectorAll(".mp-sec > h2 > span:first-child")].map((e) => e.textContent), news: document.querySelectorAll("#st-news").length }));
      ck(`${dev}: the page without NEWS (${dev === "computer" ? v.panels.join(", ") : v.secs.join(", ")}), no errors`, v.news === 0 && (dev === "computer" ? v.panels.join() === "01 st-chart,02 st-key,03 st-perf,04 st-short,05 st-moves,06 st-fin" : v.secs.join() === "Key data,Performance,Big moves,Short interest,Financials") && errs.length === 0, { v, errs });
      await ctx.close(); } }

  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
