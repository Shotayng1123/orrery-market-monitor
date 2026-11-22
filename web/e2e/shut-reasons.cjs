// Why a market is shut, on screen without a hover, and an old price in market hours (the designer's D-65 and D-66 and
// the smaller items of note (c), round 3b, 21 Nov 2026). The reasons were in tooltips, and a phone has none.
//   - D-65: a phone line's state word is the reason ("Holiday", "Midday break", "Closed early"; "Closed" by its hours),
//     on one line with the opening, also with a wide font forced; a page's own chart begins its line with the reason
//     ("holiday · opens 24 Nov 08:00 SGT") on both layouts; a holiday an opening passes over is named in the "Closed
//     now" line ("Tokyo opens 24 Nov 08:00 SGT (23 Nov: holiday)"), on a page's own chart and in a phone's opened row;
//   - D-66: a row with no live price while its market trades reads what the figure is as of, "Last print 08:40", in
//     amber, where it read "No new print"; its tile's LAST PRINT is amber too; the dollar index, read only in New
//     York's hours, keeps "Last print 05:00" in the line's usual colour;
//   - RATES & FX's FX panel on a weekday: "Next read 22:30 SGT: DXY" above its table while the FX week runs and New
//     York is shut; no line once New York is open;
//   - the opening on a phone's page head: on a line of its own it starts under the badges' left edge (it stood 4 px to
//     their right); on the stamp's line the row's gap of 6 px separates the two.
// The clock is never the machine's: the local copy's own (`om_mock_now`), and Playwright's fixed clock for the page as
// the live server would feed it (a Tokyo row that is not live in Tokyo's hours).
// Run from web/:  node e2e/run.cjs shut-reasons   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const WIDE = "*{font-family:monospace!important}", WARN = "rgb(255, 197, 61)";   // --warn
const HOL = "2026-11-23T02:00:00Z";     // Mon 23 Nov 10:00 SGT: Tokyo's holiday
const BRK = "2026-11-24T02:45:00Z";     // Tue 24 Nov 10:45 SGT: Tokyo's midday break
const EARLY = "2026-11-27T18:30:00Z";   // Sat 28 Nov 02:30 SGT: New York at 13:30 on the day it closes at 13:00
const THX = "2026-11-26T15:00:00Z";     // Thu 26 Nov 23:00 SGT: Thanksgiving
const GLOBEX = "2026-11-23T22:30:00Z";  // Tue 24 Nov 06:30 SGT: 17:30 in New York, Globex's hour off
const SAT = "2026-11-21T02:00:00Z";     // Sat 21 Nov 10:00 SGT: Tokyo's next open passes over Monday the 23rd
const SAT2 = "2026-11-21T06:12:00Z";    // Sat 21 Nov 14:12 SGT (the hour of the phone page's own check, e2e/hero.cjs)
const OWNER = "2026-11-20T13:16:00Z";   // Fri 20 Nov 21:16 SGT: New York opens the same evening
const SIZES = { C1: { vp: [1440, 900], prefs: { size: "AUTO", compact: false } }, C4: { vp: [1440, 900], prefs: { size: "AUTO", compact: true } }, C4b: { vp: [1280, 720], prefs: { size: "AUTO", compact: true } }, P1: { dev: "iPhone SE (3rd gen)" }, P2: { dev: "iPhone 13" } };
async function page(b, code, clock) {
  const z = SIZES[code], opts = z.dev ? { ...devices[z.dev] } : { viewport: { width: z.vp[0], height: z.vp[1] } };
  const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1 });
  await ctx.addInitScript(([pr, at]) => { try { if (pr) localStorage.setItem("om_prefs", JSON.stringify({ ...pr, v: 2 })); if (at) localStorage.setItem("om_mock_now", at); localStorage.setItem("om_a2hs_hide", "1"); } catch {} }, [z.prefs || null, clock || null]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs, phone: !!z.dev };
}
const go = async (p, base, hash, sel) => { await p.goto(base + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); await p.evaluate(() => document.fonts.ready); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(350); };
// a phone list's line by its name: its state word and its colour, the line beside it, whether the two share a row and are whole
const phoneLine = (p, name) => p.evaluate((name) => { const r = [...document.querySelectorAll(".mp-row.inst")].find((x) => x.querySelector(".n").textContent === name); if (!r) return null;
  const st = r.querySelector(".mp-st"), s0 = st.firstElementChild, o = st.querySelector(".opens"), kids = [...st.children].map((c) => c.getBoundingClientRect()), sr = st.getBoundingClientRect();
  return { state: s0.textContent, colour: getComputedStyle(s0).color, usual: getComputedStyle(st).color, opens: o?.textContent ?? null, rows: new Set(kids.map((k) => Math.round(k.top))).size, whole: st.scrollWidth <= st.clientWidth + 1 && kids.every((k) => k.right <= sr.right + 0.5), h: Math.round(r.getBoundingClientRect().height), ox: document.documentElement.scrollWidth - innerWidth }; }, name);
