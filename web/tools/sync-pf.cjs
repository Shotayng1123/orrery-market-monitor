#!/usr/bin/env node
// The paper portfolio's engine is written once, for the server: supabase/functions/_shared/pf/ (pure TypeScript: no
// database, no clock, no network, no package). The page needs the same rules: the form refuses with them as it is
// filled, and the local copy's stand-in store runs on them. This copies those files to web/src/lib/pf/, unchanged
// but for one line at the top that says where each comes from. Since the limit chip's L-1 (24 Nov 2026) it copies the
// market's rules the same way, supabase/functions/_shared/rules/ to web/src/lib/rules/ (Tokyo's daily price limits:
// the server works out each row's state, and the page runs the same file for its stand-in rows).
//
//   node tools/sync-pf.cjs           write the copies
//   node tools/sync-pf.cjs --check   say which files differ, and exit with 1 if any does
//
// Edit the files under supabase/functions/_shared/, never the copies. sim/logic.test.ts fails when the two differ
// (it makes the same comparison), so a change to one side alone does not reach a publish. Not copied: switch.ts, the
// server's own switch, and rules/limitrow.ts (since L-2), which reads the server's rows for the rule.
const fs = require("fs"), path = require("path");
const PAIRS = [{ dir: "pf", serverOnly: new Set(["switch.ts"]) }, { dir: "rules", serverOnly: new Set(["limitrow.ts"]) }];
const check = process.argv.includes("--check");
let failed = false;
for (const { dir, serverOnly } of PAIRS) {
  const SRC = path.join(__dirname, "..", "..", "supabase", "functions", "_shared", dir), DST = path.join(__dirname, "..", "src", "lib", dir);
  const head = (name) => `// COPY of supabase/functions/_shared/${dir}/${name}: edit that file, then run \`node tools/sync-pf.cjs\` from web/.\n`;
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".ts") && !serverOnly.has(f)).sort();
  const differ = [];
  if (!check) fs.mkdirSync(DST, { recursive: true });
  for (const f of files) {
    const want = head(f) + fs.readFileSync(path.join(SRC, f), "utf8"), to = path.join(DST, f), have = fs.existsSync(to) ? fs.readFileSync(to, "utf8") : null;
    if (have === want) continue;
    differ.push(f);
    if (!check) fs.writeFileSync(to, want);
  }
  const extra = fs.existsSync(DST) ? fs.readdirSync(DST).filter((f) => f.endsWith(".ts") && !files.includes(f)) : [];
  for (const f of extra) { differ.push(`${f} (no longer on the server's side)`); if (!check) fs.unlinkSync(path.join(DST, f)); }
  if (differ.length) failed = true;
  if (check) console.log(differ.length ? `web/src/lib/${dir} differs from supabase/functions/_shared/${dir}: ${differ.join(", ")}` : `web/src/lib/${dir} is the copy of supabase/functions/_shared/${dir} (${files.length} file${files.length === 1 ? "" : "s"})`);
  else console.log(differ.length ? `${dir}: copied ${differ.join(", ")}` : `${dir}: nothing to copy (${files.length} file${files.length === 1 ? " is" : "s are"} the same)`);
}
if (check) process.exit(failed ? 1 : 0);
