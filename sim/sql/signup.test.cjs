// The rules for a new account's emailed code that live in the database: email_code_issue and email_code_check
// (supabase/migrations/20261118000003_signup_by_email.sql). Run on PGlite, a Postgres that runs inside Node, with
// the migration file itself; time is moved by editing the rows' timestamps. From sim/sql:  npm ci && npm test
// What this cannot show is two requests at the very same instant (PGlite has one connection); on 18 Nov 2026 that
// was checked by hand on PostgreSQL 16: of 60 simultaneous requests from one network address exactly 10 were
// sent, of 60 simultaneous wrong codes exactly 5 were counted, of 30 simultaneous right codes exactly 1 passed.
const { PGlite } = require("@electric-sql/pglite");
const fs = require("fs"), path = require("path");
const MIG = path.join(__dirname, "..", "..", "supabase", "migrations");
let pass = 0, fail = 0;
const ck = (name, cond, detail) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  ->  " + JSON.stringify(detail) : "")); } };
(async () => {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(fs.readFileSync(path.join(MIG, "20261116000001_accounts.sql"), "utf8"));
  const sql = fs.readFileSync(path.join(MIG, "20261118000003_signup_by_email.sql"), "utf8");
  await db.exec(sql);
  await db.exec(sql);   // a second run must change nothing and fail nowhere
  ck("the change applies, and applies again without an error", true);
  const issue = async (email, hash, ip = "1.1.1.1", lim = [15, 60, 5, 10, 200]) => (await db.query("select * from email_code_issue($1,$2,$3,$4,$5,$6,$7,$8)", [email, hash, ip, ...lim])).rows[0];
  const check = async (email, hash, max = 5) => (await db.query("select * from email_code_check($1,$2,$3)", [email, hash, max])).rows[0];
  const row = async (email) => (await db.query("select * from email_codes where email = $1", [email])).rows[0];
  const age = async (email, col, secs) => db.query(`update email_codes set ${col} = ${col} - make_interval(secs => $2) where email = $1`, [email, secs]);

  let r = await issue("a@example.com", "h1");
  ck("first code for an address: sent", r.status === "ok" && r.wait_sec === 0, r);
  let a = await row("a@example.com");
  ck("the row holds the hash, 15 minutes of validity, no tries, one sent", a.code_hash === "h1" && a.tries === 0 && a.sent === 1 && Math.abs((new Date(a.expires_at) - new Date(a.last_sent)) / 60000 - 15) < 0.01, a);
  r = await issue("a@example.com", "h2");
  ck("a second within the minute: refused, with the seconds to wait", r.status === "gap" && r.wait_sec >= 58 && r.wait_sec <= 60, r);
  ck("the refused request left the first code in place", (await row("a@example.com")).code_hash === "h1");
  await age("a@example.com", "last_sent", 61);
  r = await issue("a@example.com", "h2");
  a = await row("a@example.com");
  ck("after the minute: a new code replaces the old one, the count is 2, tries start again", r.status === "ok" && a.code_hash === "h2" && a.sent === 2 && a.tries === 0, [r, a]);
  for (let i = 3; i <= 5; i++) { await age("a@example.com", "last_sent", 61); r = await issue("a@example.com", "h" + i); }
  ck("five codes to one address within the hour are sent", r.status === "ok" && (await row("a@example.com")).sent === 5, r);
  await age("a@example.com", "last_sent", 61);
  r = await issue("a@example.com", "h6");
  ck("the sixth is refused until the hour is over, with the wait", r.status === "email_hour" && r.wait_sec > 3000 && r.wait_sec <= 3600, r);
  await age("a@example.com", "window_start", 3601); await age("a@example.com", "last_sent", 3601);
  r = await issue("a@example.com", "h6");
  a = await row("a@example.com");
  ck("once the hour has passed the count starts again at 1", r.status === "ok" && a.sent === 1, [r, a]);

  // one try at a time
  r = await check("a@example.com", "nope");
  ck("a wrong code: counted, four tries left", r.status === "wrong" && r.tries_left === 4 && (await row("a@example.com")).tries === 1, r);
  for (let i = 0; i < 3; i++) r = await check("a@example.com", "nope");
  ck("the fourth wrong code leaves one try", r.status === "wrong" && r.tries_left === 1, r);
  r = await check("a@example.com", "nope");
  ck("the fifth wrong code leaves none", r.status === "wrong" && r.tries_left === 0, r);
  r = await check("a@example.com", "h6");
  ck("after five wrong tries even the right code is refused", r.status === "spent", r);
  ck("an address with no code waiting", (await check("nobody@example.com", "x")).status === "none");

  await issue("b@example.com", "hb", "2.2.2.2");
  await db.query("select email_code_void('b@example.com')");
  ck("a code that could not be sent is void at once", (await check("b@example.com", "hb")).status === "expired");
  await age("b@example.com", "last_sent", 61);
  await issue("b@example.com", "hb2", "2.2.2.2");
  await age("b@example.com", "expires_at", 15 * 60 + 1);
  ck("a code older than 15 minutes has expired", (await check("b@example.com", "hb2")).status === "expired");
  await age("b@example.com", "last_sent", 61);
  await issue("b@example.com", "hb3", "2.2.2.2");
  r = await check("b@example.com", "hb3");
  ck("the right code passes and is used up: a second use finds nothing", r.status === "ok" && (await check("b@example.com", "hb3")).status === "none" && !(await row("b@example.com")), r);

  // one network address, many email addresses
  await db.exec("delete from email_codes");
  for (let i = 0; i < 10; i++) r = await issue(`p${i}@example.com`, "h", "9.9.9.9");
  ck("ten different addresses from one network address within the hour are sent", r.status === "ok");
  r = await issue("p10@example.com", "h", "9.9.9.9");
  ck("the eleventh is refused", r.status === "ip_hour" && !(await row("p10@example.com")), r);
  ck("another network address is not affected", (await issue("p10@example.com", "h", "8.8.8.8")).status === "ok");
  await age("p3@example.com", "last_sent", 61);
  ck("a new code for an address already counted is still allowed", (await issue("p3@example.com", "h2", "9.9.9.9")).status === "ok");
  await db.query("update email_codes set last_sent = last_sent - interval '61 minutes' where ip = '9.9.9.9'");
  ck("after the hour the network address may ask again", (await issue("p11@example.com", "h", "9.9.9.9")).status === "ok");

  // everyone together, in a day (limit set to 5 for the check)
  await db.exec("delete from email_codes");
  const lim = [15, 60, 5, 10, 5];
  for (let i = 0; i < 5; i++) r = await issue(`d${i}@example.com`, "h", `10.0.0.${i}`, lim);
  ck("up to the daily total: sent", r.status === "ok");
  ck("past the daily total: refused, whoever asks", (await issue("d5@example.com", "h", "10.0.0.99", lim)).status === "day");
  await age("d0@example.com", "last_sent", 61);
  ck("an address already in today's total can still get a new code", (await issue("d0@example.com", "h2", "10.0.0.0", lim)).status === "ok");
  await db.query("update email_codes set last_sent = last_sent - interval '3 days', window_start = window_start - interval '3 days' where email <> 'd0@example.com'");
  r = await issue("d6@example.com", "h", "10.0.0.6", lim);
  const left = (await db.query("select email from email_codes order by email")).rows.map((x) => x.email);
  ck("rows older than two days are cleared when a code is sent", r.status === "ok" && left.join() === "d0@example.com,d6@example.com", left);

  const col = (await db.query("select column_name from information_schema.columns where table_name = 'accounts' and column_name = 'verified_at'")).rows.length;
  ck("accounts has the verified_at column", col === 1);
  const rls = (await db.query("select relrowsecurity from pg_class where relname = 'email_codes'")).rows[0].relrowsecurity;
  ck("email_codes is closed to everything but the service role (row level security on, no policies)", rls === true);
  const acl = (await db.query("select proname, has_function_privilege('anon', oid, 'execute') as anon, has_function_privilege('authenticated', oid, 'execute') as auth from pg_proc where proname like 'email_code_%' order by 1")).rows;
  ck("the three functions cannot be called by anon or authenticated", acl.length === 3 && acl.every((x) => !x.anon && !x.auth), acl);
  console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
