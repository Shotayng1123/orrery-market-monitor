// The paper portfolio as a preview for one account (slice 9, 23 Nov 2026: the owner's "Yeah just turn on for me for now
// and you can keep refining them"), on the local copy (5179). The published page learns it from the server's `me`
// (lib/paper.ts); the local copy stands in for an account in the server's list with `om_paper = "preview"`. Nothing
// here reads the machine's clock: every page sets `om_mock_now`. A computer is 1440x900 (C1), a phone an iPhone 13 (P2)
// or an iPhone SE (P1); what must have room is measured in the machine's fonts and once with a wide font forced.
//   [1] the stand-in preview account: the seventh tab and bar item, key 7, and on every screen of the tab its first line
//       says it is a preview: on a computer the whole sentence, on a phone one line whose tap opens it in a sheet
//   [2] the statement still comes first: a first CREATE asks for it, with the line on the page
//   [3] Help says it, first in its Portfolio part; the classic phone layout's one-line page carries the line too
//   [4] the other states draw no line: the switch on (the local copy's default) has the tab without it; an account
//       outside the list (`om_paper = "0"`) has six tabs, #portfolio opens MARKETS, and the screens' file is not asked
// The site as published, with the server's own answer, is checked by local-copy.cjs.
// Run from web/:  node e2e/run.cjs pf-preview   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const fs = require("fs"), path = require("path");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 2000)}`); };
const NOW = "2026-11-21T09:00:00Z";
const WIDE = "*{font-family:monospace!important}";
const PHONES = { P1: "iPhone SE (3rd gen)", P2: "iPhone 13" };
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const src = fs.readFileSync(path.join(__dirname, "..", "src", "components", "pf", "Preview.tsx"), "utf8");
const word = (name) => { const m = new RegExp(`export const ${name} = "((?:[^"\\\\]|\\\\.)*)";`).exec(src); if (!m) throw new Error(`${name} not found in Preview.tsx`); return JSON.parse(`"${m[1]}"`); };
const TEXT = word("PREVIEW_TEXT"), SHORT = word("PREVIEW_SHORT");

