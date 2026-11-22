// NEW PAPER PORTFOLIO, a book just made, and PORTFOLIO's own file, after the verdicts of round 3b (22 Nov 2026:
// D/verdict-r3b.md's "not yet" items), on the local copy (5179), whose stand-in store keeps its books in this browser.
// Nothing here reads the machine's clock: every page sets `om_mock_now` (Sat 21 Nov 2026, 17:00 SGT). A computer is
// 1440x900 (C1); a phone an iPhone 13 (P2) or an iPhone SE (P1).
//   [1] UI-4: one draft per start and account: the finding's three cases end with the typed values back and the line;
//       a change of start asks only about settings, and says the name stays
//   [2] UI-17: "N settings changed from the defaults" lists them on a click (C1); on a phone a 44-px row opens the
//       sheet CHANGED FROM THE DEFAULTS, whose Edit › opens the setting's screen with its row in view
//   [3] RT-5 / UI-9: a name is shown as it will be stored once its field is left (the form, RENAME, DELETE), and a
//       name with an invisible character is refused naming it
//   [4] B.2 lead 6: no line over the page after CREATE: the BOOK card's created line is lit for six seconds and a
//       status the eye does not see says it (C1, P2)
//   [5] B.2's small words: the ladder's link "the whole rule" / "hide the whole rule"; the line under NOT BUILT YET;
//       on a phone the VaR limit's unit beside its box, "warning at 80% of it" under it
//   [6] DC-4: a page that cannot load PORTFOLIO's file says what it knows, with UPDATE or RELOAD (C1, P2)
// Run from web/:  node e2e/run.cjs pf-verdicts-forms   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 2000)}`); };
const NOW = "2026-11-21T09:00:00Z";
const PHONES = { P1: "iPhone SE (3rd gen)", P2: "iPhone 13" };
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function open(b, { phone = null, clock = NOW, ls = {} } = {}) {
  const dev = phone ? devices[PHONES[phone]] : null;
  const ctx = await b.newContext(dev ? { ...dev, deviceScaleFactor: 1 } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([at, more]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_a2hs_hide", "1"); for (const [k, v] of Object.entries(more)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v); } catch {} }, [clock, ls]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  return { ctx, p, errs };
}
const settle = async (p, ms = 250) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(ms); };
const go = async (p, hash, sel, q = "") => { await p.goto(MOCK + q + "#" + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p); };
const hop = async (p, hash, sel) => {
  await p.evaluate((h) => new Promise((res) => { const drawn = () => requestAnimationFrame(() => requestAnimationFrame(() => res())); if (location.hash === `#${h}`) drawn(); else { addEventListener("hashchange", drawn, { once: true }); location.hash = h; } }), hash);
  if (sel) await p.waitForSelector(sel, { timeout: 15000 });
  await settle(p);
};
const val = (p, key) => p.evaluate((k) => document.querySelector(`input[data-key="${k}"]`)?.value ?? null, key);
const typeIn = async (p, key, v) => { await p.fill(`input[data-key="${key}"]`, v); await p.locator(`input[data-key="${key}"]`).blur(); await p.waitForTimeout(60); };
const state = (p) => p.evaluate(() => ({ hash: location.hash, start: document.querySelector('#pf-starts .pf-chip.on, .pfp-start.on')?.dataset.start ?? null, name: document.querySelector("#pf-name")?.value ?? null, line: document.querySelector("#pf-draft")?.innerText.replace(/\s+/g, " ").trim() ?? null }));

(async () => {
  const b = await chromium.launch();
  try {
    console.log("\n[1] UI-4: one draft per start and account");
    {
      const { ctx, p, errs } = await open(b);
      // (a) the Japan card, then Global macro, a name and two limits, Back, Forward
      await go(p, "portfolio", '#pf-cards a[data-start="ar-ls-jp"]', "?mock=empty");
      await p.click('#pf-cards a[data-start="ar-ls-jp"]'); await p.waitForSelector("#pf-name");
      await p.click('#pf-starts [data-start="ar-macro"]'); await settle(p, 300);
      await p.fill("#pf-name", "Macro, my own"); await p.locator("#pf-name").blur(); await typeIn(p, "one_long", "7"); await typeIn(p, "floor", "15"); await settle(p, 200);
      await p.goBack(); await settle(p, 500); const backA = { ...(await state(p)), one: await val(p, "one_long") };
      await p.goForward(); await settle(p, 500); const fwdA = { ...(await state(p)), one: await val(p, "one_long"), floor: await val(p, "floor") };
      ck(`(a) Back from Global macro to the Japan start's address: the Japan start with its defaults and the name typed ("${backA.name}", one name ${backA.one}); Forward: Global macro with its own values back (${fwdA.one}, ${fwdA.floor}) and "${fwdA.line}"`,
        backA.hash === "#portfolio/new/ar-ls-jp" && backA.start === "ar-ls-jp" && backA.name === "Macro, my own" && backA.one === "10" && fwdA.hash === "#portfolio/new/ar-macro" && fwdA.start === "ar-macro" && fwdA.name === "Macro, my own" && fwdA.one === "7" && fwdA.floor === "15" && fwdA.line === "Your unsaved settings from 17:00 SGT are back · START AGAIN" && errs.length === 0, { backA, fwdA, errs });
      // (c) a change of start with settings changed asks, names only the settings, and the name stays
      await p.click('#pf-starts [data-start="ar-ls-gl"]'); await settle(p, 200);
      const ask = await p.evaluate(() => document.querySelector("#pf-ask")?.innerText.replace(/\s+/g, " ").trim() ?? null);
      await p.click("#pf-ask button:last-child"); await settle(p, 300); const toGl = await state(p);
      ck(`(c) Global macro with two changed settings, Equity long/short · Global picked: "${ask}"; CHANGE: the Global start, the name "${toGl.name}"`, ask === "Change the start? Your 2 changed settings go back to the new start's defaults. Your name stays. KEEP CHANGE" && toGl.hash === "#portfolio/new/ar-ls-gl" && toGl.name === "Macro, my own", { ask, toGl });
      // (b) only refused values on the Global start: kept, with their sentences, after MARKETS and back
      await typeIn(p, "one_long", "99"); await typeIn(p, "nav", "5m"); await settle(p, 150);
      await hop(p, "market", null); await settle(p, 400); await hop(p, "portfolio/new/ar-ls-gl", "#pf-name"); await settle(p, 300);
      const b1 = { ...(await state(p)), one: await val(p, "one_long"), nav: await p.evaluate(() => document.querySelector('[data-key="nav"]')?.value ?? null), no: await p.evaluate(() => [...document.querySelectorAll(".pf-no")].map((x) => x.textContent)), count: await p.evaluate(() => document.querySelector("#pf-count").textContent) };
      ck(`(b) two refused values only (one name 99, starting NAV 5m), MARKETS and back: both typed values are back with their sentences (${b1.no.join("; ")}), "${b1.count}", and "${b1.line}"`, b1.one === "99" && b1.nav === "5,000,000" && b1.no.includes("between 3% and 25%") && b1.no.includes("between USD 10m and USD 1bn") && b1.count === "2 settings out of range" && b1.line === "Your unsaved settings from 17:00 SGT are back · START AGAIN" && errs.length === 0, { b1, errs });
      // the drafts belong to this account: one object, three starts at most, no other account's
      const kept = await p.evaluate(() => JSON.parse(sessionStorage.getItem("om_pf_draft") ?? "null"));
      ck(`the drafts are one record of this account (${kept?.who}), one draft per start (${Object.keys(kept?.starts ?? {}).join(", ")}), and the name typed`, kept?.v === 2 && kept.who === "stand-in account 1" && Object.keys(kept.starts).sort().join() === "ar-ls-gl,ar-macro" && kept.name === "Macro, my own", kept);
      await ctx.close();
    }
    {
      // the phone: a section's screen, Back to another start, and Forward again
      const { ctx, p, errs } = await open(b, { phone: "P2" });
      await go(p, "portfolio/new/ar-ls-jp", "#pf-name", "?mock=empty");
      await p.locator('.pfp-start[data-start="ar-macro"]').tap(); await settle(p, 300);
      await p.fill("#pf-name", "Macro, my own"); await p.locator("#pf-name").blur();
      await hop(p, "portfolio/new/ar-macro/edit/limits", 'input[data-key="one_long"]'); await typeIn(p, "one_long", "7");
      await p.goBack(); await settle(p, 300); await p.goBack(); await settle(p, 500); const back = await state(p);
      await p.goForward(); await settle(p, 500); const fwd = await state(p);
      await hop(p, "portfolio/new/ar-macro/edit/limits", 'input[data-key="one_long"]'); const one = await val(p, "one_long");
      ck(`P2: two Backs from Global macro's limits screen lead to the Japan start with its defaults and the name ("${back.name}"); Forward: Global macro, "${fwd.line}", and one name long ${one}`, back.hash === "#portfolio/new/ar-ls-jp" && back.start === "ar-ls-jp" && back.name === "Macro, my own" && fwd.hash === "#portfolio/new/ar-macro" && fwd.line === "Your unsaved settings from 17:00 SGT are back · START AGAIN" && one === "7" && errs.length === 0, { back, fwd, one, errs });
      await ctx.close();
    }

    console.log("\n[2] UI-17: the changed settings, listed");
    {
      const { ctx, p, errs } = await open(b);
      await go(p, "portfolio/new/ar-ls-jp", "#pf-name");
      await typeIn(p, "one_long", "8"); await p.click('[data-row="base"] .pf-chip[data-value="JPY"]'); await settle(p, 150);
      const btn = await p.evaluate(() => { const c = document.querySelector("#pf-changedcount"); return { tag: c.tagName, text: c.textContent, exp: c.getAttribute("aria-expanded") }; });
      await p.click("#pf-changedcount"); await settle(p, 100);
      const list = await p.evaluate(() => [...document.querySelectorAll("#pf-changedlist li")].map((l) => l.textContent));
      await p.click('#pf-changedlist li[data-key="one_long"] button'); await settle(p, 200);
      const focus = await p.evaluate(() => document.activeElement?.dataset?.key ?? null);
      ck(`C1: "${btn.text}" is a button; a click lists ${list.map((x) => `"${x}"`).join(", ")}; a row's click focuses its field (${focus})`, btn.tag === "BUTTON" && btn.text === "2 settings changed from the defaults" && btn.exp === "false" && list.join("|") === "Base currency · USD → JPY|One name, long · 10% → 8%" && focus === "one_long" && errs.length === 0, { btn, list, focus, errs });
      await ctx.close();
    }
    {
      const { ctx, p, errs } = await open(b, { phone: "P2" });
      await go(p, "portfolio/new/ar-ls-jp/edit/limits", 'input[data-key="one_long"]');
      await typeIn(p, "one_long", "8"); await typeIn(p, "gross", "180");
      await hop(p, "portfolio/new/ar-ls-jp", "#pf-changedcount");
      const row = await p.evaluate(() => { const c = document.querySelector("#pf-changedcount"), r = c.getBoundingClientRect(); return { tag: c.tagName, text: c.textContent, h: Math.round(r.height) }; });
      await p.locator("#pf-changedcount").tap(); await p.waitForSelector("#pf-changed-sheet"); await settle(p, 300);
      const sheet = await p.evaluate(() => ({ title: document.querySelector("#pf-changed-sheet .sheet-head .t").textContent, upper: getComputedStyle(document.querySelector("#pf-changed-sheet .sheet-head .t")).textTransform, rows: [...document.querySelectorAll("#pf-changed-sheet .pfp-chg")].map((r) => ({ t: r.innerText.replace(/\s+/g, " ").trim(), h: Math.round(r.getBoundingClientRect().height) })) }));
      await p.locator('#pf-changed-sheet .pfp-chg[data-key="gross"]').tap(); await p.waitForFunction(() => /edit\/limits$/.test(location.hash) && !document.querySelector("#pf-changed-sheet"), null, { timeout: 8000 }); await settle(p, 500);
      const at = await p.evaluate(() => { const r = document.querySelector('[data-row="gross"]').getBoundingClientRect(); return { hash: location.hash, top: Math.round(r.top), focus: document.activeElement?.dataset?.key ?? null }; });
      await hop(p, "portfolio/new/ar-ls-jp/review", "#pf-changedcount"); const rev = await p.evaluate(() => ({ text: document.querySelector("#pf-changedcount").textContent, h: Math.round(document.querySelector("#pf-changedcount").getBoundingClientRect().height) }));
      ck(`P2: the start screen's "${row.text}" is a ${row.h}-px row; a tap opens the sheet ${sheet.title} (${sheet.upper}) with ${sheet.rows.map((r) => `"${r.t}"`).join(", ")}; Edit › opens ${at.hash.split("/").pop()} with that row ${at.top} px down, its field focused; Review has the same ${rev.h}-px row`,
        row.tag === "BUTTON" && row.text === "2 settings changed from the defaults" && row.h >= 44 && sheet.upper === "uppercase" && /^Changed from the defaults$/i.test(sheet.title) && sheet.rows.map((r) => r.t).join("|") === "One name, long · 10% → 8% Edit ›|Gross · ≤ 200% → ≤ 180% Edit ›" && sheet.rows.every((r) => r.h >= 44)
        && at.hash === "#portfolio/new/ar-ls-jp/edit/limits" && at.top >= 0 && at.top <= 200 && at.focus === "gross" && rev.text === row.text && rev.h >= 44 && errs.length === 0, { row, sheet, at, rev, errs });
      await ctx.close();
    }

    console.log("\n[3] RT-5 / UI-9: a name as it will be stored, and the character refused");
    {
      const { ctx, p, errs } = await open(b);
      await go(p, "portfolio/new/ar-ls-jp", "#pf-name");
      await p.fill("#pf-name", "Tokyo   L/S  two "); await p.locator("#pf-name").blur(); await settle(p, 100);
      const shown = await p.inputValue("#pf-name");
      await p.fill("#pf-name", "Tokyo​L/S"); await p.locator("#pf-name").blur(); await settle(p, 100);
      const no = await p.evaluate(() => ({ no: document.querySelector("#pf-name-no")?.textContent ?? null, create: document.querySelector("#pf-create").disabled }));
      await go(p, `portfolio/${ID(1)}/settings/portfolio`, "#pf-rename");
      await p.click("#pf-rename"); await p.fill("#pf-rename-in", "Tokyo   L/S   book"); await p.locator("#pf-rename-in").blur(); await settle(p, 100);
      const renamed = await p.inputValue("#pf-rename-in");
      await p.fill("#pf-rename-in", "Tokyo⁦L/S"); await settle(p, 100); const renNo = await p.evaluate(() => document.querySelector('[data-row="name"] .pf-no')?.textContent ?? null);
      await go(p, `portfolio/${ID(1)}/settings/delete`, "#pf-delete-open");
      await p.click("#pf-delete-open"); await p.fill("#pf-delete-in", "Tokyo    L/S"); await p.locator("#pf-delete-in").blur(); await settle(p, 100);
      const del = await p.evaluate(() => ({ v: document.querySelector("#pf-delete-in").value, can: !document.querySelector("#pf-delete-go").disabled }));
      ck(`the name field shows "${shown}" once left; "Tokyo" + U+200B + "L/S" is refused: "${no.no}" (CREATE off); RENAME shows "${renamed}" once left and refuses U+2066 by name ("${renNo}"); DELETE shows "${del.v}" and takes it`,
        shown === "Tokyo L/S two" && no.no === "a name cannot hold invisible characters (here U+200B)" && no.create && renamed === "Tokyo L/S book" && renNo === "a name cannot hold invisible characters (here U+2066)" && del.v === "Tokyo L/S" && del.can && errs.length === 0, { shown, no, renamed, renNo, del, errs });
      await ctx.close();
    }

    console.log("\n[4] B.2 lead 6: a book just made, said without a line over the page");
    for (const phone of [null, "P2"]) {
      const { ctx, p, errs } = await open(b, { phone });
      await go(p, "portfolio/new/ar-ls-jp", "#pf-name");
      if (phone) { await p.locator("#pf-review").tap(); await p.waitForSelector("#pf-create"); await p.locator("#pf-create").tap(); } else await p.click("#pf-create");
      const t0 = Date.now(); await p.waitForSelector("#pf-overview");
      const seen = [];
      for (const at of [500, 3000, 5500, 6800]) {
        await p.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
        seen.push({ at, ...(await p.evaluate(() => {
          const st = document.querySelector('#pf-made[role="status"]'), sr = st?.getBoundingClientRect(), nav = document.querySelector("#pnav")?.getBoundingClientRect().top ?? Infinity;
          let over = 0, n = 0;
          for (const el of document.querySelectorAll("#pf-overview .panel *, #pf-overview .mp-sec *")) {
            if (![...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim())) continue;
            const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cy < 0 || cy >= innerHeight || cx < 0 || cx >= innerWidth || cy >= nav) continue;
            n++; const hit = document.elementFromPoint(cx, cy), panel = el.closest(".panel, .mp-sec"); if (!hit || !panel.contains(hit)) over++;
          }
          const lit = document.querySelector("#pf-created");
          return { said: st?.textContent ?? null, w: sr ? sr.width : null, h: sr ? sr.height : null, lit: !!lit?.classList.contains("lit"), litColor: lit ? getComputedStyle(lit).color : null, flash: !!document.querySelector(".pf-flash"), n, over };
        })) });
      }
      const during = seen.slice(0, 3), after = seen[3];
      ck(`${phone ? "P2" : "C1"}: at 0.5, 3 and 5.5 s after CREATE nothing is drawn over the Overview (${during.map((s) => `${s.over} of ${s.n}`).join(", ")} texts covered), its created line is lit, and a ${during[0].w}×${during[0].h}-px status says "${during[0].said}"; after six seconds the line is plain again`,
        during.every((s) => s.over === 0 && s.n > 5 && s.lit && !s.flash && s.said === "Paper portfolio created · Equity L/S · Japan · 21 Nov 2026" && s.w <= 1 && s.h <= 1) && !after.lit && after.over === 0 && errs.length === 0, { seen, errs });
      await ctx.close();
    }

    console.log("\n[5] B.2's small words and the phone's VaR unit");
    {
      const { ctx, p, errs } = await open(b);
      await go(p, "portfolio/new/ar-ls-jp", "#pf-base-more");
      const l0 = await p.textContent("#pf-base-more"); await p.click("#pf-base-more"); const l1 = await p.textContent("#pf-base-more");
      const nb = await p.evaluate(() => [...document.querySelectorAll('#pf-trade ul[data-list="notbuilt"] li')].map((x) => x.textContent));
      ck(`the ladder's link reads "${l0}", then "${l1}"; under NOT BUILT YET: "${nb.join(" | ")}"`, l0 === "the whole rule" && l1 === "hide the whole rule" && nb.length === 1 && nb[0] === "orders in stocks and ETFs · futures · currencies · options." && errs.length === 0, { l0, l1, nb, errs });
      await ctx.close();
    }
    {
      const { ctx, p, errs } = await open(b, { phone: "P2" });
      await go(p, "portfolio/new/ar-ls-jp/edit/limits", 'input[data-key="var"]');
      const m = await p.evaluate(() => { const row = document.querySelector('[data-row="var"]'), i = row.querySelector('input[data-key="var"]').getBoundingClientRect(), u = row.querySelector(".pf-in .unit"), ur = u.getBoundingClientRect(), n = row.querySelector(".pf-unitnote"), nr = n?.getBoundingClientRect(); return { unit: u.textContent, beside: Math.abs((ur.top + ur.height / 2) - (i.top + i.height / 2)) < 6 && ur.left >= i.right, note: n?.textContent ?? null, under: !!nr && nr.top >= i.bottom - 0.5 }; });
      ck(`P2, the limits' screen: "${m.unit}" stands beside the VaR box (${m.beside}) and "${m.note}" on the line under it (${m.under})`, m.unit === "% of capital" && m.beside && m.note === "warning at 80% of it" && m.under && errs.length === 0, { m, errs });
      await ctx.close();
    }

    console.log("\n[6] DC-4: PORTFOLIO's file cannot be loaded in this page");
    for (const phone of [null, "P2"]) {
      for (const kase of ["other", "server", "offline"]) {
        const { ctx, p, errs } = await open(b, { phone });
        const asked = [];
        await p.route(/\/src\/views\/Portfolio\.tsx/, (r) => { asked.push(1); return r.fulfill({ status: kase === "other" ? 404 : 503, body: "" }); });
        await p.route(/version\.json/, async (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: kase === "other" ? "a-later-build" : await p.evaluate(() => document.documentElement.dataset.build) }) }));
        await go(p, "market", null); await settle(p, 300);
        if (kase === "offline") await ctx.setOffline(true);
        if (phone) await p.locator('#pnav [data-view="portfolio"], #pnav a[href="#portfolio"]').first().tap().catch(async () => { await p.evaluate(() => { location.hash = "portfolio"; }); });
        else await p.evaluate(() => { location.hash = "portfolio"; });
        await p.waitForSelector("#pf-unloaded", { timeout: 10000 }).catch(() => undefined); await settle(p, 200);
        const r = await p.evaluate(() => ({ text: document.querySelector("#pf-unloaded")?.innerText.replace(/\s+/g, " ").trim() ?? null, crash: !!document.querySelector("#tab-crash"), body: document.querySelector("#grid")?.innerText ?? "" }));
        const want = { other: "PORTFOLIO could not be loaded in this page. The version of the Monitor published now is not this page's. UPDATE", server: "PORTFOLIO could not be loaded from the server. RELOAD", offline: "PORTFOLIO is not kept on this device, and the device is offline. RELOAD once you are online." }[kase];
        let acted = null;
        if (kase === "other") { const nav = p.waitForRequest((q) => /[?&]v=a-later-build/.test(q.url()), { timeout: 6000 }).then(() => true).catch(() => false); await p.click("#pf-update"); acted = await nav; }
        if (kase === "server") { const nav = p.waitForEvent("load", { timeout: 8000 }).then(() => true).catch(() => false); await p.click("#pf-reload"); acted = await nav; }
        ck(`${phone ? "P2" : "C1"}, ${kase === "other" ? "the file answers 404 and version.json names another build" : kase === "server" ? "the file answers 503 and version.json names this page's build" : "offline before the tab was ever opened"}: "${r.text}"${acted == null ? "" : `; ${kase === "other" ? "UPDATE loads ?v=<id>" : "RELOAD reloads"} (${acted})`}; no crash notice, no "not as expected", "older" or "newer", no file address`,
          r.text === want && !r.crash && !/not as expected|older|newer|\.tsx|assets\//.test(r.body) && (acted == null || acted === true) && asked.length >= (kase === "offline" ? 0 : 1) && errs.length === 0, { r, acted, asked: asked.length, errs });
        await ctx.close();
      }
    }
  } finally { await b.close(); }
  console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
