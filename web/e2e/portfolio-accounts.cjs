// The paper portfolio and the account that owns it (the fixes after the second review of P-1, 22 Nov 2026: RT-1 and
// PV-1, PV-2 and RT-8, RT-4). On the sign-in server (5183): the page's real sign-in screen and its real SIGN OUT, with
// the API answered by this suite for two accounts. The portfolio answers it serves are the engine's own, taken once
// from the local copy (5179): nothing about a book is typed again here.
//   [1] the form's draft belongs to the account that typed it: gone at SIGN OUT and at SIGN OUT AND CONTINUE, never
//       shown to the next account in the same tab, kept for the same person after an expired sign-in
//   [2] what the page keeps on the device: nothing of a book on disk after a sign-in that was not to be remembered,
//       nothing from an answer still on its way at sign-out, nothing of a deleted book, nothing at a start that
//       finds no sign-in
//   [3] a create whose answer was lost: the next press of a changed form announces no book that was not created
// Nothing here reads the machine's clock for a check: no figure on these screens depends on the hour.
// Run from web/:  node e2e/run.cjs portfolio-accounts   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium } = require("playwright");
const { routes } = require("./harness.cjs");
const GATE = "http://localhost:5183/orrery-market-monitor/", MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 1800)}`); };
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = "pm.a@example.com", B = "pm.b@example.com";
const tokenFor = (id) => Buffer.from(JSON.stringify({ id })).toString("base64") + ".sig";
const idOf = (auth) => { try { return JSON.parse(Buffer.from(String(auth).replace(/^Bearer /, "").split(".")[0], "base64").toString("utf8")).id ?? null; } catch { return null; } };
const linkFor = (email, code) => `#verify=${code}.${Buffer.from(email).toString("base64url")}`;   // as the server's verifyLink() builds it
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
const NO_SUCH = "No such paper portfolio in your account.";

/** The engine's own answers for a book, the list and the form's facts, read once from the local copy. */
async function engineAnswers(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("om_mock_now", "2026-11-21T09:00:00Z"); } catch {} });
  const p = await ctx.newPage();
  await p.goto(MOCK + "#portfolio/all", { waitUntil: "networkidle" }); await p.waitForSelector("#pf-list", { timeout: 20000 });
  const got = await p.evaluate(async (id) => {
    const m = await import("/orrery-market-monitor/src/lib/mockPf.ts"), one = async (a, q = {}) => (await m.mockPf(a, "GET", q, {})).body;
    return { form: await one("pf_form"), list: await one("pf_list"), book: await one("pf_get", { id }) };
  }, ID(1));
  await ctx.close();
  return got;
}

/** The stand-in API: two accounts, each with its own books; `script` answers one action differently for a check. */
function standIn(E) {
  const first = E.list.rows.find((r) => r.id === ID(1));
  const s = { calls: [], script: {}, books: { [A]: [{ row: first, full: E.book.book, requestId: "stand-in-0001" }], [B]: [] }, of: (a) => s.calls.filter((c) => c.a === a) };
  const mine = (who) => s.books[who] ?? [];
  s.attach = async (p) => {
    await routes(p);
    await p.route("**/fakeapi?*", async (r) => {
      const rq = r.request(), url = new URL(rq.url()), a = url.searchParams.get("action");
      const send = (status, body) => r.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
      if (rq.method() === "OPTIONS") return r.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-methods": "GET,POST,OPTIONS" } });
      const known = ["auth_info", "login", "me", "signup_verify", "pf_form", "pf_list", "pf_get", "pf_create", "pf_delete", "consent"];
      if (!known.includes(a)) return r.fallback();
      let body = null; try { body = rq.postDataJSON(); } catch { /* a GET */ }
      const who = idOf(rq.headers().authorization), call = { a, who, body, id: url.searchParams.get("id") };
      s.calls.push(call);
      if (s.script[a]) { const x = await s.script[a](call, r); if (x === "handled") return; if (x) return send(x.status, x.body); }
      const open = mine(who).map((x) => x.row);
      switch (a) {
        case "auth_info": return send(200, { signup: "email", codeMin: 15, resendSec: 60 });
        case "login": return send(200, { token: tokenFor(body.email) });
        case "signup_verify": return send(200, { ok: true, email: body.email });
        case "me": return send(200, { email: who, role: "user", mustChange: false });
        case "consent": return send(200, E.form.consent);
        case "pf_form": return send(200, { ...E.form, open: open.length, names: open.map((x) => x.name) });
        case "pf_list": return send(200, { rows: open, cap: 5, open: open.length });
        case "pf_get": { const b = mine(who).find((x) => x.row.id === call.id); return b ? send(200, { ...E.book, book: b.full }) : send(404, { error: NO_SUCH }); }
        case "pf_create": {
          const had = mine(who).find((x) => x.requestId === body.requestId);
          if (had) return had.row.name === String(body.name).trim() ? send(200, { id: had.row.id }) : send(400, { error: `an earlier press of this form created "${had.row.name}"`, made: { id: had.row.id, name: had.row.name } });
          const id = ID(70 + Object.values(s.books).flat().length), name = String(body.name).trim();
          (s.books[who] = mine(who)).push({ row: { ...first, id, name }, full: { ...E.book.book, id, name, notes: [] }, requestId: body.requestId });
          return send(200, { id });
        }
        case "pf_delete": { const i = mine(who).findIndex((x) => x.row.id === body.id && x.row.name === body.name); if (i < 0) return send(404, { error: NO_SUCH }); mine(who).splice(i, 1); return send(200, { ok: true }); }
      }
    });
  };
  return s;
}

