// The paper portfolio on a computer (P-1, 21 Nov 2026; the checks of the designer's build note D/p1-design.md §1.4,
// §2.1, §3, §4.10, §5.5 and §10, and the plan's P-1). On the local copy (5179), whose stand-in store keeps its books
// in this browser (lib/mockPf.ts), and on the stand-in server (5181) for the page's own calls to the API.
// Nothing here reads the machine's clock: every page sets `om_mock_now` (17:00 SGT on Sat 21 Nov 2026 for the forms
// and the books, so the next session is Mon 23 Nov 2026; 15 Dec 2026 for the targets' window; 07:10 SGT on Tue 24 Nov
// for the header), and what must have room is measured in the machine's fonts and with a wide font forced.
//   [1] the entry: the seventh tab, the header's height with seven tabs and with six at six sizes (in both fonts), key 7,
//       Help; with the page's switch off (om_paper = "0") nothing of it. The one-screen header with seven tabs and with
//       six, and key 7 in FULL, are e2e/header.cjs (the designer's rule of 22 Nov 2026)
//   [2] with no book: the three starts as cards, two muted lines, nothing drawn as a disabled button
//   [3] the list, the cap, and what `#portfolio` opens
//   [4] the statement once, and the three starts created with their defaults
//   [5] the form: the targets, the refusals, the ladder, what it can trade, its width, a draft, the errors
//   [6] a book: Overview, fixed fields, a change with its reason and history, the targets' window, notes, renaming,
//       delete after typing the name, a second account
//   [7] "personal use" at the end of every source line that names a JPX or Nikkei file (live with this round)
//   [8] the page's own calls, answered by the suite: a server with the switch off, a refusal, the statement first
// Run from web/:  node e2e/run.cjs portfolio   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const { routes } = require("./harness.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 1800)}`); };
const NOW = "2026-11-21T09:00:00Z", DEC = "2026-12-15T02:00:00Z", MORNING = "2026-11-23T23:10:00Z";
// a wider drawing: every letter's spacing wider by 2% of its size, on top of what the page sets (room.cjs's widen, the
// suites' standard): the Monitor's monospaced figures 3.3% wider, about three times what GitHub's machines add (PC-4
// of the second review of P-1: a forced generic monospace, the check's wide font until 22 Nov 2026, drew the header
// within 0.4% of its own width). At 4% (6.7% in the figures) the seventh tab does take a third row at 1280x720 in
// the scrolling layout (measured 22 Nov 2026: 119 px against 80.8 with six tabs): C/backlog.md, for the designer.
const widenAll = (p, pct) => p.evaluate((x) => { const all = [...document.body.querySelectorAll("*")].filter((e) => e.style), was = all.map((e) => { const cs = getComputedStyle(e); return [parseFloat(cs.letterSpacing) || 0, parseFloat(cs.fontSize) || 0]; }); all.forEach((e, i) => e.style.setProperty("letter-spacing", `${was[i][0] + (was[i][1] * x) / 100}px`, "important")); }, pct);
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LONG_NAME = "Global long/short on a yen base, every region through an ETF";
const SIZES = { C1: [1440, 900, "AUTO"], C2: [1280, 720, "AUTO"], C3: [1440, 900, "XL"], C6: [1920, 1080, "AUTO"], C8: [1440, 900, "S"], CL: [1440, 900, "L"] };
// the words the page must show are the engine's own: read from its files, never typed again here
const engine = (f) => fs.readFileSync(path.join(__dirname, "..", "..", "supabase", "functions", "_shared", "pf", f), "utf8");
const constant = (f, name) => { const m = new RegExp(`export const ${name} = "((?:[^"\\\\]|\\\\.)*)";`).exec(engine(f)); if (!m) throw new Error(`${name} not found in ${f}`); return JSON.parse(`"${m[1]}"`); };
const STATEMENT = constant("statement.ts", "STATEMENT_TEXT"), GIST = constant("statement.ts", "NOTE_GIST"), NOT_YET = constant("words.ts", "NOT_YET"), NO_SUCH = constant("words.ts", "NO_SUCH"), NOT_BUILT = constant("presets.ts", "NOT_BUILT_YET");
const PERSONAL = /export const PERSONAL_USE_TEXT = "([^"]*)";/.exec(fs.readFileSync(path.join(__dirname, "..", "src", "lib", "labels.ts"), "utf8"))[1];
const INTRO = "Run a paper portfolio from today. Orders fill only on the market's own prints after they are placed, with spreads, fees and a 20% cap on volume. No real orders, no broker, no money. Only your account sees it.";
const CAP = "You have 5 open paper portfolios, the most an account may hold. Delete one to start another.";

