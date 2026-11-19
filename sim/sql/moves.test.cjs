// The store and queue for the reasons of big moves (supabase/migrations/20261118000004_move_causes.sql), on PGlite
// with the migration file itself. monitor_dispatch (the request to GitHub, from an earlier migration that needs
// the vault and the network) is replaced here by a stand-in that records the request.  From sim/sql:  npm test
const { PGlite } = require("@electric-sql/pglite");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", ".."), MIG = path.join(ROOT, "supabase", "migrations");
let pass = 0, fail = 0;
const ck = (name, cond, detail) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  ->  " + JSON.stringify(detail) : "")); } };
(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table monitor_dispatches (id bigserial primary key, at timestamptz not null default now(), workflow text not null, request_id bigint);
    create table token (has boolean); insert into token values (true);
    create function monitor_dispatch(p_workflow text, p_inputs jsonb default '{}'::jsonb) returns bigint language plpgsql as $$
      begin if not (select has from token) then return null; end if; insert into monitor_dispatches (workflow, request_id) values (p_workflow, 1); return 1; end $$;`);
  const sql = fs.readFileSync(path.join(MIG, "20261118000004_move_causes.sql"), "utf8");
  await db.exec(sql); await db.exec(sql);
  ck("the change applies, and applies again without an error", true);
  const one = async (q, v = []) => (await db.query(q, v)).rows[0];
  const kick = async () => (await one("select move_causes_kick() as r")).r;
  const asked = async () => Number((await one("select count(*) as n from monitor_dispatches where workflow = 'move-causes.yml'")).n);
  const ctx = JSON.stringify({ symbol: "7203.T", name: "Toyota Motor Corp", text: "-8.2% on the day" });
  const put = (symbol, kind, d, extra = "") => db.query(`insert into move_causes (symbol, kind, d, from_d, pct, ctx${extra ? ", status, cause" : ""}) values ($1,$2,$3,$3::date - 1,-8.2,$4${extra}) on conflict (symbol, kind, d) do nothing`, [symbol, kind, d, ctx]);

  ck("with nothing queued the job is not asked for", (await kick()) === "nothing queued" && (await asked()) === 0);
  await put("7203.T", "d1", "2026-08-05");
  const r = await one("select * from move_causes where symbol = '7203.T'");
  ck("a queued move: waiting, no reason, no tries, what the job needs kept with it", r.status === "queued" && r.cause === null && r.tries === 0 && r.ctx.name === "Toyota Motor Corp" && Array.isArray(r.sources) && r.sources.length === 0 && r.done_at === null, r);
  ck("the first queued move asks GitHub for the job", (await kick()) === "asked" && (await asked()) === 1);
  await put("6758.T", "w1", "2026-08-07");
  ck("more moves within ten minutes do not ask again", (await kick()) === "asked recently" && (await asked()) === 1);
  await db.exec("update monitor_dispatches set at = at - interval '11 minutes'");
  ck("after ten minutes, with moves still waiting, it asks again", (await kick()) === "asked" && (await asked()) === 2);
  await db.exec("update monitor_dispatches set at = at - interval '11 minutes'; update token set has = false");
  ck("without the GitHub token nothing is asked, and that is said", (await kick()) === "no token" && (await asked()) === 2);
  await db.exec("update token set has = true");

  // the job's result, and the page queueing the same move again
  await db.query("update move_causes set status = 'found', cause = $1, sources = $2::jsonb, model = 'm', cost_usd = 0.12, tries = tries + 1, done_at = now() where symbol = '7203.T' and kind = 'd1' and d = '2026-08-05'", ["Toyota cut its full-year forecast with first-quarter results.", JSON.stringify([{ title: "Report", url: "https://example.com/a" }])]);
  await put("7203.T", "d1", "2026-08-05");
  const kept = await one("select status, cause, sources, tries from move_causes where symbol = '7203.T' and kind = 'd1'");
  ck("a move that already has its reason is not put back on the queue when the page sees it again", kept.status === "found" && /forecast/.test(kept.cause) && kept.sources[0].url === "https://example.com/a" && kept.tries === 1, kept);
  await put("7203.T", "w1", "2026-08-05"); await put("7203.T", "m1", "2026-08-05");
  ck("a day, a week and a month ending on the same day are three moves", Number((await one("select count(*) as n from move_causes where symbol = '7203.T' and d = '2026-08-05'")).n) === 3);
  let refused = 0;
  for (const bad of ["insert into move_causes (symbol, kind, d, from_d, pct, ctx) values ('X', 'y1', '2026-01-02', '2026-01-01', 1, '{}')", "insert into move_causes (symbol, kind, d, from_d, pct, ctx, status) values ('X', 'd1', '2026-01-02', '2026-01-01', 1, '{}', 'guessed')", "insert into move_causes (symbol, kind, d, from_d, pct) values ('X', 'd1', '2026-01-02', '2026-01-01', 1)"]) { try { await db.exec(bad); } catch { refused++; } }
  ck("an unknown kind of move, an unknown state, or a move without what the job needs is refused", refused === 3);
  // the rule on trial (19 Nov 2026): two more kinds, a new peak and a bottom
  let early = false; try { await put("NVDA", "pk", "2026-10-21"); } catch { early = true; }
  const kinds = fs.readFileSync(path.join(MIG, "20261119000003_move_kinds.sql"), "utf8");
  await db.exec(kinds); await db.exec(kinds);
  await put("NVDA", "pk", "2026-10-21"); await put("NVDA", "bt", "2026-11-17");
  let still = false; try { await db.exec("insert into move_causes (symbol, kind, d, from_d, pct, ctx) values ('X', 'y1', '2026-01-03', '2026-01-01', 1, '{}')"); } catch { still = true; }
  let early2 = false; try { await put("NVDA", "p2", "2026-01-29"); } catch { early2 = true; }
  const small = fs.readFileSync(path.join(MIG, "20261119000004_move_kinds_small.sql"), "utf8");
  await db.exec(small); await db.exec(small);
  await put("NVDA", "p2", "2026-01-29"); await put("NVDA", "b2", "2026-02-05");
  ck("the second level's kinds (a smaller peak, a smaller bottom) can be queued once its change is applied, not before", early2 && Number((await one("select count(*) as n from move_causes where symbol = 'NVDA' and kind in ('p2','b2')")).n) === 2);
  // every large company follows the second rule: the first rule's moves that were still waiting leave the queue
  await db.exec(`insert into move_causes (symbol, kind, d, from_d, pct, ctx, status, tries) values
    ('OLD', 'w1', '2026-09-01', '2026-08-25', -11.0, '{}', 'queued', 0), ('OLD', 'm1', '2026-09-02', '2026-08-10', 22.0, '{}', 'error', 1),
    ('OLD', 'd1', '2026-09-03', '2026-09-02', -6.0, '{}', 'queued', 0), ('OLD', 'd1', '2026-09-04', '2026-09-03', 12.0, '{}', 'queued', 0),
    ('OLD', 'd1', '2026-09-05', '2026-09-04', -5.5, '{}', 'found', 1), ('OLD', 'w1', '2026-09-06', '2026-09-01', 10.5, '{}', 'not_found', 1)`);
  const rule = fs.readFileSync(path.join(MIG, "20261119000005_move_queue_rule.sql"), "utf8");
  await db.exec(rule); await db.exec(rule);
  const left = (await db.query("select kind, d::text as d, status from move_causes where symbol = 'OLD' order by d")).rows.map((r) => `${r.kind} ${r.d.slice(5)} ${r.status}`);
  ck("the first rule's waiting moves are taken off the queue (a week, a month, a day under 10%, waiting or failed); a waiting day of 10% stays, and so does every answer already stored", left.join() === "d1 09-04 queued,d1 09-05 found,w1 09-06 not_found" && Number((await one("select count(*) as n from move_causes where symbol = 'NVDA' and kind in ('pk','bt','p2','b2')")).n) === 4, left);
  ck("before the change of 19 Nov a peak cannot be queued; after it (applied twice) a peak and a bottom can, the earlier kinds still can, and an unknown kind is still refused", early && still && Number((await one("select count(*) as n from move_causes where symbol = 'NVDA' and kind in ('pk','bt')")).n) === 2 && Number((await one("select count(*) as n from move_causes where kind in ('d1','w1','m1')")).n) >= 3);
  await db.exec("update move_causes set status = 'found' where status = 'queued'");
  ck("once nothing waits, nothing is asked", (await kick()) === "nothing queued");

  const rls = (await one("select relrowsecurity from pg_class where relname = 'move_causes'")).relrowsecurity;
  const acl = await one("select has_function_privilege('anon', oid, 'execute') as anon, has_function_privilege('authenticated', oid, 'execute') as auth from pg_proc where proname = 'move_causes_kick'");
  ck("the table is closed to everything but the service role, and the function cannot be called by anon or authenticated", rls === true && !acl.anon && !acl.auth, { rls, acl });
  // the code that writes the table must name columns it has
  const cols = (await db.query("select column_name from information_schema.columns where table_name = 'move_causes'")).rows.map((x) => x.column_name);
  const page = fs.readFileSync(path.join(ROOT, "supabase", "functions", "_shared", "stock.ts"), "utf8"), job = fs.readFileSync(path.join(ROOT, "jobs", "move_causes.ts"), "utf8");
  const queued = /queue\.push\(\{([^}]*)\}\)/.exec(page)[1].split(",").map((x) => x.trim().split(":")[0].trim());
  const read = /from\("move_causes"\)\.select\("([^"]+)"\)\.eq\("symbol"/.exec(page)[1].split(",");
  const stored = /\.update\(\{ status: a\.found[^}]*\}\)/.exec(job)[0].match(/(\w+):/g).map((x) => x.slice(0, -1)), taken = /from\("move_causes"\)\.select\("([^"]+)"\)/.exec(job)[1].split(",");
  const missing = [...queued, ...read, ...stored, ...taken].filter((c) => !cols.includes(c));
  ck(`the page (queues ${queued.join(", ")}; reads ${read.join(", ")}) and the job (takes ${taken.join(", ")}; stores ${stored.join(", ")}) use only columns the table has`, missing.length === 0 && queued.length === 6 && stored.length >= 6, missing);
  console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
