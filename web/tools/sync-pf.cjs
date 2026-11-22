#!/usr/bin/env node
// The paper portfolio's engine is written once, for the server: supabase/functions/_shared/pf/ (pure TypeScript: no
// database, no clock, no network, no package). The page needs the same rules: the form refuses with them as it is
// filled, and the local copy's stand-in store runs on them. This copies those files to web/src/lib/pf/, unchanged
// but for one line at the top that says where each comes from.
//
//   node tools/sync-pf.cjs           write the copy
//   node tools/sync-pf.cjs --check   say which files differ, and exit with 1 if any does
//
// Edit the files under supabase/functions/_shared/pf/, never the copies. sim/logic.test.ts fails when the two differ
// (it makes the same comparison), so a change to one side alone does not reach a publish. Not copied: switch.ts, the
// server's own switch.
const fs = require("fs"), path = require("path");
const SRC = path.join(__dirname, "..", "..", "supabase", "functions", "_shared", "pf"), DST = path.join(__dirname, "..", "src", "lib", "pf");
const SERVER_ONLY = new Set(["switch.ts"]);
const head = (name) => `// COPY of supabase/functions/_shared/pf/${name}: edit that file, then run \`node tools/sync-pf.cjs\` from web/.\n`;
const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".ts") && !SERVER_ONLY.has(f)).sort();
const check = process.argv.includes("--check");
let differ = [];
fs.mkdirSync(DST, { recursive: true });
for (const f of files) {
  const want = head(f) + fs.readFileSync(path.join(SRC, f), "utf8"), to = path.join(DST, f), have = fs.existsSync(to) ? fs.readFileSync(to, "utf8") : null;
  if (have === want) continue;
  differ.push(f);
  if (!check) fs.writeFileSync(to, want);
}
const extra = fs.existsSync(DST) ? fs.readdirSync(DST).filter((f) => f.endsWith(".ts") && !files.includes(f)) : [];
for (const f of extra) { differ.push(`${f} (no longer on the server's side)`); if (!check) fs.unlinkSync(path.join(DST, f)); }
if (check) { console.log(differ.length ? `web/src/lib/pf differs from supabase/functions/_shared/pf: ${differ.join(", ")}` : `web/src/lib/pf is the copy of supabase/functions/_shared/pf (${files.length} files)`); process.exit(differ.length ? 1 : 0); }
console.log(differ.length ? `copied: ${differ.join(", ")}` : `nothing to copy (${files.length} files are the same)`);
