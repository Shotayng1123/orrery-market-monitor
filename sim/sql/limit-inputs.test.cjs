// The limit chip's inputs (migration 20261124000001; slice L-2 of C/limit-chip-plan.md). Run on PGlite against
// constituent_stats as the earlier migrations make it, as far as the jobs and the routes read it: before the migration
// the routes' reads with the new columns fail as a database answers them (so the server reads the columns it has, as
// before) and the old reads serve; the migration adds the six columns, nullable and with no default, changes no row,
// and a second run changes nothing; afterwards a job's write with them is stored as written.
// From sim/sql:  npm test
const { PGlite } = require("@electric-sql/pglite");
const fs = require("fs"), path = require("path");
let pass = 0, fail = 0;
const ck = (name, cond, detail) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  ->  " + JSON.stringify(detail) : "")); } };
(async () => {
  const db = new PGlite();
  const mig = (f) => fs.readFileSync(path.join(__dirname, "..", "..", "supabase", "migrations", f), "utf8");
  // the table as far as this change reads it: the quote's own columns come from their own migration (20261119000001)
  await db.exec("create table constituent_stats (idx text not null, symbol text not null, name text not null, d date not null, close double precision not null, prev double precision, volume double precision, primary key (idx, symbol));");
  await db.exec(mig("20261119000001_intraday_quotes.sql"));
  await db.exec(`insert into constituent_stats (idx, symbol, name, d, close, prev, volume, q_price, q_prev, q_time) values
    ('NK225', '7203.T', 'Toyota Motor', '2026-11-20', 3456, 3400, 18200000, 4156, 3456, '2026-11-24T01:12:00Z'),
    ('TOPIX', '7203.T', 'Toyota Motor', '2026-11-20', 3456, 3400, 18200000, 4150, 3456, '2026-11-24T01:03:00Z'),
    ('SP500', 'NVDA', 'NVIDIA Corporation', '2026-11-23', 141.2, 140.1, 2.1e8, null, null, null);`);
  const NEW = ["q_high", "q_low", "prev_vol", "prev2_vol", "prev_qt", "lim_run"];
  const OLD_READ = "select symbol, d, close, prev, volume, q_price, q_prev, q_time from constituent_stats order by idx, symbol";
  const err = async (sql) => { try { await db.query(sql); return null; } catch (e) { return { code: e.code, message: e.message }; } };
  const before = await err(`select symbol, d, close, prev, volume, q_price, q_prev, q_time, ${NEW.join(", ")} from constituent_stats`);
  const oldRows = (await db.query(OLD_READ)).rows;
  ck(`before the migration the routes' read with the new columns is refused as a database refuses it (${before && before.code}: ${before && before.message}), so they read the columns there are, and that read serves as before (${oldRows.length} rows)`, !!before && before.code === "42703" && /column "q_high" does not exist/.test(before.message) && oldRows.length === 3, before);
  const sql = mig("20261124000001_limit_inputs.sql");
  await db.exec(sql);
  const cols = (await db.query(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = 'constituent_stats' and column_name in (${NEW.map((c) => `'${c}'`).join(", ")}) order by column_name`)).rows;
  const typeOf = Object.fromEntries(cols.map((c) => [c.column_name, c.data_type]));
  ck(`the migration adds the six columns, each nullable with no default: ${cols.map((c) => `${c.column_name} ${c.data_type}`).join(", ")}`, cols.length === 6 && cols.every((c) => c.is_nullable === "YES" && c.column_default === null) && ["q_high", "q_low", "prev_vol", "prev2_vol"].every((c) => typeOf[c] === "double precision") && typeOf.prev_qt === "timestamp with time zone" && typeOf.lim_run === "smallint", cols);
  const after = (await db.query(OLD_READ)).rows, fresh = (await db.query(`select ${NEW.join(", ")} from constituent_stats`)).rows;
  ck("no row is added, lost or changed, and every row reads null in the new columns until a job writes them (the server reads null as not known: no chip)", JSON.stringify(after) === JSON.stringify(oldRows) && fresh.length === 3 && fresh.every((r) => NEW.every((c) => r[c] === null)));
  await db.exec(sql);
  ck("run a second time it changes nothing", JSON.stringify((await db.query(OLD_READ)).rows) === JSON.stringify(oldRows) && (await db.query(`select count(*)::int n from information_schema.columns where table_name = 'constituent_stats'`)).rows[0].n === 10 + 6);
  // a job's write as the quote job makes it (an upsert of the row's keys with the new columns), and lim_run's sign
  await db.exec(`insert into constituent_stats (idx, symbol, name, d, close, q_price, q_time, q_high, q_low, volume, prev_vol, prev2_vol, prev_qt, lim_run) values
    ('NK225', '7203.T', 'Toyota Motor', '2026-11-20', 3456, 4156, '2026-11-24T01:32:00Z', 4156, 3500, 6100000, 18200000, 15000000, '2026-11-20T06:30:00Z', -2)
    on conflict (idx, symbol) do update set q_price = excluded.q_price, q_time = excluded.q_time, q_high = excluded.q_high, q_low = excluded.q_low, volume = excluded.volume, prev_vol = excluded.prev_vol, prev2_vol = excluded.prev2_vol, prev_qt = excluded.prev_qt, lim_run = excluded.lim_run;`);
  const w = (await db.query("select q_high, q_low, prev_vol, prev2_vol, prev_qt, lim_run, prev from constituent_stats where idx = 'NK225' and symbol = '7203.T'")).rows[0];
  ck(`a job's write is stored as written: the day's high and low, the two earlier volumes, the earlier last trade's time and a run of two limit-down closes (${JSON.stringify(w)}), the rest of the row kept`, w.q_high === 4156 && w.q_low === 3500 && w.prev_vol === 18200000 && w.prev2_vol === 15000000 && new Date(w.prev_qt).toISOString() === "2026-11-20T06:30:00.000Z" && w.lim_run === -2 && w.prev === 3400, w);
  const stmts = sql.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
  ck(`the migration is ${stmts.length} statements, each an "alter table constituent_stats add column if not exists" of one of the six, and nothing else`, stmts.length === 6 && stmts.every((l) => /^alter table constituent_stats add column if not exists (q_high|q_low|prev_vol|prev2_vol|prev_qt|lim_run) +(double precision|timestamptz|smallint);(\s+--.*)?$/.test(l.trim())) && NEW.every((c) => stmts.some((l) => l.includes(` ${c} `))), stmts);
  console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`) + "\n");
  process.exit(fail ? 1 : 0);
})();
