// When a closed market opens (the owner's request of 20 Nov 2026): wherever the Monitor says CLOSED it says when that
// market next opens, in SGT ("opens 22:30 SGT" today in Singapore, "opens 23 Nov 22:30 SGT" on another day), on both
// layouts, with nothing cut. The clock is never the machine's: the local copy's own (`om_mock_now`, lib/mockclock.ts,
// which also makes its stand-in rows follow the session table) at the moments below, and Playwright's fixed clock for
// the page as the live server feeds it (the stand-in API of this suite).
//   - the owner's moment (Fri 20 Nov 2026, 21:16 SGT): New York "opens 22:30 SGT"; Tokyo's next open passes over Monday
//     23 Nov, a holiday in JPX's calendar; Hong Kong's and Seoul's are "scheduled" (their holidays are not held);
//   - a weekend (the longest lines), Tokyo's holiday, a midday break (Tokyo; Hong Kong and Shanghai), New York's early
//     close on 27 Nov 2026, and a session's first minutes on a delayed feed (LAST PRINT, "open since 08:00 SGT");
//   - chart tiles, MARKETS and RATES & FX rows' tooltips, the header's market chips, the phone's lines and opened rows,
//     a stock's and an instrument's page, EQUITIES, WATCHLIST (its "Closed now" line), on a computer and a phone;
//   - nothing cut at the designer's sizes (plan review §3.7): C1 to C8, an iPhone SE and an iPhone 13;
//   - the page with the server users have now: its `health` calendar and its `table` rows; a calendar that does not
//     come ("scheduled"); a stock on an exchange the Monitor keeps no hours for (no CLOSED, no opening).
// Run from web/:  node e2e/run.cjs opens   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };

// the moments (UTC), each well clear of a session's start or end and of midnight in Singapore
const OWNER = "2026-11-20T13:16:00Z";   // Fri 20 Nov 21:16 SGT: New York 08:16, shut; opens 22:30 SGT
const NYOPEN = "2026-11-20T15:00:00Z";  // Fri 20 Nov 23:00 SGT: New York open
const SAT = "2026-11-21T02:00:00Z";     // Sat 21 Nov 10:00 SGT: every market shut but crypto
const HOL = "2026-11-23T02:00:00Z";     // Mon 23 Nov 10:00 SGT: Tokyo's holiday
const DELAY = "2026-11-24T00:05:00Z";   // Tue 24 Nov 08:05 SGT: Tokyo five minutes into its session, its feed 20 minutes behind
const BRK = "2026-11-24T02:45:00Z";     // Tue 24 Nov 10:45 SGT: Tokyo's midday break
const BRK2 = "2026-11-24T04:30:00Z";    // Tue 24 Nov 12:30 SGT: Hong Kong's and Shanghai's
const EARLY = "2026-11-27T18:30:00Z";   // Sat 28 Nov 02:30 SGT: New York at 13:30 on the day it closes at 13:00

const SIZES = {   // the designer's sizes (plan review §3.7)
  C1: { vp: [1440, 900], prefs: { size: "AUTO", compact: false } }, C2: { vp: [1280, 720], prefs: { size: "AUTO", compact: false } },
  C3: { vp: [1440, 900], prefs: { size: "XL", compact: false } }, C4: { vp: [1440, 900], prefs: { size: "AUTO", compact: true } },
  C5: { vp: [1440, 900], prefs: { size: "XL", compact: true } }, C6: { vp: [1920, 1080], prefs: { size: "AUTO", compact: false } },
  C7: { vp: [2560, 1440], prefs: { size: "AUTO", compact: false } }, C8: { vp: [1440, 900], prefs: { size: "S", compact: false } },
  P1: { dev: "iPhone SE (3rd gen)" }, P2: { dev: "iPhone 13" },
};
async function page(b, code, clock, extra) {
  const z = SIZES[code], opts = z.dev ? { ...devices[z.dev] } : { viewport: { width: z.vp[0], height: z.vp[1] } };
  const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1 });
  await ctx.addInitScript(([pr, at, more]) => { try { if (pr) localStorage.setItem("om_prefs", JSON.stringify({ ...pr, v: 2 })); if (at) localStorage.setItem("om_mock_now", at); for (const [k, v] of Object.entries(more || {})) localStorage.setItem(k, v); localStorage.setItem("om_a2hs_hide", "1"); } catch {} }, [z.prefs || null, clock || null, extra || null]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs, phone: !!z.dev };
}
const go = async (p, base, hash, sel) => { await p.goto(base + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); await p.evaluate(() => document.fonts.ready); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(350); };

