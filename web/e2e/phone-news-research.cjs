// The phone layout: NEWS and RESEARCH.
// Run from web/:  node e2e/run.cjs phone-news-research   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright"); const { routes } = require("./harness.cjs");
const LIVE = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const pick = (p, label) => p.locator(".pick", { has: p.locator(`.lbl:text-is("${label}")`) });
const sizes = (p) => p.evaluate(() => { const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const fs = []; const w = document.createTreeWalker(document.querySelector(".mp"), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.textContent.trim() && vis(n.parentElement)) fs.push(parseFloat(getComputedStyle(n.parentElement).fontSize)); } return { minFont: Math.min(...fs), overflowX: document.documentElement.scrollWidth - innerWidth }; });
(async () => { const b = await chromium.launch();
  for (const dev of ["iPhone 13", "Pixel 7"]) {
    const ctx = await b.newContext({ ...devices[dev] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); await routes(p);
    console.log(`\n[NEWS, ${dev}]`);
    await p.goto(LIVE + "?phone=new#news", { waitUntil: "networkidle" }); await p.waitForSelector(".ev-row"); await p.waitForTimeout(800);
    const c = await p.evaluate(() => { const box = document.querySelector(".mp-scroll"), br = box.getBoundingClientRect(), rows = [...box.querySelectorAll(".ev-row")], rh = rows[0].getBoundingClientRect().height, lh = box.querySelector(".ev-day").getBoundingClientRect().height;
      const inView = (r) => { const x = r.getBoundingClientRect(); return x.top >= br.top - 0.5 && x.bottom <= br.bottom + 0.5; }; const next = box.querySelector(".next");
      return { total: rows.length, boxH: Math.round(br.height), want: Math.round(lh + 10 * rh), whole: rows.filter(inView).length, labels: [...box.querySelectorAll(".ev-day")].filter(inView).length, scrollable: box.scrollHeight > box.clientHeight + 2, nextInView: !!next && inView(next), pastAbove: rows.filter((r) => r.classList.contains("past") && inView(r)).length, impacts: [...new Set([...box.querySelectorAll(".imp")].map((i) => i.className))], rowH: Math.round(rh) }; });
    ck(`calendar: high-impact only, ${c.total} events; a box of ten lines plus a date (${c.boxH}px) that scrolls inside`, c.impacts.join() === "imp h" && Math.abs(c.boxH - c.want) <= 2 && c.scrollable, c);
    ck(`opens at the next event with ${c.pastAbove} earlier result(s) above it; ${c.whole} whole events and ${c.labels} date line(s) in view`, c.nextInView && c.pastAbove >= 1 && c.whole + Math.max(0, c.labels - 1) === 10, c);
    await pick(p, "Impact").locator("select").selectOption("all"); await p.waitForTimeout(400); const nAll = await p.locator(".ev-row").count();
    await pick(p, "Countries").locator("select").selectOption("all"); await p.waitForTimeout(300);
    ck(`Impact -> All lists more events (${c.total} -> ${nAll}) and still opens at the next one`, nAll > c.total && await p.evaluate(() => { const box = document.querySelector(".mp-scroll"), n = box.querySelector(".next").getBoundingClientRect(), b = box.getBoundingClientRect(); return n.top >= b.top - 1 && n.bottom <= b.bottom + 1; }));
    await pick(p, "Type").locator("select").selectOption("earnings"); await p.waitForSelector(".ev-row.tap"); await p.waitForTimeout(500);
    const e = await p.evaluate(() => { const box = document.querySelector(".mp-scroll"); return { title: document.querySelector(".mp-sec h2 span").textContent, rows: box.querySelectorAll(".ev-row").length, scrollable: box.scrollHeight > box.clientHeight + 2, picks: [...document.querySelectorAll(".mp-picks .lbl")].map((x) => x.textContent) }; });
    ck("Type -> Earnings: company lines, Region and Market cap pickers, same scrolling box", e.title === "Earnings calendar" && e.rows > 10 && e.scrollable && e.picks.join() === "Type,Region,Market cap", e);
    await pick(p, "Region").locator("select").selectOption("Japan"); await p.waitForTimeout(300); ck("Region -> Japan narrows the list", (await p.locator(".ev-row").count()) < e.rows);
    await p.locator(".ev-row.tap").first().tap(); await p.waitForTimeout(500); ck("tap a company: its page opens", p.url().includes("#asset/"), p.url());
    // (the stand-in data has no stock-page payload, so come back to NEWS with a fresh load)
    await p.goto(LIVE + "#news"); await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector(".mp-head"); await p.waitForTimeout(600);
    const h = await p.evaluate(() => ({ rows: document.querySelectorAll(".nw-row").length, more: document.querySelector(".mp-sec:last-of-type .mp-more")?.textContent, entity: [...document.querySelectorAll(".nw-title")].some((t) => /&#x/.test(t.textContent)) }));
    ck(`headlines: thirty to start (${h.rows}), a button for more, no stray HTML entities`, h.rows === 30 && /Show 30 more of 70/.test(h.more ?? "") && !h.entity, h);
    await p.locator(".mp-sec:last-of-type .mp-more").tap(); await p.waitForTimeout(300); ck("Show more: sixty", (await p.locator(".nw-row").count()) === 60);
    await pick(p, "Category").locator("select").selectOption("Currency"); await p.waitForTimeout(600);
    const cats = await p.evaluate(() => ({ n: document.querySelectorAll(".nw-row").length, tags: document.querySelectorAll(".nw-cat").length })); ck(`Category -> Currency: ${cats.n} headlines of that category`, cats.n > 0 && cats.n < 30 && cats.tags === 0, cats);
    await pick(p, "Category").locator("select").selectOption("All"); await p.waitForTimeout(500);
    const href = await p.locator(".nw-row").first().getAttribute("href"); ck("a headline is a link to the article", /^https:\/\/example\.com\/n\//.test(href ?? ""), href);
    await p.locator(".nw-tk button").first().tap(); await p.waitForTimeout(500); ck("a company named on a headline opens its page", p.url().includes("#asset/NVDA"), p.url());
    await p.goto(LIVE + "#news"); await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector(".nw-row"); await p.waitForTimeout(500);
    const s = await sizes(p); ck(`text ≥ 11px (smallest ${s.minFont}px), nothing overflows sideways`, s.minFont >= 11 && s.overflowX <= 0, s);
    console.log(`\n[RESEARCH, ${dev}]`);
    await p.goto(LIVE + "#research", { waitUntil: "networkidle" }); await p.waitForSelector(".rs-row"); await p.waitForTimeout(500);
    const calls = []; p.on("request", (r) => { const u = r.url(); if (u.includes("fakeapi")) calls.push(new URL(u).searchParams.get("action")); });
    ck("opens on the titles (45), no piece shown", (await p.locator(".rs-row").count()) === 45 && (await p.locator(".mp-doc").count()) === 0);
    await p.evaluate(() => scrollTo(0, 900)); await p.waitForTimeout(200); const y0 = await p.evaluate(() => Math.round(scrollY));
    const row = p.locator(".rs-row").nth(10); const title = (await row.locator(".t").textContent()).trim(); await row.tap(); await p.waitForSelector(".mp-doc h1"); await p.waitForTimeout(500);
    const d = await p.evaluate(() => ({ h1: document.querySelector(".mp-doc h1").textContent, y: Math.round(scrollY), hash: location.hash, list: document.querySelectorAll(".rs-row").length, back: document.querySelectorAll(".mp-back, .mp-doc .mp-more").length, tables: document.querySelectorAll(".mp-doc table").length }));
    ck("tap a title: that piece alone, from its top, named in the address, back buttons above and below", d.h1 === title && d.y === 0 && /^#research\/(note|report):/.test(d.hash) && d.list === 0 && d.back === 2, { ...d, title });
    const s2 = await sizes(p); ck(`piece: text ≥ 11px (smallest ${s2.minFont}px), tables included, nothing overflows sideways`, s2.minFont >= 11 && s2.overflowX <= 0, s2);
    await p.locator(".mp-back").tap(); await p.waitForSelector(".rs-row"); await p.waitForTimeout(400);
    const l = await p.evaluate(() => ({ y: Math.round(scrollY), hash: location.hash, read: document.querySelector(".rs-row.read .t")?.textContent?.trim() })); ck("All titles: the list where it was left, the piece just read marked", Math.abs(l.y - y0) <= 2 && l.hash === "#research" && l.read === title, { ...l, y0 });
    await p.locator(".rs-row").nth(12).tap(); await p.waitForSelector(".mp-doc h1"); await p.waitForTimeout(300); await p.goBack(); await p.waitForSelector(".rs-row"); await p.waitForTimeout(400);
    ck("the phone's own Back returns to the list at the same place", Math.abs((await p.evaluate(() => Math.round(scrollY))) - y0) <= 2);
    await p.locator(".mp-find").fill("weekly"); await p.waitForTimeout(300); const nf = await p.locator(".rs-row").count(); await p.locator(".rs-row").nth(1).tap(); await p.waitForSelector(".mp-doc h1"); await p.waitForTimeout(300);
    ck("a weekly report opens with its standfirst and sources", (await p.locator(".mp-doc .stand").count()) === 1 && (await p.locator(".mp-doc .src li").count()) > 5);
    await p.goBack(); await p.waitForSelector(".rs-row"); await p.waitForTimeout(300); ck(`search kept after reading (${nf} matches)`, (await p.locator(".mp-find").inputValue()) === "weekly" && (await p.locator(".rs-row").count()) === nf && nf === 6);
    await pick(p, "Kind").locator("select").selectOption("Daily"); await p.waitForTimeout(300); ck("Kind -> Daily with the search 'weekly': nothing matches, said plainly", (await p.locator(".rs-row").count()) === 0 && /Nothing matches/.test(await p.locator(".mp .empty").textContent()));
    await p.goto(LIVE + "#research/report:1"); await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector(".mp-doc h1"); await p.waitForTimeout(300);   // a fresh load, as a link from elsewhere would be
    await p.locator(".mp-back").tap(); await p.waitForSelector(".rs-row"); ck("a link to a piece opens it; its back button leads to the list", p.url().endsWith("#research"));
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  console.log("\n[MARKET: the morning's note above the list]");
  { const ctx = await b.newContext({ ...devices["iPhone 13"] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); await routes(p);
    const today = new Date().toISOString().slice(0, 10), TITLE = "Chip rout meets Toyota surge as Nikkei futures point lower before the open, and the yen firms into the Bank of Japan";
    let rows = [{ id: 900, d: today, title: "Weekly Strategy (not a morning note)", generatedAt: new Date(Date.now() - 3600e3).toISOString(), kind: "weekly" }, { id: 901, d: today, title: TITLE, generatedAt: new Date(Date.now() - 2 * 3600e3).toISOString(), kind: "daily" }];
    await p.route("**/fakeapi?*", (r) => { const q = new URL(r.request().url()).searchParams; if (q.get("action") !== "notes") return r.fallback();
      r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ rows }) }); });
    await p.goto(LIVE + "?phone=new#market", { waitUntil: "networkidle" }); await p.waitForSelector("#mk-note"); await p.waitForTimeout(400);
    const v = await p.evaluate(() => { const a = document.querySelector("#mk-note"), r = a.getBoundingClientRect(), head = document.querySelector(".mp-head").getBoundingClientRect(), t = a.querySelector(".t");
      return { k: a.querySelector(".k").textContent, t: t.textContent, lines: Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)), href: a.getAttribute("href"), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), below: r.top >= head.bottom - 1, vw: innerWidth, over: document.documentElement.scrollWidth - innerWidth }; });
    ck("the newest morning note (not the weekly) is offered under the title, with its day and its headline on at most three lines", /^Morning note · \d{1,2} [A-Z][a-z]{2}$/.test(v.k) && v.t.startsWith("Chip rout meets Toyota surge") && v.lines <= 3 && v.below && v.left >= 0 && v.right <= v.vw && v.over <= 0 && v.h >= 56, v);
    await p.locator("#mk-note").tap(); await p.waitForSelector(".mp-doc h1"); await p.waitForTimeout(300);
    ck("a tap opens that note in RESEARCH", decodeURIComponent(p.url()).endsWith(`#research/note:${today}`) && v.href === `#research/${encodeURIComponent("note:" + today)}`, { url: p.url(), href: v.href });
    // a note older than a day and a half is not offered as today's
    rows = [{ id: 902, d: "2026-11-10", title: "An older note", generatedAt: new Date(Date.now() - 40 * 3600e3).toISOString(), kind: "daily" }];
    await p.goto(LIVE + "?phone=new#market"); await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector(".mp-head h1"); await p.waitForTimeout(700);
    ck("an older note is not offered as the morning's; no page errors", (await p.locator("#mk-note").count()) === 0 && errs.length === 0, errs); await ctx.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
