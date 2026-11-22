// The one-screen header, one row by rule (the designer's notes of 22 Nov 2026, Part A, its check A.7). It replaces the
// two checks of the paper portfolio's suite that failed on GitHub's machines (e2e/portfolio.cjs, the one-screen header
// at 1280x720): the row was full there and took a second line.
// On the local copy (5179). Nothing here reads the machine's clock: every page sets `om_mock_now` (Tue 24 Nov 2026,
// 07:10 SGT) and "DATA OK" and "↻ 0:42" are written into the chips (the live page's longer states), with a 14-letter
// account. Lengths are CSS px of the page's layout (a screen px over the zoom). Both tab counts: seven (the paper
// portfolio's switch on, as in the local copy) and six (`om_paper` "0", as on the published page).
//   (a) one row: the header at most 25 px tall, and no item of it ends right of the window
//   (b) the margin: the alert line's holder at least 101 px wider than the line's longest promise (label, kind, the
//       name's first 9 characters' width, figure and word, time), in its longest states written in
//   (c) what shows: the stand-in alert whole; in each longest state everything whole but the name, which keeps 8 or
//       more characters
//   (d) no sideways scroll with the focus in the search box and with a letter typed and the list open; the box 96 px;
//       no item moved
//   (e) the menu (≡): inside the window, no sideways scroll; the three clocks, TEXT SIZE, COMPACT, FULL, the account
//   (f) the floor: no one-screen layout in a layout under 1,300 px (1100x800 AUTO, 1280x720 M, 1440x900 L)
//   (g) a wider drawing (DejaVu Sans forced): (a), (c) and (d) at 1280x720 and 1495x900 L, seven tabs
// It must pass as installed and GitHub's way (letters on whole px): the margin is twice the largest difference the
// designer measured between the two (50.4 px).
// Run from web/:  node e2e/run.cjs header   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 2400)}`); };
const MORNING = "2026-11-23T23:10:00Z";
const MARGIN = 101;
const WINDOWS = [[1170, 800, "AUTO"], [1280, 720, "AUTO"], [1366, 768, "AUTO"], [1440, 900, "AUTO"], [1536, 864, "AUTO"], [1610, 1000, "AUTO"], [1920, 1080, "AUTO"], [1105, 800, "S"], [1300, 800, "M"], [1495, 900, "L"], [1755, 1000, "XL"]];
const DEJAVU = "*{font-family:'DejaVu Sans'!important}";

async function open(b, { vw, vh, size = "AUTO", six = false, compact = true }) {
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([at, prefs, six]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_prefs", JSON.stringify(prefs)); localStorage.setItem("om_a2hs_hide", "1"); if (six) localStorage.setItem("om_paper", "0"); } catch {} }, [MORNING, { size, compact, v: 2 }, six]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  return { ctx, p, errs };
}
const settle = async (p, ms = 200) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(ms); };
const go = async (p) => { await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForSelector("table.mkt", { timeout: 20000 }); await p.waitForSelector("#alerts .alrt .nm"); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p, 300); };
// the live page's longer states of the row's chips: DATA OK, a countdown of four characters, a 14-letter account
const longChips = (p) => p.evaluate(() => { document.querySelector("#hlth").lastChild.nodeValue = "OK"; document.querySelector("#nxt").lastChild.nodeValue = " 0:42"; const u = document.querySelector("#userchip"); if (u) u.firstChild.nodeValue = "ABCDEFGHIJKLMN"; });