// a page's own chart (the large tile): its stamp and the line after it
const hero = (p) => p.evaluate(() => { const t = document.querySelector(".bigwrap .mtile.cp, .mp-hero .mtile.cp"); if (!t) return null; const R = (e) => e.getBoundingClientRect(), tags = t.querySelector(":scope > .vl > .tags"), as = tags.querySelector(".asof"), o = tags.querySelector(".opens"), first = [...tags.children].find((c) => R(c).width > 0), tr = R(t);
  return { stamp: as.textContent.replace(/\s+/g, " ").trim(), opens: o?.textContent ?? null, whole: !o || (o.scrollWidth <= o.clientWidth + 1 && R(o).left >= tr.left - 0.5 && R(o).right <= tr.right + 0.5), ownLine: o ? R(o).top >= R(as).bottom - 2 : null, left: o ? R(o).left : null, firstLeft: R(first).left, gap: o ? R(o).left - R(as).right : null, margin: o ? getComputedStyle(o).marginLeft : null, ox: document.documentElement.scrollWidth - innerWidth }; });
const closedNow = (p, id) => p.evaluate((id) => { const o = document.querySelector(id); if (!o) return null; const box = (o.closest(".pbody") ?? o.closest(".mp-sec")).getBoundingClientRect(), r = o.getBoundingClientRect(), t = (o.closest(".pbody") ?? document).querySelector("table")?.getBoundingClientRect() ?? null;
  return { line: o.textContent.replace(/\s+/g, " ").trim(), whole: o.scrollWidth <= o.clientWidth + 1 && r.left >= box.left - 0.5 && r.right <= box.right + 0.5, above: !!t && r.bottom <= t.top + 0.5, tip: o.querySelector(".e.rd")?.getAttribute("title") ?? null, ox: document.documentElement.scrollWidth - innerWidth }; }, id);

