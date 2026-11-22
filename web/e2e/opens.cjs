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
// After the reviewer's check (21 Nov 2026):
//   - O-1: the FX week by New York's clock, Sunday 17:00 to Friday 17:00 there: "opens 23 Nov 06:00 SGT" this weekend;
//   - O-2: the dollar index, the UST 10Y yield and VIX, which the Monitor only reads in New York's hours, say LAST PRINT
//     and "next read 22:30 SGT", never CLOSED, an opening or NYSE's early close;
//   - O-4: a row that is not live in its market's hours says "first print due ~08:20 SGT" in a delayed feed's first
//     minutes; after them "open since …" only where the Monitor holds the market's holidays, otherwise the timetable's
//     session ("session 16:00–00:30 SGT, scheduled"), on a computer and on a phone, with nothing cut;
//   - O-5: EQUITIES is opened on the S&P 500 (#equities/spx; "sp500" is no index's address and showed the Nikkei) and
//     on the Hang Seng, whose drivers carry the long ", scheduled" lines in the small tiles.
// After the verdicts of round 3a (21 Nov 2026; the designer's D-62, with A-41 and B-35): the computer's first tab and
// the one-screen layout said nothing of which markets are shut. One line above the table, "Closed now: New York opens
// 22:30 SGT · … · next read 22:30 SGT: VIX, DXY, UST 10Y", on MARKETS, RATES & FX's FX and WATCHLIST's MY NAMES in both
// computer layouts (above the list on a phone's WATCHLIST), a holiday named as one; and in the one-screen layout a
// page's own chart (a stock's, an instrument's, EQUITIES' index) keeps its stamp with the opening after it.
// Since 21 Nov 2026 (the designer's notes of round 3b; e2e/shut-reasons.cjs holds their checks): a phone line's word for a
// market that is shut is the reason where the Monitor knows one ("Holiday", "Midday break"), a page's own chart begins
// its line with it ("holiday · opens 24 Nov 08:00 SGT"), and a holiday an opening passes over stands after it in the
// "Closed now" line ("Tokyo opens 24 Nov 08:00 SGT (23 Nov: holiday)").
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
  C3: { vp: [1440, 900], prefs: { size: "XL", compact: false } }, C4: { vp: [1440, 900], prefs: { size: "AUTO", compact: true } }, C4b: { vp: [1280, 720], prefs: { size: "AUTO", compact: true } }, CL: { vp: [1440, 900], prefs: { size: "L", compact: false } },
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
  return { name: t.querySelector(".lbtxt")?.textContent ?? "", label: as.querySelector(".st").textContent, stamp: as.textContent.replace(/\s+/g, " ").trim(), live: t.classList.contains("live"), opens: o?.textContent ?? null, kind: o ? o.className.replace(/^opens\s*/, "") : null, tip: o?.getAttribute("title") ?? null,
    whole: !o || (o.scrollWidth <= o.clientWidth + 1 && r.left >= tr.left - 0.5 && r.right <= tr.right + 0.5 && r.bottom <= tr.bottom + 0.5 && r.top >= tr.top - 0.5),
    clear: !o || ((!cv || apart(r, cv)) && apart(r, ar)), below: !o ? null : r.top >= ar.top - 1.5, fs: o ? parseFloat(getComputedStyle(o).fontSize) : null, oneLine: !o ? null : r.height <= parseFloat(getComputedStyle(o).lineHeight || "0") * 1.6 || r.height <= 18 };
}).filter(Boolean));
// every instrument line of a phone list: its state, the opening, and whether the line under the name is whole
const lines = (p) => p.evaluate(() => [...document.querySelectorAll(".mp-row.inst")].map((r) => {
  const st = r.querySelector(".mp-st"), o = st.querySelector(".opens"), sr = st.getBoundingClientRect(), px = r.querySelector(".mp-px").getBoundingClientRect(), pill = r.querySelector(".mp-chg").getBoundingClientRect(), nm = r.querySelector(".n").getBoundingClientRect();
  const kids = [...st.children].map((c) => c.getBoundingClientRect());
  return { n: r.querySelector(".n").textContent, state: st.firstElementChild?.textContent ?? "", opens: o?.textContent ?? null, kind: o ? o.className.replace(/^opens\s*/, "") : null, tip: o?.getAttribute("title") ?? null, h: Math.round(r.getBoundingClientRect().height), fs: parseFloat(getComputedStyle(st).fontSize),
    rows: new Set(kids.map((k) => Math.round(k.top))).size, whole: st.scrollWidth <= st.clientWidth + 1 && kids.every((k) => k.right <= sr.right + 0.5 && k.left >= sr.left - 0.5),
    clear: sr.top >= nm.bottom - 1 && sr.top >= px.bottom - 1 && kids.every((k) => k.right <= pill.left + 0.5), ox: document.documentElement.scrollWidth - innerWidth };
}));
const chips = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll("#mktstat .mk")].map((c) => [c.firstChild.textContent, { cls: c.className.replace("mk ", ""), lt: c.querySelector(".lt").textContent, tip: c.getAttribute("title") }])));
const rowTips = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll("table.mkt tbody tr:not(.cls), table.mini tbody tr.click")].map((tr) => [tr.querySelector("a.lnk")?.textContent ?? "", tr.getAttribute("title")])));
const by = (xs, name) => xs.find((x) => x.name === name || x.n === name);
// a panel's "Closed now" line (D-62): its words, whether it is whole inside its panel (no entry or name past the panel's
// sides, nothing hidden), whether it stands above the panel's table or list, and whether it is on the first screen
const closedNow = (p, id, below) => p.evaluate(([id, below]) => { const o = document.querySelector(id); if (!o) return null;
  const box = (o.closest(".pbody") ?? o.closest(".mp-sec")).getBoundingClientRect(), r = o.getBoundingClientRect(), t = document.querySelector(below)?.getBoundingClientRect() ?? null;
  const parts = [...o.querySelectorAll(".e, b")].map((e) => e.getBoundingClientRect());
  return { line: o.textContent.replace(/\s+/g, " ").trim(), whole: o.scrollWidth <= o.clientWidth + 1 && r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && parts.every((q) => q.left >= box.left - 0.5 && q.right <= box.right + 0.5 && q.width > 0),
    above: !!t && r.bottom <= t.top + 0.5, first: r.top >= 0 && r.bottom <= innerHeight, fs: parseFloat(getComputedStyle(o).fontSize), h: Math.round(r.height), lh: parseFloat(getComputedStyle(o).lineHeight), tips: [...o.querySelectorAll(".e")].map((e) => e.getAttribute("title")), names: [...o.querySelectorAll("b")].map((e) => e.textContent), ox: document.documentElement.scrollWidth - innerWidth }; }, [id, below]);
