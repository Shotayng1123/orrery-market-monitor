// Alerts as notifications: the notifications window and the worker's handler.
// Run from web/:  node e2e/run.cjs notifications   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright"); const { routes } = require("./harness.cjs"); const crypto = require("crypto");
const PREVIEW = "http://localhost:5187/orrery-market-monitor/", MOCK = "http://localhost:5179/orrery-market-monitor/", ORIGIN = "http://localhost:5187";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const token = Buffer.from(JSON.stringify({ id: "reader@example.com" })).toString("base64") + ".sig";
const kp = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "jwk" });
const SERVER_KEY = Buffer.concat([Buffer.from([4]), Buffer.from(kp.x, "base64url"), Buffer.from(kp.y, "base64url")]).toString("base64url");
// the stand-in server: remembers this account's device, as the real one does
const srv = { key: SERVER_KEY, sub: null, calls: [] };
const api = async (p) => { await routes(p); await p.route("**/fakeapi?*", async (r) => { const a = new URL(r.request().url()).searchParams.get("action");
  const ok = (x, status = 200) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify(x) });
  if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" } });
  if (a === "me") return ok({ email: "reader@example.com", role: "user", mustChange: false });
  if (!/^push_/.test(a)) return r.fallback();
  const b = r.request().method() === "POST" ? JSON.parse(r.request().postData() || "{}") : null; srv.calls.push({ a, b, method: r.request().method(), auth: r.request().headers().authorization });
  if (a === "push_key") return ok({ key: srv.key });
  if (a === "push_state") return ok({ on: !!srv.sub && srv.sub.endpoint === b.endpoint, scope: srv.sub && srv.sub.endpoint === b.endpoint ? srv.sub.scope : null });
  if (a === "push_sub") { srv.sub = b; return ok({ on: true, scope: b.scope }); }
  if (a === "push_unsub") { srv.sub = null; return ok({ on: false, scope: null }); }
  if (a === "push_test") return srv.sub ? ok({ ok: true }) : ok({ error: "Notifications are not on for this device" }, 404);
  return ok({ error: "unknown" }, 400); }); };
// a headless browser has no push service to register with: the browser's own subscribe is replaced by one that hands back a subscription of the right shape
const fakePush = () => { const KEY = "t_push_sub"; const mk = () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/test-device-1", toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" } }; }, async unsubscribe() { sessionStorage.removeItem(KEY); return true; } });
  PushManager.prototype.subscribe = async function (o) { sessionStorage.setItem(KEY, JSON.stringify({ visible: o.userVisibleOnly, keyBytes: new Uint8Array(o.applicationServerKey).length })); return mk(); };
  PushManager.prototype.getSubscription = async function () { return sessionStorage.getItem(KEY) ? mk() : null; }; };
