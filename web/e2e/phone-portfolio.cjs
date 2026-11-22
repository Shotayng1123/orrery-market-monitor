// The paper portfolio on a phone (P-1, 21 Nov 2026; the checks of the designer's build note D/p1-design.md §1.4, §2.1,
// §3, §4.10, §5.5 and §10), on the local copy (5179), whose stand-in store keeps its books in this browser.
// Nothing here reads the machine's clock: every page sets `om_mock_now` (17:00 SGT on Sat 21 Nov 2026, so the next
// session is Mon 23 Nov 2026; 15 Dec 2026 for the targets' window; 07:10 SGT on Tue 24 Nov for the bar). What must
// have room (the bar's labels, the statement's sheet, Review and Create above the bar) is measured in the machine's
// fonts and with a wide font forced, on an iPhone SE, an iPhone 13 and a Pixel 7.
//   [1] the bar: a seventh item, every label inside its item, the current label alone under 360 px
//   [2] with no book, and the list
//   [3] the statement in the bottom sheet, and a first portfolio
//   [4] the form's screens: the start, Review, a section; inputs of 16 px and 48 px, Review and Create above the bar
//   [5] a book: its head and two views, Overview, a change in the sheet, the targets' window, notes, delete
//   [6] every screen of P-1: each tap target 44 x 44 px, measured on what takes the tap, and nothing sideways
//   [7] "personal use" on the phone's source lines (live with this round), and the classic phone layout
// Run from web/:  node e2e/run.cjs phone-portfolio   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const fs = require("fs"), path = require("path");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 1800)}`); };
const NOW = "2026-11-21T09:00:00Z", DEC = "2026-12-15T02:00:00Z", MORNING = "2026-11-23T23:10:00Z";
const WIDE = "*{font-family:monospace!important}";
const PHONES = { P1: "iPhone SE (3rd gen)", P2: "iPhone 13", PX7: "Pixel 7" };
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LONG_NAME = "Global long/short on a yen base, every region through an ETF";
const EMPTY = JSON.stringify({ seq: 0, consents: {}, books: [] });   // an account with no book that has not agreed, kept in this browser
const engine = (f) => fs.readFileSync(path.join(__dirname, "..", "..", "supabase", "functions", "_shared", "pf", f), "utf8");
const constant = (f, name) => { const m = new RegExp(`export const ${name} = "((?:[^"\\\\]|\\\\.)*)";`).exec(engine(f)); if (!m) throw new Error(`${name} not found in ${f}`); return JSON.parse(`"${m[1]}"`); };
const STATEMENT = constant("statement.ts", "STATEMENT_TEXT"), GIST = constant("statement.ts", "NOTE_GIST"), NO_SUCH = constant("words.ts", "NO_SUCH"), NOT_BUILT = constant("presets.ts", "NOT_BUILT_YET");
const labels = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "labels.ts"), "utf8"), PERSONAL = /export const PERSONAL_USE_TEXT = "([^"]*)";/.exec(labels)[1], PAPER_TIP = /export const PAPER_TIP = "([^"]*)";/.exec(labels)[1];
const INTRO = "Run a paper portfolio from today. Orders fill only on the market's own prints after they are placed, with spreads, fees and a 20% cap on volume. No real orders, no broker, no money. Only your account sees it.";

async function open(b, code = "P2", { clock = NOW, ls = {}, width } = {}) {
  const dev = devices[PHONES[code]];
  const ctx = await b.newContext({ ...dev, deviceScaleFactor: 1, ...(width ? { viewport: { width, height: dev.viewport.height } } : {}) });
  await ctx.addInitScript(([at, more]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_a2hs_hide", "1"); for (const [k, v] of Object.entries(more)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v); } catch {} }, [clock, ls]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  return { ctx, p, errs };
}
const settle = async (p, ms = 250) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(ms); };
const go = async (p, hash, sel, q = "") => { await p.goto(MOCK + q + "#" + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p); };
// The address is set and the page has taken it (the hashchange has been handled and two frames drawn) before the
// selector is waited for: a selector the page left also has (another book's Overview) must not be read from that page.
const hop = async (p, hash, sel) => {
  await p.evaluate((h) => new Promise((res) => { const drawn = () => requestAnimationFrame(() => requestAnimationFrame(() => res())); if (location.hash === `#${h}`) drawn(); else { addEventListener("hashchange", drawn, { once: true }); location.hash = h; } }), hash);
  if (sel) await p.waitForSelector(sel, { timeout: 15000 });
  await settle(p);
};
const pf = (p, sub, sel) => hop(p, `portfolio/${sub}`, sel);
const text = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, " ").trim() : null; }, sel);
const type = async (p, key, value) => { const sel = `[data-row="${key}"] input[data-key="${key}"]`; await p.fill(sel, value); await p.locator(sel).blur(); await p.waitForTimeout(60); };
const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
// every tap target of the page (or of the sheet that is open over it) under 44 x 44 px, measured on what takes the
// tap as the layout guard measures it: the element, widened by a ::before or ::after laid over it; a link inside a
// sentence is not a target of its own (the designer's D-19)
const smallTaps = (p) => p.evaluate(() => {
  const TAP = "a[href], button, select, input:not([type=hidden]), textarea, summary, [role=button], [role=link], [role=radio], [tabindex]:not([tabindex='-1'])";
  const scope = document.querySelector(".sheet") ?? document.querySelector("#grid"), out = [];
  for (const el of scope.querySelectorAll(TAP)) {
    if (!el.checkVisibility({ checkVisibilityCSS: true }) || getComputedStyle(el).pointerEvents === "none") continue;
    const r = el.getBoundingClientRect(); if (r.width < 0.5 || el.matches("label.pick, .pick *:not(select), option")) continue;
    let L = r.left, T = r.top, R = r.right, B = r.bottom;
    for (const ps of ["::before", "::after"]) { const s = getComputedStyle(el, ps); if (!s.content || s.content === "none" || s.content === "normal" || s.position !== "absolute" || s.pointerEvents === "none" || s.display === "none") continue;
      const px = (v) => (v && v !== "auto" ? parseFloat(v) : null), t = px(s.top), bt = px(s.bottom), l = px(s.left), rr = px(s.right); if (t != null && bt != null) { T = Math.min(T, r.top + t); B = Math.max(B, r.bottom - bt); } if (l != null && rr != null) { L = Math.min(L, r.left + l); R = Math.max(R, r.right - rr); } }
    if (R - L >= 43.5 && B - T >= 43.5) continue;
    const pt = el.parentElement, own = (el.textContent || "").trim(), around = pt ? (pt.textContent || "").trim() : "";
    if (el.matches("a, .lnk") && getComputedStyle(el).display === "inline" && around.length > own.length + 3 && !/flex|grid/.test(getComputedStyle(pt).display)) continue;
    out.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ")[0]} ${Math.round(R - L)}x${Math.round(B - T)} "${own.slice(0, 22)}"`);
  }
  return out;
});
// whether an element stands whole above the bottom bar and under the top of the window, at four scroll positions
const aboveBar = (p, sel) => p.evaluate(async (s) => { const seen = []; for (const f of [0, 0.33, 0.66, 1]) { scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const r = document.querySelector(s).getBoundingClientRect(), nav = document.querySelector("#pnav").getBoundingClientRect().top; seen.push({ f, top: Math.round(r.top), h: Math.round(r.height), ok: r.top >= 0 && r.bottom <= nav + 0.5 }); } scrollTo(0, 0); return seen; }, sel);

