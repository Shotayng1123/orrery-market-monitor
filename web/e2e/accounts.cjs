// A new account by emailed code, the older ways it falls back to, and the manager's "are you sure" before an
// account is deactivated. The API is a stand-in that plays each kind of server and records what it was asked.
// Run from web/:  node e2e/run.cjs accounts   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { routes } = require("./harness.cjs");
const GATE = "http://localhost:5183/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const tokenFor = (id) => Buffer.from(JSON.stringify({ id })).toString("base64") + ".sig";
const PHONE = { ...devices["iPhone 13"] }, DESK = { viewport: { width: 1280, height: 800 } };

// kind: "old" = a server from before this change (does not know auth_info), "approval" = no email sender set up,
// "email" = codes by email. `script` answers one action differently for a check.
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
      const known = ["auth_info", "signup_start", "signup_finish", "signup", "login", "me", "admin_users", "admin_set", "mail_test"];
      if (!known.includes(a)) return r.fallback();
      s.calls.push({ a, body, auth: rq.headers().authorization ?? null });
      if (s.script[a]) { const x = s.script[a](body); if (x) return send(x.status, x.body); }
      switch (a) {
        case "auth_info": return kind === "old" ? send(401, { error: "unauthorised" }) : send(200, { signup: kind, codeMin: 15, resendSec: s.resendSec });
        case "signup_start": return kind === "email" ? send(200, { ok: true, email: body.email, codeMin: 15, resendSec: s.resendSec }) : send(401, { error: "unauthorised" });
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
    sent: q(".gsent")?.textContent ?? "", links: [...document.querySelectorAll(".gatewrap .glink")].map((b) => ({ t: b.textContent, off: b.disabled })), foot: q(".foot")?.textContent ?? "", remember: q(".chk input")?.checked ?? null,
    pending: (() => { try { return JSON.parse(localStorage.getItem("om_signup") ?? "null"); } catch { return "blocked"; } })(), token: (() => { try { return localStorage.getItem("om_token"); } catch { return "blocked"; } })() };
});
const tap = async (p, sel, phone) => { const l = p.locator(sel).first(); if (phone) await l.tap(); else await l.click(); };
async function open(b, dev, srv, init) {
  const ctx = await b.newContext(dev), p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  if (init) await ctx.addInitScript(init.fn, init.arg);
  await srv.attach(p);
  await p.goto(GATE, { waitUntil: "networkidle" }); await p.waitForSelector(".gatewrap .modal"); await p.waitForTimeout(400);
  return { ctx, p, errs };
}
const toCreate = async (p, phone) => { await tap(p, ".gtabs span:nth-child(2)", phone); await p.waitForTimeout(250); };