const win = (p) => p.evaluate(() => { const m = document.querySelector(".modal.ntf"); if (!m) return null; const r = m.getBoundingClientRect(); return { state: m.querySelector(".ntf-state")?.textContent ?? null, why: m.querySelector(".ntf-why")?.textContent ?? null, pick: m.querySelector(".pick .val")?.textContent ?? null, buttons: [...m.querySelectorAll("button.go")].map((b) => b.textContent), msg: m.querySelector(".err").textContent, ok: m.querySelector(".err").classList.contains("okmsg"), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, btnH: Math.min(...[...m.querySelectorAll("button.go")].map((b) => Math.round(b.getBoundingClientRect().height)), 999), overflowX: document.documentElement.scrollWidth - innerWidth }; });
const openWin = async (p) => { await p.evaluate(() => scrollTo(0, 0)); await p.locator("#pv2-btns button").last().tap(); await p.waitForTimeout(300); await p.locator("#ntf-ctl").tap(); await p.waitForSelector(".modal.ntf .ntf-state, .modal.ntf .ntf-why"); await p.waitForTimeout(300); };
const start = async (b, { grant = true, init = fakePush, dev = devices["iPhone 13"] } = {}) => { const ctx = await b.newContext({ ...dev }); if (grant) await ctx.grantPermissions(["notifications"], { origin: ORIGIN }); await ctx.addInitScript((t) => { try { localStorage.setItem("om_token", t); localStorage.setItem("om_a2hs_hide", "1"); } catch {} }, token); if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); await api(p); await p.goto(PREVIEW, { waitUntil: "networkidle" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(1500); await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(800); return { ctx, p, errs }; };
(async () => { const b = await chromium.launch();
  console.log("\n[the notifications window on a phone]");
  { srv.sub = null; srv.calls = []; const { ctx, p, errs } = await start(b);
    await openWin(p); const w0 = await win(p); await p.screenshot({ path: "push-off.png" }); const perm0 = await p.evaluate(() => Notification.permission);
    ck("opened from the menu: off for this device, a choice of which alerts, one button to turn them on", !!w0 && w0.state === "Off for this device" && w0.pick === "All alerts" && w0.buttons.join() === "TURN ON NOTIFICATIONS", w0);
    // a headless browser reports the permission as denied whatever was granted; the hint must follow what the browser reports
    ck(`the "blocked in settings" hint shows exactly when the browser reports notifications as denied (here: ${perm0})`, (perm0 === "denied") === /blocked in this browser's settings/.test(w0.why || ""), { perm0, why: w0.why });
    ck(`it fits the phone (button ${w0?.btnH}px tall)`, !!w0 && w0.left >= 0 && w0.right <= w0.vw && w0.top >= 0 && w0.bottom <= w0.vh && w0.btnH >= 44 && w0.overflowX <= 0, w0);
    await p.locator(".modal.ntf button.go").tap(); await p.waitForTimeout(900); const w1 = await win(p); const sub = srv.calls.find((c) => c.a === "push_sub"); const asked = await p.evaluate(() => JSON.parse(sessionStorage.getItem("t_push_sub")));
    ck("Turn on: the browser is asked for a visible-only subscription with the server's 65-byte key", !!asked && asked.visible === true && asked.keyBytes === 65, asked);
    ck("the server is given this device's address, its two keys and the choice, under the signed-in account", !!sub && sub.method === "POST" && sub.b.endpoint === "https://fcm.googleapis.com/fcm/send/test-device-1" && sub.b.p256dh.length === 87 && sub.b.auth.length === 22 && sub.b.scope === "all" && /^Bearer /.test(sub.auth || ""), sub);
    ck("the window then says it is on, and offers a test and turning off", !!w1 && w1.state === "On for this device" && w1.buttons.join() === "SEND A TEST,TURN OFF" && w1.ok && /are on for this device/.test(w1.msg), w1); await p.screenshot({ path: "push-on.png" });
    await p.locator(".modal.ntf .pick select").selectOption("mine"); await p.waitForTimeout(700); const w2 = await win(p); const last = srv.calls.filter((c) => c.a === "push_sub").pop();
    ck("Which alerts -> My watchlist only: stored at once", last.b.scope === "mine" && srv.sub.scope === "mine" && w2.pick === "My watchlist only" && /watchlist names only/.test(w2.msg), { last: last.b, w2 });
    await p.locator(".modal.ntf button.go").first().tap(); await p.waitForTimeout(700); const w3 = await win(p);
    ck("Send a test: the server is asked to send one to this device", srv.calls.some((c) => c.a === "push_test" && c.b.endpoint === sub.b.endpoint) && w3.ok && /^Sent\./.test(w3.msg), w3);
    await p.locator(".modal.ntf h3 .x").tap(); await p.waitForTimeout(300); await openWin(p); const w4 = await win(p);
    ck("closed and opened again: still on, with the stored choice", w4.state === "On for this device" && w4.pick === "My watchlist only", w4);
    await p.locator(".modal.ntf button.go.ghost").tap(); await p.waitForTimeout(800); const w5 = await win(p);
    ck("Turn off: the server forgets the device and the browser's subscription ends", srv.sub === null && srv.calls.some((c) => c.a === "push_unsub") && (await p.evaluate(() => sessionStorage.getItem("t_push_sub"))) === null && w5.state === "Off for this device" && w5.buttons.join() === "TURN ON NOTIFICATIONS", w5);
    // signing out ends the device's notifications
    await p.locator(".modal.ntf button.go").tap(); await p.waitForTimeout(800); const on = !!srv.sub; await p.locator(".modal.ntf h3 .x").tap(); await p.waitForTimeout(200);
    await p.locator("#pv2-btns button").last().tap(); await p.waitForTimeout(300); await p.locator("#userchip").tap(); await p.waitForTimeout(500); await p.locator(".modal button.go.ghost").tap(); await p.waitForSelector(".gatewrap .modal #g-id"); await p.waitForTimeout(400);
    ck("signing out turns this device's notifications off first", on && srv.sub === null && (await p.evaluate(() => sessionStorage.getItem("t_push_sub"))) === null, { on, sub: srv.sub });
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[when notifications cannot be offered]");
  { srv.sub = null; srv.key = null; const { ctx, p } = await start(b); await openWin(p); const w = await win(p);
    ck("the server has no key yet: the window says so and offers no button", /not set up on the server yet/.test(w.why || "") && w.buttons.length === 0 && w.state === null, w); srv.key = SERVER_KEY; await ctx.close(); }
  { srv.sub = null; const { ctx, p } = await start(b, { grant: false }); await openWin(p); const perm = await p.evaluate(() => Notification.permission);
    await p.locator(".modal.ntf button.go").tap(); await p.waitForTimeout(700); const w = await win(p);
    ck(`the browser refuses permission (${perm}): a plain message, nothing stored`, !w.ok && /blocked in this browser's settings/.test(w.msg + (w.why || "")) && srv.sub === null && !srv.calls.slice(-3).some((c) => c.a === "push_sub"), { perm, w }); await ctx.close(); }
  { srv.sub = null; const { ctx, p } = await start(b, { init: () => { delete window.PushManager; } }); await openWin(p); const w = await win(p);
    ck("an iPhone browser tab (no push there): told to use the app on the Home Screen", /app on your Home Screen \(iOS 16\.4 or later\)/.test(w.why || "") && w.buttons.length === 0, w); await ctx.close(); }
  { const ctx = await b.newContext({ ...devices["iPhone 13"] }); const p = await ctx.newPage(); await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await openWin(p); const w = await win(p);
    ck("a page without the service worker (a dev server): says it is not available there, no error", /Not available on this page yet/.test(w.why || "") && w.buttons.length === 0, w); await ctx.close(); }

  console.log("\n[the offer on the watchlist]");
  { const { watchRoutes, state } = require("./watchdata.cjs");
    const nudge = (p) => p.evaluate(() => { const n = document.querySelector("#ntf-nudge"); if (!n) return null; const r = n.getBoundingClientRect(), btn = n.querySelector("button"), sec = n.closest(".mp-sec");
      return { text: n.querySelector("span").textContent, btn: btn ? btn.textContent : null, btnH: btn ? Math.round(btn.getBoundingClientRect().height) : 0, sec: sec ? sec.querySelector("h2 span").textContent : null, left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, over: document.documentElement.scrollWidth - innerWidth }; });
    const toWatch = async (p) => { await watchRoutes(p); await p.locator('#pnav a[href="#watch"]').tap(); await p.waitForSelector(".mp-head h1"); await p.waitForTimeout(900); };
    { srv.sub = null; srv.calls = []; state.syms = ["7203.T", "NVDA"]; const { ctx, p, errs } = await start(b); await toWatch(p); const n = await nudge(p);
      ck("names on the list and notifications off: Alerts on my names offers them in one line, with a button a thumb can hit", !!n && n.text === "Get these as notifications on this phone, as they happen." && n.btn === "TURN ON" && n.btnH >= 40 && n.sec === "Alerts on my names" && n.left >= 0 && n.right <= n.vw && n.over <= 0, n);
      await p.locator("#ntf-nudge button").tap(); await p.waitForSelector(".modal.ntf .ntf-state"); await p.waitForTimeout(300); const w = await win(p);
      ck("TURN ON opens the notifications window", !!w && w.state === "Off for this device" && w.buttons.join() === "TURN ON NOTIFICATIONS", w);
      await p.locator(".modal.ntf button.go").tap(); await p.waitForTimeout(900); await p.locator(".modal.ntf h3 .x").tap(); await p.waitForTimeout(600);
      ck("once they are on the offer is gone, and it returns if they are turned off", !!srv.sub && (await nudge(p)) === null && (await (async () => { await openWin(p); await p.locator(".modal.ntf button.go.ghost").tap(); await p.waitForTimeout(800); await p.locator(".modal.ntf h3 .x").tap(); await p.waitForTimeout(600); await p.locator('#pnav a[href="#watch"]').tap(); await p.waitForTimeout(600); return (await nudge(p))?.btn === "TURN ON"; })()) && errs.length === 0, { sub: srv.sub, errs }); await ctx.close(); }
    { srv.sub = null; state.syms = ["7203.T"]; const { ctx, p } = await start(b, { init: () => { delete window.PushManager; } }); await toWatch(p); const n = await nudge(p);
      ck("an iPhone browser tab, where there is no push: it says to add the Monitor to the Home Screen first, and offers no button", !!n && /add the Monitor to your Home Screen and open it from there/.test(n.text) && n.btn === null, n); await ctx.close(); }
    { srv.sub = null; const { ctx, p } = await start(b); await watchRoutes(p, { empty: true }); await p.locator('#pnav a[href="#watch"]').tap(); await p.waitForSelector(".mp-head h1"); await p.waitForTimeout(900);
      ck("an empty watchlist is not offered notifications about nothing", (await nudge(p)) === null); await ctx.close(); } }

  console.log("\n[a laptop]");
  { srv.sub = null; srv.calls = []; const { ctx, p, errs } = await start(b, { dev: { viewport: { width: 1440, height: 900 } } });
    await p.locator("#alerts .alrt").click(); await p.waitForSelector(".aldrop .alntf"); await p.locator(".aldrop .alntf").click(); await p.waitForSelector(".modal.ntf .ntf-state"); await p.waitForTimeout(300);
    const w = await win(p); await p.locator(".modal.ntf button.go").click(); await p.waitForTimeout(800); const w1 = await win(p); await p.screenshot({ path: "push-laptop.png" });
    ck("opened from the alert list; turning on works the same", w.state === "Off for this device" && w1.state === "On for this device" && !!srv.sub && (await p.locator("#ntf-ctl").count()) === 0 && errs.length === 0, { w, w1, errs });
    await p.keyboard.press("Escape"); await p.waitForTimeout(200); ck("Esc closes the window", (await p.locator(".modal.ntf").count()) === 0); await ctx.close(); }

  console.log("\n[the worker: a pushed alert becomes a notification]");
  { const { ctx, p, errs } = await start(b, { init: null }); const cdp = await ctx.newCDPSession(p); let regId = null; cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => { for (const r of e.registrations) if (r.scopeURL.startsWith(PREVIEW)) regId = r.registrationId; }); await cdp.send("ServiceWorker.enable"); await p.waitForTimeout(600);
    // a headless browser cannot display notifications (it refuses showNotification), so the worker's call is recorded instead of looked up afterwards
    const sw = ctx.serviceWorkers().find((w) => w.url().endsWith("/sw.js")); await sw.evaluate(() => { self.__shown = []; self.registration.showNotification = (title, options) => { self.__shown.push({ title, ...(options || {}) }); return Promise.resolve(); }; });
    const shown = () => sw.evaluate(() => self.__shown.map((n) => ({ title: n.title, body: n.body, tag: n.tag, hash: n.data && n.data.hash, icon: n.icon })));
    let delivered = true; try { await cdp.send("ServiceWorker.deliverPushMessage", { origin: ORIGIN, registrationId: regId, data: JSON.stringify({ title: "Rakuten Bank down 17% intraday", body: "Stock move · 11/18 10:05 SGT", hash: "#asset/5838.T", tag: "alert-77" }) }); } catch (e) { delivered = e.message; }
    await p.waitForTimeout(700); const n1 = await shown();
    ck("the alert's line is the title, its kind and time the text, with the Monitor's icon and the stock to open", delivered === true && n1.length === 1 && n1[0].title === "Rakuten Bank down 17% intraday" && n1[0].body === "Stock move · 11/18 10:05 SGT" && n1[0].tag === "alert-77" && n1[0].hash === "#asset/5838.T" && /icons\/icon-192\.png$/.test(n1[0].icon), { delivered, regId, n1 });
    await cdp.send("ServiceWorker.deliverPushMessage", { origin: ORIGIN, registrationId: regId, data: "not json at all" }); await p.waitForTimeout(500); const n2 = await shown();
    ck("a message that is not in the expected form still shows as a notification (a phone requires one per push)", n2.length === 2 && n2[1].title === "Orrery Monitor" && n2[1].body === "not json at all", n2);
    await cdp.send("ServiceWorker.deliverPushMessage", { origin: ORIGIN, registrationId: regId, data: JSON.stringify({ title: 5, body: { x: 1 }, hash: 7 }) }); await p.waitForTimeout(500); const n3 = await shown();
    ck("fields of the wrong kind fall back to the Monitor's name and an empty text", n3.length === 3 && n3[2].title === "Orrery Monitor" && n3[2].body === "" && n3[2].hash === "", n3);
    await p.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "goto", hash: "#asset/5838.T" } }))); await p.waitForTimeout(500);
    ck("when the worker tells the open window where a tapped alert leads, the window goes there", (await p.evaluate(() => location.hash)) === "#asset/5838.T" && errs.length === 0, { hash: await p.evaluate(() => location.hash), errs });
    await p.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "goto", hash: "javascript:alert(1)" } }))); await p.waitForTimeout(200);
    ck("anything that is not a screen of the Monitor is ignored", (await p.evaluate(() => location.hash)) === "#asset/5838.T"); await ctx.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
