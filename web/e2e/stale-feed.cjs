// A price feed that has stopped must be said on screen (lib/feed.ts; the server's reading is
// supabase/functions/_shared/feedhealth.ts). On 18 Nov 2026 every price was an hour and a half old with New York
// open and the header said DATA OK, because the jobs had run on time. Checked here on a desktop and in the phone
// layout: the bar at the foot of the screen and the DATA chip while the feed is stopped, both gone when prices
// arrive again, and nothing claimed for a server that does not give the reading. Then a held answer (SF-3, SF-4 of the
// review of fix part 1): a row called live a day ago has no LIVE mark and shows its day; the CSV's heads.
// Run from web/:  node e2e/run.cjs stale-feed   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { routes } = require("./harness.cjs");
const STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const base = () => ({ ok: true, at: new Date().toISOString(), tick: { lastAt: new Date().toISOString(), ageMin: 1, ok: true, note: "stand-in" }, daily: { lastAt: new Date().toISOString(), ok: true, note: "stand-in" }, sources: [], holidays: {}, holidaysVerified: true });
const stopped = () => ({ expected: true, ok: false, newest: new Date(Date.now() - 99 * 60e3).toISOString(), symbol: "USDJPY=X", lateMin: 99 });
const arriving = () => ({ expected: true, ok: true, newest: new Date(Date.now() - 60e3).toISOString(), symbol: "USDJPY=X", lateMin: 1 });