// every chart tile that shows a stamp: its label, the stamp, the opening beside it, and whether that is whole
const tiles = (p) => p.evaluate(() => [...document.querySelectorAll(".mtile.cp")].map((t) => {
  const vis = (e) => !!e && e.checkVisibility() && e.getBoundingClientRect().width > 0;
  const as = t.querySelector(":scope > .vl > .tags > .asof"); if (!vis(as)) return null;
  const o = [...t.querySelectorAll(".opens")].find(vis) ?? null, tr = t.getBoundingClientRect(), ar = as.getBoundingClientRect(), r = o?.getBoundingClientRect(), cv = t.querySelector(":scope > .ch > .chv")?.getBoundingClientRect();
  const apart = (a, b2) => a.left >= b2.right - 0.5 || a.right <= b2.left + 0.5 || a.top >= b2.bottom - 0.5 || a.bottom <= b2.top + 0.5;
  return { name: t.querySelector(".lbtxt")?.textContent ?? "", label: as.querySelector(".st").textContent, stamp: as.textContent.replace(/\s+/g, " ").trim(), live: t.classList.contains("live"), opens: o?.textContent ?? null, tip: o?.getAttribute("title") ?? null,
    whole: !o || (o.scrollWidth <= o.clientWidth + 1 && r.left >= tr.left - 0.5 && r.right <= tr.right + 0.5 && r.bottom <= tr.bottom + 0.5 && r.top >= tr.top - 0.5),
    clear: !o || ((!cv || apart(r, cv)) && apart(r, ar)), below: !o ? null : r.top >= ar.top - 1.5, fs: o ? parseFloat(getComputedStyle(o).fontSize) : null, oneLine: !o ? null : r.height <= parseFloat(getComputedStyle(o).lineHeight || "0") * 1.6 || r.height <= 18 };
}).filter(Boolean));
// every instrument line of a phone list: its state, the opening, and whether the line under the name is whole
const lines = (p) => p.evaluate(() => [...document.querySelectorAll(".mp-row.inst")].map((r) => {
  const st = r.querySelector(".mp-st"), o = st.querySelector(".opens"), sr = st.getBoundingClientRect(), px = r.querySelector(".mp-px").getBoundingClientRect(), pill = r.querySelector(".mp-chg").getBoundingClientRect(), nm = r.querySelector(".n").getBoundingClientRect();
  const kids = [...st.children].map((c) => c.getBoundingClientRect());
  return { n: r.querySelector(".n").textContent, state: st.firstElementChild?.textContent ?? "", opens: o?.textContent ?? null, tip: o?.getAttribute("title") ?? null, h: Math.round(r.getBoundingClientRect().height), fs: parseFloat(getComputedStyle(st).fontSize),
    rows: new Set(kids.map((k) => Math.round(k.top))).size, whole: st.scrollWidth <= st.clientWidth + 1 && kids.every((k) => k.right <= sr.right + 0.5 && k.left >= sr.left - 0.5),
    clear: sr.top >= nm.bottom - 1 && sr.top >= px.bottom - 1 && kids.every((k) => k.right <= pill.left + 0.5), ox: document.documentElement.scrollWidth - innerWidth };
}));
const chips = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll("#mktstat .mk")].map((c) => [c.firstChild.textContent, { cls: c.className.replace("mk ", ""), lt: c.querySelector(".lt").textContent, tip: c.getAttribute("title") }])));
const rowTips = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll("table.mkt tbody tr:not(.cls), table.mini tbody tr.click")].map((tr) => [tr.querySelector("a.lnk")?.textContent ?? "", tr.getAttribute("title")])));
const by = (xs, name) => xs.find((x) => x.name === name || x.n === name);