// The header as drawn: its height, how many rows its items stand in, what passes the window, the alert line's parts
// (each one's box cut by the line's box and by `.one` and `.core`; a part on the hidden second line of `.one` shows
// nothing), the search box.
const measure = (p) => p.evaluate(() => {
  const z = Number(document.body.style.zoom) || 1, R = (e) => e.getBoundingClientRect(), px = (x) => Math.round((x / z) * 10) / 10;
  const tb = document.querySelector("#topbar"), kids = [...tb.children].filter((e) => getComputedStyle(e).display !== "none" && getComputedStyle(e).position !== "absolute" && e.getClientRects().length);
  const tops = [...new Set(kids.map((e) => Math.round(R(e).top / z)))].sort((a, c) => a - c), rows = [];
  for (const t of tops) if (!rows.length || t - rows[rows.length - 1] > 8) rows.push(t);
  const al = document.querySelector("#alerts .alrt"), one = al && al.querySelector(".one");
  const vis = (e) => { if (!e || !e.getClientRects().length || getComputedStyle(e).display === "none") return null; const r = R(e), a = R(al), bw = parseFloat(getComputedStyle(al).borderLeftWidth) * z; let l = Math.max(r.left, a.left + bw), rr = Math.min(r.right, a.right - bw), hidden = false;
    for (const box of [e.closest(".one"), e.closest(".core")]) { if (!box || box === e) continue; const o = R(box); l = Math.max(l, o.left); rr = Math.min(rr, o.right); if (r.top >= o.bottom - 1 || r.bottom <= o.top + 1) hidden = true; }
    const cut = e.scrollWidth > e.clientWidth + 0.5; return { text: e.textContent.trim(), shown: px(hidden ? 0 : Math.max(0, rr - l)), whole: px(r.width), cut, hidden }; };
  const part = (s) => vis(al && al.querySelector(s));
  const whole = (v) => !!v && !v.hidden && !v.cut && v.shown >= v.whole - 0.6;
  const alert = al ? { cls: al.className, fit: document.querySelector("#alerts").className, holder: px(R(document.querySelector("#alerts")).width), label: part(":scope > .k"), kind: part(".kd"), name: part(".nm"), figure: part(".fig"), word: part(".q"), src: part(".src"), time: part(":scope > .t") } : null;
  if (alert) { alert.wholeParts = ["label", "kind", "name", "figure", "word", "time"].filter((k) => whole(alert[k])); }
  return { z, W: Math.round(innerWidth / z), term: document.body.classList.contains("term"), tight: document.body.classList.contains("tight"), tabs: document.querySelectorAll("#nav a").length, h: px(R(tb).height), rows: rows.length,
    pastWindow: [...tb.querySelectorAll("*")].filter((e) => e.getClientRects().length && getComputedStyle(e).position !== "absolute" && !e.closest("#more,.sres,.aldrop") && R(e).right > innerWidth + 0.5).map((e) => e.id || e.className).slice(0, 4),
    brandWords: getComputedStyle(document.querySelector("#topbar .brand .bw")).display !== "none", clock: document.querySelector("#clock").innerText.replace(/\s+/g, " ").trim(),
    alert, search: px(R(document.querySelector("#search input")).width), placeholder: document.querySelector("#search input").placeholder, sideways: document.documentElement.scrollWidth - innerWidth, scrollX: Math.round(scrollX) };
});
// the alert line's longest states, written into the line (as the designer measured them)
const STATE = (name) => {
  const al = document.querySelector("#alerts .alrt"), core = al.querySelector(".core"), k = al.querySelector(":scope > .k"), t = al.querySelector(":scope > .t");
  const nm = core.querySelector(".nm"); let fig = core.querySelector(".fig"), q = core.querySelector(".q"), kd = core.querySelector(".kd");
  if (!fig) { fig = document.createElement("span"); fig.className = "fig dn"; core.appendChild(fig); }
  if (!q) { q = document.createElement("span"); q.className = "q"; core.appendChild(q); }
  if (!kd) { kd = document.createElement("span"); kd.className = "kd"; core.insertBefore(kd, core.firstChild); }
  let src = al.querySelector(".one > .src"); if (!src) { src = document.createElement("span"); src.className = "src"; al.querySelector(".one").appendChild(src); }
  if (!window.__std) window.__std = { nm: nm.textContent, fig: fig.textContent, q: q.textContent, t: t.textContent, k: k.textContent, lit: al.classList.contains("new") };
  const S = { sigma: { kd: "σ move", nm: "Mitsubishi UFJ Financial Group, Inc.", fig: "+12.3σ", q: null, src: null },
    stock: { kd: null, nm: "Mitsubishi UFJ Financial Group, Inc.", fig: "+102.4%", q: "intraday", src: null },
    news: { kd: "guidance", nm: "Two lenders agree to merge their Japanese trust banking units by April", fig: null, q: null, src: "via Reuters" } }[name];
  const show = (e, v) => { e.style.display = v == null ? "none" : ""; if (v != null) e.textContent = v; };
  if (!S) { show(kd, null); show(src, null); nm.textContent = window.__std.nm; show(fig, window.__std.fig); show(q, window.__std.q); t.textContent = window.__std.t; k.textContent = window.__std.k; al.classList.toggle("new", window.__std.lit); }
  else { al.classList.add("new"); k.textContent = "NEW ALERT"; t.textContent = "23 Nov 23:55"; show(kd, S.kd); nm.textContent = S.nm; show(fig, S.fig); show(q, S.q); show(src, S.src); }
  return name;
};
// the line's promise in its present state: its own width with the holder unconstrained and the name held to the width
// of its first 9 characters (8 and "…")
const PROMISE = () => {
  const z = Number(document.body.style.zoom) || 1, a = document.querySelector("#alerts"), al = a.querySelector(".alrt"), nm = al.querySelector(".nm"), src = al.querySelector(".one > .src");
  const cls = a.className, sv = { a: a.getAttribute("style"), al: al.getAttribute("style"), src: src && src.style.display };
  a.classList.remove("a-nolabel", "a-min"); if (src) src.style.display = "none"; a.style.flex = "none"; a.style.width = "2400px"; al.style.maxWidth = "none";
  const tn = nm.firstChild, r = document.createRange(); r.setStart(tn, 0); r.setEnd(tn, Math.min(9, tn.nodeValue.length)); nm.style.maxWidth = `${r.getBoundingClientRect().width / z}px`;
  const w = al.getBoundingClientRect().width / z;
  nm.style.maxWidth = ""; a.setAttribute("style", sv.a || ""); al.setAttribute("style", sv.al || ""); if (src) src.style.display = sv.src; a.className = cls;
  return Math.round(w * 10) / 10;
};
// the width the name's first 9 characters take (8 and "…" in the Monitor's monospaced face)
const nineW = (p) => p.evaluate(() => { const nm = document.querySelector("#alerts .nm"), r = document.createRange(); r.setStart(nm.firstChild, 0); r.setEnd(nm.firstChild, Math.min(9, nm.firstChild.nodeValue.length)); return r.getBoundingClientRect().width / (Number(document.body.style.zoom) || 1); });
const eightKept = (v, nine) => !!v && !v.hidden && (v.shown >= v.whole - 0.6 || v.shown + 0.5 >= nine);
const lefts = (p) => p.evaluate(() => [...document.querySelectorAll("#topbar > *, #topbar .bmq > *")].filter((e) => e.id !== "search" && e.getClientRects().length && getComputedStyle(e).position !== "absolute").map((e) => Math.round(e.getBoundingClientRect().left * 10) / 10).join());
const sideways = (p) => p.evaluate(() => ({ scrollX: Math.round(scrollX), over: document.documentElement.scrollWidth - innerWidth, box: Math.round(document.querySelector("#search input").getBoundingClientRect().width / (Number(document.body.style.zoom) || 1) * 10) / 10, list: !!document.querySelector("#search .sres"), h: Math.round(document.querySelector("#topbar").getBoundingClientRect().height / (Number(document.body.style.zoom) || 1) * 10) / 10 }));
// (d): the focus in the box, then "t" typed and the list open; the row's items stay where they stood
async function typing(p) {
  const before = await lefts(p);
  await p.focus("#search input"); await p.waitForTimeout(150);
  const focus = { ...(await sideways(p)), moved: before !== (await lefts(p)) };
  await p.keyboard.type("t"); await p.waitForSelector("#search .sres .sitem", { timeout: 5000 }).catch(() => null); await p.waitForTimeout(120);
  const typed = { ...(await sideways(p)), moved: before !== (await lefts(p)) };
  await p.keyboard.press("Backspace"); await p.keyboard.press("Escape"); await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.waitForTimeout(80);
  const ok = [focus, typed].every((s) => s.scrollX === 0 && s.over <= 0 && Math.abs(s.box - 96) <= 0.6 && !s.moved && s.h <= 25) && typed.list;
  return { ok, focus, typed };
}