(async () => { const b = await chromium.launch();
  for (const [name, opts, phone] of [["desktop", { viewport: { width: 1440, height: 900 } }, false], ["phone", { ...devices["iPhone 13"] }, true]]) {
    console.log(`\n[${name}]`);
    const ctx = await b.newContext(opts); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    let feed = stopped(), relay;   // relay: absent from a server older than the second path
    await routes(p);
    await p.route("**/fakeapi?*", (r) => { const a = new URL(r.request().url()).searchParams.get("action"); if (a !== "health") return r.fallback();
      r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ...base(), ...(feed ? { feed } : {}), ...(relay !== undefined ? { relay } : {}) }) }); });
    await p.goto(STANDIN + "#market", { waitUntil: "networkidle" }); await p.waitForSelector("#feedbar", { timeout: 8000 }); await p.waitForTimeout(300);
    const menu = async (open) => { if (!phone) return; const on = await p.evaluate(() => document.querySelector("#topbar").classList.contains("open")); if (on !== open) { await p.locator('#topbar button[aria-expanded]').click(); await p.waitForTimeout(250); } };
    const see = async () => { await menu(true); const v = await p.evaluate(() => { const bar = document.querySelector("#feedbar"), chip = document.querySelector("#hlth"), nav = document.querySelector("#pnav"), r = bar ? bar.getBoundingClientRect() : null;
      return { bar: bar ? bar.textContent : null, role: bar ? bar.getAttribute("role") : null, left: r ? Math.round(r.left) : null, right: r ? Math.round(r.right) : null, bottom: r ? Math.round(r.bottom) : null, navTop: nav ? Math.round(nav.getBoundingClientRect().top) : null, vw: innerWidth, vh: innerHeight,
        chip: chip.textContent.trim(), chipCls: chip.className, title: chip.getAttribute("title"), over: document.documentElement.scrollWidth - innerWidth }; }); await menu(false); return v; };
    let v = await see();
    ck("the bar says no new price has arrived, since when and how far behind, and that the figures on screen are as of then", /^No new prices since \d{1,2} [A-Z][a-z]{2} \d\d:\d\d SGT \(1 h 39 min behind\)\. The source has stopped sending them; the figures on screen are as of then\.$/.test(v.bar ?? "") && v.role === "alert", v.bar);
    ck(`it fits the screen${phone ? " and sits above the tabs" : ""} (${v.left}–${v.right}px of ${v.vw}px)`, v.left >= 0 && v.right <= v.vw && v.over <= 0 && (phone ? v.bottom <= v.navTop : v.bottom <= v.vh), v);
    ck("the DATA chip reads as a failure and gives the reason first, although the jobs ran on time", /DATA\s*✕/.test(v.chip) && /hl-bad/.test(v.chipCls) && /^DATA HEALTH: NO NEW PRICES since \d{1,2} [A-Z][a-z]{2} \d\d:\d\d SGT \(1 h 39 min behind\): the source has stopped sending new prices; tick 1 min old/.test(v.title), { chip: v.chip, cls: v.chipCls, title: v.title });
    // prices arrive again: the next refresh takes the bar away
    feed = arriving(); await menu(true); await p.locator("#nxt").click(); await menu(false);
    await p.waitForFunction(() => !document.querySelector("#feedbar"), null, { timeout: 8000 }); v = await see();
    ck("when prices arrive again the bar goes and the chip says DATA OK", v.bar === null && /DATA\s*OK/.test(v.chip) && /hl-ok/.test(v.chipCls) && !/NO NEW PRICES/.test(v.title), { chip: v.chip, title: v.title });
    // a market that is closed, and a server from before the reading: nothing is claimed either way
    feed = { expected: false, ok: true, newest: null, symbol: null, lateMin: null }; await menu(true); await p.locator("#nxt").click(); await menu(false); await p.waitForTimeout(900);
    const closed = await see();
    feed = null; await menu(true); await p.locator("#nxt").click(); await menu(false); await p.waitForTimeout(900);
    const older = await see();
    ck("with every market closed, or a server that does not give the reading, there is no bar and the chip is as before", closed.bar === null && /DATA\s*OK/.test(closed.chip) && older.bar === null && /DATA\s*OK/.test(older.chip) && errs.length === 0, { closed: closed.chip, older: older.chip, errs });
    // the second path (19 Nov 2026): the relay on GitHub is writing, so prices are current, and the chip says how
    feed = arriving(); relay = { since: new Date(Date.now() - 42 * 60e3).toISOString(), ownLateMin: 52 }; await menu(true); await p.locator("#nxt").click(); await menu(false); await p.waitForTimeout(900);
    const second = await see();
    ck("while the second path is writing the prices there is no bar (they are current); the chip is amber and says since when and why", second.bar === null && /DATA\s*!/.test(second.chip) && /hl-warn/.test(second.chipCls) && /^DATA HEALTH: PRICES THROUGH THE SECOND PATH since \d{1,2} [A-Z][a-z]{2} \d\d:\d\d SGT: the source has stopped answering the Monitor's server \(its own answers are 52 min behind\), so a job on GitHub is pulling the prices and they are current; tick 1 min old/.test(second.title), { chip: second.chip, title: second.title });
    relay = null; await menu(true); await p.locator("#nxt").click(); await menu(false); await p.waitForTimeout(900);
    const handed = await see();
    feed = stopped(); relay = { since: new Date(Date.now() - 42 * 60e3).toISOString(), ownLateMin: 52 }; await menu(true); await p.locator("#nxt").click(); await menu(false); await p.waitForSelector("#feedbar", { timeout: 8000 });
    const both = await see();
    ck("handed back, the chip is green again; and if the prices stop although a relay is on, the red bar and DATA ✕ stand", /DATA\s*OK/.test(handed.chip) && !/SECOND PATH/.test(handed.title) && both.bar !== null && /DATA\s*✕/.test(both.chip) && /^DATA HEALTH: NO NEW PRICES/.test(both.title) && !/SECOND PATH/.test(both.title) && errs.length === 0, { handed: handed.chip, both: both.chip, title: both.title, errs });
    await ctx.close();
  }
  // a held answer (SF-3, SF-4 of the review of fix part 1, 22 Nov 2026): a row the answer called live whose print is a
  // day old (a kept copy, refreshes that fail) carries no LIVE or DELAYED mark, its day stands after its name, and a
  // row printed a minute ago keeps LIVE; the CSV's day column says what a blank is only where the answer carries the
  // days. The rows are counted back from the moment the page asks, so the hour of the run does not matter.
  console.log("\n[a held answer: the marks, the CSV's heads]");
  for (const days of [true, false]) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await ctx.addInitScript(() => { try { localStorage.setItem("om_phone_v2", "0"); } catch {} });
    const ls = (d, close) => ({ d, from: d, close, base: close, chg: 0, z: 0.1, sd: 0.4, n: 60, wFrom: null, wTo: null });
    const fx = (i, symbol, name, last, agoMin) => { const at = new Date(Date.now() - agoMin * 60e3); return { symbol, name, cls: "Currency", group: "fx", market: "FX", currency: symbol.slice(3, 6), decimals: 3, order: i, marketTab: true, last, lastAt: at.toISOString(), live: true, closes: { d1: last * 0.99 }, closeDates: {}, pct: { d1: 1.01, w1: 2.2, m1: -3.1, m3: 4.4, m12: 12.5, m36: 30 }, z1m: 0.4, pos52: 61, vs200: 3.2, ...(days ? { ls: ls(new Date(at.getTime() - 864e5).toISOString().slice(0, 10), last) } : {}) }; };
    await routes(p);
    await p.route("**/fakeapi?*", (r) => { const a = new URL(r.request().url()).searchParams.get("action"); if (a !== "table") return r.fallback();
      r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ asOf: new Date().toISOString(), rows: [fx(1, "USDJPY=X", "USD/JPY", 158.4, 26 * 60), fx(2, "EURUSD=X", "EUR/USD", 1.052, 1)] }) }); });
    await p.goto(STANDIN + "#market", { waitUntil: "networkidle" }); await p.waitForSelector("table.mkt tbody tr", { timeout: 8000 }); await p.waitForTimeout(300);
    const rows = await p.evaluate(() => [...document.querySelectorAll("table.mkt tbody tr")].map((tr) => ({ name: tr.querySelector("td")?.innerText.replace(/\s+/g, " ").trim() ?? "", live: tr.classList.contains("live"), marks: [...tr.querySelectorAll(".badge")].map((x) => x.textContent) })));
    const held = rows.find((r) => r.name.startsWith("USD/JPY")), fresh = rows.find((r) => r.name.startsWith("EUR/USD"));
    const dl = p.waitForEvent("download", { timeout: 8000 }); await p.click('.panel[data-k="mkt"] .csvbtn'); const file = await dl;
    const csv = require("fs").readFileSync(await file.path(), "utf8").replace(/^\uFEFF/, ""), head = csv.split(/\r?\n/)[0];
    if (days) ck(`a row called live whose print is 26 hours old reads "${held?.name}" with no LIVE or DELAYED mark (${held?.marks.join(", ") || "none"}), its day after its name; a row printed a minute ago keeps ${fresh?.marks.join(", ")} (SF-3)`,
      !!held && !held.live && !held.marks.some((m) => /LIVE|DELAY|\bD\b|min/i.test(m)) && /\d{1,2} [A-Z][a-z]{2}$/.test(held.name) && !!fresh && fresh.live && fresh.marks.includes("LIVE") && errs.length === 0, { rows, errs });
    ck(days ? `the CSV of an answer that carries the days heads its day column "${head.split(",").find((x) => /Figures of/.test(x))}" (SF-4)` : `the CSV of an answer from a server that carries no days heads it "${head.split(",").find((x) => /Figures of/.test(x))}": nothing in the file calls a blank today's (SF-4)`,
      days ? head.includes("Figures of (blank: today in SGT)") : head.includes("Figures of (not known: this answer carries no days)") && !/today/.test(head), { head, name: file.suggestedFilename() });
    await ctx.close();
  }
  // PP-1 of the final review of pull request #50: on a phone, in the layout made for phones, the same held answer drew
  // a row it called live "No new print", muted, with no time and no opening, whatever its market's state. A row that
  // is not live now reads its market's session: on a Saturday "Closed" with its opening; in Tokyo's session the time
  // of its price in amber, with since when the market is open. The page's clock is set (Playwright's), so the hour of
  // the run does not matter.
  console.log("\n[a held answer on a phone (390 px): each row by its market's session]");
  for (const [what, nowIso, lastIso, shut] of [["Sat 21 Nov 09:00 SGT, the rows' prints of Fri 14:00 SGT", "2026-11-21T01:00:00Z", "2026-11-20T06:00:00Z", true], ["Tue 24 Nov 10:00 SGT, the rows' prints of 08:40 SGT", "2026-11-24T02:00:00Z", "2026-11-24T00:40:00Z", false]]) {
    const ctx = await b.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await ctx.addInitScript(() => { try { localStorage.setItem("om_a2hs_hide", "1"); localStorage.setItem("om_phone_v2", "1"); } catch {} });
    await p.clock.setFixedTime(new Date(nowIso));
    const jp = { symbol: "^N225", name: "Nikkei 225", cls: "Equities", group: "equity", market: "TSE", currency: "JPY", decimals: 2, order: 1, marketTab: true, last: 38000, lastAt: lastIso, live: true, source: "yahoo", closes: { d1: 37800 }, closeDates: {}, pct: { d1: 0.53, w1: 1, m1: 2, m3: 3, m12: 12, m36: 30 }, z1m: 0.4, pos52: 61, vs200: 3.2 };
    const fx = { ...jp, symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", group: "fx", market: "FX", decimals: 3, order: 2, last: 155.2, closes: { d1: 155 } };
    await routes(p);
    await p.route("**/fakeapi?*", (r) => { const a = new URL(r.request().url()).searchParams.get("action"); if (a !== "table") return r.fallback();
      r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ asOf: lastIso, rows: [jp, fx] }) }); });
    await p.goto(STANDIN + "#market", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row.inst", { timeout: 8000 }); await p.waitForTimeout(400);
    const lines = await p.evaluate(() => [...document.querySelectorAll(".mp-row.inst")].map((row) => { const st = row.querySelector(".mp-st"), first = st?.firstElementChild, op = st?.querySelector(".opens"); return { name: row.querySelector(".n")?.textContent ?? "", state: first?.textContent ?? "", cls: first?.className ?? "", opens: op?.textContent ?? "", color: first ? getComputedStyle(first).color : "" }; }));
    const n = lines.find((l) => l.name === "Nikkei 225"), u = lines.find((l) => l.name === "USD/JPY");
    const said = lines.map((l) => `${l.name}: "${l.state}${l.opens ? ` · ${l.opens}` : ""}"`).join(", ");
    if (shut) ck(`${what}: ${said}: "Closed" with when each market opens ("scheduled" where the Monitor does not hold its holidays), no row "Live", "Delayed" or "No new print"`, !!n && !!u && n.state === "Closed" && /^opens \d{1,2} Nov 08:00 SGT(?:, scheduled)?$/.test(n.opens) && u.state === "Closed" && /^opens 23 Nov 06:00 SGT, scheduled$/.test(u.opens) && !lines.some((l) => /Live|Delayed|No new print/.test(l.state)) && errs.length === 0, { lines, errs });
    else ck(`${what}: ${said}: the time of the price in amber, with the session it trades in (where the Monitor does not hold the market's holidays, the timetable's, "scheduled"), no row "Live", "Delayed" or "No new print"`, !!n && !!u && n.state === "Last print 08:40" && /\bstale\b/.test(n.cls) && /^(?:open since 08:00 SGT|session 08:00–10:30 SGT, scheduled)$/.test(n.opens) && /^session to 28 Nov 06:00 SGT, scheduled$/.test(u.opens) && u.state === "Last print 08:40" && /\bstale\b/.test(u.cls) && n.color === u.color && !lines.some((l) => /Live|Delayed|No new print/.test(l.state)) && errs.length === 0, { lines, errs });
    await ctx.close();
  }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