// what a line may be, by what stands before it: an opening beside CLOSED, a next read beside LAST PRINT (an instrument
// the Monitor only reads in New York's hours: the dollar index, the UST 10Y yield, VIX), nothing beside anything else
const OPENS = /^opens (\d{1,2} [A-Z][a-z]{2} )?\d\d:\d\d SGT(, scheduled)?$/, READ = /^next read (\d{1,2} [A-Z][a-z]{2} )?\d\d:\d\d SGT$/;
const READ_ONLY = ["VIX", "UST 10Y yield", "US Dollar Index (DXY)", "UST 10Y", "DXY"];
const tileOk = (x) => (x.label === "CLOSED" ? x.kind === "opens" && OPENS.test(x.opens ?? "") : x.kind === "read" ? x.label === "LAST PRINT" && READ.test(x.opens ?? "") && READ_ONLY.includes(x.name) : x.opens === null);
const SHUT = /^(Closed|Holiday|Midday break|Daily break|Closed early)$/;   // a phone line's word for a market that is shut: why, where the Monitor knows (the designer's D-65, 21 Nov 2026)
const lineOk = (x) => (SHUT.test(x.state) ? x.kind === "opens" && OPENS.test(x.opens ?? "") : x.kind === "read" ? /^Last print (\d{1,2} [A-Z][a-z]{2} )?\d\d:\d\d$/.test(x.state) && READ.test(x.opens ?? "") && READ_ONLY.includes(x.n) : x.opens === null);

