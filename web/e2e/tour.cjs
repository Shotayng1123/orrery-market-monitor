// The 1-minute tour (slice 11, 23 Nov 2026; the designer's work order D/tour-storyboard.md §5.3, §7.3, §7.5): its page
// (web/public/tour/index.html: plain HTML on the Monitor's tokens and faces, no app code, no sign-in), its film and
// poster, and Help's first row, which plays the film over the Monitor, in the Home Screen app's frame too (PNAV-1,
// web/src/lib/scroller.ts: Help and the player over the frame, the bar on the foot, the page's scroll left where it
// stood). The film is the cut the owner accepted on 23 Nov
// 2026 ("intro video good to go") with the two corrections a truth check of it required the same day (the work order's
// revision 6: RATES & FX's line on the dotted curve, and SAMPLE DATA on in every frame that shows a screen): its bytes
// are held to that cut, and its own boxes are read here, so that no ffprobe
// and no browser that decodes H.264 is needed for what the file is. On a dev server {base}tour/ is answered with the
// app's page (Vite's fallback), so the page is asked for as {base}tour/index.html there; on the built site as
// {base}tour/ itself, as GitHub Pages serves it. Nothing here reads the machine's clock or depends on a face's width.
// Run from web/:  node e2e/run.cjs tour   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright"); const fs = require("fs"), path = require("path"), crypto = require("crypto");
const MOCK = "http://localhost:5179/orrery-market-monitor/", PREVIEW = "http://localhost:5187/orrery-market-monitor/";
const PUB = path.join(__dirname, "..", "public");
// the accepted cut as corrected (pdca/D/tour/accepted-r2/SHA256 in the designer's workspace): a new film is a new decision, and this line with it
const ACCEPTED = "18e7ad76cdc695a5297f62c396b607f910efc838aa677c4757aae80a2e659cd9";
// the transcript's sections, in the film's order: a kicker each, then the end line
const SECTIONS = ["MARKETS", "SETTINGS · COMPUTER", "NEWS", "RESEARCH", "EQUITIES", "RATES & FX", "SEARCH · ANY COMPANY", "WATCHLIST", "SETTINGS · PHONE", "Orrery Monitor"];
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const read = (f) => { try { return fs.readFileSync(path.join(PUB, f)); } catch { return null; } };

// ---- the film's boxes (ISO base media file format): its tracks, its codec's profile, its size, its frame timing and
// where its index stands ----
function boxes(buf, s = 0, e = buf.length) {
  const out = [];
  for (let o = s; o + 8 <= e;) {
    let size = buf.readUInt32BE(o), hdr = 8; const type = buf.toString("latin1", o + 4, o + 8);
    if (size === 1) { size = Number(buf.readBigUInt64BE(o + 8)); hdr = 16; } else if (size === 0) size = e - o;
    if (size < hdr || o + size > e) break;
    out.push({ type, at: o, body: o + hdr, end: o + size }); o += size;
  }
  return out;
}
const kid = (buf, box, type) => (box ? boxes(buf, box.body, box.end).find((b) => b.type === type) : undefined);
function film(buf) {
  const top = boxes(buf), moov = top.find((b) => b.type === "moov"), mdat = top.find((b) => b.type === "mdat");
  const tracks = (moov ? boxes(buf, moov.body, moov.end) : []).filter((b) => b.type === "trak").map((t) => {
    const mdia = kid(buf, t, "mdia"), hdlr = kid(buf, mdia, "hdlr"), mdhd = kid(buf, mdia, "mdhd"), tkhd = kid(buf, t, "tkhd");
    const v1 = (b) => buf[b.body] === 1, scale = buf.readUInt32BE(mdhd.body + (v1(mdhd) ? 20 : 12));
    const units = v1(mdhd) ? Number(buf.readBigUInt64BE(mdhd.body + 24)) : buf.readUInt32BE(mdhd.body + 16), wo = v1(tkhd) ? 88 : 76;
    const stbl = kid(buf, kid(buf, mdia, "minf"), "stbl"), stts = kid(buf, stbl, "stts"), stsd = kid(buf, stbl, "stsd");
    let frames = 0; const deltas = new Set();
    for (let i = 0, n = buf.readUInt32BE(stts.body + 4); i < n; i++) { frames += buf.readUInt32BE(stts.body + 8 + i * 8); deltas.add(buf.readUInt32BE(stts.body + 12 + i * 8)); }
    const entry = boxes(buf, stsd.body + 8, stsd.end)[0], avcC = entry && entry.type === "avc1" ? boxes(buf, entry.body + 78, entry.end).find((b) => b.type === "avcC") : undefined;
    return { handler: buf.toString("latin1", hdlr.body + 8, hdlr.body + 12), seconds: units / scale, w: buf.readUInt32BE(tkhd.body + wo) / 65536, h: buf.readUInt32BE(tkhd.body + wo + 4) / 65536,
      codec: entry?.type ?? null, profile: avcC ? buf[avcC.body + 1] : null, frames, fps: deltas.size === 1 ? scale / [...deltas][0] : null, deltas: [...deltas] };
  });
  return { order: top.map((b) => b.type), moovFirst: !!moov && !!mdat && moov.at < mdat.at, tracks };
}
// a JPEG's size, from its first frame header
const jpeg = (buf) => { if (!buf || buf[0] !== 0xff || buf[1] !== 0xd8) return null; for (let o = 2; o + 9 < buf.length;) { if (buf[o] !== 0xff) return null; const m = buf[o + 1];
  if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(o + 7), h: buf.readUInt16BE(o + 5) }; o += 2 + buf.readUInt16BE(o + 2); } return null; };

