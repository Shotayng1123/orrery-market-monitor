// The one-screen header in a wider drawing and with classic scrollbars (the designer's notes of 22 Nov 2026, Part A,
// revision 2: its check A.7 (i) and (j), and A.5's last step), run beside e2e/header.cjs ((a) to (h)), which it was
// part of until the check grew past the runner's six minutes. What follows is the header suite's own description. It
// replaces the paper portfolio suite's loop of the one-screen header (e2e/portfolio.cjs, 21 Nov: two checks failed on
// GitHub's machines, where the row was full and took a second line, and a FULL step pressed in the row).
// On the local copy (5179). Nothing here reads the machine's clock: every page sets `om_mock_now` (Tue 24 Nov 2026,
// 07:10 SGT) and "DATA OK", "↻ 10:00" and a 14-letter account are written into the chips (the live page's longest
// states). Lengths are CSS px of the page's layout (a screen px over the zoom). Both tab counts: seven (the paper
// portfolio's switch on, as in the local copy) and six (`om_paper` "0", as on the published page). At 16 windows and
// text sizes from a layout of 1,310 x 560 (the floor's heights among them):
//   (a) one row: the header at most 25 px tall, and no item of it ends right of the window
//   (b) the margin: the alert line's holder at least 103 px wider than the line's promise (its own width with the holder
//       unconstrained and the name replaced by its first 8 characters and "…"), in its longest states written in: a
//       lit stock move of 10 characters ("+12,345.6%") intraday and at close, a σ move of 10, a news alert, each with a
//       36-character name or a 70-character headline, the time "23 Nov 23:55"
//   (c) what shows: the stand-in alert whole; in each longest state the label, kind, figure, word and time whole and the
//       name's box at least its promise (its first 8 characters and "…", or the whole name where that is narrower),
//       measured as the fit measures it; the names "USD/JPY", "S&P 500", "TOPIX" and "Nintendo" whole; no fit class
//   (d) no sideways scroll with the focus in the search box, with a letter typed and the list open, and with a
//       33-character query; the box 88 px; no item moved; still one row
//   (e) the menu (≡): inside the window, no sideways scroll, nothing in it cut; the three clocks, TEXT SIZE, COMPACT,
//       FULL, the account; Escape closes it with the focus on ≡; a second press and a press outside close it
//   (f) FULL from the menu: the header gone, key 7 opens PORTFOLIO (seven tabs), Escape: one row again, the layout kept
//   (g) the floor: no one-screen layout in a layout under 1,310 x 560, and COMPACT's tooltip says why
//   (h) outside the one-screen layout nothing changed: the clocks in the row, no ≡, the account in the row
//   (i) a wider drawing: DejaVu Sans forced, (a), (c) and (d) at 1280x720 and 1507x900 L, seven tabs; DejaVu Sans with
//       0.9 px added to every letter at text M in 1420, 1440 and 1460 px windows, and 2 px added in the Monitor's own
//       faces at 1179x800, 1310x800 M and 1507x900 L: every part the line shows is whole and, wherever the name is shown,
//       its box is at least its promise (the fit may have taken a step; the name is hidden only by its second)
//   (j) a desktop scrollbar: a browser that draws classic scrollbars, at the floor's five windows, on each tab and with
//       the menu, the search list, the alert list and Help open: the page never scrolls up and down, no bar takes width
// It must pass as installed and GitHub's way (letters on whole px): the margin is twice the largest difference the
// designer measured between the two (51.5 px).
// Run from web/:  node e2e/run.cjs header-wide   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 2400)}`); };
const MORNING = "2026-11-23T23:10:00Z";
const MARGIN = 103;
const WINDOWS = [[1179, 800, "AUTO"], [1280, 720, "AUTO"], [1366, 768, "AUTO"], [1440, 900, "AUTO"], [1536, 864, "AUTO"], [1610, 1000, "AUTO"], [1920, 1080, "AUTO"], [1114, 800, "S"], [1310, 800, "M"], [1420, 900, "M"], [1507, 900, "L"], [1633, 1000, "L"], [1769, 1000, "XL"],
  [1310, 560, "M"], [1507, 644, "L"], [1769, 756, "XL"]];   // the floor's heights last
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
const longChips = (p) => p.evaluate(() => { document.querySelector("#hlth").lastChild.nodeValue = "OK"; document.querySelector("#nxt").lastChild.nodeValue = "10:00"; const u = document.querySelector("#userchip"); if (u) u.firstChild.nodeValue = "ABCDEFGHIJKLMN"; });

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
  const S = { sigma: { kd: "σ move", nm: "Mitsubishi UFJ Financial Group, Inc.", fig: "-12,345.6σ", q: null, src: null },
    stock: { kd: null, nm: "Mitsubishi UFJ Financial Group, Inc.", fig: "+12,345.6%", q: "intraday", src: null },
    close: { kd: null, nm: "Mitsubishi UFJ Financial Group, Inc.", fig: "+12,345.6%", q: "at close", src: null },
    news: { kd: "guidance", nm: "Two lenders agree to merge their Japanese trust banking units by April", fig: null, q: null, src: "via Reuters" },
    // the names of 8 characters or fewer, which are never cut (A.2.4)
    usdjpy: { kd: "σ move", nm: "USD/JPY", fig: "+2.7σ", q: null, src: null }, sp500: { kd: null, nm: "S&P 500", fig: "-3.4%", q: "intraday", src: null },
    topix: { kd: null, nm: "TOPIX", fig: "-3.2%", q: "1D", src: null }, nintendo: { kd: null, nm: "Nintendo", fig: "-11.2%", q: "intraday", src: null } }[name];
  const show = (e, v) => { e.style.display = v == null ? "none" : ""; if (v != null) e.textContent = v; };
  if (!S) { show(kd, null); show(src, null); nm.textContent = window.__std.nm; show(fig, window.__std.fig); show(q, window.__std.q); t.textContent = window.__std.t; k.textContent = window.__std.k; al.classList.toggle("new", window.__std.lit); }
  else { al.classList.add("new"); k.textContent = "NEW ALERT"; t.textContent = "23 Nov 23:55"; show(kd, S.kd); nm.textContent = S.nm; show(fig, S.fig); show(q, S.q); show(src, S.src); }
  return name;
};
// the line's promise in its present state: its own width with the holder unconstrained and the name's text replaced by
// its first 8 characters and "…" (whole when it has 8 or fewer); "via" left out
const PROMISE = () => {
  const z = Number(document.body.style.zoom) || 1, a = document.querySelector("#alerts"), al = a.querySelector(".alrt"), nm = al.querySelector(".nm"), src = al.querySelector(".one > .src");
  const cls = a.className, sv = { a: a.getAttribute("style"), al: al.getAttribute("style"), src: src && src.style.display, nm: nm.textContent };
  a.classList.remove("a-nolabel", "a-min", "a-refuse"); if (src) src.style.display = "none"; a.style.flex = "none"; a.style.width = "2400px"; al.style.maxWidth = "none";
  const ch = [...sv.nm]; if (ch.length > 8) nm.textContent = ch.slice(0, 8).join("") + "…";
  const w = al.getBoundingClientRect().width / z;
  nm.textContent = sv.nm; a.setAttribute("style", sv.a || ""); al.setAttribute("style", sv.al || ""); if (src) src.style.display = sv.src; a.className = cls;
  return Math.round(w * 10) / 10;
};
// how many characters of the name are drawn before its "…": the most k with width(first k characters and "…") at most the
// name's box, both measured in the name; the whole count when the name is whole
const shownChars = (p) => p.evaluate(() => { const nm = document.querySelector("#alerts .nm"); if (!nm || !nm.getClientRects().length) return 0; const ch = [...nm.textContent], box = nm.getBoundingClientRect().width;
  if (nm.scrollWidth <= nm.clientWidth) return ch.length;
  const w = (k) => { const s = document.createElement("span"); s.textContent = ch.slice(0, k).join("") + "…"; s.style.cssText = "position:absolute;visibility:hidden;white-space:pre;left:0;top:0"; nm.appendChild(s); const x = s.getBoundingClientRect().width; s.remove(); return x; };
  let k = 0; while (k < ch.length && w(k + 1) <= box + 0.01) k++; return k; });
