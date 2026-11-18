// A new account by verification email (the button, and the code for the Home Screen app), the older ways it falls
// back to, and the manager's "are you sure" before an account is deactivated. The API is a stand-in that plays each
// kind of server and records what it was asked.
// Run from web/:  node e2e/run.cjs accounts   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { routes } = require("./harness.cjs");
const GATE = "http://localhost:5183/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const tokenFor = (id) => Buffer.from(JSON.stringify({ id })).toString("base64") + ".sig";
const linkFor = (email, code) => `#verify=${code}.${Buffer.from(email).toString("base64url")}`;   // as verifyLink() on the server builds it
const PHONE = { ...devices["iPhone 13"] }, DESK = { viewport: { width: 1280, height: 800 } };

// kind: "old" = a server from before this change (does not know auth_info), "approval" = no email sender set up,
// "email" = verification emails. `script` answers one action differently for a check.
function standIn(kind, o = {}) {
  const s = { kind, calls: [], script: {}, resendSec: o.resendSec ?? 60, role: o.role ?? "user", me: o.me ?? "new.person@example.com",
    rows: o.rows ?? [], mail: o.mail, of: (a) => s.calls.filter((c) => c.a === a) };
  s.attach = async (p) => {
    await routes(p);
    await p.route("**/fakeapi?*", async (r) => {
      const rq = r.request(), a = new URL(rq.url()).searchParams.get("action");
      const send = (status, b) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify(b) });
      if (rq.method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" } });
      let body = null; try { body = rq.postDataJSON(); } catch { /* a GET */ }
      const known = ["auth_info", "signup_start", "signup_verify", "signup_finish", "signup", "login", "me", "admin_users", "admin_set", "mail_test"];
      if (!known.includes(a)) return r.fallback();
      s.calls.push({ a, body, auth: rq.headers().authorization ?? null });
      if (s.script[a]) { const x = s.script[a](body); if (x) return send(x.status, x.body); }
      switch (a) {
        case "auth_info": return kind === "old" ? send(401, { error: "unauthorised" }) : send(200, { signup: kind, codeMin: 15, resendSec: s.resendSec });
        case "signup_start": return kind === "email" ? send(200, { ok: true, email: body.email, codeMin: 15, resendSec: s.resendSec }) : send(401, { error: "unauthorised" });
        case "signup_verify": return body.code === "123456" ? send(200, { ok: true, email: body.email }) : send(400, { error: "That code is not right. 4 tries left." });
        case "signup_finish": return body.code === "123456" ? send(200, { token: tokenFor(body.email), id: body.email, role: "user", mustChange: false }) : send(400, { error: "That code is not right. 4 tries left." });
        case "signup": return send(200, { ok: true, pending: true });
        case "login": return send(200, { token: tokenFor(body.email) });
        case "me": return send(200, { email: s.me, role: s.role, mustChange: false });
        case "admin_users": return send(200, kind === "old" ? { rows: s.rows } : { signup: kind, mail: s.mail ?? { ready: kind === "email", from: kind === "email" ? "desk@example.com" : null, via: kind === "email" ? "smtp.gmail.com" : null, problem: null }, rows: s.rows });
        case "admin_set": { const row = s.rows.find((x) => x.email === body.email); if (row) row.status = body.op === "disable" ? "disabled" : body.op === "reset" ? row.status : "active"; return send(200, { ok: true, email: body.email }); }
        case "mail_test": return send(200, { ok: true, to: s.me, answer: "2.0.0 OK" });
      }
    });
  };
  return s;
}
const gate = (p) => p.evaluate(() => {
  const vis = (e) => !!e && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== "hidden";
  const q = (sel) => document.querySelector(".gatewrap " + sel);
  return { fields: [...document.querySelectorAll(".gatewrap .row input:not([type=checkbox])")].filter(vis).map((i) => i.id), button: q("button.go")?.textContent, disabled: q("button.go")?.disabled, err: q(".err")?.textContent ?? "", ok: !!q(".err.okmsg"),
    sent: q("#g-sent")?.textContent ?? "", verified: q("#g-verified")?.textContent ?? "", or: q(".gor")?.textContent ?? "", links: [...document.querySelectorAll(".gatewrap .glink")].map((b) => ({ t: b.textContent, off: b.disabled })), foot: q(".foot")?.textContent ?? "", remember: q(".chk input")?.checked ?? null, hash: location.hash,
    pending: (() => { try { return JSON.parse(localStorage.getItem("om_signup") ?? "null"); } catch { return "blocked"; } })(), token: (() => { try { return localStorage.getItem("om_token"); } catch { return "blocked"; } })() };
});
const tap = async (p, sel, phone) => { const l = p.locator(sel).first(); if (phone) await l.tap(); else await l.click(); };
async function open(b, dev, srv, o = {}) {
  const ctx = await b.newContext(dev), p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  if (o.init) await ctx.addInitScript(o.init.fn, o.init.arg);
  await srv.attach(p);
  await p.goto(GATE + (o.hash ?? ""), { waitUntil: "networkidle" }); await p.waitForSelector(o.waitFor ?? ".gatewrap .modal"); await p.waitForTimeout(400);
  return { ctx, p, errs };
}
const toCreate = async (p, phone) => { await tap(p, ".gtabs span:nth-child(2)", phone); await p.waitForTimeout(250); };
const signedInAs = (id) => ({ fn: (t) => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("om_token", t); sessionStorage.setItem("seeded", "1"); } } catch {} }, arg: tokenFor(id) });

