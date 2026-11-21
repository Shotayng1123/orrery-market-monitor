// The paper portfolio's store (P-1, 21 Nov 2026; supabase/migrations/20261121000001_pf_store.sql), on PGlite with the
// migration file itself. Who may see what (an account its own books and no other's; anon, authenticated and the
// server's own role no table at all), what is never changed (settings and their history, a note's text, what is fixed
// at creation), the statement before any portfolio or note, the targets' window, and deletion after typing the name.
// One scenario is run through the API's own routes (supabase/functions/_shared/pf/route.ts) against the database and
// against the stand-in store the local copy uses (pf/memstore.ts), and the two sets of answers are compared: the same
// rules, the same words. The migration is also applied as a role that may make roles but is no superuser (the hosted
// database's kind), and as one that may not (the fallback the migration's head describes). No row of any account is
// printed. From sim/sql:  npm test
const { PGlite } = require("@electric-sql/pglite");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", ".."), MIG = path.join(ROOT, "supabase", "migrations"), SHARED = path.join(ROOT, "supabase", "functions", "_shared");
let pass = 0, fail = 0;
const ck = (name, cond, detail) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  ->  " + JSON.stringify(detail) : "")); } };
const SQL = fs.readFileSync(path.join(MIG, "20261121000001_pf_store.sql"), "utf8");
const TABLES = ["consent_statements", "account_consents", "pf_portfolios", "pf_settings", "pf_notes", "pf_ladder_events"];
const X = "x@example.com", Y = "y@example.com";
// Supabase grants every new table, function and sequence of `public` to its three API roles; the migration must take
// the portfolio's back. The roles and those default grants are made here as the hosted database has them.
const HOSTED = `create role anon; create role authenticated; create role service_role bypassrls;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`;
const accounts = fs.readFileSync(path.join(MIG, "20261116000001_accounts.sql"), "utf8");
const two = `insert into accounts (email, pw_hash, pw_salt, pw_iter, status) values ('${X}','h','s',1,'active'), ('${Y}','h','s',1,'active')`;
const refused = async (db, q, v = []) => { try { await db.query(q, v); return null; } catch (e) { return e.message; } };
const as = async (db, role, f) => { await db.exec(`set role ${role}`); try { return await f(); } finally { await db.exec("reset role"); } };
/** The database's functions as the server calls them (supabase-js's rpc): named arguments, json where the function takes it. */
const JSONB = new Set(["p_book", "p_settings", "p_value"]), CAST = { p_id: "uuid", p_today: "date", p_effective: "date", p_x: "numeric", p_vol: "numeric", p_version: "int", p_note: "bigint" };
const rpcOf = (db) => async (fn, args) => {
  const keys = Object.keys(args), vals = keys.map((k) => (JSONB.has(k) ? JSON.stringify(args[k]) : args[k]));
  try { const r = await db.query(`select ${fn}(${keys.map((k, i) => `${k} => $${i + 1}::${JSONB.has(k) ? "jsonb" : CAST[k] ?? "text"}`).join(", ")}) as r`, vals); return { data: r.rows[0].r, error: null }; }
  catch (e) { return { data: null, error: { message: e.message, code: e.code } }; }
};

