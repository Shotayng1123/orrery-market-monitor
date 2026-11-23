// The paper book's order ticket (P-2.1, 23 Nov 2026), on the local copy (5179) with the stand-in preview account
// (om_paper = "preview"). The ticket sizes an order and places nothing. Nothing here reads the machine's clock: every
// page sets `om_mock_now`. A computer is 1440x900 (C1) and at XL text (C3); a phone an iPhone 13 (P2) and an SE (P1);
// what must have room is measured in the machine's fonts and once with a wide font forced.
//   [1] a computer: BUY / SELL on the book's strip opens the ticket at the right of Overview, under the preview line;
//       a Tokyo name by shares (1,050 → 1,000, 50 not placed) and by % of capital, with the price, its time, age and
//       source; the sides a book with no position allows; the line that placing comes next
//   [2] a US name by an amount (USD 1,000,000 at 187.30 → 5,339 shares, USD 5.30 not placed); a print too old to size
//       an amount on (shares still size, with no money beside them); a future refused in words; a server of before
//   [3] a phone: Buy / Sell in the book's head (44 px), the ticket as a page of the book, the preview line first, 16-px
//       inputs and 44-px taps, nothing cut and no sideways scroll, on a weekend's dated print, once with a wide font
// Run from web/:  node e2e/run.cjs pf-ticket   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const fs = require("fs"), path = require("path");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 2000)}`); };
const TOKYO_OPEN = "2026-11-24T01:30:00Z";   // Tue 24 Nov 2026, 10:30 JST (Tokyo open), 20:30 ET Monday (New York shut)
const SATURDAY = "2026-11-21T03:00:00Z";     // Sat 21 Nov 2026, 11:00 SGT: Friday's prints
const WIDE = "*{font-family:monospace!important}";
const PHONES = { P1: "iPhone SE (3rd gen)", P2: "iPhone 13" };
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const words = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "pf", "words.ts"), "utf8");
const word = (name) => { const m = new RegExp(`export const ${name} = "((?:[^"\\\\]|\\\\.)*)";`).exec(words); if (!m) throw new Error(`${name} not found in words.ts`); return JSON.parse(`"${m[1]}"`); };
const NOTE = word("TICKET_NOTE"), NOT_ON_SERVER = word("TICKET_NOT_ON_SERVER");

async function open(b, { phone = null, ls = {}, now = TOKYO_OPEN, size = null } = {}) {
  const dev = phone ? devices[PHONES[phone]] : null;
  const ctx = await b.newContext(dev ? { ...dev, deviceScaleFactor: 1 } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([at, more, sz]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_a2hs_hide", "1"); localStorage.setItem("om_paper", "preview"); if (sz) localStorage.setItem("om_prefs", JSON.stringify({ size: sz, compact: false, v: 2 })); for (const [k, v] of Object.entries(more)) localStorage.setItem(k, v); } catch {} }, [now, ls, size]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  return { ctx, p, errs };
}
const settle = async (p, ms = 250) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(ms); };
const go = async (p, hash, sel, wide = false) => { await p.goto(MOCK + "#" + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); await p.addStyleTag({ content: "#mockbar{display:none!important}" + (wide ? WIDE : "") }); await settle(p); };
// a name looked up: the ticket marks the answer it shows with the symbol it is for (a failed read shows its words)
const look = async (p, sym, failing = false) => { await p.fill("#pf-t-symbol", sym); await p.press("#pf-t-symbol", "Enter"); await p.waitForSelector(failing ? "#pf-t-error" : `.pf-ticket-form[data-asked="${sym}"]`, { timeout: 15000 }); await settle(p, 150); };
const size = async (p, by, v) => { await p.selectOption("#pf-t-by", by); await p.fill("#pf-t-value", v); await settle(p, 120); };
const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, " ").trim() ?? null, sel);
// what is drawn of the ticket: cut text, sideways scroll, and the preview line first in the grid
const fit = (p) => p.evaluate(() => {
  const t = document.querySelector("#pf-ticket"), grid = document.querySelector("#grid"), pv = document.querySelector("#pf-preview");
  const cut = [...(t?.querySelectorAll(".pf-t-lines div, .pf-t-row .k, .pf-t-sides button, #pf-t-note, .pf-err, h2, .phead") ?? [])].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.slice(0, 40));
  const R = t?.getBoundingClientRect();
  return { cut, sideways: document.documentElement.scrollWidth - innerWidth, first: !!pv && grid.firstElementChild === pv, inside: !!R && R.left >= -0.5 && R.right <= innerWidth + 0.5 };
});

