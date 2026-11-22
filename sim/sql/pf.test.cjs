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
const JSONB = new Set(["p_book", "p_settings", "p_value"]), CAST = { p_id: "uuid", p_today: "date", p_effective: "date", p_x: "numeric", p_vol: "numeric", p_version: "int", p_note: "int" };
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

  // ---- the file statement by statement, each committed on its own (a deploy that does not wrap a file in one
  // transaction): at no moment may a role but the server's hold EXECUTE on a pf_ function, and none at all a privilege
  // on a table or a sequence of the store. Split as a runner splits a file: at each ";" outside quotes, comments and
  // dollar quotes. Looked at after every statement. ----
  console.log("\n[the file statement by statement, each committed on its own]");
  { const statements = (sql) => { const out = []; let i = 0, start = 0; const n = sql.length;
      const bare = (t) => t.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
      while (i < n) {
        const c = sql[i];
        if (c === "-" && sql[i + 1] === "-") { const e = sql.indexOf("\n", i); i = e < 0 ? n : e + 1; continue; }
        if (c === "/" && sql[i + 1] === "*") { const e = sql.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
        if (c === "'") { i++; while (i < n && !(sql[i] === "'" && sql[i + 1] !== "'")) i += sql[i] === "'" ? 2 : 1; i++; continue; }
        if (c === '"') { const e = sql.indexOf('"', i + 1); i = e < 0 ? n : e + 1; continue; }
        if (c === "$") { const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i)); if (m) { const e = sql.indexOf(m[0], i + m[0].length); i = e < 0 ? n : e + m[0].length; continue; } }
        if (c === ";") { const t = sql.slice(start, i); if (bare(t)) out.push(t); start = i + 1; }
        i++;
      }
      if (bare(sql.slice(start))) out.push(sql.slice(start));
      return out; };
    /** What the API's roles hold on the store at this moment (a list of "role privilege object"; empty when nothing). */
    const held = async (d) => {
      const q = async (sql) => (await d.query(sql)).rows.map((r) => r.x);
      return [
        ...(await q(`select r || ' execute ' || p.oid::regprocedure::text as x from pg_proc p join pg_namespace n on n.oid = p.pronamespace, unnest(array['public','anon','authenticated']) r
          where n.nspname = 'public' and p.proname like 'pf\\_%' and has_function_privilege(r, p.oid, 'execute')`)),
        ...(await q(`select r || ' ' || pv || ' ' || c.relname as x from pg_class c join pg_namespace n on n.oid = c.relnamespace, unnest(array['public','anon','authenticated','service_role']) r, unnest(array['select','insert','update','delete','truncate','references','trigger']) pv
          where n.nspname = 'public' and c.relkind in ('r','p') and (c.relname like 'pf\\_%' or c.relname in ('consent_statements','account_consents')) and has_table_privilege(r, c.oid, pv)`)),
        ...(await q(`select r || ' ' || pv || ' ' || c.relname as x from pg_class c join pg_namespace n on n.oid = c.relnamespace, unnest(array['public','anon','authenticated','service_role']) r, unnest(array['usage','select','update']) pv
          where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'pf\\_%' and has_sequence_privilege(r, c.oid, pv)`)),
      ]; };
    const stepwise = async (sql) => { const d = new PGlite(); await d.exec(HOSTED); await d.exec(accounts); const st = statements(sql), seen = [];
      for (let k = 0; k < st.length; k++) { let err = null; try { await d.exec(st[k]); } catch (e) { err = e.message; } seen.push({ k, err, held: await held(d) }); }
      await d.close(); return { n: st.length, seen }; };
    const real = await stepwise(SQL), bad = real.seen.filter((x) => x.err || x.held.length);
    ck(`the migration is one statement (a single DO block: applied whole or not at all, in a transaction of its own or not), and after it no API role holds anything on the store, the server's role only EXECUTE`, real.n === 1 && /^\s*do \$pf_store\$/m.test(statements(SQL)[0].replace(/^(\s*--[^\n]*\n)*/, "")) && bad.length === 0, { n: real.n, bad: bad.slice(0, 2) });
    // the look itself, tried on a file of separate statements that makes a table and a function and then takes the
    // grants back: it must see the moment in between, and nothing once the grants are gone
    const ctl = await stepwise("create table pf_ctl_t (a int); revoke all on pf_ctl_t from public, anon, authenticated, service_role; create function pf_ctl_f() returns int language sql as $$ select 1 $$; revoke all on function pf_ctl_f() from public, anon, authenticated;");
    ck(`the look after each statement catches the moment a file of separate statements leaves open (${ctl.seen.map((x) => x.held.length).join(", ")} privileges held after its four statements)`, ctl.n === 4 && ctl.seen[0].held.some((x) => /^anon select pf_ctl_t$/.test(x)) && ctl.seen[1].held.length === 0 && ctl.seen[2].held.some((x) => /^anon execute pf_ctl_f\(\)$/.test(x)) && ctl.seen[3].held.length === 0, ctl.seen.map((x) => x.held.slice(0, 3)));
    const twiceStep = await (async () => { const d = new PGlite(); await d.exec(HOSTED); await d.exec(accounts); for (const st of [...statements(SQL), ...statements(SQL)]) await d.exec(st); const h = await held(d); await d.close(); return h; })();
    ck("applied statement by statement twice over, it leaves the same: nothing held", twiceStep.length === 0, twiceStep); }

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
    const writes = []; for (const role of ["anon", "authenticated", "service_role"]) writes.push(await as(db, role, () => refused(db, `insert into pf_notes (portfolio_id, n, account, body) values (gen_random_uuid(), 1, '${X}', 'n')`)));
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
    // a form pressed again with its request id after it was changed (its first answer lost): nothing new (RT-4)
    await call(X, "pf_create", { requestId: "request-0006", start: "ar-macro", name: "Macro, changed", values: { ...values("ar-macro"), blend: "70", ladder_base: "yearly" } });
    await call(X, "pf_create", { requestId: "request-0006", start: "ar-macro", name: "Macro", values: { ...values("ar-macro"), blend: "40", ladder_base: "yearly" } });
    await call(X, "pf_create", { requestId: "request-0006", start: "ar-macro", name: "Macro", values: { ...values("ar-macro"), blend: "70", ladder_base: "yearly" } });
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
    const rt4 = [11, 12, 13].map((k) => by("pf_create", X, k)), macroId = macro.id;
    ck(`a known request id with a changed form makes nothing and names what it made: "${rt4[0].body.error}"; the blend changed: the same; the same form again: its book (RT-4)`, rt4[0].status === 400 && rt4[0].body.made?.name === "Macro" && rt4[0].body.made?.id === macroId && rt4[0].body.error === words.madeBefore("Macro") && rt4[1].status === 400 && rt4[1].body.made?.id === macroId && rt4[2].status === 200 && rt4[2].body.id === macroId, rt4.map(s));
    ck(`the Reference a book keeps is the one it has (EN-5): the macro book on a 70/30 blend keeps "${macro.reference}", the global book on yen "${yen.reference}"`, macro.reference === "70/30 blend" && yen.reference === "MSCI ACWI", { macro: macro.reference, yen: yen.reference });
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
      const into = await refused(db, "insert into pf_notes (portfolio_id, n, account, body) values ($1, 99, $2, 'planted')", [yid, Y]);
      const forged = await refused(db, "insert into pf_notes (portfolio_id, n, account, body) values ($1, 99, $2, 'planted')", [yid, X]);
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
    await db.query("insert into pf_ladder_events (portfolio_id, n, account, d, kind) values ($1, 1, $2, '2027-01-04', 'year reset')", [yid, Y]);
    t = await read(Y, yid, "2027-01-05");
    ck(`after a reset that is made the pair is in force (cash + ${t.x}% · ${t.vol}%, since ${t.since}), nothing is pending, and an entry on 5 Jan is refused: "${await set(Y, yid, 8, 6, "2027-01-05")}"`, t.x === 7 && t.vol === 6 && t.since === "2027-01-04" && t.pending === null && !t.window.open && (await set(Y, yid, 8, 6, "2027-01-05")) === words.WINDOW_CLOSED);
    const guarded = (await one("select id from pf_portfolios where name = 'Four'")).id;
    await set(X, guarded, 6, 5.5, "2026-12-15");
    await db.query("insert into pf_ladder_events (portfolio_id, n, account, d, kind) values ($1, 1, $2, '2027-01-04', 'year reset withheld')", [guarded, X]);
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

  // ---- what an account is handed, what a book may hold, the walls' own look (the second review of P-1) ----
  { const d = new PGlite(); await d.exec(HOSTED); await d.exec(accounts); await d.exec(SQL); await d.exec(two);
    const q1 = async (q, v = []) => (await d.query(q, v)).rows[0], rf = (q, v = []) => refused(d, q, v);
    for (const a of [X, Y]) await d.query("select pf_consent_agree($1, 1)", [a]);
    const mk = async (a, req, name, startedOn = "2026-11-21", extra = {}) => (await q1("select pf_create($1, $2::jsonb, $3::jsonb) as r", [a, JSON.stringify({ requestId: req, name, kind: "AR", start: "ar-macro", base: "USD", startingNav: 10000000000, fx: null, targetX: 5, targetVol: 5, reference: "60/40 blend", blend: 60, ladderBase: "yearly", ladder: { cut1: 4, cap1: 50, cut2: 2, cap2: 30, out: 2, cooling: 20, deadline: 1 }, houseMultiple: 1, valuation: "17:00 New York", startedOn, ...extra }),
      JSON.stringify([{ key: "target_x", value: 5, cls: "window", basis: "default" }, { key: "target_vol", value: 5, cls: "window", basis: "default" }, { key: "var", value: 1, cls: "limit", basis: "default" }, { key: "one_long", value: 5, cls: "limit", basis: "default" }])])).r.id;
    const ids = async (a, id) => { const b = (await q1("select pf_get($1, $2) as r", [a, id])).r; return { notes: b.notes.map((x) => x.id).sort((p, q) => p - q), settings: b.settings.map((x) => x.id) }; };

    console.log("\n[what an account is handed counts no other account's rows (SQ-1, RT-6)]");
    const bx = await mk(X, "req-x-000001", "X's book");
    await d.query("select pf_note_add($1, $2, 'first')", [X, bx]);
    const before = await ids(X, bx);
    const by = await mk(Y, "req-y-000001", "Y's book");
    for (let k = 0; k < 3; k++) await d.query("select pf_note_add($1, $2, 'elsewhere')", [Y, by]);
    await d.query("select pf_rename($1, $2, 'Y renamed', '2026-11-21')", [Y, by]);
    await mk(Y, "req-y-000002", "Y's second");
    await d.query("select pf_note_add($1, $2, 'second')", [X, bx]); await d.query("select pf_rename($1, $2, 'X renamed', '2026-11-21')", [X, bx]);
    const after = await ids(X, bx);
    ck(`a note and a setting's row are numbered inside their own book: X's notes ${JSON.stringify(after.notes)} and its rows 1 to ${after.settings.length}, whatever Y wrote in between (3 notes, a renaming, a book)`, JSON.stringify(before.notes) === "[1]" && JSON.stringify(after.notes) === "[1,2]" && after.settings.join() === Array.from({ length: after.settings.length }, (_, i) => i + 1).join() && after.settings.length === before.settings.length + 1, { before, after });
    ck("and a note is removed by its number in its book: X's note 2 goes, Y's notes 1 to 3 stay", (await rf("select pf_note_remove($1, $2, 2)", [X, bx])) === null && (await q1("select pf_get($1, $2) as r", [Y, by])).r.notes.every((x) => x.body === "elsewhere") && (await rf("select pf_note_remove($1, $2, 3)", [X, bx])) === words.NO_NOTE);

    console.log("\n[no counter to grant, read or reset (SQ-2)]");
    const seqs = Number((await q1("select count(*) as n from pg_class c join pg_namespace n on n.oid = c.relnamespace left join pg_depend dp on dp.objid = c.oid and dp.deptype in ('a','i') left join pg_class o on o.oid = dp.refobjid where n.nspname = 'public' and c.relkind = 'S' and (c.relname like 'pf\\_%' or o.relname like 'pf\\_%' or o.relname in ('consent_statements','account_consents'))")).n);
    const t0 = (await q1("select pf_selftest() as r")).r;
    ck(`no table of the store has a sequence (${seqs}); pf_selftest counts ${t0.sequenceGrants} privileges on one`, seqs === 0 && t0.sequenceGrants === 0 && t0.ok === true, t0);

    console.log("\n[pf_selftest: its 'ok' leaves nothing out (SQ-3, PV-5)]");
    const tried = [];
    for (const [grant, take] of [["grant select on pf_portfolios to service_role", "revoke select on pf_portfolios from service_role"], ["grant all on pf_notes to service_role", "revoke all on pf_notes from service_role"], ["grant truncate on pf_notes to anon", "revoke truncate on pf_notes from anon"], ["grant references on pf_settings to authenticated", "revoke references on pf_settings from authenticated"], ["grant execute on function pf_get(text, uuid) to anon", "revoke execute on function pf_get(text, uuid) from anon"]]) {
      await d.exec(grant); const t = (await q1("select pf_selftest() as r")).r; await d.exec(take); const back = (await q1("select pf_selftest() as r")).r;
      tried.push({ grant, ok: t.ok, svc: t.serviceRoleGrants, open: t.openGrants, fns: t.openFunctions, back: back.ok });
    }
    ck(`a privilege handed back to the server's own role, or a TRUNCATE, REFERENCES or EXECUTE to an API role, makes pf_selftest say not ok; taken away again, ok (${tried.map((x) => `${x.grant.split(" on ")[0]}: ${x.ok}`).join("; ")})`, tried.every((x) => x.ok === false && x.back === true) && tried[0].svc === 1 && tried[1].svc === 7, tried);

    console.log("\n[what a book may hold: every row kept, the next one refused in words (SQ-4, RT-7)]");
    await d.exec("begin");
    for (let k = 0; k < 498; k++) await d.query("select pf_note_add($1, $2, $3)", [X, bx, "n".repeat(2000)]);
    await d.exec("commit");
    const full = await rf("select pf_note_add($1, $2, 'one more')", [X, bx]), nn = Number((await q1("select count(*) as n from pf_notes where portfolio_id = $1", [bx])).n);
    const size = JSON.stringify((await q1("select pf_get($1, $2) as r", [X, bx])).r).length;
    ck(`500 notes (a removed one counts), then: "${full}"; none dropped (${nn} lines); the book's whole answer at its most notes is ${(size / 1e6).toFixed(2)} million characters`, full === words.NOTES_FULL && nn === 500 && words.NOTES_MAX === 500 && size < 1.2e6, { full, nn, size });
    await d.exec("begin");
    for (let k = 0; k < 500; k++) await d.query("select pf_setting_set($1, $2, 'one_long', $3::jsonb, 'a reason that is long enough', '2026-11-24', '2026-11-21')", [X, bx, String(3 + (k % 20))]);
    await d.exec("commit");
    const ch = await rf("select pf_setting_set($1, $2, 'one_long', '9'::jsonb, 'a reason that is long enough', '2026-11-24', '2026-11-21')", [X, bx]), nc = Number((await q1("select count(*) as n from pf_settings where portfolio_id = $1 and origin = 'change' and key = 'one_long'", [bx])).n);
    ck(`500 changes of the limits and assumptions, then: "${ch}"; all 500 kept`, ch === words.CHANGES_FULL && nc === 500 && words.CHANGES_MAX === 500, { ch, nc });
    for (let k = 1; k < 50; k++) await d.query("select pf_rename($1, $2, $3, '2026-11-21')", [X, bx, `X renamed ${k}`]);
    const rn = await rf("select pf_rename($1, $2, 'one name too many', '2026-11-21')", [X, bx]), nameNow = (await q1("select name from pf_portfolios where id = $1", [bx])).name;
    ck(`50 renamings, then: "${rn}"; the book keeps "${nameNow}"`, rn === words.RENAMES_FULL && nameNow === "X renamed 49" && words.RENAMES_MAX === 50, { rn, nameNow });
    for (let k = 0; k < 20; k++) await d.query("select pf_targets_set($1, $2, 6, $3, '2026-12-15')", [X, bx, 5 + (k % 3) * 0.5]);
    const tr = await rf("select pf_targets_set($1, $2, 6, 5, '2026-12-15')", [X, bx]), nt = Number((await q1("select count(*) as n from pf_settings where portfolio_id = $1 and for_year = 2027", [bx])).n);
    ck(`20 entries of next year's targets, then: "${tr}"; all 40 rows kept`, tr === words.resetsFull(2027) && nt === 40 && words.RESETS_MAX === 20, { tr, nt });
    ck("the other account's book is untouched by the first's full history", (await rf("select pf_note_add($1, $2, 'still room')", [Y, by])) === null);

    console.log("\n[the targets' window in a book's first January (EN-10)]");
    const jan = await mk(X, "req-x-000002", "Made in January", "2027-01-12");
    ck(`a book started on 12 Jan 2027 has no January reset that year: an entry on 15 Jan is refused ("${await rf("select pf_targets_set($1, $2, 6, 5, '2027-01-15')", [X, jan])}"); in December the window opens for 2028`, (await rf("select pf_targets_set($1, $2, 6, 5, '2027-01-15')", [X, jan])) === words.WINDOW_CLOSED && (await q1("select pf_targets_set($1, $2, 6, 5, '2027-12-01') as r", [X, jan])).r.forYear === 2028);
    await d.close(); }

  await db.close();
  console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`) + "\n");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
