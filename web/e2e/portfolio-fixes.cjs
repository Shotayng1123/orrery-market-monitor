// The paper portfolio's screens after the second review of P-1 (round 3b, 22 Nov 2026: the UI-, DC- and PC- findings,
// by the designer's notes D/notes-r3b-fix.md Part B), on the local copy (5179), whose stand-in store keeps its books
// in this browser. Nothing here reads the machine's clock: every page sets `om_mock_now`. A computer is 1440x900 (C1),
// a phone an iPhone 13 (P2), an iPhone SE (P1) or 360x800.
//   [1] UI-1: the form's default name is free by rule: after a book is made with it, the next form of that start reads
//       "… · 2", nothing out of range, CREATE can be pressed (C1 and P2); a phone's count goes to the refused name on
//       the first screen, focused
//   [2] UI-18: a field already refused shows its sentence when the form opens again; on a phone the count opens the
//       refused row's section with that row just under the header
//   [3] B.0.1 (UI-5, DC-8): a book made at 04:30 SGT on a Sunday: "since" and CREATED the SGT day, the heads that hold
//       a book day say "a day ends 17:00 New York", CHANGE prints the moment the day begins in SGT, and every moment on
//       the book's screens carries its zone or stands under "times in SGT" or a "(SGT)" column (C1 and P2)
//   [4] B.0.2: the targets' window prints its opening moment with its zone (the book day of 1 Dec, 06:00 SGT: PM A's answer
//       of 22 Nov 2026), and no "from 1 Dec" without a time is left on the tab or in Help
//   [5] UI-8: what is typed while a note is on its way stays; UI-14: SHOW ALL exactly where the text is drawn on more
//       than eight lines; UI-16: a failure's sentence goes once the connection is back, a refused removal is said in its
//       own note's row, and none stays once a removal has worked
//   [6] UI-10: each start's default name whole at 360 px; UI-11: no value broken inside a word, no date on two lines
//       (360 px and an iPhone SE); lead 3: Review's last line above its opaque Create strip
//   [7] DC-3: the server's paper switch off: the book's address says so with RETRY and keeps the book; UI-12: RETRY 44 px
//   [8] DC-10: the "can trade" line follows the field; lead 5: the funding of Tokyo names in one wording, no control
//   [9] DC-12, SF-4: every CSV named by the day in Singapore; a paper book's files by the book's name, "-2" for a later
//       book with the same file name, "-history" for the HISTORY view
// Run from web/:  node e2e/run.cjs portfolio-fixes   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 2000)}`); };
const NOW = "2026-11-21T09:00:00Z";
const PHONES = { P1: "iPhone SE (3rd gen)", P2: "iPhone 13" };