(async () => {
  const b = await chromium.launch();

  console.log("\n[1] a computer: the ticket beside Overview, a Tokyo name by shares and by % of capital");
  for (const sz of [null, "XL"]) {
    const { ctx, p, errs } = await open(b, { size: sz });
    await go(p, `portfolio/${ID(1)}`, "#pf-overview");
    const btn = await p.evaluate(() => { const a = document.querySelector("#pf-strip #pf-buysell"); return a ? { text: a.textContent, href: a.getAttribute("href") } : null; });
    await p.click("#pf-buysell"); await p.waitForSelector("#pf-ticket", { timeout: 15000 }); await settle(p);
    const place = await p.evaluate(() => { const e = document.querySelector("#pf-ticket"), t = e.getBoundingClientRect(), o = document.querySelector("#pf-overview").getBoundingClientRect(); return { w: e.offsetWidth, right: t.left >= o.right - 0.5, top: Math.round(t.top - o.top) }; });
    ck(`${sz ?? "C1"}: BUY / SELL on the strip (${btn?.href}) opens the ticket at the right of Overview (${place.w} CSS px wide, the page's own scale aside), under the preview line`, !!btn && /^BUY \/ SELL$/.test(btn.text) && btn.href === `#portfolio/${ID(1)}/ticket` && place.right && place.w === 460 && (await fit(p)).first, { btn, place });
    await look(p, "7203.T");
    const nameLine = await text(p, "#pf-t-name"), sides = await p.evaluate(() => [...document.querySelectorAll("#pf-t-sides button")].map((x) => `${x.dataset.side}:${x.disabled ? "off" : "on"}`).join(","));
    ck(`${sz ?? "C1"}: 7203.T: its name, venue and lot, the last print with its time in SGT, its age and its source ("${nameLine}"); a book with no position may Buy or Short, not Sell or Cover (${sides})`, /Toyota Motor · Tokyo · open · lot 100 shares/.test(nameLine) && /last 2,987\.0 JPY · 24 Nov 09:09 SGT · 21 min old · Yahoo Finance, unofficial/.test(nameLine) && /position: none/.test(nameLine) && sides === "buy:on,sell:off,short:on,cover:off", { nameLine, sides });
    await size(p, "shares", "1,050");
    const q1 = await text(p, "#pf-t-qty"), l1 = await text(p, "#pf-t-left");
    ck(`${sz ?? "C1"}: 1,050 shares are "${q1}", "${l1}"`, q1 === "→ Buy 1,000 shares (100-share lots)" && /^50 shares not placed · JPY 2,987,000 at 2,987\.0$/.test(l1), { q1, l1 });
    await size(p, "pct", "2");
    const conv = await text(p, "#pf-t-conv"), q2 = await text(p, "#pf-t-qty"), l2 = await text(p, "#pf-t-left"), note = await text(p, "#pf-t-note");
    // the stand-in USD/JPY is 158.4: USD 2,000,000 = JPY 316,800,000; ÷ (2,987 × 100) = 1,060.6 lots → 106,000 shares; JPY 178,000 left
    ck(`${sz ?? "C1"}: 2% of the book's USD 100m capital: "${conv}" → "${q2}", "${l2}"; and "${note}"`, /^= USD 2,000,000 = JPY 316,800,000 at USD\/JPY 158\.400 \(24 Nov 09:29 SGT · Yahoo Finance, unofficial\)$/.test(conv) && q2 === "→ Buy 106,000 shares (100-share lots)" && /^JPY 178,000 not placed/.test(l2) && note === NOTE, { conv, q2, l2, note });
    const f = await fit(p);
    ck(`${sz ?? "C1"}: nothing of the ticket is cut, no sideways scroll (${f.sideways}), and the page asked to place nothing: no order, no write`, f.cut.length === 0 && f.sideways <= 0 && f.inside && errs.length === 0, { f, errs });
    if (!sz) {
      await size(p, "base", "1.5m");
      const am = await text(p, "#pf-t-conv");
      ck(`an amount typed as the creation form takes one ("1.5m"): "${am}"`, /^= USD 1,500,000 = JPY 237,600,000 at USD\/JPY 158\.400/.test(am ?? ""), am);
      await p.click("#pf-t-close"); await p.waitForSelector("#pf-overview"); await settle(p);
      const shut = (await p.evaluate(() => [location.hash, !!document.querySelector("#pf-ticket")])).join();
      await p.click("#pf-buysell"); await p.waitForSelector("#pf-ticket"); await p.focus("#pf-t-symbol"); await p.keyboard.press("Escape"); await p.waitForSelector("#pf-overview"); await settle(p);
      const esc = (await p.evaluate(() => [location.hash, !!document.querySelector("#pf-ticket")])).join();
      ck("✕ closes the ticket, and so does Esc; Overview stays", shut === `#portfolio/${ID(1)},false` && esc === shut, { shut, esc });
    }
    await ctx.close();
  }

  console.log("\n[2] a US name by an amount; a print too old; a future; a server of before the ticket");
  {
    const { ctx, p, errs } = await open(b);
    await go(p, `portfolio/${ID(1)}/ticket?s=NVDA&side=buy`, "#pf-ticket");
    await p.waitForSelector("#pf-t-name", { timeout: 15000 }); await settle(p);
    await size(p, "base", "1000000");
    const q = await text(p, "#pf-t-qty"), l = await text(p, "#pf-t-left"), pr = await text(p, "#pf-t-print"), nm = await text(p, "#pf-t-name");
    ck(`NVDA, filled in from the address: USD 1,000,000 at 187.30 is "${q}", "${l}" (the print: "${pr}", New York's Monday close; "${nm}")`, /NVIDIA · New York · closed · lot 1 share/.test(nm ?? "") && q === "→ Buy 5,339 shares" && l === "USD 5.30 not placed · USD 999,994.70 at 187.30" && /^last 187\.30 USD · 24 Nov 05:00 SGT · 4 h 30 min old · Yahoo Finance, unofficial$/.test(pr), { q, l, pr, nm });
    // a read that fails for the next name leaves nothing of the last one's size on screen
    await p.evaluate(() => localStorage.setItem("om_mock_pf_ticket", "0"));
    await look(p, "AAPL", true);
    const failed = await text(p, "#pf-t-error"), stale = await p.$("#pf-t-qty");
    ck(`a read that fails for the next name (AAPL: "${failed}") leaves nothing of NVDA's size on screen`, !!failed && !stale, { failed, stale: !!stale });
    await p.evaluate(() => localStorage.removeItem("om_mock_pf_ticket"));
    await look(p, "9984.T");
    const old = await text(p, "#pf-t-old");
    await size(p, "pct", "1"); const why = await text(p, "#pf-t-why");
    await size(p, "shares", "1050"); const q3 = await text(p, "#pf-t-qty"), l3 = await text(p, "#pf-t-left");
    ck(`a stopped feed's print says it is too old ("${old}"); an amount is not sized on it ("${why}"); shares still are ("${q3}", "${l3}")`, /^Too old to size on: Tokyo is open and its last print is \d+ days old/.test(old ?? "") && /^No price to size an amount on/.test(why ?? "") && q3 === "→ Buy 1,000 shares (100-share lots)" && /^50 shares not placed · value: –/.test(l3), { old, why, q3, l3 });
    await look(p, "ESZ26.CME");
    const fut = await text(p, "#pf-t-refusal");
    ck(`a future is refused in words ("${fut}"), with nothing sized`, /is a future\. Only stocks and ETFs listed in New York or Tokyo can be sized for now/.test(fut ?? "") && !(await p.$("#pf-t-qty")) && errs.length === 0, { fut, errs });
    await ctx.close();
    const o = await open(b, { ls: { om_mock_pf_ticket: "0" } });
    await go(o.p, `portfolio/${ID(1)}/ticket?s=7203.T`, "#pf-t-error");
    const e = await text(o.p, "#pf-t-error");
    ck(`a server of before the ticket (no pf_ticket): "${e}", and the book's Overview stays`, e === NOT_ON_SERVER && !!(await o.p.$("#pf-overview")) && o.errs.length === 0, { e, errs: o.errs });
    await o.ctx.close();
  }

  console.log("\n[3] a phone: Buy / Sell in the book's head, the ticket as a page of the book");
  for (const [ph, wide, now] of [["P2", false, TOKYO_OPEN], ["P1", false, SATURDAY], ["P1", true, SATURDAY]]) {
    const { ctx, p, errs } = await open(b, { phone: ph, now });
    await go(p, `portfolio/${ID(1)}`, "#pf-overview", wide);
    const bs = await p.evaluate(() => { const a = document.querySelector("#pf-buysell"); const r = a?.getBoundingClientRect(); return a ? { h: Math.round(r.height), text: a.textContent } : null; });
    await p.click("#pf-buysell"); await p.waitForSelector("#pf-ticket", { timeout: 15000 }); if (wide) await p.addStyleTag({ content: WIDE }); await settle(p);
    await look(p, "7203.T"); await size(p, "shares", "1050");
    const m = await p.evaluate(() => {
      const px = (s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize), h = (s) => Math.min(...[...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect().height));
      return { input: px("#pf-t-symbol"), value: px("#pf-t-value"), by: px("#pf-t-by"), sides: Math.round(h("#pf-t-sides button")), look: Math.round(h("#pf-t-look")), overview: !!document.querySelector("#pf-overview"), lit: document.querySelectorAll(".pfp-views a.on").length };
    });
    const f = await fit(p), pr = await text(p, "#pf-t-print"), q = await text(p, "#pf-t-qty");
    const label = `${ph}${wide ? " (wide font)" : ""}${now === SATURDAY ? ", Saturday" : ""}`;
    ck(`${label}: Buy / Sell in the book's head is ${bs?.h} px tall; the ticket takes Overview's place under the preview line, neither of the book's two views lit; inputs at 16 px, the sides ${m.sides} px and Look up ${m.look} px tall`, !!bs && bs.h >= 44 && bs.text === "Buy / Sell" && !m.overview && m.lit === 0 && f.first && m.input === 16 && m.value === 16 && m.by === 16 && m.sides >= 44 && m.look >= 44, { bs, m, f });
    ck(`${label}: the print ("${pr}") and the size ("${q}") whole: nothing cut, no sideways scroll (${f.sideways})`, (now === SATURDAY ? /^last 2,987\.0 JPY · 20 Nov 14:30 SGT · 20 h 30 min old · Yahoo Finance, unofficial$/ : /21 min old/).test(pr ?? "") && q === "→ Buy 1,000 shares (100-share lots)" && f.cut.length === 0 && f.sideways <= 0 && f.inside && errs.length === 0, { pr, q, f, errs });
    await ctx.close();
  }

  await b.close();
  console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