// ---- the page, as a reader's browser draws it ----
const pageState = (p) => p.evaluate(async () => {
  const v = document.querySelector("video"), f = document.querySelector(".film"), box = (e) => (e ? e.getBoundingClientRect() : null), r = box(v);
  const go = [...document.querySelectorAll("a")].find((a) => /Open the Monitor/.test(a.textContent)), brand = document.querySelector("a.brand"), det = document.querySelector("details");
  const sec = det ? [...det.querySelectorAll("h2")].map((h) => ({ h: h.textContent, lines: (() => { const out = []; for (let n = h.nextElementSibling; n && n.tagName === "P"; n = n.nextElementSibling) out.push(n.textContent); return out; })() })) : [];
  const poster = v ? await fetch(v.poster).then((x) => ({ status: x.status, type: x.headers.get("content-type") }), () => null) : null;
  return { title: document.title, h1: document.querySelector("h1")?.textContent ?? null, kicker: document.querySelector(".k")?.textContent ?? null, app: !!document.querySelector("#root, .gatewrap, #topbar, script[type=module]"),
    video: v ? { src: v.currentSrc || v.src, poster: v.poster, playsinline: v.hasAttribute("playsinline"), muted: v.hasAttribute("muted") && v.muted, controls: v.hasAttribute("controls"), autoplay: v.hasAttribute("autoplay"), preload: v.getAttribute("preload"), label: v.getAttribute("aria-label") } : null,
    w: r ? Math.round(r.width * 10) / 10 : null, h: r ? Math.round(r.height * 10) / 10 : null, left: r ? Math.round(r.left) : null, fw: box(f) ? Math.round(box(f).width * 10) / 10 : null, fh: box(f) ? Math.round(box(f).height * 10) / 10 : null, fl: box(f) ? Math.round(box(f).left) : null, vw: document.documentElement.clientWidth, over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    go: go ? go.href : null, brand: brand ? brand.href : null, note: document.querySelector(".note")?.textContent ?? "", summary: det?.querySelector("summary")?.textContent ?? null, sec, poster };
});
const meta = (p) => p.evaluate(() => new Promise((res) => { const v = document.querySelector("video");
  if (!v.canPlayType('video/mp4; codecs="avc1.64002A"')) return res({ skip: true });
  const done = () => res({ d: v.duration, w: v.videoWidth, h: v.videoHeight }); if (v.readyState >= 1) return done();
  v.addEventListener("loadedmetadata", done, { once: true }); v.addEventListener("error", () => res({ err: v.error && v.error.code }), { once: true }); setTimeout(() => res({ timeout: v.readyState }), 15000); }));
const playing = (p, ms) => p.evaluate((ms) => new Promise((res) => setTimeout(() => { const v = document.querySelector("video"); res({ paused: v.paused, t: Math.round(v.currentTime * 100) / 100, autoplay: v.autoplay }); }, ms)), ms);
// a film that starts by itself has moved within 8 s, however slow the machine (a slower one only waits longer)
const started = async (p) => { await p.waitForFunction(() => { const v = document.querySelector("video"); return !v.paused && v.currentTime > 0; }, null, { timeout: 8000 }).catch(() => undefined); return playing(p, 0); };