(async () => {
  const b = await chromium.launch();

  console.log("\n[1] the bar: a seventh item, every label inside its item, and under 360 px the current label alone");
  {
    const bar = (p) => p.evaluate(() => { const R = (e) => e.getBoundingClientRect(), items = [...document.querySelectorAll("#pnav a")].map((a) => ({ label: a.querySelector("span").textContent, aria: a.getAttribute("aria-label"), w: Math.round(R(a).width * 10) / 10, h: Math.round(R(a).height), sl: R(a.querySelector("span")).left, sr: R(a.querySelector("span")).right, sw: Math.round(R(a.querySelector("span")).width * 10) / 10, shown: a.querySelector("span").getClientRects().length > 0, cut: a.querySelector("span").scrollWidth > a.querySelector("span").clientWidth + 1, on: a.classList.contains("on") }));
      const gaps = items.slice(1).map((x, i) => Math.round((x.sl - items[i].sr) * 10) / 10); return { items, gaps, sideways: document.documentElement.scrollWidth - innerWidth }; });
    for (const code of Object.keys(PHONES)) {
      const { ctx, p, errs } = await open(b, code, { clock: MORNING });
      await go(p, "market", ".mp-row");
      const m = await bar(p); await p.addStyleTag({ content: WIDE }); await settle(p, 300); const w = await bar(p);
      ck(`${PHONES[code]}: seven items (${m.items.map((x) => x.label).join(" · ")}), each ${m.items[0].w} px wide and ${m.items[0].h} tall; in the machine's fonts no label is wider than its item (the widest ${Math.max(...m.items.map((x) => x.sw))} px) and two neighbours are at least ${Math.min(...m.gaps)} px apart; with a wide font forced no two labels meet (the nearest ${Math.min(...w.gaps)} px apart) and nothing scrolls sideways`,
        m.items.length === 7 && m.items.map((x) => x.label).join() === "Markets,News,Research,Equities,Rates,Watchlist,Portfolio" && m.items.every((x) => x.w >= 44 && x.h >= 58 && x.sw <= x.w + 0.5 && !x.cut && x.aria === x.label) && Math.min(...m.gaps) >= 2 && w.items.every((x) => x.sw <= x.w + 0.5) && Math.min(...w.gaps) >= 0 && m.sideways <= 0 && w.sideways <= 0 && errs.length === 0, { m, w: w.gaps, errs });
      await ctx.close();
    }
    const { ctx, p, errs } = await open(b, "P2", { clock: MORNING });
    await go(p, "market", ".mp-row");
    await p.evaluate(() => scrollTo(0, 600)); await p.locator('#pnav a[href="#portfolio"]').tap(); await p.waitForSelector("#pf-list");
    const on = await p.evaluate(() => ({ hash: location.hash, lit: document.querySelector("#pnav a.on")?.textContent, current: document.querySelector('#pnav a[aria-current="page"]')?.getAttribute("href"), y: scrollY, title: document.querySelector(".mp-head h1").textContent, icon: document.querySelector('#pnav a[href="#portfolio"] svg path').getAttribute("d") }));
    ck(`a tap on "Portfolio" opens #portfolio at its top and lights the item; its icon is the circle with one quarter drawn apart`, on.hash === "#portfolio" && on.lit === "Portfolio" && on.current === "#portfolio" && on.y === 0 && on.title === "Portfolio" && on.icon === "M12 3a9 9 0 1 0 9 9h-9z" && errs.length === 0, { on, errs });
    await ctx.close();
    const narrow = await open(b, "P1", { clock: MORNING, width: 320 });
    await go(narrow.p, "market", ".mp-row");
    const n = await bar(narrow.p);
    ck(`at 320 px (under 360) the bar shows each icon and the label of the current tab only (${n.items.filter((x) => x.shown).map((x) => x.label).join()}); every link keeps its name for a screen reader`, n.items.length === 7 && n.items.filter((x) => x.shown).map((x) => x.label).join() === "Markets" && n.items.every((x) => x.aria === x.label && x.w >= 44) && n.sideways <= 0, n);
    await narrow.ctx.close();
    const off = await open(b, "P2", { clock: MORNING, ls: { om_paper: "0" } });
    await go(off.p, "portfolio/new", ".mp-row");
    const o = await off.p.evaluate(() => ({ items: document.querySelectorAll("#pnav a").length, n7: document.querySelector("#pnav").classList.contains("n7"), aria: [...document.querySelectorAll("#pnav a")].filter((a) => a.hasAttribute("aria-label")).length, title: document.querySelector(".mp-head h1").textContent, word: /portfolio/i.test(document.body.innerText.replace(/MOCK PREVIEW[^\n]*/g, "")) }));
    ck("with the page's switch off (as the published page is): six items, as they are today, #portfolio/new shows Markets, and the word stands nowhere on the screen", o.items === 6 && !o.n7 && o.aria === 0 && o.title === "Markets" && !o.word, o);
    await off.ctx.close();
  }

  console.log("\n[2] with no book, and the list");
  for (const code of ["P1", "P2"]) {
    const { ctx, p, errs } = await open(b, code);
    await go(p, "portfolio", "#pf-cards", "?mock=empty");
    const s = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect(), rows = [...document.querySelectorAll("#pf-cards a.pfp-startlink")], lines = [...document.querySelectorAll("#pf-notyet p")], intro = document.querySelector("#pf-intro");
      return { title: document.querySelector(".mp-head h1").textContent, head: Math.round(R(document.querySelector(".mp-head")).height), rows: rows.map((r) => ({ href: r.getAttribute("href"), h: Math.round(R(r).height), n: r.querySelector(".n").textContent, l: r.querySelector(".l").textContent, cut: r.querySelector(".l").scrollWidth > r.querySelector(".l").clientWidth + 1 })), groups: [...document.querySelectorAll(".pfp-group")].map((g) => g.textContent),
        intro: intro.textContent, introCut: intro.scrollWidth > intro.clientWidth + 1, lines: lines.map((l) => l.textContent), taps: document.querySelectorAll("#pf-notyet a, #pf-notyet button, #pf-notyet [tabindex], #pf-notyet [role]").length, pointer: lines.some((l) => getComputedStyle(l).cursor === "pointer"), disabled: document.querySelectorAll("#grid [disabled], #grid [aria-disabled]").length, faded: [...document.querySelectorAll("#grid a, #grid button")].filter((e) => Number(getComputedStyle(e).opacity) < 1).length, sideways: document.documentElement.scrollWidth - innerWidth }; });
    ck(`${PHONES[code]}: "${s.title}" on a title row of ${s.head} px; three starts as rows of one card, each at least 64 px (${s.rows.map((r) => r.h).join(", ")}) and opening its own address; the two relative-return starts are two muted lines that take no tap; nothing is drawn as a disabled button; no sideways scroll`, s.title === "Portfolio" && s.head === 44 && s.rows.length === 3 && s.rows.every((r) => r.h >= 64 && !r.cut) && s.rows.map((r) => r.href).join() === "#portfolio/new/ar-ls-jp,#portfolio/new/ar-ls-gl,#portfolio/new/ar-macro"
      && s.rows.map((r) => `${r.n}: ${r.l}`).join("|") === "Equity long/short · Japan: USD 100m · reference MSCI Japan, hedged|Equity long/short · Global: USD 100m · reference MSCI ACWI|Global macro: USD 100m · reference 60/40 ACWI and Global Agg" && s.groups.join("|") === "ABSOLUTE RETURN · against its own targets|RELATIVE RETURN · against a benchmark" && s.intro === INTRO && !s.introCut
      && s.lines.join("|") === "Equity long-only: offered once its benchmark limits are built.|Fixed-income long-only: offered once its benchmark's profile is read." && s.taps === 0 && !s.pointer && s.disabled === 0 && s.faded === 0 && s.sideways <= 0 && errs.length === 0, { s, errs });
    if (code === "P2") {
      await p.locator("#pf-paper").tap(); await p.waitForSelector(".sheet");
      const sheet = await p.evaluate(() => ({ title: document.querySelector(".sheet-head .t").textContent, words: [...document.querySelectorAll(".sheet .pf-sheet-p")].map((x) => x.textContent) }));
      await p.locator(".sheet-head .x").tap(); await p.waitForTimeout(250);
      ck(`a tap on PAPER opens its words in the sheet: "${sheet.words[0]}" and who sees it`, sheet.title === "PAPER" && sheet.words[0] === PAPER_TIP && sheet.words[1] === "only you: visible to your account only." && (await p.locator(".sheet").count()) === 0, sheet);
      await p.locator('#pf-cards a[data-start="ar-macro"]').tap(); await p.waitForSelector("#pf-review");
      const st = await p.evaluate(() => ({ hash: location.hash, on: document.querySelector(".pfp-start.on .n").textContent, name: document.querySelector("#pf-name").value }));
      ck(`a start's row opens the form with that start chosen (${st.hash}, "${st.name}")`, st.hash === "#portfolio/new/ar-macro" && st.on === "Global macro" && st.name === "Global macro · 21 Nov 2026", st);
    }
    await ctx.close();
  }
  {
    const { ctx, p, errs } = await open(b, "P2");
    await go(p, "portfolio/all", "#pf-list");
    const l = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect(), rows = [...document.querySelectorAll("#pf-list a.pfp-book-row")], nw = document.querySelector("#pf-new");
      return { rows: rows.map((r) => ({ href: r.getAttribute("href"), lines: [r.querySelector(".n").textContent, ...[...r.querySelectorAll(".l")].map((x) => x.textContent)], h: Math.round(R(r).height), cut: [...r.querySelectorAll(".n, .l")].some((x) => x.scrollWidth > x.clientWidth + 1) })), aux: document.querySelector(".mp-sec h2 .aux").textContent, nw: { text: nw.textContent, h: Math.round(R(nw).height), w: Math.round(R(nw).width), bg: getComputedStyle(nw).backgroundColor, href: nw.getAttribute("href") }, vw: innerWidth, filled: document.querySelectorAll(".pf-go").length, sideways: document.documentElement.scrollWidth - innerWidth }; });
    ck(`the list: rows of three lines in one card (${l.rows[0].lines.join(" / ")}), the 60-character name whole; under it "+ New paper portfolio", ${l.nw.h} px tall, teal and as wide as the card, the screen's one filled button`, l.rows.length === 3 && l.rows[0].lines.join("|") === "Tokyo L/S|Equity L/S · Japan · USD · 100,000,000|cash + 5.0% · 5.0% · created 1 Oct 2026" && l.rows[1].lines[0] === LONG_NAME && l.rows[1].lines[1] === "Equity L/S · Global · JPY · 10,000,000,000" && l.rows.every((r) => r.h >= 64 && !r.cut) && l.rows.map((r) => r.href).join() === [1, 2, 3].map((n) => `#portfolio/${ID(n)}`).join()
      && l.aux === "3 open · only you" && l.nw.text === "+ New paper portfolio" && l.nw.h === 52 && l.nw.w >= l.vw - 34 && l.nw.bg === "rgb(31, 209, 193)" && l.nw.href === "#portfolio/new" && l.filled === 1 && l.sideways <= 0 && errs.length === 0, { l, errs });
    await ctx.close();
    const cap = await open(b, "P2");
    await go(cap.p, "portfolio/all", "#pf-cap", "?mock=cap");
    const c = await cap.p.evaluate(() => ({ rows: document.querySelectorAll("#pf-list a").length, line: document.querySelector("#pf-cap").textContent, button: !!document.querySelector("#pf-new") }));
    ck(`at the cap the button gives way to its line: "${c.line}"`, c.rows === 5 && c.line === "You have 5 open paper portfolios, the most an account may hold. Delete one to start another." && !c.button, c);
    await cap.ctx.close();
  }

  console.log("\n[3] the statement in the bottom sheet, and a first portfolio");
  for (const [code, wide] of [["P1", false], ["P1", true], ["P2", false]]) {
    const { ctx, p, errs } = await open(b, code, { ls: { om_mock_pf: EMPTY } });
    await go(p, "portfolio/new/ar-ls-jp/review", "#pf-create");
    if (wide) { await p.addStyleTag({ content: WIDE }); await settle(p, 300); }
    await p.locator("#pf-create").tap(); await p.waitForSelector("#pf-consent"); await p.waitForTimeout(350);
    const s = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect(), sh = document.querySelector("#pf-consent"), body = sh.querySelector(".sheet-body"), box = sh.querySelector(".pf-agree"), go2 = document.querySelector("#pf-continue"), no = document.querySelector("#pf-notnow"), x = sh.querySelector(".sheet-head .x"), words = document.querySelector("#pf-statement");
      const inView = (e) => R(e).top >= 0 && R(e).bottom <= innerHeight + 0.5;
      return { title: sh.querySelector(".sheet-head .t").textContent, words: words.textContent, font: parseFloat(getComputedStyle(words).fontSize), wordsCut: words.scrollWidth > words.clientWidth + 1, sideways: body.scrollWidth - body.clientWidth, page: document.documentElement.scrollWidth - innerWidth, box: Math.round(R(box).height), input: Math.round(R(box.querySelector("input")).height), label: box.innerText.trim(), go: { h: Math.round(R(go2).height), w: Math.round(R(go2).width), disabled: go2.disabled, view: inView(go2), name: go2.getAttribute("aria-label") }, no: { h: Math.round(R(no).height), view: inView(no), text: no.textContent }, x: `${Math.round(R(x).width)}x${Math.round(R(x).height)}`, sheet: Math.round(R(sh).height), vh: innerHeight, extra: sh.querySelectorAll("a, small").length }; });
    ck(`${PHONES[code]}${wide ? ", a wide font forced" : ""}: the statement is a bottom sheet (${s.sheet} of ${s.vh} px): "${s.title}", version 1's words whole at ${s.font} px with no sideways scroll, the box and its label one row of ${s.box} px, Continue ${s.go.h} px and "Not now" ${s.no.h} px, both in view; Continue cannot be pressed until the box is ticked`, s.title === "Before your first paper portfolio" && s.words === STATEMENT && s.font === 15 && !s.wordsCut && s.sideways <= 0 && s.page <= 0 && s.box >= 44 && s.input >= 44 && s.label === "I agree" && s.go.h === 52 && s.go.disabled && s.go.view && /tick the box/.test(s.go.name) && s.no.h >= 44 && s.no.view && s.no.text === "Not now" && s.x === "44x44" && s.sheet <= s.vh * 0.8 + 1 && s.extra === 0, s);
    if (!wide) ck(`${PHONES[code]}: every tap target of the sheet is 44 x 44 px or more`, (await smallTaps(p)).length === 0, await smallTaps(p));
    if (code === "P2") {
      await p.touchscreen.tap(60, 60); await p.waitForTimeout(250); const outside = await p.locator("#pf-consent").count();
      await p.locator("#pf-consent .sheet-head .x").tap(); await p.waitForTimeout(350);
      const notNow = await p.evaluate(() => ({ sheet: !!document.querySelector("#pf-consent"), msg: document.querySelector("#pf-create-msg")?.textContent ?? null, books: JSON.parse(localStorage.getItem("om_mock_pf")).books.length, agreed: Object.keys(JSON.parse(localStorage.getItem("om_mock_pf")).consents).length, hash: location.hash }));
      ck(`a tap on the dimmed page does nothing (an agreement is not dismissed by accident); the sheet's ✕ is "Not now": "${notNow.msg}", and neither a portfolio nor an agreement is stored`, outside === 1 && !notNow.sheet && notNow.msg === "Not created: the statement was not agreed." && notNow.books === 0 && notNow.agreed === 0 && notNow.hash === "#portfolio/new/ar-ls-jp/review", { outside, notNow });
      await p.locator("#pf-create").tap(); await p.waitForSelector("#pf-consent"); await p.waitForTimeout(350);
      await p.locator("#pf-consent .pf-agree").tap(); await p.waitForTimeout(100); const ticked = await p.evaluate(() => ({ on: document.querySelector("#pf-consent input").checked, go: document.querySelector("#pf-continue").disabled }));
      await p.locator("#pf-continue").tap(); await p.waitForSelector("#pf-overview");
      const made = await p.evaluate(() => { const st = JSON.parse(localStorage.getItem("om_mock_pf")); return { hash: location.hash, id: st.books[0]?.id, n: st.books.length, settings: st.books[0]?.settings.length, flash: document.querySelector(".pf-flash")?.textContent ?? null, head: document.querySelector("#pf-strip").innerText.replace(/\s+/g, " ").trim(), sheet: !!document.querySelector(".sheet"), scroll: document.documentElement.style.overflow }; });
      ck(`a tap on the row ticks the box; Continue stores the agreement and creates the portfolio with its ${made.settings - 1} defaults: its Overview opens ("${made.head}") with "${made.flash}" at the foot, and the page scrolls again`, ticked.on && !ticked.go && made.n === 1 && made.hash === `#portfolio/${made.id}` && made.settings === 40 && made.flash === "Paper portfolio created · Equity L/S · Japan · 21 Nov 2026" && made.head === "Equity L/S · Japan · 21 Nov 2026 ▾ PAPER Equity L/S · Japan · AR · USD · only you · created 21 Nov" && !made.sheet && made.scroll !== "hidden", { ticked, made });
      await pf(p, "new/ar-ls-gl/review", "#pf-create"); await p.locator("#pf-create").tap(); await p.waitForSelector("#pf-overview");
      const second = await p.evaluate(() => ({ n: JSON.parse(localStorage.getItem("om_mock_pf")).books.length, sheet: !!document.querySelector("#pf-consent") }));
      await pf(p, `${made.id}/settings/statement`, "#pf-agreed"); const agreed = await text(p, "#pf-agreed");
      ck(`a second portfolio is created without the sheet; Settings shows "${(agreed ?? "").slice(0, 44)}" and the words`, second.n === 2 && !second.sheet && new RegExp(`^Agreed 21 Nov 2026 17:0\\d SGT · version 1 ${STATEMENT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`).test(agreed ?? ""), { second, agreed });
    }
    ck(`${PHONES[code]}${wide ? ", a wide font forced" : ""}: no error on the page`, errs.length === 0, errs);
    await ctx.close();
  }

  console.log("\n[4] the form's screens: the start, Review, a section");
  {
    const SECTIONS = ["kind", "targets", "trade", "limits", "ladder", "cash", "costs"];
    for (const wide of [false, true]) {
      const { ctx, p, errs } = await open(b, "P1");
      await go(p, "portfolio/new/ar-ls-jp", "#pf-review");
      if (wide) { await p.addStyleTag({ content: WIDE }); await settle(p, 300); }
      const start = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect(), rows = [...document.querySelectorAll(".pfp-start")], nm = document.querySelector("#pf-name"), rv = document.querySelector("#pf-review"); return { rows: rows.map((r) => Math.round(R(r).height)), on: rows.map((r) => r.getAttribute("aria-checked")).join(), name: { font: parseFloat(getComputedStyle(nm).fontSize), h: Math.round(R(nm).height) }, review: { h: Math.round(R(rv).height), text: rv.textContent }, lines: [...document.querySelectorAll(".pfp .pf-mut.notyet")].map((x) => x.textContent), sum: document.querySelector("#pf-summary").innerText.split("\n").length, sideways: document.documentElement.scrollWidth - innerWidth }; });
      const rv = await aboveBar(p, "#pf-review");
      ck(`iPhone SE${wide ? ", a wide font forced" : ""} · the start: three radio rows of at least 56 px (${start.rows.join(", ")}), the first chosen; the name's input ${start.name.font} px and ${start.name.h} px tall; Review ${start.review.h} px, above the bottom bar at every scroll position (${rv.map((x) => x.top).join(", ")}); nothing sideways`, start.rows.length === 3 && start.rows.every((h) => h >= 56) && start.on === "true,false,false" && start.name.font === 16 && start.name.h >= 48 && start.review.h === 52 && start.review.text === "Review" && rv.every((x) => x.ok && x.h === 52) && start.lines.length === 2 && start.sideways <= 0, { start, rv });
      await p.locator("#pf-review").tap(); await p.waitForSelector("#pf-create");
      const review = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect(), folds = [...document.querySelectorAll(".pfp-fold")]; return { hash: location.hash, folds: folds.map((f) => ({ sec: f.dataset.sec, t: f.querySelector(".t").textContent, s: f.querySelector(".s").textContent, h: Math.round(R(f).height), cut: f.querySelector(".s").scrollWidth > f.querySelector(".s").clientWidth + 1 })), create: { h: Math.round(R(document.querySelector("#pf-create")).height), text: document.querySelector("#pf-create").textContent, disabled: document.querySelector("#pf-create").disabled }, count: document.querySelector("#pf-count").textContent, filled: document.querySelectorAll(".pf-go").length, sideways: document.documentElement.scrollWidth - innerWidth }; });
      const cr = await aboveBar(p, "#pf-create");
      ck(`iPhone SE${wide ? ", a wide font forced" : ""} · Review: seven folds, each with a line of what it holds and "Edit ›" (${review.folds.map((f) => f.t).join(" · ")}); Create paper portfolio ${review.create.h} px, above the bottom bar at every scroll position; "${review.count}"`, review.hash === "#portfolio/new/ar-ls-jp/review" && review.folds.map((f) => f.sec).join() === SECTIONS.join() && review.folds.every((f) => f.h >= 56 && f.s.length > 5 && !f.cut) && review.folds[0].s === "USD · 100,000,000 · absolute return" && review.folds[4].s === "4/2/2 · yearly reset, not after a losing year"
        && review.create.h === 52 && review.create.text === "Create paper portfolio" && !review.create.disabled && cr.every((x) => x.ok && x.h === 52) && review.count === "0 settings out of range" && review.filled === 1 && review.sideways <= 0, { review, cr });
      const bad = [];
      for (const sec of SECTIONS) {
        await pf(p, `new/ar-ls-jp/edit/${sec}`, `.pfp[data-step="edit"]`);
        const m = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect(); return { inputs: [...document.querySelectorAll('.pfp input[type=text], .pfp select, .pfp textarea')].filter((i) => parseFloat(getComputedStyle(i).fontSize) < 16 || R(i).height < 48).map((i) => `${i.dataset.key ?? i.id}: ${getComputedStyle(i).fontSize} ${Math.round(R(i).height)}`), radios: [...document.querySelectorAll(".pf-bases .pf-base")].map((l) => Math.round(R(l).height)), rows: document.querySelectorAll(".pfp-field").length, cut: [...document.querySelectorAll(".pfp-field .lb, .pfp-field .rg, .pfp-field .pf-line, .pfp-field .pf-no, .pf-trade li")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.slice(0, 30)), sideways: document.documentElement.scrollWidth - innerWidth }; });
        const taps = wide ? [] : await smallTaps(p);
        if (m.inputs.length || m.cut.length || m.sideways > 0 || taps.length || (sec === "ladder" && (m.radios.length !== 3 || m.radios.some((h) => h < 56)))) bad.push({ sec, ...m, taps });
      }
      ck(`iPhone SE${wide ? ", a wide font forced" : ""} · each of the seven sections: every input is 16 px (no zoom on focus) and at least 48 px tall, the ladder's three radio rows at least 56 px, no line cut, nothing sideways${wide ? "" : ", every tap target 44 x 44 px or more"}`, bad.length === 0 && errs.length === 0, { bad, errs });
      await ctx.close();
    }
    const { ctx, p, errs } = await open(b, "P2");
    await go(p, "portfolio/new/ar-ls-jp/edit/targets", "#pf-equiv");
    const t = await p.evaluate(() => ({ title: document.querySelector(".pfp-title").textContent, back: document.querySelector(".mp-back").getAttribute("href"), equiv: document.querySelector("#pf-equiv").textContent, sharpe: document.querySelector("#pf-sharpe").textContent, tie: document.querySelector("#pf-tie").dataset.state, by: document.querySelector('[data-row="band"] .pf-by').textContent, rg: document.querySelector('[data-row="target_x"] .rg').textContent, ref: document.querySelector("#pf-reference").innerText.replace(/\s+/g, " ").trim() }));
    await type(p, "target_vol", "6.0"); const warned = await p.evaluate(() => ({ state: document.querySelector("#pf-tie").dataset.state, line: document.querySelector("#pf-tie").textContent }));
    await type(p, "target_x", "15.5"); const refused = await p.evaluate(() => document.querySelector('[data-row="target_x"] .pf-no')?.textContent ?? null);
    await type(p, "target_x", "5.0");
    await p.locator('[data-row="band"] .pf-tap.by').tap(); await p.waitForSelector(".sheet"); const card = await p.evaluate(() => document.querySelector(".sheet .pf-sheet-p").textContent); await p.locator(".sheet-head .x").tap(); await p.waitForTimeout(300);
    ck(`"${t.title}" as a screen of its own: "${t.equiv}", "${t.sharpe}", the Reference fixed by the start; a target volatility of 6.0% shows WARN with 0.88%; a target return of 15.5 is refused under its field ("${refused}"); a tap on whose a default is opens its card in the sheet`, t.title === "Targets and reference" && t.back === "#portfolio/new/ar-ls-jp/review" && t.equiv === "= 9.21% a year at EFFR 3.88% for 18 Nov 2026 (New York Fed)" && t.sharpe === "implied Sharpe 1.0" && t.tie === "clear" && t.by === "C · R-32" && /^0–15%, step 0\.5 · /.test(t.rg) && /^MSCI Japan, net, hedged to USD \(E\) PROXY/.test(t.ref)
      && warned.state === "warned" && /^! WARN Target volatility 6\.0% implies a 99% one-day VaR of 0\.88%/.test(warned.line) && refused === "between 0% and 15%" && /^C · R-32 · settled by C between the PMs' two figures/.test(card), { t, warned, refused, card });
    await p.locator(".mp-back").tap(); await p.waitForSelector(".pfp-folds");
    const rv2 = await p.evaluate(() => ({ targets: document.querySelector('.pfp-fold[data-sec="targets"] .s').textContent, count: document.querySelector("#pf-count").textContent }));
    await pf(p, "new/ar-ls-jp/edit/kind", '[data-row="nav"]'); await type(p, "nav", "5m"); const navNo = await p.evaluate(() => document.querySelector('[data-row="nav"] .pf-no')?.textContent ?? null);
    await pf(p, "new/ar-ls-jp/review", "#pf-create");
    const rv3 = await p.evaluate(() => ({ kind: document.querySelector('.pfp-fold[data-sec="kind"] .s').textContent, count: document.querySelector("#pf-count").textContent, create: document.querySelector("#pf-create").disabled }));
    await p.locator("#pf-count").tap(); await p.waitForSelector('.pfp[data-step="edit"] [data-row="nav"] .pf-no');
    const jumped = await p.evaluate(() => location.hash);
    ck(`back on Review the fold says what was set ("${rv2.targets}"); "5m" as the starting NAV is refused under its field ("${navNo}"), its fold says "${rv3.kind.slice(-15)}", Create cannot be pressed and counts it ("${rv3.count}"), and a tap on the count opens the section with the refusal`, /^cash \+ 5% · 6% of capital · MSCI Japan, hedged PROXY$/.test(rv2.targets) && rv2.count === "0 settings out of range" && navNo === "between USD 10m and USD 1bn" && / · 1 out of range$/.test(rv3.kind) && rv3.count === "1 setting out of range" && rv3.create && jumped === "#portfolio/new/ar-ls-jp/edit/kind", { rv2, navNo, rv3, jumped });
    await type(p, "nav", "100m");
    await p.locator('#pnav a[href="#market"]').tap(); await p.waitForSelector(".mp-row"); await p.locator('#pnav a[href="#portfolio"]').tap(); await p.waitForSelector("#pf-list");
    await pf(p, "new", "#pf-draft");
    const draft = await p.evaluate(() => ({ line: document.querySelector("#pf-draft").innerText.replace(/\s+/g, " ").trim(), changed: document.querySelector("#pf-changedcount").textContent, vol: document.querySelector("#pf-summary").innerText.includes("Target volatility 6% of capital") }));
    ck(`a draft: after MARKETS and back the edited value is there with "${draft.line}" (${draft.changed})`, /^Your unsaved settings from 17:0\d SGT are back · START AGAIN$/.test(draft.line) && draft.changed === "1 setting changed from the defaults" && draft.vol && errs.length === 0, { draft, errs });
    // ---- the ladder's section, and the ladder in target volatilities ----
    await pf(p, "new/ar-ls-jp/edit/ladder", "#pf-bases");
    const bases = await p.evaluate(() => [...document.querySelectorAll("#pf-bases label.pf-base")].map((l) => ({ base: l.dataset.base, on: l.querySelector("input").checked, name: l.querySelector(".n").textContent, line: l.querySelector(".pf-line").textContent, h: Math.round(l.getBoundingClientRect().height), input: Math.round(l.querySelector("input").getBoundingClientRect().height) })));
    await type(p, "cut1", "3"); await type(p, "cut2", "2");
    const lad = await p.evaluate(() => ({ at2: document.querySelector("#pf-at2").textContent, at3: document.querySelector("#pf-at3").textContent, restore: document.querySelector("#pf-restore").textContent }));
    await type(p, "cut1", "4");
    await p.locator('#pf-bases label[data-base="start"]').tap(); await p.waitForTimeout(100);
    const picked = await p.evaluate(() => ({ on: [...document.querySelectorAll("#pf-bases label.pf-base")].filter((l) => l.querySelector("input").checked).map((l) => l.dataset.base).join(), drawdown: document.querySelector("#pf-drawdown").textContent }));
    await p.locator('#pf-bases label[data-base="guarded"]').tap(); await p.waitForTimeout(100);
    await pf(p, "new/ar-ls-jp/edit/targets", "#pf-ladvol"); await type(p, "target_vol", "8.0");
    const v8 = await p.evaluate(() => ({ lad: document.querySelector("#pf-ladvol").textContent, scale: document.querySelector("#pf-scale")?.textContent ?? null }));
    await type(p, "target_vol", "5.0");
    const v5 = await p.evaluate(() => ({ lad: document.querySelector("#pf-ladvol").textContent, scale: document.querySelector("#pf-scale")?.textContent ?? null }));
    ck(`the ladder's base on a phone: three radio rows of at least 56 px (${bases.map((x) => x.h).join(", ")}), each row taking the tap, the first chosen and marked "default", each with its line; a tap on "Since the start" chooses it and the drawdown line follows ("${picked.drawdown.slice(-18)}")`, bases.length === 3 && bases.every((x) => x.h >= 56 && x.input >= 56 && x.line.length > 20) && bases.map((x) => x.on).join() === "true,false,false" && /default · Owner$/.test(bases[0].name) && picked.on === "start" && /the starting NAV$/.test(picked.drawdown), { bases, picked });
    ck(`cuts typed as 3 and 2 print "${lad.at2}" and "${lad.at3}" and the restore line "${lad.restore.slice(0, 62)}"; with the first cut at 4 and the target volatility at 8.0 the form prints "${v8.lad.slice(-36)}" and the scale line, at 5.0 neither`, lad.at2 === "(at 5.0%)" && lad.at3 === "(at 7.0%)" && /^to 50% at a drawdown of 3\.0% or less, to full at 1\.0% or less: /.test(lad.restore) && /= 0\.5 target volatilities \(0\.5 σ\*\)$/.test(v8.lad) && /^For scale \(E, the PMs' simulations/.test(v8.scale ?? "") && /= 0\.8 target volatilities \(0\.8 σ\*\)$/.test(v5.lad) && v5.scale === null, { lad, v8, v5 });
    await pf(p, "new/ar-macro/edit/trade", "#pf-trade");
    const tr = await p.evaluate(() => ({ heads: [...document.querySelectorAll("#pf-trade .minih")].map((h) => h.textContent), bold: [...document.querySelectorAll('#pf-trade ul[data-list="cannot"] li')].filter((l) => l.querySelector("b")?.textContent === l.textContent).length, taps: document.querySelectorAll("#pf-trade a, #pf-trade button, #pf-trade [tabindex]").length, asked: !!document.querySelector("#pf-ask") }));
    ck("the macro start's lists of what it can trade: three lists, the three lines on duration outside the US whole in bold, and no line takes a tap (an address that names another start switches without a question)", tr.heads.length === 3 && tr.bold === 3 && tr.taps === 0 && !tr.asked, tr);
    await ctx.close();
  }
  // EN-3 (DC-6): Review's line for the targets names the Reference the book will have, as the card does: the macro
  // start's blend as chosen, a Japan book's on a yen base (the second review of P-1, 22 Nov 2026)
  {
    const { ctx, p, errs } = await open(b, "P2");
    await go(p, "portfolio/new/ar-macro/edit/targets", "#pf-blend");
    await p.selectOption("#pf-blend", "70"); await settle(p, 150);
    await pf(p, "new/ar-macro/review", "#pf-create");
    const macro = await p.evaluate(() => document.querySelector('.pfp-fold[data-sec="targets"] .s').textContent);
    await pf(p, "new/ar-ls-jp/edit/kind", '[data-row="base"]');
    await p.locator('[data-row="base"] .pf-chip[data-value="JPY"]').tap(); await settle(p, 150);
    await pf(p, "new/ar-ls-jp/review", "#pf-create");
    const yen = await p.evaluate(() => document.querySelector('.pfp-fold[data-sec="targets"] .s').textContent);
    ck(`EN-3: on a phone's Review the targets' line names the Reference the book will have: the macro start on a 70/30 blend "${macro}", the Japan start on a yen base "${yen}" (the start's default label is "60/40 blend" and "MSCI Japan, hedged")`, /· 70\/30 blend PROXY$/.test(macro) && /· MSCI Japan PROXY$/.test(yen) && errs.length === 0, { macro, yen, errs });
    await ctx.close();
  }

  console.log("\n[5] a book: its head and two views, Overview, a change in the sheet, the targets' window, notes, delete");
  {
    const { ctx, p, errs } = await open(b, "P2");
    await go(p, `portfolio/${ID(1)}`, "#pf-overview");
    const o = await p.evaluate(async () => { const R = (e) => e.getBoundingClientRect(), views = [...document.querySelectorAll(".pfp-views a")];
      const secs = [...document.querySelectorAll("#pf-overview .mp-sec")].map((s) => ({ t: s.querySelector("h2 span").textContent, aux: s.querySelector("h2 .aux")?.textContent ?? null }));
      const out = { head: document.querySelector("#pf-strip").innerText.replace(/\s+/g, " ").trim(), nameFont: parseFloat(getComputedStyle(document.querySelector(".pfp-name")).fontSize), views: views.map((v) => `${v.textContent}${v.classList.contains("on") ? " ●" : ""} ${Math.round(R(v).height)}`), secs, book: document.querySelector("#pf-book").innerText.split("\n").map((x) => x.trim()).filter(Boolean), targets: document.querySelector("#pf-targets-now").innerText.replace(/\s+/g, " ").trim(),
        limits: [...document.querySelectorAll("#pf-limits .pfp-set")].map((r) => r.innerText.replace(/\s+/g, " ").trim()), more: document.querySelector("#pf-limits-all")?.textContent ?? null, settings: document.querySelector("#pf-to-settings").getAttribute("href"), canvas: document.querySelectorAll("#pf-overview canvas, #pf-overview svg").length, notbuilt: [...document.querySelectorAll(".pf-notbuilt")].map((e) => e.textContent), words: document.querySelector("#pf-overview").innerText, sideways: document.documentElement.scrollWidth - innerWidth };
      scrollTo(0, 700); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); out.stuck = Math.round(R(document.querySelector(".pfp-views")).top); scrollTo(0, 0); return out; });
    ck(`a book's head: "${o.head}", the name at ${o.nameFont} px; the view row has two chips of 44 px (${o.views.join(" · ")}) and stays at the top of the screen when the page moves`, o.head === "Tokyo L/S ▾ PAPER Equity L/S · Japan · AR · USD · only you · created 1 Oct" && o.nameFont === 22 && o.views.join("|") === "Overview ● 44|Settings 44" && o.stuck === 0 && o.sideways <= 0, o);
    ck(`Overview: ${o.secs.map((s) => s.t).join(" · ")}; the book's card says "${o.book[0]}" and that there is no NAV yet; the targets "${o.targets}"`, o.secs.map((s) => s.t).join("|") === "Book|Targets|Ladder|Reference|What it can trade|Limits as set|Notes|Activity" && o.secs[0].aux === "no NAV yet" && o.secs[2].aux === "Full capital" && o.secs[3].aux === "PROXY" && o.secs[5].aux === "15 · 1 changed · a day ends 17:00 New York" && o.secs[6].aux === "on this portfolio · only you · times in SGT" && o.secs[7].aux === "times in SGT" && o.book.join("|") === "100,000,000 USD · all cash|capital 100.00m · full capital|created 1 Oct 2026 09:12 SGT|no NAV yet: the daily NAV is not built"
      && o.targets === "Target return cash + 5.0% a year = 9.21% at EFFR 3.88% · 18 Nov Target volatility 5.0% of capital a year implied Sharpe 1.0", { secs: o.secs, book: o.book, targets: o.targets });
    ck(`Limits as set shows five rows, the changed one first ("${o.limits[0]}"), then "${o.more}" and "All settings ›"; no chart, and no head reads DAY P&L, SINCE START, NOW, USED, STATE, GROSS or VAR; the muted line of what is not built stands once, last`, o.limits.length === 5 && o.limits[0] === "One name, short you · since Fri 13 Nov 2026 4% of capital" && o.limits[1] === "Sector, net PM A · since Thu 1 Oct 2026 ±20% of capital ±15% from Mon 23 Nov 2026, 06:00 SGT · pending" && o.more === "All 15 limits" && o.settings === `#portfolio/${ID(1)}/settings/limits` && o.canvas === 0 && !/DAY P&L|SINCE START|\bNOW\b|\bUSED\b|\bSTATE\b|\bGROSS\b|\bVAR\b/.test(o.words) && o.notbuilt.length === 1 && o.notbuilt[0] === NOT_BUILT, { limits: o.limits, more: o.more, notbuilt: o.notbuilt });
    // ---- the switcher ----
    await p.locator("#pf-switch").tap(); await p.waitForSelector("#pf-switch-sheet"); await p.waitForTimeout(300);
    const sw = await p.evaluate(() => [...document.querySelectorAll("#pf-switch-sheet .it")].map((a) => a.innerText.replace(/\s+/g, " ").trim()));
    const swTaps = await smallTaps(p);
    await p.locator("#pf-switch-sheet .it").nth(2).tap(); await p.waitForFunction((id) => document.querySelector(".pfp-book")?.dataset.book === id, ID(3)); await p.waitForTimeout(350);
    const sw2 = await p.evaluate(() => ({ hash: location.hash, sheet: !!document.querySelector(".sheet"), name: document.querySelector(".pfp-name .n").textContent, ref: [...document.querySelectorAll("#pf-overview .mp-sec")].find((s) => s.querySelector("h2 span").textContent === "Reference").innerText.replace(/\s+/g, " ").trim() }));
    ck(`a tap on the name lists the account's books in the sheet (${sw.length} lines, each 44 px or more), then "+ New paper portfolio" and "All portfolios ›"; a book picked there opens (${sw2.name}: "${sw2.ref.slice(0, 48)}…") and the sheet is gone`, sw.length === 5 && sw[0] === "Tokyo L/S Equity L/S · Japan" && sw[3] === "+ New paper portfolio" && sw[4] === "All portfolios ›" && swTaps.length === 0 && sw2.hash === `#portfolio/${ID(3)}` && !sw2.sheet && sw2.name === "Macro" && /^REFERENCE PROXY 70\/30 blend · waits for its series/i.test(sw2.ref), { sw, swTaps, sw2 });
    // ---- Settings: what is fixed, a change in the sheet ----
    await pf(p, `${ID(1)}/settings`, "#pf-settings");
    const s = await p.evaluate(() => { const ctl = "input, button, a, select, textarea", row = (sec, k) => document.querySelector(`[data-sec="${sec}"] [data-row="${k}"]`);
      return { views: [...document.querySelectorAll(".pfp-views a")].map((v) => `${v.textContent}${v.classList.contains("on") ? " ●" : ""}`).join("|"), secs: [...document.querySelectorAll("#pf-settings .mp-sec h2 span:first-child")].map((x) => x.textContent), fixed: ["start", "base", "nav", "reference", "house_multiple"].map((k) => ({ k, controls: row("portfolio", k).querySelectorAll(ctl).length, says: row("portfolio", k).querySelector(".pf-fixed")?.textContent ?? null })), ladder: document.querySelector('[data-sec="ladder"]').querySelectorAll(ctl).length, ladderAux: document.querySelector('[data-sec="ladder"] h2 .aux').textContent,
        targets: document.querySelector('[data-sec="targets"]').innerText.replace(/\s+/g, " ").trim(), reset: !!document.querySelector("#pf-reset"), tap: !!document.querySelector('[data-sec="limits"] button.pfp-set[data-row="one_long"]'), noTap: document.querySelector('[data-sec="assumptions"] [data-row="funding"]').tagName, sideways: document.documentElement.scrollWidth - innerWidth }; });
    ck(`Settings (${s.secs.join(" · ")}): the start, base currency, starting NAV, Reference and house margin multiple have no input, button or link and say "fixed"; the ladder says "fixed" once and has no control; the targets say when they may be re-set and offer nothing now; a row that can change is a row that takes the tap, one that cannot is plain`, s.views === "Overview|Settings ●" && s.secs.join("|") === "Portfolio|Targets|Ladder|Limits|Assumptions|Statement|Delete" && s.fixed.every((f) => f.controls === 0 && f.says === "fixed") && s.ladder === 0 && s.ladderAux === "fixed"
      && /re-set only from 1 Dec, 13:00 SGT, to a January reset/.test(s.targets) && /next window: from 1 Dec 2026, 13:00 SGT, to the first NAV of 2027/.test(s.targets) && !/\b1 Dec(?!(?: \d{4})?, 13:00 SGT)/.test(s.targets) && !s.reset && s.tap && s.noTap === "DIV" && s.sideways <= 0, s);
    await p.locator('[data-sec="limits"] button.pfp-set[data-row="one_long"]').tap(); await p.waitForSelector("#pf-change-sheet"); await p.waitForTimeout(350);
    const f0 = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect(), v = document.querySelector("#pf-change-value"), r = document.querySelector("#pf-change-reason"); return { title: document.querySelector("#pf-change-sheet .sheet-head .t").textContent, now: document.querySelector("#pf-change .ln").innerText.replace(/\s+/g, " ").trim(), when: document.querySelector("#pf-change-when").textContent, value: `${getComputedStyle(v).fontSize} ${Math.round(R(v).height)}`, reason: `${getComputedStyle(r).fontSize} ${Math.round(R(r).height)}`, buttons: [...document.querySelectorAll("#pf-change .pf-btns button")].map((x) => `${x.textContent} ${Math.round(R(x).height)}`), save: document.querySelector("#pf-change-save").disabled, sideways: document.querySelector("#pf-change-sheet .sheet-body").scrollWidth - document.querySelector("#pf-change-sheet .sheet-body").clientWidth }; });
    const chTaps = await smallTaps(p);
    await p.fill("#pf-change-value", "8"); await p.locator("#pf-change-reason").focus(); await p.locator("#pf-change-reason").blur(); await p.waitForTimeout(80);
    const noReason = await p.evaluate(() => ({ no: document.querySelector("#pf-change-reason-no")?.textContent ?? null, save: document.querySelector("#pf-change-save").disabled }));
    await p.fill("#pf-change-reason", "tighter into results season"); await p.locator("#pf-change-save").tap(); await p.waitForSelector('[data-sec="limits"] [data-pending="one_long"]'); await p.waitForTimeout(350);
    const saved = await p.evaluate(() => ({ row: document.querySelector('[data-sec="limits"] [data-row="one_long"]').innerText.replace(/\s+/g, " ").trim(), sheet: !!document.querySelector(".sheet") }));
    ck(`CHANGE is the sheet "${f0.title}": "${f0.now}", "${f0.when}"; its inputs are 16 px (${f0.value}; ${f0.reason}) and its buttons 52 px (${f0.buttons.join(", ")}), every tap target 44 px or more; with no reason "${noReason.no}" and it cannot be saved`, f0.title === "Change · One name, long" && f0.now === "In force now 10% of capital · PM A · since Thu 1 Oct 2026" && f0.when === "In force from Mon 23 Nov 2026, 06:00 SGT" && /^16px (4[89]|[5-9]\d)$/.test(f0.value) && /^16px/.test(f0.reason) && f0.buttons.join("|") === "Cancel 52|Save change 52" && f0.save && f0.sideways <= 0 && chTaps.length === 0
      && noReason.no === "give a reason of at least 10 characters: it is kept in the history" && noReason.save, { f0, chTaps, noReason });
    await p.locator('[data-sec="limits"] [data-tab="history"]').tap(); await p.waitForSelector('[data-sec="limits"] .pfp-hist');
    const h = await p.evaluate(() => [...document.querySelectorAll('[data-sec="limits"] .pfp-hist .h')].slice(0, 3).map((x) => [...x.querySelectorAll("span")].map((y) => y.textContent)));
    await p.locator('[data-sec="limits"] [data-tab="current"]').tap(); await p.waitForTimeout(100);
    ck(`saved with "tighter into results season": the row reads "${saved.row}"; HISTORY's rows are three lines: ${h[0]?.join(" / ")}`, saved.row === "One name, long 3–25% · PM A · since Thu 1 Oct 2026 10% of capital 8% from Mon 23 Nov 2026, 06:00 SGT · pending ›" && !saved.sheet && h[0][0] === "One name, long · 10% → 8%" && /^in force from Mon 23 Nov 2026 · set 21 Nov 17:0\d SGT · pending$/.test(h[0][1]) && h[0][2] === "tighter into results season" && h[2][0] === "One name, short · 5% → 4%" && h[2][2].length === 140, { saved, h });
    // ---- notes ----
    await pf(p, ID(1), "#pf-overview");
    const n = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect(), box = document.querySelector("#pf-note-box"), save = document.querySelector("#pf-note-save"); return { font: getComputedStyle(box).fontSize, save: Math.round(R(save).height), gist: document.querySelector("#pf-note-gist").textContent, items: document.querySelectorAll("#pf-notes li").length, rm: Math.round(R(document.querySelector("#pf-notes .rm")).height), clip: !!document.querySelector("#pf-notes .tx.clip"), act: document.querySelector("#pf-activity .act").innerText.replace(/\s+/g, " ").trim() }; });
    await p.fill("#pf-note-box", "x".repeat(2121)); const over = await p.evaluate(() => ({ count: document.querySelector("#pf-note-count").textContent, save: document.querySelector("#pf-note-save").disabled }));
    await p.fill("#pf-note-box", "A note from the phone."); await p.locator("#pf-note-save").tap(); await p.waitForFunction(() => document.querySelectorAll("#pf-notes li").length === 5);
    await p.locator("#pf-notes li .rm").first().tap(); await p.locator('#pf-notes li [data-act="remove"]').tap(); await p.waitForFunction(() => document.querySelector("#pf-notes li")?.dataset.note === "removed");
    const gone = await p.evaluate(() => document.querySelector("#pf-notes li").textContent);
    ck(`notes: the box is ${n.font}, Save note ${n.save} px, REMOVE takes a tap of ${n.rm} px; under the box "${n.gist}"; 2,121 characters are refused ("${over.count}"); a note saved and removed leaves "${gone}"; ACTIVITY's first line was the change ("${n.act.slice(0, 44)}…")`, n.font === "16px" && n.save === 52 && n.rm >= 44 && n.gist === GIST && n.items === 4 && n.clip && over.count === "2,000 characters at most · 121 over" && over.save && /^note removed 21 Nov 17:0\d$/.test(gone) && /^17:0\d SETTING One name, long 10% → 8% · in force from Mon 23 Nov 2026, 06:00 SGT · "tighter into results season"$/.test(n.act), { n, over, gone });
    // ---- an address that names a section, then delete ----
    await pf(p, `${ID(1)}/settings/limits`, "#pf-settings"); await p.waitForTimeout(300);
    const gap = await p.evaluate(() => Math.round(document.querySelector('[data-sec="limits"]').getBoundingClientRect().top - document.querySelector(".pfp-views").getBoundingClientRect().bottom));
    await pf(p, `${ID(1)}/settings/delete`, "#pf-delete"); await p.waitForTimeout(250);
    const placed = gap >= 0 && gap <= 16 && await p.evaluate(() => { const r = document.querySelector('[data-sec="delete"]').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; });
    await p.locator("#pf-delete-open").tap(); await p.waitForSelector("#pf-delete-in");
    const d = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect(), i = document.querySelector("#pf-delete-in"); return { input: `${getComputedStyle(i).fontSize} ${Math.round(R(i).height)}`, buttons: [...document.querySelectorAll("#pf-delete .pf-btns button")].map((x) => `${x.textContent} ${Math.round(R(x).height)}`), ask: document.querySelector("#pf-delete .ask").textContent }; });
    const delTaps = await smallTaps(p);
    await p.fill("#pf-delete-in", "tokyo l/s"); const wrong = await p.evaluate(() => ({ line: document.querySelector("#pf-delete-wrong")?.textContent ?? null, go: document.querySelector("#pf-delete-go").disabled }));
    await p.fill("#pf-delete-in", "Tokyo L/S"); await p.locator("#pf-delete-go").tap(); await p.waitForSelector("#pf-list");
    const del = await p.evaluate(() => ({ hash: location.hash, flash: document.querySelector(".pf-flash")?.textContent ?? null, rows: document.querySelectorAll("#pf-list a").length }));
    await pf(p, ID(1), "#pf-nosuch"); const nosuch = await text(p, "#pf-nosuch");
    ck(`an address that names a section opens Settings there (Limits ${gap} px under the two views); DELETE's input is ${d.input} and its buttons ${d.buttons.join(", ")}; "tokyo l/s" for "Tokyo L/S" cannot delete ("${wrong.line}"); the exact name deletes: the list with "${del.flash}", and the book's address then says "${nosuch}"`, placed && /^16px (4[89]|[5-9]\d)$/.test(d.input) && d.buttons.join("|") === "Cancel 52|Delete 52" && d.ask === "Type the portfolio's name to delete it: Tokyo L/S" && delTaps.length === 0 && wrong.line === "that is not this portfolio's name" && wrong.go
      && del.hash === "#portfolio/all" && del.flash === "Paper portfolio deleted · Tokyo L/S" && del.rows === 2 && nosuch === `${NO_SUCH} ALL PORTFOLIOS ›` && errs.length === 0, { placed, d, delTaps, wrong, del, nosuch, errs });
    await ctx.close();
    // ---- the targets' window on a phone ----
    const dec = await open(b, "P2", { clock: DEC });
    await go(dec.p, `portfolio/${ID(1)}/settings/targets`, "#pf-reset");
    const w0 = await dec.p.evaluate(() => ({ button: document.querySelector("#pf-reset").textContent, h: Math.round(document.querySelector("#pf-reset").getBoundingClientRect().height) }));
    await dec.p.locator("#pf-reset").tap(); await dec.p.waitForSelector("#pf-resetform");
    const inputs = await dec.p.evaluate(() => [...document.querySelectorAll("#pf-resetform input")].map((i) => `${getComputedStyle(i).fontSize} ${Math.round(i.getBoundingClientRect().height)}`));
    await dec.p.fill("#pf-reset-x", "6.0"); await dec.p.fill("#pf-reset-vol", "5.5"); await dec.p.locator("#pf-reset-save").tap(); await dec.p.waitForSelector("#pf-pending-targets");
    const pend = await text(dec.p, "#pf-pending-targets");
    await pf(dec.p, `${ID(2)}/settings/targets`, "#pf-targets"); const fixed = await dec.p.evaluate(() => ({ states: [...document.querySelectorAll('#pf-targets [data-row="target_x"] .pf-fixed, #pf-targets [data-row="target_vol"] .pf-fixed')].map((e) => e.textContent).join(), reset: !!document.querySelector("#pf-reset") }));
    ck(`on 15 Dec the window is open: "${w0.button}" (${w0.h} px), fields of 16 px, and a saved pair reads "${pend}"; a book on "since the start" still reads "fixed" and offers nothing`, w0.button === "Re-set for 2027" && w0.h === 52 && inputs.length === 2 && inputs.every((x) => /^16px (4[89]|[5-9]\d)$/.test(x)) && pend === "pending for 2027: cash + 6.0% · 5.5%" && fixed.states === "fixed,fixed" && !fixed.reset && dec.errs.length === 0, { w0, inputs, pend, fixed, errs: dec.errs });
    await dec.ctx.close();
    const two = await open(b, "P2", { ls: { om_mock_pf_account: "2" } });
    await go(two.p, "portfolio", "#pf-cards"); const seen = await two.p.evaluate(() => ({ rows: document.querySelectorAll("#pf-cards a").length, stored: JSON.parse(localStorage.getItem("om_mock_pf")).books.length }));
    await pf(two.p, ID(1), "#pf-nosuch");
    ck(`a second stand-in account sees none of the first one's ${seen.stored} books: the starts, and "${NO_SUCH}" at a book's address`, seen.rows === 3 && seen.stored === 3 && (await text(two.p, "#pf-nosuch")) === `${NO_SUCH} ALL PORTFOLIOS ›`, seen);
    await two.ctx.close();
  }

  console.log("\n[6] every screen of P-1 on two phones: each tap target 44 x 44 px or more, and nothing sideways (also with a wide font forced)");
  for (const [code, wide] of [["P1", false], ["P2", false], ["P1", true]]) {
    const { ctx, p, errs } = await open(b, code);
    const bad = [], look = async (name) => { if (wide) { await p.addStyleTag({ content: WIDE }); await settle(p, 200); } const taps = wide ? [] : await smallTaps(p), sw = await sideways(p); if (taps.length || sw > 0) bad.push({ name, taps: taps.slice(0, 6), sideways: sw }); };
    await go(p, "portfolio", "#pf-cards", "?mock=empty"); await look("no book");
    await go(p, "portfolio/all", "#pf-list"); await look("the list");
    for (const s of ["ar-ls-jp", "ar-ls-gl", "ar-macro"]) { await pf(p, `new/${s}`, "#pf-review"); await look(`the form, ${s}`); await pf(p, `new/${s}/review`, "#pf-create"); await look(`Review, ${s}`); await pf(p, `new/${s}/edit/limits`, ".pfp-fields"); await look(`Limits, ${s}`); await pf(p, `new/${s}/edit/costs`, ".pfp-fields"); await look(`Costs, ${s}`); }
    for (const n of [1, 2, 3]) { await pf(p, ID(n), "#pf-overview"); await look(`Overview of book ${n}`); await pf(p, `${ID(n)}/settings`, "#pf-settings"); await look(`Settings of book ${n}`); }
    await p.locator('[data-sec="assumptions"] [data-tab="history"]').tap(); await p.waitForSelector('[data-sec="assumptions"] .pfp-hist'); await look("HISTORY of the assumptions");
    await p.locator("#pf-rename").tap(); await p.waitForSelector("#pf-rename-in"); await look("renaming");
    // the change form, open in its sheet: inputs of 16 px, buttons of 52 px, nothing sideways inside it
    await pf(p, `${ID(3)}/settings/limits`, "#pf-settings"); await p.locator('[data-sec="limits"] button.pfp-set[data-row="adj_gross"]').tap(); await p.waitForSelector("#pf-change-sheet"); await p.waitForTimeout(350);
    if (wide) { await p.addStyleTag({ content: WIDE }); await settle(p, 200); }
    const sheet = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect(), body = document.querySelector("#pf-change-sheet .sheet-body"), v = document.querySelector("#pf-change-value"), r = document.querySelector("#pf-change-reason"), sh = document.querySelector("#pf-change-sheet");
      return { value: `${getComputedStyle(v).fontSize} ${Math.round(R(v).height)}`, reason: getComputedStyle(r).fontSize, buttons: [...document.querySelectorAll("#pf-change .pf-btns button")].map((x) => Math.round(R(x).height)).join(), sideways: body.scrollWidth - body.clientWidth, tall: Math.round(R(sh).height), vh: innerHeight, when: document.querySelector("#pf-change-when").textContent }; });
    const sheetTaps = wide ? [] : await smallTaps(p);
    if (!/^16px (4[89]|[5-9]\d)$/.test(sheet.value) || sheet.reason !== "16px" || sheet.buttons !== "52,52" || sheet.sideways > 0 || sheet.tall > sheet.vh * 0.8 + 1 || sheetTaps.length || sheet.when !== "In force from Mon 23 Nov 2026, 06:00 SGT") bad.push({ name: "the change form", sheet, taps: sheetTaps });
    const screens = 2 + 12 + 6 + 3;
    ck(`${PHONES[code]}${wide ? ", a wide font forced" : ""}: ${screens} screens (no book, the list, three forms with Review and two sections each, three books' Overview and Settings, HISTORY, renaming, the change form in its sheet with inputs of 16 px and buttons of 52 px): ${wide ? "nothing scrolls sideways" : "every tap target is 44 x 44 px or more, measured on what takes the tap, and nothing scrolls sideways"}`, bad.length === 0 && errs.length === 0, { bad, errs });
    await ctx.close();
  }

  console.log('\n[7] "personal use" on a phone\'s source lines, and the classic phone layout');
  {
    const { ctx, p, errs } = await open(b, "P2");
    await go(p, "equities/topix", ".psrc"); const tp = await p.evaluate(() => [...document.querySelectorAll(".psrc")].map((e) => e.textContent));
    const reach = await p.evaluate(() => { const el = document.querySelector(".psrc"); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(), x = r.left + r.width / 2; let n = 0; for (let y = Math.floor(r.top) - 20; y <= Math.ceil(r.bottom) + 20; y++) { const hit = document.elementFromPoint(x, y); if (hit && (hit === el || el.contains(hit))) n++; } return { h: n, w: Math.round(r.width) }; });
    await p.locator(".psrc").first().tap(); await p.waitForSelector(".sheet"); const card = await p.evaluate(() => ({ title: document.querySelector(".sheet-head .t").textContent, lines: [...document.querySelectorAll(".sheet .psrc-p")].map((x) => x.textContent) })); await p.locator(".sheet-head .x").tap(); await p.waitForTimeout(300);
    await go(p, "equities/nk225", ".psrc"); await p.waitForFunction(() => [...document.querySelectorAll(".psrc")].some((e) => /Nikkei/.test(e.textContent)), null, { timeout: 15000 }); const nk = await p.evaluate(() => [...document.querySelectorAll(".psrc")].map((e) => e.textContent));
    await go(p, "asset/7203.T", ".psrc"); await p.waitForFunction(() => [...document.querySelectorAll(".psrc")].some((e) => /JPX reports/.test(e.textContent)), null, { timeout: 15000 }); const st = await p.evaluate(() => [...document.querySelectorAll(".psrc")].map((e) => e.textContent));
    await go(p, "equities/spx", ".mp-sec"); await p.waitForFunction(() => /^FINRA/.test([...document.querySelectorAll(".mp-sec")].find((x) => x.querySelector("h2 span")?.textContent === "Short interest")?.querySelector("h2 .aux")?.textContent ?? ""), null, { timeout: 15000 }); const us = await p.locator(".psrc").count();
    ck(`EQUITIES on a phone: TOPIX's lines "${tp.join('" and "')}", the Nikkei 225's "${nk[1]}"; a Tokyo stock's "${st[0]}"; a US list has none. The line takes a tap ${reach.h} px tall and opens a card with the publisher, its files and the owner's paragraph word for word`, tp.join("|") === "JPX · personal use|members: JPX · personal use" && nk.join("|") === "JPX · personal use|members: Nikkei · personal use" && st.join("|") === "JPX reports · personal use" && us === 0 && reach.h >= 44 && reach.w >= 44 && card.title === "Source" && /^JPX: the short-selling ratio \(空売り集計\)/.test(card.lines[0]) && card.lines[1] === PERSONAL && errs.length === 0, { tp, nk, st, us, reach, card, errs });
    await ctx.close();
    const cl = await open(b, "P2", { ls: { om_phone_v2: "0" } });
    await go(cl.p, "portfolio", "#pf-classic");
    const c = await cl.p.evaluate(() => ({ line: document.querySelector("#pf-classic").innerText.replace(/\s+/g, " ").trim(), tabs: [...document.querySelectorAll("#nav a")].map((a) => a.textContent).join(), pv2: document.body.classList.contains("pv2") }));
    await cl.p.locator("#pf-classic .pf-link").tap(); await cl.p.waitForSelector("#pf-list");
    const after = await cl.p.evaluate(() => ({ pv2: document.body.classList.contains("pv2"), stored: localStorage.getItem("om_phone_v2"), bar: document.querySelectorAll("#pnav a").length }));
    ck(`the classic phone layout shows the computer's tabs, PORTFOLIO among them, and its page is one line: "${c.line}"; the link does what NEW LAYOUT does`, c.line === "Paper portfolios are made for the phone layout · NEW LAYOUT ›" && /PORTFOLIO$/.test(c.tabs) && !c.pv2 && after.pv2 && after.stored === "1" && after.bar === 7 && cl.errs.length === 0, { c, after, errs: cl.errs });
    await cl.ctx.close();
  }

  await b.close();
  console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