async function open(b, { phone = null, clock = NOW, ls = {}, width, height } = {}) {
  const dev = phone ? devices[PHONES[phone]] : null;
  const ctx = await b.newContext(dev ? { ...dev, deviceScaleFactor: 1, ...(width ? { viewport: { width, height: height ?? dev.viewport.height } } : {}) } : { viewport: { width: width ?? 1440, height: height ?? 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([at, more]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_a2hs_hide", "1"); for (const [k, v] of Object.entries(more)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v); } catch {} }, [clock, ls]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  return { ctx, p, errs };
}
const settle = async (p, ms = 250) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(ms); };
const go = async (p, hash, sel, q = "") => { await p.goto(MOCK + q + "#" + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p); };
// the address set and taken (the hashchange handled and two frames drawn) before the selector is waited for
const hop = async (p, hash, sel) => {
  await p.evaluate((h) => new Promise((res) => { const drawn = () => requestAnimationFrame(() => requestAnimationFrame(() => res())); if (location.hash === `#${h}`) drawn(); else { addEventListener("hashchange", drawn, { once: true }); location.hash = h; } }), hash);
  if (sel) await p.waitForSelector(sel, { timeout: 15000 });
  await settle(p);
};
const formState = (p) => p.evaluate(() => ({ name: document.querySelector("#pf-name")?.value ?? null, count: document.querySelector("#pf-count")?.textContent ?? null, create: document.querySelector("#pf-create") ? !document.querySelector("#pf-create").disabled : null, no: document.querySelector("#pf-name-no")?.textContent ?? null, focus: document.activeElement?.id ?? "" }));
const books = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("om_mock_pf") ?? "null")?.books?.map((x) => x.name) ?? []);
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// whether RE-SET FOR NEXT YEAR is on a page opened at a clock
const open2 = async (b, clock, hash) => { const { ctx, p } = await open(b, { clock }); await go(p, hash, "#pf-targets"); const on = await p.evaluate(() => !!document.querySelector("#pf-reset")); await ctx.close(); return on; };
const heads = (p) => p.evaluate(() => [...document.querySelectorAll(".panel .phead, .mp-sec > h2")].map((h) => h.innerText.replace(/\s+/g, " ").trim()));
// the moments on a book's screens (B.0.1): each followed by " SGT", or under a panel's or section's head that holds
// "times in SGT", or in a column whose head ends "(SGT)"
const moments = (p) => p.evaluate(() => {
  const re = /\b\d{1,2} [A-Z][a-z]{2}(?: \d{4})?,? \d{2}:\d{2}\b/g, bad = []; let n = 0;
  const w = document.createTreeWalker(document.querySelector("[data-book]") ?? document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const s = t.nodeValue; re.lastIndex = 0; let m;
    while ((m = re.exec(s))) {
      n++;
      let after = s.slice(m.index + m[0].length), e = t.parentElement;
      for (let up = 0; after.length < 4 && e && up < 3; up++, e = e.parentElement) { const f = e.textContent, i = f.indexOf(m[0]); if (i >= 0) after = f.slice(i + m[0].length); }
      const el = t.parentElement, panel = el.closest(".panel"), sec = el.closest(".mp-sec");
      const head = panel ? panel.querySelector(".phead")?.textContent ?? "" : sec ? sec.querySelector("h2")?.textContent ?? "" : "";
      const td = el.closest("td"), th = td ? td.closest("table")?.querySelectorAll("thead th")[[...td.parentElement.children].indexOf(td)] : null;
      if (!(after.startsWith(" SGT") || /times in SGT/.test(head) || /\(SGT\)$/.test((th?.textContent ?? "").trim()))) bad.push(`${m[0]} | ${head.slice(0, 40)}`);
    }
  }
  return { n, bad };
});

(async () => {
  // a UTF-8 locale for the browser, as a user's has: without one Chromium names a download "download" whenever its
  // name holds a letter outside ASCII ("東京", "é"), and the check of DC-12 reads the names
  const b = await chromium.launch({ env: { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } });
  try {
    console.log("\n[1] UI-1: the form's default name is free by rule");
    {
      const { ctx, p, errs } = await open(b);
      await go(p, "portfolio/new/ar-ls-jp", "#pf-create");
      const first = await formState(p);
      await p.click("#pf-create"); await p.waitForSelector("#pf-overview", { timeout: 15000 });
      const made = await books(p);
      await hop(p, "portfolio/new/ar-ls-jp", "#pf-create");
      const again = await formState(p);
      ck(`a computer: the first form reads "${first.name}"; once that book exists the next reads "${again.name}" (${again.count}, CREATE ${again.create ? "can be pressed" : "off"}, no sentence under the name)`,
        first.name === "Equity L/S · Japan · 21 Nov 2026" && made.includes(first.name) && again.name === "Equity L/S · Japan · 21 Nov 2026 · 2" && again.count === "0 settings out of range" && again.create === true && again.no === null && errs.length === 0, { first, again, made, errs });
      await ctx.close();
    }
    {
      const { ctx, p, errs } = await open(b, { phone: "P2" });
      await go(p, "portfolio/new/ar-ls-jp/review", "#pf-create");
      await p.click("#pf-create"); await p.waitForSelector("#pf-overview", { timeout: 15000 });
      await p.goBack(); await p.waitForSelector("#pf-create", { timeout: 15000 }); await settle(p);
      const review = await formState(p);
      await hop(p, "portfolio/new/ar-ls-jp", "#pf-name");
      const back = { ...review, name: (await formState(p)).name };
      // a typed name that is another book's: the phone's count goes to the first screen with the name focused
      await hop(p, "portfolio/new/ar-ls-jp", "#pf-name");
      await p.fill("#pf-name", "Tokyo L/S"); await p.locator("#pf-name").blur();
      await hop(p, "portfolio/new/ar-ls-jp/review", "#pf-count");
      const before = await formState(p);
      await p.tap("#pf-count"); await p.waitForFunction(() => /#portfolio\/new\/ar-ls-jp$/.test(location.hash) && document.activeElement?.id === "pf-name", null, { timeout: 5000 }).catch(() => {});
      await settle(p, 200);
      const after = await p.evaluate(() => ({ hash: location.hash, focus: document.activeElement?.id ?? "", no: document.querySelector("#pf-name-no")?.textContent ?? null }));
      ck(`a phone: Back after Create shows the form's next free name "${back.name}" (${back.count}, Create ${back.create ? "can be pressed" : "off"}); with a name taken ("${before.count}"), the count's tap opens the first screen, the name focused, its sentence "${after.no}"`,
        back.name === "Equity L/S · Japan · 21 Nov 2026 · 2" && back.count === "0 settings out of range" && back.create === true && before.count === "1 setting out of range" && after.hash === "#portfolio/new/ar-ls-jp" && after.focus === "pf-name" && /already have an open portfolio/.test(after.no ?? "") && errs.length === 0, { back, before, after, errs });
      await ctx.close();
    }

    console.log("\n[2] UI-18: a refused field says so when the form opens again; a phone's count goes to the row");
    {
      const { ctx, p, errs } = await open(b);
      await go(p, "portfolio/new/ar-macro", "#pf-create");
      await p.fill("#pf-name", "Macro, my own"); await p.locator("#pf-name").blur();
      await p.fill('input[data-key="one_short"]', "99"); await p.locator('input[data-key="one_short"]').blur(); await p.waitForTimeout(80);
      await hop(p, "market", "table.mkt");
      await hop(p, "portfolio/new", "#pf-create");
      const r = await p.evaluate(() => ({ v: document.querySelector('input[data-key="one_short"]')?.value, no: document.querySelector('[data-row="one_short"] .pf-no')?.textContent ?? null, inv: document.querySelector('input[data-key="one_short"]')?.getAttribute("aria-invalid"), count: document.querySelector("#pf-count")?.textContent, draft: document.querySelector("#pf-draft")?.textContent ?? null }));
      ck(`a computer: the form left with One name, short at 99 comes back with it refused at once ("${r.no}", ${r.count}), the draft's line "${r.draft?.split(" · ")[0]}"`, r.v === "99" && !!r.no && r.inv === "true" && r.count === "1 setting out of range" && !!r.draft && errs.length === 0, { r, errs });
      await ctx.close();
    }
    {
      const { ctx, p, errs } = await open(b, { phone: "P2" });
      await go(p, "portfolio/new/ar-macro/edit/limits", '[data-row="vega"] input');
      await p.fill('[data-row="vega"] input', "99"); await p.locator('[data-row="vega"] input').blur();
      await hop(p, "portfolio/new/ar-macro/review", "#pf-count");
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.tap("#pf-count");
      await p.waitForFunction(() => /edit\/limits$/.test(location.hash) && document.activeElement?.getAttribute("data-key") === "vega", null, { timeout: 5000 }).catch(() => {});
      await settle(p, 250);
      const r = await p.evaluate(() => { const row = document.querySelector('[data-row="vega"]'), head = document.querySelector(".pfp > .mp-head").getBoundingClientRect(), rr = row?.getBoundingClientRect(); return { hash: location.hash, focus: document.activeElement?.getAttribute("data-key") ?? "", top: rr ? Math.round(rr.top) : null, headBottom: Math.round(head.bottom), vh: innerHeight, atEnd: Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 1, no: row?.querySelector(".pf-no")?.textContent ?? null }; });
      ck(`a phone: the count's tap opens Limits with Net vega's row just under the header (its top at ${r.top} px, the header ends at ${r.headBottom}${r.atEnd ? ", the page at its end" : ""}), focused, its sentence "${r.no}"`, /edit\/limits$/.test(r.hash) && r.focus === "vega" && r.top != null && r.top >= r.headBottom && (r.top <= r.headBottom + 40 || (r.atEnd && r.top + 120 <= r.vh)) && !!r.no && errs.length === 0, { r, errs });
      await ctx.close();
    }

    console.log("\n[3] B.0.1 (UI-5, DC-8): a book made at 04:30 SGT on Sunday 22 Nov, New York's Saturday the 21st");
    for (const phone of [null, "P2"]) {
      const { ctx, p, errs } = await open(b, { phone, clock: "2026-11-21T20:30:00Z" });
      await go(p, `portfolio/new/ar-ls-gl${phone ? "/review" : ""}`, "#pf-create");
      await p.click("#pf-create"); await p.waitForSelector("#pf-overview", { timeout: 15000 }); await settle(p, 300);
      const id = await p.evaluate(() => location.hash.split("/")[1]);
      const ov = { strip: await p.evaluate(() => document.querySelector("#pf-strip")?.innerText.replace(/\s+/g, " ") ?? ""), text: await p.evaluate(() => document.querySelector("#pf-overview").innerText.replace(/\s+/g, " ")), heads: await heads(p), moments: await moments(p) };
      await hop(p, `portfolio/${id}/settings`, "#pf-settings");
      const st = { heads: await heads(p), moments: await moments(p), text: await p.evaluate(() => document.querySelector("#pf-settings").innerText.replace(/\s+/g, " ")),
        since: await p.evaluate((phone) => { if (phone) return document.querySelector('[data-sec="limits"] [data-row="one_long"] .s')?.textContent.match(/since (.*)$/)?.[1] ?? null; const t = document.querySelector('[data-sec="limits"] table'), i = [...t.querySelectorAll("thead th")].findIndex((h) => /^since$/i.test(h.textContent.trim())); return t.querySelectorAll('tr[data-row="one_long"] td')[i]?.textContent ?? null; }, !!phone) };
      if (phone) await p.locator('[data-sec="limits"] button.pfp-set[data-row="one_long"]').tap(); else await p.click('[data-sec="limits"] tr[data-row="one_long"] [data-act="change"]');
      await p.waitForSelector("#pf-change-when"); const when = await p.textContent("#pf-change-when"), now = await p.evaluate(() => document.querySelector("#pf-change .ln").innerText.replace(/\s+/g, " ").trim());
      await p.click("#pf-change-cancel"); await p.waitForTimeout(200);
      await p.click('[data-sec="limits"] [data-tab="history"]'); await p.waitForSelector(phone ? '[data-sec="limits"] .pfp-hist' : '[data-sec="limits"] table.pf-hist'); await settle(p, 150);
      const hi = { head: await p.evaluate(() => (document.querySelector('[data-sec="limits"] .phead') ?? document.querySelector('[data-sec="limits"] h2'))?.innerText.replace(/\s+/g, " ") ?? ""), moments: await moments(p), text: await p.evaluate(() => document.querySelector('[data-sec="limits"]').innerText.replace(/\s+/g, " ")) };
      await hop(p, "portfolio/all", "#pf-list");
      const row = await p.evaluate((id) => { const a = [...document.querySelectorAll("#pf-list a")].find((x) => (x.getAttribute("href") ?? "").includes(id)); return (a?.closest("tr") ?? a)?.innerText.replace(/\s+/g, " ").trim() ?? null; }, id);
      const DAY = "a day ends 17:00 New York", has = (hs, t) => hs.some((h) => h.toUpperCase().includes(t) && h.includes(DAY)), bad = [...ov.moments.bad, ...st.moments.bad, ...hi.moments.bad];
      // "since" is a book day only, written with its weekday (revision 2): never before a date without one
      const looseSince = [ov.text, st.text, hi.text].flatMap((t) => t.match(/since (?![A-Z][a-z]{2} )\d{1,2} [A-Z][a-z]{2}/g) ?? []);
      ck(`${phone ? "a phone" : "a computer"}: the head says "${ov.strip.match(/created [^·]*?(2026|Nov)/)?.[0]}", the book's card "${ov.text.match(/created [^·]*?SGT/)?.[0]}", the list "${row?.match(/(created )?2\d Nov 2026/g)?.slice(-1)[0]}"; LIMITS' SINCE "${st.since}" and CHANGE's "${now.match(/since .*$/)?.[0]}"; LIMITS AS SET, LIMITS, ASSUMPTIONS and HISTORY say "${DAY}"; CHANGE "${when}"; of ${ov.moments.n + st.moments.n + hi.moments.n} moments on the book's screens ${bad.length} without its zone; "since" before a date with no weekday: ${looseSince.length}`,
        (phone ? /created 22 Nov(?! 2026)/.test(ov.strip) : /created 22 Nov 2026\b/.test(ov.strip)) && !/since/.test(ov.strip) && ov.text.includes("created 22 Nov 2026 04:30 SGT") && !!row && (phone ? /created 22 Nov 2026\b/.test(row) : /22 Nov 2026$/.test(row)) && !/21 Nov 2026/.test(row)
        && st.since === "Sat 21 Nov 2026" && /since Sat 21 Nov 2026$/.test(now) && looseSince.length === 0
        && has(ov.heads, "LIMITS AS SET") && has(st.heads, "LIMITS") && has(st.heads, "ASSUMPTIONS") && hi.head.includes(DAY) && when === "In force from Mon 23 Nov 2026, 06:00 SGT" && ov.moments.n + st.moments.n + hi.moments.n > 0 && bad.length === 0 && errs.length === 0,
        { strip: ov.strip, card: ov.text.slice(0, 200), heads: [ov.heads, st.heads, hi.head], since: st.since, now, looseSince, bad, when, row, errs });
      await ctx.close();
    }

    console.log("\n[4] B.0.2 (UI-5, DC-8): the targets' window, its opening moment with its zone");
    {
      // Tue 1 Dec, 05:00 SGT: the window opens with the book day of 1 Dec, at 06:00 SGT (17:00 New York on 30 Nov: PM A's
      // answer of 22 Nov 2026; it opened at 13:00 SGT, New York's midnight, before)
      const { ctx, p, errs } = await open(b, { clock: "2026-11-30T21:00:00Z" });
      await go(p, `portfolio/${ID(1)}/settings/targets`, "#pf-targets");
      const t = await p.evaluate(() => ({ text: document.querySelector("#pf-targets").innerText.replace(/\s+/g, " "), page: document.querySelector("[data-book]").innerText }));
      const lines = t.text.match(/re-set only from .*? to a January reset|next window: from .*? to the first NAV of 2027/g) ?? [];
      await p.click("#help-ctl"); await p.waitForTimeout(300);
      const help = await p.evaluate(() => document.querySelector(".helpbox")?.innerText ?? ""), loose = (s) => s.match(/\b1 Dec(?!(?: \d{4})?, 06:00 SGT).{0,30}/g) ?? [];
      await go(p, "portfolio/new/ar-ls-jp", "#pf-create"); const form = await p.evaluate(() => document.querySelector(".fixedline")?.textContent ?? "");
      const reset = await open2(b, "2026-11-30T22:00:30Z", `portfolio/${ID(1)}/settings/targets`);
      ck(`a yearly book at 05:00 SGT on 1 Dec, before its window opens: "${lines.join('", "')}"; no "1 Dec" without its moment on the tab (${loose(t.page).length}), in Help (${loose(help).length}) or on NEW PORTFOLIO ("${form.slice(-70)}"); at 06:00 SGT (17:00 New York on 30 Nov) RE-SET FOR NEXT YEAR is there (${reset})`,
        lines.length === 3 && lines.filter((l) => l === "re-set only from 1 Dec, 06:00 SGT, to a January reset").length === 2 && lines[2] === "next window: from Tue 1 Dec 2026, 06:00 SGT, to the first NAV of 2027"
        && loose(t.page).length === 0 && loose(help).length === 0 && loose(form).length === 0 && /re-set only from 1 Dec, 06:00 SGT \(17:00 New York on 30 Nov\), to a January reset/.test(help) && form.endsWith("The targets: re-set only from 1 Dec, 06:00 SGT, to a January reset, under a yearly base.") && reset && errs.length === 0, { lines, page: loose(t.page), help: loose(help), form, reset, errs });
      await ctx.close();
    }

    console.log("\n[5] UI-8, UI-14, UI-16: the notes");
    {
      const { ctx, p, errs } = await open(b, { ls: { om_mock_pf_delay: "400" } });
      await go(p, `portfolio/${ID(1)}`, "#pf-overview");
      await p.fill("#pf-note-box", "Into results: trim autos"); await p.click("#pf-note-save");
      await p.locator("#pf-note-box").press("End"); await p.keyboard.type(", add on weakness");   // typed while the note is on its way
      await p.waitForFunction(() => document.querySelector("#pf-note-save")?.textContent !== "Saving…", null, { timeout: 5000 }); await settle(p, 200);
      const r = await p.evaluate(() => ({ box: document.querySelector("#pf-note-box").value, first: document.querySelector("#pf-notes li[data-note]:not(.gone) .tx")?.textContent ?? null, msg: document.querySelector("#pf-note-msg")?.textContent ?? null }));
      ck(`UI-8: a note saved with a 400-ms answer, typed on while it is on its way: "${r.first}" is saved and the box keeps "${r.box}", with nothing said`, r.first === "Into results: trim autos" && r.box === "Into results: trim autos, add on weakness" && r.msg === null && errs.length === 0, { r, errs });
      await ctx.close();
    }
    for (const phone of [null, "P2"]) {
      const { ctx, p, errs } = await open(b, { phone });
      await go(p, `portfolio/${ID(1)}`, "#pf-overview");
      // a note long by its characters (more than the old count's 480) that the computer draws in fewer than eight lines
      const words = "Autos into results: sizing down before the print, adding on weakness after it, the yen hedge reviewed at each step. ".repeat(5).slice(0, 520).trim();
      await p.fill("#pf-note-box", words); await p.click("#pf-note-save"); await p.waitForFunction((w) => [...document.querySelectorAll("#pf-notes li[data-note] .tx")].some((x) => x.textContent === w), words, { timeout: 5000 }); await settle(p, 250);
      const n = await p.evaluate(() => [...document.querySelectorAll("#pf-notes li[data-note]:not(.gone)")].map((li) => { const tx = li.querySelector(".tx"), lh = parseFloat(getComputedStyle(tx).lineHeight); return { n: tx.textContent.length, lines: Math.round(tx.scrollHeight / lh), more: !!li.querySelector('[data-act="all"]') }; }));
      const wrong = n.filter((x) => x.more !== x.lines > 8), ours = n.find((x) => x.n === 520 || x.n === 519);
      ck(`UI-14 (${phone ? "a phone" : "a computer"}): SHOW ALL stands under a note exactly when its text is drawn on more than eight lines: ${n.map((x) => `${x.n} characters, ${x.lines} lines${x.more ? ", SHOW ALL" : ""}`).join("; ")}`, n.length >= 4 && wrong.length === 0 && !!ours && (phone || ours.lines <= 8) && errs.length === 0, { n, errs });
      await ctx.close();
    }
    {
      const { ctx, p, errs } = await open(b);
      await go(p, `portfolio/${ID(1)}`, "#pf-overview");
      await p.evaluate(() => { window.__ui16 = 1; localStorage.setItem("om_mock_pf_refuse", "offline"); });
      await p.fill("#pf-note-box", "a note while offline"); await p.click("#pf-note-save"); await p.waitForSelector("#pf-note-msg");
      const off = await p.textContent("#pf-note-msg");
      await p.evaluate(() => localStorage.removeItem("om_mock_pf_refuse"));
      await ctx.setOffline(true); await p.waitForTimeout(200); await ctx.setOffline(false); await p.waitForTimeout(400);
      const back = await p.evaluate(() => ({ msg: document.querySelector("#pf-note-msg")?.textContent ?? null, same: window.__ui16 === 1 }));
      const nid = await p.evaluate(() => document.querySelector("#pf-notes li[data-note]:not(.gone)")?.dataset.note);
      const rm = async () => { await p.click(`#pf-notes li[data-note="${nid}"] .rm`); await p.click(`#pf-notes li[data-note="${nid}"] [data-act="remove"]`); };
      await p.evaluate(() => localStorage.setItem("om_mock_pf_refuse", "1")); await rm();
      await p.waitForFunction((id) => !!document.querySelector(`[data-note-msg="${id}"]`) || !!document.querySelector("#pf-note-msg"), nid, { timeout: 5000 }).catch(() => {});
      const no = await p.evaluate((id) => ({ at: document.querySelector(`[data-note-msg="${id}"]`)?.textContent ?? null, top: document.querySelector("#pf-note-msg")?.textContent ?? null }), nid);
      await p.evaluate(() => localStorage.removeItem("om_mock_pf_refuse")); await rm();
      await p.waitForFunction((id) => !document.querySelector(`#pf-notes li[data-note="${id}"]`), nid, { timeout: 5000 }).catch(() => {}); await settle(p, 200);
      const after = await p.evaluate(() => [...document.querySelectorAll("#pf-notes .pf-msg")].map((x) => x.textContent));
      ck(`UI-16: "${off}" goes once the connection is back (${back.msg === null ? "gone" : `"${back.msg}"`}, the page not reloaded: ${back.same}); a removal the server refuses says "${no.at}" in its own note's row (above the list: ${no.top === null ? "nothing" : `"${no.top}"`}); once a removal has worked no failure's sentence is on screen (${after.length})`,
        /^Offline/.test(off ?? "") && back.msg === null && back.same && no.at === "Not removed: stand-in failure. Nothing was removed." && no.top === null && after.length === 0 && errs.length === 0, { off, back, no, after, errs });
      await ctx.close();
    }

    console.log("\n[6] UI-10, UI-11, UI-12 and lead 3: a phone's form and rows at 360 px and on an iPhone SE");
    {
      const { ctx, p, errs } = await open(b, { phone: "P2", width: 360, height: 800 });
      const names = [];
      const nameFits = async () => p.evaluate(() => { const i = document.querySelector("#pf-name"); return { v: i.value, fits: i.scrollWidth <= i.clientWidth, sw: i.scrollWidth, cw: i.clientWidth, font: getComputedStyle(i).fontFamily.split(",")[0], size: getComputedStyle(i).fontSize }; });
      for (const s of ["ar-ls-jp", "ar-ls-gl", "ar-macro"]) { await go(p, `portfolio/new/${s}`, "#pf-name"); names.push(await nameFits()); }
      await hop(p, "portfolio/new/ar-ls-gl/review", "#pf-create"); await p.click("#pf-create"); await p.waitForSelector("#pf-overview", { timeout: 15000 });
      await hop(p, "portfolio/new/ar-ls-gl", "#pf-name"); names.push(await nameFits());
      ck(`UI-10: at 360 px each start's default name is whole in its field (${names.map((n) => `"${n.v}" ${n.sw}/${n.cw} px`).join("; ")}), in the sans face at 16 px`, names.length === 4 && names.every((n) => n.fits && n.size === "16px" && !/mono/i.test(n.font)) && names[3].v === "Equity L/S · Global · 21 Nov 2026 · 2" && errs.length === 0, { names, errs });
      await ctx.close();
    }
    for (const [label, opt] of [["360 x 800", { phone: "P2", width: 360, height: 800 }], ["an iPhone SE", { phone: "P1" }]]) {
      const { ctx, p, errs } = await open(b, opt);
      const breaks = () => p.evaluate(() => { const out = [], tops = (t, a, z) => { const r = document.createRange(); r.setStart(t, a); r.setEnd(t, z); return new Set([...r.getClientRects()].filter((x) => x.width > 0.5).map((x) => Math.round(x.top))).size; };
        const rows = document.querySelectorAll(".pfp-set");
        for (const row of rows) { const w = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
          for (let t = w.nextNode(); t; t = w.nextNode()) { const s = t.nodeValue, inV = !!t.parentElement.closest(".v");
            if (inV) for (const m of s.matchAll(/[^\s\u2013\u2014-]+[\u2013\u2014-]?/g)) if (tops(t, m.index, m.index + m[0].length) > 1) out.push(`${row.dataset.row}: "${m[0]}"`);   // a word, or a part of one up to a dash, where a line may break
            for (const m of s.matchAll(/(?:[A-Z][a-z]{2} )?\d{1,2} [A-Z][a-z]{2}(?: \d{4})?(?: \d{2}:\d{2}(?: SGT)?)?/g)) if (tops(t, m.index, m.index + m[0].length) > 1) out.push(`${row.dataset.row}: "${m[0]}"`); } }
        return { rows: rows.length, out }; });
      await go(p, `portfolio/${ID(1)}`, "#pf-overview"); const o = await breaks();
      await hop(p, `portfolio/${ID(1)}/settings`, "#pf-settings"); const s = await breaks();
      ck(`UI-11 (${label}): of ${o.rows + s.rows} rows of the book's Overview and Settings, no value breaks inside a word and no date stands on two lines (${[...o.out, ...s.out].join(", ") || "none"})`, o.rows > 0 && s.rows > 10 && o.out.length === 0 && s.out.length === 0 && errs.length === 0, { o, s, errs });
      // lead 3: Review's list ends above its strip, which hides what passes under it
      await go(p, "portfolio/new/ar-ls-jp/review", "#pf-create"); await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await settle(p, 250);
      const rv = await p.evaluate(() => { const foot = document.querySelector('.pfp[data-step="review"] .pfp-foot'), f = foot.getBoundingClientRect(), items = [...document.querySelectorAll('.pfp[data-step="review"] .pfp-fold, .pfp[data-step="review"] > p')], last = items[items.length - 1].getBoundingClientRect(), bg = getComputedStyle(foot).backgroundColor, a = /rgba\([^)]*,\s*([\d.]+)\)/.exec(bg); return { gap: Math.round(f.top - last.bottom), alpha: a ? Number(a[1]) : 1, bg }; });
      ck(`lead 3 (${label}): Review scrolled to its end, its last line ends ${rv.gap} px above the Create strip, and the strip is opaque (${rv.bg})`, rv.gap >= 8 && rv.alpha === 1, rv);
      await ctx.close();
    }

    console.log("\n[7] DC-3, UI-12: the page on, the server's paper switch off");
    for (const phone of [null, "P2"]) {
      const { ctx, p, errs } = await open(b, { phone });
      await go(p, `portfolio/${ID(1)}`, "#pf-overview");
      await p.evaluate(() => localStorage.setItem("om_mock_pf_off", "1"));
      await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#pf-notyet, #pf-nosuch, .pf-err", { timeout: 15000 }).catch(() => {}); await settle(p);
      const tap = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel), r = e?.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height)] : null; }, sel);
      const r = await p.evaluate(() => ({ text: document.querySelector("#pf-notyet")?.innerText.replace(/\s+/g, " ").trim() ?? null, nosuch: /No such paper portfolio/.test(document.body.innerText), last: localStorage.getItem("om_pf_last") }));
      const bookTap = await tap("#pf-notyet button");
      await hop(p, "portfolio/all", ".pf-err"); const list = await p.evaluate(() => document.querySelector(".pf-err")?.innerText.replace(/\s+/g, " ").trim() ?? null), listTap = await tap(".pf-err button");
      await hop(p, `portfolio/${ID(1)}`, "#pf-notyet"); await p.evaluate(() => localStorage.removeItem("om_mock_pf_off")); await p.click("#pf-notyet button"); const again = await p.waitForSelector("#pf-overview", { timeout: 8000 }).then(() => true).catch(() => false);
      const big = (t) => !phone || (!!t && t[0] >= 44 && t[1] >= 44);
      ck(`${phone ? "a phone" : "a computer"}: the book's address says "${r.text}" (not "No such paper portfolio"), the book last opened is kept (${r.last === ID(1)}), the list says "${list}"; RETRY is ${bookTap?.join("x")} and ${listTap?.join("x")} px${phone ? " (44 or more)" : ""}; with the switch on again RETRY draws the book (${again})`,
        r.text === "Paper portfolios are not available yet. RETRY" && !r.nosuch && r.last === ID(1) && /Paper portfolios are not available yet/.test(list ?? "") && big(bookTap) && big(listTap) && again && errs.length === 0, { r, bookTap, list, listTap, again, errs });
      await ctx.close();
    }

    console.log("\n[8] DC-10, lead 5: what the start can trade follows the field; the funding of Tokyo names in one wording");
    for (const phone of [null, "P2"]) {
      const { ctx, p, errs } = await open(b, { phone });
      const can = () => p.evaluate(() => [...document.querySelectorAll('#pf-trade [data-list="can"] li')].map((x) => x.textContent));
      await go(p, phone ? "portfolio/new/ar-ls-jp/edit/trade" : "portfolio/new/ar-ls-jp", '#pf-trade');
      const c0 = await can(), put = async (v) => { await p.fill('input[data-key="foreign"]', v); await p.locator('input[data-key="foreign"]').blur(); await p.waitForTimeout(100); return (await can())[1]; };
      const c40 = await put("40"), c00 = await put("0");
      if (phone) await go(p, "portfolio/new/ar-ls-jp/edit/costs", '[data-row="funding"]'); else { await p.click("#pf-costs-edit"); await p.waitForSelector('[data-row="funding"]'); }
      const f = await p.evaluate(() => { const r = document.querySelector('[data-row="funding"]'); return { text: r.innerText.replace(/\s+/g, " ").trim(), ctl: r.querySelectorAll('input, select, [role="radio"]').length }; });
      const T = ["Yen from the prime broker", "the Tokyo longs are a yen debit; the capital stays in dollars", "Spot and a one-month forward, rolled monthly: not yet: currencies are not built"], at = T.map((x) => f.text.indexOf(x)), once = T.every((x) => f.text.split(x).length === 2);
      ck(`${phone ? "a phone" : "a computer"}: the form's "can trade" reads "${c0[1]}", at 40 "${c40}", at 0 "${c00}" (DC-10); the funding row holds the value, the field's why once and the other way muted (${at.join(", ")}), no "(●)" and no control (lead 5)`,
        c0[1] === "names listed outside Tokyo, up to 20% of capital, gross (a limit)" && c40 === "names listed outside Tokyo, up to 40% of capital, gross (a limit)" && c00 === "names listed outside Tokyo: none (its limit is 0%)"
        && at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1])) && once && !f.text.includes("(●)") && f.ctl === 0 && errs.length === 0, { c0, c40, c00, f, errs });
      await ctx.close();
    }

    console.log("\n[9] DC-12, SF-4: a CSV's name: the day in Singapore; a paper book's files named for the book");
    {
      const { ctx, p, errs } = await open(b, { clock: "2026-11-21T22:35:00Z" });   // 06:35 SGT on Sun 22 Nov: the UTC day is the 21st
      const made = [];
      for (const nm of ["Tokyo L-S", "東京 L/S"]) { await go(p, "portfolio/new/ar-ls-jp", "#pf-create"); await p.fill("#pf-name", nm); await p.locator("#pf-name").blur(); await p.click("#pf-create"); await p.waitForSelector("#pf-overview", { timeout: 15000 }); made.push(await p.evaluate(() => location.hash.split("/")[1])); }
      const file = async (sel) => { const dl = p.waitForEvent("download", { timeout: 8000 }); await p.click(sel); return (await dl).suggestedFilename(); };
      const files = [];
      for (const id of [ID(1), ...made]) {
        await hop(p, `portfolio/${id}/settings`, "#pf-settings"); await p.waitForSelector('[data-sec="limits"] .csvbtn');
        files.push(await file('[data-sec="limits"] .csvbtn'));
        await p.click('[data-sec="limits"] [data-tab="history"]'); await p.waitForSelector('[data-sec="limits"] table.pf-hist'); files.push(await file('[data-sec="limits"] .csvbtn'));
      }
      await hop(p, `portfolio/${ID(1)}`, "#pf-overview"); files.push(await file('.panel[data-k="pfo-limits"] .csvbtn'));
      await hop(p, "market", '.panel[data-k="mkt"] .csvbtn'); await settle(p, 300); files.push(await file('.panel[data-k="mkt"] .csvbtn'));
      const want = ["orrery-paper-tokyo-l-s-limits-2026-11-22.csv", "orrery-paper-tokyo-l-s-limits-history-2026-11-22.csv", "orrery-paper-tokyo-l-s-2-limits-2026-11-22.csv", "orrery-paper-tokyo-l-s-2-limits-history-2026-11-22.csv", "orrery-paper-東京-l-s-limits-2026-11-22.csv", "orrery-paper-東京-l-s-limits-history-2026-11-22.csv", "orrery-paper-tokyo-l-s-limits-as-set-2026-11-22.csv", "orrery-markets-2026-11-22.csv"];
      ck(`at 06:35 SGT on 22 Nov the files are ${files.join(", ")}`, files.join("|") === want.join("|") && errs.length === 0, { files, want, errs });
      await ctx.close();
    }
  } finally { await b.close(); }
  console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