(async () => { const b = await chromium.launch();
  console.log("\n[the owner's moment, Fri 20 Nov 2026 21:16 SGT: MARKETS on a computer, 1440x900]");
  { const { ctx, p, errs } = await page(b, "C1", OWNER);
    await go(p, MOCK, "#market", ".mtile.cp .asof");
    await p.locator(".mtile.cp").first().scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
    const t = await tiles(p), sp = by(t, "S&P 500"), nk = by(t, "Nikkei 225"), ks = by(t, "KOSPI"), hs = by(t, "Hang Seng"), fut = by(t, "Nikkei 225 future (CME)"), jpy = by(t, "USD/JPY");
    ck(`the S&P 500's tile: "${sp?.stamp}" and "${sp?.opens}" (New York opens at 09:30 there, 22:30 in Singapore since 1 Nov)`, sp?.label === "CLOSED" && sp.stamp === "CLOSED 05:00 SGT" && sp.opens === "opens 22:30 SGT", sp);
    ck(`its tooltip: "${sp?.tip}"`, sp?.tip === "New York: regular session 09:30–16:00 ET. Next opens 20 Nov 22:30 SGT. Holidays and early closes: NYSE's calendar.", sp?.tip);
    ck(`the Nikkei 225's: "${nk?.stamp}" and "${nk?.opens}": Tuesday, as Monday 23 Nov is a holiday in JPX's calendar ("${nk?.tip}")`, nk?.stamp === "CLOSED 14:30 SGT" && nk.opens === "opens 24 Nov 08:00 SGT" && /23 Nov 2026: a holiday in JPX's calendar\. Next opens 24 Nov 08:00 SGT\. Holidays: JPX's calendar\.$/.test(nk.tip), nk);
    ck(`markets whose holidays the Monitor does not hold say the scheduled time: KOSPI "${ks?.opens}", Hang Seng "${hs?.opens}"`, ks?.opens === "opens 23 Nov 08:00 SGT, scheduled" && hs?.opens === "opens 23 Nov 09:30 SGT, scheduled" && /^Hong Kong: regular session 09:30–12:00, 13:00–16:00 HKT\. Scheduled to open 23 Nov 09:30 SGT\. The Monitor does not hold this market's holidays: on one the market stays shut\.$/.test(hs.tip), { ks, hs });
    ck(`a market that is open has no such line: the Nikkei future "${fut?.stamp}", USD/JPY "${jpy?.stamp}"`, fut?.label === "LIVE" && fut.opens === null && fut.live && jpy?.label === "LIVE" && jpy.opens === null, { fut, jpy });
    const pub = t.filter((x) => x.label === "PUBLISHED");
    ck(`an official yield, published once a day, has none either (${pub.map((x) => `${x.name}: ${x.stamp}`).join("; ")})`, pub.length === 2 && pub.every((x) => x.opens === null), pub);
    const closed = t.filter((x) => x.label === "CLOSED"), other = t.filter((x) => x.label !== "CLOSED");
    ck(`every tile that says CLOSED says when its market opens (${closed.length} of ${t.length}); no other tile does`, closed.length >= 9 && closed.every((x) => /^opens (\d{1,2} [A-Z][a-z]{2} )?\d\d:\d\d SGT(, scheduled)?$/.test(x.opens ?? "")) && other.every((x) => x.opens === null), { closed: closed.filter((x) => !x.opens), other: other.filter((x) => x.opens) });
    // (how many lines a long one takes depends on the font the machine has: only the short one is held to one line)
    ck("the opening is whole, under the stamp and clear of the change beside it; New York's short one on one line", closed.every((x) => x.whole && x.below && x.clear && x.fs >= 9) && sp.oneLine, closed.filter((x) => !(x.whole && x.below && x.clear)));
    const tips = await rowTips(p);
    ck(`a table row's tooltip says it too: "${tips["S&P 500"]}"; an open market's: "…${(tips["USD/JPY"] ?? "").split(" · ").slice(-2).join(" · ")}"`, /^\^GSPC · Yahoo Finance · last print 20 Nov 2026 05:00 SGT · market closed · opens 22:30 SGT · open its page$/.test(tips["S&P 500"]) && / · market open · open its page$/.test(tips["USD/JPY"]) && /^JGB10Y · Japan MOF · published for \d{1,2} [A-Z][a-z]{2} \d{4} · open its page$/.test(tips["JGB 10Y"]), { sp: tips["S&P 500"], jpy: tips["USD/JPY"], jgb: tips["JGB 10Y"] });
    const c = await chips(p);
    ck(`and the header's market chips: NYSE "${c.NYSE?.tip}", TSE "${c.TSE?.tip}", HKEX "${c.HKEX?.tip}"`, c.NYSE?.tip === "New York CLOSED at 08:16 ET · opens 22:30 SGT" && c.TSE?.tip === "Tokyo CLOSED at 22:16 JST · opens 24 Nov 08:00 SGT" && c.HKEX?.tip === "Hong Kong CLOSED at 21:16 HKT · opens 23 Nov 09:30 SGT, scheduled" && c.NYSE.lt === "–", c);
    ck("no script error", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[the same moment on a phone (iPhone 13): the lines of MARKETS, and an opened row]");
  { const { ctx, p, errs } = await page(b, "P2", OWNER);
    await go(p, MOCK, "#market", ".mp-row.inst");
    const l = await lines(p), sp = by(l, "S&P 500"), nk = by(l, "Nikkei 225"), hs = by(l, "Hang Seng"), jpy = by(l, "USD/JPY"), fut = by(l, "NK225 fut"), y2 = by(l, "UST 2Y");
    ck(`under the S&P 500's name: "${sp?.state}" and "${sp?.opens}"; the Nikkei 225's "${nk?.opens}"; Hang Seng's "${hs?.opens}"`, sp?.state === "Closed" && sp.opens === "opens 22:30 SGT" && nk?.opens === "opens 24 Nov 08:00 SGT" && hs?.opens === "opens 23 Nov 09:30 SGT, scheduled", { sp, nk, hs });
    ck(`open markets keep their state alone (USD/JPY "${jpy?.state}", the Nikkei future "${fut?.state}"); an official yield says "${y2?.state}", not Closed`, jpy?.state === "Live" && jpy.opens === null && /^Delayed ~10m$/.test(fut?.state ?? "") && fut.opens === null && /^Published \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(y2?.state ?? "") && y2.opens === null, { jpy, fut, y2 });
    const closed = l.filter((x) => x.state === "Closed");
    ck(`every line that says Closed says when its market opens (${closed.length} of ${l.length}); no other line does`, closed.length >= 9 && closed.every((x) => /^opens /.test(x.opens ?? "")) && l.filter((x) => x.state !== "Closed").every((x) => x.opens === null), l.filter((x) => (x.state === "Closed") !== !!x.opens));
    // (whether the longest state and opening share one row depends on the machine's font: New York's short one must)
    ck(`each line whole under the name and the level, clear of the change pill, at ${l[0]?.fs}px (lines ${[...new Set(l.map((x) => x.h))].join(" and ")}px high here); "Closed" and "opens 22:30 SGT" on one row; no sideways scroll`, l.every((x) => x.whole && x.clear && x.fs >= 11 && x.ox <= 0) && sp.rows === 1, l.filter((x) => !(x.whole && x.clear)));
    await p.locator(".mp-row.inst", { has: p.locator(".n", { hasText: /^S&P 500$/ }) }).tap(); await p.waitForSelector(".mp-item.open .mp-full");
    const full = await p.locator(".mp-item.open .mp-full").textContent();
    ck(`opened, its line reads "${full}"`, full === "S&P 500 · ^GSPC · Yahoo Finance · last print 20 Nov 2026 05:00 SGT · market closed · opens 22:30 SGT", full);
    ck("no script error", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[a weekend, Sat 21 Nov 10:00 SGT (the longest lines): nothing cut at the designer's sizes]");
  for (const code of ["C1", "C2", "C3", "C6", "C7", "C8"]) {
    const { ctx, p, errs } = await page(b, code, SAT);
    for (const [hash, sel, what] of [["#market", ".mtile.cp .asof", "MARKETS"], ["#rates", ".panel[data-k='pairs'] .mtile.cp .asof", "RATES & FX"], ["#equities/sp500", ".bigwrap .asof", "EQUITIES"], ["#asset/NVDA", ".bigwrap .asof", "a stock's page"], ["#asset/USDJPY%3DX", ".bigwrap .asof", "an instrument's page"]]) {
      await go(p, MOCK, hash, sel);
      // tiles ask for their place as they come near the screen: walk the page once so every tile on it is drawn
      await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); }); await p.waitForTimeout(250);
      const t = await tiles(p), closed = t.filter((x) => x.label === "CLOSED"), ox = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      ck(`${code} ${what}: ${closed.length} tiles say CLOSED, each with its opening whole and clear of the stamp and the change (the longest: "${[...closed].sort((a, z2) => (z2.opens ?? "").length - (a.opens ?? "").length)[0]?.opens}"); no sideways scroll`, closed.length >= 1 && closed.every((x) => /^opens \d{1,2} Nov \d\d:\d\d SGT(, scheduled)?$/.test(x.opens ?? "") && x.whole && x.clear && x.below && x.fs >= 9) && t.filter((x) => x.label !== "CLOSED").every((x) => x.opens === null) && ox <= 0, { bad: closed.filter((x) => !(x.whole && x.clear && x.below && x.opens)), ox });
    }
    ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
  }
  for (const code of ["C4", "C5"]) {   // the one-screen layout: its tiles show no stamp, so no opening; the rows' tooltips say it
    const { ctx, p, errs } = await page(b, code, SAT);
    await go(p, MOCK, "#market", "table.mkt tbody tr:not(.cls)");
    const term = await p.evaluate(() => document.body.classList.contains("term"));
    const shown = await p.evaluate(() => [...document.querySelectorAll(".mtile.cp .opens")].filter((e) => e.checkVisibility() && e.getBoundingClientRect().width > 0).length), stamps = await p.evaluate(() => [...document.querySelectorAll(".mtile.cp .asof")].filter((e) => e.checkVisibility() && e.getBoundingClientRect().width > 0).length);
    const tips = await rowTips(p), ox = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (term) ck(`${code} (one screen): its tiles show neither a stamp nor an opening; a row's tooltip does ("…${(tips["S&P 500"] ?? "").split(" · ").slice(-3).join(" · ")}")`, shown === 0 && stamps === 0 && / · market closed · opens 23 Nov 22:30 SGT · open its page$/.test(tips["S&P 500"] ?? ""), { shown, stamps, tip: tips["S&P 500"] });
    else { const t = await tiles(p); ck(`${code} (the one-screen layout gives way to the scrolling one at this size): every CLOSED tile with its opening whole`, t.filter((x) => x.label === "CLOSED").every((x) => x.opens && x.whole && x.clear) && ox <= 0, t.filter((x) => x.label === "CLOSED" && !(x.opens && x.whole && x.clear))); }
    ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
  }
  for (const code of ["P1", "P2"]) {
    const { ctx, p, errs } = await page(b, code, SAT);
    for (const [hash, what] of [["#market", "MARKETS"], ["#rates", "RATES & FX"], ["#equities/sp500", "EQUITIES"]]) {
      await go(p, MOCK, hash, ".mp-row.inst");
      const l = await lines(p), closed = l.filter((x) => x.state === "Closed");
      ck(`${code} ${what}: ${closed.length} lines say Closed, each with its opening whole and clear of the level and the pill (the longest: "${[...closed].sort((a, z2) => (z2.opens ?? "").length - (a.opens ?? "").length)[0]?.opens}"), type ${l[0]?.fs}px; no sideways scroll`, closed.length >= 1 && closed.every((x) => /^opens \d{1,2} Nov \d\d:\d\d SGT(, scheduled)?$/.test(x.opens ?? "")) && l.every((x) => x.whole && x.clear && x.fs >= 11 && x.ox <= 0) && l.filter((x) => x.state !== "Closed").every((x) => x.opens === null), l.filter((x) => !(x.whole && x.clear)));
    }
    for (const [hash, what] of [["#asset/NVDA", "a stock's page"], ["#asset/USDJPY%3DX", "an instrument's page"]]) {
      await go(p, MOCK, hash, ".mp-hero .asof");
      const t = await tiles(p), h = t[0], ox = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      ck(`${code} ${what}: "${h?.stamp}" and "${h?.opens}", whole, type ${h?.fs}px; no sideways scroll`, h?.label === "CLOSED" && /^opens 23 Nov \d\d:\d\d SGT(, scheduled)?$/.test(h.opens ?? "") && h.whole && h.clear && h.fs >= 11 && ox <= 0, { h, ox });
    }
    ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
  }

  console.log("\n[RATES & FX on a weekend: the FX rows and tiles]");
  { const { ctx, p, errs } = await page(b, "C1", SAT);
    await go(p, MOCK, "#rates", ".panel[data-k='pairs'] .mtile.cp .asof");
    const tips = await rowTips(p), t = await tiles(p), jpy = by(t, "USD/JPY");
    ck(`a pair's row: "${tips["USD/JPY"]}"`, tips["USD/JPY"] === "USD/JPY (USDJPY=X) · Yahoo Finance · last print 21 Nov 2026 06:00 SGT · market closed · opens 23 Nov 05:00 SGT, scheduled · open its page", tips["USD/JPY"]);
    ck(`its tile: "${jpy?.stamp}" and "${jpy?.opens}" ("${jpy?.tip}")`, jpy?.stamp === "CLOSED 06:00 SGT" && jpy.opens === "opens 23 Nov 05:00 SGT, scheduled" && /^FX: trades Monday 05:00 to Saturday 06:00 SGT\. Scheduled to open 23 Nov 05:00 SGT\./.test(jpy.tip), jpy);
    ck("no script error", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[a holiday: Tokyo on Mon 23 Nov 2026, 10:00 SGT]");
  { const { ctx, p, errs } = await page(b, "C1", HOL);
    await go(p, MOCK, "#market", ".mtile.cp .asof");
    const c = await chips(p), t = await tiles(p), nk = by(t, "Nikkei 225"), sp = by(t, "S&P 500"), hs = by(t, "Hang Seng");
    ck(`the header says HOL for Tokyo ("${c.TSE?.tip}")`, c.TSE?.cls === "holiday" && c.TSE.lt === "HOL" && c.TSE.tip === "Tokyo HOLIDAY at 11:00 JST · opens 24 Nov 08:00 SGT", c.TSE);
    ck(`the Nikkei 225 does not say it opens today: "${nk?.stamp}" and "${nk?.opens}" ("${nk?.tip}")`, nk?.stamp === "CLOSED 20 Nov 14:30 SGT" && nk.opens === "opens 24 Nov 08:00 SGT" && nk.tip === "Tokyo: regular session 09:00–11:30, 12:30–15:30 JST. Shut today: a holiday in JPX's calendar. Next opens 24 Nov 08:00 SGT. Holidays: JPX's calendar.", nk);
    ck(`New York that Monday: "${sp?.opens}"; Hong Kong is trading (${hs?.stamp})`, sp?.opens === "opens 22:30 SGT" && hs?.label === "LIVE" && hs.opens === null, { sp, hs });
    await go(p, MOCK, "#asset/7203.T", ".bigwrap .asof");
    const s = (await tiles(p))[0];
    ck(`a Tokyo stock's page: "${s?.stamp}" and "${s?.opens}", after the stamp on its line`, s?.stamp === "CLOSED 20 Nov 14:30 SGT" && s.opens === "opens 24 Nov 08:00 SGT" && s.whole && s.clear && !s.live, s);
    await go(p, MOCK, "#equities/nk225", ".bigwrap .asof");
    const e = await tiles(p), ix = by(e, "Nikkei 225");
    ck(`EQUITIES, the Nikkei 225: "${ix?.stamp}" and "${ix?.opens}"; its drivers' tiles whole (${e.length - 1})`, ix?.opens === "opens 24 Nov 08:00 SGT" && e.length === 5 && e.every((x) => x.whole && x.clear && (x.label === "CLOSED") === !!x.opens), e.filter((x) => !(x.whole && x.clear)));
    ck("no script error", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, "P1", HOL);
    await go(p, MOCK, "#equities/nk225", ".mp-row.inst.fixed");
    const l = await lines(p), ix = by(l, "Nikkei 225");
    ck(`on a phone (iPhone SE), EQUITIES' index line: "${ix?.state}" and "${ix?.opens}", whole`, ix?.state === "Closed" && ix.opens === "opens 24 Nov 08:00 SGT" && l.every((x) => x.whole && x.clear), l);
    await go(p, MOCK, "#asset/7203.T", ".mp-hero .asof");
    const s = (await tiles(p))[0];
    ck(`and a Tokyo stock's page: "${s?.stamp}" and "${s?.opens}"`, s?.stamp === "CLOSED 20 Nov 14:30 SGT" && s.opens === "opens 24 Nov 08:00 SGT" && s.whole && s.fs >= 11, s);
    ck("no script error", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[a midday break: Tokyo at 10:45 SGT; Hong Kong and Shanghai at 12:30 SGT]");
  { const { ctx, p, errs } = await page(b, "C1", BRK);
    await go(p, MOCK, "#market", ".mtile.cp .asof");
    const c = await chips(p), nk = by(await tiles(p), "Nikkei 225");
    ck(`Tokyo in its break: the header says BRK ("${c.TSE?.tip}"); the Nikkei 225 "${nk?.stamp}" and "${nk?.opens}" ("…${(nk?.tip ?? "").split(". ").slice(1, 3).join(". ")}")`, c.TSE?.lt === "BRK" && c.TSE.tip === "Tokyo BREAK at 11:45 JST · opens 11:30 SGT" && nk?.stamp === "CLOSED 10:30 SGT" && nk.opens === "opens 11:30 SGT" && / In its midday break\. Next opens 24 Nov 11:30 SGT\. /.test(nk.tip), { c: c.TSE, nk });
    ck("no script error", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, "P2", BRK2);
    await go(p, MOCK, "#market", ".mp-row.inst");
    const l = await lines(p), hs = by(l, "Hang Seng"), sh = by(l, "Shanghai"), nk = by(l, "Nikkei 225");
    ck(`on a phone, Hong Kong and Shanghai in theirs: "${hs?.state}" "${hs?.opens}", "${sh?.opens}"; Tokyo is back (${nk?.state})`, hs?.state === "Closed" && hs.opens === "opens 13:00 SGT, scheduled" && sh?.opens === "opens 13:00 SGT, scheduled" && /^Delayed ~20m$/.test(nk?.state ?? "") && nk.opens === null && l.every((x) => x.whole && x.clear), { hs, sh, nk });
    ck("no script error", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[an early close: New York on Fri 27 Nov 2026, the day after Thanksgiving, at 13:30 there]");
  { const { ctx, p, errs } = await page(b, "C1", EARLY);
    await go(p, MOCK, "#market", ".mtile.cp .asof");
    const c = await chips(p), sp = by(await tiles(p), "S&P 500");
    ck(`New York is not LIVE after 13:00: the header "${c.NYSE?.tip}"; the S&P 500 "${sp?.stamp}" and "${sp?.opens}"`, c.NYSE?.cls === "closed" && c.NYSE.tip === "New York CLOSED at 13:30 ET · opens 30 Nov 22:30 SGT" && sp?.stamp === "CLOSED 02:00 SGT" && sp.opens === "opens 30 Nov 22:30 SGT" && !sp.live, { c: c.NYSE, sp });
    ck(`and says why: "${sp?.tip}"`, sp?.tip === "New York: regular session 09:30–16:00 ET. Closed early today, at 13:00 ET (NYSE's calendar). Next opens 30 Nov 22:30 SGT. Holidays and early closes: NYSE's calendar.", sp?.tip);
    ck("no script error", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[a session's first minutes on a delayed feed: Tokyo at 08:05 SGT, Tue 24 Nov]");
  { const { ctx, p, errs } = await page(b, "C1", DELAY);
    await go(p, MOCK, "#market", ".mtile.cp .asof");
    const t = await tiles(p), nk = by(t, "Nikkei 225"), ks = by(t, "KOSPI"), tips = await rowTips(p);
    ck(`the Nikkei 225 is not called closed: "${nk?.stamp}" and "${nk?.opens}" ("${nk?.tip}")`, nk?.label === "LAST PRINT" && nk.stamp === "LAST PRINT 20 Nov 14:30 SGT" && nk.opens === "open since 08:00 SGT" && nk.whole && nk.clear && /^Tokyo: regular session 09:00–11:30, 12:30–15:30 JST; in session since 24 Nov 08:00 SGT\. The last print the Monitor has is older than a live one; this feed is delayed about 20 minutes\. Holidays: JPX's calendar\.$/.test(nk.tip), nk);
    ck(`Seoul's, whose holidays are not held: "${ks?.stamp}" and "${ks?.opens}"; the row's tooltip "…${(tips["Nikkei 225"] ?? "").split(" · ").slice(-3).join(" · ")}"`, ks?.stamp === "LAST PRINT 23 Nov 14:30 SGT" && ks.opens === "open since 08:00 SGT, scheduled" && / · no new print · open since 08:00 SGT · open its page$/.test(tips["Nikkei 225"] ?? ""), { ks, tip: tips["Nikkei 225"] });
    ck("no tile says CLOSED without an opening", t.filter((x) => x.label === "CLOSED").every((x) => /^opens /.test(x.opens ?? "")), t.filter((x) => x.label === "CLOSED" && !x.opens));
    ck("no script error", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, "P1", DELAY);
    await go(p, MOCK, "#market", ".mp-row.inst");
    const l = await lines(p), nk = by(l, "Nikkei 225");
    ck(`on a phone (iPhone SE): "${nk?.state}" and "${nk?.opens}", whole`, nk?.state === "No new print" && nk.opens === "open since 08:00 SGT" && l.every((x) => x.whole && x.clear), l.filter((x) => !(x.whole && x.clear)));
    ck("no script error", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[a stock's page: LIVE in its exchange's hours, CLOSED with the opening outside them]");
  { const { ctx, p, errs } = await page(b, "C1", NYOPEN);
    await go(p, MOCK, "#asset/NVDA", ".bigwrap .asof");
    const s = (await tiles(p))[0];
    ck(`NVDA at 23:00 SGT, New York open: "${s?.stamp}", no opening (it said CLOSED at every hour before)`, s?.stamp === "LIVE 23:00 SGT" && s.opens === null && s.live, s);
    ck("no script error", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, "C1", OWNER);
    await go(p, MOCK, "#asset/NVDA", ".bigwrap .asof");
    const s = (await tiles(p))[0];
    ck(`NVDA at the owner's moment: "${s?.stamp}" and "${s?.opens}"`, s?.stamp === "CLOSED 05:00 SGT" && s.opens === "opens 22:30 SGT" && !s.live && s.whole && s.clear, s);
    await go(p, MOCK, "#asset/MC.PA", ".bigwrap .asof");
    const fr = (await tiles(p))[0];
    ck(`a stock on an exchange the Monitor keeps no hours for (MC.PA): "${fr?.stamp}", neither CLOSED nor an opening (it was read as New York's)`, fr?.label === "LAST PRINT" && fr.opens === null, fr);
    await go(p, MOCK, "#asset/%5EAXJO", ".bigwrap .asof");
    const ix = (await tiles(p))[0];
    ck(`an index outside the Monitor's table (^AXJO): "${ix?.stamp}", no opening`, ix?.label === "LAST PRINT" && ix.opens === null, ix);
    await go(p, MOCK, "#asset/JGB10Y", ".bigwrap .asof");
    const jg = (await tiles(p))[0];
    ck(`an official yield's page: "${jg?.stamp}", no opening`, jg?.label === "PUBLISHED" && jg.opens === null, jg);
    ck("no script error", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[WATCHLIST: one line for the markets of my names that are shut]");
  { const { ctx, p, errs } = await page(b, "C1", OWNER);
    await go(p, MOCK, "#watch", ".panel[data-k='wl'] tbody tr");
    const w = await p.evaluate(() => { const o = document.querySelector("#wl-opens"), pn = document.querySelector(".panel[data-k='wl'] .pbody").getBoundingClientRect(), r = o?.getBoundingClientRect(); return { line: o?.textContent ?? null, whole: !!o && o.scrollWidth <= o.clientWidth + 1 && r.left >= pn.left - 0.5 && r.right <= pn.right + 0.5, tips: Object.fromEntries([...document.querySelectorAll(".panel[data-k='wl'] tbody tr")].map((tr) => [tr.querySelector("td.nm .mut").textContent, tr.querySelector("td.asof").getAttribute("title")])) }; });
    ck(`under MY NAMES: "${w.line}"`, w.line === "Closed now: New York opens 22:30 SGT · Tokyo opens 24 Nov 08:00 SGT" && w.whole, w);
    ck(`a row's AS OF tooltip: NVDA "${w.tips.NVDA}"; USD/JPY, whose market is open, "${w.tips["USDJPY=X"]}"`, /^Yahoo Finance · close of \d{1,2} [A-Z][a-z]{2} \d{4} · market closed · opens 22:30 SGT$/.test(w.tips.NVDA) && /^Yahoo Finance · last print 20 Nov 2026 21:16 SGT$/.test(w.tips["USDJPY=X"]) && / · market closed · opens 24 Nov 08:00 SGT$/.test(w.tips["7203.T"]), w.tips);
    ck("no script error", errs.length === 0, errs); await ctx.close(); }
  for (const code of ["P1", "P2"]) {
    const { ctx, p, errs } = await page(b, code, SAT);
    await go(p, MOCK, "#watch", ".mp-row.starred");
    const w = await p.evaluate(() => { const o = document.querySelector("#wl-opens"), c = o?.closest(".mp-sec")?.getBoundingClientRect(), r = o?.getBoundingClientRect(); return { line: o?.textContent ?? null, whole: !!o && o.scrollWidth <= o.clientWidth + 1 && r.left >= c.left - 0.5 && r.right <= c.right + 0.5, fs: o ? parseFloat(getComputedStyle(o).fontSize) : 0, ox: document.documentElement.scrollWidth - innerWidth, n: document.querySelectorAll(".mp-row.starred").length }; });
    ck(`${code}, a weekend: "${w.line}", whole in its note under the ${w.n} names, type ${w.fs}px; no sideways scroll`, w.line === "Closed now: FX opens 23 Nov 05:00 SGT, scheduled · CME Globex opens 23 Nov 07:00 SGT, scheduled · New York opens 23 Nov 22:30 SGT · Tokyo opens 24 Nov 08:00 SGT." && w.whole && w.fs >= 11 && w.ox <= 0 && w.n === 10, w);
    ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
  }
  { const { ctx, p, errs } = await page(b, "C1", NYOPEN, { om_mock_watch: JSON.stringify([{ symbol: "NVDA", name: null }, { symbol: "USDJPY=X", name: null }]) });
    await go(p, MOCK, "#watch", ".panel[data-k='wl'] tbody tr");
    ck("with every market of my names open, no such line", (await p.locator("#wl-opens").count()) === 0 && (await p.locator(".panel[data-k='wl'] tbody tr").count()) === 2);
    ck("no script error", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[the page as the live server feeds it: the calendar of its health answer, its table's rows; the browser's clock fixed]");
  { const closes = { d1: 100, w1: 100, m1: 100, m3: 100, m12: 100, m36: 100 }, dates = { d1: "2026-11-19", w1: "2026-11-13", m1: "2026-10-20", m3: "2026-08-20", m12: "2025-11-20", m36: "2023-11-20" }, pct = { d1: 1, w1: 1, m1: 1, m3: 1, m12: 1, m36: 1 };
    const row = (o) => ({ cls: "Equities", group: "equity", currency: "USD", decimals: 2, order: 1, last: 101, source: "yahoo", closes, closeDates: dates, pct, chg: pct, marketTab: true, chart: true, z1m: 0.1, pos52: 50, vs200: 1, ...o });
    const rows = [row({ symbol: "^N225", name: "Nikkei 225", market: "TSE", currency: "JPY", lastAt: "2026-11-20T06:30:00Z", live: false, order: 1 }), row({ symbol: "^GSPC", name: "S&P 500", market: "NYSE", lastAt: "2026-11-19T21:00:00Z", live: false, order: 3 }),
      row({ symbol: "^HSI", name: "Hang Seng", market: "HKEX", currency: "HKD", lastAt: "2026-11-20T08:08:00Z", live: false, order: 9 }), row({ symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", group: "fx", market: "FX", currency: "JPY", decimals: 3, lastAt: "2026-11-20T13:15:00Z", live: true, order: 21 }),
      row({ symbol: "JGB10Y", name: "JGB 10Y yield", cls: "Fixed income", group: "rates", market: "TSE", currency: "JPY", decimals: 3, source: "mof", lastAt: "2026-11-19T00:00:00Z", live: false, order: 34 })];
    // the calendar as the server users have now sends it: each market's days from two days back on
    const HOLIDAYS = { TSE: ["2026-11-23", "2026-12-31", "2027-01-01"], NYSE: ["2026-11-26", "2026-12-25", "2027-01-01"] };
    const health = (holidays) => ({ ok: true, at: OWNER, tick: { lastAt: OWNER, ageMin: 1, ok: true, note: "stand-in" }, daily: { lastAt: OWNER, ok: true, note: "stand-in" }, sources: [], ...(holidays ? { holidays, holidaysVerified: true } : {}) });
    const serve = async (p, mode) => p.route("**/fakeapi?*", (r) => { const a = new URL(r.request().url()).searchParams.get("action");
      if (a === "health" && mode === "down") return r.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "stand-in: no health" }) });
      const body = a === "health" ? health(mode === "bare" ? null : HOLIDAYS) : a === "table" ? { rows, asOf: OWNER } : a === "series" ? { symbol: "x", res: "1d", points: [], asOf: null } : { rows: [] };
      r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) }); });
    const open = async (code, mode) => { const z = SIZES[code], ctx = await b.newContext({ ...(z.dev ? devices[z.dev] : { viewport: { width: z.vp[0], height: z.vp[1] } }), deviceScaleFactor: 1 }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); await p.clock.setFixedTime(new Date(OWNER)); await serve(p, mode); return { ctx, p, errs }; };
    { const { ctx, p, errs } = await open("C1", "ok");
      await go(p, STANDIN, "#market", ".mtile.cp .asof");
      await p.waitForFunction(() => [...document.querySelectorAll(".mtile.cp .opens")].some((e) => e.textContent === "opens 22:30 SGT"), null, { timeout: 8000 }).catch(() => undefined);
      const t = await tiles(p), sp = by(t, "S&P 500"), nk = by(t, "Nikkei 225"), hs = by(t, "Hang Seng"), jg = by(t, "JGB 10Y yield"), jpy = by(t, "USD/JPY"), c = await chips(p);
      ck(`with the calendar of the health answer: the S&P 500 "${sp?.stamp}" "${sp?.opens}"; the Nikkei 225 "${nk?.opens}" (Monday in the calendar); Hang Seng "${hs?.opens}"`, sp?.stamp === "CLOSED 05:00 SGT" && sp.opens === "opens 22:30 SGT" && nk?.opens === "opens 24 Nov 08:00 SGT" && hs?.opens === "opens 23 Nov 09:30 SGT, scheduled", { sp, nk, hs });
      ck(`the server's own live row has none (USD/JPY "${jpy?.stamp}"), nor its official yield ("${jg?.stamp}"); the header's NYSE chip "${c.NYSE?.tip}"`, jpy?.label === "LIVE" && jpy.opens === null && jg?.label === "PUBLISHED" && jg.opens === null && c.NYSE?.tip === "New York CLOSED at 08:16 ET · opens 22:30 SGT", { jpy, jg, c: c.NYSE });
      ck("no script error", errs.length === 0, errs); await ctx.close(); }
    { const { ctx, p, errs } = await open("P2", "ok");
      await go(p, STANDIN, "#market", ".mp-row.inst");
      await p.waitForFunction(() => [...document.querySelectorAll(".mp-row.inst .opens")].some((e) => e.textContent === "opens 22:30 SGT"), null, { timeout: 8000 }).catch(() => undefined);
      const l = await lines(p), sp = by(l, "S&P 500"), nk = by(l, "Nikkei 225");
      ck(`the same on a phone: "${sp?.state}" "${sp?.opens}"; the Nikkei 225 "${nk?.opens}"`, sp?.state === "Closed" && sp.opens === "opens 22:30 SGT" && nk?.opens === "opens 24 Nov 08:00 SGT" && l.every((x) => x.whole && x.clear), l);
      ck("no script error", errs.length === 0, errs); await ctx.close(); }
    for (const [mode, what] of [["down", "the health answer fails"], ["bare", "the health answer carries no calendar"]]) {
      const { ctx, p, errs } = await open("C1", mode);
      await go(p, STANDIN, "#market", ".mtile.cp .asof");
      await p.waitForFunction(() => [...document.querySelectorAll(".mtile.cp .opens")].some((e) => /^opens 22:30 SGT/.test(e.textContent)), null, { timeout: 8000 }).catch(() => undefined);
      const t = await tiles(p), sp = by(t, "S&P 500"), nk = by(t, "Nikkei 225");
      ck(`when ${what}, New York's and Tokyo's are the scheduled times and say so: "${sp?.opens}", "${nk?.opens}" ("…${(sp?.tip ?? "").split(". ").slice(-1)[0]}")`, sp?.opens === "opens 22:30 SGT, scheduled" && nk?.opens === "opens 23 Nov 08:00 SGT, scheduled" && /The holiday calendar \(NYSE's\) could not be loaded: on a holiday the market stays shut\.$/.test(sp.tip), { sp, nk });
      ck("no script error", errs.length === 0, errs); await ctx.close();
    }
  }

  await b.close();
  console.log(fails ? `\n  ✗ ${fails} check(s) failed` : "\n  ✓ all checks passed");
  process.exit(fails ? 1 : 0);
})();