// the name's box against its promise, measured as the fit measures it (Alerts.tsx promiseWidth: two hidden spans in
// the name, its first 8 characters and "…" and the whole name, the smaller of the two), with the fit's own trace
const NAMEOK = () => { const nm = document.querySelector("#alerts .nm"), a = document.querySelector("#alerts"), z = Number(document.body.style.zoom) || 1;
  const trace = { fit: a.dataset.fit ?? null, name: a.dataset.fitName ?? null, cut: a.dataset.fitCut ?? null };
  if (!nm || !nm.getClientRects().length || getComputedStyle(nm).display === "none") return { shown: false, ok: true, trace };
  const w = (t) => { const s = document.createElement("span"); s.textContent = t; s.style.cssText = "position:absolute;visibility:hidden;white-space:pre;left:0;top:0"; nm.appendChild(s); const x = s.getBoundingClientRect().width; s.remove(); return x; };
  const ch = [...nm.textContent], whole = w(nm.textContent), promise = ch.length > 8 ? Math.min(whole, w(ch.slice(0, 8).join("") + "…")) : whole, box = nm.getBoundingClientRect().width;
  return { shown: true, ok: box + 0.01 >= promise, box: Math.round(box / z * 100) / 100, promise: Math.round(promise / z * 100) / 100, whole: nm.scrollWidth <= nm.clientWidth, trace }; };