async function open(b, { phone = null, ls = {}, width } = {}) {
  const dev = phone ? devices[PHONES[phone]] : null;
  const ctx = await b.newContext(dev ? { ...dev, deviceScaleFactor: 1, ...(width ? { viewport: { width, height: dev.viewport.height } } : {}) } : { viewport: { width: width ?? 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([at, more]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_a2hs_hide", "1"); for (const [k, v] of Object.entries(more)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v); } catch {} }, [NOW, ls]);
  const p = await ctx.newPage(); const errs = [], files = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("request", (r) => files.push(r.url()));
  return { ctx, p, errs, files };
}
const settle = async (p, ms = 250) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(ms); };
const go = async (p, hash, sel, q = "") => { await p.goto(MOCK + q + "#" + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p); };
// the preview line as drawn: its words, whether it is the tab's first line (the first of the grid's children, and every
// other child below its foot), its height and lines, and whether anything of it is cut or the page scrolls sideways
const line = (p) => p.evaluate(() => {
  const e = document.querySelector("#pf-preview"); if (!e) return null;
  const grid = document.querySelector("#grid"), R = e.getBoundingClientRect(), tx = e.querySelector(".tx") ?? e;
  const others = [...grid.children].filter((c) => c !== e && c.getBoundingClientRect().height > 0);
  const rg = document.createRange(); rg.selectNodeContents(tx);
  return { text: e.innerText.replace(/\s+/g, " ").trim(), mark: e.querySelector(".pf-paper")?.textContent ?? null, first: grid.firstElementChild === e && others.every((c) => c.getBoundingClientRect().top >= R.bottom - 0.5),
    h: Math.round(R.height * 10) / 10, lines: new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size, cut: tx.scrollWidth > tx.clientWidth + 1 || e.scrollWidth > e.clientWidth + 1,
    inside: R.left >= -0.5 && R.right <= innerWidth + 0.5, sideways: document.documentElement.scrollWidth - innerWidth, tag: e.tagName, view: grid.dataset.view };
});

(async () => {
  const b = await chromium.launch();

  console.log("\n[1] the stand-in preview account: the tab, and the preview line first on every screen of it");
  {
    const { ctx, p, errs } = await open(b, { ls: { om_paper: "preview" } });
    await go(p, "market", "#nav a");
    const tabs = await p.evaluate(() => [...document.querySelectorAll("#nav a")].map((a) => a.textContent));
    await p.keyboard.press("7"); await p.waitForSelector("#pf-preview", { timeout: 15000 }); await settle(p);
    const k7 = await p.evaluate(() => ({ hash: location.hash, view: document.querySelector("#grid").dataset.view }));
    ck(`a computer: seven tabs (${tabs.join(" · ")}), key 7 opens PORTFOLIO (${k7.hash})`, tabs.length === 7 && tabs[6] === "PORTFOLIO" && k7.hash === "#portfolio" && k7.view === "portfolio", { tabs, k7 });
    const bad = [], seen = [];
    for (const [hash, sel, q] of [["portfolio", "#pf-cards", "?mock=empty"], ["portfolio/all", "#pf-list"], [`portfolio/${ID(1)}`, "#pf-overview"], [`portfolio/${ID(1)}/settings`, "#pf-settings"], ["portfolio/new/ar-ls-jp", "#pf-create"], [`portfolio/${ID(99)}`, "#pf-nosuch"]]) {
      await go(p, hash, sel, q); const l = await line(p); seen.push(hash + (q ?? ""));
      if (!l || !l.first || l.mark !== "PREVIEW" || l.text !== `PREVIEW ${TEXT}` || l.tag !== "P" || !l.inside || l.sideways > 0) bad.push({ hash, q, l });
    }
    // the server refusing while the page is in the preview (its list removed after the page was opened): the tab says so
    await p.evaluate(() => localStorage.setItem("om_mock_pf_off", "1")); await go(p, "portfolio/all", "#pf-read-error"); const off = await line(p); seen.push("refused");
    if (!off || !off.first) bad.push({ hash: "refused", off });
    await p.evaluate(() => localStorage.removeItem("om_mock_pf_off"));
    ck(`a computer: on each of ${seen.length} screens (with no book, the list, a book's Overview and Settings, the form, an address that is not the account's, the server refusing) the first line is "PREVIEW ${TEXT.slice(0, 48)}…", the whole sentence, inside the window`, bad.length === 0 && errs.length === 0, { bad, errs });
    await ctx.close();
  }
  for (const code of ["P2", "P1"]) {
    const { ctx, p, errs } = await open(b, { phone: code, ls: { om_paper: "preview" } });
    await go(p, "market", "#pnav a");
    const items = await p.evaluate(() => [...document.querySelectorAll("#pnav a")].map((a) => a.getAttribute("aria-label") ?? a.textContent));
    const bad = [], hs = [];
    for (const [hash, sel, q] of [["portfolio", "#pf-cards", "?mock=empty"], ["portfolio/all", "#pf-list"], [`portfolio/${ID(1)}`, "#pf-overview"], [`portfolio/${ID(1)}/settings`, "#pf-settings"], ["portfolio/new/ar-ls-jp", "[data-step=start]"], ["portfolio/new/ar-ls-jp/review", "#pf-create"], ["portfolio/new/ar-ls-jp/edit/limits", "[data-step=edit]"], [`portfolio/${ID(99)}`, "#pf-nosuch"]]) {
      await go(p, hash, sel, q); const l = await line(p); hs.push(l?.h);
      if (!l || !l.first || l.mark !== "PREVIEW" || l.text !== `PREVIEW ${SHORT} ›` || l.tag !== "BUTTON" || l.lines !== 1 || l.h !== 44 || l.cut || !l.inside || l.sideways > 0) bad.push({ hash, q, l });
    }
    ck(`${PHONES[code]}: the bar's seventh item is Portfolio; on each of 8 screens of the tab (with no book, the list, Overview, Settings, the form's start, Review, a section, an address not the account's) the first line is "PREVIEW ${SHORT} ›", one line in a tap of 44 px (${[...new Set(hs)].join(", ")}), nothing of it cut`, items.length === 7 && items[6] === "Portfolio" && bad.length === 0 && errs.length === 0, { items, bad, errs });
    if (code === "P2") {
      await go(p, `portfolio/${ID(1)}`, "#pf-overview");
      await p.locator("#pf-preview").tap(); await p.waitForSelector(".sheet", { timeout: 5000 }); await p.waitForTimeout(300);
      const sh = await p.evaluate(() => ({ title: document.querySelector(".sheet-head .t")?.textContent ?? null, words: [...document.querySelectorAll(".sheet .pf-sheet-p")].map((x) => x.textContent) }));
      await p.locator(".sheet-head .x").tap(); await p.waitForTimeout(350);
      const after = await p.evaluate(() => ({ sheet: !!document.querySelector(".sheet"), hash: location.hash }));
      ck(`a tap on the line opens a sheet "${sh.title}" with the whole sentence; its ✕ closes it on the same page`, sh.title === "Preview" && sh.words.length === 1 && sh.words[0] === TEXT && !after.sheet && after.hash === `#portfolio/${ID(1)}`, { sh, after });
    } else {
      // a wide font forced: the line keeps its box, whole, wrapping inside it where it must
      await go(p, `portfolio/${ID(1)}`, "#pf-overview"); await p.addStyleTag({ content: WIDE }); await settle(p, 300);
      const w = await line(p);
      ck(`${PHONES[code]}, a wide font forced: the line stays first, in its 44-px tap (${w?.h} px, ${w?.lines} line${w?.lines === 1 ? "" : "s"}), nothing of it cut, nothing sideways`, !!w && w.first && w.h === 44 && w.lines <= 2 && !w.cut && w.inside && w.sideways <= 0, w);
    }
    await ctx.close();
  }

  console.log("\n[2] the statement still comes first");
  for (const phone of [null, "P2"]) {
    const { ctx, p, errs } = await open(b, { phone, ls: { om_paper: "preview" } });
    await go(p, phone ? "portfolio/new/ar-ls-jp/review" : "portfolio/new/ar-ls-jp", "#pf-create", "?mock=empty");
    await p.locator("#pf-create").click(); await p.waitForSelector("#pf-consent", { timeout: 8000 }); await p.waitForTimeout(300);
    const c = await p.evaluate(() => ({ statement: document.querySelector("#pf-statement")?.textContent ?? "", line: !!document.querySelector("#pf-preview") }));
    await p.locator("#pf-notnow").click(); await p.waitForTimeout(350);
    const msg = await p.evaluate(() => document.querySelector("#pf-create-msg")?.textContent ?? null);
    ck(`${phone ? PHONES[phone] : "a computer"}: in the preview a first CREATE still asks for the statement (its words: "${c.statement.slice(0, 44)}…") with the preview line on the page; NOT NOW creates nothing ("${msg}")`, /^Private notes, levels and paper portfolios are kept for your account only\./.test(c.statement) && c.line && msg === "Not created: the statement was not agreed." && errs.length === 0, { c, msg, errs });
    await ctx.close();
  }

  console.log("\n[3] Help, and the classic phone layout");
  {
    const { ctx, p, errs } = await open(b, { ls: { om_paper: "preview" } });
    await go(p, "market", "#help-ctl"); await p.click("#help-ctl"); await p.waitForSelector(".helpbox");
    const h = await p.evaluate(() => { const sec = [...document.querySelectorAll(".helpsec")].find((s) => s.querySelector("h4")?.textContent === "Portfolio"); const dt = sec ? [...sec.querySelectorAll("dt")] : []; return { keys: [...document.querySelectorAll(".helpsec dt")].find((d) => d.textContent === "Keys")?.nextElementSibling?.textContent ?? "", first: dt[0]?.textContent ?? null, words: dt[0]?.nextElementSibling?.textContent ?? "", rows: dt.length }; });
    ck(`Help: "${h.keys}"; its Portfolio part opens with "${h.first}": only your account sees it, its rules are still being built, a book made now may be reset, the statement is still asked`, /^1 to 7 switch tabs/.test(h.keys) && h.first === "Preview" && /only your account sees it/.test(h.words) && /still being built/.test(h.words) && /may be reset/.test(h.words) && /statement is still asked once/.test(h.words) && h.rows === 7 && errs.length === 0, { h, errs });
    await ctx.close();
    const cl = await open(b, { phone: "P2", ls: { om_paper: "preview", om_phone_v2: "0" } });
    await go(cl.p, "portfolio", "#pf-classic");
    const c = await cl.p.evaluate(() => ({ line: document.querySelector("#pf-preview")?.innerText.replace(/\s+/g, " ").trim() ?? null, tabs: [...document.querySelectorAll("#nav a")].map((a) => a.textContent), above: (document.querySelector("#pf-preview")?.getBoundingClientRect().bottom ?? 1e9) <= document.querySelector("#pf-classic").getBoundingClientRect().top + 0.5 }));
    ck(`the classic phone layout: seven tabs, and the one-line page under the preview line ("${c.line}")`, c.tabs.length === 7 && c.line === `PREVIEW ${SHORT} ›` && c.above && cl.errs.length === 0, { c, errs: cl.errs });
    await cl.ctx.close();
  }

  console.log("\n[4] the other states draw no preview line");
  {
    const { ctx, p, errs } = await open(b);
    await go(p, "portfolio/all", "#pf-list");
    const on = await p.evaluate(() => ({ tabs: document.querySelectorAll("#nav a").length, line: !!document.querySelector("#pf-preview") }));
    await p.click("#help-ctl"); await p.waitForSelector(".helpbox");
    const help = await p.evaluate(() => [...document.querySelectorAll(".helpsec")].find((s) => s.querySelector("h4")?.textContent === "Portfolio")?.querySelector("dt")?.textContent ?? null);
    ck(`the switch on (the local copy's default): the seventh tab and the list, no preview line, and Help's Portfolio part without the Preview row (it opens with "${help}")`, on.tabs === 7 && !on.line && help !== null && help !== "Preview" && errs.length === 0, { on, help, errs });
    await ctx.close();
  }
  for (const phone of [null, "P2"]) {
    const { ctx, p, errs, files } = await open(b, { phone, ls: { om_paper: "0" } });
    await go(p, "portfolio/new", phone ? "#pnav a" : "#nav a");
    if (!phone) { await p.keyboard.press("7"); await p.waitForTimeout(300); }
    const v = await p.evaluate((phone) => ({ tabs: document.querySelectorAll(phone ? "#pnav a" : "#nav a").length, view: document.querySelector("#grid").dataset.view, hash: location.hash, line: !!document.querySelector("#pf-preview"), word: /portfolio/i.test(document.body.innerText) }), !!phone);
    const asked = files.filter((u) => /\/views\/Portfolio|\/components\/pf\//.test(u));
    ck(`${phone ? PHONES[phone] : "a computer"}, an account outside the list: ${v.tabs} ${phone ? "items" : "tabs"}, #portfolio/new shows MARKETS${phone ? "" : ", key 7 does nothing"}, no "Portfolio" on the page, and the screens' files are not asked for (${asked.length})`, v.tabs === 6 && v.view === "market" && v.hash === "#portfolio/new" && !v.line && !v.word && asked.length === 0 && errs.length === 0, { v, asked, errs });
    await ctx.close();
  }

  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
