// A results date as its source gives it (A's A-30, first step, 20 Nov 2026; web/src/lib/results.ts): the day in the
// company's own market and no time of day, as Yahoo Finance gives a time with the date that is the market's close, not
// the company's release time. On both layouts:
//   - a stock's KEY DATA: 7203.T's next results on Tokyo's day, NVIDIA's on New York's (the stand-in stamps 21:00 UTC,
//     16:00 in New York, already the next day in Singapore), each with its mark and the source: a Tokyo company's
//     "est. (Yahoo Finance)" whatever Yahoo marks, until JPX's own calendar is read (A-30; the reviewer's S5), a US
//     company's as Yahoo marks it;
//   - WATCHLIST: MY NAMES' Next results, RESULTS AHEAD (computer) and Results ahead under its days' bars (phone); MY
//     NAMES carries the same marks as RESULTS AHEAD (A's A-37, 21 Nov 2026): "conf." for a date Yahoo marks confirmed
//     (the stand-in AAPL, added to the list here), a dash where it gives no mark (the stand-in AVGO), "est." otherwise;
//   - NEWS › Results calendar: every company under the bar of its own market's day, its mark where the time was, a
//     mark the source does not give as a dash, and no time of day anywhere; from a server before 20 Nov 2026, which sent a
//     missing mark as false, no "conf." at all (the reviewer's F4).
// The expected days are worked out here with the browser's own calendar for each market, not with the page's code.
// Run from web/:  node e2e/run.cjs results-dates   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { S } = require("./standin.cjs");
const { routes } = require("./harness.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const AUTO = { size: "AUTO", compact: false, v: 2 };
const DESK = { viewport: { width: 1440, height: 900 } }, PHONE = devices["iPhone 13"];
async function page(b, opts, watch) {
  const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1 });
  await ctx.addInitScript(([pr, wl]) => { try { localStorage.setItem("om_prefs", JSON.stringify(pr)); localStorage.setItem("om_a2hs_hide", "1"); if (wl) localStorage.setItem("om_mock_watch", JSON.stringify(wl.map((symbol) => ({ symbol, name: null })))); } catch {} }, [AUTO, watch || null]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs };
}
const go = async (p, base, hash, sel) => { await p.goto(base + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel); await p.evaluate(() => document.fonts.ready); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(500); };
// a day in a market's own calendar, by the browser's Intl (not the page's code): "21 Nov 2026" and its bar "Saturday 21 Nov"
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayIn = (iso, tz) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); const y = +p.year, m = +p.month, d = +p.day; return { ymd: `${y}-${m}-${d}`, date: `${d} ${MON[m - 1]} ${y}`, bar: `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MON[m - 1]}` }; };
const TZ = (symbol, indices = []) => (/\.T$/.test(symbol) || indices.some((i) => i === "NK225" || i === "TOPIX") ? "Asia/Tokyo" : /\.HK$/.test(symbol) || indices.includes("HSI") ? "Asia/Hong_Kong" : "America/New_York");
// the mark a date carries: a Tokyo company's est. until JPX's calendar is read (A-30), anyone else's as Yahoo marks it
const markOf = (symbol, est, indices = []) => (TZ(symbol, indices) === "Asia/Tokyo" ? true : est ?? null);
const CLOCK = /\d:\d\d/;   // a time of day, in any form
const mockAnswer = (p, action, params) => p.evaluate(async ([a, q]) => { const { mockAction } = await import("/orrery-market-monitor/src/lib/mock.ts"); return mockAction(a, q); }, [action, params]);

