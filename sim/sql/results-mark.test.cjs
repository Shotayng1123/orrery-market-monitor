// A stored results mark of unknown origin becomes "not said" (migration 20261121000002; the checks of round 3b: RM-1,
// H-2). Run on PGlite against a table with the columns the migration touches: a stored false becomes null, a true and
// a null stay, no date and no other column changes, and a second run changes nothing.
// From sim/sql:  npm test
const { PGlite } = require("@electric-sql/pglite");
const fs = require("fs"), path = require("path");
let pass = 0, fail = 0;
const ck = (name, cond, detail) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  ->  " + JSON.stringify(detail) : "")); } };
(async () => {
  const db = new PGlite();
  const mig = (f) => fs.readFileSync(path.join(__dirname, "..", "..", "supabase", "migrations", f), "utf8");
  // the table as the migrations make it, as far as this change reads it: the column itself comes from its own migration
  await db.exec("create table constituent_stats (idx text not null, symbol text not null, name text, close double precision, earnings_at timestamptz, primary key (idx, symbol));");
  await db.exec(mig("20261115000004_watchlist_earnings.sql").split("\n").filter((l) => /^\s*alter table constituent_stats add column if not exists earnings_est\b/i.test(l)).join("\n"));
  const col = (await db.query("select data_type, is_nullable from information_schema.columns where table_name = 'constituent_stats' and column_name = 'earnings_est'")).rows[0];
  ck("the column is the one the earlier migration adds: a boolean that may be null", col && col.data_type === "boolean" && col.is_nullable === "YES", col);
  await db.exec(`insert into constituent_stats (idx, symbol, name, close, earnings_at, earnings_est) values
    ('SP500', 'AAPL', 'Apple Inc.', 229.5, '2027-01-28T21:00:00Z', false),
    ('SP500', 'NVDA', 'NVIDIA Corporation', 141.2, '2027-02-24T21:00:00Z', true),
    ('SP500', 'AVGO', 'Broadcom Inc.', 171.0, '2026-12-10T21:00:00Z', null),
    ('NDX', 'AAPL', 'Apple Inc.', 229.5, '2027-01-28T21:00:00Z', false),
    ('NK225', '7203.T', 'Toyota Motor', 2998, '2027-02-04T06:30:00Z', false),
    ('SP500', 'XOM', 'Exxon Mobil', 118.2, null, null);`);
  const before = (await db.query("select idx, symbol, name, close, earnings_at from constituent_stats order by idx, symbol")).rows;
  const sql = mig("20261121000002_results_mark_as_given.sql");
  await db.exec(sql);
  const rows = (await db.query("select idx, symbol, earnings_est from constituent_stats order by idx, symbol")).rows, mark = (idx, sym) => rows.find((r) => r.idx === idx && r.symbol === sym)?.earnings_est;
  ck("a stored false, whose origin cannot be told, becomes \"not said\" (null), in every list that holds the name", mark("SP500", "AAPL") === null && mark("NDX", "AAPL") === null && mark("NK225", "7203.T") === null, rows);
  ck("a stored true, which only Yahoo's own flag ever wrote, stays; a null stays", mark("SP500", "NVDA") === true && mark("SP500", "AVGO") === null && mark("SP500", "XOM") === null && rows.filter((r) => r.earnings_est === false).length === 0, rows);
  const after = (await db.query("select idx, symbol, name, close, earnings_at from constituent_stats order by idx, symbol")).rows;
  ck("no row is added or lost, and no date or other column changes", JSON.stringify(after) === JSON.stringify(before) && after.length === 6);
  await db.exec(sql);
  ck("run a second time it changes nothing", JSON.stringify((await db.query("select idx, symbol, earnings_est from constituent_stats order by idx, symbol")).rows) === JSON.stringify(rows));
  // the next quote run writes Yahoo's own flag again: a false stored after the migration is kept as written
  await db.exec("update constituent_stats set earnings_est = false where idx = 'SP500' and symbol = 'AAPL'");
  ck("a false written after it (the next quote run, by the new rule) is stored as written", (await db.query("select earnings_est from constituent_stats where idx = 'SP500' and symbol = 'AAPL'")).rows[0].earnings_est === false);
  ck("the migration is one statement on that one column: an update of earnings_est where it is false, and nothing else", /^\s*update constituent_stats set earnings_est = null where earnings_est is false;\s*$/m.test(sql) && sql.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).length === 1);
  console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`) + "\n");
  process.exit(fail ? 1 : 0);
})();