const fitClass = (p) => p.evaluate(() => (document.querySelector("#alerts").className.match(/a-(nolabel|min|refuse)/) || [""])[0]);
const lefts = (p) => p.evaluate(() => [...document.querySelectorAll("#topbar > *, #topbar .bmq > *")].filter((e) => e.id !== "search" && e.getClientRects().length && getComputedStyle(e).position !== "absolute").map((e) => Math.round(e.getBoundingClientRect().left * 10) / 10).join());
const sideways = (p) => p.evaluate(() => ({ scrollX: Math.round(scrollX), over: document.documentElement.scrollWidth - innerWidth, box: Math.round(document.querySelector("#search input").getBoundingClientRect().width / (Number(document.body.style.zoom) || 1) * 10) / 10, list: !!document.querySelector("#search .sres"), h: Math.round(document.querySelector("#topbar").getBoundingClientRect().height / (Number(document.body.style.zoom) || 1) * 10) / 10 }));
// (d): the focus in the box, then "t" typed and the list open, then a 33-character query; the row's items stay where they stood
async function typing(p) {
  const before = await lefts(p);
  await p.focus("#search input"); await p.waitForTimeout(150);
  const focus = { ...(await sideways(p)), moved: before !== (await lefts(p)) };
  await p.keyboard.type("t"); await p.waitForSelector("#search .sres .sitem", { timeout: 5000 }).catch(() => null); await p.waitForTimeout(120);
  const typed = { ...(await sideways(p)), moved: before !== (await lefts(p)) };
  await p.keyboard.type("oyota motor corporation and more"); await p.waitForTimeout(400);
  const long = { ...(await sideways(p)), moved: before !== (await lefts(p)), q: await p.evaluate(() => document.querySelector("#search input").value.length) };
  await p.fill("#search input", ""); await p.keyboard.press("Escape"); await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.waitForTimeout(80);
  const ok = [focus, typed, long].every((s) => s.scrollX === 0 && s.over <= 0 && Math.abs(s.box - 88) <= 0.6 && !s.moved && s.h <= 25) && typed.list && long.q === 33;
  return { ok, focus, typed, long };
}
// every element's own letter-spacing wider by `px` (the checker's case of A.5: DejaVu Sans and 0.9 px)
// (every value read before any is set: a child's own spacing is otherwise read with its parent's addition in it)
const spaced = (p, px) => p.evaluate((x) => { const all = [...document.body.querySelectorAll("*")].filter((e) => e.style), was = all.map((e) => parseFloat(getComputedStyle(e).letterSpacing) || 0); all.forEach((e, i) => e.style.setProperty("letter-spacing", (was[i] + x) + "px", "important")); }, px);