async function open(b, { size = "C1", clock = NOW, ls = {}, compact = false, vw, vh } = {}) {
  const [w, h, text] = SIZES[size];
  const ctx = await b.newContext({ viewport: { width: vw || w, height: vh || h }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([at, prefs, more]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_prefs", JSON.stringify(prefs)); for (const [k, v] of Object.entries(more)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v); } catch {} }, [clock, { size: text, compact, v: 2 }, ls]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  return { ctx, p, errs };
}
const settle = async (p, ms = 250) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(ms); };
const go = async (p, hash, sel, q = "", base = MOCK) => { await p.goto(base + q + "#" + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p); };
// another address of the same page: the stand-in store kept in memory (?mock=empty, ?mock=cap) lives as long as the page
// The address is set and the page has taken it (the hashchange has been handled and two frames drawn) before the
// selector is waited for: a selector the page left also has (another book's Overview) must not be read from that page.
const hop = async (p, hash, sel) => {
  await p.evaluate((h) => new Promise((res) => { const drawn = () => requestAnimationFrame(() => requestAnimationFrame(() => res())); if (location.hash === `#${h}`) drawn(); else { addEventListener("hashchange", drawn, { once: true }); location.hash = h; } }), hash);
  if (sel) await p.waitForSelector(sel, { timeout: 15000 });
  await settle(p);
};
const pf = (p, sub, sel) => hop(p, `portfolio/${sub}`, sel);   // an address of the tab: "new/ar-macro", "<id>", "<id>/settings/limits"
const text = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, " ").trim() : null; }, sel);
const set = async (p, key, value) => { const sel = `[data-row="${key}"] input[data-key="${key}"]`; await p.fill(sel, value); await p.locator(sel).blur(); await p.waitForTimeout(60); };
const refusalOf = (p, key) => p.evaluate((k) => document.querySelector(`[data-row="${k}"] .pf-no`)?.textContent ?? null, key);
// what is cut on screen: a box narrower than its words, or the page wider than the window
const cuts = (p, sel) => p.evaluate((s) => { const out = []; for (const e of document.querySelectorAll(s)) { if (!e.getClientRects().length) continue; if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible") out.push(`${(e.textContent || "").trim().slice(0, 40)} ${e.clientWidth}/${e.scrollWidth}`); else { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1) out.push(`past the window: ${(e.textContent || "").trim().slice(0, 40)}`); } } return { cut: out.slice(0, 6), sideways: document.documentElement.scrollWidth - innerWidth }; }, sel);
const header = (p) => p.evaluate(() => { const z = Number(document.body.style.zoom) || 1, R = (e) => e.getBoundingClientRect(), px = (x) => Math.round((x / z) * 10) / 10, nm = document.querySelector("#alerts .alrt .nm"), al = document.querySelector("#alerts .alrt");
  return { h: px(R(document.querySelector("#topbar")).height), tabs: [...document.querySelectorAll("#nav a")].map((a) => a.textContent), lit: document.querySelector("#nav a.on")?.textContent ?? null, name: nm ? px(R(nm).width) : null, alert: al ? px(R(al).width) : null, search: px(R(document.querySelector("#search input")).width), sideways: document.documentElement.scrollWidth - innerWidth }; });

(async () => {
  const b = await chromium.launch();

  console.log("\n[1] the entry: a seventh tab, the header as tall as with six, key 7, and nothing of it with the page's switch off");
  {
    for (const size of Object.keys(SIZES)) {
      const seven = await open(b, { size, clock: MORNING }), six = await open(b, { size, clock: MORNING, ls: { om_paper: "0" } });
      await go(seven.p, "market", "table.mkt"); await go(six.p, "market", "table.mkt");
      await seven.p.waitForSelector("#alerts .alrt .nm"); await six.p.waitForSelector("#alerts .alrt .nm");
      const a = await header(seven.p), c = await header(six.p);
      // the same two pages drawn wider: the seventh tab must add no row there either (measured on 21 Nov 2026: the type
      // has to be more than a tenth wider than this before it does at 1280x720, a fifth at 1440 and up)
      await widenAll(seven.p, 2); await widenAll(six.p, 2); await settle(seven.p, 400); await settle(six.p, 400);
      const aw = await header(seven.p), cw = await header(six.p);
      ck(`${size} (${SIZES[size][0]}x${SIZES[size][1]}, text ${SIZES[size][2]}): seven tabs, PORTFOLIO after WATCHLIST; the header is ${a.h} px tall with seven and ${c.h} with six (${aw.h} and ${cw.h} with every letter 2% of its size wider); the alert's name is ${a.name} px wide with seven and ${c.name} with six (${aw.name} and ${cw.name})`, a.tabs.join() === "MARKETS,NEWS,RESEARCH,EQUITIES,RATES & FX,WATCHLIST,PORTFOLIO" && c.tabs.length === 6 && Math.abs(a.h - c.h) <= 1 && a.name != null && Math.abs(a.name - c.name) <= 1 && a.sideways <= 0
        && Math.abs(aw.h - cw.h) <= 1 && aw.name != null && Math.abs(aw.name - cw.name) <= 1 && aw.sideways <= 0 && seven.errs.length === 0, { a, c, aw, cw, errs: seven.errs });
      await seven.ctx.close(); await six.ctx.close();
    }
    // The one-screen header with seven tabs and with six, one row by rule, and FULL from its menu with key 7, are
    // e2e/header.cjs (the designer's notes of 22 Nov 2026, Part A, its check A.7): it replaced this suite's loop of 21 Nov,
    // whose two checks failed in GitHub's letter placement and whose FULL step pressed FULL in the row.
    const { ctx, p, errs } = await open(b, { clock: MORNING });
    await go(p, "market", "table.mkt");
    await p.keyboard.press("7"); await p.waitForSelector("#pf-list");
    const lit = await header(p), fullTip = await p.evaluate(() => document.querySelector("#fs-ctl")?.title ?? "");
    await p.keyboard.press("1"); await p.waitForSelector("table.mkt");
    await p.click("#help-ctl"); await p.waitForSelector(".helpbox");
    const help = await p.evaluate(() => ({ keys: [...document.querySelectorAll(".helpsec dt")].find((d) => d.textContent === "Keys")?.nextElementSibling?.textContent ?? "", sections: [...document.querySelectorAll(".helpsec h4")].map((h) => h.textContent), rows: [...document.querySelectorAll(".helpsec")].find((s) => s.querySelector("h4")?.textContent === "Portfolio")?.querySelectorAll("dt").length ?? 0 }));
    ck(`key 7 opens #portfolio and lights PORTFOLIO; key 1 goes back; FULL's tooltip and Help's "Keys" say 1 to 7, and Help has its Portfolio part (${help.rows} rows)`, lit.lit === "PORTFOLIO" && /keys 1 to 7 switch tabs/.test(fullTip) && /^1 to 7 switch tabs/.test(help.keys) && help.sections.includes("Portfolio") && help.rows >= 5 && errs.length === 0, { lit: lit.lit, fullTip, help, errs });
    await ctx.close();
    const off = await open(b, { clock: MORNING, ls: { om_paper: "0" } });
    await go(off.p, "portfolio/new", "table.mkt");
    await off.p.keyboard.press("7"); await off.p.waitForTimeout(300);
    await off.p.click("#help-ctl"); await off.p.waitForSelector(".helpbox");
    const o = await off.p.evaluate(() => { const all = [document.body.innerText, ...[...document.querySelectorAll("*")].flatMap((e) => [e.getAttribute("title") ?? "", e.getAttribute("aria-label") ?? "", e.getAttribute("placeholder") ?? ""])].join("\n").replace(/MOCK PREVIEW[^\n]*/g, "");
      return { view: document.querySelector("#grid").dataset.view, hash: location.hash, tabs: document.querySelectorAll("#nav a").length, word: /portfolio/i.exec(all)?.[0] ?? null, keys: [...document.querySelectorAll(".helpsec dt")].find((d) => d.textContent === "Keys")?.nextElementSibling?.textContent ?? "", t7: document.querySelector("#topbar").classList.contains("t7") }; });
    ck(`with the page's switch off (as the published page is): six tabs, #portfolio/new shows MARKETS, key 7 does nothing, Help says "1 to 6", and no "PORTFOLIO" or "Portfolio" stands anywhere on the page, in a tooltip or in a label`, o.view === "market" && o.tabs === 6 && o.word === null && /^1 to 6 switch tabs/.test(o.keys) && !o.t7 && off.errs.length === 0, { o, errs: off.errs });
    await off.ctx.close();
  }

  console.log("\n[2] with no book: three starts as cards, two muted lines that take no tap, nothing drawn as a disabled button");
  for (const size of ["C1", "C3"]) {
    const { ctx, p, errs } = await open(b, { size });
    await go(p, "portfolio", "#pf-cards", "?mock=empty");
    const s = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect(), panel = document.querySelector('.panel[data-k="pf-none"]'), cards = [...document.querySelectorAll("#pf-cards a.pf-card")], lines = [...document.querySelectorAll("#pf-notyet p")], intro = document.querySelector("#pf-intro");
      return { cards: cards.map((c) => ({ href: c.getAttribute("href"), title: c.querySelector(".t").textContent, color: getComputedStyle(c.querySelector(".t")).color, lines: [...c.querySelectorAll(".l")].map((l) => l.textContent), by: c.querySelector(".by").textContent, top: Math.round(R(c).top), left: Math.round(R(c).left), bottom: Math.round(R(c).bottom) })),
        intro: intro.textContent, introCut: intro.scrollWidth > intro.clientWidth + 1 || R(intro).right > innerWidth, lines: lines.map((l) => l.textContent), taps: document.querySelectorAll("#pf-notyet a, #pf-notyet button, #pf-notyet input, #pf-notyet [tabindex], #pf-notyet [role]").length, pointer: lines.some((l) => getComputedStyle(l).cursor === "pointer"), border: lines.some((l) => parseFloat(getComputedStyle(l).borderTopWidth) > 0),
        disabled: panel.querySelectorAll("[disabled], [aria-disabled]").length, faded: [...panel.querySelectorAll("button, a")].filter((e) => Number(getComputedStyle(e).opacity) < 1).length, aux: panel.querySelector(".phead .aux").innerText.replace(/\s+/g, " ").trim(), sideways: document.documentElement.scrollWidth - innerWidth }; });
    const stacked = s.cards[1].top >= s.cards[0].bottom && s.cards[2].top >= s.cards[1].bottom, abreast = s.cards[0].top === s.cards[1].top && s.cards[1].top === s.cards[2].top && s.cards[0].left < s.cards[1].left;
    ck(`${size}: three cards, each opening its own address (${s.cards.map((c) => c.href).join(" · ")}), ${size === "C3" ? "one under the other" : "three to a row"}; their titles are teal; "PM A's advice" twice and "PM B's advice" once; the panel says "${s.aux}"`, s.cards.length === 3 && s.cards.map((c) => c.href).join() === "#portfolio/new/ar-ls-jp,#portfolio/new/ar-ls-gl,#portfolio/new/ar-macro" && s.cards.map((c) => c.title).join("|") === "Equity long/short · Japan|Equity long/short · Global|Global macro"
      && s.cards.every((c) => c.color === "rgb(31, 209, 193)" && c.lines.length === 3) && s.cards.map((c) => c.by).join() === "PM A's advice,PM A's advice,PM B's advice" && (size === "C3" ? stacked : abreast) && s.aux === "PAPER · only you" && s.sideways <= 0 && errs.length === 0, s);
    ck(`${size}: the sentence about prints and the 20% cap is whole; the two muted lines are the designer's words, are text (no tap, no focus, no border, no pointer), and nothing on the screen is drawn as a disabled button`, s.intro === INTRO && !s.introCut && s.lines.join("|") === "Equity long-only (against its MSCI index): offered once its benchmark limits are built.|Fixed-income long-only (against the Global Aggregate): offered once its benchmark's profile is read."
      && s.taps === 0 && !s.pointer && !s.border && s.disabled === 0 && s.faded === 0, s);
    if (size === "C1") { await p.click('#pf-cards a[data-start="ar-ls-gl"]'); await p.waitForSelector("#pf-create"); const on = await p.evaluate(() => ({ hash: location.hash, start: document.querySelector("#pf-starts .pf-chip.on")?.textContent, name: document.querySelector("#pf-name").value })); ck(`a card opens the form with its start chosen (${on.hash}; the name to start "${on.name}")`, on.hash === "#portfolio/new/ar-ls-gl" && on.start === "Equity long/short · Global" && on.name === "Equity L/S · Global · 21 Nov 2026", on); }
    await ctx.close();
  }

  console.log("\n[3] the list, the cap, and what #portfolio opens");
  {
    const { ctx, p, errs } = await open(b);
    await go(p, "portfolio", "#pf-list");
    const l = await p.evaluate(() => { const t = document.querySelector("#pf-list"), nameCell = t.querySelectorAll("tbody tr")[1].querySelector("td.nm");
      return { head: [...t.querySelectorAll("th")].map((h) => h.textContent), rows: [...t.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent).join("|")), links: [...t.querySelectorAll("td.nm a")].map((a) => a.getAttribute("href")), nameCut: nameCell.scrollWidth > nameCell.clientWidth + 1, after: document.querySelector('.panel[data-k="pf-list"] .pf-after').textContent,
        filled: [...document.querySelectorAll(".pf-go")].map((e) => `${e.textContent}>${e.getAttribute("href")}`), color: getComputedStyle(document.querySelector("#pf-new")).backgroundColor, hash: location.hash }; });
    ck(`#portfolio with no book remembered on this device is the list: ${l.head.join(" · ")}; three rows, each name a link to its book by its id; no NAV, DAY, SINCE START, AGAINST or STATE column`, l.hash === "#portfolio" && l.head.join("|") === "Name|Start|Base|Starting NAV|Targets|Ladder base|Created" && l.rows.join("\n") === [`Tokyo L/S|Equity L/S · Japan|USD|100,000,000|cash + 5.0% · 5.0%|yearly reset, not after a losing year|1 Oct 2026`, `${LONG_NAME}|Equity L/S · Global|JPY|10,000,000,000|cash + 3.0% · 6.0%|since the start|12 Oct 2026`, `Macro|Global macro|USD|100,000,000|cash + 5.0% · 5.0%|yearly reset|2 Nov 2026`].join("\n")
      && l.links.join() === [1, 2, 3].map((n) => `#portfolio/${ID(n)}`).join() && errs.length === 0, l);
    ck(`the 60-character name is whole; the head says "${l.after}"; + NEW PAPER PORTFOLIO is the screen's one filled button (teal) and opens #portfolio/new`, !l.nameCut && l.after === "· 3 open · only you" && l.filled.join() === "+ NEW PAPER PORTFOLIO>#portfolio/new" && l.color === "rgb(31, 209, 193)", l);
    await p.click("#pf-list td.nm a"); await p.waitForSelector("#pf-overview");
    const strip = await text(p, "#pf-strip");
    await hop(p, "market", "table.mkt"); await hop(p, "portfolio", "#pf-overview");
    const again = await p.evaluate(() => ({ hash: location.hash, book: document.querySelector(".pf-bookpage")?.dataset.book }));
    ck(`a book's strip reads "${strip}"; opened once, #portfolio opens that book again (it is remembered on this device by its id)`, strip === "Tokyo L/S ▾ Equity L/S · Japan · AR · USD · PAPER · only you · created 1 Oct 2026 OVERVIEW SETTINGS" && again.hash === "#portfolio" && again.book === ID(1), { strip, again });
    await p.click("#pf-switch"); await p.waitForSelector("#pf-menu");
    const menu = await p.evaluate(() => [...document.querySelectorAll("#pf-menu a")].map((a) => `${a.innerText.replace(/\s+/g, " ").trim()}>${a.getAttribute("href")}`));
    await p.keyboard.press("Escape"); await p.waitForTimeout(100);
    ck(`the switcher lists the account's books (name · start), then "+ New paper portfolio" and "All portfolios ›"; Esc closes it`, menu.length === 5 && menu[0] === `Tokyo L/S Equity L/S · Japan>#portfolio/${ID(1)}` && menu[3] === "+ New paper portfolio>#portfolio/new" && menu[4] === "All portfolios ›>#portfolio/all" && (await p.locator("#pf-menu").count()) === 0, menu);
    await ctx.close();
    const xl = await open(b, { size: "C3" });
    await go(xl.p, "portfolio/all", "#pf-list");
    const x = await xl.p.evaluate(() => ({ shown: [...document.querySelectorAll("#pf-list th")].filter((h) => h.getClientRects().length > 0).map((h) => h.textContent), sideways: document.documentElement.scrollWidth - innerWidth }));
    ck(`at text XL the list drops LADDER BASE first (${x.shown.join(" · ")}); nothing scrolls sideways`, x.shown.join("|") === "Name|Start|Base|Starting NAV|Targets|Created" && x.sideways <= 0, x);
    await xl.ctx.close();
    const cap = await open(b);
    await go(cap.p, "portfolio/all", "#pf-list", "?mock=cap");
    const c1 = await cap.p.evaluate(() => ({ rows: document.querySelectorAll("#pf-list tbody tr").length, line: document.querySelector("#pf-cap")?.textContent ?? null, button: !!document.querySelector("#pf-new"), after: document.querySelector(".pf-after").textContent }));
    await hop(cap.p, "portfolio/new", "#pf-cap");
    const c2 = await cap.p.evaluate(() => ({ line: document.querySelector("#pf-cap").innerText.replace(/\s+/g, " ").trim(), form: !!document.querySelector(".pf-form, #pf-create, #pf-name"), link: document.querySelector("#pf-cap a")?.getAttribute("href") }));
    ck(`at the cap (five open books) the list's button gives way to the line "${c1.line}"; #portfolio/new draws no form and says the same with ALL PORTFOLIOS ›`, c1.rows === 5 && c1.line === CAP && !c1.button && c1.after === "· 5 open · only you" && c2.line === `${CAP} ALL PORTFOLIOS ›` && !c2.form && c2.link === "#portfolio/all" && cap.errs.length === 0, { c1, c2, errs: cap.errs });
    await cap.ctx.close();
  }

  console.log("\n[4] the statement once, and the three starts created with their defaults");
  {
    // an account with no book that has not agreed, kept in this browser's storage so that what is created can be read
    const { ctx, p, errs } = await open(b, { ls: { om_mock_pf: JSON.stringify({ seq: 0, consents: {}, books: [] }) } });
    await go(p, "portfolio/new/ar-ls-jp", "#pf-create");
    await p.click("#pf-costs-edit");
    const form = (pg) => pg.evaluate(() => ({ rows: document.querySelectorAll(".pf-row[data-row]").length, by: Object.fromEntries([...document.querySelectorAll(".pf-row[data-row]")].map((r) => [r.dataset.row, r.querySelector(".by").textContent])), typed: Object.fromEntries([...document.querySelectorAll(".pf-row[data-row] input[data-key]")].map((i) => [i.dataset.key, i.value])), sections: [...document.querySelectorAll(".pf-form .panel")].map((x) => `${x.dataset.no} ${x.querySelector(".phead .t").textContent}`), name: document.querySelector("#pf-name").value,
      count: document.querySelector("#pf-count").textContent, changed: document.querySelector("#pf-changedcount").textContent, create: document.querySelector("#pf-create").disabled, filled: document.querySelectorAll(".pf-go").length, ranges: [...document.querySelectorAll(".pf-row[data-row]")].filter((r) => !r.querySelector(".rg").textContent.trim() || !(r.querySelector(".wy").textContent.trim() || (r.dataset.row === "funding" && r.querySelector(".pf-fund .pf-line")?.textContent.trim()))).map((r) => r.dataset.row) }));   // the funding's why stands once, in its value (lead 5)
    const jp = await form(p), byOk = (f) => Object.values(f.by).every((t) => /^(PM A|PM B|PM A · PM B|PM B · PM A|Owner|C · R-\d+)$/.test(t));
    ck(`Equity long/short · Japan: seven numbered sections (${jp.sections.map((s) => s.slice(0, 2)).join(" ")}), ${jp.rows} rows, each with its range, its why and whose it is; the name to start is "${jp.name}"; CREATE is the page's one filled button`, jp.sections.join("|") === "01 KIND AND SIZE|02 TARGETS AND REFERENCE|03 WHAT IT CAN TRADE|04 LIMITS|05 LADDER|06 CASH FLOOR AND MARGIN|07 FINANCING, BORROW AND COSTS" && jp.rows === 56 && jp.ranges.length === 0 && byOk(jp) && jp.name === "Equity L/S · Japan · 21 Nov 2026" && jp.count === "0 settings out of range" && jp.changed === "0 settings changed from the defaults" && !jp.create && jp.filled === 1, jp);
    ck(`whose each default is, as its table says: the start and the ladder "Owner", the starting NAV and the targets "PM A · PM B", the band and the amber line "C · R-32", the stress multiplier "C · R-37", the limits "PM A"`, jp.by.start === "Owner" && jp.by.ladder_base === "Owner" && jp.by.cut1 === "Owner" && jp.by.nav === "PM A · PM B" && jp.by.target_x === "PM A · PM B" && jp.by.target_vol === "PM A · PM B" && jp.by.band === "C · R-32" && jp.by.amber === "C · R-32" && jp.by.stress_mult === "C · R-37" && jp.by.one_long === "PM A" && jp.by.gross === "PM A" && jp.by.reference === "Owner", jp.by);
    await p.click('[data-row="band"] .pf-by'); const card = await text(p, '[data-row="band"] .pf-bycard');
    ck(`a BY tag opens its card under it: "${card}"`, /^C · R-32 · settled by C between the PMs' two figures.*accepted by PM A and PM B, 21 Nov 2026$/.test(card ?? ""), card);
    // ---- the statement ----
    await p.click("#pf-create"); await p.waitForSelector("#pf-consent");
    const c = await p.evaluate(() => { const z = Number(document.body.style.zoom) || 1, box = document.querySelector("#pf-consent"), go2 = document.querySelector("#pf-continue");
      return { title: box.querySelector("h3").textContent, words: document.querySelector("#pf-statement").textContent, label: box.querySelector(".pf-agree").innerText.trim(), disabled: go2.disabled, tip: go2.title, focus: document.activeElement?.type ?? null, w: Math.round(box.getBoundingClientRect().width / z), font: parseFloat(getComputedStyle(document.querySelector("#pf-statement")).fontSize), extra: box.querySelectorAll("a, small").length, buttons: [...box.querySelectorAll("button")].map((x) => x.textContent) }; });
    ck(`the first CREATE asks for the statement: "${c.title}", version 1's words character for character (${c.words.length} characters), the box "I agree", in a card ${c.w} px wide with nothing added; CONTINUE cannot be pressed until the box is ticked ("${c.tip}"); the focus opens on the box`, c.title === "Before your first paper portfolio" && c.words === STATEMENT && c.label === "I agree" && c.disabled && c.tip === "Tick the box to continue" && c.focus === "checkbox" && c.w === 480 && c.font === 13 && c.extra === 0 && c.buttons.join() === "NOT NOW,CONTINUE", c);
    const inside = []; for (let i = 0; i < 5; i++) { await p.keyboard.press("Tab"); inside.push(await p.evaluate(() => document.querySelector("#pf-consent").contains(document.activeElement))); }
    await p.mouse.click(8, 300); await p.waitForTimeout(120);
    const still = await p.locator("#pf-consent").count();
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    const notNow = await p.evaluate(() => ({ card: !!document.querySelector("#pf-consent"), msg: document.querySelector("#pf-create-msg")?.textContent ?? null, name: document.querySelector("#pf-name").value, one: document.querySelector('input[data-key="one_long"]').value, books: JSON.parse(localStorage.getItem("om_mock_pf")).books.length, agreed: Object.keys(JSON.parse(localStorage.getItem("om_mock_pf")).consents).length }));
    ck(`Tab stays inside the card and a click outside it does nothing; Esc is NOT NOW: the card closes, the form keeps its values, "${notNow.msg}", and neither a portfolio nor an agreement is stored`, inside.every(Boolean) && still === 1 && !notNow.card && notNow.msg === "Not created: the statement was not agreed." && notNow.name === jp.name && notNow.one === "10" && notNow.books === 0 && notNow.agreed === 0, { inside, still, notNow });
    await p.click("#pf-create"); await p.waitForSelector("#pf-consent");
    await p.evaluate(() => localStorage.setItem("om_mock_pf_refuse", "1"));
    await p.check("#pf-consent input[type=checkbox]"); await p.click("#pf-continue"); await p.waitForSelector("#pf-consent .pf-no");
    const failed = await p.evaluate(() => ({ words: document.querySelector("#pf-consent .pf-no").textContent, card: !!document.querySelector("#pf-consent"), books: JSON.parse(localStorage.getItem("om_mock_pf")).books.length }));
    await p.evaluate(() => localStorage.removeItem("om_mock_pf_refuse"));
    ck(`when the agreement cannot be stored the card stays open and says so in red: "${failed.words}"`, failed.words === "Not saved: stand-in failure. Nothing was created." && failed.card && failed.books === 0, failed);
    await p.click("#pf-continue"); await p.waitForSelector("#pf-overview");
    const made = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("om_mock_pf")), bk = s.books[0]; return { hash: location.hash, id: bk.id, flash: document.querySelector(".pf-flash")?.textContent ?? null, strip: document.querySelector("#pf-strip").innerText.replace(/\s+/g, " ").trim(), agreed: Object.values(s.consents)[0], n: s.books.length, last: localStorage.getItem("om_pf_last") }; });
    ck(`ticked and continued: the agreement is stored with its time, the portfolio is created and its Overview opens at its own id, with the line "${made.flash}" at the foot`, made.n === 1 && made.hash === `#portfolio/${made.id}` && /^[0-9a-f-]{36}$/.test(made.id) && made.flash === "Paper portfolio created · Equity L/S · Japan · 21 Nov 2026" && made.agreed.version === 1 && /^2026-11-21T09:0/.test(made.agreed.agreedAt) && made.last === made.id && /^Equity L\/S · Japan · 21 Nov 2026 ▾ Equity L\/S · Japan · AR · USD · PAPER · only you · created 21 Nov 2026/.test(made.strip), made);
    await pf(p, `${made.id}/settings/statement`, "#pf-agreed");
    const agreed = await text(p, "#pf-agreed");
    ck(`Settings shows when it was agreed, the version and the words: "${(agreed ?? "").slice(0, 46)}…"`, new RegExp(`^Agreed 21 Nov 2026 17:0\\d SGT · version 1 ${STATEMENT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`).test(agreed ?? ""), agreed);
    // ---- the other two starts: no card the second time; what is stored is what the form showed ----
    const created = { "ar-ls-jp": jp };
    for (const start of ["ar-ls-gl", "ar-macro"]) {
      await pf(p, `new/${start}`, "#pf-create"); await p.click("#pf-costs-edit"); await p.waitForTimeout(80);
      created[start] = await form(p);
      await p.click("#pf-create"); await p.waitForSelector("#pf-overview");
      created[start].card = await p.locator("#pf-consent").count();
    }
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("om_mock_pf")).books.map((bk) => ({ start: bk.start, name: bk.name, base: bk.base, nav: bk.startingNav, x: bk.targetX, vol: bk.targetVol, ladder: bk.ladder, base2: bk.ladderBase, blend: bk.blend, settings: bk.settings })));
    ck(`a second and a third portfolio are created without the card: Equity long/short · Global (${created["ar-ls-gl"].rows} rows) and Global macro (${created["ar-macro"].rows} rows)`, created["ar-ls-gl"].card === 0 && created["ar-macro"].card === 0 && created["ar-ls-gl"].rows === 58 && created["ar-macro"].rows === 67 && byOk(created["ar-ls-gl"]) && byOk(created["ar-macro"]) && created["ar-macro"].by.target_x === "PM B · PM A" && created["ar-macro"].by.adj_gross === "PM B" && stored.length === 3, { gl: created["ar-ls-gl"].rows, macro: created["ar-macro"].rows, n: stored.length });
    for (const bk of stored) {
      const f = created[bk.start], nums = bk.settings.filter((s) => typeof s.value === "number" && f.typed[s.key] !== undefined), differ = nums.filter((s) => Number(String(f.typed[s.key]).replace(/,/g, "")) !== s.value).map((s) => `${s.key}: ${f.typed[s.key]} / ${s.value}`);
      const want = { "ar-ls-jp": 40, "ar-ls-gl": 42, "ar-macro": 47 }[bk.start];
      ck(`${bk.name}: created without an edit it stores every default the form showed (${bk.settings.length - 1} settings, ${nums.length} of them typed rows, each equal to its field): USD 100,000,000, cash + 5.0% at 5.0%, the ladder 4/2/2 to 50% and 30% on the yearly base that is not reset after a losing year; each row keeps whose it is`, bk.settings.length === want && nums.length >= 30 && differ.length === 0 && bk.nav === 10000000000 && bk.base === "USD" && bk.x === 5 && bk.vol === 5 && bk.base2 === "guarded" && [bk.ladder.cut1, bk.ladder.cap1, bk.ladder.cut2, bk.ladder.cap2, bk.ladder.out].join() === "4,50,2,30,2"
        && bk.settings.filter((s) => s.key !== "name").every((s) => /^default \(/.test(s.basis) && s.origin === "creation" && s.reason === null) && (bk.start !== "ar-macro" || bk.blend === 60), { n: bk.settings.length, differ });
    }
    ck("no error on the page through all of it", errs.length === 0, errs);
    await ctx.close();
  }

  console.log("\n[5] the form: the targets, the refusals, the ladder, what it can trade, its width, a draft, the errors");
  {
    const { ctx, p, errs } = await open(b);
    await go(p, "portfolio/new/ar-ls-jp", "#pf-create");
    const lines = () => p.evaluate(() => ({ equiv: document.querySelector("#pf-equiv")?.textContent ?? null, sharpe: document.querySelector("#pf-sharpe")?.textContent ?? null, tie: document.querySelector("#pf-tie")?.textContent ?? null, state: document.querySelector("#pf-tie")?.dataset.state ?? null, lad: document.querySelector("#pf-ladvol")?.textContent ?? null, scale: document.querySelector("#pf-scale")?.textContent ?? null, create: document.querySelector("#pf-create").disabled, count: document.querySelector("#pf-count").textContent, tieVar: document.querySelector("#pf-tie-var")?.textContent ?? null }));
    const t5 = await lines();
    ck(`the targets block's four lines at the defaults: "${t5.equiv}" · "${t5.sharpe}" · "${t5.tie}" · "${t5.lad}"; no scale line at 0.8`, t5.equiv === "= 9.21% a year at EFFR 3.88% for 18 Nov 2026 (New York Fed)" && t5.sharpe === "implied Sharpe 1.0" && t5.state === "clear" && t5.tie === "normal 99% one-day VaR 0.73% of capital, under 80% of your 1.00% VaR limit" && t5.lad === "first cut at 4.0% of the reference capital = 0.8 target volatilities (0.8 σ*)" && t5.scale === null && !t5.create, t5);
    // the costs' fold opened first, so that the funding row could be seen if it were there (PC-5 of the second review
    // of P-1: it was asserted absent while its section was folded)
    await p.click("#pf-costs-edit"); await p.waitForSelector('[data-row="funding"]', { timeout: 3000 }).catch(() => {}); const usdFunding = await p.evaluate(() => !!document.querySelector('[data-row="funding"]'));
    await p.click('[data-row="base"] .pf-chip[data-value="JPY"]'); await p.waitForTimeout(100);
    const yen = await p.evaluate(() => ({ equiv: document.querySelector("#pf-equiv").textContent, nav: document.querySelector('input[data-key="nav"]').value, usd: document.querySelector("#pf-usd")?.textContent ?? null, funding: !!document.querySelector('[data-row="funding"]'), ref: document.querySelector("#pf-reference").innerText.replace(/\s+/g, " ").trim() }));
    await p.click('[data-row="base"] .pf-chip[data-value="USD"]'); await p.waitForTimeout(100); await p.click("#pf-costs-edit"); await p.waitForTimeout(60);
    ck(`on a yen base: "${yen.equiv}"; the starting NAV becomes ${yen.nav} JPY with "${yen.usd}"; with the costs open, the funding row is a dollar book's only (USD: ${usdFunding}, JPY: ${yen.funding})`, usdFunding && yen.equiv === "= 6.30% a year at TONA 1.227% for 18 Nov 2026 (Bank of Japan)" && yen.nav === "10,000,000,000" && /^= USD 63\.1m at 158\.400, the 17:00 New York close of \d+ Nov 2026 \(Yahoo Finance, unofficial\)$/.test(yen.usd ?? "") && !yen.funding && /^MSCI Japan, net, JPY PROXY/.test(yen.ref) && (await p.evaluate(() => document.querySelector('input[data-key="nav"]').value)) === "100,000,000", yen);
    await set(p, "target_vol", "6.0"); const t6 = await lines();
    await set(p, "target_vol", "7.0"); const t7 = await lines();
    await set(p, "target_vol", "5.0"); await set(p, "var", "0.7"); const low = await lines();
    await set(p, "var", "1.0");
    ck(`a target volatility of 6.0% shows the amber line with 0.88% and WARN, and CREATE can be pressed; 7.0% the red sentence with 1.03% and a limit the VaR field takes ("at least 1.1%", EN-11), and CREATE cannot ("${t7.count}"); with the VaR limit typed as 0.7% and the target at 5.0% the same sentence stands under the VaR row`, t6.state === "warned" && /^! WARN Target volatility 6\.0% implies a 99% one-day VaR of 0\.88% of capital/.test(t6.tie) && !t6.create && t6.count === "0 settings out of range"
      && t7.state === "refused" && /implies a 99% one-day VaR of 1\.03% of capital on a normal law, above your 1\.00% VaR limit: lower the target or raise the limit to at least 1\.1%$/.test(t7.tie) && t7.create && t7.count === "1 setting out of range" && /Target volatility 5\.0% implies a 99% one-day VaR of 0\.73% of capital on a normal law, above your 0\.70% VaR limit/.test(low.tieVar ?? "") && low.create, { t6, t7, low });
    const said = {};
    await set(p, "nav", "5m"); said.nav = await refusalOf(p, "nav"); const c1 = await lines();
    await set(p, "nav", "100m"); said.navBack = await p.evaluate(() => document.querySelector('input[data-key="nav"]').value);
    await set(p, "target_x", "15.5"); said.x = await refusalOf(p, "target_x"); await set(p, "target_x", "5.3"); said.step = await refusalOf(p, "target_x"); await set(p, "target_x", "5.0");
    await set(p, "cut1", "9"); said.cut = await refusalOf(p, "cut1"); const c2 = await lines(); await set(p, "cut1", "4");
    await set(p, "cap1", "50"); await set(p, "cap2", "50"); said.cap = await refusalOf(p, "cap2"); const c3 = await lines();
    await set(p, "cap2", "30"); said.capOk = await refusalOf(p, "cap2");
    await set(p, "gross", "abc"); said.nan = await refusalOf(p, "gross"); await set(p, "gross", ""); said.empty = await refusalOf(p, "gross"); await set(p, "gross", "200");
    const clean = await lines();
    ck(`refusals are sentences under the field, and nothing is corrected: "5m" "${said.nav}" ("100m" is written out as ${said.navBack}); a target return of 15.5 "${said.x}", of 5.3 "${said.step}"; a first cut of 9 "${said.cut}"; "abc" "${said.nan}"; nothing "${said.empty}"`, said.nav === "between USD 10m and USD 1bn" && said.navBack === "100,000,000" && said.x === "between 0% and 15%" && said.step === "in steps of 0.5" && said.cut === "between 2% and 8%" && said.nan === "enter a number" && said.empty === "enter a value", said);
    ck(`capital after the cuts 50 and 50: "${said.cap}"; 50 and 30: none; in each refused case CREATE cannot be pressed and counts the refusals ("${c1.count}"), and with none it can again`, said.cap === "Capital after the second cut (50%) must be below capital after the first (50%)" && said.capOk === null && c1.create && c1.count === "1 setting out of range" && c2.create && c3.create && !clean.create && clean.count === "0 settings out of range", { said, c1, c2, c3, clean });
    // ---- the ladder ----
    const bases = await p.evaluate(() => [...document.querySelectorAll("#pf-bases label.pf-base")].map((l) => ({ base: l.dataset.base, checked: l.querySelector("input").checked, name: l.querySelector(".n").textContent, line: l.querySelector(".pf-line").textContent })));
    await set(p, "cut1", "3"); await set(p, "cut2", "2");
    const lad = await p.evaluate(() => ({ at2: document.querySelector("#pf-at2").textContent, at3: document.querySelector("#pf-at3").textContent, restore: document.querySelector("#pf-restore").textContent }));
    await set(p, "cut1", "4"); await set(p, "target_vol", "8.0"); const v8 = await lines(); await set(p, "target_vol", "5.0");
    await p.click("#pf-base-more"); const rule = await text(p, "#pf-base-rule");
    await p.click('#pf-bases label[data-base="start"]'); await p.waitForTimeout(80);
    const fixedLine = await p.evaluate(() => ({ line: document.querySelector("#pf-summary .fixedline").textContent, ladder: [...document.querySelectorAll("#pf-summary > div")].map((d) => d.textContent).find((t) => t.startsWith("Ladder")), drawdown: document.querySelector("#pf-drawdown").textContent }));
    await p.click('#pf-bases label[data-base="guarded"]');
    ck(`the ladder's base: three radio rows, the first chosen and marked "default" (${bases.map((x) => x.name).join(" | ")}), each with its line on capital and limits; "more" opens the whole rule`, bases.length === 3 && bases.map((x) => x.base).join() === "guarded,yearly,start" && bases[0].checked && !bases[1].checked && /^Yearly reset, not after a losing year · default · Owner$/.test(bases[0].name) && /After a losing year: unchanged\.$/.test(bases[0].line) && /also after a losing year/.test(bases[1].line) && /^Never: capital and every limit stay sized to the starting NAV for life\.$/.test(bases[2].line) && /^At the first NAV of each calendar year/.test(rule ?? ""), { bases, rule });
    ck(`cuts typed as 3 and 2 print "${lad.at2}" and "${lad.at3}", and the restore row starts "${lad.restore.slice(0, 62)}"; with the first cut at 4 and the target volatility at 8.0 the form prints "0.5 target volatilities" and the scale line, at 5.0 neither; under "since the start" the summary says the targets are never re-set`, lad.at2 === "(at 5.0%)" && lad.at3 === "(at 7.0%)" && /^to 50% at a drawdown of 3\.0% or less, to full at 1\.0% or less: /.test(lad.restore) && /= 0\.5 target volatilities \(0\.5 σ\*\)$/.test(v8.lad) && /^For scale \(E, the PMs' simulations/.test(v8.scale ?? "")
      && /The targets: re-set: never\.$/.test(fixedLine.line) && fixedLine.ladder === "Ladder 4/2/2 · since the start" && /the starting NAV$/.test(fixedLine.drawdown), { lad, v8, fixedLine });
    // ---- what it can trade ----
    const lists = (pg) => pg.evaluate(() => { const box = document.querySelector("#pf-trade"), of = (k) => [...box.querySelectorAll(`ul[data-list="${k}"] li`)]; return { heads: [...box.querySelectorAll(".minih")].map((h) => h.textContent), can: of("can").map((l) => l.textContent), notbuilt: of("notbuilt").map((l) => l.textContent), cannot: of("cannot").map((l) => l.textContent), bold: of("cannot").filter((l) => l.querySelector("b")?.textContent === l.textContent).map((l) => l.textContent), taps: box.querySelectorAll("a, button, input, [tabindex], [role]").length, pointer: [...box.querySelectorAll("*")].some((e) => getComputedStyle(e).cursor === "pointer") }; });
    const tj = await lists(p);
    ck(`what it can trade, three lists (${tj.heads.join(" · ")}): ${tj.can.length} lines it can, "${tj.notbuilt[0]}", and ${tj.cannot.length} it cannot here, each with its reason; no line takes a tap`, tj.heads.join("|") === "Can trade|Not built yet|Cannot trade here, and why" && tj.can.length === 6 && tj.can[0] === "Tokyo-listed stocks and ETFs, long and short" && tj.can[1] === "names listed outside Tokyo, up to 20% of capital, gross (a limit)" && tj.notbuilt.join() === "Not built yet: orders in stocks and ETFs · futures · currencies · options." && tj.cannot.length === 4 && tj.cannot[0] === "Osaka's futures (Nikkei 225, TOPIX): Osaka's settlement and volume files are not used in this Monitor (the owner's answer of 21 Nov 2026). Japan's index futures here are CME's NKD and NIY." && tj.taps === 0 && !tj.pointer, tj);
    // ---- a draft ----
    await set(p, "one_long", "8"); await set(p, "gross", "180");
    const changed = await text(p, "#pf-changedcount");
    await hop(p, "market", "table.mkt"); await hop(p, "portfolio/new", "#pf-draft");
    const draft = await p.evaluate(() => ({ line: document.querySelector("#pf-draft").innerText.replace(/\s+/g, " ").trim(), one: document.querySelector('input[data-key="one_long"]').value, gross: document.querySelector('input[data-key="gross"]').value, marks: document.querySelectorAll(".pf-changed").length, count: document.querySelector("#pf-changedcount").textContent }));
    ck(`a draft: two fields edited ("${changed}"), MARKETS opened, and back: the two values are there with "${draft.line}"`, changed === "2 settings changed from the defaults" && draft.one === "8" && draft.gross === "180" && /^Your unsaved settings from 17:0\d SGT are back · START AGAIN$/.test(draft.line) && draft.marks === 2 && draft.count === changed, draft);
    // ---- a change of start asks before it drops the edits ----
    await p.click('#pf-starts [data-start="ar-macro"]'); const ask = await text(p, "#pf-ask");
    await p.click("#pf-ask .pf-btn"); await p.waitForTimeout(80);   // KEEP
    const kept = await p.evaluate(() => ({ ask: !!document.querySelector("#pf-ask"), start: document.querySelector("#pf-starts .pf-chip.on").textContent, one: document.querySelector('input[data-key="one_long"]').value }));
    ck(`another start is asked for first: "${ask}"; KEEP keeps the start and the edits`, /^Change the start\? Your 2 changed settings go back to the new start's defaults\. KEEP CHANGE$/.test(ask ?? "") && !kept.ask && kept.start === "Equity long/short · Japan" && kept.one === "8", { ask, kept });
    // ---- the errors ----
    const press = async (mode) => { await p.evaluate((m) => localStorage.setItem("om_mock_pf_refuse", m), mode); await p.click("#pf-create"); await p.waitForSelector("#pf-create-msg"); const r = await p.evaluate(() => ({ msg: document.querySelector("#pf-create-msg").textContent, one: document.querySelector('input[data-key="one_long"]').value, hash: location.hash, create: document.querySelector("#pf-create").disabled })); await p.evaluate(() => localStorage.removeItem("om_mock_pf_refuse")); return r; };
    const e1 = await press("1"), e2 = await press("offline"), e3 = await press("signedout");
    ck(`when the server refuses: "${e1.msg}", the form kept and CREATE pressable again; without a connection "${e2.msg}"; with the sign-in expired "${e3.msg}"`, e1.msg === "Not created: stand-in failure. Nothing was saved." && e1.one === "8" && !e1.create && e1.hash === "#portfolio/new" && e2.msg === "Offline: a portfolio needs the server. Your settings are kept on this device." && e3.msg === "Signed out: sign in again. Nothing was created; your settings are kept.", { e1, e2, e3 });
    await p.click("#pf-draft .pf-link"); await p.waitForTimeout(100);
    const again = await p.evaluate(() => ({ draft: !!document.querySelector("#pf-draft"), one: document.querySelector('input[data-key="one_long"]').value, kept: sessionStorage.getItem("om_pf_draft") }));
    ck("START AGAIN puts every default back and forgets the draft", !again.draft && again.one === "10" && again.kept === null, again);
    await pf(p, "new/ar-macro", "#pf-create");
    const tm = await lists(p), mac = await p.evaluate(() => ({ help: document.querySelector("#pf-levhelp").textContent, blend: [...document.querySelectorAll("#pf-blend option")].map((o) => o.value).join(), gross: !!document.querySelector('[data-row="gross"]'), adj: document.querySelector('input[data-key="adj_gross"]').value, summary: document.querySelector("#pf-summary").innerText }));
    ck(`the macro form: its list of what it cannot trade here holds the three lines on duration outside the US, whole in bold ("${tm.bold[0]?.slice(0, 40)}…"); no gross limit to type but the adjusted gross (${mac.adj}%), with the leverage line printing a dash where the Monitor has no figure yet; the blend's shares are picked`, tm.bold.length === 3 && tm.bold.join(" ") === "JGB, Bund and Gilt futures: not in the free feed the Monitor reads (Yahoo Finance carries none). Osaka's contracts: Osaka's settlement and volume files are not used in this Monitor. So duration outside the US only through funds." && tm.cannot.length === 6 && tm.taps === 0
      && !mac.gross && mac.adj === "600" && /S&P 500 future –% of capital/.test(mac.help) && /shown once the futures' histories are stored\.$/.test(mac.help) && mac.blend.split(",").includes("60") && mac.blend.split(",").includes("70") && /Adjusted gross ≤ 600% · VaR ≤ 1\.0% · floor 10%/.test(mac.summary), { tm, mac });
    ck("no error on the page through all of it", errs.length === 0, errs);
    await ctx.close();
    // ---- its width, with refusals showing, at four sizes ----
    for (const size of ["C1", "C2", "C3", "C8"]) {
      const w = await open(b, { size });
      await go(w.p, "portfolio/new/ar-ls-jp", "#pf-create");
      await w.p.click("#pf-costs-edit"); await set(w.p, "nav", "5m"); await set(w.p, "cut1", "9"); await set(w.p, "cap2", "60"); await set(w.p, "target_vol", "7.0");
      const c = await cuts(w.p, ".pf-row .c, .pf-row .pf-no, .pf-row .pf-line, .pf-sumbody > div, .pf-sumbody > p, #pf-count, .pf-startrow > *, .pf-namerow > *");
      const lay = await w.p.evaluate(async () => { const z = Number(document.body.style.zoom) || 1, R = (e) => e.getBoundingClientRect(), form2 = document.querySelector(".pf-form"), sum = document.querySelector("#pf-summary"), tb = R(document.querySelector("#topbar")), seen = [];
        for (const y of [0, 0.33, 0.66, 1]) { scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * y); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const c2 = R(document.querySelector("#pf-create")), s = R(sum); seen.push({ y, create: c2.top >= tb.bottom - 1 && c2.bottom <= innerHeight + 1, sumTop: Math.round(s.top - tb.bottom) }); }
        scrollTo(0, 0);
        return { formW: Math.round(R(form2).width / z), under: R(sum).top >= R(form2).bottom - 1, beside: R(sum).left >= R(form2).right - 1, seen }; });
      const one = size === "C3";
      ck(`${size}: no row's value, refusal, range or why is cut and nothing scrolls sideways; the form is ${lay.formW} px wide (at most 1,100); the summary is ${one ? "under the form" : "beside it and stays under the header"}, and CREATE is in view at every scroll position`, c.cut.length === 0 && c.sideways <= 0 && lay.formW <= 1100 && (one ? lay.under : lay.beside && lay.seen.slice(1).every((s) => s.sumTop >= -1)) && lay.seen.every((s) => s.create) && w.errs.length === 0, { c, lay });
      await w.ctx.close();
    }
  }

  console.log("\n[6] a book: Overview, what is fixed, a change with its reason and history, the targets' window, notes, renaming, delete, a second account");
  {
    const { ctx, p, errs } = await open(b);
    await go(p, `portfolio/${ID(1)}`, "#pf-overview");
    const o = await p.evaluate(() => { const cells = [...document.querySelectorAll("#pf-book .cell")].map((c) => ({ k: c.querySelector(".k").textContent, v: c.querySelector(".v").textContent, s: c.querySelector(".s").innerText.replace(/\s+/g, " ").trim() })), limits = document.querySelector("#pf-limits");
      const heads = [...document.querySelectorAll("#pf-overview th, #pf-book .k")].map((h) => h.textContent.toUpperCase());
      return { panels: [...document.querySelectorAll("#pf-overview .panel")].map((x) => `${x.dataset.no} ${x.querySelector(".phead .t").textContent}`), aux: document.querySelector("#pf-book-aux").textContent, cells, heads, limitHead: [...limits.querySelectorAll("th")].map((h) => h.textContent), limits: [...limits.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.innerText.replace(/\s+/g, " ").trim()).join("|")),
        after: document.querySelector('.panel[data-k="pfo-limits"] .pf-after').textContent, canvas: document.querySelectorAll("#pf-overview canvas, #pf-overview svg").length, notbuilt: [...document.querySelectorAll(".pf-notbuilt")].map((e) => e.textContent), settings: document.querySelector("#pf-to-settings").getAttribute("href"), nav: (document.querySelector("#pf-overview").innerText.match(/100,000,000/g) || []).length }; });
    ck(`Overview: ${o.panels.join(" · ")}; 01 shows six cells of what the book is and says "${o.aux}"`, o.panels.join("|") === "01 BOOK|02 WHAT THIS BOOK CAN TRADE|03 LIMITS AS SET|04 NOTES|05 ACTIVITY" && o.aux === "created 1 Oct 2026 09:12 SGT · no NAV yet: the daily NAV is not built" && o.cells.length === 6
      && o.cells.map((c) => `${c.k}: ${c.v} / ${c.s}`).join("\n") === ["Starting NAV: 100,000,000 / USD · all cash", "Capital: 100.00m / full capital", "Target return: cash + 5.0% a year / = 9.21% at EFFR 3.88% for 18 Nov 2026", "Target volatility: 5.0% of capital a year / implied Sharpe 1.0", "Ladder: Full capital / 4/2/2 · yearly reset, not after a losing year", "Reference: MSCI Japan, hedged / PROXY · waits for its series"].join("\n"), o);
    ck(`nothing on it stands for what P-1 does not hold: no label or column head reads DAY P&L, SINCE START, GROSS, NET or VaR, the only NAV figure is the starting NAV, no chart; 03 lists every limit (${o.limits.length}) with BY and SINCE and no NOW, USED or STATE, and its head says once "a day ends 17:00 New York" (B.0.1); the muted last line is there once`, !o.heads.some((h) => /^(DAY P&L|DAY|SINCE START|GROSS|NET|VAR|NOW|USED|STATE|NAV)$/.test(h)) && o.canvas === 0 && o.limitHead.join("|") === "Limit|Value|By|Since" && o.limits.length === 15 && o.after === "· 15 · 1 changed from the defaults · a day ends 17:00 New York"
      && o.limits[0] === "One name, short|4% of capital|you|Fri 13 Nov 2026" && o.limits[1] === "Sector, net|±20% of capital ±15% from Mon 23 Nov 2026, 06:00 SGT · pending|PM A|Thu 1 Oct 2026" && o.limits.includes("Gross|≤ 200% of capital|PM A|Thu 1 Oct 2026") && o.notbuilt.length === 1 && o.notbuilt[0] === NOT_BUILT && o.settings === `#portfolio/${ID(1)}/settings/limits`, o);
    const live = (pg) => pg.evaluate(() => { const off = [...document.querySelectorAll("#grid button:disabled")].map((x) => x.id || x.textContent), links = [...document.querySelectorAll("#grid a")].map((a) => a.getAttribute("href") ?? ""), ok = "a, button, label, input, select, textarea, .csvbtn";
      const loose = [...document.querySelectorAll("#grid *")].filter((e) => e.getClientRects().length && getComputedStyle(e).cursor === "pointer" && !e.closest(ok)).map((e) => `${e.tagName}.${e.className}`).slice(0, 5);
      return { off, bad: links.filter((h) => !h.startsWith("#portfolio")), loose, faded: [...document.querySelectorAll("#grid button:not(:disabled), #grid a")].filter((e) => Number(getComputedStyle(e).opacity) < 1).length }; });
    const l1 = await live(p);
    await p.click('#pf-limits tr[data-row="one_short"] .pf-by'); const youCard = await text(p, '#pf-limits tr[data-row="one_short"] .pf-bycard');
    await p.click('#pf-limits tr[data-row="one_long"] .pf-by'); const pmCard = await text(p, '#pf-limits tr[data-row="one_long"] .pf-bycard');
    ck(`whose a limit is opens as a card under its tag: "${youCard}" for a value the account set, "${pmCard}" for a default`, youCard === "you · set by the account, 12 Nov 2026 10:02 SGT" && pmCard === "PM A · default advised by the equity long/short PM, 20 Nov 2026", { youCard, pmCard });
    // ---- notes ----
    const notes = await p.evaluate(() => ({ items: [...document.querySelectorAll("#pf-notes li")].map((li) => ({ id: li.dataset.note, t: li.querySelector(".hd .t")?.textContent ?? null, tip: li.querySelector(".hd .t")?.title ?? null, n: li.querySelector(".tx")?.textContent.length ?? 0, clip: !!li.querySelector(".tx.clip"), all: !!li.querySelector('[data-act="all"]'), text: li.querySelector(".tx")?.textContent ?? li.textContent })), gist: document.querySelector("#pf-note-gist").textContent, save: document.querySelector("#pf-note-save").disabled, after: document.querySelector('.panel[data-k="pfo-notes"] .pf-after').textContent }));
    await p.click('#pf-notes [data-act="all"]'); await p.waitForTimeout(80);
    const whole = await p.evaluate(() => { const li = [...document.querySelectorAll("#pf-notes li")].find((x) => (x.querySelector(".tx")?.textContent.length ?? 0) === 1900), tx = li.querySelector(".tx"); return { clip: tx.classList.contains("clip"), cut: tx.scrollHeight > tx.clientHeight + 1, more: !!li.querySelector('[data-act="all"]') }; });
    ck(`notes: the box, under it always "${notes.gist}"; four stand-in notes newest first, each with its time (the year on its tooltip), its line breaks kept and Japanese as written; the note of 1,900 characters shows eight lines and SHOW ALL, then is whole; the removed one reads "${notes.items[3]?.text}"`, notes.gist === GIST && notes.after === "· on this portfolio · only you · times in SGT" && notes.save && notes.items.length === 4 && notes.items[0].t === "19 Nov 17:20" && notes.items[0].tip === "19 Nov 2026 17:20 SGT" && notes.items[0].text.includes("\n\nNo change to the short book.") && notes.items[1].text === "決算前に自動車の比率を下げる。\n円高が進めばヘッジを見直す。"
      && notes.items[2].n === 1900 && notes.items[2].clip && notes.items[2].all && !notes.items[0].clip && notes.items[3].id === "removed" && notes.items[3].text === "note removed 6 Oct 10:44" && !whole.clip && !whole.cut && !whole.more, { notes: notes.items.map((n) => ({ ...n, text: n.text.slice(0, 40) })), whole });
    await p.fill("#pf-note-box", "x".repeat(2121)); const over = await p.evaluate(() => ({ count: document.querySelector("#pf-note-count").textContent, save: document.querySelector("#pf-note-save").disabled, kept: document.querySelector("#pf-note-box").value.length }));
    await p.fill("#pf-note-box", "x".repeat(1660)); const left = await text(p, "#pf-note-count");
    await p.fill("#pf-note-box", "x".repeat(1400)); const quiet = await p.locator("#pf-note-count").count();
    ck(`a note of 2,121 characters is refused in words ("${over.count}"), SAVE NOTE cannot be pressed and nothing is cut; from 1,500 a counter shows ("${left}"), before that none`, over.count === "2,000 characters at most · 121 over" && over.save && over.kept === 2121 && left === "340 left" && quiet === 0, { over, left, quiet });
    await p.fill("#pf-note-box", "A note from the check.\nIts second line.");
    await p.evaluate(() => localStorage.setItem("om_mock_pf_refuse", "1")); await p.click("#pf-note-save"); await p.waitForSelector("#pf-note-msg");
    const refused = await p.evaluate(() => ({ msg: document.querySelector("#pf-note-msg").textContent, box: document.querySelector("#pf-note-box").value })); await p.evaluate(() => localStorage.removeItem("om_mock_pf_refuse"));
    await p.focus("#pf-note-box"); await p.keyboard.press("Control+Enter"); await p.waitForFunction(() => document.querySelectorAll("#pf-notes li").length === 5);
    const added = await p.evaluate(() => ({ first: document.querySelector("#pf-notes li .tx").textContent, t: document.querySelector("#pf-notes li .hd .t").textContent, box: document.querySelector("#pf-note-box").value, id: document.querySelector("#pf-notes li").dataset.note }));
    await p.click("#pf-notes li .rm"); const askRemove = await text(p, "#pf-notes li .pf-ask");
    await p.click('#pf-notes li [data-act="remove"]'); await p.waitForFunction(() => document.querySelector("#pf-notes li")?.dataset.note === "removed");
    const gone = await p.evaluate(() => ({ row: document.querySelector("#pf-notes li").textContent, stored: localStorage.getItem("om_mock_pf").includes("A note from the check."), acts: [...document.querySelectorAll("#pf-activity .act")].slice(0, 2).map((a) => a.innerText.replace(/\s+/g, " ").trim()), bar: document.querySelector("#pf-activity .daybar").textContent }));
    ck(`a refused note says "${refused.msg}" and stays in the box; Ctrl+Enter saves it (first in the list, "${added.t}"), and the box empties`, refused.msg === "Not saved: stand-in failure. Your text is still in the box." && refused.box.startsWith("A note from the check.") && added.first === "A note from the check.\nIts second line." && /^21 Nov 17:0\d$/.test(added.t) && added.box === "", { refused, added });
    ck(`REMOVE asks in place ("${askRemove}"); then the row reads "${gone.row}", its text is gone from the store for good, and ACTIVITY gains its lines under ${gone.bar}`, askRemove === "Remove this note? Its text goes for good; a line saying a note was removed stays. KEEP REMOVE" && /^note removed 21 Nov 17:0\d$/.test(gone.row) && !gone.stored && /^17:0\d NOTE removed$/.test(gone.acts[0]) && /^17:0\d NOTE added$/.test(gone.acts[1]) && gone.bar === "SATURDAY 21 NOV", { askRemove, gone });
    // ---- Settings: what is fixed ----
    await pf(p, `${ID(1)}/settings`, "#pf-settings");
    const s = await p.evaluate(() => { const row = (sec, k) => document.querySelector(`[data-sec="${sec}"] [data-row="${k}"]`), ctl = "input, button, a, select, textarea";
      const fixed = ["start", "base", "nav", "created", "valuation", "reference", "house_multiple"].map((k) => ({ k, controls: row("portfolio", k).querySelectorAll(ctl).length, says: row("portfolio", k).querySelector(".pf-fixed")?.textContent ?? null, v: row("portfolio", k).querySelector(".v").innerText.replace(/\s+/g, " ").trim() }));
      const lad = document.querySelector('[data-sec="ladder"]'), tg = document.querySelector('[data-sec="targets"]');
      return { goto: [...document.querySelectorAll("#pf-goto a")].map((a) => a.textContent), panels: [...document.querySelectorAll("#pf-settings .panel")].map((x) => `${x.dataset.no} ${x.querySelector(".phead .t").textContent}`), fixed, ladderControls: lad.querySelectorAll(ctl + ", .csvbtn").length, ladderFixed: document.querySelector("#pf-ladder-fixed").textContent, ladder: [...lad.querySelectorAll(".pf-kv")].map((r) => r.innerText.replace(/\s+/g, " ").trim()),
        targets: tg.innerText.replace(/\s+/g, " ").trim(), targetControls: [...tg.querySelectorAll('[data-row="target_x"], [data-row="target_vol"], #pf-window')].reduce((n, e) => n + e.querySelectorAll(ctl).length, 0), reset: !!document.querySelector("#pf-reset"), rename: document.querySelector('[data-row="name"] #pf-rename')?.textContent ?? null }; });
    ck(`Settings: GO TO ${s.goto.join(" · ")}; seven panels; the start, base currency, starting NAV, Reference and house margin multiple have no input, button or link, each a value in words followed by "fixed"; the name alone can be changed (RENAME)`, s.goto.join("|") === "PORTFOLIO|TARGETS|LADDER|LIMITS|ASSUMPTIONS|STATEMENT|DELETE" && s.panels.join("|") === "01 PORTFOLIO|02 TARGETS|03 LADDER|04 LIMITS|05 ASSUMPTIONS|06 STATEMENT|07 DELETE" && s.fixed.every((f) => f.controls === 0 && f.says === "fixed") && s.fixed[0].v === "Equity long/short · Japan · absolute return" && s.fixed[2].v === "100,000,000 USD" && /^MSCI Japan, net, hedged to USD \(E\) PROXY/.test(s.fixed[5].v) && s.fixed[6].v === "× 1.0" && s.rename === "RENAME", s.fixed);
    ck(`03 LADDER says "fixed" once, in its head, and no row of it has a control: ${s.ladder[1]} · ${s.ladder[2]} · ${s.ladder[3].slice(0, 22)}…`, s.ladderControls === 0 && s.ladderFixed === "fixed" && s.ladder.length === 8 && s.ladder[0].startsWith("Base Yearly reset, not after a losing year Each January at full capital") && s.ladder[1] === "First cut at a drawdown of 4.0% → capital 50% of the reference capital" && s.ladder[2] === "Second cut + 2% (at 6.0%) → capital 30%" && s.ladder[3] === "Out + 2% (at 8.0%): final; the only restart is a new portfolio" && s.ladder[4].startsWith("Restore to 50% at a drawdown of 4.0% or less, to full at 2.0% or less"), s.ladder);
    ck(`02 TARGETS outside the window: each target says "re-set only from 1 Dec, 13:00 SGT, to a January reset", then "next window: from 1 Dec 2026, 13:00 SGT, to the first NAV of 2027" (the moment with its zone: B.0.2), and there is no control on them`, /Target return cash \+ 5\.0% a year = 9\.21% a year at EFFR 3\.88% for 18 Nov 2026 \(New York Fed\) re-set only from 1 Dec, 13:00 SGT, to a January reset Target volatility 5\.0% of capital a year re-set only from 1 Dec, 13:00 SGT, to a January reset next window: from 1 Dec 2026, 13:00 SGT, to the first NAV of 2027/.test(s.targets) && s.targetControls === 0 && !s.reset, s.targets);
    // ---- a change ----
    const limitsRow = (k) => `[data-sec="limits"] tr[data-row="${k}"]`;
    await p.click(`${limitsRow("one_long")} [data-act="change"]`); await p.waitForSelector("#pf-change");
    const f0 = await p.evaluate(() => ({ head: document.querySelector(".pf-changebox > .t").innerText.replace(/\s+/g, " ").trim(), now: document.querySelector("#pf-change .ln").innerText.replace(/\s+/g, " ").trim(), when: document.querySelector("#pf-change-when").textContent, save: document.querySelector("#pf-change-save").disabled, gist: document.querySelector("#pf-change-gist").textContent, range: document.querySelector("#pf-change .pf-unit2").textContent }));
    const val = async (v) => { await p.fill("#pf-change-value", v); await p.locator("#pf-change-value").blur(); await p.waitForTimeout(60); return p.evaluate(() => ({ no: document.querySelector("#pf-change .pf-num .pf-no")?.textContent ?? null, save: document.querySelector("#pf-change-save").disabled })); };
    const why = async (v) => { await p.fill("#pf-change-reason", v); await p.locator("#pf-change-reason").blur(); await p.waitForTimeout(60); return p.evaluate(() => ({ no: document.querySelector("#pf-change-reason-no")?.textContent ?? null, save: document.querySelector("#pf-change-save").disabled })); };
    const same = await val("10"), out = await val("30"), step = await val("8.25"), okVal = await val("8"), none = await why(""), short = await why("too short"), long = await why("x".repeat(512)), good = await why("tighter into results season");
    ck(`CHANGE on "One name, long": "${f0.now}", the range ${f0.range}, "${f0.when}"; the same value "${same.no}", 30 "${out.no}", 8.25 "${step.no}"; no reason "${none.no}"; 512 characters "${long.no}"; in each case SAVE CHANGE cannot be pressed`, f0.head === "CHANGE · ONE NAME, LONG ×" && f0.now === "In force now 10% of capital · PM A · since Thu 1 Oct 2026" && f0.range === "3–25%" && f0.when === "In force from Mon 23 Nov 2026, 06:00 SGT" && f0.save && /only you see it/.test(f0.gist) && same.no === "this is the value in force" && same.save && out.no === "between 3% and 25%" && out.save && step.no === "in steps of 0.1" && okVal.no === null
      && none.no === "give a reason of at least 10 characters: it is kept in the history" && none.save && short.no === none.no && long.no === "500 characters at most · 12 over" && long.save && good.no === null && !good.save, { f0, same, out, step, none, short, long, good });
    await p.evaluate(() => localStorage.setItem("om_mock_pf_refuse", "1")); await p.click("#pf-change-save"); await p.waitForSelector("#pf-change .pf-msg"); const cf = await text(p, "#pf-change .pf-msg"); await p.evaluate(() => localStorage.removeItem("om_mock_pf_refuse"));
    await p.click("#pf-change-save"); await p.waitForSelector(`${limitsRow("one_long")} [data-pending="one_long"]`);
    const saved = await p.evaluate((sel) => ({ row: [...document.querySelector(sel).querySelectorAll("td")].map((c) => c.innerText.replace(/\s+/g, " ").trim()).join("|"), form: !!document.querySelector("#pf-change") }), limitsRow("one_long"));
    ck(`a refused change says "${cf}"; saved, the row keeps the value in force and shows the pending one under it: ${saved.row}`, cf === "Not saved: stand-in failure. Nothing changed." && saved.row === "One name, long|10% of capital 8% from Mon 23 Nov 2026, 06:00 SGT · pending|3–25%|10% is the single-issuer limit of UCITS funds and Japanese public investment trusts|PM A|Thu 1 Oct 2026|CHANGE" && !saved.form, { cf, saved });
    await p.click('[data-sec="limits"] [data-tab="history"]'); await p.waitForSelector('[data-sec="limits"] table.pf-hist');
    const h = await p.evaluate(() => { const t = document.querySelector('[data-sec="limits"] table.pf-hist'), rows = [...t.querySelectorAll("tbody tr")].map((r) => ({ origin: r.dataset.origin, cells: [...r.querySelectorAll("td")].map((c) => c.innerText.replace(/\s+/g, " ").trim()) })), longReason = [...t.querySelectorAll("td.rs")].find((c) => c.textContent.length === 140);
      return { head: [...t.querySelectorAll("th")].map((x) => x.textContent), n: rows.length, first: rows[0].cells, second: rows[1].cells, short: rows.find((r) => r.cells[1] === "One name, short" && r.origin === "change")?.cells, creation: rows.find((r) => r.origin === "creation" && r.cells[1] === "One name, long")?.cells, band: rows.filter((r) => /^(Band around the target|Amber above)$/.test(r.cells[1])).length, reasonCut: longReason ? longReason.scrollWidth > longReason.clientWidth + 1 : null, controls: t.querySelectorAll("input, button, a").length }; });
    ck(`HISTORY (${h.head.join(" · ")}), ${h.n} rows (every limit's, the band's and the amber line's among them), newest first and only ever added to: ${h.first.slice(1).join(" | ")}; the change made on 12 Nov with its 140-character reason whole; a creation default reads "${h.creation?.[6]}" with no reason`, h.head.join("|") === "When (SGT)|Setting|From|To|In force from|Reason|By" && /^21 Nov 2026 17:0\d$/.test(h.first[0]) && h.first.slice(1).join("|") === "One name, long|10%|8%|Mon 23 Nov 2026 · pending|tighter into results season|set by the account" && h.second[1] === "Sector, net" && /pending$/.test(h.second[4])
      && h.short?.[2] === "5%" && h.short[3] === "4%" && h.short[4] === "Fri 13 Nov 2026" && h.short[5].length === 140 && h.short[6] === "set by the account" && h.reasonCut === false && h.creation?.[2] === "–" && h.creation[3] === "10%" && h.creation[5] === "–" && h.creation[6] === "default (PM advice: A)" && h.n === 18 && h.band === 2 && h.controls === 0, h);
    const l2 = await live(p);
    ck(`no dead control on the book's pages: every link leads to an address of the tab, nothing that takes a click is outside a control, none is faded, and the only buttons that cannot be pressed are SAVE NOTE with an empty box (Overview: ${l1.off.join(", ") || "none"}; Settings: ${l2.off.join(", ") || "none"})`, l1.bad.length === 0 && l2.bad.length === 0 && l1.loose.length === 0 && l2.loose.length === 0 && l1.faded === 0 && l2.faded === 0 && l1.off.join() === "pf-note-save" && l2.off.length === 0, { l1, l2 });
    // ---- assumptions ----
    const a = await p.evaluate(() => { const t = document.querySelector('[data-sec="assumptions"] table.pf-set'); return { head: [...t.querySelectorAll("th")].map((x) => x.textContent).filter(Boolean), groups: [...t.querySelectorAll("tr.cls")].map((r) => r.textContent), funding: [...t.querySelector('tr[data-row="funding"]').querySelectorAll("td")].map((c) => c.innerText.replace(/\s+/g, " ").trim()), fundCtl: t.querySelector('tr[data-row="funding"]').querySelectorAll('input, [role="radio"]').length + (/\(●\)/.test(t.querySelector('tr[data-row="funding"]').textContent) ? 1 : 0), marks: t.querySelectorAll("tr[data-row] .pf-a").length, rows: t.querySelectorAll("tr[data-row]").length, noChange: [...t.querySelectorAll("tr[data-row]")].filter((r) => !r.querySelector('[data-act="change"]')).map((r) => `${r.dataset.row}:${r.querySelectorAll("td")[2].textContent}`) }; });
    ck(`05 ASSUMPTIONS: ${a.head.join(" · ")}, grouped ${a.groups.join(" · ")}; each of its ${a.rows} rows carries the amber A; a row without a range shows "–" and no CHANGE (${a.noChange.join(", ")}); the funding of Tokyo names reads "${a.funding[1]}": the value, the field's why once, the other way muted with why it waits, no control (the designer's B.2 lead 5)`, a.head.join("|") === "Assumption|Value|Range|Basis|By|Since" && a.groups.join("|") === "Financing|Borrow|Margin|Costs" && a.marks === a.rows && a.rows >= 13 && a.noChange.length >= 2 && a.noChange.every((x) => /:(–|fixed)$/.test(x)) && a.funding[1] === "Yen from the prime broker the Tokyo longs are a yen debit; the capital stays in dollars Spot and a one-month forward, rolled monthly: not yet: currencies are not built" && a.funding[6] === "" && a.fundCtl === 0, a);
    // ---- renaming ----
    await p.click("#pf-rename"); await p.fill("#pf-rename-in", "Macro"); const taken = await text(p, '[data-row="name"] .pf-no');
    await p.fill("#pf-rename-in", "Tokyo long/short"); await p.click("#pf-rename-save"); await p.waitForFunction(() => document.querySelector("#pf-switch")?.textContent.startsWith("Tokyo long/short"));
    await pf(p, ID(1), "#pf-overview");
    const ren = await p.evaluate(() => ({ strip: document.querySelector("#pf-switch").textContent.trim(), acts: [...document.querySelectorAll("#pf-activity .act")].slice(0, 2).map((x) => x.innerText.replace(/\s+/g, " ").trim()) }));
    ck(`RENAME asks for no reason, refuses another open book's name ("${taken}"), and is a line of ACTIVITY: "${ren.acts[0]}"; the change of 17:0x stands under it with its reason whole`, taken === "you already have an open portfolio with this name" && ren.strip === "Tokyo long/short ▾" && /^17:0\d RENAMED Tokyo L\/S → Tokyo long\/short$/.test(ren.acts[0]) && /^17:0\d SETTING One name, long 10% → 8% · in force from Mon 23 Nov 2026, 06:00 SGT · "tighter into results season"$/.test(ren.acts[1]), { taken, ren });
    // ---- delete ----
    await pf(p, `${ID(1)}/settings/delete`, "#pf-delete");
    const d0 = await p.evaluate(() => ({ words: document.querySelector("#pf-delete p").textContent, open: document.querySelector("#pf-delete-open").textContent, border: getComputedStyle(document.querySelector("#pf-delete-open")).borderTopColor, input: !!document.querySelector("#pf-delete-in") }));
    await p.click("#pf-delete-open"); await p.waitForSelector("#pf-delete-in");
    const d1 = await p.evaluate(() => ({ ask: document.querySelector("#pf-delete .ask").textContent, value: document.querySelector("#pf-delete-in").value, go2: document.querySelector("#pf-delete-go").disabled }));
    await p.fill("#pf-delete-in", "tokyo"); const five = await p.locator("#pf-delete-wrong").count();
    await p.fill("#pf-delete-in", "tokyo long/short"); const wrong = await p.evaluate(() => ({ line: document.querySelector("#pf-delete-wrong")?.textContent ?? null, go2: document.querySelector("#pf-delete-go").disabled }));
    await p.fill("#pf-delete-in", " Tokyo long/short "); const exact = await p.evaluate(() => ({ line: !!document.querySelector("#pf-delete-wrong"), go2: document.querySelector("#pf-delete-go").disabled }));
    await p.evaluate(() => localStorage.setItem("om_mock_pf_refuse", "1")); await p.click("#pf-delete-go"); await p.waitForSelector("#pf-delete .pf-msg"); const df = await p.evaluate(() => ({ msg: document.querySelector("#pf-delete .pf-msg").textContent, books: JSON.parse(localStorage.getItem("om_mock_pf")).books.length })); await p.evaluate(() => localStorage.removeItem("om_mock_pf_refuse"));
    ck(`07 DELETE: "${d0.words}"; the button has a red outline and opens "${d1.ask}" with an empty input; "tokyo long/short" for "Tokyo long/short" cannot delete and reads "${wrong.line}" (not before six characters); a refusal says "${df.msg}"`, d0.words === "Delete this paper portfolio and everything in it: its settings and their history, and its notes. It cannot be undone." && d0.open === "DELETE THIS PORTFOLIO…" && d0.border === "rgb(255, 77, 66)" && !d0.input && d1.ask === "Type the portfolio's name to delete it: Tokyo long/short" && d1.value === "" && d1.go2
      && five === 0 && wrong.line === "that is not this portfolio's name" && wrong.go2 && !exact.line && !exact.go2 && df.msg === "Not deleted: stand-in failure. Nothing was removed." && df.books === 3, { d0, d1, five, wrong, exact, df });
    await p.click("#pf-delete-go"); await p.waitForSelector("#pf-list");
    const del = await p.evaluate(() => ({ hash: location.hash, flash: document.querySelector(".pf-flash")?.textContent ?? null, rows: document.querySelectorAll("#pf-list tbody tr").length, stored: (() => { const st = JSON.parse(localStorage.getItem("om_mock_pf")); return { books: st.books.map((x) => x.name), trace: JSON.stringify(st).includes("Tokyo long/short") || JSON.stringify(st).includes("tighter into results season"), agreed: Object.keys(st.consents).length }; })(), last: localStorage.getItem("om_pf_last") }));
    await pf(p, ID(1), "#pf-nosuch");
    const nosuch = await p.evaluate(() => ({ words: document.querySelector("#pf-nosuch").innerText.replace(/\s+/g, " ").trim(), link: document.querySelector("#pf-nosuch a").getAttribute("href") }));
    ck(`with the exact name it deletes: the list with "${del.flash}" at the foot, the book and everything in it gone from the store, the other two untouched and the agreement kept; its address then says "${nosuch.words}"`, del.hash === "#portfolio/all" && del.flash === "Paper portfolio deleted · Tokyo long/short" && del.rows === 2 && del.stored.books.join("|") === `${LONG_NAME}|Macro` && !del.stored.trace && del.stored.agreed === 1 && del.last === null && nosuch.words === `${NO_SUCH} ALL PORTFOLIOS ›` && nosuch.link === "#portfolio/all", { del, nosuch });
    await pf(p, `${ID(3)}/holdings`, "#pf-overview");
    const other = await p.evaluate(() => ({ view: document.querySelector(".pf-bookpage").dataset.view, book: document.querySelector(".pf-bookpage").dataset.book, ref: document.querySelector('#pf-book [data-cell="reference"]').innerText.replace(/\s+/g, " ").trim(), ladder: document.querySelector('#pf-book [data-cell="ladder"] .s').textContent }));
    ck(`a view of a book that is not built (…/holdings) opens its Overview; the macro book's Reference reads "${other.ref}" and its ladder "${other.ladder}"`, other.view === "overview" && other.book === ID(3) && /^reference 70\/30 blend PROXY · waits for its series$/i.test(other.ref) && other.ladder === "4/2/2 · yearly reset", other);
    ck("no error on the page through all of it", errs.length === 0, errs);
    await ctx.close();
  }
  {
    // the targets' window, and a book whose targets are fixed
    for (const [clock, label] of [[NOW, "21 Nov"], [DEC, "15 Dec"]]) {
      const { ctx, p, errs } = await open(b, { clock });
      await go(p, `portfolio/${ID(2)}/settings/targets`, "#pf-targets");
      const fx = await p.evaluate(() => ({ states: [...document.querySelectorAll('#pf-targets [data-row="target_x"] .pf-fixed, #pf-targets [data-row="target_vol"] .pf-fixed')].map((e) => e.textContent), reset: !!document.querySelector("#pf-reset"), next: !!document.querySelector("#pf-nextwindow"), x: document.querySelector('#pf-targets [data-row="target_x"] .v').innerText.replace(/\s+/g, " ").trim(), usd: document.querySelector('[data-sec="portfolio"] [data-row="nav"] .v').innerText.replace(/\s+/g, " ").trim(), region: document.querySelector('[data-sec="limits"] tr[data-row="region_max"]').innerText.replace(/\s+/g, " ").trim() }));
      ck(`on ${label} a book on "since the start" reads "fixed" beside both targets and offers no re-set (cash + 3.0%: "${fx.x.slice(-55)}")${clock === NOW ? `; its yen NAV carries its dollar line ("${fx.usd}") and its changed limit reads "${fx.region.slice(0, 50)}…"` : ""}`, fx.states.join() === "fixed,fixed" && !fx.reset && !fx.next && /^cash \+ 3\.0% a year = 4\.27% a year at TONA 1\.227% for 18 Nov 2026 \(Bank of Japan\)$/.test(fx.x)
        && (clock !== NOW || (/^10,000,000,000 JPY = USD 63\.1m at 158\.400, the 17:00 New York close of 9 Oct 2026 \(Yahoo Finance, unofficial\)$/.test(fx.usd) && /^The largest region ≤ 80% of gross 50–100% .* you Mon 12 Oct 2026 CHANGE$/.test(fx.region))) && errs.length === 0, { fx, errs });
      if (clock === DEC) {
        await pf(p, `${ID(1)}/settings/targets`, "#pf-reset");
        const w0 = await p.evaluate(() => ({ button: document.querySelector("#pf-reset").textContent, next: !!document.querySelector("#pf-nextwindow") }));
        await p.click("#pf-reset"); await p.waitForSelector("#pf-resetform");
        const pre = await p.evaluate(() => ({ x: document.querySelector("#pf-reset-x").value, vol: document.querySelector("#pf-reset-vol").value, lines: [...document.querySelectorAll("#pf-resetform .pf-line")].map((l) => l.textContent) }));
        await p.fill("#pf-reset-vol", "7.0"); await p.waitForTimeout(80); const high = await p.evaluate(() => ({ save: document.querySelector("#pf-reset-save").disabled, tie: document.querySelector("#pf-resetform #pf-tie")?.dataset.state }));
        await p.fill("#pf-reset-x", "6.0"); await p.fill("#pf-reset-vol", "5.5"); await p.waitForTimeout(80); await p.click("#pf-reset-save"); await p.waitForSelector("#pf-pending-targets");
        const w1 = await p.evaluate(() => ({ pending: document.querySelector("#pf-pending-targets").textContent, inForce: document.querySelector('#pf-targets [data-row="target_x"] .v').innerText.replace(/\s+/g, " ").trim(), again: !!document.querySelector("#pf-reset"), form: !!document.querySelector("#pf-resetform") }));
        await pf(p, ID(1), "#pf-overview"); const act = await p.evaluate(() => document.querySelector("#pf-activity .act").innerText.replace(/\s+/g, " ").trim());
        ck(`on 15 Dec the window is open: ${w0.button} with the two fields and the form's lines (${pre.lines.length}); 7.0% is refused there as in the form; a saved pair reads "${w1.pending}" while cash + 5.0% stays in force, can be replaced until the reset, and is a line of ACTIVITY ("${act.slice(6, 80)}")`, w0.button === "RE-SET FOR NEXT YEAR" && !w0.next && pre.x === "5.0" && pre.vol === "5.0" && pre.lines.length >= 4 && high.save && high.tie === "refused" && w1.pending === "pending for 2027: cash + 6.0% · 5.5%" && /^cash \+ 5\.0% a year/.test(w1.inForce) && w1.again && !w1.form
          && /SETTING Targets for 2027: cash \+ 6\.0% · 5\.5% · pending until the January reset$/.test(act), { w0, pre, high, w1, act });
      }
      await ctx.close();
    }
    // an address that names a section of Settings opens there, under the header
    for (const size of ["C1", "C3"]) {
      const at = await open(b, { size });
      await go(at.p, `portfolio/${ID(1)}/settings/limits`, "#pf-settings"); await at.p.waitForTimeout(300);
      const m = await at.p.evaluate(() => { const z = Number(document.body.style.zoom) || 1, sec = document.querySelector('[data-sec="limits"]').getBoundingClientRect(), bar = document.querySelector("#topbar").getBoundingClientRect(); return { gap: Math.round((sec.top - bar.bottom) / z), y: Math.round(scrollY), on: document.querySelector("#pf-goto a.on")?.textContent ?? null }; });
      await at.p.click('#pf-goto a[href$="/settings/assumptions"]'); await at.p.waitForTimeout(400);
      const m2 = await at.p.evaluate(() => { const z = Number(document.body.style.zoom) || 1, sec = document.querySelector('[data-sec="assumptions"]').getBoundingClientRect(), bar = document.querySelector("#topbar").getBoundingClientRect(); return { gap: Math.round((sec.top - bar.bottom) / z), hash: location.hash.split("/").pop() }; });
      ck(`${size}: #portfolio/<id>/settings/limits opens Settings at LIMITS, ${m.gap} px under the header (the page ${m.y} px down), with its GO TO chip lit; the ASSUMPTIONS chip goes to that panel's head (${m2.gap} px under the header)`, m.gap >= 0 && m.gap <= 16 && m.y > 100 && m.on === "LIMITS" && m2.gap >= 0 && m2.gap <= 16 && m2.hash === "assumptions" && at.errs.length === 0, { m, m2, errs: at.errs });
      await at.ctx.close();
    }
    // a second account sees none of it
    const two = await open(b, { ls: { om_mock_pf_account: "2" } });
    await go(two.p, "portfolio/all", "#pf-cards");
    const empty = await two.p.evaluate(() => ({ cards: document.querySelectorAll("#pf-cards a").length, list: !!document.querySelector("#pf-list"), stored: JSON.parse(localStorage.getItem("om_mock_pf")).books.length }));
    await pf(two.p, `${ID(1)}`, "#pf-nosuch"); const n1 = await text(two.p, "#pf-nosuch");
    await pf(two.p, `${ID(1)}/settings`, "#pf-nosuch"); const n2 = await text(two.p, "#pf-nosuch");
    await pf(two.p, "new", "#pf-create"); await two.p.click("#pf-create"); await two.p.waitForSelector("#pf-consent");
    ck(`a second stand-in account, with the first one's ${empty.stored} books in the same store, sees none of them: the starts in place of a list, "${n1}" at a book's address and at its Settings, and it is asked for the statement itself`, empty.cards === 3 && !empty.list && empty.stored === 3 && n1 === `${NO_SUCH} ALL PORTFOLIOS ›` && n2 === n1 && two.errs.length === 0, { empty, n1, n2, errs: two.errs });
    await two.ctx.close();
    // Settings at two more sizes, and the one-screen layout
    for (const size of ["C3", "C8"]) {
      const w = await open(b, { size });
      await go(w.p, `portfolio/${ID(1)}/settings`, "#pf-settings");
      await w.p.click('[data-sec="limits"] tr[data-row="gross"] [data-act="change"]'); await w.p.waitForSelector("#pf-change");
      const c = await cuts(w.p, "#pf-settings td, #pf-settings th, #pf-settings .pf-kv > *, #pf-change .ln, #pf-change-when, #pf-goto a, #pf-strip > *");
      await w.p.click('[data-sec="limits"] [data-tab="history"]'); await w.p.waitForSelector("table.pf-hist");
      const c2 = await cuts(w.p, "table.pf-hist td, table.pf-hist th");
      await go(w.p, `portfolio/${ID(2)}`, "#pf-overview");
      const c3 = await cuts(w.p, "#pf-overview td, #pf-overview .cell > *, #pf-strip > *, #pf-switch, #pf-overview .act > *, #pf-overview li, .phead > *");
      const order = await w.p.evaluate(() => [...document.querySelectorAll("#pf-overview .panel")].map((x) => ({ no: x.dataset.no, top: x.getBoundingClientRect().top })).sort((x, y) => x.top - y.top).map((x) => x.no).join(" "));
      ck(`${size}: no value, range or reason is cut in Settings, in the change form or in HISTORY, the 60-character name is whole in the strip, and nothing scrolls sideways${size === "C3" ? `; Overview in one column reads ${order}` : ""}`, c.cut.length === 0 && c.sideways <= 0 && c2.cut.length === 0 && c2.sideways <= 0 && c3.cut.length === 0 && c3.sideways <= 0 && (size !== "C3" || order === "01 03 02 04 05") && w.errs.length === 0, { c, c2, c3, order });
      await w.ctx.close();
    }
    const one = await open(b, { compact: true });
    await go(one.p, `portfolio/${ID(1)}/settings`, "#pf-settings");
    const sc = await one.p.evaluate(async () => { const g = document.querySelector("#grid"), z = Number(document.body.style.zoom) || 1; g.scrollTop = 600; await new Promise((r) => requestAnimationFrame(r)); const moved = g.scrollTop; g.scrollTop = 0;
      const first = document.querySelector("#pf-settings .panel"), body = first.querySelector(".pbody"); return { term: document.body.classList.contains("term"), tall: g.scrollHeight > g.clientHeight + 200, moved, page: document.documentElement.scrollHeight <= innerHeight + 1, header: Math.round(document.querySelector("#topbar").getBoundingClientRect().height / z), cutPanel: body.scrollHeight > body.clientHeight + 1, sideways: g.scrollWidth - g.clientWidth }; });
    ck(`in the one-screen layout the tab's pages are pages: the page itself scrolls under the header (${sc.header} px), the window does not, a panel keeps its natural height, and nothing scrolls sideways`, sc.term && sc.tall && sc.moved > 0 && sc.page && !sc.cutPanel && sc.sideways <= 0 && one.errs.length === 0, sc);
    await one.ctx.close();
  }

  console.log('\n[7] "personal use" at the end of every source line that names a JPX or Nikkei file, and Help\'s paragraph');
  {
    const { ctx, p, errs } = await open(b);
    await go(p, "equities/topix", "#eq-members-src");
    const tp = await p.evaluate(() => ({ short: document.querySelector("#eq-short-src").textContent, members: document.querySelector("#eq-members-src").textContent, color: getComputedStyle(document.querySelector("#eq-short-src .puse")).color }));
    await go(p, "equities/nk225", "#eq-members-src"); await p.waitForFunction(() => /Nikkei/.test(document.querySelector("#eq-members-src")?.textContent ?? ""), null, { timeout: 15000 }); const nk = await p.evaluate(() => ({ short: document.querySelector("#eq-short-src").textContent, members: document.querySelector("#eq-members-src").textContent }));
    await go(p, "equities/spx", '.panel[data-k="eq-screener"] table'); await p.waitForFunction(() => /^FINRA/.test(document.querySelector('.panel[data-k="eq-short"] .aux')?.textContent ?? ""), null, { timeout: 15000 }); const us = await p.evaluate(() => ({ any: document.querySelectorAll(".puse").length, short: (document.querySelector('.panel[data-k="eq-short"] .aux .src-long') ?? document.querySelector('.panel[data-k="eq-short"] .aux')).textContent }));
    await go(p, "asset/7203.T", "#st-short-src"); const st = await text(p, "#st-short-src");
    await go(p, "asset/NVDA", '.panel[data-k="st-short"]'); await p.waitForFunction(() => /exchange-reported|FINRA/.test(document.querySelector('.panel[data-k="st-short"] .aux')?.textContent ?? ""), null, { timeout: 15000 }); const nv = await p.evaluate(() => document.querySelectorAll(".puse").length);
    ck(`EQUITIES: TOPIX's SHORT INTEREST "${tp.short.slice(-52)}" and SCREENER "${tp.members}"; the Nikkei 225's "${nk.members}"; a Tokyo stock's SHORT INTEREST "${st}"; a US list and a US stock, which use neither publisher's files, carry no such line`, /^JPX short-selling ratio .* · personal use$/.test(tp.short) && tp.members === "members: JPX, list of TSE-listed issues (東証上場銘柄一覧) · personal use" && nk.short === tp.short && nk.members === "members and weights: Nikkei Inc., Nikkei 225 weights file · personal use" && st === "JPX short-position reports · personal use" && us.any === 0 && /^FINRA/.test(us.short) && nv === 0 && tp.color === "rgb(31, 209, 193)", { tp, nk, st, us, nv });
    await go(p, "asset/7203.T", "#st-short-src"); await p.click("#st-short-src .puse"); await p.waitForSelector("#help-personal-use");
    const hp = await p.evaluate(() => { const row = document.querySelector("#help-personal-use"), r = row.getBoundingClientRect(), box = document.querySelector(".helpbody").getBoundingClientRect(); return { k: row.querySelector("dt").textContent, v: row.querySelector("dd").textContent, inView: r.top >= box.top - 1 && r.bottom <= box.bottom + 1, marked: row.classList.contains("at") }; });
    ck(`the two words are teal and open Help at "${hp.k}", in view: the owner's paragraph word for word, then what is read today and what is not used`, hp.k === "Data sources · personal use" && hp.v.startsWith(`${PERSONAL} Read today: JPX's list of TSE-listed issues`) && /No JSF or fund issuer's file is read yet\. Not used, by the owner's decision of 21 Nov 2026: JPX's TOPIX weight file/.test(hp.v) && hp.inView && hp.marked && errs.length === 0, { hp, errs });
    await ctx.close();
  }

  console.log("\n[8] the page's own calls to the API, answered by the suite: a server with its switch off, the statement first, a refusal");
  {
    const { ctx, p, errs } = await open(b);
    await routes(p);
    const seen = []; let mode = "off", agreed = null;
    const consent = () => ({ version: 1, text: STATEMENT, label: "I agree", agreedAt: agreed });
    const facts = () => ({ today: "2026-11-21", nextSession: "2026-11-23", valuationDay: "2026-11-21", nyDate: "2026-11-21", rates: { USD: null, JPY: null }, usdjpy: null, cap: 5, open: 0, names: [], consent: consent() });
    await p.route("**/fakeapi?*", async (r) => {
      const rq = r.request(), a = new URL(rq.url()).searchParams.get("action");
      if (!/^(pf_|consent)/.test(a)) return r.fallback();
      let body = null; try { body = rq.postDataJSON(); } catch { body = null; }
      seen.push({ a, method: rq.method(), type: rq.headers()["content-type"] ?? null, body });
      const send = (status, json) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(json) });
      if (mode === "off") return send(404, { error: NOT_YET });
      if (a === "pf_list") return send(200, { rows: [], cap: 5, open: 0 });
      if (a === "pf_form") return send(200, facts());
      if (a === "consent_agree") { agreed = "2026-11-21T09:00:30.000Z"; return send(200, consent()); }
      if (a === "pf_create") return agreed ? send(400, { error: "the stand-in server refuses this." }) : send(409, { error: "the statement is not agreed", consent: consent() });
      return send(404, { error: NO_SUCH });
    });
    await go(p, "portfolio", "#pf-read-error", "", STANDIN);
    const off1 = await text(p, "#pf-read-error");
    await hop(p, "portfolio/new", "#pf-form-error"); const off2 = await text(p, "#pf-form-error");
    const posts = seen.filter((s) => s.method !== "GET").length;
    ck(`against a server whose switch is off (every route answers 404 "${NOT_YET}") the tab says "${off1}" and the form "${off2}"; the page has sent it nothing but reads`, off1 === "Your paper portfolios could not be read: Paper portfolios are not available yet. Nothing in them has changed. RETRY" && off2 === "The starts' defaults could not be read: Paper portfolios are not available yet. RETRY" && posts === 0 && seen.length >= 2, { off1, off2, seen: seen.map((s) => `${s.method} ${s.a}`) });
    mode = "on"; seen.length = 0;
    await p.click("#pf-form-error .pf-link"); await p.waitForSelector("#pf-create");
    const rate = await text(p, "#pf-equiv");
    await p.click("#pf-create"); await p.waitForSelector("#pf-consent");
    const asked = await p.evaluate(() => document.querySelector("#pf-statement").textContent);
    await p.check("#pf-consent input[type=checkbox]"); await p.click("#pf-continue"); await p.waitForSelector("#pf-create-msg");
    const msg = await text(p, "#pf-create-msg"), creates = seen.filter((s) => s.a === "pf_create"), agree = seen.find((s) => s.a === "consent_agree");
    ck(`RETRY reads the form's facts; with no rate stored the form says so ("${rate}") and prints no figure; CREATE asks the statement the server hands back, sends the agreement, and creates with the same request id as before`, rate === "= cash + 5.0% a year · the cash rate is not read yet" && asked === STATEMENT && agree?.method === "POST" && agree.body.version === 1 && creates.length === 1 && creates[0].method === "POST" && /application\/json/.test(creates[0].type ?? "") && /^[A-Za-z0-9_-]{8,64}$/.test(creates[0].body.requestId) && creates[0].body.start === "ar-ls-jp" && creates[0].body.name === "Equity L/S · Japan · 21 Nov 2026" && Object.keys(creates[0].body.values).length >= 38 && creates[0].body.values.nav === "100,000,000", { rate, agree, n: creates.length, body: creates[0]?.body && { ...creates[0].body, values: Object.keys(creates[0].body.values).length } });
    ck(`the server's refusal is shown in the page's sentence, without a doubled full stop: "${msg}", and the form is kept`, msg === "Not created: the stand-in server refuses this. Nothing was saved." && (await p.evaluate(() => document.querySelector("#pf-name").value)) === "Equity L/S · Japan · 21 Nov 2026" && errs.length === 0, { msg, errs });
    await ctx.close();
  }

  // RT-9: the change form prints the session the server will store. The book is read at 16:59:40 New York on Tue 24
  // Nov 2026 (its next session then: Wed 25 Nov); 17:00 passes with the page open; CHANGE is pressed after it and
  // reads the book again, so it prints Thu 26 Nov (Thanksgiving shuts New York, not Tokyo), as the save would store.
  console.log("\n[9] the change form's date after 17:00 New York has passed with the page open (RT-9)");
  {
    const { ctx, p, errs } = await open(b, { clock: "2026-11-24T21:59:40Z" });
    await go(p, `portfolio/${ID(1)}/settings/limits`, '[data-row="one_long"] [data-act="change"]');
    await p.waitForFunction(() => Date.now() >= Date.parse("2026-11-24T22:00:02Z"), null, { timeout: 45000, polling: 250 });
    await p.click('[data-row="one_long"] [data-act="change"]'); await p.waitForSelector("#pf-change-when");
    await p.waitForFunction(() => /Thu 26 Nov 2026/.test(document.querySelector("#pf-change-when")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => undefined);
    const when = await text(p, "#pf-change-when");
    ck(`opened after 17:00 New York, CHANGE prints the session the server will store: "${when}" (the book was read at 16:59:40, when the next session was Wed 25 Nov)`, when === "In force from Thu 26 Nov 2026, 06:00 SGT" && errs.length === 0, { when, errs });
    await ctx.close();
  }

  await b.close();
  console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