(async () => {
  const b = await chromium.launch(); const t0 = Date.now();
  for (const [vw, vh, size] of WINDOWS) for (const six of [false, true]) {
    const tabs = six ? "six tabs" : "seven tabs", where = `${vw}x${vh}${size === "AUTO" ? "" : `, text ${size}`}, ${tabs}`;
    const { ctx, p, errs } = await open(b, { vw, vh, size, six });
    await go(p); await longChips(p); await p.waitForTimeout(120);
    const m = await measure(p);
    ck(`${where}: (a) the one-screen layout (zoom ${m.z}, a layout of ${m.W} px) in one row, ${m.h} px tall, nothing past the window; the name's words ${m.brandWords ? "shown" : "left to the mark's tooltip"} (from 1,420 px), the clock "${m.clock}", the search box ${m.search} px ("${m.placeholder}")`,
      m.term && m.tabs === (six ? 6 : 7) && m.rows === 1 && m.h <= 25 && m.pastWindow.length === 0 && m.brandWords === (m.W >= 1420) && /^\d\d:\d\d SGT$/.test(m.clock) && Math.abs(m.search - 96) <= 0.6 && m.placeholder === "Search" && m.sideways <= 0, m);
    // (c) the stand-in alert, whole
    const a = m.alert;
    ck(`${where}: (c) the stand-in alert whole: "${[a.label, a.name, a.figure, a.word, a.time].map((v) => v && v.text).join(" · ")}" (the line's holder ${a.holder} px${a.fit.replace("a-", "") !== "" ? `, fit ${a.fit}` : ""})`,
      ["label", "name", "figure", "word", "time"].every((k) => a.wholeParts.includes(k)) && a.name.text === "KIOXIA HOLDINGS CORP." && a.figure.text === "-11.2%" && a.word.text === "intraday" && a.time.text === "07:07" && /^(NEW )?ALERT$/.test(a.label.text), a);
    // (b) and (c) in the longest states
    let least = null; const shows = [];
    for (const s of ["sigma", "stock", "news"]) {
      await p.evaluate(`(${STATE})(${JSON.stringify(s)})`); await p.waitForTimeout(60);
      const ms = await measure(p), pr = await p.evaluate(`(${PROMISE})()`), free = Math.round((ms.alert.holder - pr) * 10) / 10, al = ms.alert;
      const want = s === "news" ? ["label", "kind", "time"] : s === "sigma" ? ["label", "kind", "figure", "time"] : ["label", "figure", "word", "time"];
      const eight = eightKept(al.name, await nineW(p));
      const okState = want.every((k) => al.wholeParts.includes(k)) && eight && ms.rows === 1 && ms.h <= 25 && ms.sideways <= 0;
      shows.push({ s, free, okState, name: al.name && `${al.name.shown}/${al.name.whole}`, fit: al.fit, src: al.src && !al.src.hidden && al.src.shown > 0 });
      if (!least || free < least.free) least = { s, free, holder: al.holder, promise: pr };
      if (!okState) ck(`${where}: (c) ${s}: what shows`, false, al);
    }
    await p.evaluate(`(${STATE})("standin")`); await p.waitForTimeout(60);
    ck(`${where}: (b) the alert line's holder is ${least.free} px wider than its longest promise (${least.s}: ${least.holder} - ${least.promise}; at least ${MARGIN}), and (c) in each longest state the label, kind, figure, word and time are whole and the name keeps 8 characters or more (${shows.map((x) => `${x.s} ${x.name}`).join(", ")}); "via Reuters" ${shows[2].src ? "beside the whole headline" : "not beside a cut headline"}`,
      least.free >= MARGIN && shows.every((x) => x.okState) && !shows[2].src, shows);
    // (d) focus and typing
    const d = await typing(p);
    ck(`${where}: (d) with the focus in the box and with "t" typed and the list open: no sideways scroll (${d.focus.over}, ${d.typed.over}), the box ${d.focus.box} and ${d.typed.box} px, nothing in the row moved, the header ${d.typed.h} px`, d.ok, d);
    // (e) the menu
    await p.click("#more-btn"); await p.waitForTimeout(150);
    const e = await p.evaluate(() => { const box = document.querySelector("#more"), r = box.getBoundingClientRect(), items = [...box.children].filter((x) => x.getClientRects().length).map((x) => (x.innerText || x.textContent || "").replace(/\s+/g, " ").trim());
      return { open: document.querySelector("#topbar").classList.contains("more"), expanded: document.querySelector("#more-btn").getAttribute("aria-expanded"), inside: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight, over: document.documentElement.scrollWidth - innerWidth, scrollX: Math.round(scrollX), items }; });
    const has = (re) => e.items.some((x) => re.test(x));
    ck(`${where}: (e) the menu ≡ opens a list inside the window with no sideways scroll: ${e.items.join(" | ")}`, e.open && e.expanded === "true" && e.inside && e.over <= 0 && e.scrollX === 0 && has(/^\d\d:\d\d:\d\d SGT · \d\d:\d\d JST · \d\d:\d\d ET$/) && has(/TEXT SIZE|Text size/i) && has(/^COMPACT$/) && has(/FULL$/) && has(/^ABCDEFGHIJKLMN · ACCOUNT$/), e);
    if (vw === 1440 && !six) {   // how it closes: Escape (the focus back on the button), a second press, a click outside
      await p.keyboard.press("Escape"); await p.waitForTimeout(80);
      const esc = await p.evaluate(() => ({ open: document.querySelector("#topbar").classList.contains("more"), focus: document.activeElement && document.activeElement.id }));
      await p.click("#more-btn"); await p.waitForTimeout(60); await p.click("#more-btn"); await p.waitForTimeout(60);
      const second = await p.evaluate(() => document.querySelector("#topbar").classList.contains("more"));
      await p.click("#more-btn"); await p.waitForTimeout(60); await p.click("#topbar .brand"); await p.waitForTimeout(120);
      const outside = await p.evaluate(() => ({ open: document.querySelector("#topbar").classList.contains("more"), focus: document.activeElement && document.activeElement.id }));
      ck(`${where}: the menu closes on Escape (the focus back on ≡: "${esc.focus}"), on a second press and on a click outside (the focus "${outside.focus}")`, !esc.open && esc.focus === "more-btn" && !second && !outside.open && outside.focus === "more-btn", { esc, second, outside });
    } else { await p.keyboard.press("Escape"); await p.waitForTimeout(60); }
    ck(`${where}: no page errors`, errs.length === 0, errs);
    await ctx.close();
  }

  console.log("\n[(f) the floor: COMPACT on in a layout under 1,300 px gives the scrolling layout, and its chip says why]");
  for (const [vw, vh, size] of [[1100, 800, "AUTO"], [1280, 720, "M"], [1440, 900, "L"], [1440, 900, "XL"]]) {
    const { ctx, p, errs } = await open(b, { vw, vh, size });
    await go(p);
    const f = await p.evaluate(() => { const c = document.querySelector("#cmp-ctl"), mb = document.querySelector("#more-btn"); return { term: document.body.classList.contains("term"), cmp: document.body.classList.contains("cmp"), W: Math.round(innerWidth / (Number(document.body.style.zoom) || 1)), shown: !!c && c.getClientRects().length > 0, opacity: c ? getComputedStyle(c).opacity : null, title: c ? c.title : null, btn: mb ? getComputedStyle(mb).display : "none" }; });
    ck(`${vw}x${vh}, text ${size}, COMPACT on (a layout of ${f.W} px): no one-screen layout; COMPACT stays lit in the row at ${f.opacity} opacity and says why; no menu button`, !f.term && f.cmp && f.shown && Math.abs(Number(f.opacity) - 0.55) < 0.01 && /^COMPACT is on\. One screen per tab needs a layout 1,300 px wide: a window of 1,170 px at AUTO, 1,105 at S, 1,300 at M, 1,495 at L, 1,755 at XL\. This window scrolls\. Click to turn COMPACT off\.$/.test(f.title) && f.btn === "none" && errs.length === 0, { f, errs });
    await ctx.close();
  }
  { // the scrolling layout's row is as before: COMPACT off, no menu button, the clocks in the row, the account in the row
    const { ctx, p, errs } = await open(b, { vw: 1440, vh: 900, compact: false });
    await go(p);
    const s = await p.evaluate(() => ({ term: document.body.classList.contains("term"), btn: document.querySelector("#more-btn") ? getComputedStyle(document.querySelector("#more-btn")).display : "none", more: getComputedStyle(document.querySelector("#more")).display, clock: document.querySelector("#clock").innerText.replace(/\s+/g, " ").trim(), chips: ["#sz-ctl", "#cmp-ctl", "#userchip"].map((q) => { const e = document.querySelector(q); return !!e && e.getClientRects().length > 0; }), words: getComputedStyle(document.querySelector("#topbar .brand .bw")).display, cmpTitle: document.querySelector("#cmp-ctl").title }));
    ck(`the scrolling layout (1440x900, COMPACT off): the row as before: the clocks "${s.clock}", TEXT SIZE, COMPACT and the account in the row, no menu button, the Monitor's name in words`, !s.term && s.btn === "none" && s.more === "contents" && /^\d\d:\d\d:\d\d SGT · \d\d:\d\d JST · \d\d:\d\d ET$/.test(s.clock) && s.chips.every(Boolean) && s.words !== "none" && s.cmpTitle === "Terminal layout: one screen per tab, sized to the window" && errs.length === 0, { s, errs });
    await ctx.close();
  }

  console.log("\n[(g) a wider drawing: DejaVu Sans forced on every element, seven tabs]");
  for (const [vw, vh, size] of [[1280, 720, "AUTO"], [1495, 900, "L"]]) {
    const where = `${vw}x${vh}${size === "AUTO" ? "" : `, text ${size}`}, DejaVu Sans`;
    const { ctx, p, errs } = await open(b, { vw, vh, size });
    await go(p); await p.addStyleTag({ content: DEJAVU }); await settle(p, 400); await longChips(p); await p.waitForTimeout(120);
    const m = await measure(p), a = m.alert;
    ck(`${where}: (a) one row, ${m.h} px, nothing past the window; (c) the stand-in alert whole (${a.wholeParts.join(", ")})`, m.term && m.rows === 1 && m.h <= 25 && m.pastWindow.length === 0 && ["label", "name", "figure", "word", "time"].every((k) => a.wholeParts.includes(k)), m);
    const shows = [];
    for (const s of ["sigma", "stock", "news"]) {
      await p.evaluate(`(${STATE})(${JSON.stringify(s)})`); await p.waitForTimeout(80);
      const ms = await measure(p), al = ms.alert, want = s === "news" ? ["label", "kind", "time"] : s === "sigma" ? ["label", "kind", "figure", "time"] : ["label", "figure", "word", "time"];
      shows.push({ s, ok: want.every((k) => al.wholeParts.includes(k)) && ms.rows === 1 && ms.h <= 25 && ms.sideways <= 0 && eightKept(al.name, await nineW(p)), name: al.name && al.name.shown, fit: al.fit });
    }
    await p.evaluate(`(${STATE})("standin")`); await p.waitForTimeout(60);
    ck(`${where}: (c) in each longest state the label, kind, figure, word and time whole (the names keep ${shows.map((x) => `${x.s} ${x.name} px`).join(", ")})`, shows.every((x) => x.ok), shows);
    const d = await typing(p);
    ck(`${where}: (d) no sideways scroll with the focus and with the list open, the box 96 px, nothing moved`, d.ok, d);
    ck(`${where}: no page errors`, errs.length === 0, errs);
    await ctx.close();
  }

  console.log(`\n${Math.round((Date.now() - t0) / 1000)} s`);
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
