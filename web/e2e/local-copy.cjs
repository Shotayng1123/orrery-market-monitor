// The local copy (the dev server's mock feed, VITE_DEV_MOCK=1) shows every tab with stand-in content, the same rows
// the other checks use (web/src/lib/standin.json), with the hard cases a layout must survive: names of 40 characters
// and more, a name in Japanese only, a headline of 120 characters naming three companies, a research title of 110
// characters, every state of a calendar event, every kind of watchlist name, one alert of each kind, a policy rate
// for every bank. The star and the add box work there, nothing says the API is not configured, `?mock=empty` draws
// every tab with no rows, and the site as published carries none of these rows.
// Run from web/:  node e2e/run.cjs local-copy   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright"); const fs = require("fs"), path = require("path");
const { S } = require("./standin.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", DIST = path.join(__dirname, ".dist", "assets");
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const decode = (t) => t.replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)));
const H120 = S.news[0].title, T110 = S.notes[0].title, LONG = S.watch.rows.find((r) => r.name.length >= 40).name, JP = "ゆうちょ銀行";
const ev = (i) => S.calendar[i].title;   // the hard cases of the calendar, by their place in the stand-in list (web/src/lib/standin.json)
const ZEW = ev(30), CLAIMS = ev(31), INLINE = ev(27), NOCONS = ev(26);
// minutes since a "MM/DD HH:MM SGT" stamp
const ago = (stamp) => { const m = /^(\d\d)\/(\d\d) (\d\d):(\d\d) SGT$/.exec(stamp || ""); if (!m) return null; const now = Date.now(), y = new Date(now + 8 * 3600e3).getUTCFullYear(); let t = Date.UTC(y, m[1] - 1, +m[2], +m[3], +m[4]) - 8 * 3600e3; if (t - now > 180 * 86400e3) t = Date.UTC(y - 1, m[1] - 1, +m[2], +m[3], +m[4]) - 8 * 3600e3; return (now - t) / 60e3; };
const pick = (p, label) => p.locator(".pick", { has: p.locator(`.lbl:text-is("${label}")`) });
const choose = async (p, label, value) => { await pick(p, label).first().locator("select").selectOption(value); await p.waitForTimeout(200); };
// wait until the page shows `n` elements matching `sel` (or give up after 8 s and let the check say what it saw)
const until = (p, sel, n) => p.waitForFunction(([sel, n]) => document.querySelectorAll(sel).length === n, [sel, n], { timeout: 8000 }).catch(() => undefined);
const noConfig = (p) => p.evaluate(() => !/not configured/i.test(document.body.innerText));
// the calendar's rows, the same fields on both layouts
const calRows = (p, phone) => p.evaluate((phone) => phone
  ? [...document.querySelectorAll(".mp-scroll .ev-row")].map((r) => { const s = r.querySelector(".ev-s")?.textContent ?? "", m = /^Consensus (.*) · Previous (.*)$/.exec(s); return { past: r.classList.contains("past"), title: r.querySelector(".ev-n").textContent, stamp: r.title, actual: r.querySelector(".ev-a").textContent, cls: r.querySelector(".ev-a").className, cons: m ? m[1] : null, imp: r.querySelector(".imp")?.className ?? "", ccy: r.querySelector(".ev-t small")?.textContent ?? "" }; })
  : [...document.querySelectorAll("table.calT:not(.ernT) tr.ecrow")].map((r) => { const td = r.querySelectorAll("td"); return { past: r.classList.contains("past"), title: td[2].textContent, stamp: td[0].title, actual: td[4].textContent, cls: td[4].className, cons: td[5].textContent, imp: "imp " + (td[3].title || "")[0]?.toLowerCase(), ccy: td[1].textContent }; }), phone);