(async () => { const b = await chromium.launch();
  for (const [dev, opts] of [["computer 1440x900", DESK], ["phone, iPhone 13", PHONE]]) {
    const phone = dev.startsWith("phone");
    console.log(`\n[a stock's KEY DATA, ${dev}]`);
    { const { ctx, p, errs } = await page(b, opts);
      for (const [sym, city, tz, mark] of [["7203.T", "Tokyo", "Asia/Tokyo", "est. (Yahoo Finance)"], ["NVDA", "New York", "America/New_York", "est. (Yahoo Finance)"]]) {
        await go(p, MOCK, `#asset/${sym}`, "#st-results");
        const at = (await mockAnswer(p, "stock", { symbol: sym })).earningsAt, want = dayIn(at, tz), sgt = dayIn(at, "Asia/Singapore");
        const v = await p.evaluate((ph) => { const val = document.querySelector("#st-results"), tr = val.closest("tr"); return { date: val.textContent, src: document.querySelector("#st-results-src")?.textContent ?? null, row: tr.textContent, tip: ph ? null : tr.getAttribute("title"), label: tr.cells[0].textContent }; }, phone);
        ck(`${sym}: "Next results" reads ${v.date} · ${v.src}, the day in ${city} of the source's stamp ${at}${sgt.date !== want.date ? ` (in Singapore it is ${sgt.date})` : ""}; no time of day`, v.date === want.date && v.src === mark && !CLOCK.test(v.row) && /^Next results/.test(v.label), { v, want, sgt });
        if (!phone) ck(`${sym}: its tooltip names the market and why there is no time ("${(v.tip ?? "").slice(0, 70)}…")`, new RegExp(`the day in ${city}, where the company is listed`).test(v.tip ?? "") && /No time of day: the source gives a time with the date but does not say that it is the company's release time\.$/.test(v.tip ?? ""), v.tip);
        if (!phone && sym === "7203.T") ck(`7203.T: est. because a Tokyo company's date is confirmed by JPX's calendar, which the Monitor does not read yet, and what Yahoo marks ("…${(v.tip ?? "").split("; ")[1]?.split(". No time")[0]}")`, /; marked est\.: a Tokyo company's date is confirmed by JPX's results calendar \(決算発表予定日\), which the Monitor does not read yet \(Yahoo marks it confirmed\)\./.test(v.tip ?? ""), v.tip);
      }
      { const at = (await mockAnswer(p, "stock", { symbol: "NVDA" })).earningsAt;
        ck(`the stand-in stamps NVIDIA's results at 21:00 UTC (${at}): a day apart in New York and in Singapore, so the check above tells the two apart`, /T21:00:00\.000Z$/.test(at) && dayIn(at, "America/New_York").date !== dayIn(at, "Asia/Singapore").date, at); }
      ck("no page errors", errs.length === 0, errs);
      await ctx.close(); }

    console.log(`\n[WATCHLIST, ${dev}]`);
    { // the stand-in list and AAPL, whose stand-in date Yahoo marks confirmed (A-37's done-when: "I add AAPL")
      const { ctx, p, errs } = await page(b, opts, [...S.watch.start, "AAPL"]);
      await go(p, MOCK, "#watch", phone ? ".mp-sec .ev-row" : '.panel[data-k="wl-earn"] tr');
      const rows = (await mockAnswer(p, "watch_list")).rows.filter((r) => r.earningsAt);
      const short = (est) => (est === true ? "est." : est === false ? "conf." : "–");
      ck(`the stand-in list holds the three marks Yahoo can give a US company's date: AAPL confirmed (${rows.find((r) => r.symbol === "AAPL")?.earningsEst}), NVDA an estimate (${rows.find((r) => r.symbol === "NVDA")?.earningsEst}), AVGO none (${rows.find((r) => r.symbol === "AVGO")?.earningsEst})`, rows.find((r) => r.symbol === "AAPL")?.earningsEst === false && rows.find((r) => r.symbol === "NVDA")?.earningsEst === true && rows.some((r) => r.symbol === "AVGO" && r.earningsEst === null), rows.map((r) => [r.symbol, r.earningsEst]));
      const want = rows.map((r) => ({ sym: r.symbol, name: r.name, est: markOf(r.symbol, r.earningsEst), ...dayIn(r.earningsAt, TZ(r.symbol)) })).sort((a, c) => a.ymd.localeCompare(c.ymd, "en", { numeric: true }));
      if (!phone) {
        const v = await p.evaluate(() => {
          const heads = [...document.querySelectorAll("table.wlT thead th")].map((t) => t.textContent), ni = heads.indexOf("Next results");
          const my = [...document.querySelectorAll("table.wlT tbody tr")].map((tr) => ({ sym: tr.querySelector(".nm .mut")?.textContent ?? "", cell: tr.cells[ni].textContent, tip: tr.cells[ni].getAttribute("title") }));
          const pn = document.querySelector('.panel[data-k="wl-earn"]');
          return { my, headTip: document.querySelectorAll("table.wlT thead th")[ni]?.getAttribute("title") ?? "", aux: pn.querySelector(".phead .aux").textContent, ahead: [...pn.querySelectorAll("tbody tr")].map((tr) => [...tr.cells].map((c) => c.textContent)), body: pn.querySelector("table")?.textContent ?? "" };
        });
        const myOk = want.every((w) => v.my.find((m) => m.sym === w.sym)?.cell === `${w.date} ${short(w.est)}`);
        ck(`MY NAMES' Next results: each name on its own market's day with its mark (${want.map((w) => `${w.sym} ${w.date} ${short(w.est)}`).join(", ")}), no time of day; the header says whose day and why, and what the marks are`, myOk && v.my.every((m) => !CLOCK.test(m.cell)) && /the day in the company's own market/.test(v.headTip) && /does not state the release time/.test(v.headTip) && /conf\. or est\. as Yahoo marks the date/.test(v.headTip) && /a dash where the source gives no mark/.test(v.headTip), { my: v.my, want });
        // A-37: a confirmed date and one the source does not mark no longer read alike, and MY NAMES agrees with RESULTS AHEAD
        const cellOf = (sym) => v.my.find((m) => m.sym === sym)?.cell ?? null, aheadOf = (sym) => v.ahead.find((r) => r[1] === rows.find((x) => x.symbol === sym)?.name)?.[2] ?? null;
        ck(`AAPL, which Yahoo marks confirmed: MY NAMES reads "${cellOf("AAPL")}" as RESULTS AHEAD reads "${aheadOf("AAPL")}"; AVGO, which Yahoo does not mark: "${cellOf("AVGO")}" and "${aheadOf("AVGO")}"; NVDA, an estimate: "${cellOf("NVDA")}" and "${aheadOf("NVDA")}"`, /^\d{1,2} [A-Z][a-z]{2} \d{4} conf\.$/.test(cellOf("AAPL") ?? "") && aheadOf("AAPL") === "confirmed" && /^\d{1,2} [A-Z][a-z]{2} \d{4} –$/.test(cellOf("AVGO") ?? "") && aheadOf("AVGO") === "–" && /^\d{1,2} [A-Z][a-z]{2} \d{4} est\.$/.test(cellOf("NVDA") ?? "") && aheadOf("NVDA") === "est.", { my: v.my, ahead: v.ahead });
        ck(`a name without a results date keeps one dash, no mark (${v.my.filter((m) => m.cell === "–").length} of ${v.my.length})`, v.my.filter((m) => m.cell === "–").length === v.my.length - want.length && v.my.length === S.watch.start.length + 1, v.my);
        ck(`RESULTS AHEAD: "${v.aux}"; ${v.ahead.length} names in the order of their days, each its date and its mark, no time of day`, v.aux === "my names · Yahoo Finance · dates only" && v.ahead.length === want.length && v.ahead.every((r, i) => r[0] === want[i].date && r[1] === want[i].name && r[2] === (want[i].est === true ? "est." : want[i].est === false ? "confirmed" : "–")) && want.some((w) => TZ(w.sym) === "Asia/Tokyo") && !CLOCK.test(v.body), { ahead: v.ahead, want });
      } else {
        const v = await p.evaluate(() => { const s = [...document.querySelectorAll(".mp-sec")].find((x) => x.querySelector("h2 span").textContent === "Results ahead");
          const out = []; let bar = null; for (const el of s.querySelectorAll(".ev-day, .ev-row")) { if (el.classList.contains("ev-day")) bar = el.textContent; else out.push({ bar, t: el.querySelector(".ev-t").textContent, n: el.querySelector(".ev-n").textContent }); }
          return { aux: s.querySelector("h2 .aux").textContent, rows: out, note: s.querySelector("#wl-results-note")?.textContent ?? "", text: s.textContent }; });
        ck(`Results ahead ("${v.aux}"): each name under the bar of its own market's day (${v.rows.map((r) => `${r.bar}: ${r.t} ${r.n}`).join("; ")}), conf. or est. where the time was`, v.aux === "Yahoo Finance · dates only" && v.rows.length === want.length && v.rows.every((r, i) => r.bar === want[i].bar && r.n === want[i].name && r.t === (want[i].est === true ? "est." : want[i].est === false ? "conf." : "–")) && !CLOCK.test(v.text), { v, want });
        ck(`its note: "${v.note}"`, /^Yahoo Finance · each company's day in its own market · no time of day: the source states no release time/.test(v.note), v.note);
        const markOn = (sym) => v.rows.find((r) => r.n === rows.find((x) => x.symbol === sym)?.name)?.t ?? null;
        ck(`A-37 on the phone: AAPL "${markOn("AAPL")}", AVGO "${markOn("AVGO")}", NVDA "${markOn("NVDA")}"`, markOn("AAPL") === "conf." && markOn("AVGO") === "–" && markOn("NVDA") === "est.", v.rows);
      }
      ck("no page errors", errs.length === 0, errs);
      await ctx.close(); }

    // the server since 20 Nov 2026 sends Yahoo's mark as Yahoo gives it and says so; one from before sent a missing mark as
    // false, which must never read as confirmed (the reviewer's F4)
    for (const [srv, extra] of [["the server since 20 Nov 2026", { estimateAsGiven: true }], ["a server from before 20 Nov 2026", {}]]) {
    console.log(`\n[NEWS › Results calendar, ${dev}, on the stand-in server: ${srv}]`);
    { const { ctx, p, errs } = await page(b, opts);
      // the stand-in rows, and one more whose mark the source does not give
      const rows = [...S.earnings, { symbol: "US99", name: "American Stand-in Unflagged", sector: "Utilities", indices: ["SP500"], mcapUsd: 99e9, at: S.earnings.find((r) => r.symbol === "US6").at, estimate: null }];
      await routes(p);
      await p.route("**/fakeapi?*", (r) => { const a = new URL(r.request().url()).searchParams.get("action"); if (a !== "earnings") return r.fallback(); r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ rows, source: S.earningsSource, ...extra }) }); });
      await go(p, STANDIN, "#news", phone ? ".mp-sec" : ".panel");
      await p.locator(".pick", { has: p.locator('.lbl:text-is("Type")') }).first().locator("select").selectOption("earnings");
      await p.locator(".pick", { has: p.locator(`.lbl:text-is("Mkt cap")`) }).first().locator("select").selectOption("all");
      await p.waitForSelector(phone ? ".ev-row.tap" : "table.ernT tr.ecrow"); await p.waitForTimeout(500);
      const v = await p.evaluate((ph) => { const out = []; let bar = null;
        for (const el of document.querySelectorAll(ph ? ".mp-scroll .ev-day, .mp-scroll .ev-row" : "table.ernT tr.cls, table.ernT tr.ecrow")) {
          if (el.matches(ph ? ".ev-day" : "tr.cls")) { bar = el.textContent; continue; }
          out.push(ph ? { bar, sym: el.querySelector(".ev-t small").textContent, mark: el.querySelector(".ev-t").firstChild.textContent, text: el.textContent } : { bar, sym: el.querySelector("td.ev .mut").textContent, mark: el.cells[0].textContent, text: el.textContent });
        }
        return { rows: out, head: ph ? null : [...document.querySelectorAll("table.ernT thead th")].map((t) => t.textContent), note: document.querySelector("#ern-note")?.textContent ?? "" }; }, phone);
      // the mark each row must carry: a Tokyo company's est.; a US one's as Yahoo marks it, where the server passes it as given
      const flag = (r) => (r.estimate === true ? true : r.estimate === false && extra.estimateAsGiven ? false : null);
      const exp = (r) => { const m = markOf(r.symbol, flag(r), r.indices); return { bar: dayIn(r.at, TZ(r.symbol, r.indices)).bar, mark: m === true ? "est." : m === false ? "conf." : "–" }; };
      const bad = v.rows.filter((x) => { const r = rows.find((y) => y.symbol === x.sym); return !r || x.bar !== exp(r).bar || x.mark !== exp(r).mark || CLOCK.test(x.text); });
      const marks = (re) => v.rows.filter((x) => re.test(x.sym)).map((x) => x.mark);
      const jp = marks(/^(JP\d|\d{4}\.T)/), us = v.rows.filter((x) => /^US\d/.test(x.sym)), usApart = us.filter((x) => { const r = rows.find((y) => y.symbol === x.sym); return dayIn(r.at, "Asia/Singapore").bar !== x.bar; });
      const usFalse = rows.filter((r) => /^US\d/.test(r.symbol) && r.estimate === false).map((r) => v.rows.find((x) => x.sym === r.symbol)?.mark);
      ck(`all ${rows.length} companies, each under the bar of its own market's day with its mark (a Tokyo company's est. ×${jp.length}; a US company's as Yahoo marks it, a dash where it gives none) and no time of day`, v.rows.length === rows.length && bad.length === 0 && v.rows.find((x) => x.sym === "US99")?.mark === "–" && jp.length > 5 && jp.every((m) => m === "est."), { bad: bad.slice(0, 4), n: v.rows.length });
      if (extra.estimateAsGiven) ck(`a US company Yahoo marks confirmed reads conf. (${usFalse.length} of them)`, usFalse.length > 3 && usFalse.every((m) => m === "conf."), usFalse);
      else ck(`from a server before: a false mark is not a confirmation, so no row reads conf. (the ${usFalse.length} US companies Yahoo's false reached read "${[...new Set(usFalse)].join(", ")}")`, usFalse.length > 3 && usFalse.every((m) => m === "–") && !v.rows.some((x) => x.mark === "conf."), usFalse);
      ck(`the US companies (stamped 21:00 UTC, 16:00 in New York) sit under New York's day, not Singapore's: ${usApart.length} of ${us.length}`, us.length > 10 && usApart.length === us.length, { us: us.slice(0, 3) });
      ck(`the bars run in order, each day once (${[...new Set(v.rows.map((x) => x.bar))].slice(0, 4).join(", ")} …)`, new Set(v.rows.map((x) => x.bar)).size === [...v.rows.map((x) => x.bar)].filter((x, i, a) => i === 0 || a[i - 1] !== x).length, v.rows.map((x) => x.bar));
      ck(`the line under the picks: "${v.note.slice(0, 160)}…"${phone ? "" : `; the first column is "${v.head?.[0]}"`}`, /Yahoo Finance · each company's day in its own market · no time of day: the source states no release time · conf\. or est\. as Yahoo marks the date; a Tokyo company's est\. until JPX's own calendar is read/.test(v.note) && (phone || v.head?.[0] === "Date"), { note: v.note, head: v.head });
      ck("no page errors", errs.length === 0, errs);
      await ctx.close(); }
    }
  }
  await b.close();
  console.log(fails ? `\n${fails} check(s) failed` : "\nall checks passed");
  process.exit(fails ? 1 : 0);
})();