(async () => { const b = await chromium.launch();
  for (const [name, dev] of [["phone", PHONE], ["desktop", DESK]]) { const phone = dev === PHONE;
    console.log(`\n[${name}: asking for the verification email, then the code typed in (the way for the Home Screen app)]`);
    { const srv = standIn("email", { resendSec: 3 }); const { ctx, p, errs } = await open(b, dev, srv); await toCreate(p, phone);
      let g = await gate(p);
      ck("CREATE ACCOUNT asks for the email address only, and offers to send the verification email", g.fields.join() === "g-id" && g.button === "SEND VERIFICATION EMAIL" && !g.disabled && /Verify my email button is sent/.test(g.foot) && !/approved by the manager/.test(g.foot), g);
      await p.locator("#g-id").fill("not-an-address"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(200); const native = await p.evaluate(() => document.querySelector("#g-id").validity.valid);
      await p.locator("#g-id").fill("name@host"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(200); g = await gate(p);
      ck("something that is not an address is stopped (by the browser's own check, or by the page for one the browser lets through), and nothing is sent", native === false && g.err === "Enter a valid email address" && srv.of("signup_start").length === 0, { native, g });
      await p.locator("#g-id").fill("  New.Person@Example.com "); await tap(p, ".gatewrap button.go", phone); await p.waitForSelector("#g-code"); await p.waitForTimeout(200); g = await gate(p);
      const st = srv.of("signup_start");
      ck("a valid address: the server is asked once, with the address in lower case and nothing else", st.length === 1 && JSON.stringify(st[0].body) === '{"email":"new.person@example.com"}' && st[0].auth === null, st);
      ck("then: where the email went, to press Verify my email in it, how long it is valid; and, set apart, the code for the Home Screen app with CONTINUE", /verification email was sent to new\.person@example\.com/.test(g.sent) && /Press Verify my email/.test(g.sent) && /valid for 15 minutes/.test(g.sent) && /Home Screen app/.test(g.or) && g.fields.join() === "g-code" && g.button === "CONTINUE" && g.links.length === 2 && /spam folder/.test(g.foot), g);
      const code = await p.evaluate(() => { const i = document.querySelector("#g-code"); return { mode: i.inputMode, ac: i.autocomplete, overflowX: document.documentElement.scrollWidth - innerWidth }; });
      ck("the code field brings up the number pad and takes the code straight from the message where the phone offers it", code.mode === "numeric" && code.ac === "one-time-code" && code.overflowX <= 0, code);
      ck("what is kept on the device while the email is out: the address and the time, nothing else", g.pending && Object.keys(g.pending).sort().join() === "at,codeMin,email,resendSec" && g.pending.email === "new.person@example.com", g.pending);
      ck("a new email cannot be asked for straight away: the button counts down", g.links[0].off && /^NEW EMAIL IN [1-3] S$/.test(g.links[0].t) && !g.links[1].off && g.links[1].t === "USE ANOTHER EMAIL", g.links);
      const metrics = () => p.evaluate(() => { const r = (s) => document.querySelector(".gatewrap " + s).getBoundingClientRect(), z = Number(document.body.style.zoom) || 1; const card = r(".modal"), go = r("button.go"), bg = document.querySelector(".gatewrap .modal-bg");
        bg.scrollTop = 1e5; const bottom = Math.round(document.querySelector(".gatewrap .foot").getBoundingClientRect().bottom); bg.scrollTop = 0;
        return { card: [Math.round(card.left), Math.round(card.right), Math.round(card.top)], vw: innerWidth, vh: innerHeight, goH: Math.round(go.height), linkH: Math.min(...[...document.querySelectorAll(".gatewrap .glink")].map((e) => Math.round(e.getBoundingClientRect().height))), px: Math.min(...[...document.querySelectorAll(".gatewrap .row input:not([type=checkbox])")].map((i) => parseFloat(getComputedStyle(i).fontSize) * z)), bottom }; });
      if (phone) { const m = await metrics();
        ck(`at phone size: the card inside the screen (${m.card[0]}–${m.card[1]}px of ${m.vw}px, top ${m.card[2]}px), the field ${m.px}px, buttons ${m.goH}px and ${m.linkH}px tall, the last line reachable (bottom ${m.bottom}px of ${m.vh}px after scrolling)`, m.card[0] >= 0 && m.card[1] <= m.vw && m.card[2] >= 0 && m.px >= 16 && m.goH >= 44 && m.linkH >= 44 && m.bottom <= m.vh, m);
        await p.setViewportSize({ width: 390, height: 380 }); await p.waitForTimeout(200);   // the keyboard is up: little height left
        const k = await p.evaluate(() => { const bg = document.querySelector(".gatewrap .modal-bg"); bg.scrollTop = 0; const top = document.querySelector(".gatewrap .modal").getBoundingClientRect().top; bg.scrollTop = 1e5; const bottom = document.querySelector(".gatewrap .modal").getBoundingClientRect().bottom; bg.scrollTop = 0; return { top: Math.round(top), bottom: Math.round(bottom), vh: innerHeight }; });
        ck(`with the keyboard up (380px of height) the card starts on the screen (top ${k.top}px) and scrolls to its end (bottom ${k.bottom}px)`, k.top >= 0 && k.bottom <= k.vh, k);
        await p.setViewportSize({ width: 390, height: 664 }); await p.waitForTimeout(200); }
      await p.screenshot({ path: `acc-sent-${name}.png` });
      await p.locator("#g-code").fill(""); await p.locator("#g-code").pressSequentially("12a3 4x"); const typed = await p.locator("#g-code").inputValue();
      await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(150); g = await gate(p);
      ck("letters cannot be typed into the code; five digits are refused on the page", typed === "123 4" && g.err === "Enter the 6-digit code from the email" && srv.of("signup_verify").length === 0, { typed, g });
      await p.locator("#g-code").fill("654 321"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(400); g = await gate(p);
      const v1 = srv.of("signup_verify");
      ck("a wrong code: the server is asked (address and the six digits), its words are shown, and the page still waits for the code", v1.length === 1 && JSON.stringify(v1[0].body) === '{"email":"new.person@example.com","code":"654321"}' && g.err === "That code is not right. 4 tries left." && g.fields.join() === "g-code" && g.token === null, { v1, g });
      await p.waitForFunction(() => document.querySelector("#g-again") && !document.querySelector("#g-again").disabled, null, { timeout: 6000 }); g = await gate(p);
      ck("once the wait is over the button reads SEND A NEW EMAIL", g.links[0].t === "SEND A NEW EMAIL" && !g.links[0].off, g.links);
      await tap(p, "#g-again", phone); await p.waitForTimeout(400); g = await gate(p);
      ck("a new email: the server is asked again for the same address, the page says the earlier one no longer works, the code field is empty and the wait starts again", srv.of("signup_start").length === 2 && srv.of("signup_start")[1].body.email === "new.person@example.com" && g.ok && /earlier one no longer works/.test(g.err) && (await p.locator("#g-code").inputValue()) === "" && g.links[0].off, g);
      await p.locator("#g-code").fill("123456"); await tap(p, ".gatewrap button.go", phone); await p.waitForSelector("#g-verified"); await p.waitForTimeout(200); g = await gate(p);
      const focus = await p.evaluate(() => ({ id: document.activeElement?.id, user: document.querySelector(".gatewrap input.gkeep")?.value, userAc: document.querySelector(".gatewrap input.gkeep")?.autocomplete }));
      ck("the right code: the page says the address is verified and asks for the password, twice, with 'remember me' ticked and the cursor in the first field", /new\.person@example\.com is verified\. Choose your password\./.test(g.verified) && g.fields.join() === "g-pw,g-pw2" && g.button === "CREATE ACCOUNT" && g.remember === true && focus.id === "g-pw" && focus.user === "new.person@example.com" && focus.userAc === "username" && srv.of("signup_finish").length === 0, { g, focus });
      if (phone) { const m = await metrics(); ck(`the password step at phone size: fields ${m.px}px, button ${m.goH}px, the link under it ${m.linkH}px, all inside the screen`, m.card[0] >= 0 && m.card[1] <= m.vw && m.card[2] >= 0 && m.px >= 16 && m.goH >= 44 && m.linkH >= 44 && m.bottom <= m.vh, m); }
      await p.screenshot({ path: `acc-password-${name}.png` });
      await p.locator("#g-pw").fill("short"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(150); const e1 = (await gate(p)).err;
      await p.locator("#g-pw").fill("a-good-password"); await p.locator("#g-pw2").fill("a-good-passwork"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(150); const e2 = (await gate(p)).err;
      ck("a short password and two passwords that differ are refused on the page", e1 === "Password: at least 8 characters" && e2 === "The two passwords do not match" && srv.of("signup_finish").length === 0, [e1, e2]);
      await p.locator("#g-pw2").fill("a-good-password"); await tap(p, ".gatewrap button.go", phone); await p.waitForSelector("#topbar", { timeout: 8000 }); await p.waitForTimeout(500);
      const f = srv.of("signup_finish"), after = await p.evaluate(() => ({ token: localStorage.getItem("om_token"), pending: localStorage.getItem("om_signup"), gate: !!document.querySelector(".gatewrap") }));
      ck("CREATE ACCOUNT: address, code, password and 'remember' go to the server once, and the Monitor opens signed in, with nothing left over on the device", f.length === 1 && JSON.stringify(f[0].body) === '{"email":"new.person@example.com","code":"123456","password":"a-good-password","remember":true}' && after.token === tokenFor("new.person@example.com") && after.pending === null && !after.gate && srv.of("signup").length === 0 && srv.of("login").length === 0, { f, after });
      ck("no errors on the page", errs.length === 0, errs); await ctx.close(); }

    console.log(`\n[${name}: the Verify my email button (the page opened by its link)]`);
    { const srv = standIn("email"); const { ctx, p, errs } = await open(b, dev, srv, { hash: linkFor("button.person@example.com", "123456"), waitFor: "#g-verified" });
      let g = await gate(p); const v = srv.of("signup_verify");
      ck("the page asks the server about the link once, takes the link out of the address bar, and says the address is verified", v.length === 1 && JSON.stringify(v[0].body) === '{"email":"button.person@example.com","code":"123456"}' && g.hash === "" && /button\.person@example\.com is verified\. Choose your password\./.test(g.verified) && g.fields.join() === "g-pw,g-pw2" && g.button === "CREATE ACCOUNT" && srv.of("signup_start").length === 0, { v, g });
      const hist = await p.evaluate(() => ({ href: location.href, len: history.length }));
      ck("the code is not left in the address", !/verify|123456/.test(hist.href), hist);
      await p.locator("#g-pw").fill("a-good-password"); await p.locator("#g-pw2").fill("a-good-password"); await tap(p, ".chk input", phone); await tap(p, ".gatewrap button.go", phone); await p.waitForSelector("#topbar", { timeout: 8000 }); await p.waitForTimeout(400);
      const f = srv.of("signup_finish"), tok = await p.evaluate(() => ({ local: localStorage.getItem("om_token"), session: sessionStorage.getItem("om_token") }));
      ck("a password, 'remember me' unticked: the account is created and the Monitor opens, signed in for this visit only", f.length === 1 && JSON.stringify(f[0].body) === '{"email":"button.person@example.com","code":"123456","password":"a-good-password","remember":false}' && tok.local === null && tok.session === tokenFor("button.person@example.com"), { f, tok });
      ck("no errors on the page", errs.length === 0, errs); await ctx.close(); }
    { const srv = standIn("email"); srv.script.signup_verify = () => ({ status: 400, body: { error: "This email is older than its 15 minutes. Send a new email." } });
      const { ctx, p } = await open(b, dev, srv, { hash: linkFor("late.person@example.com", "123456") }); await p.waitForFunction(() => document.querySelector(".gatewrap .err")?.textContent); await p.waitForTimeout(300);
      const g = await gate(p);
      ck("a link that no longer stands: the server's words, the address filled in, and one press sends a new email", g.err === "This email is older than its 15 minutes. Send a new email." && g.fields.join() === "g-id" && (await p.locator("#g-id").inputValue()) === "late.person@example.com" && g.button === "SEND VERIFICATION EMAIL" && !g.disabled && g.hash === "" && g.verified === "", g);
      await tap(p, ".gatewrap button.go", phone); await p.waitForSelector("#g-code");
      ck("and it does", srv.of("signup_start").length === 1 && srv.of("signup_start")[0].body.email === "late.person@example.com"); await ctx.close(); }
    { const srv = standIn("email"); const { ctx, p } = await open(b, dev, srv, { hash: "#verify=12345.bm90IGEgbGluaw" }); const g = await gate(p);
      ck("something that only looks like the link is ignored: the usual SIGN IN, and the server is not asked", g.fields.join() === "g-id,g-pw" && g.button === "SIGN IN" && srv.of("signup_verify").length === 0, g); await ctx.close(); }
    { const srv = standIn("email"); srv.script.signup_finish = () => ({ status: 409, body: { error: "This email already has an account. Sign in instead; a forgotten password is reset by the manager." } });
      const { ctx, p } = await open(b, dev, srv, { hash: linkFor("twice@example.com", "123456"), waitFor: "#g-verified" });
      await p.locator("#g-pw").fill("a-good-password"); await p.locator("#g-pw2").fill("a-good-password"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(400); let g = await gate(p);
      ck("an address that got its account in the meantime is told so here (only its owner can be on this step)", /already has an account/.test(g.err) && g.token === null && g.links.length === 1 && g.links[0].t === "START AGAIN WITH ANOTHER EMAIL", g);
      await tap(p, "#g-other", phone); await p.waitForTimeout(250); g = await gate(p);
      ck("START AGAIN returns to the address", g.fields.join() === "g-id" && g.button === "SEND VERIFICATION EMAIL" && g.verified === "", g); await ctx.close(); }

    console.log(`\n[${name}: the button pressed in a browser where someone is signed in]`);
    { const srv = standIn("email", { me: "manager@example.com", role: "manager" });
      const { ctx, p, errs } = await open(b, dev, srv, { hash: linkFor("second.address@example.com", "123456"), init: signedInAs("manager@example.com"), waitFor: "#vf-title" });
      const d = await p.evaluate(() => { const m = document.querySelector(".modal-bg.confirm .modal"), r = m.getBoundingClientRect(); return { who: m.querySelector(".cf-who").textContent, text: m.querySelector(".sub2").textContent, buttons: [...m.querySelectorAll("button")].map((x) => ({ t: x.textContent, h: Math.round(x.getBoundingClientRect().height) })), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, hash: location.hash }; });
      ck("the Monitor says whose link it is and who is signed in, and asks; nothing is sent to the server meanwhile", d.who === "second.address@example.com" && /signed in as manager@example\.com/.test(d.text) && d.buttons.map((x) => x.t).join() === "STAY SIGNED IN,SIGN OUT AND CONTINUE" && d.inside && d.hash === "" && (!phone || d.buttons.every((x) => x.h >= 44)) && srv.of("signup_verify").length === 0, d);
      await tap(p, "#vf-stay", phone); await p.waitForTimeout(300);
      ck("STAY SIGNED IN: the question goes, the Monitor stays open as before, the link is left alone", (await p.locator(".modal-bg.confirm").count()) === 0 && (await p.locator("#topbar").count()) === 1 && (await p.evaluate(() => localStorage.getItem("om_token"))) === tokenFor("manager@example.com") && srv.of("signup_verify").length === 0);
      ck("no errors on the page", errs.length === 0, errs); await ctx.close(); }
    { const srv = standIn("email", { me: "manager@example.com", role: "manager" });
      const { ctx, p } = await open(b, dev, srv, { hash: linkFor("second.address@example.com", "123456"), init: signedInAs("manager@example.com"), waitFor: "#vf-title" });
      await tap(p, "#vf-out", phone); await p.waitForSelector("#g-verified", { timeout: 8000 }); await p.waitForTimeout(300); const g = await gate(p);
      ck("SIGN OUT AND CONTINUE: signed out here, the link checked, and the password step for the new address", g.token === null && srv.of("signup_verify").length === 1 && srv.of("signup_verify")[0].body.email === "second.address@example.com" && /second\.address@example\.com is verified/.test(g.verified), g); await ctx.close(); }
    { const srv = standIn("email", { me: "same@example.com" });
      const { ctx, p } = await open(b, dev, srv, { hash: linkFor("same@example.com", "123456"), init: signedInAs("same@example.com"), waitFor: "#topbar" }); await p.waitForTimeout(500);
      ck("the button of an account that is already signed in here just opens the Monitor", (await p.locator(".modal-bg.confirm").count()) === 0 && srv.of("signup_verify").length === 0 && (await p.evaluate(() => location.hash)) === ""); await ctx.close(); }

    console.log(`\n[${name}: leaving and coming back while the email is out]`);
    { const srv = standIn("email"); const { ctx, p, errs } = await open(b, dev, srv); await toCreate(p, phone);
      await p.locator("#g-id").fill("away@example.com"); await tap(p, ".gatewrap button.go", phone); await p.waitForSelector("#g-code");
      await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#g-code", { timeout: 6000 }); let g = await gate(p);
      ck("the page started afresh (back from the mail app): it is still waiting for the same address, and no second email was asked for", /sent to away@example\.com/.test(g.sent) && g.fields.join() === "g-code" && srv.of("signup_start").length === 1, g);
      await tap(p, ".gtabs span:nth-child(1)", phone); await p.waitForTimeout(200); g = await gate(p);
      ck("SIGN IN is still one tap away, with its usual two fields", g.fields.join() === "g-id,g-pw" && g.button === "SIGN IN", g);
      await toCreate(p, phone); await tap(p, "#g-other", phone); await p.waitForTimeout(250); g = await gate(p);
      ck("USE ANOTHER EMAIL: back to the address, filled in for correcting, and nothing is kept on the device", g.fields.join() === "g-id" && (await p.locator("#g-id").inputValue()) === "away@example.com" && g.pending === null && g.button === "SEND VERIFICATION EMAIL", g);
      ck("no errors on the page", errs.length === 0, errs); await ctx.close(); }
    { const srv = standIn("email"); const { ctx, p } = await open(b, dev, srv, { init: { fn: (v) => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("om_signup", v); sessionStorage.setItem("seeded", "1"); } } catch {} }, arg: JSON.stringify({ email: "late@example.com", at: Date.now() - 16 * 60e3, codeMin: 15, resendSec: 60 }) } });
      const g = await gate(p);
      ck("an email older than its 15 minutes is not waited for: the page opens on SIGN IN as usual", g.fields.join() === "g-id,g-pw" && g.button === "SIGN IN", g); await ctx.close(); }

    console.log(`\n[${name}: what the server may answer to "send the email"]`);
    { const srv = standIn("email"); const { ctx, p } = await open(b, dev, srv); await toCreate(p, phone);
      srv.script.signup_start = () => ({ status: 502, body: { error: "The email could not be sent. Try again in a minute; if it keeps failing, tell the manager." } });
      await p.locator("#g-id").fill("someone@example.com"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(400); let g = await gate(p);
      ck("an email that could not be sent: said so, and the page stays on the address", /could not be sent/.test(g.err) && !g.ok && g.fields.join() === "g-id" && g.pending === null, g);
      srv.script.signup_start = () => ({ status: 429, body: { error: "Too many emails were sent to this address. Try again in 30 min.", why: "email_hour", waitSec: 1790, resendSec: 60 } });
      await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(400); g = await gate(p);
      ck("too many emails to one address: said so, with the wait, and the page stays on the address", g.err === "Too many emails were sent to this address. Try again in 30 min." && g.fields.join() === "g-id", g);
      srv.script.signup_start = () => ({ status: 429, body: { error: "An email was sent a moment ago. A new one can be sent in 40 s.", why: "gap", waitSec: 40, resendSec: 60 } });
      await tap(p, ".gatewrap button.go", phone); await p.waitForSelector("#g-code"); await p.waitForTimeout(200); g = await gate(p);
      ck("an email already sent moments ago (the page had lost track of it): go on to waiting for that one, with the rest of the wait shown", g.ok && /sent to this address a moment ago/.test(g.err) && /^NEW EMAIL IN (3[89]|40) S$/.test(g.links[0].t), g); await ctx.close(); }

    console.log(`\n[${name}: servers without verification emails keep the earlier way]`);
    for (const kind of ["old", "approval"]) { const srv = standIn(kind); const { ctx, p, errs } = await open(b, dev, srv); await toCreate(p, phone);
      let g = await gate(p);
      const label = kind === "old" ? "a server from before this change (it does not know the question)" : "a server with no email sender set up";
      ck(`${label}: email, password, password again, approved by the manager`, g.fields.join() === "g-id,g-pw,g-pw2" && g.button === "CREATE ACCOUNT" && /approved by the manager/.test(g.foot), g);
      await p.locator("#g-id").fill("old.way@example.com"); await p.locator("#g-pw").fill("a-good-password"); await p.locator("#g-pw2").fill("a-good-password"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(400); g = await gate(p);
      ck(`${label}: the account is asked for as before, and the page says it waits for approval`, srv.of("signup").length === 1 && JSON.stringify(srv.of("signup")[0].body) === '{"email":"old.way@example.com","password":"a-good-password"}' && srv.of("signup_start").length === 0 && g.ok && /once the manager has approved it/.test(g.err) && g.button === "SIGN IN", g);
      ck("no errors on the page", errs.length === 0, errs); await ctx.close(); }

    console.log(`\n[${name}: who sees addresses]`);
    { const srv = standIn("email", { me: "reader@example.com", role: "user" }); const { ctx, p } = await open(b, dev, srv, { init: signedInAs("reader@example.com"), waitFor: "#topbar" }); await p.waitForTimeout(700);
      if (phone) { await p.locator("#pv2-btns button").last().tap(); await p.waitForTimeout(300); }
      await tap(p, "#userchip", phone); await p.waitForSelector(".modal.acct"); await p.waitForTimeout(400);
      const v = await p.evaluate(() => ({ adm: !!document.querySelector(".acct-adm"), text: document.querySelector(".modal.acct").textContent }));
      ck("an ordinary account's window shows its own address and no list; the page does not even ask the server for the list", !v.adm && v.text.includes("reader@example.com") && !/Accounts ·/.test(v.text) && srv.of("admin_users").length === 0, v); await ctx.close(); }

    console.log(`\n[${name}: the manager's list, and being asked before an account is deactivated]`);
    { const mk = () => [
        { email: "manager@example.com", role: "manager", status: "active", mustChange: false, createdAt: "2026-11-16T02:00:00Z", lastSeen: "2026-11-18T01:00:00Z", logins: 40, watch: 12, verifiedAt: null },
        { email: "reader.one@example.com", role: "user", status: "active", mustChange: false, createdAt: "2026-11-17T02:00:00Z", lastSeen: "2026-11-18T03:00:00Z", logins: 5, watch: 3, verifiedAt: "2026-11-17T02:00:00Z" },
        { email: "reader.two@example.com", role: "user", status: "disabled", mustChange: false, createdAt: "2026-11-17T04:00:00Z", lastSeen: null, logins: 0, watch: 0, verifiedAt: null },
        { email: "waiting@example.com", role: "user", status: "pending", mustChange: false, createdAt: "2026-11-15T04:00:00Z", lastSeen: null, logins: 0, watch: 0, verifiedAt: null }];
      const srv = standIn("email", { role: "manager", me: "manager@example.com", rows: mk() });
      const { ctx, p, errs } = await open(b, dev, srv);
      await p.locator("#g-id").fill("manager@example.com"); await p.locator("#g-pw").fill("a-password"); await tap(p, ".gatewrap button.go", phone); await p.waitForSelector("#topbar"); await p.waitForTimeout(900);
      if (phone) { await p.locator("#pv2-btns button").last().tap(); await p.waitForTimeout(300); }
      await tap(p, "#userchip", phone); await p.waitForSelector(".acct-adm table tbody tr"); await p.waitForTimeout(300);
      const list = () => p.evaluate(() => [...document.querySelectorAll(".acct-adm tbody tr")].map((tr) => ({ email: tr.cells[0].childNodes[0].textContent, status: tr.cells[1].textContent, chips: [...tr.querySelectorAll(".acts .chip-sm")].map((c) => c.textContent), tip: tr.cells[0].title })));
      const dlg = () => p.evaluate(() => { const d = document.querySelector(".modal-bg.confirm .modal"); if (!d) return null; const r = d.getBoundingClientRect(), bt = [...d.querySelectorAll("button")].map((x) => ({ t: x.textContent, h: Math.round(x.getBoundingClientRect().height), id: x.id }));
        return { title: d.querySelector("h3").textContent, who: d.querySelector(".cf-who").textContent, text: d.querySelector(".sub2").textContent, buttons: bt, focus: document.activeElement?.id, role: d.getAttribute("role"), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, onTop: document.elementFromPoint(r.left + r.width / 2, r.top + 8)?.closest(".modal-bg.confirm") != null }; });
      let rows = await list();
      ck("the list shows every address with its state: active, deactivated, waiting", rows.map((r) => `${r.email}:${r.status}`).join() === "manager@example.com:active,reader.one@example.com:active,reader.two@example.com:deactivated,waiting@example.com:waiting", rows);
      ck("each row offers what applies: nothing for the manager's own account; DEACTIVATE and RESET PW for an active one; REACTIVATE for a deactivated one; APPROVE and REJECT for one that waits", rows[0].chips.length === 0 && rows[1].chips.join() === "DEACTIVATE,RESET PW" && rows[2].chips.join() === "REACTIVATE" && rows[3].chips.join() === "APPROVE,REJECT", rows.map((r) => r.chips));
      ck("an account opened by its verification email says so (with the time) when its address is pointed at", /address verified by email/.test(rows[1].tip) && !/verified/.test(rows[2].tip), rows.map((r) => r.tip));
      const line = await p.evaluate(() => document.querySelector("#mailline")?.textContent ?? "");
      ck("above the list: accounts open by themselves, and which address the verification emails come from", /open by themselves/.test(line) && line.includes("desk@example.com") && line.includes("smtp.gmail.com") && /SEND A TEST EMAIL/.test(line), line);

      await tap(p, ".acct-adm tbody tr:nth-child(2) .acts .chip-sm:nth-child(1)", phone); await p.waitForSelector(".modal-bg.confirm"); await p.waitForTimeout(200);
      let d = await dlg();
      ck("DEACTIVATE asks first: whose account, what happens, and that it can be undone; nothing has been sent yet", d && d.title === "Deactivate this account?" && d.who === "reader.one@example.com" && /signed out on every device/.test(d.text) && /stop receiving alerts/.test(d.text) && /neither sign in nor create the account again/.test(d.text) && /watchlist is kept/.test(d.text) && /REACTIVATE/.test(d.text) && d.role === "alertdialog" && srv.of("admin_set").length === 0, d);
      ck(`the question is on top of everything, inside the screen, with CANCEL the one in focus${phone ? ` and both buttons ${Math.min(...d.buttons.map((x) => x.h))}px tall or more` : ""}`, d.onTop && d.inside && d.focus === "cf-no" && d.buttons.map((x) => x.t).sort().join() === "CANCEL,DEACTIVATE" && (!phone || d.buttons.every((x) => x.h >= 44)), d);
      await p.screenshot({ path: `acc-confirm-${name}.png` });
      await tap(p, "#cf-no", phone); await p.waitForTimeout(250);
      ck("CANCEL: the question goes, the account window stays, nothing was sent and the account is still active", (await dlg()) === null && (await p.locator(".modal.acct").count()) === 1 && srv.of("admin_set").length === 0 && (await list())[1].status === "active");
      await tap(p, ".acct-adm tbody tr:nth-child(2) .acts .chip-sm:nth-child(1)", phone); await p.waitForSelector(".modal-bg.confirm"); await p.keyboard.press("Escape"); await p.waitForTimeout(250);
      ck("Esc cancels the question only", (await dlg()) === null && (await p.locator(".modal.acct").count()) === 1 && srv.of("admin_set").length === 0);
      await tap(p, ".acct-adm tbody tr:nth-child(2) .acts .chip-sm:nth-child(1)", phone); await p.waitForSelector(".modal-bg.confirm"); await p.mouse.click(4, 4); await p.waitForTimeout(250);
      ck("a tap outside the question cancels it only", (await dlg()) === null && (await p.locator(".modal.acct").count()) === 1 && srv.of("admin_set").length === 0);
      await tap(p, ".acct-adm tbody tr:nth-child(2) .acts .chip-sm:nth-child(1)", phone); await p.waitForSelector(".modal-bg.confirm"); await tap(p, "#cf-yes", phone); await p.waitForTimeout(500);
      rows = await list(); const sets = srv.of("admin_set");
      ck("DEACTIVATE in the question: sent once, for that address, signed as the manager; the question closes and the row reads deactivated with REACTIVATE", sets.length === 1 && JSON.stringify(sets[0].body) === '{"email":"reader.one@example.com","op":"disable"}' && sets[0].auth === "Bearer " + tokenFor("manager@example.com") && (await dlg()) === null && rows[1].status === "deactivated" && rows[1].chips.join() === "REACTIVATE", { sets, rows });
      await tap(p, ".acct-adm tbody tr:nth-child(2) .acts .chip-sm:nth-child(1)", phone); await p.waitForTimeout(500); rows = await list();
      ck("REACTIVATE needs no question: sent at once, and the row is active again", srv.of("admin_set").length === 2 && srv.of("admin_set")[1].body.op === "enable" && (await dlg()) === null && rows[1].status === "active", rows);
      await tap(p, ".acct-adm tbody tr:nth-child(4) .acts .chip-sm:nth-child(2)", phone); await p.waitForSelector(".modal-bg.confirm"); d = await dlg();
      ck("REJECT (an account that waits) asks first too, in its own words", d.title === "Reject this account?" && d.who === "waiting@example.com" && d.buttons.some((x) => x.t === "REJECT") && srv.of("admin_set").length === 2, d);
      await tap(p, "#cf-no", phone); await p.waitForTimeout(200);
      await tap(p, ".acct-adm tbody tr:nth-child(4) .acts .chip-sm:nth-child(1)", phone); await p.waitForTimeout(400);
      ck("APPROVE still works for an account that waits", srv.of("admin_set").length === 3 && JSON.stringify(srv.of("admin_set")[2].body) === '{"email":"waiting@example.com","op":"approve"}' && (await list())[3].status === "active");

      await tap(p, "#mailtest", phone); await p.waitForSelector("#mailtest-r"); let t = await p.evaluate(() => ({ text: document.querySelector("#mailtest-r").textContent, good: document.querySelector("#mailtest-r").classList.contains("up") }));
      ck("SEND A TEST EMAIL: the server is asked once and the page says where it went", srv.of("mail_test").length === 1 && t.good && t.text.includes("manager@example.com"), t);
      await tap(p, "#mailwelcome", phone); await p.waitForFunction(() => /welcome email was sent/.test(document.querySelector("#mailtest-r")?.textContent ?? "")); const tw = await p.evaluate(() => ({ text: document.querySelector("#mailtest-r").textContent, line: document.querySelector("#mailline").textContent }));
      ck("SEND IT TO ME: the server is asked for the welcome email a new account gets, and the page says where it went", srv.of("mail_test").length === 2 && JSON.stringify(srv.of("mail_test")[1].body) === '{"what":"welcome"}' && /The welcome email was sent to manager@example\.com/.test(tw.text) && /Once its password is set, a new account gets the welcome email\./.test(tw.line), { tw, calls: srv.of("mail_test").map((c) => c.body) });
      srv.script.mail_test = () => ({ status: 502, body: { error: "the mail server refused the sign-in: 535 5.7.8 Username and Password not accepted" } });
      await tap(p, "#mailtest", phone); await p.waitForFunction(() => document.querySelector("#mailtest-r")?.classList.contains("dn")); t = await p.evaluate(() => document.querySelector("#mailtest-r").textContent);
      ck("a test that fails shows the mail server's own words", /535 5\.7\.8 Username and Password not accepted/.test(t), t);
      const ox = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      ck("nothing wider than the screen; no errors on the page", ox <= 0 && errs.length === 0, { ox, errs }); await ctx.close(); }
    for (const [kind, mail, want] of [["approval", undefined, /No email sender is set up.*waits here for your approval/], ["approval", { ready: false, from: null, via: null, problem: "SMTP_USER and SMTP_PASS must both be set" }, /set-up has a mistake: SMTP_USER and SMTP_PASS must both be set.*waits here for your approval/], ["old", undefined, null]]) {
      const srv = standIn(kind, { role: "manager", me: "manager@example.com", mail, rows: [{ email: "manager@example.com", role: "manager", status: "active", mustChange: false, createdAt: "2026-11-16T02:00:00Z", lastSeen: null, logins: 1, watch: 0 }, { email: "waiting@example.com", role: "user", status: "pending", mustChange: false, createdAt: "2026-11-15T04:00:00Z", lastSeen: null, logins: 0, watch: 0 }] });
      const { ctx, p } = await open(b, dev, srv);
      await p.locator("#g-id").fill("manager@example.com"); await p.locator("#g-pw").fill("a-password"); await tap(p, ".gatewrap button.go", phone); await p.waitForSelector("#topbar"); await p.waitForTimeout(900);
      if (phone) { await p.locator("#pv2-btns button").last().tap(); await p.waitForTimeout(300); }
      await tap(p, "#userchip", phone); await p.waitForSelector(".acct-adm table tbody tr"); await p.waitForTimeout(300);
      const v = await p.evaluate(() => ({ line: document.querySelector("#mailline")?.textContent ?? null, head: document.querySelector(".acct-adm .minih").textContent, test: !!document.querySelector("#mailtest"), rows: document.querySelectorAll(".acct-adm tbody tr").length }));
      ck(want ? `the manager is told why accounts still wait for approval (${mail ? "a mistake in the set-up, named" : "no sender set up"})` : "a server from before this change: the list as it was, with no line about email", v.rows === 2 && /1 waiting for approval/.test(v.head) && !v.test && (want ? want.test(v.line ?? "") : v.line === null), v); await ctx.close(); }
  }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