(async () => { const b = await chromium.launch();
  for (const [name, opts, phone] of [["computer 1440x900", { viewport: { width: 1440, height: 900 } }, false], ["iPhone 13", { ...devices["iPhone 13"] }, true]]) {
    const ctx = await b.newContext(opts); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));

    console.log(`\n[NEWS, ${name}]`);
    await p.goto(MOCK + "#news", { waitUntil: "networkidle" }); await p.waitForSelector(phone ? ".ev-row" : "tr.ecrow"); await p.waitForSelector(phone ? ".nw-row" : ".nwrow");
    const c0 = await calRows(p, phone), heads = await p.locator(phone ? ".nw-row" : ".nwrow").count();
    ck(`the calendar opens with ${c0.length} high-impact events, the headlines with ${heads}: at least twenty of each`, c0.length >= 20 && c0.every((r) => /imp h/.test(r.imp)) && heads >= 20, { events: c0.length, heads });
    const h0 = await p.evaluate((phone) => { const r = document.querySelector(phone ? ".nw-row" : ".nwrow"); return { title: r.querySelector(phone ? ".nw-title" : ".nwh a").textContent, chips: [...r.querySelectorAll(phone ? ".nw-tk button" : ".nwtk .tk")].map((x) => x.textContent) }; }, phone);
    ck(`the newest headline is ${H120.length} characters long and names three companies, each a chip (${h0.chips.join(", ")})`, H120.length === 120 && h0.title === decode(H120) && h0.chips.length === 3, h0);
    ck("a headline names a company in Japanese only", await p.evaluate(([phone, jp]) => [...document.querySelectorAll(phone ? ".nw-tk button" : ".nwtk .tk")].some((x) => x.textContent === jp), [phone, JP]));
    const CAL = phone ? ".mp-scroll .ev-row" : "table.calT:not(.ernT) tr.ecrow";
    await choose(p, "Impact", "all"); await choose(p, "Countries", "all"); await until(p, CAL, S.calendar.length);
    const c = await calRows(p, phone), by = (t) => c.find((r) => r.title.startsWith(t));
    const zew = by(ZEW), claims = by(CLAIMS), inline = by(INLINE), nocons = by(NOCONS), speech = c.filter((r) => /· speech$/.test(r.title));
    ck(`Impact All, Countries All: all ${c.length} events, past and coming, high, medium and low`, c.length === S.calendar.length && c.some((r) => r.past) && c.some((r) => !r.past) && ["imp h", "imp m", "imp l"].every((k) => c.some((r) => r.imp === k)), { n: c.length });
    ck(`an event within the last hour (${ZEW}, ${zew ? Math.round(ago(zew.stamp)) : "?"} min ago) shown as past with its figure`, !!zew && zew.past && ago(zew.stamp) >= 0 && ago(zew.stamp) <= 60 && zew.actual !== "–", zew);
    ck(`one released minutes ago whose figure is not in yet (${CLAIMS}): past, actual "–"`, !!claims && claims.past && claims.actual === "–", claims);
    ck("results better and worse than consensus in their colours, and one in line with it uncoloured", c.some((r) => / up/.test(" " + r.cls)) && c.some((r) => / dn/.test(" " + r.cls)) && !!inline && inline.actual === inline.cons && inline.actual !== "–" && !/\b(up|dn)\b/.test(inline.cls), inline);
    ck(`a release without a consensus (${NOCONS}) and ${speech.length} speeches, without figures`, !!nocons && nocons.cons === "–" && nocons.actual !== "–" && speech.length >= 3 && speech.every((r) => (r.cons === "–" || r.cons === "") && (r.actual === "–" || r.actual === "")), { nocons, speech: speech.slice(0, 2) });
    await choose(p, "Countries", "major"); await until(p, CAL, S.calendar.filter((e) => e.currency !== "MXN" && e.currency !== "NZD").length);
    const major = await calRows(p, phone);
    ck("countries outside the majors (MXN, NZD) only under Countries All", ["MXN", "NZD"].every((x) => c.some((r) => r.ccy === x)) && !major.some((r) => r.ccy === "MXN" || r.ccy === "NZD"), { all: c.length, major: major.length });
    await choose(p, "Type", "earnings"); await p.waitForSelector(phone ? ".ev-row.tap" : "table.ernT tr.ecrow");
    const ern = () => p.evaluate((phone) => [...document.querySelectorAll(phone ? ".ev-row.tap .ev-n" : "table.ernT tr.ecrow td.ev .lnk")].map((x) => x.textContent), phone);
    const ERN = phone ? ".ev-row.tap" : "table.ernT tr.ecrow";
    await until(p, ERN, S.earnings.filter((r) => r.mcapUsd >= 1e10).length); const e0 = await ern();
    await choose(p, "Mkt cap", "all"); await until(p, ERN, S.earnings.length); const e1 = await ern();
    await choose(p, "Region", "Asia"); await until(p, ERN, 1); const e2 = await ern();
    ck(`the earnings calendar: ${e0.length} companies of USD 10bn and more, ${e1.length} in all, a name in Japanese only, one of 40 characters and more, one in Asia`, e0.length >= 20 && e1.length === S.earnings.length && e1.length > e0.length && e1.includes(JP) && e1.some((n) => n.length >= 40) && e2.length === 1, { e0: e0.length, e1: e1.length, e2 });
    ck("nothing says the API is not configured; no page errors", (await noConfig(p)) && errs.length === 0, errs);

    console.log(`\n[RESEARCH, ${name}]`);
    await p.goto(MOCK + "#research", { waitUntil: "networkidle" }); await p.waitForSelector(phone ? ".rs-row" : "table.repT tbody tr");
    const rs = await p.evaluate((phone) => [...document.querySelectorAll(phone ? ".rs-row" : "table.repT tbody tr")].map((r) => ({ kind: r.querySelector(".kchip").textContent, title: (phone ? r.querySelector(".t") : r.querySelectorAll("td")[2]).textContent.trim() })), phone);
    ck(`the list: ${rs.filter((r) => r.kind === "Daily").length} daily notes and ${rs.filter((r) => r.kind === "Weekly").length} weekly reports, one title of ${T110.length} characters`, rs.length === S.notes.length + S.reports.length && rs.filter((r) => r.kind === "Weekly").length === S.reports.length && T110.length === 110 && rs.some((r) => r.title === T110), rs.length);
    for (const want of [S.reports[0].title, T110]) {
      const row = p.locator(phone ? ".rs-row" : "table.repT tbody tr", { hasText: want }).first(); await row.scrollIntoViewIfNeeded(); await row.click();
      await p.waitForFunction(([phone, want]) => (document.querySelector(phone ? ".mp-doc h1" : '.panel[data-k="report"] .brnar h2')?.textContent ?? "") === want && !!document.querySelector(".brnar.report :is(p, li)"), [phone, want], { timeout: 8000 }).catch(() => undefined);
      const d = await p.evaluate((phone) => ({ h: document.querySelector(phone ? ".mp-doc h1" : '.panel[data-k="report"] .brnar h2')?.textContent ?? null, body: document.querySelectorAll(".brnar.report p, .brnar.report li").length, tables: document.querySelectorAll(".brnar.report .ntabs table").length }), phone);
      ck(`opens ${want === T110 ? "the note with the long title, with its tables" : "a weekly report"}`, d.h === want && d.body > 3 && (want !== T110 || d.tables > 0), d);
      if (phone) { await p.locator(".mp-back").click(); await p.waitForSelector(".rs-row"); }
    }

    console.log(`\n[RATES & FX: policy rates, ${name}]`);
    await p.goto(MOCK + "#rates", { waitUntil: "networkidle" }); await p.waitForSelector(phone ? ".pl-row" : '.panel[data-k="policy"] tbody tr');
    const pol = await p.evaluate((phone) => ({ banks: [...document.querySelectorAll(phone ? ".pl-row .n b" : '.panel[data-k="policy"] tbody tr td:first-child b')].map((x) => x.textContent), chips: document.querySelectorAll((phone ? ".mp-legacy" : '.panel[data-k="policy"]') + " .chips .chip-sm").length }), phone);
    const BANK = { FED: "Fed", BOJ: "BoJ", BOE: "BoE", BOK: "BoK", PBOC: "PBoC" };   // central banks as the glossary writes them in text (I-5)
    ck(`a row for every bank the server keeps (${pol.banks.join(" ")}), ${pol.chips} lines in the chart`, pol.banks.join() === S.policy.rows.map((r) => BANK[r.bank] ?? r.bank).join() && pol.chips === new Set(S.policy.history.map((r) => r.bank)).size, pol);

    console.log(`\n[WATCHLIST, ${name}]`);
    await p.goto(MOCK + "#watch", { waitUntil: "networkidle" }); await p.waitForSelector(phone ? ".mp-row.starred" : '.panel[data-k="wl"] tbody tr');
    const w = await p.evaluate((phone) => {
      const sec = (t) => [...document.querySelectorAll(".mp-sec")].find((s) => s.querySelector("h2 span")?.textContent === t);
      const rows = phone ? [...document.querySelectorAll(".mp-row.starred")].map((r) => ({ name: r.querySelector(".n").textContent, sym: r.querySelector(".mp-st").textContent.split(" · ")[0] })) : [...document.querySelectorAll('.panel[data-k="wl"] tbody tr')].map((r) => ({ name: r.querySelector("td.nm .lnk").textContent, sym: r.querySelector("td.nm .mut").textContent }));
      const n = (k, ph, sel) => (phone ? sec(ph)?.querySelectorAll(sel).length : document.querySelectorAll(`.panel[data-k="${k}"] ${sel === ".rs-row" || sel === ".ev-row" || sel === ".nw-row" ? "tbody tr" : sel}`).length) ?? 0;
      return { rows, earn: n("wl-earn", "Results ahead", ".ev-row"), alerts: n("wl-alerts", "Alerts on my names", ".nw-row"), news: phone ? sec("Headlines on my names").querySelectorAll(".nw-row").length : document.querySelectorAll('.panel[data-k="wl-news"] .nwrow').length, research: n("wl-research", "In research", ".rs-row") };
    }, phone);
    const syms = w.rows.map((r) => r.sym);
    ck(`my names: the ${w.rows.length} stand-in names, a Tokyo and a US stock, the Nikkei 225, an index without a page on EQUITIES, USD/JPY, the UST 10Y, gold`, w.rows.length === S.watch.start.length && ["7203.T", "NVDA", "^N225", "^SOX", "USDJPY=X", "^TNX", "GC=F"].every((s) => syms.includes(s)), syms);
    ck("a name of 40 characters and more, and one in Japanese only", w.rows.some((r) => r.name === LONG) && w.rows.some((r) => r.name === JP), w.rows.map((r) => r.name));
    // the stand-in feed at the server's lengths, 40 alerts and 60 headlines (the designer's D-48): a computer shows 10 and 15
    // of them before "SHOW n MORE", a phone every alert and 30 headlines
    const nA = S.watch.feed.alerts.length, nN = S.watch.feed.news.length;
    ck(`results ahead (${w.earn}), alerts (${w.alerts} of ${nA}), headlines (${w.news} of ${nN}) and research (${w.research}) on them`, nA === 40 && nN === 60 && w.earn >= 3 && w.alerts === (phone ? nA : 10) && w.news === (phone ? 30 : 15) && w.research === S.watch.feed.research.length, w);
    // every kind opens its page: an index with an EQUITIES page opens EQUITIES, the rest their own page
    const opened = [];
    for (const [sym, want] of [["7203.T", "#asset/7203.T"], ["NVDA", "#asset/NVDA"], ["^N225", "#equities/nk225"], ["^SOX", "#asset/%5ESOX"], ["USDJPY=X", "#asset/USDJPY%3DX"], ["^TNX", "#asset/%5ETNX"], ["GC=F", "#asset/GC%3DF"]]) {
      await p.evaluate(() => { location.hash = "watch"; }); await p.waitForSelector(phone ? ".mp-row.starred" : '.panel[data-k="wl"] tbody tr');
      if (phone) await p.locator(".mp-row.starred", { has: p.locator(".mp-st", { hasText: `${sym} · ` }) }).first().locator(".n").click();
      else await p.locator('.panel[data-k="wl"] tbody tr', { has: p.locator("td.nm .mut", { hasText: sym }) }).first().locator(".lnk").click();
      await p.waitForFunction((want) => location.hash === want, want, { timeout: 5000 }).catch(() => undefined); await p.waitForTimeout(400);
      opened.push({ sym, hash: await p.evaluate(() => location.hash), crash: await p.locator("#tab-crash").count() });
    }
    ck("a tap on each kind of name opens its page (the Nikkei 225 its EQUITIES page)", opened.every((o, i) => o.hash === ["#asset/7203.T", "#asset/NVDA", "#equities/nk225", "#asset/%5ESOX", "#asset/USDJPY%3DX", "#asset/%5ETNX", "#asset/GC%3DF"][i] && o.crash === 0), opened);
    // the alert list in the header: one of each kind (a stock's move, an index, a buyback, guidance, M&A)
    await p.evaluate(() => { location.hash = "market"; }); await p.waitForTimeout(500);
    if (phone) await p.evaluate(() => scrollTo(0, 0));
    await p.locator("#alerts .alrt").click(); await p.waitForSelector(".aldrop tbody tr");
    const kinds = await p.evaluate(() => [...document.querySelectorAll(".aldrop tbody tr td:nth-child(3)")].map((x) => x.textContent));
    ck(`the alert list holds one of each kind: ${[...new Set(kinds)].join(", ")}`, ["index", "buyback", "guidance", "M&A"].every((k) => kinds.includes(k)) && kinds.some((k) => k === "TSE" || k === "NYSE"), kinds);
    await p.keyboard.press("Escape"); await p.mouse.click(5, phone ? 600 : 880);
    ck("nothing says the API is not configured; no page errors", (await noConfig(p)) && errs.length === 0, errs);
    await ctx.close();

    console.log(`\n[the star and the add box, ${name}]`);
    { const ctx2 = await b.newContext(opts);
      await ctx2.addInitScript(() => { try { if (localStorage.getItem("om_mock_watch") == null) localStorage.setItem("om_mock_watch", JSON.stringify([{ symbol: "NVDA", name: null }, { symbol: "^TNX", name: null }])); } catch {} });
      const q = await ctx2.newPage(); const e2 = []; q.on("pageerror", (e) => e2.push(e.message));
      const star = phone ? ".mp-head .star" : '.panel[data-no="01"] .star';
      await q.goto(MOCK + "#asset/7203.T", { waitUntil: "networkidle" }); await q.waitForSelector(star);
      const s0 = await q.locator(star).textContent(); await q.locator(star).click(); await q.waitForSelector(star + ".on", { timeout: 5000 }).catch(() => undefined);
      const kept = await q.evaluate(() => JSON.parse(localStorage.getItem("om_mock_watch") || "[]").map((w) => w.symbol));
      ck("a stock's page: the star is off for a name not on the list; a click lights it and the list keeps it", s0 === "☆" && (await q.locator(star + ".on").count()) === 1 && kept.includes("7203.T"), { s0, kept });
      const names = () => q.evaluate((phone) => (phone ? [...document.querySelectorAll(".mp-row.starred .mp-st")].map((x) => x.textContent.split(" · ")[0]) : [...document.querySelectorAll('.panel[data-k="wl"] tbody tr td.nm .mut')].map((x) => x.textContent)), phone);
      const row = (sym) => (phone ? q.locator(".mp-row.starred", { has: q.locator(".mp-st", { hasText: `${sym} · ` }) }) : q.locator('.panel[data-k="wl"] tbody tr', { has: q.locator("td.nm .mut", { hasText: sym }) }));
      await q.evaluate(() => { location.hash = "watch"; }); await q.waitForSelector(phone ? ".mp-row.starred" : '.panel[data-k="wl"] tbody tr');
      await q.waitForFunction((phone) => (phone ? document.querySelectorAll(".mp-row.starred") : document.querySelectorAll('.panel[data-k="wl"] tbody tr')).length === 3, phone, { timeout: 5000 }).catch(() => undefined);
      const n1 = await names();
      ck(`WATCHLIST shows it with the names kept before (${n1.join(", ")})`, n1.length === 3 && n1.includes("7203.T"), n1);
      await row("7203.T").locator(".star").click();
      await q.waitForFunction((phone) => (phone ? document.querySelectorAll(".mp-row.starred") : document.querySelectorAll('.panel[data-k="wl"] tbody tr')).length === 2, phone, { timeout: 5000 }).catch(() => undefined);
      await q.reload({ waitUntil: "networkidle" }); await q.waitForSelector(phone ? ".mp-row.starred" : '.panel[data-k="wl"] tbody tr'); await q.waitForTimeout(300);
      const n2 = await names();
      ck("its star on WATCHLIST takes it off, and it stays off after a reload", n2.length === 2 && !n2.includes("7203.T"), n2);
      const box = phone ? ".mp-add .mp-find" : "#wl-add";
      await q.locator(box).fill("toyo"); await q.waitForSelector(phone ? "#wl-cands .mp-cand .n" : "#wl-cands .sitem b");
      const cands = await q.evaluate((phone) => [...document.querySelectorAll(phone ? "#wl-cands .mp-cand .n" : "#wl-cands .sitem .nm")].map((x) => x.textContent), phone);
      await q.locator(phone ? "#wl-cands .mp-cand" : "#wl-cands .sitem", { hasText: "Toyota Industries" }).first().click();
      await q.waitForFunction((phone) => (phone ? document.querySelectorAll(".mp-row.starred") : document.querySelectorAll('.panel[data-k="wl"] tbody tr')).length === 3, phone, { timeout: 5000 }).catch(() => undefined);
      const n3 = await names(), msg = await q.locator("#wl-msg").textContent().catch(() => "");
      ck(`the add box: "toyo" offers ${cands.length} names; choosing one adds it and says so`, cands.length >= 3 && cands.includes("Toyota Industries Corp") && n3.includes("6201.T") && /Added Toyota Industries Corp \(6201\.T\)/.test(msg), { cands, n3, msg });
      ck("nothing says the API is not configured; no page errors", (await noConfig(q)) && e2.length === 0, e2);
      await ctx2.close(); }

    console.log(`\n[?mock=empty: every tab with no rows, ${name}]`);
    { const ctx3 = await b.newContext(opts); const q = await ctx3.newPage(); const e3 = []; q.on("pageerror", (e) => e3.push(e.message)); const bad = [];
      const want = { market: "Awaiting the data feed", news: "No calendar loaded", research: "Nothing published yet", equities: "Statistics not computed yet", rates: "No curve yet", watch: "Your watchlist is empty" };
      for (const [tab, title] of Object.entries(want)) {
        await q.goto(MOCK + "?mock=empty#" + tab, { waitUntil: "networkidle" }); await q.waitForSelector(".empty", { timeout: 8000 }).catch(() => undefined); await q.waitForTimeout(500);
        const v = await q.evaluate(() => ({ crash: !!document.querySelector("#tab-crash"), empties: [...document.querySelectorAll(".empty")].map((e) => e.textContent), rows: document.querySelectorAll("tr.ecrow, .ev-row, .nwrow, .nw-row, table.repT tbody tr, .rs-row, .mp-row.starred, .panel[data-k='wl'] tbody tr, .pl-row").length }));
        if (v.crash || v.rows > 0 || !v.empties.some((t) => t.includes(title))) bad.push({ tab, ...v, empties: v.empties.slice(0, 4) });
      }
      ck("every tab draws its empty state: no rows, no tab that fails, no page errors", bad.length === 0 && e3.length === 0, { bad, e3 });
      await ctx3.close(); }
  }

  console.log("\n[the same rows as the other checks, and none in the site as published]");
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); await p.goto(MOCK + "#market", { waitUntil: "networkidle" });
    const m = await p.evaluate(async () => { const { mockAction } = await import("/orrery-market-monitor/src/lib/mock.ts"); const a = (x, q) => mockAction(x, q);
      return { cal: a("calendar").rows.map((r) => r.title), news: a("news", { n: 150 }).rows.map((r) => r.title), notes: a("notes", { n: 1000 }).rows.map((r) => r.title), reports: a("reports", { n: 1000 }).rows.map((r) => r.title), earnings: a("earnings").rows.map((r) => r.symbol), alerts: a("alerts", { n: 50 }).rows.map((r) => r.msg), banks: a("policy").rows.map((r) => r.bank) }; });
    const t = (xs) => xs.map((r) => r.title);
    ck("the local copy answers with the rows the browser checks use (calendar, headlines, notes, reports, earnings, alerts, policy rates)", JSON.stringify(m.cal) === JSON.stringify(t(S.calendar)) && JSON.stringify(m.news) === JSON.stringify(t(S.news)) && JSON.stringify(m.notes) === JSON.stringify(t(S.notes)) && JSON.stringify(m.reports) === JSON.stringify(t(S.reports)) && JSON.stringify(m.earnings) === JSON.stringify(S.earnings.map((r) => r.symbol)) && JSON.stringify(m.alerts) === JSON.stringify(S.alerts.map((r) => r.msg)) && JSON.stringify(m.banks) === JSON.stringify(S.policy.rows.map((r) => r.bank)), { cal: m.cal.length, news: m.news.length, notes: m.notes.length });
    await ctx.close(); }
  { const js = fs.readdirSync(DIST).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(DIST, f), "utf8")).join("\n");
    // I-6 and B-27's stand-ins too: the 2.7σ alert's note and the stand-in futures' contracts (lib/mock.ts)
    const marks = [H120, T110, LONG, JP, ZEW, "om_mock_watch", "Nippon Stand-in Heavy Industries", "σ of 63 daily changes to the last close", "GCG27.CMX", "GCZ26.CMX", "NKDZ26.CME"].filter((s) => js.includes(s));
    ck(`the site as published (a production build) carries none of the stand-in rows (${js.length} characters of script searched)`, js.length > 100000 && marks.length === 0, marks); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