(async () => {
  const route = await import(path.join(SHARED, "pf", "route.ts")), mem = await import(path.join(SHARED, "pf", "memstore.ts")), { sqlStore } = await import(path.join(SHARED, "pfstore.ts"));
  const form = await import(path.join(SHARED, "pf", "form.ts")), view = await import(path.join(SHARED, "pf", "view.ts")), words = await import(path.join(SHARED, "pf", "words.ts")), st = await import(path.join(SHARED, "pf", "statement.ts"));
  const db = new PGlite();
  await db.exec(HOSTED); await db.exec(accounts);
  let twice = true; try { await db.exec(SQL); await db.exec(SQL); } catch (e) { twice = e.message; }
  ck("the change applies, and applies again without an error", twice === true, twice);
  await db.exec(two);
  const one = async (q, v = []) => (await db.query(q, v)).rows[0];
  const all = async (q, v = []) => (await db.query(q, v)).rows;
  const count = async (t, where = "true", v = []) => Number((await one(`select count(*) as n from ${t} where ${where}`, v)).n);

  console.log("\n[who may reach the tables: nobody but the functions]");
  { const t = (await one("select pf_selftest() as r")).r;
    ck(`pf_selftest ok: ${t.rls} of ${t.tables} tables with row level security, ${t.policies} policies for the account role, ${t.openGrants} privileges held by anon or authenticated, ${t.serviceRoleGrants} by the server's own role, ${t.openFunctions} of the functions callable by anon or authenticated, ${t.definerOwner} of ${t.functions} owned by the role the policies bind, ${t.rowsSeen} rows seen as a made-up account`, t.ok === true && t.rls === 6 && t.tables === 6 && t.policies === 6 && t.openGrants === 0 && t.serviceRoleGrants === 0 && t.openFunctions === 0 && t.definerOwner === t.functions && t.functions === 13 && t.rowsSeen === 0 && t.rowsThroughPolicies === 0 && t.statements === 1, t);
    ck("what it returns names no account and no portfolio: counts and one yes or no", Object.values(t).every((v) => v === null || typeof v === "number" || typeof v === "boolean"), t);
    const denied = {};
    for (const role of ["anon", "authenticated", "service_role"]) { denied[role] = 0; for (const tb of TABLES) { const m = await as(db, role, () => refused(db, `select count(*) from ${tb}`)); if (/permission denied/.test(m ?? "")) denied[role]++; } }
    ck("anon, authenticated and the server's own role are each refused a read of all six tables (Supabase's default grants taken back)", denied.anon === 6 && denied.authenticated === 6 && denied.service_role === 6, denied);
    const writes = []; for (const role of ["anon", "authenticated", "service_role"]) writes.push(await as(db, role, () => refused(db, `insert into pf_notes (portfolio_id, account, body) values (gen_random_uuid(), '${X}', 'n')`)));
    ck("and a write", writes.every((m) => /permission denied/.test(m ?? "")), writes);
    const fns = (await all("select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'pf\\_%' and p.prosecdef")).map((r) => r.f);
    const open = []; for (const role of ["anon", "authenticated"]) for (const f of fns) if ((await one("select has_function_privilege($1, $2, 'execute') as ok", [role, f])).ok) open.push(`${role}:${f}`);
    const called = []; for (const role of ["anon", "authenticated"]) called.push(await as(db, role, () => refused(db, `select pf_list('${X}')`)), await as(db, role, () => refused(db, "select pf_selftest()")));
    ck(`anon and authenticated may call none of the ${fns.length} functions`, open.length === 0 && called.every((m) => /permission denied/.test(m ?? "")), { open, called });
    ck("the server's role may call them, and a list of nothing is empty", (await as(db, "service_role", () => one(`select pf_list('${X}') as r`))).r.length === 0); }

  console.log("\n[the statement: the owner's wording, and nothing before it]");
  { const s = await one("select version, body, label from consent_statements");
    ck("version 1 is the text the page and the stand-in store carry, character for character, with its label", s.version === 1 && s.body === st.STATEMENT_TEXT && s.label === st.STATEMENT_LABEL && `${s.body} \u2610 ${s.label}` === st.STATEMENT_RECORD, s.body.length);
    const book = { requestId: "req-00000001", name: "b", kind: "AR", start: "ar-ls-jp", base: "USD", startingNav: 10000000000, fx: null, targetX: 5, targetVol: 5, reference: "MSCI Japan, hedged", blend: null, ladderBase: "guarded", ladder: { cut1: 4 }, houseMultiple: 1, valuation: "17:00 New York", startedOn: "2026-11-21" };
    const m = await refused(db, "select pf_create($1, $2::jsonb, '[]'::jsonb)", [X, JSON.stringify(book)]);
    ck(`no portfolio before the statement: "${m}"`, m === words.NEEDS_STATEMENT && (await count("pf_portfolios")) === 0, m);
    ck("an agreement to a version that is not the current one is refused", (await refused(db, "select pf_consent_agree($1, 2)", [X])) === words.OLD_VERSION && (await count("account_consents")) === 0); }

  // ---- one scenario through the API's routes, against the database and against the stand-in store ----
  const HOL = { TSE: ["2026-11-23"], NYSE: ["2026-11-26", "2026-12-25"] };
  const FACTS = { rates: { USD: { name: "EFFR", rate: 3.88, d: "2026-11-18", source: "New York Fed", standIn: false }, JPY: null }, usdjpy: { rate: 158.4, d: "2026-11-20", source: "Yahoo Finance, unofficial" }, holidays: HOL };
  async function scenario(store) {
    let now = "2026-11-21T09:00:00Z";
    const deps = { on: true, store, now: () => new Date(now), facts: async () => FACTS }, out = [];
    const call = async (who, action, body = {}, query = {}) => { const r = await route.pfRoute(deps, action, who, Object.keys(body).length || /set|add|remove|create|rename|delete|agree/.test(action) ? "POST" : "GET", (k) => query[k] ?? null, body); out.push({ action, who, status: r.status, body: r.body }); return r; };
    const values = (start, base = "USD") => form.defaultRaw(start, base);
    await call(X, "pf_form");
    await call(X, "pf_create", { requestId: "request-0001", start: "ar-ls-jp", name: "Tokyo L/S", values: values("ar-ls-jp") });   // before the statement
    await call(X, "consent_agree", { version: 2 });
    await call(X, "consent_agree", { version: 1 });
    await call(X, "consent_agree", { version: 1 });   // a second agreement changes nothing
    const made = await call(X, "pf_create", { requestId: "request-0001", start: "ar-ls-jp", name: "Tokyo L/S", values: values("ar-ls-jp") });
    const id = made.body.id;
    await call(X, "pf_create", { requestId: "request-0001", start: "ar-ls-jp", name: "Tokyo L/S", values: values("ar-ls-jp") });   // the same form pressed twice
    await call(X, "pf_create", { requestId: "request-0002", start: "ar-ls-jp", name: "Tokyo L/S", values: values("ar-ls-jp") });   // the name again
    await call(X, "pf_create", { requestId: "request-0003", start: "ar-ls-jp", name: "Second", values: { ...values("ar-ls-jp"), nav: "5m", target_x: "15.5", cut1: "9", cap1: "50", cap2: "50", target_vol: "7.0" } });
    await call(X, "pf_create", { requestId: "request-0004", start: "rr-eq", name: "Long only", values: {} });
    await call(X, "pf_list"); await call(Y, "pf_list");
    await call(X, "pf_get", {}, { id }); await call(Y, "pf_get", {}, { id }); await call(X, "pf_get", {}, { id: "not-an-id" });
    // the other account cannot write into this portfolio
    await call(Y, "pf_setting_set", { id, key: "one_long", value: "8", reason: "tighter into results season" });
    await call(Y, "pf_note_add", { id, body: "a note from elsewhere" });
    await call(Y, "pf_rename", { id, name: "Mine now" });
    await call(Y, "pf_targets_set", { id, x: "6.0", vol: "5.5" });
    await call(Y, "pf_delete", { id, name: "Tokyo L/S" });
    // a change: a reason, the next session, the history
    await call(X, "pf_setting_set", { id, key: "one_long", value: "8", reason: "" });
    await call(X, "pf_setting_set", { id, key: "one_long", value: "8", reason: "tighter into results season" });
    await call(X, "pf_setting_set", { id, key: "one_long", value: "8.25", reason: "tighter into results season" });
    await call(X, "pf_setting_set", { id, key: "one_long", value: "40", reason: "tighter into results season" });
    await call(X, "pf_setting_set", { id, key: "cut1", value: "5", reason: "the ladder is fixed, this must fail" });
    await call(X, "pf_setting_set", { id, key: "target_vol", value: "6", reason: "a target is not changed like a limit" });
    await call(X, "pf_setting_set", { id, key: "var", value: "0.7", reason: "under the target's normal VaR, refused" });
    await call(X, "pf_setting_set", { id, key: "amber", value: "110", reason: "inside the band, refused by the guard" });
    await call(X, "pf_setting_set", { id, key: "jp_resident", value: "yes", reason: "the fund is set as Japan-resident" });
    await call(X, "pf_targets_set", { id, x: "6.0", vol: "5.5" });   // 21 Nov: outside the window
    now = "2026-12-15T02:00:00Z";
    await call(X, "pf_targets_set", { id, x: "6.0", vol: "7.0" });   // inside it, but above the VaR limit
    await call(X, "pf_targets_set", { id, x: "6.0", vol: "5.5" });
    now = "2026-11-21T09:30:00Z";
    await call(X, "pf_note_add", { id, body: "Trim autos into results; add on weakness." });
    await call(X, "pf_note_add", { id, body: "x".repeat(2121) });
    await call(X, "pf_note_add", { id, body: "日本語のメモ。\n二行目。" });
    const got = await call(X, "pf_get", {}, { id });
    const first = got.body.book.notes[got.body.book.notes.length - 1].id;
    await call(X, "pf_note_remove", { id, note: first }); await call(X, "pf_note_remove", { id, note: first });
    await call(X, "pf_rename", { id, name: "Tokyo long/short" }); await call(X, "pf_rename", { id, name: "Tokyo long/short" }); await call(X, "pf_rename", { id, name: "" });
    // a yen base, the macro start, and the cap of five
    await call(X, "pf_create", { requestId: "request-0005", start: "ar-ls-gl", name: "Global, yen", values: { ...values("ar-ls-gl", "JPY"), ladder_base: "start", target_x: "3.0", target_vol: "6.0" } });
    await call(X, "pf_create", { requestId: "request-0006", start: "ar-macro", name: "Macro", values: { ...values("ar-macro"), blend: "70", ladder_base: "yearly" } });
    await call(X, "pf_create", { requestId: "request-0007", start: "ar-macro", name: "Four", values: values("ar-macro") });
    await call(X, "pf_create", { requestId: "request-0008", start: "ar-macro", name: "Five", values: values("ar-macro") });
    await call(X, "pf_create", { requestId: "request-0009", start: "ar-macro", name: "Six", values: values("ar-macro") });
    await call(X, "pf_form");
    await call(X, "pf_get", {}, { id });
    await call(X, "pf_delete", { id, name: "tokyo long/short" }); await call(X, "pf_delete", { id, name: "Tokyo long/short" });
    await call(X, "pf_get", {}, { id }); await call(X, "pf_list"); await call(X, "consent");
    return { out, id };
  }
  // ids and moments differ between the two stores; everything else must not
  // (a setting's and a note's number are their table's own count in the database and one count in the stand-in store:
  // each is replaced by its place in its list)
  const norm = (out) => { const ids = new Map(); const walk = (v, k) => (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(v) ? (ids.has(v) ? ids.get(v) : (ids.set(v, `book${ids.size + 1}`), ids.get(v))) : typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v) ? "(a moment)" : Array.isArray(v) ? v.map((x, i) => (k === "settings" || k === "notes" ? { ...walk(x), id: i } : walk(x))) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((kk) => [kk, walk(v[kk], kk)])) : v); return out.map((o) => walk(o)); };
  console.log("\n[one scenario through the API's routes: the database and the stand-in store answer alike]");
  const sqlRun = await scenario(sqlStore(rpcOf(db)));
  let state = mem.emptyState(), n = 0;
  const memRun = await scenario(mem.memStore({ load: () => state, save: (s) => { state = s; }, now: () => new Date(Date.UTC(2026, 10, 21, 9, 0, n++)), newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` }));
  { const a = norm(sqlRun.out), b = norm(memRun.out), diff = a.map((x, i) => (JSON.stringify(x) === JSON.stringify(b[i]) ? null : { step: i, action: x.action, sql: JSON.stringify(x).slice(0, 400), mem: JSON.stringify(b[i]).slice(0, 400) })).filter(Boolean);
    ck(`${a.length} calls, each answered alike by the database and by the stand-in store (status and body, ids and moments apart)`, a.length === b.length && diff.length === 0, diff.slice(0, 3));
    const by = (action, who, k = 0) => sqlRun.out.filter((o) => o.action === action && o.who === who)[k];
    const s = (o) => `${o.status} ${JSON.stringify(o.body).slice(0, 160)}`;
    ck(`a create before the statement: ${s(by("pf_create", X, 0))}`, by("pf_create", X, 0).status === 409 && by("pf_create", X, 0).body.error === words.NEEDS_STATEMENT);
    ck("asked once: the agreement is stored with its time, and a second one changes nothing", by("consent_agree", X, 0).status === 400 && by("consent_agree", X, 1).body.agreedAt != null && by("consent_agree", X, 2).body.agreedAt === by("consent_agree", X, 1).body.agreedAt && by("consent", X, 0).body.agreedAt === by("consent_agree", X, 1).body.agreedAt);
    ck("then the portfolio is created; the same form pressed twice gives the same portfolio, not a second", by("pf_create", X, 1).status === 200 && by("pf_create", X, 2).body.id === by("pf_create", X, 1).body.id);
    ck(`the same name again: "${by("pf_create", X, 3).body.refusals?.[0]?.text}"; five refusals in one form counted and named: "${by("pf_create", X, 4).body.error}"`, by("pf_create", X, 3).body.refusals[0].text === words.NAME_TAKEN && by("pf_create", X, 4).status === 400 && by("pf_create", X, 4).body.error === "5 settings out of range" && by("pf_create", X, 4).body.refusals.map((r) => r.key).join() === "nav,target_x,cut1,cap2,target_vol");
    ck(`a relative-return start is not offered yet: "${by("pf_create", X, 5).body.error}"`, by("pf_create", X, 5).status === 400);
    ck("its account sees it; the other account sees nothing, and is told the portfolio does not exist", by("pf_list", X, 0).body.rows.length === 1 && by("pf_list", Y, 0).body.rows.length === 0 && by("pf_get", X, 0).status === 200 && by("pf_get", Y, 0).status === 404 && by("pf_get", Y, 0).body.error === words.NO_SUCH && by("pf_get", X, 1).status === 404);
    const yWrites = ["pf_setting_set", "pf_note_add", "pf_rename", "pf_targets_set", "pf_delete"].map((a) => by(a, Y, 0));
    ck("the other account can change nothing in it: a setting, a note, its name, its targets, its deletion are each refused as not found", yWrites.every((o) => o.status === 404 && o.body.error === words.NO_SUCH), yWrites.map(s));
    const ch = (k) => by("pf_setting_set", X, k);
    ck(`a change with no reason: "${ch(0).body.error}"; with one it is saved, in force from the next session (${ch(1).body.effective}: Sat 21 Nov, so Mon 23 Nov, when New York trades and Tokyo is on holiday)`, ch(0).body.error === words.REASON_SHORT && ch(1).status === 200 && ch(1).body.effective === "2026-11-23");
    ck(`off its step "${ch(2).body.error}"; out of range "${ch(3).body.error}"; a ladder number "${ch(4).body.error}"; a target "${ch(5).body.error}"`, ch(2).body.error === "in steps of 0.1" && ch(3).body.error === "between 3% and 25%" && ch(4).body.error === words.FIXED_SETTING && ch(5).body.error === words.TOGETHER);
    ck(`the VaR limit under the target's normal VaR: "${ch(6).body.error.slice(0, 70)}…"; amber inside the band: "${ch(7).body.error}"; a choice changes too`, /^Target volatility 5\.0% implies a 99% one-day VaR of 0\.73% of capital on a normal law, above your 0\.70% VaR limit/.test(ch(6).body.error) && ch(7).body.error === "amber above 110% would fall inside the band, which ends at 120%" && ch(8).status === 200);
    const tg = (k) => by("pf_targets_set", X, k);
    ck(`the targets on 21 Nov: "${tg(0).body.error}"; on 15 Dec a pair above the VaR limit is refused, and a pair that stands is kept for ${tg(2).body.forYear}`, tg(0).body.error === words.WINDOW_CLOSED && tg(1).status === 400 && /above your 1\.00% VaR limit/.test(tg(1).body.error) && tg(2).status === 200 && tg(2).body.forYear === 2027);
    const nt = (k) => by("pf_note_add", X, k), rm = (k) => by("pf_note_remove", X, k);
    ck(`notes: one saved; one of 2,121 characters refused ("${nt(1).body.error}"); one in Japanese with a line break saved; removed once, and "${rm(1).body.error}" the second time`, nt(0).status === 200 && nt(1).body.error === "2,000 characters at most · 121 over" && nt(2).status === 200 && rm(0).status === 200 && rm(1).body.error === words.NO_NOTE);
    const book = by("pf_get", X, 3).body.book, notes = book.notes;
    ck("the removed note keeps its line and its time and has lost its text; the others are whole, line break and all", notes.length === 2 && notes.filter((x) => x.body === null && x.removedAt).length === 1 && notes.some((x) => x.body === "日本語のメモ。\n二行目。"), notes.map((x) => [x.body?.length ?? null, !!x.removedAt]));
    ck(`renamed, once ("${by("pf_rename", X, 1).body.error}" the second time, "${by("pf_rename", X, 2).body.error}" for no name)`, by("pf_rename", X, 0).status === 200 && by("pf_rename", X, 1).status === 400 && by("pf_rename", X, 2).body.error === "give the portfolio a name" && book.name === "Tokyo long/short");
    ck(`five open portfolios, then: "${by("pf_create", X, 10).body.error}"`, by("pf_create", X, 9).status === 200 && by("pf_create", X, 10).body.error === "You have 5 open paper portfolios, the most an account may hold. Delete one to start another." && by("pf_form", X, 1).body.open === 5);
    const yen = by("pf_list", X, 1).body.rows.find((r) => r.name === "Global, yen"), macro = by("pf_list", X, 1).body.rows.find((r) => r.name === "Macro");
    ck("a yen book keeps JPY 10bn with its dollar equivalent, the rate, its date and its source; the macro book its 70/30 blend and its base", yen.base === "JPY" && yen.startingNav === 10000000000 && yen.fx.rate === 158.4 && yen.fx.d === "2026-11-20" && yen.fx.usd === 63131313 && yen.ladderBase === "start" && macro.blend === 70 && macro.ladderBase === "yearly", { yen: yen.fx, macro: macro.blend });
    // the book as its screens read it, from the database's own rows
    const now = view.settingsNow(book, "2026-11-21"), later = view.settingsNow(book, "2026-11-23"), ol = (rows) => rows.find((r) => r.key === "one_long");
    ck(`the changed limit: ${ol(now).value}% in force on 21 Nov with ${ol(now).pending?.value}% pending from ${ol(now).pending?.from}; on 23 Nov ${ol(later).value}% is in force, set by the account`, ol(now).value === 10 && ol(now).pending.value === 8 && ol(now).pending.from === "2026-11-23" && ol(later).value === 8 && ol(later).pending === null && ol(later).by === "you" && ol(now).by === "PM A");
    const hist = view.historyOf(book, "limit", "2026-11-21"), h8 = hist.find((h) => h.key === "one_long" && h.origin === "change"), h0 = hist.find((h) => h.key === "one_long" && h.origin === "creation");
    ck(`the history holds both rows: the default ("${h0.by}", no reason) and the change (10% → 8%, "${h8.by}", its reason whole, ${h8.state})`, h0.by === "default (PM advice: A)" && h0.reason === null && h0.from === "–" && h8.from === "10%" && h8.to === "8%" && h8.by === "set by the account" && h8.reason === "tighter into results season" && h8.state === "pending");
    const tn = view.targetsNow(book, "2026-12-15");
    ck(`the targets in force stay cash + ${tn.x}% and ${tn.vol}%, with ${view.targetsWords(tn.pending.x, tn.pending.vol)} pending for ${tn.pending.forYear}`, tn.x === 5 && tn.vol === 5 && tn.pending.x === 6 && tn.pending.vol === 5.5 && tn.pending.forYear === 2027 && tn.window.open);
    ck(`deletion: "${by("pf_delete", X, 0).body.error}" for the name in other letters; with the name typed exactly it is gone, and its address then says "${by("pf_get", X, 4).body.error}"`, by("pf_delete", X, 0).body.error === words.NOT_ITS_NAME && by("pf_delete", X, 1).status === 200 && by("pf_get", X, 4).status === 404 && by("pf_list", X, 1).body.rows.length === 4);
  }

  console.log("\n[in the database after that scenario]");
  const gone = sqlRun.id;
  ck("the deleted portfolio left no row in any table; the four others kept theirs; the agreement stays", (await count("pf_portfolios", "id = $1", [gone])) === 0 && (await count("pf_settings", "portfolio_id = $1", [gone])) === 0 && (await count("pf_notes", "portfolio_id = $1", [gone])) === 0 && (await count("pf_portfolios")) === 4 && (await count("pf_settings")) > 150 && (await count("account_consents", "account = $1", [X])) === 1 && (await count("account_consents")) === 1);
  const keep = (await one("select id from pf_portfolios where name = 'Macro'")).id;
  ck("every row of every table belongs to the account that made it, and to one of its portfolios", (await count("pf_portfolios", "account <> $1", [X])) === 0 && (await count("pf_settings s", "not exists (select 1 from pf_portfolios b where b.id = s.portfolio_id and b.account = s.account)")) === 0);
  { const m = [await refused(db, "update pf_settings set value = '99'::jsonb where portfolio_id = $1", [keep]), await refused(db, "delete from pf_settings where portfolio_id = $1", [keep]), await refused(db, "delete from pf_portfolios where id = $1", [keep])];
    ck(`the settings and their history are append-only, for whoever asks (the table's own owner here): "${m[0]}"; "${m[1]}"; "${m[2]}"`, /never changed/.test(m[0] ?? "") && /goes only with its portfolio/.test(m[1] ?? "") && /deleted only by its account/.test(m[2] ?? ""), m);
    const fixedCols = ["kind = 'RR'", "start = 'ar-ls-jp'", "base = 'JPY'", "starting_nav = 1", "target_x = 9", "target_vol = 3", "reference = 'x'", "blend = 50", "ladder_base = 'start'", "ladder = '{}'::jsonb", "house_multiple = 2", "valuation = 'x'", "started_on = '2020-01-01'", "account = 'y@example.com'"];
    const r = []; for (const c of fixedCols) r.push(await refused(db, `update pf_portfolios set ${c} where id = $1`, [keep]));
    ck(`what is fixed at creation cannot be updated (${fixedCols.length} columns tried): "${r[0]}"`, r.every((x) => /fixed at creation/.test(x ?? "")), r.filter((x) => !/fixed at creation/.test(x ?? "")));
    await db.query("select pf_note_add($1, $2, 'kept')", [X, keep]);
    const e = [await refused(db, "update pf_notes set body = 'edited' where portfolio_id = $1", [keep]), await refused(db, "delete from pf_notes where portfolio_id = $1", [keep])];
    ck(`a note is never edited and never deleted on its own: "${e[0]}"`, /never changed/.test(e[0] ?? "") && /goes only with its portfolio/.test(e[1] ?? ""), e);
    const direct = [await refused(db, "select pf_setting_set($1, $2, 'one_long', '4'::jsonb, 'a reason long enough', '2026-11-21', '2026-11-21')", [X, keep]), await refused(db, "select pf_setting_set($1, $2, 'one_long', '4'::jsonb, 'short', '2026-11-24', '2026-11-21')", [X, keep]), await refused(db, "select pf_setting_set($1, $2, 'cut1', '5'::jsonb, 'a reason long enough', '2026-11-24', '2026-11-21')", [X, keep]), await refused(db, "select pf_setting_set($1, $2, 'target_x', '6'::jsonb, 'a reason long enough', '2026-11-24', '2026-11-21')", [X, keep])];
    ck(`the functions keep their own rules whatever the API sends: never backwards ("${direct[0]}"), a reason, a fixed setting, a target`, direct[0] === words.NEVER_BACK && direct[1] === words.REASON_SHORT && direct[2] === words.FIXED_SETTING && direct[3] === words.TOGETHER, direct); }

  console.log("\n[the second wall: the policies alone]");
  { await db.query("select pf_consent_agree($1, 1)", [Y]);
    const yb = { requestId: "request-y001", name: "Y's book", kind: "AR", start: "ar-macro", base: "USD", startingNav: 10000000000, fx: null, targetX: 5, targetVol: 5, reference: "60/40 blend", blend: 60, ladderBase: "yearly", ladder: { cut1: 4, cap1: 50, cut2: 2, cap2: 30, out: 2, cooling: 20, deadline: 1 }, houseMultiple: 1, valuation: "17:00 New York", startedOn: "2026-11-21" };
    const yid = (await one("select pf_create($1, $2::jsonb, $3::jsonb) as r", [Y, JSON.stringify(yb), JSON.stringify([{ key: "target_x", value: 5, cls: "window", basis: "default (PM advice: A and B)" }, { key: "target_vol", value: 5, cls: "window", basis: "default (PM advice: A and B)" }, { key: "var", value: 1, cls: "limit", basis: "default (PM advice: B)" }])])).r.id;
    const seen = await as(db, "monitor_account", async () => {
      const none = await count("pf_portfolios");
      await db.query("select set_config('monitor.account', $1, false)", [X]); const x = await all("select distinct account from pf_portfolios"); const xs = await count("pf_settings", "account <> $1", [X]);
      const into = await refused(db, "insert into pf_notes (portfolio_id, account, body) values ($1, $2, 'planted')", [yid, Y]);
      const forged = await refused(db, "insert into pf_notes (portfolio_id, account, body) values ($1, $2, 'planted')", [yid, X]);
      await db.query("select set_config('monitor.account', $1, false)", [Y]); const y = await all("select distinct account from pf_portfolios");
      await db.query("select set_config('monitor.account', '', false)");
      return { none, x: x.map((r) => r.account), xs, into, forged, y: y.map((r) => r.account) };
    });
    ck("as the role the functions run as: with no account set, no rows; set to one account, that account's rows and no other's", seen.none === 0 && seen.x.join() === X && seen.xs === 0 && seen.y.join() === Y, seen);
    ck(`and a row cannot be written into the other account's portfolio, under either name: "${seen.into}"; "${seen.forged}"`, /row-level security/.test(seen.into ?? "") && /foreign key|row-level security/.test(seen.forged ?? ""), seen);

    console.log("\n[the targets' window, and what a January reset does to a pending pair]");
    const set = (acct, id, x, vol, day) => refused(db, "select pf_targets_set($1, $2, $3, $4, $5::date)", [acct, id, x, vol, day]);
    const fromStart = (await one("select id from pf_portfolios where name = 'Global, yen'")).id;
    ck(`outside the window: "${await set(Y, yid, 6, 5.5, "2026-11-30")}"; under "since the start": "${await set(X, fromStart, 6, 5.5, "2026-12-15")}"`, (await set(Y, yid, 6, 5.5, "2026-11-30")) === words.WINDOW_CLOSED && (await set(Y, yid, 6, 5.5, "2026-02-01")) === words.WINDOW_CLOSED && (await set(X, fromStart, 6, 5.5, "2026-12-15")) === words.FIXED_TARGETS);
    ck("inside it (1 Dec to the January reset) a pair is kept, and may be replaced until the reset", (await set(Y, yid, 6, 5.5, "2026-12-01")) === null && (await set(Y, yid, 7, 6, "2027-01-04")) === null && (await count("pf_settings", "portfolio_id = $1 and for_year = 2027", [yid])) === 4);
    const read = async (acct, id, day) => view.targetsNow((await one("select pf_get($1, $2) as r", [acct, id])).r, day);
    let t = await read(Y, yid, "2027-01-04");
    ck(`before the reset the pair is pending for 2027 (${view.targetsWords(t.pending.x, t.pending.vol)}, the later entry) and the targets in force are unchanged`, t.x === 5 && t.vol === 5 && t.pending.x === 7 && t.pending.vol === 6 && t.pending.forYear === 2027 && t.window.open);
    // the daily NAV (P-3) will record the January line; here the row is written as that job will write it
    await db.query("insert into pf_ladder_events (portfolio_id, account, d, kind) values ($1, $2, '2027-01-04', 'year reset')", [yid, Y]);
    t = await read(Y, yid, "2027-01-05");
    ck(`after a reset that is made the pair is in force (cash + ${t.x}% · ${t.vol}%, since ${t.since}), nothing is pending, and an entry on 5 Jan is refused: "${await set(Y, yid, 8, 6, "2027-01-05")}"`, t.x === 7 && t.vol === 6 && t.since === "2027-01-04" && t.pending === null && !t.window.open && (await set(Y, yid, 8, 6, "2027-01-05")) === words.WINDOW_CLOSED);
    const guarded = (await one("select id from pf_portfolios where name = 'Four'")).id;
    await set(X, guarded, 6, 5.5, "2026-12-15");
    await db.query("insert into pf_ladder_events (portfolio_id, account, d, kind) values ($1, $2, '2027-01-04', 'year reset withheld')", [guarded, X]);
    t = await read(X, guarded, "2027-01-05");
    ck("after a reset that is withheld (a losing year) or held (a cut in force) the pair lapses: the targets stay as created", t.x === 5 && t.vol === 5 && t.pending === null && t.lapsed === 2027 && t.since === null, t);
    ck("a line of the ladder is append-only too", /never changed/.test((await refused(db, "update pf_ladder_events set kind = 'year reset' where portfolio_id = $1", [guarded])) ?? ""));

    console.log("\n[deletion]");
    ck(`without the name typed exactly: "${await refused(db, "select pf_delete($1, $2, 'y''s book')", [Y, yid])}"; by the other account: "${await refused(db, "select pf_delete($1, $2, 'Y''s book')", [X, yid])}"`, (await refused(db, "select pf_delete($1, $2, 'y''s book')", [Y, yid])) === words.NOT_ITS_NAME && (await refused(db, "select pf_delete($1, $2, 'Y''s book')", [X, yid])) === words.NO_SUCH && (await count("pf_portfolios", "id = $1", [yid])) === 1);
    const before = { books: await count("pf_portfolios", "account = $1", [X]), settings: await count("pf_settings", "account = $1", [X]), notes: await count("pf_notes", "account = $1", [X]), events: await count("pf_ladder_events", "account = $1", [X]) };
    await db.query("select pf_delete($1, $2, 'Y''s book')", [Y, yid]);
    const after = { books: await count("pf_portfolios", "account = $1", [X]), settings: await count("pf_settings", "account = $1", [X]), notes: await count("pf_notes", "account = $1", [X]), events: await count("pf_ladder_events", "account = $1", [X]) };
    ck("pf_delete removes every row of that portfolio (its settings, their history, its notes, its ladder lines) and of no other", (await count("pf_portfolios", "account = $1", [Y])) === 0 && (await count("pf_settings", "account = $1", [Y])) === 0 && (await count("pf_ladder_events", "account = $1", [Y])) === 0 && JSON.stringify(before) === JSON.stringify(after) && before.books === 4, { before, after });
    ck("its account's agreement to the statement stays", (await count("account_consents", "account = $1", [Y])) === 1);
    await db.query("delete from accounts where email = $1", [X]);
    ck("an account that is deleted takes its portfolios, their rows and its agreement with it", (await count("pf_portfolios")) === 0 && (await count("pf_settings")) === 0 && (await count("pf_notes")) === 0 && (await count("pf_ladder_events")) === 0 && (await count("account_consents", "account = $1", [X])) === 0);
    const t2 = (await one("select pf_selftest() as r")).r;
    ck("pf_selftest is still ok", t2.ok === true && t2.rowsSeen === 0 && t2.rowsThroughPolicies === 0, t2); }

  // ---- the same file applied by a role that is not a superuser ----
  for (const [what, attrs, wantOwner] of [["a role that may make roles and is no superuser, as the hosted database's", "createrole", true], ["a role that may not make roles (the fallback)", "", false]]) {
    console.log(`\n[applied by ${what}]`);
    const d2 = new PGlite();
    await d2.exec(`create role deployer login ${attrs}; alter schema public owner to deployer; grant all on schema public to deployer;`);
    await d2.exec(HOSTED.replace(/alter default privileges/g, "alter default privileges for role deployer"));
    await d2.exec("set role deployer"); await d2.exec(accounts);
    let ok = true; try { await d2.exec(SQL); await d2.exec(SQL); } catch (e) { ok = e.message; }
    ck("the change applies, twice, without an error", ok === true, ok);
    await d2.exec(two);
    const t = (await d2.query("select pf_selftest() as r")).rows[0].r;
    ck(wantOwner ? `the role the policies bind owns the functions (${t.definerOwner} of ${t.functions}); pf_selftest ok` : `the functions stay with their maker (${t.definerOwner} of ${t.functions} handed over), each with its explicit account filter; pf_selftest ok`, t.ok === true && t.rls === 6 && t.openGrants === 0 && t.openFunctions === 0 && t.rowsSeen === 0 && (wantOwner ? t.definerOwner === t.functions && t.policies === 6 && t.rowsThroughPolicies === 0 : t.definerOwner === 0 && t.rowsThroughPolicies === null), t);
    await d2.exec("reset role");
    // the server's role, the only caller there is: the routes work, and the two accounts stay apart
    await d2.exec("set role service_role");
    const r2 = await scenario(sqlStore(rpcOf(d2)));
    await d2.exec("reset role");
    const a = norm(r2.out), b = norm(memRun.out), diff = a.filter((x, i) => JSON.stringify(x) !== JSON.stringify(b[i])).map((x) => x.action);
    ck(`called as the server's own role, the scenario's ${a.length} answers are the stand-in store's again`, a.length === b.length && diff.length === 0, diff.slice(0, 5));
    const denied = []; for (const role of ["anon", "authenticated", "service_role"]) { await d2.exec(`set role ${role}`); denied.push(await refused(d2, "select count(*) from pf_portfolios")); await d2.exec("reset role"); }
    ck("and no API role reads a table", denied.every((m) => /permission denied/.test(m ?? "")), denied);
    await d2.close();
  }

  await db.close();
  console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`) + "\n");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