(async () => { const b = await chromium.launch();
  for (const [name, dev] of [["phone", PHONE], ["desktop", DESK]]) { const phone = dev === PHONE;
    console.log(`\n[${name}: a new account by emailed code]`);
    { const srv = standIn("email", { resendSec: 3 }); const { ctx, p, errs } = await open(b, dev, srv); await toCreate(p, phone);
      let g = await gate(p);
      ck("CREATE ACCOUNT asks for the email address only, and offers to send a code", g.fields.join() === "g-id" && g.button === "SEND CODE" && !g.disabled && /6-digit code is emailed/.test(g.foot) && !/approved by the manager/.test(g.foot), g);
      await p.locator("#g-id").fill("not-an-address"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(200); const native = await p.evaluate(() => document.querySelector("#g-id").validity.valid);
      await p.locator("#g-id").fill("name@host"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(200); g = await gate(p);
      ck("something that is not an address is stopped (by the browser's own check, or by the page for one the browser lets through), and nothing is sent", native === false && g.err === "Enter a valid email address" && srv.of("signup_start").length === 0, { native, g });
      await p.locator("#g-id").fill("  New.Person@Example.com "); await tap(p, ".gatewrap button.go", phone); await p.waitForSelector("#g-code"); await p.waitForTimeout(200); g = await gate(p);
      const st = srv.of("signup_start");
      ck("a valid address: the server is asked once, with the address in lower case and nothing else", st.length === 1 && JSON.stringify(st[0].body) === '{"email":"new.person@example.com"}' && st[0].auth === null, st);
      ck("then: where the code went, the code, a password twice, stay signed in (ticked), CREATE ACCOUNT", /sent to new\.person@example\.com/.test(g.sent) && /valid for 15 minutes/.test(g.sent) && g.fields.join() === "g-code,g-pw,g-pw2" && g.button === "CREATE ACCOUNT" && g.remember === true && g.links.length === 2 && /spam folder/.test(g.foot), g);
      const code = await p.evaluate(() => { const i = document.querySelector("#g-code"), u = document.querySelector(".gatewrap input.gkeep"); return { mode: i.inputMode, ac: i.autocomplete, focused: document.activeElement === i, px: parseFloat(getComputedStyle(i).fontSize), user: u?.value, userAc: u?.autocomplete, overflowX: document.documentElement.scrollWidth - innerWidth }; });
      ck("the code field brings up the number pad, takes the code straight from the message where the phone offers it, and has the cursor", code.mode === "numeric" && code.ac === "one-time-code" && code.focused && code.user === "new.person@example.com" && code.userAc === "username" && code.overflowX <= 0, code);
      ck("what is kept on the device while the code is out: the address and the time, nothing else", g.pending && Object.keys(g.pending).sort().join() === "at,codeMin,email,resendSec" && g.pending.email === "new.person@example.com", g.pending);
      ck("a new code cannot be asked for straight away: the button counts down", g.links[0].off && /^NEW CODE IN [1-3] S$/.test(g.links[0].t) && !g.links[1].off && g.links[1].t === "USE ANOTHER EMAIL", g.links);
      if (phone) { const m = await p.evaluate(() => { const r = (s) => document.querySelector(".gatewrap " + s).getBoundingClientRect(), z = Number(document.body.style.zoom) || 1; const card = r(".modal"), go = r("button.go");
          return { card: [Math.round(card.left), Math.round(card.right), Math.round(card.top)], vw: innerWidth, vh: innerHeight, goH: Math.round(go.height), linkH: Math.min(...[...document.querySelectorAll(".gatewrap .glink")].map((e) => Math.round(e.getBoundingClientRect().height))), px: Math.min(...[...document.querySelectorAll(".gatewrap .row input:not([type=checkbox])")].map((i) => parseFloat(getComputedStyle(i).fontSize) * z)), scroll: (() => { const bg = document.querySelector(".gatewrap .modal-bg"); bg.scrollTop = 1e5; const bottom = document.querySelector(".gatewrap .foot").getBoundingClientRect().bottom; const out = { bottom: Math.round(bottom), can: bg.scrollHeight > bg.clientHeight }; bg.scrollTop = 0; return out; })() }; });
        ck(`at phone size: the card inside the screen (${m.card[0]}–${m.card[1]}px of ${m.vw}px, top ${m.card[2]}px), fields ${m.px}px, buttons ${m.goH}px and ${m.linkH}px tall, the last line reachable (bottom ${m.scroll.bottom}px of ${m.vh}px after scrolling)`, m.card[0] >= 0 && m.card[1] <= m.vw && m.card[2] >= 0 && m.px >= 16 && m.goH >= 44 && m.linkH >= 44 && m.scroll.bottom <= m.vh, m);
        await p.setViewportSize({ width: 390, height: 380 }); await p.waitForTimeout(200);   // the keyboard is up: little height left
        const k = await p.evaluate(() => { const bg = document.querySelector(".gatewrap .modal-bg"); bg.scrollTop = 0; const top = document.querySelector(".gatewrap .modal").getBoundingClientRect().top; bg.scrollTop = 1e5; const bottom = document.querySelector(".gatewrap .modal").getBoundingClientRect().bottom; bg.scrollTop = 0; return { top: Math.round(top), bottom: Math.round(bottom), vh: innerHeight }; });
        ck(`with the keyboard up (380px of height) the card starts on the screen (top ${k.top}px) and scrolls to its end (bottom ${k.bottom}px)`, k.top >= 0 && k.bottom <= k.vh, k);
        await p.setViewportSize({ width: 390, height: 664 }); await p.waitForTimeout(200); await p.screenshot({ path: "acc-code-phone.png" }); }
      else await p.screenshot({ path: "acc-code-desktop.png" });
      await p.locator("#g-code").fill(""); await p.locator("#g-code").pressSequentially("12a3 4x"); let typed = await p.locator("#g-code").inputValue();
      await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(150); g = await gate(p);
      ck("letters cannot be typed into the code; five digits are refused on the page", typed === "123 4" && g.err === "Enter the 6-digit code from the email" && srv.of("signup_finish").length === 0, { typed, g });
      await p.locator("#g-code").fill("654 321"); await p.locator("#g-pw").fill("short"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(150); const e1 = (await gate(p)).err;
      await p.locator("#g-pw").fill("a-good-password"); await p.locator("#g-pw2").fill("a-good-passwork"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(150); const e2 = (await gate(p)).err;
      ck("a short password and two passwords that differ are refused on the page", e1 === "Password: at least 8 characters" && e2 === "The two passwords do not match" && srv.of("signup_finish").length === 0, [e1, e2]);
      await p.locator("#g-pw2").fill("a-good-password"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(400); g = await gate(p);
      const f1 = srv.of("signup_finish");
      ck("a wrong code: the server's words are shown, what was typed stays, no one is signed in", f1.length === 1 && f1[0].body.code === "654321" && g.err === "That code is not right. 4 tries left." && g.token === null && (await p.locator("#g-pw").inputValue()) === "a-good-password" && g.fields.join() === "g-code,g-pw,g-pw2", { f1, g });
      await p.waitForFunction(() => document.querySelector("#g-again") && !document.querySelector("#g-again").disabled, null, { timeout: 6000 }); g = await gate(p);
      ck("once the wait is over the button reads SEND A NEW CODE", g.links[0].t === "SEND A NEW CODE" && !g.links[0].off, g.links);
      await tap(p, "#g-again", phone); await p.waitForTimeout(400); g = await gate(p);
      ck("a new code: the server is asked again for the same address, the page says the earlier code no longer works, the code field is empty and the wait starts again", srv.of("signup_start").length === 2 && srv.of("signup_start")[1].body.email === "new.person@example.com" && g.ok && /earlier one no longer works/.test(g.err) && (await p.locator("#g-code").inputValue()) === "" && g.links[0].off, g);
      await p.locator("#g-code").fill("123456"); await tap(p, ".gatewrap button.go", phone); await p.waitForSelector("#topbar", { timeout: 8000 }); await p.waitForTimeout(500);
      const f2 = srv.of("signup_finish").at(-1), after = await p.evaluate(() => ({ token: localStorage.getItem("om_token"), pending: localStorage.getItem("om_signup"), gate: !!document.querySelector(".gatewrap") }));
      ck("the right code: address, code, password and 'remember' go to the server, and the Monitor opens signed in, with nothing left over on the device", JSON.stringify(f2.body) === '{"email":"new.person@example.com","code":"123456","password":"a-good-password","remember":true}' && after.token === tokenFor("new.person@example.com") && after.pending === null && !after.gate && srv.of("signup").length === 0 && srv.of("login").length === 0, { f2, after });
      ck("no errors on the page", errs.length === 0, errs); await ctx.close(); }

    console.log(`\n[${name}: leaving and coming back while the code is out]`);
    { const srv = standIn("email"); const { ctx, p, errs } = await open(b, dev, srv); await toCreate(p, phone);
      await p.locator("#g-id").fill("away@example.com"); await tap(p, ".gatewrap button.go", phone); await p.waitForSelector("#g-code");
      await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#g-code", { timeout: 6000 }); let g = await gate(p);
      ck("the page started afresh (back from the mail app): it is still waiting for the code for the same address, and no second code was asked for", /sent to away@example\.com/.test(g.sent) && g.fields.join() === "g-code,g-pw,g-pw2" && srv.of("signup_start").length === 1, g);
      await tap(p, ".gtabs span:nth-child(1)", phone); await p.waitForTimeout(200); g = await gate(p);
      ck("SIGN IN is still one tap away, with its usual two fields", g.fields.join() === "g-id,g-pw" && g.button === "SIGN IN", g);
      await toCreate(p, phone); await tap(p, "#g-other", phone); await p.waitForTimeout(250); g = await gate(p);
      ck("USE ANOTHER EMAIL: back to the address, filled in for correcting, and nothing is kept on the device", g.fields.join() === "g-id" && (await p.locator("#g-id").inputValue()) === "away@example.com" && g.pending === null && g.button === "SEND CODE", g);
      ck("no errors on the page", errs.length === 0, errs); await ctx.close(); }
    { const srv = standIn("email"); const { ctx, p } = await open(b, dev, srv, { fn: (v) => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("om_signup", v); sessionStorage.setItem("seeded", "1"); } } catch {} }, arg: JSON.stringify({ email: "late@example.com", at: Date.now() - 16 * 60e3, codeMin: 15, resendSec: 60 }) });
      const g = await gate(p);
      ck("a code older than its 15 minutes is not waited for: the page opens on SIGN IN as usual", g.fields.join() === "g-id,g-pw" && g.button === "SIGN IN", g); await ctx.close(); }

    console.log(`\n[${name}: what the server may answer to "send a code"]`);
    { const srv = standIn("email"); const { ctx, p } = await open(b, dev, srv); await toCreate(p, phone);
      srv.script.signup_start = () => ({ status: 409, body: { error: "This email already has an account. Sign in instead; a forgotten password is reset by the manager." } });
      await p.locator("#g-id").fill("taken@example.com"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(400); let g = await gate(p);
      ck("an address that already has an account: said so, and the page stays on the address", /already has an account/.test(g.err) && !g.ok && g.fields.join() === "g-id" && g.pending === null, g);
      srv.script.signup_start = () => ({ status: 403, body: { error: "This account is switched off. Contact the manager." } });
      await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(400); g = await gate(p);
      ck("a deactivated address cannot open a new account", /switched off/.test(g.err) && g.fields.join() === "g-id", g);
      srv.script.signup_start = () => ({ status: 502, body: { error: "The email could not be sent. Try again in a minute; if it keeps failing, tell the manager." } });
      await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(400); g = await gate(p);
      ck("an email that could not be sent: said so, no code is waited for", /could not be sent/.test(g.err) && g.fields.join() === "g-id" && g.pending === null, g);
      srv.script.signup_start = () => ({ status: 429, body: { error: "A code was sent a moment ago. A new one can be sent in 40 s.", why: "gap", waitSec: 40, resendSec: 60 } });
      await tap(p, ".gatewrap button.go", phone); await p.waitForSelector("#g-code"); await p.waitForTimeout(200); g = await gate(p);
      ck("a code already sent moments ago (the page had lost track of it): go on to entering that code, with the rest of the wait shown", g.ok && /sent to this address a moment ago/.test(g.err) && /^NEW CODE IN (3[89]|40) S$/.test(g.links[0].t), g);
      srv.script.signup_start = () => ({ status: 429, body: { error: "Too many codes were sent to this address. Try again in 30 min.", why: "email_hour", waitSec: 1790, resendSec: 60 } });
      await tap(p, "#g-other", phone); await p.waitForTimeout(200); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(400); g = await gate(p);
      ck("too many codes to one address: said so, with the wait, and the page stays on the address", g.err === "Too many codes were sent to this address. Try again in 30 min." && g.fields.join() === "g-id", g); await ctx.close(); }

    console.log(`\n[${name}: servers without codes by email keep the earlier way]`);
    for (const kind of ["old", "approval"]) { const srv = standIn(kind); const { ctx, p, errs } = await open(b, dev, srv); await toCreate(p, phone);
      let g = await gate(p);
      const label = kind === "old" ? "a server from before this change (it does not know the question)" : "a server with no email sender set up";
      ck(`${label}: email, password, password again, approved by the manager`, g.fields.join() === "g-id,g-pw,g-pw2" && g.button === "CREATE ACCOUNT" && /approved by the manager/.test(g.foot), g);
      await p.locator("#g-id").fill("old.way@example.com"); await p.locator("#g-pw").fill("a-good-password"); await p.locator("#g-pw2").fill("a-good-password"); await tap(p, ".gatewrap button.go", phone); await p.waitForTimeout(400); g = await gate(p);
      ck(`${label}: the account is asked for as before, and the page says it waits for approval`, srv.of("signup").length === 1 && JSON.stringify(srv.of("signup")[0].body) === '{"email":"old.way@example.com","password":"a-good-password"}' && srv.of("signup_start").length === 0 && g.ok && /once the manager has approved it/.test(g.err) && g.button === "SIGN IN", g);
      ck("no errors on the page", errs.length === 0, errs); await ctx.close(); }

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
      ck("an account opened by code says so (with the time) when its address is pointed at", /address confirmed by code/.test(rows[1].tip) && !/confirmed/.test(rows[2].tip), rows.map((r) => r.tip));
      const line = await p.evaluate(() => document.querySelector("#mailline")?.textContent ?? "");
      ck("above the list: accounts open by themselves, and which address the codes come from", /open by themselves/.test(line) && line.includes("desk@example.com") && line.includes("smtp.gmail.com") && /SEND A TEST EMAIL/.test(line), line);

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