async function open(b, srv, hash) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await srv.attach(p);
  await p.goto(GATE + hash, { waitUntil: "networkidle" }); await p.waitForSelector(".gatewrap .modal", { timeout: 20000 });
  return { ctx, p, errs };
}
const signIn = async (p, email, { remember = true, then = "#topbar" } = {}) => {
  await p.waitForSelector("#g-id");
  await p.fill("#g-id", email); await p.fill("#g-pw", "a-password-of-its-own");
  const box = p.locator(".gatewrap .chk input"); if ((await box.isChecked()) !== remember) await box.click();
  await p.click(".gatewrap button.go"); await p.waitForSelector(then, { timeout: 20000 }); await p.waitForTimeout(300);
};
const signOut = async (p) => { await p.click("#userchip"); await p.getByRole("button", { name: "SIGN OUT", exact: true }).click(); await p.waitForSelector(".gatewrap .modal", { timeout: 20000 }); await p.waitForTimeout(200); };
const hop = async (p, hash, sel) => {
  await p.evaluate((h) => new Promise((res) => { const drawn = () => requestAnimationFrame(() => requestAnimationFrame(() => res())); if (location.hash === `#${h}`) drawn(); else { addEventListener("hashchange", drawn, { once: true }); location.hash = h; } }), hash);
  if (sel) await p.waitForSelector(sel, { timeout: 15000 });
  await p.waitForTimeout(250);
};
const set = async (p, key, value) => { const sel = `[data-row="${key}"] input[data-key="${key}"]`; await p.fill(sel, value); await p.locator(sel).blur(); await p.waitForTimeout(80); };
const form = (p) => p.evaluate(() => ({ hash: location.hash, name: document.querySelector("#pf-name")?.value ?? null, gross: document.querySelector('input[data-key="gross"]')?.value ?? null, net: document.querySelector('input[data-key="net"]')?.value ?? null,
  back: document.querySelector("#pf-draft")?.textContent ?? null, kept: (() => { try { return sessionStorage.getItem("om_pf_draft"); } catch { return "blocked"; } })(), last: (() => { try { return localStorage.getItem("om_pf_last"); } catch { return "blocked"; } })() }));
/** The keys of what the page keeps on this device for opening without a connection (lib/keep.ts). */
const keptKeys = (p) => p.evaluate(() => new Promise((res) => {
  const rq = indexedDB.open("om-keep", 1);
  rq.onupgradeneeded = () => { rq.result.createObjectStore("api"); };
  rq.onsuccess = () => { const db = rq.result, g = db.transaction("api").objectStore("api").getAllKeys(); g.onsuccess = () => { db.close(); res(g.result.map(String)); }; g.onerror = () => { db.close(); res(["(could not be read)"]); }; };
  rq.onerror = () => res(["(no database)"]);
}));
const book = (keys) => keys.filter((k) => /\|pf_/.test(k));