(async () => {
  const b = await chromium.launch(); const t0 = Date.now();
  console.log("\n[(i) a wider drawing: DejaVu Sans forced on every element, seven tabs]");
  for (const [vw, vh, size] of [[1280, 720, "AUTO"], [1507, 900, "L"]]) {
    const where = `${vw}x${vh}${size === "AUTO" ? "" : `, text ${size}`}, DejaVu Sans`;
    const { ctx, p, errs } = await open(b, { vw, vh, size });
    await go(p); await p.addStyleTag({ content: DEJAVU }); await settle(p, 400); await longChips(p); await p.waitForTimeout(150);
    const m = await measure(p), a = m.alert, f0 = await fitClass(p);
    ck(`${where}: (a) one row, ${m.h} px, nothing past the window; (c) the stand-in alert whole (${a.wholeParts.join(", ")}), no fit class`, m.term && m.rows === 1 && m.h <= 25 && m.pastWindow.length === 0 && ["label", "name", "figure", "word", "time"].every((k) => a.wholeParts.includes(k)) && f0 === "", { m, f0 });
    const shows = [];
    for (const s of ["sigma", "stock", "close", "news"]) {
      await p.evaluate(`(${STATE})(${JSON.stringify(s)})`); await p.waitForTimeout(100);
      const ms = await measure(p), al = ms.alert, want = s === "news" ? ["label", "kind", "time"] : s === "sigma" ? ["label", "kind", "figure", "time"] : ["label", "figure", "word", "time"], k = await shownChars(p), fc = await fitClass(p);
      const np = await p.evaluate(`(${NAMEOK})()`);
      shows.push({ s, ok: want.every((x) => al.wholeParts.includes(x)) && ms.rows === 1 && ms.h <= 25 && ms.sideways <= 0 && np.shown && np.ok && fc === "", k, fit: fc, np: np.ok ? undefined : np });
    }
    await p.evaluate(`(${STATE})("standin")`); await p.waitForTimeout(60);
    ck(`${where}: (c) in each longest state the label, kind, figure, word and time whole, the name 8 characters and "…" or more (${shows.map((x) => `${x.s} ${x.k}`).join(", ")}), no fit class`, shows.every((x) => x.ok), shows);
    const d = await typing(p);
    ck(`${where}: (d) no sideways scroll with the focus, with the list open and with a 33-character query, the box 88 px, nothing moved, one row`, d.ok, d);
    ck(`${where}: no page errors`, errs.length === 0, errs);
    await ctx.close();
  }
  // the checker's cases (A.5): DejaVu Sans and 0.9 px more to every letter at text M; 2 px more in the Monitor's own
  // faces. In every state: each part the line shows is whole and, wherever the name is shown, its box is at least its
  // promise; the fit may have taken a step (the label gone, or all but the label and the time), never cut a part
  const STATES = ["standin", "sigma", "stock", "close", "news", "usdjpy", "sp500", "topix", "nintendo"];
  for (const [vw, vh, size, px, dv] of [[1420, 900, "M", 0.9, true], [1440, 900, "M", 0.9, true], [1460, 900, "M", 0.9, true], [1179, 800, "AUTO", 2, false], [1310, 800, "M", 2, false], [1507, 900, "L", 2, false]]) {
    const where = `${vw}x${vh}${size === "AUTO" ? "" : `, text ${size}`}, ${dv ? "DejaVu Sans and " : ""}${px} px more to every letter`;
    const { ctx, p, errs } = await open(b, { vw, vh, size });
    await go(p); if (dv) await p.addStyleTag({ content: DEJAVU }); await settle(p, 300); await longChips(p); await spaced(p, px); await p.waitForTimeout(200);
    const bad = [], steps = [], traces = {};
    for (const s of STATES) {
      await p.evaluate(`(${STATE})(${JSON.stringify(s)})`); await p.waitForTimeout(120);
      const m = await measure(p), al = m.alert, fc = await fitClass(p), np = await p.evaluate(`(${NAMEOK})()`);
      traces[s] = np.trace;
      const shownCut = ["label", "kind", "figure", "word", "time"].filter((k) => al[k] && !al[k].hidden && al[k].shown > 0 && !al.wholeParts.includes(k));
      if (fc) steps.push(`${s}: ${fc}`);
      if (!m.term || m.rows !== 1 || shownCut.length || (np.shown && !np.ok) || (!np.shown && fc !== "a-min")) bad.push({ s, term: m.term, rows: m.rows, shownCut, fc, np });
    }
    ck(`${where}: in each of ${STATES.length} states every part the line shows is whole and the name, where shown, is at least its promise; one row${steps.length ? `; steps taken: ${steps.join(", ")}` : "; no step taken"}`, bad.length === 0 && errs.length === 0, { bad, errs });
    // the fit's trace says what it found before its steps (the orchestrator's settlement of break-3 §5.2): A.7 (b)'s
    // stock move at 2 px more, 1310x800 M, takes step 2 and names the parts it found cut
    if (vw === 1310 && px === 2) ck(`${where}: the stock move's trace: data-fit "${traces.stock?.fit}", the parts cut at the first measure "${traces.stock?.cut}", the name's box over its promise ${traces.stock?.name}`, traces.stock?.fit === "min" && !!traces.stock?.cut && /^\d+(\.\d+)?\/\d+(\.\d+)?$/.test(traces.stock?.name ?? ""), traces.stock);
    await ctx.close();
  }
  { // the page's faces 2.5 s late, every letter 3.8 px wider from the first frame (break-3 §5.1): the fallback faces are
    // no reason to refuse the layout; once the faces are in, the fit takes its second step and the row stays one row
    const { ctx, p, errs } = await open(b, { vw: 1440, vh: 900 });
    await ctx.route(/^https:\/\/fonts\.gstatic\.com\//, async (r) => { await new Promise((ok) => setTimeout(ok, 2500)); await r.continue().catch(() => {}); });
    await ctx.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "*{letter-spacing:3.8px!important}"; document.head.appendChild(st); }); });
    await p.goto(MOCK + "#market", { waitUntil: "domcontentloaded" }); await p.waitForSelector("#alerts .alrt .nm", { state: "attached", timeout: 20000 });   // its step 2 hides the name
    await p.waitForFunction(() => document.fonts.status === "loaded" && performance.now() > 3500, null, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(600);
    const r = await p.evaluate(() => { const a = document.querySelector("#alerts"), tb = document.querySelector("#topbar"), z = Number(document.body.style.zoom) || 1; return { term: document.body.classList.contains("term"), fonts: document.fonts.status, faces: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family).filter((v, i, x) => x.indexOf(v) === i), fit: a.dataset.fit ?? null, cut: a.dataset.fitCut ?? null, name: a.dataset.fitName ?? null, h: Math.round(tb.getBoundingClientRect().height / z * 10) / 10 }; });
    ck(`1440x900, the faces 2.5 s late, every letter 3.8 px wider: the one-screen layout is not refused (term: ${r.term}), the fit has taken its step "${r.fit}" on the faces as loaded (${r.faces.join(", ") || "none"}), one row (${r.h} px)`, r.term && r.h <= 25 && (r.fit === "min" || r.fit === "nolabel") && errs.length === 0, { r, errs });
    await ctx.close();
  }
  { // the fit's last step (A.2.5 step 3): 7 px more to every letter, where the row's fixed items alone pass the row (A.5)
    const { ctx, p, errs } = await open(b, { vw: 1440, vh: 900 });
    await go(p); await longChips(p); await spaced(p, 7); await p.waitForTimeout(400);
    const st = () => p.evaluate(() => { const c = document.querySelector("#cmp-ctl"); return { term: document.body.classList.contains("term"), cmp: document.body.classList.contains("cmp"), shown: !!c && c.getClientRects().length > 0 && !c.closest("#more")?.getClientRects().length, opacity: c ? getComputedStyle(c).opacity : null, title: c ? c.title : null }; });
    const r = await st();
    await p.evaluate(() => document.body.querySelectorAll("*").forEach((e) => e.style && e.style.removeProperty("letter-spacing")));
    await p.setViewportSize({ width: 1500, height: 900 }); await p.waitForTimeout(400);
    const other = await p.evaluate(() => document.body.classList.contains("term"));
    await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(400);
    const again = await st();
    ck(`1440x900, 7 px more to every letter: the one-screen layout is refused for this window and text size, COMPACT stays lit in the row at ${r.opacity} opacity and says why; another window size tries again (${other ? "one-screen" : "refused"}); back at 1440x900 it stays refused for the page's life`,
      !r.term && r.cmp && r.shown && Math.abs(Number(r.opacity) - 0.55) < 0.01 && /^COMPACT is on\. This browser draws the one-screen header wider than this window holds, so the window scrolls\. Another window size or text size tries again\. Click to turn COMPACT off\.$/.test(r.title) && other && !again.term && again.title === r.title && errs.length === 0, { r, other, again, errs });
    await ctx.close();
  }

  console.log("\n[(j) a desktop scrollbar: a browser that draws classic scrollbars, seven tabs, at the floor's windows]");
  { // Playwright starts Chromium with --hide-scrollbars; without it Chromium draws its 10-px bars, as a desktop browser
    // with classic scrollbars does: where the one-screen layout is offered the page never scrolls up and down, so no
    // bar is drawn and none takes the row's width (A.2.1)
    const bs = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    const TABS = ["market", "news", "research", "equities", "rates", "watch", "portfolio"];
    const page = () => ({ over: document.documentElement.scrollHeight - document.documentElement.clientHeight, bar: innerWidth - document.documentElement.clientWidth, term: document.body.classList.contains("term") });
    for (const [vw, vh, size] of [[1310, 560, "M"], [1507, 644, "L"], [1769, 756, "XL"], [1179, 540, "AUTO"], [1114, 540, "S"]]) {
      const { ctx, p, errs } = await open(bs, { vw, vh, size });
      await go(p); await longChips(p);
      const bad = [];
      for (const t of TABS) { await p.evaluate((h) => { location.hash = h; }, t); await p.waitForTimeout(300); const r = await p.evaluate(page); if (r.over > 0 || r.bar !== 0 || !r.term) bad.push({ t, ...r }); }
      await p.evaluate(() => { location.hash = "market"; }); await p.waitForSelector("table.mkt"); await p.waitForTimeout(250);
      const opened = [];
      await p.click("#more-btn"); await p.waitForTimeout(120); opened.push({ what: "the menu", ...(await p.evaluate(page)) }); await p.keyboard.press("Escape");
      await p.focus("#search input"); await p.keyboard.type("t"); await p.waitForSelector("#search .sres .sitem", { timeout: 5000 }).catch(() => null); await p.waitForTimeout(120); opened.push({ what: "the search list", ...(await p.evaluate(page)) });
      await p.fill("#search input", ""); await p.keyboard.press("Escape"); await p.evaluate(() => document.activeElement && document.activeElement.blur());
      await p.click("#alerts .alrt"); await p.waitForTimeout(200); opened.push({ what: "the alert list", ...(await p.evaluate(page)) }); await p.keyboard.press("Escape"); await p.mouse.click(5, vh - 5); await p.waitForTimeout(100);
      await p.click("#help-ctl"); await p.waitForTimeout(200); opened.push({ what: "Help", ...(await p.evaluate(page)) });
      const badOpen = opened.filter((x) => x.over > 0 || x.bar !== 0);
      ck(`${vw}x${vh}${size === "AUTO" ? "" : `, text ${size}`}, scrollbars drawn: on each of the seven tabs and with the menu, the search list, the alert list and Help open, the page does not scroll up and down and no bar takes width (${[...bad, ...badOpen].map((x) => `${x.t ?? x.what}: ${x.over} px, bar ${x.bar}`).join("; ") || "none"})`, bad.length === 0 && badOpen.length === 0 && errs.length === 0, { bad, badOpen, errs });
      await ctx.close();
    }
    await bs.close();
  }

  console.log(`\n${Math.round((Date.now() - t0) / 1000)} s`);
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