(async () => { const b = await chromium.launch();
  console.log("\n[the owner's moment, Fri 20 Nov 2026 21:16 SGT: MARKETS on a computer, 1440x900]");
  { const { ctx, p, errs } = await page(b, "C1", OWNER);
    await go(p, MOCK, "#market", ".mtile.cp .asof");
    await p.locator(".mtile.cp").first().scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
    const t = await tiles(p), sp = by(t, "S&P 500"), nk = by(t, "Nikkei 225"), ks = by(t, "KOSPI"), hs = by(t, "Hang Seng"), fut = by(t, "Nikkei 225 future (CME)"), jpy = by(t, "USD/JPY");
    ck(`the S&P 500's tile: "${sp?.stamp}" and "${sp?.opens}" (New York opens at 09:30 there, 22:30 in Singapore since 1 Nov)`, sp?.label === "CLOSED" && sp.stamp === "CLOSED 05:00 SGT" && sp.opens === "opens 22:30 SGT", sp);
    ck(`its tooltip: "${sp?.tip}"`, sp?.tip === "New York: regular session 09:30–16:00 ET. Next opens 20 Nov 22:30 SGT. Holidays and early closes: NYSE's calendar.", sp?.tip);
    ck(`the Nikkei 225's: "${nk?.stamp}" and "${nk?.opens}": Tuesday, as Monday 23 Nov is a holiday in JPX's calendar ("${nk?.tip}")`, nk?.stamp === "CLOSED 14:30 SGT" && nk.opens === "opens 24 Nov 08:00 SGT" && /23 Nov 2026: a holiday in JPX's calendar \(personal use\)\. Next opens 24 Nov 08:00 SGT\. Holidays: JPX's calendar \(personal use\)\.$/.test(nk.tip), nk);
    ck(`markets whose holidays the Monitor does not hold say the scheduled time: KOSPI "${ks?.opens}", Hang Seng "${hs?.opens}"`, ks?.opens === "opens 23 Nov 08:00 SGT, scheduled" && hs?.opens === "opens 23 Nov 09:30 SGT, scheduled" && /^Hong Kong: regular session 09:30–12:00, 13:00–16:00 HKT\. Scheduled to open 23 Nov 09:30 SGT\. The Monitor does not hold this market's holidays: on one the market stays shut\.$/.test(hs.tip), { ks, hs });
    ck(`a market that is open has no such line: the Nikkei future "${fut?.stamp}", USD/JPY "${jpy?.stamp}"`, fut?.label === "LIVE" && fut.opens === null && fut.live && jpy?.label === "LIVE" && jpy.opens === null, { fut, jpy });
    const pub = t.filter((x) => x.label === "PUBLISHED");
    ck(`an official yield, published once a day, has none either (${pub.map((x) => `${x.name}: ${x.stamp}`).join("; ")})`, pub.length === 2 && pub.every((x) => x.opens === null), pub);
    const closed = t.filter((x) => x.label === "CLOSED"), read = t.filter((x) => x.kind === "read"), lined = t.filter((x) => x.opens);
    ck(`every tile that says CLOSED says when its market opens (${closed.length} of ${t.length}); no tile of an open market or of an official yield has a line`, closed.length >= 8 && t.every(tileOk), t.filter((x) => !tileOk(x)));
    const vix = by(t, "VIX"), tnx = by(t, "UST 10Y yield"), dxy = by(t, "US Dollar Index (DXY)");
    ck(`the three the Monitor only reads in New York's hours are not called closed by them (O-2): VIX "${vix?.stamp}" "${vix?.opens}", the UST 10Y yield "${tnx?.stamp}" "${tnx?.opens}", the dollar index "${dxy?.stamp}" "${dxy?.opens}"`, read.length === 3 && [vix, tnx, dxy].every((x) => x?.label === "LAST PRINT" && x.stamp === "LAST PRINT 05:00 SGT" && x.opens === "next read 22:30 SGT" && x.kind === "read" && !x.live), { vix, tnx, dxy });
    ck(`their tooltip says what the time is: "${tnx?.tip}"`, tnx?.tip === "The Monitor reads this instrument during New York's regular session (09:30–16:00 ET; to 13:00 on NYSE's early closes). New York's exchange is not its market, and the Monitor does not hold its own market's hours: it is called neither open nor closed here. Next read 20 Nov 22:30 SGT.", tnx?.tip);
    // (how many lines a long one takes depends on the font the machine has: only the short one is held to one line)
    ck("each line is whole, under the stamp and clear of the change beside it; New York's short one on one line", lined.length === closed.length + 3 && lined.every((x) => x.whole && x.below && x.clear && x.fs >= 9) && sp.oneLine && tnx.oneLine, lined.filter((x) => !(x.whole && x.below && x.clear)));
    const tips = await rowTips(p);
    ck(`the UST 10Y yield's row in the table: "${tips["UST 10Y"]}"`, tips["UST 10Y"] === "^TNX · Yahoo Finance · last print 20 Nov 2026 05:00 SGT · next read 22:30 SGT · open its page", tips["UST 10Y"]);
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
    const closed = l.filter((x) => x.state === "Closed"), tn = by(l, "UST 10Y"), vx = by(l, "VIX"), dx = by(l, "DXY");
    ck(`every line that says Closed says when its market opens (${closed.length} of ${l.length}); a live line and an official yield have none`, closed.length >= 8 && l.every(lineOk), l.filter((x) => !lineOk(x)));
    ck(`the three read in New York's hours say what their figure is as of and when it is next read (O-2): the UST 10Y "${tn?.state}" "${tn?.opens}", VIX "${vx?.state}", DXY "${dx?.state}"`, [tn, vx, dx].every((x) => x?.state === "Last print 05:00" && x.opens === "next read 22:30 SGT"), { tn, vx, dx });   // (whether the two share a row depends on the machine's font: not counted)
    // (whether the longest state and opening share one row depends on the machine's font: New York's short one must)
    ck(`each line whole under the name and the level, clear of the change pill, at ${l[0]?.fs}px (lines ${[...new Set(l.map((x) => x.h))].join(" and ")}px high here); "Closed" and "opens 22:30 SGT" on one row; no sideways scroll`, l.every((x) => x.whole && x.clear && x.fs >= 11 && x.ox <= 0) && sp.rows === 1, l.filter((x) => !(x.whole && x.clear)));
    await p.locator(".mp-row.inst", { has: p.locator(".n", { hasText: /^S&P 500$/ }) }).tap(); await p.waitForSelector(".mp-item.open .mp-full");
    const full = await p.locator(".mp-item.open .mp-full").textContent();
    ck(`opened, its line reads "${full}"`, full === "S&P 500 · ^GSPC · Yahoo Finance · last print 20 Nov 2026 05:00 SGT · market closed · opens 22:30 SGT", full);
    ck("no script error", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[a weekend, Sat 21 Nov 10:00 SGT (the longest lines): nothing cut at the designer's sizes]");
  for (const code of ["C1", "C2", "C3", "C6", "C7", "C8"]) {
    const { ctx, p, errs } = await page(b, code, SAT);
    for (const [hash, sel, what, title] of [["#market", ".mtile.cp .asof", "MARKETS"], ["#rates", ".panel[data-k='pairs'] .mtile.cp .asof", "RATES & FX"], ["#equities/spx", ".bigwrap .asof", "EQUITIES, the S&P 500", "S&P 500"], ["#equities/hsi", ".bigwrap .asof", "EQUITIES, the Hang Seng", "HANG SENG"], ["#asset/NVDA", ".bigwrap .asof", "a stock's page"], ["#asset/USDJPY%3DX", ".bigwrap .asof", "an instrument's page"], ["#asset/ES%3DF", ".bigwrap .asof", "a future's page"]]) {
      await go(p, MOCK, hash, sel);
      // tiles ask for their place as they come near the screen: walk the page once so every tile on it is drawn
      await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); }); await p.waitForTimeout(250);
      const t = await tiles(p), closed = t.filter((x) => x.label === "CLOSED"), lined = t.filter((x) => x.opens), ox = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      // the index the EQUITIES page shows is the one asked for (O-5: "#equities/sp500" fell back to the Nikkei 225)
      const shown = title ? await p.locator(".panel[data-k='eq-index'] .phead .t").first().textContent().catch(() => null) : null;
      ck(`${code} ${what}: ${closed.length} tiles say CLOSED, each with its opening whole and clear of the stamp and the change (the longest line: "${[...lined].sort((a, z2) => (z2.opens ?? "").length - (a.opens ?? "").length)[0]?.opens}"); no sideways scroll${title ? `; the page is "${shown}"` : ""}`, closed.length >= 1 && t.every(tileOk) && closed.every((x) => / Nov /.test(x.opens)) && lined.every((x) => x.whole && x.clear && x.below && x.fs >= 9) && ox <= 0 && (!title || (shown ?? "").toUpperCase().includes(title.toUpperCase())), { bad: t.filter((x) => !tileOk(x) || (x.opens && !(x.whole && x.clear && x.below))), ox, shown });
      if (code === "C1" && hash === "#equities/spx") { const es = by(t, "S&P 500 E-mini"); ck(`the S&P 500's drivers are its four (O-6: the stand-in table has the E-mini, as the live one): ${t.slice(1).map((x) => `${x.name} "${x.opens}"`).join("; ")}`, t.length === 5 && es?.label === "CLOSED" && es.opens === "opens 23 Nov 07:00 SGT, scheduled" && ["VIX", "UST 10Y yield", "US Dollar Index (DXY)"].every((n) => by(t, n)?.opens === "next read 23 Nov 22:30 SGT"), t); }
      if (code === "C1" && hash === "#equities/hsi") ck(`the Hang Seng's drivers carry the long lines in their small tiles: ${t.slice(1).map((x) => `${x.name} "${x.opens}"`).join("; ")}`, by(t, "Hang Seng")?.opens === "opens 23 Nov 09:30 SGT, scheduled" && by(t, "Shanghai Composite")?.opens === "opens 23 Nov 09:30 SGT, scheduled" && by(t, "S&P 500")?.opens === "opens 23 Nov 22:30 SGT" && by(t, "UST 10Y yield")?.opens === "next read 23 Nov 22:30 SGT", t);
    }
    ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
  }
  for (const code of ["C4", "C5"]) {   // the one-screen layout: its tiles show no stamp, so no opening; the rows' tooltips say it
    const { ctx, p, errs } = await page(b, code, SAT);
    await go(p, MOCK, "#market", "table.mkt tbody tr:not(.cls)");
    const term = await p.evaluate(() => document.body.classList.contains("term"));
    const shown = await p.evaluate(() => [...document.querySelectorAll(".mtile.cp .opens")].filter((e) => e.checkVisibility() && e.getBoundingClientRect().width > 0).length), stamps = await p.evaluate(() => [...document.querySelectorAll(".mtile.cp .asof")].filter((e) => e.checkVisibility() && e.getBoundingClientRect().width > 0).length);
    const tips = await rowTips(p), ox = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (term) ck(`${code} (one screen): MARKETS' small tiles show neither a stamp nor an opening (the line above the table says which markets are shut: D-62); a row's tooltip does too ("…${(tips["S&P 500"] ?? "").split(" · ").slice(-3).join(" · ")}")`, shown === 0 && stamps === 0 && / · market closed · opens 23 Nov 22:30 SGT · open its page$/.test(tips["S&P 500"] ?? "") && (await p.locator("#mk-opens").count()) === 1, { shown, stamps, tip: tips["S&P 500"] });
    else { const t = await tiles(p); ck(`${code} (the one-screen layout gives way to the scrolling one at this size): every CLOSED tile with its opening whole`, t.filter((x) => x.label === "CLOSED").every((x) => x.opens && x.whole && x.clear) && ox <= 0, t.filter((x) => x.label === "CLOSED" && !(x.opens && x.whole && x.clear))); }
    ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
  }
  for (const code of ["P1", "P2"]) {
    const { ctx, p, errs } = await page(b, code, SAT);
    for (const [hash, what, first] of [["#market", "MARKETS"], ["#rates", "RATES & FX"], ["#equities/spx", "EQUITIES, the S&P 500", "S&P 500"], ["#equities/hsi", "EQUITIES, the Hang Seng", "Hang Seng"]]) {
      await go(p, MOCK, hash, ".mp-row.inst");
      const l = await lines(p), closed = l.filter((x) => x.state === "Closed");
      ck(`${code} ${what}: ${closed.length} lines say Closed, each with its opening whole and clear of the level and the pill (the longest line: "${[...l].sort((a, z2) => (z2.opens ?? "").length - (a.opens ?? "").length)[0]?.opens}"), type ${l[0]?.fs}px; no sideways scroll${first ? `; the index is "${l[0]?.n}"` : ""}`, closed.length >= 1 && l.every(lineOk) && closed.every((x) => / Nov /.test(x.opens)) && l.every((x) => x.whole && x.clear && x.fs >= 11 && x.ox <= 0) && (!first || l[0]?.n === first), l.filter((x) => !(lineOk(x) && x.whole && x.clear)));
    }
    for (const [hash, what] of [["#asset/NVDA", "a stock's page"], ["#asset/USDJPY%3DX", "an instrument's page"], ["#asset/ES%3DF", "a future's page"]]) {
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
    ck(`a pair's row: "${tips["USD/JPY"]}"`, tips["USD/JPY"] === "USD/JPY (USDJPY=X) · Yahoo Finance · last print 21 Nov 2026 06:00 SGT · market closed · opens 23 Nov 06:00 SGT, scheduled · open its page", tips["USD/JPY"]);
    ck(`its tile: "${jpy?.stamp}" and "${jpy?.opens}": Sunday 17:00 in New York, which is Monday 06:00 SGT in New York's winter (O-1; "${jpy?.tip}")`, jpy?.stamp === "CLOSED 06:00 SGT" && jpy.opens === "opens 23 Nov 06:00 SGT, scheduled" && jpy.tip === "FX: trades Sunday 17:00 to Friday 17:00 ET. Scheduled to open 23 Nov 06:00 SGT. The Monitor does not hold this market's holidays: on one the market stays shut.", jpy);
    const dxy = by(t, "US Dollar Index (DXY)"), dxTip = tips["US Dollar Index (DXY)"] ?? tips["DXY"];
    ck(`the dollar index beside the pairs: "${dxy?.stamp}" and "${dxy?.opens}"; its row "…${(dxTip ?? "").split(" · ").slice(-2).join(" · ")}"`, dxy?.label === "LAST PRINT" && dxy.opens === "next read 23 Nov 22:30 SGT" && / · next read 23 Nov 22:30 SGT · open its page$/.test(dxTip ?? "") && !/market closed/.test(dxTip ?? ""), { dxy, dxTip });
    ck("no script error", errs.length === 0, errs); await ctx.close(); }
  // the hour the two rules differed in: Mon 23 Nov 2026, 05:30 SGT, Sunday 16:30 in New York (the table called FX open)
  { const { ctx, p, errs } = await page(b, "C1", "2026-11-22T21:30:00Z");
    await go(p, MOCK, "#rates", ".panel[data-k='pairs'] .mtile.cp .asof");
    const jpy = by(await tiles(p), "USD/JPY"), tips = await rowTips(p);
    ck(`Mon 23 Nov at 05:30 SGT a pair is still shut: "${jpy?.stamp}" and "${jpy?.opens}"; its row "…${(tips["USD/JPY"] ?? "").split(" · ").slice(-3).join(" · ")}"`, jpy?.label === "CLOSED" && jpy.stamp === "CLOSED 21 Nov 06:00 SGT" && jpy.opens === "opens 06:00 SGT, scheduled" && !jpy.live && / · market closed · opens 06:00 SGT, scheduled · open its page$/.test(tips["USD/JPY"] ?? ""), { jpy, tip: tips["USD/JPY"] });
    ck("no script error", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, "P1", "2026-11-22T22:30:00Z");
    await go(p, MOCK, "#rates", ".mp-row.inst");
    const jpy = by(await lines(p), "USD/JPY");
    ck(`and at 06:30 SGT it is trading (on a phone: "${jpy?.state}")`, jpy?.state === "Live" && jpy.opens === null, jpy);
    ck("no script error", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[a holiday: Tokyo on Mon 23 Nov 2026, 10:00 SGT]");
  { const { ctx, p, errs } = await page(b, "C1", HOL);
    await go(p, MOCK, "#market", ".mtile.cp .asof");
    const c = await chips(p), t = await tiles(p), nk = by(t, "Nikkei 225"), sp = by(t, "S&P 500"), hs = by(t, "Hang Seng");
    ck(`the header says HOL for Tokyo ("${c.TSE?.tip}")`, c.TSE?.cls === "holiday" && c.TSE.lt === "HOL" && c.TSE.tip === "Tokyo HOLIDAY at 11:00 JST · opens 24 Nov 08:00 SGT", c.TSE);
    ck(`the Nikkei 225 does not say it opens today: "${nk?.stamp}" and "${nk?.opens}" ("${nk?.tip}")`, nk?.stamp === "CLOSED 20 Nov 14:30 SGT" && nk.opens === "opens 24 Nov 08:00 SGT" && nk.tip === "Tokyo: regular session 09:00–11:30, 12:30–15:30 JST. Shut today: a holiday in JPX's calendar (personal use). Next opens 24 Nov 08:00 SGT. Holidays: JPX's calendar (personal use).", nk);
    ck(`New York that Monday: "${sp?.opens}"; Hong Kong is trading (${hs?.stamp})`, sp?.opens === "opens 22:30 SGT" && hs?.label === "LIVE" && hs.opens === null, { sp, hs });
    await go(p, MOCK, "#asset/7203.T", ".bigwrap .asof");
    const s = (await tiles(p))[0];
    ck(`a Tokyo stock's page: "${s?.stamp}" and "${s?.opens}", after the stamp on its line, the reason first (D-65)`, s?.stamp === "CLOSED 20 Nov 14:30 SGT" && s.opens === "holiday · opens 24 Nov 08:00 SGT" && s.whole && s.clear && !s.live, s);
    await go(p, MOCK, "#equities/nk225", ".bigwrap .asof");
    const e = await tiles(p), ix = by(e, "Nikkei 225");
    ck(`EQUITIES, the Nikkei 225: "${ix?.stamp}" and "${ix?.opens}"; its drivers' tiles whole (${e.length - 1})`, ix?.opens === "holiday · opens 24 Nov 08:00 SGT" && e.length === 5 && e.every((x) => x.whole && x.clear && (x.label === "CLOSED") === !!x.opens), e.filter((x) => !(x.whole && x.clear)));
    ck("no script error", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, "P1", HOL);
    await go(p, MOCK, "#equities/nk225", ".mp-row.inst.fixed");
    const l = await lines(p), ix = by(l, "Nikkei 225");
    ck(`on a phone (iPhone SE), EQUITIES' index line: "${ix?.state}" and "${ix?.opens}", whole`, ix?.state === "Holiday" && ix.opens === "opens 24 Nov 08:00 SGT" && l.every((x) => x.whole && x.clear), l);
    await go(p, MOCK, "#asset/7203.T", ".mp-hero .asof");
    const s = (await tiles(p))[0];
    ck(`and a Tokyo stock's page: "${s?.stamp}" and "${s?.opens}"`, s?.stamp === "CLOSED 20 Nov 14:30 SGT" && s.opens === "holiday · opens 24 Nov 08:00 SGT" && s.whole && s.fs >= 11, s);
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
    ck(`on a phone, Hong Kong and Shanghai in theirs: "${hs?.state}" "${hs?.opens}", "${sh?.opens}"; Tokyo is back (${nk?.state})`, hs?.state === "Midday break" && hs.opens === "opens 13:00 SGT, scheduled" && sh?.state === "Midday break" && sh?.opens === "opens 13:00 SGT, scheduled" && /^Delayed ~20m$/.test(nk?.state ?? "") && nk.opens === null && l.every((x) => x.whole && x.clear), { hs, sh, nk });
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
    ck(`the Nikkei 225 is not called closed, and is told when its first print is due (O-4): "${nk?.stamp}" and "${nk?.opens}" ("${nk?.tip}")`, nk?.label === "LAST PRINT" && nk.stamp === "LAST PRINT 20 Nov 14:30 SGT" && nk.opens === "first print due ~08:20 SGT" && nk.kind === "due" && nk.whole && nk.clear && nk.tip === "Tokyo: regular session 09:00–11:30, 12:30–15:30 JST; in session since 24 Nov 08:00 SGT. This feed is delayed about 20 minutes: the session's first print is due about 24 Nov 08:20 SGT. Holidays: JPX's calendar (personal use).", nk);
    ck(`Seoul's, whose holidays are not held: "${ks?.stamp}" and "${ks?.opens}"; the row's tooltip "…${(tips["Nikkei 225"] ?? "").split(" · ").slice(-3).join(" · ")}"`, ks?.stamp === "LAST PRINT 23 Nov 14:30 SGT" && ks.opens === "first print due ~08:20 SGT, scheduled" && ks.whole && ks.clear && / · delayed ~20m · first print due ~08:20 SGT · open its page$/.test(tips["Nikkei 225"] ?? ""), { ks, tip: tips["Nikkei 225"] });
    ck("no tile says CLOSED without an opening, and none says a market is open that the Monitor cannot know to be", t.filter((x) => x.label === "CLOSED").every((x) => /^opens /.test(x.opens ?? "")) && t.every((x) => !/open since/.test(x.opens ?? "") || ["Nikkei 225", "TOPIX via 1306.T"].includes(x.name)), t.filter((x) => x.label === "CLOSED" && !x.opens));
    ck("no script error", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, "P1", DELAY);
    await go(p, MOCK, "#market", ".mp-row.inst");
    const l = await lines(p), nk = by(l, "Nikkei 225");
    const ks = by(l, "KOSPI");
    ck(`on a phone (iPhone SE) the line does not read like a fault: "${nk?.state}" and "${nk?.opens}"; Seoul's "${ks?.state}" and "${ks?.opens}"; every line whole`, nk?.state === "Delayed ~20m" && nk.opens === "first print due ~08:20 SGT" && ks?.state === "Delayed ~20m" && ks.opens === "first print due ~08:20 SGT, scheduled" && l.every((x) => x.whole && x.clear), l.filter((x) => !(x.whole && x.clear)));
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
    const w = { ...(await closedNow(p, "#wl-opens", ".panel[data-k='wl'] table.wlT")), tips: await p.evaluate(() => Object.fromEntries([...document.querySelectorAll(".panel[data-k='wl'] tbody tr")].map((tr) => [tr.querySelector("td.nm .mut").textContent, tr.querySelector("td.asof").getAttribute("title")]))) };
    ck(`above MY NAMES' table (D-62), on the first screen: "${w.line}"`, w.line === "Closed now: New York opens 22:30 SGT · Tokyo opens 24 Nov 08:00 SGT (23 Nov: holiday) · next read 22:30 SGT: UST 10Y" && w.whole && w.above && w.first, w);
    ck(`a row's AS OF tooltip: NVDA "${w.tips.NVDA}"; USD/JPY, whose market is open, "${w.tips["USDJPY=X"]}"`, /^Yahoo Finance · close of \d{1,2} [A-Z][a-z]{2} \d{4} · market closed · opens 22:30 SGT$/.test(w.tips.NVDA) && /^Yahoo Finance · last print 20 Nov 2026 21:16 SGT$/.test(w.tips["USDJPY=X"]) && / · market closed · opens 24 Nov 08:00 SGT$/.test(w.tips["7203.T"]), w.tips);
    ck("no script error", errs.length === 0, errs); await ctx.close(); }
  for (const code of ["P1", "P2"]) {
    const { ctx, p, errs } = await page(b, code, SAT);
    await go(p, MOCK, "#watch", ".mp-row.starred");
    const w = { ...(await closedNow(p, "#wl-opens", ".mp-row.starred")), n: await p.locator(".mp-row.starred").count() };
    ck(`${code}, a weekend: "${w.line}", whole in its note above the ${w.n} names (D-62), type ${w.fs}px; no sideways scroll`, w.line === "Closed now: FX opens 23 Nov 06:00 SGT, scheduled · CME Globex opens 23 Nov 07:00 SGT, scheduled · New York opens 23 Nov 22:30 SGT · Tokyo opens 24 Nov 08:00 SGT (23 Nov: holiday) · next read 23 Nov 22:30 SGT: UST 10Y" && w.whole && w.above && w.fs >= 11 && w.ox <= 0 && w.n === 10, w);
    ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
  }
  { const { ctx, p, errs } = await page(b, "C1", NYOPEN, { om_mock_watch: JSON.stringify([{ symbol: "NVDA", name: null }, { symbol: "USDJPY=X", name: null }]) });
    await go(p, MOCK, "#watch", ".panel[data-k='wl'] tbody tr");
    ck("with every market of my names open, no such line", (await p.locator("#wl-opens").count()) === 0 && (await p.locator(".panel[data-k='wl'] tbody tr").count()) === 2);
    ck("no script error", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[D-62: which markets are shut, and when each opens, above the table, without a hover: both computer layouts]");
  { const OWNER_LINE = "Closed now: New York opens 22:30 SGT · Seoul opens 23 Nov 08:00 SGT, scheduled · Hong Kong and Shanghai open 23 Nov 09:30 SGT, scheduled · Tokyo opens 24 Nov 08:00 SGT (23 Nov: holiday) · next read 22:30 SGT: VIX, DXY, UST 10Y";
    for (const [code, what] of [["C1", "1440x900, scrolling"], ["C2", "1280x720, scrolling"], ["C4", "1440x900, one screen"], ["C4b", "1280x720, one screen"]]) {
      const { ctx, p, errs } = await page(b, code, OWNER);
      await go(p, MOCK, "#market", "table.mkt tbody tr:not(.cls)");
      const term = await p.evaluate(() => document.body.classList.contains("term")), c = await closedNow(p, "#mk-opens", "table.mkt");
      const rows = await p.evaluate(() => { const rs = [...document.querySelectorAll("table.mkt tbody tr:not(.cls)")].map((r) => r.getBoundingClientRect()); return { n: rs.length, whole: rs.filter((r) => r.top >= 0 && r.bottom <= innerHeight).length, body: (() => { const b2 = document.querySelector(".panel[data-k='mkt'] .pbody"); return b2.scrollHeight - b2.clientHeight; })() }; });
      ck(`${code} (${what}), the owner's moment: MARKETS' first screen says "New York opens 22:30 SGT" above its table, whole, at ${c?.fs}px: "${c?.line}"`, !!c && term === /one screen/.test(what) && c.line === OWNER_LINE && c.whole && c.above && c.first && c.fs >= 9 && c.ox <= 0, c);
      if (code === "C1") { ck(`its market names are in the text colour and each entry carries its market's hours on its tooltip ("${c.tips[0]}"); Hong Kong's and Shanghai's share one entry`, c.names.join("|") === "New York|Seoul|Hong Kong and Shanghai|Tokyo|VIX, DXY, UST 10Y" && c.tips[0] === "New York: regular session 09:30–16:00 ET. Next opens 20 Nov 22:30 SGT. Holidays and early closes: NYSE's calendar." && /^Hong Kong: regular session .*\nShanghai: regular session /.test(c.tips[2]) && /^The Monitor reads this instrument during New York's regular session/.test(c.tips[4]), c);
        // the strip's foot line is one line now (the designer's D-69), which pays for this one: the table keeps its rows
        // on the first screen (here 17 of its 18, as before the line; rows stand taller on other machines, so the count
        // asked for leaves room)
        const note = await p.evaluate(() => { const n = document.querySelector("#mk-sigma-note"), r = n.getBoundingClientRect(); return { text: n.textContent, h: r.height, lh: parseFloat(getComputedStyle(n).lineHeight) }; });
        // (how many lines the line above the table takes depends on the machine's font: it is printed, not asked for)
        ck(`the strip's foot line is one line ("${note.text}"); the line above the table takes ${Math.round(c.h / c.lh)} here; ${rows.whole} of the table's ${rows.n} rows are whole on the first screen`, /^\u2020 worked out here from the Monitor's daily closes, mostly \d{1,2} [A-Z][a-z]{2} – \d{1,2} [A-Z][a-z]{2} \d{4} · each cell's own window on its tooltip$/.test(note.text) && note.h <= note.lh * 1.6 && rows.n === 18 && rows.whole >= 15, { note, rows, h: c.h }); }
      if (term) ck(`${code}: in the one-screen layout the line takes its height from the table's rows: all ${rows.n} rows are still on the screen and the panel does not scroll`, rows.n === 18 && rows.whole === 18 && rows.body <= 1, rows);
      ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
    }
    for (const code of ["C1", "C4"]) {   // B's moment: Mon 23 Nov 2026, 06:30 SGT (Tokyo's holiday; Globex opens at 07:00; the FX week began at 06:00)
      const { ctx, p, errs } = await page(b, code, "2026-11-22T22:30:00Z");
      await go(p, MOCK, "#market", "table.mkt tbody tr:not(.cls)");
      const c = await closedNow(p, "#mk-opens", "table.mkt");
      ck(`${code}, Mon 23 Nov 06:30 SGT: the line names Tokyo's holiday and gives Globex's and New York's openings: "${c?.line}"`, c?.line === "Closed now: CME Globex opens 07:00 SGT, scheduled · Seoul opens 08:00 SGT, scheduled · Hong Kong and Shanghai open 09:30 SGT, scheduled · New York opens 22:30 SGT · Tokyo (holiday) opens 24 Nov 08:00 SGT · next read 22:30 SGT: VIX, DXY, UST 10Y" && c.whole && c.above && c.first, c);
      await go(p, MOCK, "#rates", ".panel[data-k='fx'] table.mini tbody tr");
      // since 21 Nov 2026 (the designer's note on RATES & FX's FX panel): no market of its rows is shut, but the dollar index
      // holds last night's print until New York is read again, and the line says so alone; it said nothing
      const fxl = await closedNow(p, "#fx-opens", ".panel[data-k='fx'] table.mini");
      ck(`${code}: RATES & FX at that hour: the FX week is running and New York is shut, so its FX panel says when the dollar index is next read: "${fxl?.line}"`, fxl?.line === "Next read 22:30 SGT: DXY" && fxl.whole && fxl.above, fxl);
      ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
    }
    for (const code of ["C1", "C2", "C3", "C4", "C6", "C8", "CL"]) {   // a weekend: the longest lines, at the designer's sizes
      const { ctx, p, errs } = await page(b, code, SAT);
      await go(p, MOCK, "#rates", ".panel[data-k='fx'] table.mini tbody tr");
      const f = await closedNow(p, "#fx-opens", ".panel[data-k='fx'] table.mini");
      ck(`${code}, a weekend: RATES & FX's FX panel says "${f?.line}" above its table, whole, on the first screen`, f?.line === "Closed now: FX opens 23 Nov 06:00 SGT, scheduled · next read 23 Nov 22:30 SGT: DXY" && f.whole && f.above && f.first && f.fs >= 9 && f.ox <= 0, f);
      await go(p, MOCK, "#market", "table.mkt tbody tr:not(.cls)");
      const c = await closedNow(p, "#mk-opens", "table.mkt");
      ck(`${code}, a weekend: MARKETS' line, the soonest to open first, whole however it wraps (${c ? Math.round(c.h / c.lh) : "–"} line(s)): "${c?.line}"`, c?.line === "Closed now: FX opens 23 Nov 06:00 SGT, scheduled · CME Globex opens 23 Nov 07:00 SGT, scheduled · Seoul opens 23 Nov 08:00 SGT, scheduled · Hong Kong and Shanghai open 23 Nov 09:30 SGT, scheduled · New York opens 23 Nov 22:30 SGT · Tokyo opens 24 Nov 08:00 SGT (23 Nov: holiday) · next read 23 Nov 22:30 SGT: VIX, DXY, UST 10Y" && c.whole && c.above && c.fs >= 9 && c.ox <= 0, c);
      await go(p, MOCK, "#watch", ".panel[data-k='wl'] tbody tr");
      const w = await closedNow(p, "#wl-opens", ".panel[data-k='wl'] table.wlT");
      ck(`${code}, a weekend: WATCHLIST's line above its table, whole: "${w?.line}"`, w?.line === "Closed now: FX opens 23 Nov 06:00 SGT, scheduled · CME Globex opens 23 Nov 07:00 SGT, scheduled · New York opens 23 Nov 22:30 SGT · Tokyo opens 24 Nov 08:00 SGT (23 Nov: holiday) · next read 23 Nov 22:30 SGT: UST 10Y" && w.whole && w.above && w.ox <= 0, w);
      ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
    }
    { const { ctx, p, errs } = await page(b, "C1", "2026-11-24T02:45:00Z");   // Tokyo's midday break
      await go(p, MOCK, "#market", "table.mkt tbody tr:not(.cls)");
      const c = await closedNow(p, "#mk-opens", "table.mkt");
      ck(`a midday break is named too: "${c?.line.split(" · ")[0]}"`, /^Closed now: Tokyo \(midday break\) opens 11:30 SGT$/.test(c?.line.split(" · ")[0] ?? ""), c);
      ck("no script error", errs.length === 0, errs); await ctx.close(); }
  }

  console.log("\n[D-62: the one-screen layout: a page's own chart keeps its stamp, with the opening after it; the small tiles stay bare]");
  for (const [code, what] of [["C4", "1440x900"], ["C4b", "1280x720"]]) {
    const { ctx, p, errs } = await page(b, code, OWNER);
    await go(p, MOCK, "#asset/NVDA", ".bigwrap .mtile.cp");
    const term = await p.evaluate(() => document.body.classList.contains("term")), s = (await tiles(p))[0];
    ck(`${code} (one screen, ${what}), the owner's moment: #asset/NVDA shows "${s?.stamp}" with "${s?.opens}", whole, at ${s?.fs}px`, term && s?.stamp === "CLOSED 05:00 SGT" && s.opens === "opens 22:30 SGT" && s.whole && s.clear && s.fs >= 9, { term, s });
    await go(p, MOCK, "#asset/7203.T", ".bigwrap .mtile.cp");
    const t = (await tiles(p))[0];
    ck(`${code}: a Tokyo stock's page: "${t?.stamp}" with "${t?.opens}" (the holiday its opening passes over named: D-65)`, t?.label === "CLOSED" && t.opens === "opens 24 Nov 08:00 SGT · 23 Nov: holiday" && t.whole && t.clear, t);
    await go(p, MOCK, "#asset/%5ETNX", ".bigwrap .mtile.cp");
    const y = (await tiles(p))[0];
    ck(`${code}: the UST 10Y yield's page: "${y?.stamp}" with "${y?.opens}"`, y?.label === "LAST PRINT" && y.opens === "next read 22:30 SGT" && y.whole && y.clear, y);
    await go(p, MOCK, "#equities/nk225", ".bigwrap .mtile.cp");
    const e = await tiles(p), small = await p.evaluate(() => [...document.querySelectorAll(".mtile.cp:not(.large)")].filter((x) => [...x.querySelectorAll(".asof, .opens")].some((q) => q.checkVisibility() && q.getBoundingClientRect().width > 0)).length);
    ck(`${code}: EQUITIES' index: "${e[0]?.stamp}" with "${e[0]?.opens}"; its drivers' small tiles stay bare (${small} with a stamp)`, e.length === 1 && e[0].name === "Nikkei 225" && e[0].opens === "opens 24 Nov 08:00 SGT · 23 Nov: holiday" && e[0].whole && e[0].clear && small === 0, { e, small });
    ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
  }
  for (const code of ["C4", "C4b"]) {   // the longest line (a weekend, ", scheduled") and a delayed feed's badge beside it
    const { ctx, p, errs } = await page(b, code, SAT);
    for (const [hash, want] of [["#asset/USDJPY%3DX", "opens 23 Nov 06:00 SGT, scheduled"], ["#asset/GC%3DF", "opens 23 Nov 07:00 SGT, scheduled"], ["#equities/hsi", "opens 23 Nov 09:30 SGT, scheduled"]]) {
      await go(p, MOCK, hash, ".bigwrap .mtile.cp");
      const s = (await tiles(p))[0], cut = await p.evaluate(() => { const t = document.querySelector(".bigwrap .mtile.cp"), tr = t.getBoundingClientRect(); return [...t.querySelectorAll(":scope > .vl .px, :scope > .ch .chv, :scope > .vl .tags > *")].filter((x) => x.checkVisibility() && (x.getBoundingClientRect().right > tr.right + 0.5 || x.scrollWidth > x.clientWidth + 1)).map((x) => x.className); });
      ck(`${code}, a weekend, ${hash}: "${s?.stamp}" with "${s?.opens}", whole beside the price and the change`, s?.label === "CLOSED" && s.opens === want && s.whole && s.clear && cut.length === 0, { s, cut });
    }
    ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
  }

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
      ck(`when ${what}, New York's and Tokyo's are the scheduled times and say so: "${sp?.opens}", "${nk?.opens}" ("…${(sp?.tip ?? "").split(". ").slice(-1)[0]}")`, sp?.opens === "opens 22:30 SGT, scheduled" && nk?.opens === "opens 23 Nov 08:00 SGT, scheduled" && /NYSE's calendar could not be loaded: on a holiday the market stays shut\.$/.test(sp.tip) && /JPX's calendar \(personal use\) could not be loaded: on a holiday the market stays shut\.$/.test(nk.tip), { sp, nk });
      ck("no script error", errs.length === 0, errs); await ctx.close();
    }
  }

  console.log("\n[no live price in a market's hours, as the live server would feed it (O-4): Wed 25 Nov 2026, 00:10 SGT; the browser's clock fixed]");
  { const NOW = "2026-11-24T16:10:00Z";   // Tue 24 Nov 16:10 in London, 11:10 in New York: London, Frankfurt, New York, São Paulo, Globex and FX in their hours
    const closes = { d1: 100, w1: 100, m1: 100, m3: 100, m12: 100, m36: 100 }, dates = { d1: "2026-11-23", w1: "2026-11-17", m1: "2026-10-24", m3: "2026-08-24", m12: "2025-11-24", m36: "2023-11-24" }, pct = { d1: 1, w1: 1, m1: 1, m3: 1, m12: 1, m36: 1 };
    // every row but Bitcoin's is not live, its last print three hours old: a feed that sent nothing new, or (for all the
    // Monitor knows of London, Frankfurt, São Paulo, Globex and FX) a holiday there
    const row = (o) => ({ cls: "Equities", group: "equity", currency: "USD", decimals: 2, order: 1, last: 12345.67, source: "yahoo", closes, closeDates: dates, pct, chg: pct, marketTab: true, chart: true, z1m: 0.1, pos52: 50, vs200: 1, live: false, lastAt: "2026-11-24T13:02:00Z", ...o });
    const rows = [row({ symbol: "^FTSE", name: "FTSE 100", market: "LSE", currency: "GBP", order: 1 }), row({ symbol: "^GDAXI", name: "DAX", market: "XETRA", currency: "EUR", order: 2 }), row({ symbol: "^GSPC", name: "S&P 500", market: "NYSE", order: 3 }),
      row({ symbol: "^BVSP", name: "Bovespa", market: "B3", currency: "BRL", decimals: 0, order: 4 }), row({ symbol: "^N225", name: "Nikkei 225", market: "TSE", currency: "JPY", lastAt: "2026-11-24T06:30:00Z", order: 5 }),
      row({ symbol: "ES=F", name: "S&P 500 E-mini", cls: "Futures", market: "CME", order: 18 }), row({ symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", group: "fx", market: "FX", currency: "JPY", decimals: 3, last: 158.4, order: 21 }),
      row({ symbol: "^TNX", name: "UST 10Y yield", cls: "Fixed income", group: "rates", market: "NYSE", decimals: 3, last: 4.859, order: 32 }), row({ symbol: "BTC-USD", name: "Bitcoin", cls: "Crypto", group: "fx", market: "CRYPTO", decimals: 0, order: 60, live: true, lastAt: "2026-11-24T16:09:00Z" })];
    const HOLIDAYS = { TSE: ["2026-12-31", "2027-01-01"], NYSE: ["2026-11-26", "2026-12-25", "2027-01-01"] };
    const open = async (code) => { const z = SIZES[code], ctx = await b.newContext({ ...(z.dev ? devices[z.dev] : { viewport: { width: z.vp[0], height: z.vp[1] } }), deviceScaleFactor: 1 }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); await p.clock.setFixedTime(new Date(NOW));
      await p.route("**/fakeapi?*", (r) => { const a = new URL(r.request().url()).searchParams.get("action");
        const body = a === "health" ? { ok: true, at: NOW, tick: { lastAt: NOW, ageMin: 1, ok: true, note: "stand-in" }, daily: { lastAt: NOW, ok: true, note: "stand-in" }, sources: [], holidays: HOLIDAYS, holidaysVerified: true } : a === "table" ? { rows, asOf: NOW } : a === "series" ? { symbol: "x", res: "1d", points: [], asOf: null } : { rows: [] };
        r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) }); });
      return { ctx, p, errs }; };
    const WANT = { "FTSE 100": "session 16:00–00:30 SGT, scheduled", DAX: "session 16:00–00:30 SGT, scheduled", "S&P 500": "open since 24 Nov 22:30 SGT", Bovespa: "session 21:00–04:00 SGT, scheduled", "S&P 500 E-mini": "session 07:00–06:00 SGT, scheduled", "USD/JPY": "session to 28 Nov 06:00 SGT, scheduled" };
    for (const code of ["C1", "C2"]) {
      const { ctx, p, errs } = await open(code);
      await go(p, STANDIN, "#market", ".mtile.cp .asof");
      await p.waitForFunction(() => [...document.querySelectorAll(".mtile.cp .opens")].some((e) => e.textContent === "open since 24 Nov 22:30 SGT"), null, { timeout: 8000 }).catch(() => undefined);
      await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); }); await p.waitForTimeout(250);
      const t = await tiles(p), ft = by(t, "FTSE 100"), sp = by(t, "S&P 500"), nk = by(t, "Nikkei 225"), tn = by(t, "UST 10Y yield"), bt = by(t, "Bitcoin"), ox = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      const got = Object.fromEntries(Object.keys(WANT).map((n) => [n, by(t, n)?.opens ?? null]));
      ck(`${code}: a market the Monitor holds no holidays for is not said to be open: the FTSE 100 "${ft?.stamp}" and "${ft?.opens}" (it read "open since 24 Nov 16:00 SGT, scheduled"); New York, whose calendar is held, "${sp?.opens}"`, ft?.stamp === "LAST PRINT 24 Nov 21:02 SGT" && ft.kind === "session" && Object.entries(WANT).every(([n, w]) => got[n] === w) && sp?.kind === "since" && t.every((x) => !/open since/.test(x.opens ?? "") || x.name === "S&P 500"), got);
      if (code === "C1") ck(`its tooltip says what is known and what is not: "${ft?.tip}"`, ft?.tip === "London: regular session 08:00–16:30 UK. Its timetable's session: 24 Nov 16:00 SGT to 25 Nov 00:30 SGT. The last print the Monitor has is older than a live one; this feed is delayed about 15 minutes. The Monitor does not hold this market's holidays: on one there is no session.", ft?.tip);
      ck(`${code}: the rest of the table as before: the Nikkei 225 "${nk?.stamp}" "${nk?.opens}"; the UST 10Y yield in New York's hours "${tn?.stamp}", no line; Bitcoin "${bt?.label}"`, nk?.label === "CLOSED" && nk.opens === "opens 08:00 SGT" && tn?.label === "LAST PRINT" && tn.opens === null && bt?.label === "LIVE" && bt.opens === null, { nk, tn, bt });
      ck(`${code}: each of these lines whole, under its stamp and clear of the change beside it; no sideways scroll`, t.filter((x) => x.opens).length === 7 && t.filter((x) => x.opens).every((x) => x.whole && x.clear && x.below && x.fs >= 9) && ox <= 0, { bad: t.filter((x) => x.opens && !(x.whole && x.clear && x.below)), ox });
      const tips = await rowTips(p);
      if (code === "C1") ck(`a row's tooltip: "…${(tips["FTSE 100"] ?? "").split(" · ").slice(-3).join(" · ")}"`, / · no new print · session 16:00–00:30 SGT, scheduled · open its page$/.test(tips["FTSE 100"] ?? "") && / · no new print · open since 24 Nov 22:30 SGT · open its page$/.test(tips["S&P 500"] ?? ""), { ft: tips["FTSE 100"], sp: tips["S&P 500"] });
      ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
    }
    for (const code of ["P1", "P2"]) {
      const { ctx, p, errs } = await open(code);
      await go(p, STANDIN, "#market", ".mp-row.inst");
      await p.waitForFunction(() => [...document.querySelectorAll(".mp-row.inst .opens")].some((e) => e.textContent === "open since 24 Nov 22:30 SGT"), null, { timeout: 8000 }).catch(() => undefined);
      const l = await lines(p), ft = by(l, "FTSE 100"), sp = by(l, "S&P 500"), tn = by(l, "UST 10Y"), jp = by(l, "USD/JPY");
      // what the figure is as of, where the line read "No new print" (the designer's D-66; e2e/shut-reasons.cjs checks its amber)
      ck(`${code}: under the FTSE 100's name "${ft?.state}" and "${ft?.opens}"; the S&P 500's "${sp?.state}" and "${sp?.opens}"; USD/JPY's "${jp?.opens}"; the UST 10Y's "${tn?.state}", no line`, ft?.state === "Last print 24 Nov 21:02" && ft.opens === "session 16:00–00:30 SGT, scheduled" && sp?.state === "Last print 24 Nov 21:02" && sp.opens === "open since 24 Nov 22:30 SGT" && jp?.opens === "session to 28 Nov 06:00 SGT, scheduled" && tn?.state === "Last print 24 Nov 21:02" && tn.opens === null && l.every((x) => !/open since/.test(x.opens ?? "") || x.n === "S&P 500"), { ft, sp, jp, tn });
      ck(`${code}: every line whole under the name and the level, clear of the change pill, type ${l[0]?.fs}px (lines ${[...new Set(l.map((x) => x.h))].join(" and ")}px high here); no sideways scroll`, l.length === rows.length && l.every((x) => x.whole && x.clear && x.fs >= 11 && x.ox <= 0), l.filter((x) => !(x.whole && x.clear)));
      ck(`${code}: no script error`, errs.length === 0, errs); await ctx.close();
    }
  }

  await b.close();
  console.log(fails ? `\n  ✗ ${fails} check(s) failed` : "\n  ✓ all checks passed");
  process.exit(fails ? 1 : 0);
})();