(async () => { const b = await chromium.launch();
  console.log("\n[D-65 on a phone's lines: the state word is the reason, on one line with the opening]");
  for (const [clock, when, name, state, opens] of [[HOL, "Tokyo's holiday, Mon 23 Nov 10:00 SGT", "Nikkei 225", "Holiday", "opens 24 Nov 08:00 SGT"], [BRK, "Tokyo's midday break, Tue 24 Nov 10:45 SGT", "Nikkei 225", "Midday break", "opens 11:30 SGT"], [EARLY, "New York's early close, Fri 27 Nov 13:30 there", "S&P 500", "Closed early", "opens 30 Nov 22:30 SGT"], [THX, "Thanksgiving, Thu 26 Nov 23:00 SGT", "S&P 500", "Holiday", "opens 27 Nov 22:30 SGT"], [SAT, "a weekend, Sat 21 Nov 10:00 SGT", "Nikkei 225", "Closed", "opens 24 Nov 08:00 SGT"], [GLOBEX, "Globex's daily break, Tue 24 Nov 06:30 SGT", "WTI", "Daily break", "opens 07:00 SGT, scheduled"]]) {
    const { ctx, p, errs } = await page(b, "P1", clock);
    await go(p, MOCK, "#market", ".mp-row.inst");
    const l = await phoneLine(p, name); await p.addStyleTag({ content: WIDE }); await p.waitForTimeout(300); const w = await phoneLine(p, name);
    // In a wide font the early close's line (37 letters) and the daily break's (40) are wider than a 375-px screen
    // gives them and go to a second line, whole, the row 63 px (the designer's note on rows that stand taller); the
    // holiday's, the midday break's and the plain "Closed" stay on one.
    const long = state === "Closed early" || state === "Daily break";
    ck(`iPhone SE, ${when}: under ${name}'s name "${l?.state}" and "${l?.opens}" on one line, whole, the row ${l?.h} px; with a wide font forced ${long ? "two lines, whole" : "still one line"} (${w?.rows} row${w?.rows === 1 ? "" : "s"}, ${w?.h} px), nothing sideways`, l?.state === state && l.opens === opens && l.rows === 1 && l.whole && l.h === 50 && w?.state === state && w.opens === opens && (long ? w.rows <= 2 && w.h <= 63 : w.rows === 1 && w.h === 50) && w.whole && l.ox <= 0 && w.ox <= 0, { l, w });
    if (clock === SAT) { await p.locator(".mp-row.inst", { has: p.locator(".n", { hasText: /^Nikkei 225$/ }) }).tap(); await p.waitForSelector(".mp-item.open .mp-full"); const full = await p.locator(".mp-item.open .mp-full").textContent();
      ck(`its opened row names the holiday the opening passes over: "…${full.split(" · ").slice(-3).join(" · ")}"`, / · market closed · opens 24 Nov 08:00 SGT · 23 Nov 2026: a holiday in JPX's calendar \(personal use\)$/.test(full), full); }
    if (clock === HOL) { await p.locator(".mp-row.inst", { has: p.locator(".n", { hasText: /^Nikkei 225$/ }) }).tap(); await p.waitForSelector(".mp-item.open .mp-full"); const full = await p.locator(".mp-item.open .mp-full").textContent();
      ck(`its opened row says it in full: "…${full.split(" · ").slice(-2).join(" · ")}"`, / · market closed: a holiday in JPX's calendar \(personal use\) · opens 24 Nov 08:00 SGT$/.test(full), full); }
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }

  console.log("\n[D-65 on a page's own chart, both layouts: the line after the stamp begins with the reason]");
  for (const [clock, when, hash, want] of [[HOL, "Tokyo's holiday", "#asset/7203.T", "holiday · opens 24 Nov 08:00 SGT"], [BRK, "Tokyo's midday break", "#asset/7203.T", "midday break · opens 11:30 SGT"], [EARLY, "New York's early close", "#asset/NVDA", "early close · opens 30 Nov 22:30 SGT"], [SAT, "a weekend", "#asset/7203.T", "opens 24 Nov 08:00 SGT · 23 Nov: holiday"], [SAT, "a weekend", "#equities/nk225", "opens 24 Nov 08:00 SGT · 23 Nov: holiday"]]) for (const code of ["C1", "P1", ...(clock === HOL ? ["C4"] : [])]) {
    if (hash === "#equities/nk225" && code === "P1") continue;   // a phone's EQUITIES heads its screen with a line, not a tile (checked above as a line)
    const { ctx, p, errs } = await page(b, code, clock);
    await go(p, MOCK, hash, ".bigwrap .asof, .mp-hero .asof");
    const h = await hero(p);
    ck(`${code}, ${when}, ${hash}: "${h?.stamp}" and "${h?.opens}", whole`, h?.opens === want && /^CLOSED /.test(h.stamp) && h.whole && h.ox <= 0 && errs.length === 0, { h, errs });
    await ctx.close();
  }

  console.log("\n[a holiday an opening passes over, in the \"Closed now\" line]");
  for (const code of ["C1", "C4"]) {
    const { ctx, p, errs } = await page(b, code, SAT);
    await go(p, MOCK, "#market", "table.mkt tbody tr:not(.cls)");
    const c = await closedNow(p, "#mk-opens");
    ck(`${code}, a weekend: MARKETS' line holds "Tokyo opens 24 Nov 08:00 SGT (23 Nov: holiday)", whole, above the table`, / · Tokyo opens 24 Nov 08:00 SGT \(23 Nov: holiday\) · next read 23 Nov 22:30 SGT: VIX, DXY, UST 10Y$/.test(c?.line ?? "") && c.whole && c.above && c.ox <= 0 && errs.length === 0, { c, errs });
    await ctx.close();
  }

  console.log("\n[D-66: an old price while its market trades]");
  { const NOW = "2026-11-24T02:00:00Z";   // Tue 24 Nov 10:00 SGT: Tokyo two hours into its session; the Nikkei 225's last print is of 08:40
    const closes = { d1: 100, w1: 100, m1: 100, m3: 100, m12: 100, m36: 100 }, dates = { d1: "2026-11-20", w1: "2026-11-17", m1: "2026-10-24", m3: "2026-08-24", m12: "2025-11-24", m36: "2023-11-24" }, pct = { d1: 1, w1: 1, m1: 1, m3: 1, m12: 1, m36: 1 };
    const row = (o) => ({ cls: "Equities", group: "equity", currency: "USD", decimals: 2, order: 1, last: 12345.67, source: "yahoo", closes, closeDates: dates, pct, chg: pct, marketTab: true, chart: true, z1m: 0.1, pos52: 50, vs200: 1, live: false, lastAt: "2026-11-24T00:40:00Z", ...o });
    const rows = [row({ symbol: "^N225", name: "Nikkei 225", market: "TSE", currency: "JPY", order: 1 }), row({ symbol: "^GSPC", name: "S&P 500", market: "NYSE", lastAt: "2026-11-23T21:00:00Z", order: 3 }), row({ symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", group: "fx", market: "FX", currency: "JPY", decimals: 3, last: 158.4, order: 21, live: true, lastAt: "2026-11-24T01:59:00Z" })];
    const HOLIDAYS = { TSE: ["2026-12-31", "2027-01-01"], NYSE: ["2026-11-26", "2026-12-25", "2027-01-01"] };
    const open = async (code) => { const z = SIZES[code], ctx = await b.newContext({ ...(z.dev ? devices[z.dev] : { viewport: { width: z.vp[0], height: z.vp[1] } }), deviceScaleFactor: 1 }); await ctx.addInitScript(() => { try { localStorage.setItem("om_a2hs_hide", "1"); } catch {} }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); await p.clock.setFixedTime(new Date(NOW));
      await p.route("**/fakeapi?*", (r) => { const a = new URL(r.request().url()).searchParams.get("action");
        const body = a === "health" ? { ok: true, at: NOW, tick: { lastAt: NOW, ageMin: 1, ok: true, note: "stand-in" }, daily: { lastAt: NOW, ok: true, note: "stand-in" }, sources: [], holidays: HOLIDAYS, holidaysVerified: true } : a === "table" ? { rows, asOf: NOW } : a === "series" ? { symbol: "x", res: "1d", points: [], asOf: null } : { rows: [] };
        r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) }); });
      return { ctx, p, errs }; };
    for (const code of ["P1", "P2"]) {
      const { ctx, p, errs } = await open(code);
      await go(p, STANDIN, "#market", ".mp-row.inst");
      await p.waitForFunction(() => [...document.querySelectorAll(".mp-row.inst .opens")].some((e) => e.textContent === "open since 08:00 SGT"), null, { timeout: 8000 }).catch(() => undefined);
      const l = await phoneLine(p, "Nikkei 225"), sp = await phoneLine(p, "S&P 500"), jp = await phoneLine(p, "USD/JPY");
      ck(`${code}, Tue 10:00 SGT, a Tokyo row that is not live: "${l?.state}" then "${l?.opens}", the first in amber (${l?.colour}), on one line; it read "No new print"`, l?.state === "Last print 08:40" && l.opens === "open since 08:00 SGT" && l.colour === WARN && l.usual !== WARN && l.rows === 1 && l.whole, l);
      ck(`${code}: a market that is shut keeps its word in the usual colour ("${sp?.state}", ${sp?.colour}); a live row says "${jp?.state}"`, sp?.state === "Closed" && sp.colour !== WARN && jp?.state === "Live" && errs.length === 0, { sp, jp, errs });
      await ctx.close();
    }
    { const { ctx, p, errs } = await open("C1");
      await go(p, STANDIN, "#market", ".mtile.cp .asof");
      await p.waitForFunction(() => [...document.querySelectorAll(".mtile.cp .opens")].some((e) => e.textContent === "open since 08:00 SGT"), null, { timeout: 8000 }).catch(() => undefined);
      await p.locator(".mtile.cp").first().scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
      const t = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll(".mtile.cp")].filter((x) => x.querySelector(":scope > .vl > .tags > .asof .st") && x.querySelector(".lbtxt")).map((x) => { const st = x.querySelector(":scope > .vl > .tags > .asof .st"); return [x.querySelector(".lbtxt").textContent, { label: st.textContent, colour: getComputedStyle(st).color, stamp: x.querySelector(":scope > .vl > .tags > .asof").textContent.replace(/\s+/g, " ").trim(), opens: x.querySelector(".opens")?.textContent ?? null }]; })));
      ck(`C1: the same row's tile: "${t["Nikkei 225"]?.stamp}" with its LAST PRINT in amber (${t["Nikkei 225"]?.colour}) and "${t["Nikkei 225"]?.opens}"; the S&P 500's CLOSED and USD/JPY's LIVE are not amber`, t["Nikkei 225"]?.stamp === "LAST PRINT 08:40 SGT" && t["Nikkei 225"].colour === WARN && t["Nikkei 225"].opens === "open since 08:00 SGT" && t["S&P 500"]?.label === "CLOSED" && t["S&P 500"].colour !== WARN && t["USD/JPY"]?.label === "LIVE" && t["USD/JPY"].colour !== WARN && errs.length === 0, { t, errs });
      await ctx.close(); }
  }
  { const { ctx, p, errs } = await page(b, "P1", OWNER);
    await go(p, MOCK, "#market", ".mp-row.inst");
    const dx = await phoneLine(p, "DXY");
    ck(`the dollar index, read only in New York's hours, at Fri 21:16 SGT: "${dx?.state}" in the line's usual colour (${dx?.colour}), with "${dx?.opens}": its print is not late`, dx?.state === "Last print 05:00" && dx.colour === dx.usual && dx.colour !== WARN && dx.opens === "next read 22:30 SGT" && errs.length === 0, { dx, errs });
    await ctx.close(); }
  { const { ctx, p, errs } = await page(b, "C1", OWNER);
    await go(p, MOCK, "#rates", ".panel[data-k='pairs'] .mtile.cp .asof");
    const st = await p.evaluate(() => { const x = [...document.querySelectorAll(".mtile.cp")].find((t) => /Dollar Index|DXY/.test(t.querySelector(".lbtxt")?.textContent ?? "")), s = x?.querySelector(".asof .st"); return s ? { label: s.textContent, colour: getComputedStyle(s).color } : { label: null, names: [...document.querySelectorAll(".mtile.cp .lbtxt")].map((e) => e.textContent) }; });
    ck(`and its tile keeps the plain stamp ("${st.label}", ${st.colour})`, st.label === "LAST PRINT" && st.colour !== WARN && errs.length === 0, { st, errs });
    await ctx.close(); }

  console.log("\n[RATES & FX's FX panel on a weekday: the next read alone, where no market of its rows is shut]");
  for (const code of ["C1", "C4", "C4b"]) {
    const { ctx, p, errs } = await page(b, code, "2026-11-24T02:00:00Z");   // Tue 24 Nov 10:00 SGT: the FX week runs, New York is shut
    await go(p, MOCK, "#rates", ".panel[data-k='fx'] table.mini tbody tr");
    const c = await closedNow(p, "#fx-opens");
    ck(`${code}, Tue 10:00 SGT: the FX panel shows "${c?.line}" above its table, whole, with no "Closed now:" before it; its tooltip says what the time is`, c?.line === "Next read 22:30 SGT: DXY" && c.whole && c.above && c.ox <= 0 && /^The Monitor reads this instrument during New York's regular session/.test(c.tip ?? "") && errs.length === 0, { c, errs });
    await ctx.close();
  }
  { const { ctx, p, errs } = await page(b, "C1", "2026-11-24T15:00:00Z");   // Tue 24 Nov 23:00 SGT: New York open
    await go(p, MOCK, "#rates", ".panel[data-k='fx'] table.mini tbody tr");
    ck("with New York open and the dollar index being read: no line", (await p.locator("#fx-opens").count()) === 0 && errs.length === 0, errs);
    await ctx.close(); }

  console.log("\n[the opening on a phone's page head]");
  for (const code of ["P1", "P2"]) {
    { const { ctx, p, errs } = await page(b, code, SAT2);
      await go(p, MOCK, "#asset/7203.T", ".mp-hero .asof");
      const h = await hero(p);
      ck(`${code}, Sat 14:12 SGT, #asset/7203.T: "${h?.opens}" stands on a line of its own and starts at x ${h?.left}, the badges' left edge (${h?.firstLeft}); it stood 4 px to their right`, h?.ownLine === true && Math.abs(h.left - h.firstLeft) <= 0.5 && h.margin === "0px" && h.whole && h.ox <= 0 && errs.length === 0, { h, errs });
      await ctx.close(); }
    { const { ctx, p, errs } = await page(b, code, OWNER);
      await go(p, MOCK, "#asset/NVDA", ".mp-hero .asof");
      const h = await hero(p);
      ck(`${code}, Fri 21:16 SGT, #asset/NVDA: "${h?.stamp}" and "${h?.opens}" share a line, the gap between them ${h?.gap} px (the row's own, 6)`, h?.ownLine === false && Math.abs(h.gap - 6) <= 0.5 && h.margin === "0px" && h.opens === "opens 22:30 SGT" && errs.length === 0, { h, errs });
      await ctx.close(); }
  }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
