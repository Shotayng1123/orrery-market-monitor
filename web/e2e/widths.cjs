#!/usr/bin/env node
// The widths the browser checks measured, as one short block for a job's log (slice 10, 23 Nov 2026).
//
// Why. GitHub runs every suite in both letter placements (deploy-web.yml, e2e/placement.cjs), and a leg that passes
// there is meant to draw what the engineer's machine draws in the same placement. Whether it does shows in the widths
// the suites measure, which they write to e2e/.out/<suite>.log; GitHub keeps that folder only when a job fails (as an
// artifact). So each of deploy-web's four browser jobs runs this after its run, passed or failed, and the widths stand
// in the job's own log; the same command over a run on the engineer's machine prints the same block, to be set beside
// it line by line (README.md, "Tests").
//
// What it prints, from the record e2e/run.cjs keeps of its last run (e2e/.out/run.json): for each part of the run that
// held one of the suites below, a first line naming the job (GitHub's job, or this machine), its letter placement, the
// part and what those suites did; then every check line of theirs that carries a figure in px, suite by suite in the
// order below and each in its own order, as the suite wrote it, from the try that decided the suite (the second when
// the first failed). At most 80 lines a part. The suites run on stand-in data and print no account, address or key;
// should a line carry an address or a token all the same, it is masked here. It exits with 0 whatever it finds: it
// prints, it checks nothing.
//
// Use (from web/): node e2e/widths.cjs [the e2e/.out folder of another copy]
const fs = require("fs"), path = require("path");

const WATCHED = ["portfolio", "letter-placement", "header"];   // part 1: portfolio; part 2: letter-placement, header
const MAX = 80;                                                // lines a part, its first line among them
const PX = /\d(?:\s|-)?px\b/;
const mask = (s) => s
  .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[an address]")
  .replace(/\beyJ[\w-]{6,}(?:\.[\w-]+)*/g, "[a token]")
  .replace(/[A-Za-z0-9_+/=-]{40,}/g, "[a long string]");
const cut = (s) => (s.length > 600 ? `${s.slice(0, 599)}…` : s);

// run: run.json as e2e/run.cjs writes it; read(file): that log's text in the same folder, or null; job: GitHub's job id
function blocks(run, read, job) {
  if (!run || !Array.isArray(run.suites)) return ["[widths] no run of e2e/run.cjs is recorded here (e2e/.out/run.json): nothing to print"];
  const who = job ? `${String(job).replace(/[^\w.-]/g, "").slice(0, 60)} (GitHub)` : "this machine";
  const switches = Array.isArray(run.switches) && run.switches.length ? ` (${run.switches.join(" ")})` : " (the browser's own)";
  const also = Array.isArray(run.preloads) && run.preloads.length ? `, also loaded: ${run.preloads.join(", ")}` : "";
  const out = [];
  for (const part of [1, 2]) {
    const names = WATCHED.filter((n) => run.suites.some((s) => s && s.name === n && s.part === part));
    if (!names.length) continue;
    const done = (n) => (run.done && run.done[n]) || null;
    const said = names.map((n) => { const d = done(n); return d ? `${n} ${d.ok ? "✓" : "✗"} ${d.checks} check${d.checks === 1 ? "" : "s"}${d.tries > 1 ? ", second try" : ""}` : `${n} not finished`; });
    const lines = [];
    for (const n of names) {
      const d = done(n), text = d ? read(d.log) : null;
      if (text === null) { lines.push(`${n} | no finished try in this run${d ? ` (${d.log} is missing)` : ""}`); continue; }
      for (const l of text.split("\n")) { const t = l.trim(); if (/^[✓✗]/.test(t) && PX.test(t)) lines.push(`${n} | ${cut(mask(t))}`); }
    }
    out.push(mask(`[widths] ${who} · E2E_PLACEMENT=${run.placement}${switches}${also} · part ${part}: ${said.join(", ")}`));
    out.push(...(lines.length <= MAX - 1 ? lines : [...lines.slice(0, MAX - 2), `… ${lines.length - (MAX - 2)} more lines with px figures in e2e/.out (${names.map((n) => (done(n) || {}).log).filter(Boolean).join(", ")})`]));
  }
  return out.length ? out : [`[widths] ${who}: this run held none of ${WATCHED.join(", ")}`];
}

if (require.main === module) {
  try {
    const dir = path.resolve(process.argv[2] || path.join(__dirname, ".out"));
    let run = null;
    try { run = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8")); } catch { /* none recorded */ }
    const read = (f) => { try { return fs.readFileSync(path.join(dir, path.basename(String(f))), "utf8"); } catch { return null; } };
    console.log(blocks(run, read, process.env.GITHUB_JOB).join("\n"));
  } catch (e) { console.log(`[widths] the widths could not be printed: ${e && e.message}`); }
  process.exit(0);
}
module.exports = { blocks, WATCHED, MAX };