(async () => {
  const b = await chromium.launch();
  const E = await engineAnswers(b);
  if (!E.book?.book?.notes?.length || !E.list?.rows?.length || !E.form?.consent?.agreedAt) throw new Error("the local copy did not give its stand-in book, list and facts");

  console.log("\n[1] the form's draft belongs to the account that typed it (RT-1, PV-1)");
  {
    const srv = standIn(E), { ctx, p, errs } = await open(b, srv, "#portfolio/new/ar-ls-jp");
    await signIn(p, A, { then: "#pf-name" });
    await p.fill("#pf-name", "Account A's private book"); await set(p, "gross", "180");
    const typed = await form(p);
    ck(`account A types a name and a limit into NEW PAPER PORTFOLIO: the draft is kept in this tab, with the account it belongs to`, typed.name === "Account A's private book" && typed.gross === "180" && !!typed.kept && JSON.parse(typed.kept).who === A, typed);
    await signOut(p);
    const out = await form(p);
    ck("SIGN OUT removes the draft from the tab's storage, and the book last opened with it", out.kept === null && out.last === null, out);
    await signIn(p, B, { then: "#pf-name" });
    const second = await form(p);
    ck(`account B signs in in the same tab and lands on the same address (${second.hash}): its form is a new one (name "${second.name}", Gross ${second.gross}), with no "Your unsaved settings … are back" and nothing account A typed`, second.hash === "#portfolio/new/ar-ls-jp" && second.back === null && /^Equity L\/S · Japan · \d+ \w+ \d{4}$/.test(second.name ?? "") && second.gross === "200" && !JSON.stringify(second).includes("private book"), second);

    // an expired sign-in: the form says the settings are kept, and they are, for the same person
    await p.fill("#pf-name", "B's own draft"); await set(p, "net", "15");
    srv.script.pf_create = () => ({ status: 401, body: { error: "unauthorised" } });
    await p.click("#pf-create"); await p.waitForSelector(".gatewrap .modal", { timeout: 20000 });
    const expired = await form(p);
    ck("an expired sign-in (the server answers 401 to CREATE) shows the sign-in screen and keeps the draft, as the form's own sentence says", !!expired.kept && JSON.parse(expired.kept).who === B && JSON.parse(expired.kept).name === "B's own draft", expired);
    delete srv.script.pf_create;
    await signIn(p, B, { then: "#pf-name" });
    const again = await form(p);
    ck(`account B signs in again: "${again.back}" with its own name and limit`, again.name === "B's own draft" && again.net === "15" && /^Your unsaved settings from \d\d:\d\d are back/.test(again.back ?? ""), again);

    // the same expiry, and then the OTHER account signs in: nothing of B's draft is shown, and it is dropped
    srv.script.pf_create = () => ({ status: 401, body: { error: "unauthorised" } });
    await p.click("#pf-create"); await p.waitForSelector(".gatewrap .modal", { timeout: 20000 });
    delete srv.script.pf_create;
    await signIn(p, A, { then: "#pf-name" });
    const other = await form(p);
    ck(`after B's expired sign-in account A signs in instead: its form is a new one (name "${other.name}", Net ${other.net}), and B's draft is dropped from the tab`, other.back === null && other.net === "20" && !JSON.stringify(other).includes("B's own draft") && (other.kept === null || JSON.parse(other.kept).who === A), other);
    ck("no error on the page", errs.length === 0, errs);
    await ctx.close();
  }
  {
    // SIGN OUT AND CONTINUE (the verification link's card, for another account in this browser)
    const srv = standIn(E), { ctx, p, errs } = await open(b, srv, "#portfolio/new/ar-macro");
    await signIn(p, A, { then: "#pf-name" });
    await p.fill("#pf-name", "A's macro draft");
    const before = await form(p);
    await p.evaluate((h) => { location.hash = h; location.reload(); }, linkFor("new.person@example.com", "123456"));
    await p.waitForSelector("#vf-out", { timeout: 20000 });
    const held = await form(p);
    await p.click("#vf-out"); await p.waitForSelector(".gatewrap .modal", { timeout: 20000 }); await p.waitForTimeout(200);
    const after = await form(p);
    ck("SIGN OUT AND CONTINUE, pressed for another account's verification link, removes the draft too", !!before.kept && !!held.kept && after.kept === null && errs.length === 0, { before: !!before.kept, held: !!held.kept, after: after.kept, errs });
    await ctx.close();
  }

  console.log("\n[2] what the page keeps on the device (PV-2, RT-8)");
  {
    // a sign-in that is not to be remembered: nothing of a book is written to this device
    const srv = standIn(E), { ctx, p, errs } = await open(b, srv, `#portfolio/${ID(1)}`);
    await signIn(p, A, { remember: false, then: "#pf-overview" });
    await p.waitForTimeout(600);
    const keys = await keptKeys(p), token = await p.evaluate(() => ({ local: localStorage.getItem("om_token") != null, session: sessionStorage.getItem("om_token") != null }));
    ck(`"Remember me" unticked (the sign-in lives in this tab only): the book is on screen and nothing of it is written to the device (${book(keys).length} portfolio answers among ${keys.length} kept)`, !token.local && token.session && book(keys).length === 0 && !keys.some((k) => k.includes(ID(1))), { keys, token });
    // and the last answer still stands in for a lost connection, from memory, while the tab lives
    srv.script.pf_get = (_c, r) => { void r.abort("failed"); return "handled"; };
    await hop(p, "portfolio/all", "#pf-list"); await hop(p, `portfolio/${ID(1)}`, "#pf-overview");
    const offline = await p.evaluate(() => ({ line: document.querySelector("#pf-kept")?.textContent ?? null, name: document.querySelector("#pf-switch .n")?.textContent ?? null }));
    ck(`without a connection the book is still shown from what this tab last read: "${(offline.line ?? "").slice(0, 44)}…"`, /^Offline: what this device last read, as of /.test(offline.line ?? "") && offline.name === "Tokyo L/S" && book(await keptKeys(p)).length === 0 && errs.length === 0, { offline, errs });
    await ctx.close();
  }
  {
    // a remembered sign-in keeps the last answers on the device (the page opens without a connection); an answer still
    // on its way when SIGN OUT is pressed is not stored after the store was emptied
    const srv = standIn(E), { ctx, p, errs } = await open(b, srv, `#portfolio/${ID(1)}`);
    await signIn(p, A, { then: "#pf-overview" });
    await p.waitForTimeout(600);
    const keys = await keptKeys(p);
    ck(`"Remember me" ticked: the book's and the list's last answers are kept on the device (${book(keys).map((k) => k.split("|")[1]).sort().join(", ")})`, book(keys).some((k) => k.startsWith(`${A}|pf_get|`)) && book(keys).some((k) => k.startsWith(`${A}|pf_list|`)), keys);
    let late = null;
    srv.script.pf_get = (_c, r) => { late = new Promise((res) => setTimeout(() => { void r.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify(E.book) }).then(res, res); }, 1500)); return "handled"; };
    await hop(p, "portfolio/all", "#pf-list");
    await p.evaluate((h) => { location.hash = h; }, `portfolio/${ID(1)}`); await p.waitForTimeout(150);   // the read has left; its answer comes in 1.5 s
    await signOut(p);
    await late; await p.waitForTimeout(700);
    const after = await keptKeys(p);
    ck(`SIGN OUT while a book's answer is on its way: the store is emptied, and the answer that arrives afterwards is not stored (${after.length} kept)`, late !== null && after.length === 0 && errs.length === 0, { after, errs });
    await ctx.close();
  }
  {
    // a start that finds no sign-in: what an ended session left on the device goes
    const srv = standIn(E), { ctx, p, errs } = await open(b, srv, "#portfolio");
    await p.evaluate((key) => new Promise((res) => { const rq = indexedDB.open("om-keep", 1); rq.onupgradeneeded = () => { rq.result.createObjectStore("api"); }; rq.onsuccess = () => { const db = rq.result, t = db.transaction("api", "readwrite"); t.objectStore("api").put({ at: Date.now(), data: { book: { name: "left behind" } } }, key); t.oncomplete = () => { db.close(); res(); }; }; }), `${A}|pf_get|{"id":"${ID(1)}"}`);
    const planted = await keptKeys(p);
    await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector(".gatewrap .modal", { timeout: 20000 }); await p.waitForTimeout(600);
    const left = await keptKeys(p);
    ck(`a start that finds no sign-in empties what an ended session left on the device (${planted.length} entry before, ${left.length} after)`, planted.length === 1 && left.length === 0 && errs.length === 0, { planted, left, errs });
    await ctx.close();
  }
  {
    // a deleted book, and a book that is no longer the account's: its kept answer goes
    const srv = standIn(E), { ctx, p, errs } = await open(b, srv, `#portfolio/${ID(1)}`);
    await signIn(p, A, { then: "#pf-overview" });
    await p.waitForTimeout(500);
    const had = book(await keptKeys(p)).filter((k) => k.includes(ID(1)));
    srv.books[A].length = 0;   // deleted from another device
    await hop(p, "portfolio/all", "#pf-intro"); await hop(p, `portfolio/${ID(1)}`, "#pf-nosuch");
    await p.waitForTimeout(400);
    const gone = book(await keptKeys(p)).filter((k) => k.includes(ID(1)));
    ck(`a book that is no longer in the account (the server answers 404): "${await p.evaluate(() => document.querySelector("#pf-nosuch")?.textContent)}", and its kept answer is removed from the device (${had.length} before, ${gone.length} after)`, had.length === 1 && gone.length === 0, { had, gone });
    await ctx.close();
    const srv2 = standIn(E), two = await open(b, srv2, `#portfolio/${ID(1)}/settings/delete`);
    await signIn(two.p, A, { then: "#pf-delete-open" });
    await two.p.waitForTimeout(500);
    const before = book(await keptKeys(two.p)).filter((k) => k.includes(ID(1)));
    await two.p.click("#pf-delete-open"); await two.p.fill("#pf-delete-in", "Tokyo L/S"); await two.p.click("#pf-delete-go");
    await two.p.waitForSelector("#pf-intro", { timeout: 15000 }); await two.p.waitForTimeout(500);
    const keys = await keptKeys(two.p), after = book(keys).filter((k) => k.includes(ID(1))), names = await two.p.evaluate(() => new Promise((res) => { const rq = indexedDB.open("om-keep", 1); rq.onsuccess = () => { const db = rq.result, g = db.transaction("api").objectStore("api").getAll(); g.onsuccess = () => { db.close(); res(JSON.stringify(g.result).includes("Tokyo L/S")); }; }; }));
    ck(`DELETE, after the name is typed: the page says "${await two.p.evaluate(() => document.querySelector(".pf-flash")?.textContent ?? null)}" and nothing of the deleted book stays on the device (${before.length} kept answer before, ${after.length} after; its name in what is kept: ${names})`, srv2.of("pf_delete").length === 1 && before.length === 1 && after.length === 0 && names === false && errs.length === 0 && two.errs.length === 0, { before, keys, names, errs: [...errs, ...two.errs] });
    await two.ctx.close();
  }

  console.log("\n[3] a create whose answer was lost (RT-4)");
  {
    const srv = standIn(E), { ctx, p, errs } = await open(b, srv, "#portfolio/new/ar-ls-jp");
    await signIn(p, B, { then: "#pf-name" });
    await p.fill("#pf-name", "First");
    // the server creates the book and its answer is lost on the way back
    srv.script.pf_create = (c, r) => { srv.books[B].push({ row: { ...E.list.rows[0], id: ID(91), name: "First" }, full: { ...E.book.book, id: ID(91), name: "First", notes: [] }, requestId: c.body.requestId }); void r.abort("failed"); return "handled"; };
    await p.click("#pf-create"); await p.waitForSelector("#pf-create-msg"); await p.waitForTimeout(300);
    const lost = await p.evaluate(() => ({ msg: document.querySelector("#pf-create-msg")?.textContent ?? null, hash: location.hash }));
    delete srv.script.pf_create;
    // the connection is back (the page asks the server again at once, and CREATE can be pressed again)
    await p.evaluate(() => window.dispatchEvent(new Event("online"))); await p.waitForSelector("#pf-create:not([disabled])", { timeout: 15000 });
    await p.fill("#pf-name", "Second"); await p.locator("#pf-name").blur();
    await p.click("#pf-create"); await p.waitForTimeout(700);
    const told = await p.evaluate(() => ({ msg: document.querySelector("#pf-create-msg")?.textContent ?? null, flash: document.querySelector(".pf-flash")?.textContent ?? null, hash: location.hash }));
    ck(`the answer to CREATE is lost ("${lost.msg}"); the name is changed to "Second" and CREATE pressed again: no book is announced, the page stays on the form and says what the first press did: "${told.msg}"`, /^Offline: a portfolio needs the server/.test(lost.msg ?? "") && told.flash === null && told.hash === "#portfolio/new/ar-ls-jp" && /"First"/.test(told.msg ?? "") && !/created · Second/.test(JSON.stringify(told)), { lost, told });
    await p.click("#pf-create"); await p.waitForSelector("#pf-overview", { timeout: 15000 });
    const made = await p.evaluate(() => ({ flash: document.querySelector(".pf-flash")?.textContent ?? null, hash: location.hash })), rids = srv.of("pf_create").map((c) => c.body.requestId);
    ck(`pressed once more, the changed form is a request of its own and creates "Second" ("${made.flash}"): three presses, the first two under one request id and the third under a new one`, made.flash === "Paper portfolio created · Second" && rids.length === 3 && rids[0] === rids[1] && rids[2] !== rids[0] && srv.books[B].map((x) => x.row.name).join() === "First,Second" && errs.length === 0, { made, rids, errs });
    await ctx.close();
  }

  await b.close();
  console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