(async () => {
  console.log("\n[the film and its poster, as files (web/public/tour)]");
  { const mp4 = read("tour/orrery-tour.mp4"), sha = mp4 ? crypto.createHash("sha256").update(mp4).digest("hex") : null;
    ck(`the film is the cut the owner accepted on 23 Nov 2026, with its two corrections of that day (sha256 ${ACCEPTED.slice(0, 12)}…, ${mp4 ? mp4.length.toLocaleString("en-US") : "no"} bytes, at most 16 MB)`, sha === ACCEPTED && mp4.length <= 16e6, { sha, bytes: mp4?.length });
    const m = mp4 ? film(mp4) : null, v = m?.tracks.find((t) => t.handler === "vide");
    ck(`its boxes: one track, video, H.264 High (avc1, profile ${v?.profile}), ${v?.w}x${v?.h}, ${v?.frames} frames each 1/${v?.fps} s, ${v ? v.seconds.toFixed(2) : "?"} s; no sound track; the index (moov) before the pictures (mdat), so a player starts before the whole file has come`,
      !!m && m.moovFirst && m.tracks.length === 1 && !!v && v.codec === "avc1" && v.profile === 100 && v.w === 1080 && v.h === 1350 && v.fps === 60 && v.seconds >= 58 && v.seconds <= 62 && Math.abs(v.frames / 60 - v.seconds) < 1e-6 && !m.tracks.some((t) => t.handler === "soun"), m && { order: m.order, tracks: m.tracks });
    const poster = jpeg(read("tour/poster.jpg"));
    ck(`the player's still is a JPEG of the film's own size and shape, 4:5 (${poster ? `${poster.w}x${poster.h}` : "none"})`, !!poster && poster.w === 1080 && poster.h === 1350, poster);
    const html = (read("tour/index.html") ?? "").toString();
    ck("the page is plain HTML: no script file, no module, nothing of the app's code or its sign-in, no address but the site's own and the fonts' host, no email address and nothing of the local copy's stand-ins", html.length > 1000 && !/<script[^>]+src=|type="module"|\/src\/|assets\/|fakeapi|supabase|om_token|om_mock|stand-in|mock\.local/i.test(html) && !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(html) && [...html.matchAll(/(?:href|src)="(https?:[^"]+)"/g)].every((x) => /^https:\/\/fonts\.googleapis\.com(\/|$)/.test(x[1])), html.length); }

  const b = await chromium.launch();
  for (const [where, url] of [["the dev server", MOCK + "tour/index.html"], ["the built site", PREVIEW + "tour/"]]) {
    for (const [name, opts, phone] of [["a phone (iPhone 13)", { ...devices["iPhone 13"] }, true], ["a computer (1440x900)", { viewport: { width: 1440, height: 900 } }, false]]) {
      console.log(`\n[the tour's page on ${name}, from ${where}]`);
      const ctx = await b.newContext(opts), p = await ctx.newPage(), errs = [], asked = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("request", (r) => asked.push(r.url()));
      const res = await p.goto(url, { waitUntil: "load" }); const s = await pageState(p), base = new URL("../", url.replace(/index\.html$/, "")).href;
      ck(`it opens with no sign-in and no page error (${res.status()}): "${s.title}", "${s.h1}", "${s.kicker}"`, res.status() === 200 && !s.app && s.title === "The 1-minute tour · Orrery Monitor" && s.h1 === "The one-minute tour" && s.kicker === "1:00 · tab by tab · captions · no sound" && errs.length === 0 && !asked.some((u) => /fakeapi|supabase/.test(u)), { s: { ...s, sec: s.sec.length }, errs });
      ck("the film: playsinline, muted, controls, autoplay, preload metadata, its poster and its file beside the page, named for a screen reader", !!s.video && s.video.playsinline && s.video.muted && s.video.controls && s.video.autoplay && s.video.preload === "metadata" && s.video.src === base + "tour/orrery-tour.mp4" && s.video.poster === base + "tour/poster.jpg" && /1-minute tour/.test(s.video.label ?? "") && s.poster?.status === 200 && /image\/jpeg/.test(s.poster?.type ?? ""), { video: s.video, poster: s.poster });
      ck(phone ? `edge to edge on a phone: the film's frame ${s.fw} x ${s.fh} px from x ${s.fl} in a ${s.vw}-px screen (4:5; the film ${s.w} px wide inside its hairlines), nothing wider than the screen` : `up to 560 px on a computer: the film's frame ${s.fw} x ${s.fh} px (4:5), nothing wider than the window`,
        (phone ? s.fw === s.vw && s.fl === 0 && s.w === s.vw : s.fw <= 560 && s.fw >= 400) && Math.abs(s.fh - s.fw * 1.25) <= 1 && s.over <= 0, { w: s.w, h: s.h, fw: s.fw, fh: s.fh, fl: s.fl, vw: s.vw, over: s.over });
      ck("\"Open the Monitor →\" and the mark with the name go to the Monitor", s.go === base && s.brand === base, { go: s.go, brand: s.brand, base });
      ck("the line under it says the screens show sample data, and where every column is explained (on a phone, in the menu under ≡)", /The screens in the tour show sample data: every figure, headline and alert in it is made up\./.test(s.note) && /behind the \? in its header \(on a phone, in the menu under ≡\)/.test(s.note), s.note);
      ck(`"Read the tour instead": the captions as text, a section for each of the film's ${SECTIONS.length - 1} kickers and its end line (${s.sec.map((x) => `${x.h} ${x.lines.length}`).join(", ")})`, s.summary === "Read the tour instead" && JSON.stringify(s.sec.map((x) => x.h)) === JSON.stringify(SECTIONS) && s.sec.every((x) => x.lines.length >= 1 && x.lines.every((l) => l.length >= 10)) && s.sec[9].lines[0] === "A model of the markets, small enough to see whole.", s.sec);
      await p.locator("details summary").click(); await p.waitForTimeout(150);
      const shown = await p.evaluate(() => { const d = document.querySelector("details"), r = d.getBoundingClientRect(); return { open: d.open, h: Math.round(r.height), over: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
      ck(`opened, the words are drawn (${shown.h} px) and nothing is wider than the screen`, shown.open && shown.h > 400 && shown.over <= 0, shown);
      // a wider drawing than any machine's (a forced monospace, every letter 0.1em apart): the words wrap, nothing runs off
      await p.addStyleTag({ content: "*{font-family:monospace!important;letter-spacing:.1em!important}" }); await p.waitForTimeout(150);
      ck("in a much wider face, still nothing wider than the screen", (await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
      const m = await meta(p);
      if (m.skip) console.log("  · this browser does not play H.264: the film's size and length are read from its boxes above");
      else ck(`the browser reads the film: ${m.d} s, ${m.w}x${m.h}`, m.d >= 58 && m.d <= 62 && m.w === 1080 && m.h === 1350, m);
      if (!m.skip) { const pl = await started(p); ck(`with no wish for less motion it starts by itself, muted (at ${pl.t} s)`, !pl.paused && pl.t > 0, pl); }
      await p.evaluate(() => document.querySelector("video").pause()); await ctx.close();
    }
  }
  for (const [name, opts] of [["a phone", { ...devices["iPhone 13"] }], ["a computer", { viewport: { width: 1440, height: 900 } }]]) {
    console.log(`\n[a reader who asked for less motion, on ${name} (the built site)]`);
    const ctx = await b.newContext({ ...opts, reducedMotion: "reduce" }), p = await ctx.newPage(); await p.goto(PREVIEW + "tour/", { waitUntil: "load" });
    const pl = await playing(p, 2500); ck(`the film does not start by itself (autoplay ${pl.autoplay}, paused ${pl.paused}, at ${pl.t} s); its controls start it`, pl.paused && !pl.autoplay && pl.t === 0, pl); await ctx.close();
  }

  // ---- Help's row ----
  // on a phone ? is in the menu under ≡, which is opened only when it is shut (after Help it can still be open)
  const help = async (p, phone) => { if (phone) { const m = p.locator("#pv2-btns button[aria-expanded]"); if ((await m.getAttribute("aria-expanded")) !== "true") { await m.tap(); await p.waitForTimeout(250); } await p.locator("#help-ctl").tap(); } else await p.click("#help-ctl"); await p.waitForSelector(".helpwrap", { timeout: 5000 }); await p.waitForTimeout(250); };
  const st = (p) => p.evaluate(() => { const v = document.querySelector(".tourwrap video"), r = v?.getBoundingClientRect(), box = document.querySelector(".tourbox")?.getBoundingClientRect(), first = document.querySelector(".helpsec"), row = document.querySelector("#help-tour"), play = row?.querySelector("button");
    return { help: !!document.querySelector(".helpwrap"), player: !!v, href: location.href, mark: window.__tourMark === 1, first: first ? { h: first.querySelector("h4")?.textContent, dt: first.querySelector("dt")?.textContent, dd: first.querySelector("dd")?.firstChild?.textContent ?? null, play: play ? { text: play.textContent, h: Math.round(play.getBoundingClientRect().height), w: Math.round(play.getBoundingClientRect().width) } : null, rowIsFirst: first.querySelector("dl > div") === row } : null,
      video: v ? { src: v.currentSrc || v.src, poster: v.poster, controls: v.controls, playsinline: v.hasAttribute("playsinline"), muted: v.muted, autoplay: v.autoplay, paused: v.paused, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(r.left), right: Math.round(r.right) } : null, vw: innerWidth, vh: innerHeight }; });
  for (const [name, opts, phone] of [["a computer (1440x900)", { viewport: { width: 1440, height: 900 } }, false], ["a computer (1280x720)", { viewport: { width: 1280, height: 720 } }, false], ["a phone (iPhone 13)", { ...devices["iPhone 13"] }, true], ["a phone (360x640)", { ...devices["iPhone 13"], viewport: { width: 360, height: 640 } }, true]]) {
    console.log(`\n[Help › Start here › Watch the 1-minute tour, on ${name}]`);
    const ctx = await b.newContext(opts); await ctx.addInitScript(() => { try { localStorage.setItem("om_a2hs_hide", "1"); localStorage.setItem("om_mock_now", "2026-11-24T01:20:00Z"); } catch {} });
    const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForSelector(phone ? ".mp-row" : "table.mkt"); await p.waitForTimeout(300);
    await help(p, phone); await p.evaluate(() => { window.__tourMark = 1; }); const s0 = await st(p);
    ck(`Help's first section is "${s0.first?.h}", its row "${s0.first?.dt}": "${s0.first?.dd}", with PLAY under it${phone ? ` (${s0.first?.play?.w} x ${s0.first?.play?.h} px, a thumb's size)` : ""}`, s0.first?.h === "Start here" && s0.first.dt === "Watch the 1-minute tour" && s0.first.dd === "What each tab shows and what you can set, in one minute, with captions and no sound." && s0.first.rowIsFirst && s0.first.play?.text === "PLAY" && (!phone || (s0.first.play.h >= 44 && s0.first.play.w >= 44)), s0.first);
    await p.locator("#help-tour button").click(); await p.waitForSelector(".tourwrap video", { timeout: 5000 }); await p.waitForTimeout(400); const s1 = await st(p);
    ck(`PLAY opens the film over the Monitor: its file and its still from the site, controls, playsinline, muted, starting by itself; ${s1.video?.w} x ${s1.video?.h} px (4:5) ${phone ? "edge to edge" : "up to 560 px"}, inside the window (${s1.video?.top} to ${s1.video?.bottom} of ${s1.vh})`,
      s1.player && s1.help && s1.video.src === MOCK + "tour/orrery-tour.mp4" && s1.video.poster === MOCK + "tour/poster.jpg" && s1.video.controls && s1.video.playsinline && s1.video.muted && s1.video.autoplay && Math.abs(s1.video.h - s1.video.w * 1.25) <= 1 && (phone ? s1.video.w >= s1.vw - 1 : s1.video.w <= 560) && s1.video.left >= 0 && s1.video.right <= s1.vw && s1.video.top >= 0 && s1.video.bottom <= s1.vh, s1.video && { ...s1.video, vw: s1.vw, vh: s1.vh });
    if (phone) {
      // the player's head in a much wider face (a forced monospace, every letter 0.2em apart): the film stays whole in the window
      await p.addStyleTag({ content: ".tourhead,.tourhead *{font-family:monospace!important;letter-spacing:.2em!important}" }); await p.waitForTimeout(150); const sw = await st(p);
      ck(`in a much wider face the head may wrap, and the film is still whole in the window (${sw.video?.top} to ${sw.video?.bottom} of ${sw.vh})`, !!sw.video && sw.video.top >= 0 && sw.video.bottom <= sw.vh && sw.video.right <= sw.vw, sw.video);
      await p.evaluate(() => history.back()); await p.waitForTimeout(500); const s2 = await st(p);
      ck("Back closes the player, and Help stays open under it", !s2.player && s2.help && s2.mark, { player: s2.player, help: s2.help });
      await p.evaluate(() => history.back()); await p.waitForTimeout(500); const s3 = await st(p);
      ck("a second Back closes Help; the page is the same page on the same tab (no navigation)", !s3.player && !s3.help && s3.mark && s3.href === s0.href, { s3: { help: s3.help, href: s3.href, mark: s3.mark }, was: s0.href });
      await help(p, true); await p.locator("#help-tour button").tap(); await p.waitForSelector(".tourwrap video"); await p.waitForTimeout(300);
      await p.locator(".tourwrap .tourclose").tap(); await p.waitForTimeout(500); const s4 = await st(p);
      await p.evaluate(() => history.back()); await p.waitForTimeout(500); const s5 = await st(p);
      ck("CLOSE takes the player away and leaves Help open; then one Back closes Help, on the same page", !s4.player && s4.help && !s5.help && s5.mark && s5.href === s0.href, { s4: { player: s4.player, help: s4.help }, s5: { help: s5.help, href: s5.href } });
    } else {
      await p.keyboard.press("Escape"); await p.waitForTimeout(250); const s2 = await st(p);
      ck("Esc closes the player only: Help is still open", !s2.player && s2.help, { player: s2.player, help: s2.help });
      await p.keyboard.press("Escape"); await p.waitForTimeout(250); const s3 = await st(p);
      ck("a second Esc closes Help; no navigation has happened (the same page, the same address)", !s3.help && s3.mark && s3.href === s0.href, { help: s3.help, mark: s3.mark, href: s3.href });
      await help(p, false); await p.locator("#help-tour button").click(); await p.waitForSelector(".tourwrap video"); await p.waitForTimeout(300);
      await p.mouse.click(5, 5); await p.waitForTimeout(250); const s4 = await st(p);
      await p.locator("#help-tour button").click(); await p.waitForSelector(".tourwrap video"); await p.waitForTimeout(300); await p.locator(".tourwrap .tourclose").click(); await p.waitForTimeout(250); const s5 = await st(p);
      ck("a click outside the film closes the player, and so does CLOSE; Help stays open each time", !s4.player && s4.help && !s5.player && s5.help, { s4: { player: s4.player, help: s4.help }, s5: { player: s5.player, help: s5.help } });
    }
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }
  // the edges (flow.md §2.3): the text sizes, which zoom the page (the player's limits are divided by the zoom), the
  // one-screen layout's least windows, the narrowest phone, a phone on its side and the classic phone layout
  for (const [name, opts, kind, prefs] of [["a computer, text XL (1440x900)", { viewport: { width: 1440, height: 900 } }, "pc", { size: "XL", compact: false }], ["the one-screen layout at text XL's least window (1769x756)", { viewport: { width: 1769, height: 756 } }, "pc", { size: "XL", compact: true }],
    ["the one-screen layout's floor at AUTO (1179x540)", { viewport: { width: 1179, height: 540 } }, "pc", { size: "AUTO", compact: true }], ["a computer, text S (1280x720)", { viewport: { width: 1280, height: 720 } }, "pc", { size: "S", compact: false }],
    ["a 320-px phone (320x568)", { ...devices["iPhone 13"], viewport: { width: 320, height: 568 } }, "phone", null], ["a phone on its side (iPhone 13, 844x390)", { ...devices["iPhone 13 landscape"] }, "side", null], ["the classic phone layout (iPhone 13)", { ...devices["iPhone 13"] }, "classic", null]]) {
    console.log(`\n[Help's player at the edges: ${name}]`);
    const ctx = await b.newContext(opts); await ctx.addInitScript(([pr, classic]) => { try { localStorage.setItem("om_a2hs_hide", "1"); localStorage.setItem("om_mock_now", "2026-11-24T01:20:00Z"); if (pr) localStorage.setItem("om_prefs", JSON.stringify({ ...pr, v: 2 })); if (classic) localStorage.setItem("om_phone_v2", "0"); } catch {} }, [prefs, kind === "classic"]);
    const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForSelector(kind === "pc" || kind === "classic" ? "#help-ctl" : ".mp-row"); await p.waitForTimeout(300);
    const layout = await p.evaluate(() => ({ pv2: document.body.classList.contains("pv2"), term: document.body.classList.contains("term"), z: document.body.style.zoom || "1" }));
    if (kind === "phone" || kind === "side") await help(p, true); else { await p.locator("#help-ctl").click(); await p.waitForSelector(".helpwrap", { timeout: 5000 }); await p.waitForTimeout(250); }
    await p.locator("#help-tour button").click(); await p.waitForSelector(".tourwrap video", { timeout: 5000 }); await p.waitForTimeout(400); const s1 = await st(p), v = s1.video;
    const inside = !!v && v.top >= 0 && v.bottom <= s1.vh && v.left >= 0 && v.right <= s1.vw && Math.abs(v.h - v.w * 1.25) <= 1;
    const size = kind === "pc" ? v.w <= 561 : kind === "phone" ? v.w >= s1.vw - 1 : true;
    ck(`${layout.pv2 ? "the phone layout" : layout.term ? "the one-screen layout" : "the scrolling layout"} at zoom ${layout.z}: the film ${v?.w} x ${v?.h} px (4:5)${kind === "pc" ? ", at most 560 px" : kind === "phone" ? ", edge to edge" : ""}, its box inside the window (${v?.top} to ${v?.bottom} of ${s1.vh}, ${v?.left} to ${v?.right} of ${s1.vw})`,
      inside && size && (kind !== "classic" || !layout.pv2) && (kind === "classic" || kind === "pc" || layout.pv2), { layout, v, vw: s1.vw, vh: s1.vh });
    if (kind === "pc") await p.keyboard.press("Escape"); else await p.locator(".tourwrap .tourclose").click();
    await p.waitForTimeout(400); const s2 = await st(p);
    ck(`${kind === "pc" ? "Esc" : "CLOSE"} takes the player away and Help stays open; no page errors`, !s2.player && s2.help && errs.length === 0, { s2: { player: s2.player, help: s2.help }, errs });
    await ctx.close();
  }
  // in the Home Screen app's frame (PNAV-1, web/src/lib/scroller.ts): a phone opened from the Home Screen, for an account
  // in the preview list (the local copy stands in for one with om_paper "preview", as phone-frame.cjs does), where the
  // page scrolls in #pscroll and the tab bar is the last item of a column under it. Help and the player are drawn at the
  // page's root, over the frame, and close as they do without it: Back, Esc, CLOSE and a tap outside close the player
  // first and Help after it. Meanwhile the bar stays on the window's foot and the frame where it stood (Help's one
  // scrollIntoView, for a row asked for, moves Help's own box and nothing else), and afterwards the page scrolls again,
  // with no overflow left written on html, body or #pscroll.
  const framed = async () => {
    const ctx = await b.newContext({ ...devices["iPhone 15 Pro"], viewport: { width: 393, height: 852 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      try { localStorage.setItem("om_a2hs_hide", "1"); localStorage.setItem("om_mock_now", "2026-11-24T01:20:00Z"); localStorage.setItem("om_paper", "preview"); } catch {}
      // opened from the Home Screen: navigator.standalone and display-mode standalone, as an iPhone reports them
      Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true });
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => { const m = mm(q); return /display-mode:\s*standalone/.test(q) ? Object.create(m, { matches: { value: true }, media: { value: q }, addEventListener: { value() {} }, removeEventListener: { value() {} } }) : m; };
    });
    const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.waitForTimeout(300);
    return { ctx, p, errs };
  };
  // the frame as drawn: on (the class, and #pscroll a box), its scroll and the document's, the bar and what is drawn at its
  // middle, the overflow written on html, body and #pscroll, #pscroll's own, and the marks of the history entry on screen
  const fr = (p) => p.evaluate(() => {
    const s = document.getElementById("pscroll"), nav = document.getElementById("pnav"), n = nav.getBoundingClientRect(), at = document.elementFromPoint(innerWidth / 2, (n.top + n.bottom) / 2), h = history.state || {};
    return { on: document.documentElement.classList.contains("pframe") && getComputedStyle(s).display === "block", y: s.scrollTop, max: s.scrollHeight - s.clientHeight, winY: scrollY, ih: innerHeight, bar: [n.top, n.bottom], pos: getComputedStyle(nav).position,
      over: !at ? "nothing" : at.closest(".tourwrap") ? "the player" : at.closest(".helpwrap") ? "Help" : at.closest("#pnav") ? "the bar" : at.tagName,
      left: [document.documentElement.style.overflow, document.body.style.overflow, s.style.overflow], scrolls: getComputedStyle(s).overflowY, marks: ["omTour", "omSheet"].filter((k) => h[k] === true) };
  });
  const onFoot = (f) => f.on && f.pos === "relative" && Math.abs(f.bar[1] - f.ih) <= 0.5 && Math.abs(f.bar[1] - f.bar[0] - 59) <= 0.5 && f.winY === 0;
  // a point of the window outside a box: below it, else above it, else beside it
  const outside = (p, sel) => p.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return innerHeight - r.bottom >= 8 ? [innerWidth / 2, (r.bottom + innerHeight) / 2] : r.top >= 8 ? [innerWidth / 2, r.top / 2] : [Math.max(1, r.left / 2), innerHeight / 2]; }, sel);
  // a wheel over the head (over a box of the page that scrolls by itself it would scroll that box first)
  const wheel = async (p) => { await p.mouse.move(150, 26); for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(40); } await p.waitForTimeout(350); return fr(p); };
  for (const how of ["Back", "Esc", "CLOSE", "a tap outside"]) {
    console.log(`\n[Help's player in the Home Screen app's frame (iPhone 15 Pro, 393x852, the preview account), closed by ${how}]`);
    const { ctx, p, errs } = await framed(), f0 = await fr(p);
    await help(p, true); await p.evaluate(() => { window.__tourMark = 1; }); const s0 = await st(p), f1 = await fr(p);
    await p.locator("#help-tour button").tap(); await p.waitForSelector(".tourwrap video", { timeout: 5000 }); await p.waitForTimeout(400);
    const s1 = await st(p), f2 = await fr(p), v = s1.video;
    ck(`the frame on (#pscroll at ${f0.y}, the bar ${f0.bar.map(Math.round).join("-")} on the window's foot ${f0.ih}): Help from the menu opens on "${s0.first?.h}" with PLAY (${s0.first?.play?.w} x ${s0.first?.play?.h} px), over the bar; PLAY opens the film over Help and the bar (${f2.over} at the bar's place), whole in the window (${v?.top} to ${v?.bottom} of ${s1.vh}); the bar still on the foot, the frame at ${f2.y}, the document at ${f2.winY}`,
      onFoot(f0) && s0.first?.h === "Start here" && s0.first.play?.text === "PLAY" && s0.first.play.h >= 44 && f1.over === "Help" && onFoot(f1) && f1.y === f0.y && s1.player && s1.help && !!v && v.top >= 0 && v.bottom <= s1.vh && v.left >= 0 && v.right <= s1.vw && f2.over === "the player" && onFoot(f2) && f2.y === f0.y, { f0, f1, f2, v, first: s0.first });
    const act = async (first) => {
      if (how === "Back") await p.evaluate(() => history.back());
      else if (how === "Esc") await p.keyboard.press("Escape");
      else if (how === "CLOSE") await p.locator(first ? ".tourwrap .tourclose" : ".helphead .chip-sm").tap();
      else { const [x, y] = await outside(p, first ? ".tourbox" : ".helpbox"); await p.touchscreen.tap(x, y); }
      await p.waitForTimeout(700);
    };
    await act(true); const s2 = await st(p), f3 = await fr(p);
    ck(`${how} closes the player only, and its history entry with it: Help is still open (${f3.over} at the bar's place), the bar on the foot, the frame at ${f3.y}`, !s2.player && s2.help && s2.mark && !f3.marks.includes("omTour") && f3.over === "Help" && onFoot(f3) && f3.y === f0.y, { s2: { player: s2.player, help: s2.help, mark: s2.mark }, f3 });
    await act(false); const s3 = await st(p), f4 = await fr(p), f5 = await wheel(p);
    ck(`${how} again closes Help: the same page at the same address (no navigation), no entry of the player's or Help's left (${f4.marks.join(", ") || "none"}), the bar on the foot (${f4.over} at its place), the frame at ${f4.y}; no overflow left on html, body or #pscroll (${JSON.stringify(f4.left)}; #pscroll's own ${f4.scrolls}), and a wheel scrolls the frame again (to ${Math.round(f5.y)}), the document at ${f5.winY}; no page errors`,
      !s3.player && !s3.help && s3.mark && s3.href === s0.href && f4.marks.length === 0 && f4.over === "the bar" && onFoot(f4) && f4.y === f0.y && f4.left.every((x) => x === "") && f4.scrolls === "auto" && f5.y >= Math.min(f4.y + 100, f4.max) && f5.y > f4.y && onFoot(f5) && errs.length === 0, { s3: { player: s3.player, help: s3.help, href: s3.href, mark: s3.mark }, f4, f5, errs });
    await ctx.close();
  }
  { console.log("\n[Help's player in the Home Screen app's frame scrolled down: Help asked for a row (its one scrollIntoView), PLAY, Back, Back]");
    const { ctx, p, errs } = await framed();
    await p.evaluate(() => { document.getElementById("pscroll").scrollTop = 600; }); await p.waitForTimeout(300); const f0 = await fr(p);
    // what a computer's "personal use" asks (components/PersonalUse.tsx): Help opens with that row in view
    await p.evaluate(() => window.dispatchEvent(new CustomEvent("om:help", { detail: "personal-use" }))); await p.waitForSelector(".helpwrap"); await p.waitForTimeout(500);
    const f1 = await fr(p), row = await p.evaluate(() => { const r = document.getElementById("help-personal-use").getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), body: Math.round(document.querySelector(".helpbody").scrollTop), ih: innerHeight }; });
    ck(`the frame at ${f0.y}: Help opened at a row brings that row into view (${row.top} to ${row.bottom} of ${row.ih}, Help's body scrolled to ${row.body}) and moves nothing else: the frame at ${f1.y}, the document at ${f1.winY}, the bar on the foot`,
      onFoot(f0) && f0.y === 600 && row.top >= 0 && row.bottom <= row.ih && row.body > 0 && f1.over === "Help" && f1.y === f0.y && onFoot(f1), { f0, f1, row });
    await p.locator("#help-tour button").tap(); await p.waitForSelector(".tourwrap video", { timeout: 5000 }); await p.waitForTimeout(400); const f2 = await fr(p);
    await p.evaluate(() => history.back()); await p.waitForTimeout(700); const s3 = await st(p), f3 = await fr(p);
    await p.evaluate(() => history.back()); await p.waitForTimeout(800); const s4 = await st(p), f4 = await fr(p), f5 = await wheel(p);
    ck(`PLAY there opens the film (the frame at ${f2.y}, ${f2.over} at the bar's place); Back closes the player (Help open, the frame at ${f3.y}) and Back again Help (the frame at ${f4.y}, no entry of theirs left); the bar on the foot throughout, and a wheel scrolls the frame again (to ${Math.round(f5.y)}); no page errors`,
      f2.over === "the player" && onFoot(f2) && f2.y === f0.y && !s3.player && s3.help && onFoot(f3) && f3.y === f0.y && !s4.player && !s4.help && f4.marks.length === 0 && onFoot(f4) && f4.y === f0.y && f4.left.every((x) => x === "") && f5.y >= Math.min(f4.y + 100, f4.max) && f5.y > f4.y && onFoot(f5) && errs.length === 0, { f2, f3, f4, f5, errs });
    await ctx.close(); }
  { console.log("\n[Help's player for a reader who asked for less motion]");
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }), p = await ctx.newPage(); await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForSelector("table.mkt");
    await help(p, false); await p.locator("#help-tour button").click(); await p.waitForSelector(".tourwrap video"); const pl = await p.evaluate(() => new Promise((res) => setTimeout(() => { const v = document.querySelector(".tourwrap video"); res({ autoplay: v.autoplay, paused: v.paused, t: v.currentTime }); }, 2000)));
    ck(`the film waits for its play button (autoplay ${pl.autoplay}, paused ${pl.paused}, at ${pl.t} s)`, !pl.autoplay && pl.paused && pl.t === 0, pl); await ctx.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
