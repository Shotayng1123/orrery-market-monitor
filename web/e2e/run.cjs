#!/usr/bin/env node
// The browser checks of the web app, in one command (Shota, 18 Nov 2026). From web/:
//
//   node e2e/run.cjs                          every suite
//   node e2e/run.cjs offline notifications    only these (names as in SUITES below)
//   node e2e/run.cjs --serial                 one suite at a time (default: up to three at once, two of the dev
//                                             servers' suites and one of the built site's; part 1 has none of those)
//   node e2e/run.cjs --part=1                 the first of the two halves GitHub runs as jobs of their own
//   node e2e/run.cjs --part=2                 (deploy-web.yml), and the second: every suite not in PART_ONE below
//   E2E_PLACEMENT=installed node e2e/run.cjs  the same with letters placed as on the engineer's machine (fractional
//                                             widths): e2e/placement.cjs, which this runner loads into every suite;
//                                             E2E_PLACEMENT=github, or none, leaves the browser's own placement
//
// GitHub runs each part in both letter placements, four jobs that a publish needs all of (deploy-web.yml, since slice
// 8 of 23 Nov 2026): a slice is checked both ways there, and the engineer's whole run as installed is no longer
// needed for it. README.md ("Tests") says what each of GitHub's jobs draws in and how each is drawn again here.
//
// The runner starts the servers the chosen suites need, runs the suites, tries a failed one once more, prints
// one line per suite (with the failed lines of a first try that the second try passed) and exits with 1 if any
// failed twice. Nothing here needs the real API or a sign-in:
//   mock     5179  dev server with the in-page mock feed, no sign-in
//   standin  5181  dev server, no sign-in; API calls are answered by the suite (e2e/harness.cjs)
//   gate     5183  dev server with the real sign-in screen; API calls answered by the suite
//   built    5187  the site as published (a build in e2e/.dist), for what only a built site has: the service
//                  worker, version.json. Suites that rewrite its files run one after another.
// A dev server already answering on its port is used as it is. Logs and screenshots go to e2e/.out (git-ignored),
// with e2e/.out/run.json, this run's record (its placement and part, each suite's part and the try that decided it),
// from which e2e/widths.cjs prints the widths the suites measured (each of GitHub's browser jobs does after its run).
const { spawn, spawnSync } = require("child_process"), fs = require("fs"), http = require("http"), path = require("path");
// the letter placement: read and held to "installed", "github" or none here, before any server starts, and loaded
// into every suite below (a misspelt E2E_PLACEMENT stops the run at once)
const PLACEMENT = path.join(__dirname, "placement.cjs");
require(PLACEMENT);
const placed = globalThis[Symbol.for("orrery.e2e.placement")];
const WEB = path.join(__dirname, ".."), OUT = path.join(__dirname, ".out"), DIST = path.join(__dirname, ".dist"), VITE = path.join(WEB, "node_modules", "vite", "bin", "vite.js");
const BASE = "/orrery-market-monitor/";
const SERVERS = {
  mock: { port: 5179, env: { VITE_DEV_MOCK: "1", VITE_DEV_BYPASS: "1" } },
  standin: { port: 5181, env: { VITE_DEV_BYPASS: "1", VITE_API_URL: "http://localhost:5181/fakeapi" } },
  gate: { port: 5183, env: { VITE_API_URL: "http://localhost:5183/fakeapi" } },
  built: { port: 5187, env: { VITE_API_URL: "http://localhost:5187/fakeapi" } },
};
const SUITES = [
  { name: "research", needs: ["standin"] },
  { name: "dropdowns", needs: ["mock", "standin"] },
  { name: "classic-phone", needs: ["standin"] },
  { name: "calendar-default", needs: ["standin"] },
  { name: "phone-market", needs: ["mock"] },
  { name: "phone-news-research", needs: ["standin"] },
  { name: "phone-equities", needs: ["mock"] },
  { name: "phone-rates-watchlist-stock", needs: ["mock", "standin"] },
  { name: "stock-page", needs: ["mock", "standin"] },
  { name: "stock-news-links", needs: ["mock", "standin"] },
  { name: "stock-moves-periods", needs: ["mock"] },
  { name: "phone-default", needs: ["mock", "gate"] },
  { name: "accounts", needs: ["gate"] },
  { name: "install-hint", needs: ["mock"] },
  { name: "tab-guard", needs: ["mock"] },
  { name: "welcome-mail", needs: ["mock"] },
  { name: "stale-feed", needs: ["standin"] },
  { name: "opening", needs: ["mock", "standin"] },
  { name: "chart-pointer", needs: ["mock"] },
  { name: "units-labels", needs: ["mock", "standin"] },
  { name: "one-format", needs: ["mock", "standin"] },
  { name: "layout-guard", needs: ["mock"] },
  { name: "layout-guard-instruments", needs: ["mock"] },
  { name: "instrument-pages", needs: ["mock", "standin"] },
  { name: "nothing-cut", needs: ["mock", "standin"] },
  { name: "update-bar", needs: ["mock", "built"] },
  { name: "offline", needs: ["mock", "built"] },
  { name: "notifications", needs: ["mock", "built"] },
  { name: "local-copy", needs: ["mock", "built"] },
  { name: "sigma-moves", needs: ["mock", "standin"] },
  { name: "page-top", needs: ["mock", "standin"] },
  { name: "results-dates", needs: ["mock", "standin"] },
  { name: "opens", needs: ["mock", "standin"] },
  { name: "layout-guard-closed", needs: ["mock"] },
  { name: "morning", needs: ["mock", "standin"] },
  { name: "phone-first", needs: ["mock", "standin"] },
  { name: "shut-reasons", needs: ["mock", "standin"] },
  { name: "nav-hold", needs: ["mock", "standin"] },
  { name: "header", needs: ["mock"] },
  { name: "header-sizes", needs: ["mock"] },
  { name: "header-wide", needs: ["mock"] },
  { name: "portfolio", needs: ["mock", "standin"] },
  { name: "phone-portfolio", needs: ["mock"] },
  { name: "layout-guard-portfolio", needs: ["mock"] },
  { name: "portfolio-accounts", needs: ["mock", "gate"] },
  { name: "source-lines", needs: ["mock"] },
  { name: "source-lines-fit", needs: ["mock"] },
  { name: "source-lines-min", needs: ["mock"] },
  { name: "stock-line", needs: ["mock"] },
  { name: "portfolio-fixes", needs: ["mock"] },
  { name: "pf-verdicts-forms", needs: ["mock"] },
  { name: "pf-verdicts-settings", needs: ["mock"] },
  { name: "letter-placement", needs: [] },
  { name: "pf-preview", needs: ["mock"] },
];
// The publish's browser checks run on GitHub in two parts, each with its own 30-minute limit (deploy-web.yml; since
// slice 8 each part in both letter placements, four jobs): at the fixes after the final review of pull request #50
// the one job took 25 min 17 s of its 30 (run 45080955695, 22 Nov 2026, 23:01 to 23:27 UTC). PART_ONE is about half
// of the suites' time (the per-suite seconds of the whole run of 22
// Nov, GitHub's letter placement, 3,573 s in all; on d549a59 GitHub's two browser steps took 12 min 2 s and 12 min 37 s),
// and part 2 every other suite, so a new suite is never left out: it joins part 2 until it is placed here. The suites of
// the built site stay together in part 2 (the build is made once there). source-lines-fit joined part 1 and stock-line
// part 2 when they left source-lines (the check of fix part 4).
const PART_ONE = ["accounts", "calendar-default", "chart-pointer", "classic-phone", "dropdowns", "header-wide", "install-hint", "layout-guard", "layout-guard-closed", "layout-guard-instruments", "nothing-cut", "opening", "opens", "pf-verdicts-forms", "phone-default", "phone-first", "phone-market", "portfolio", "portfolio-fixes", "results-dates", "source-lines-fit", "stale-feed", "stock-page", "units-labels", "welcome-mail"];

const args = process.argv.slice(2), serial = args.includes("--serial"), names = args.filter((a) => !a.startsWith("--"));
const part = (args.find((a) => a.startsWith("--part=")) ?? "").slice(7);
if (part && part !== "1" && part !== "2") { console.error(`--part=1 or --part=2, not "${part}"`); process.exit(2); }
const strays = PART_ONE.filter((n) => !SUITES.some((s) => s.name === n));
if (strays.length) { console.error(`PART_ONE names a suite that is not in SUITES: ${strays.join(", ")}`); process.exit(2); }
const unknown = names.filter((n) => !SUITES.some((s) => s.name === n));
if (unknown.length) { console.error(`unknown suite: ${unknown.join(", ")}\nsuites: ${SUITES.map((s) => s.name).join(", ")}`); process.exit(2); }
const chosen = (names.length ? SUITES.filter((s) => names.includes(s.name)) : SUITES).filter((s) => !part || (part === "1") === PART_ONE.includes(s.name));

const up = (port) => new Promise((res) => { const rq = http.get({ host: "localhost", port, path: BASE, timeout: 2000 }, (r) => { r.resume(); res(r.statusCode === 200); }); rq.on("error", () => res(false)); rq.on("timeout", () => { rq.destroy(); res(false); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const started = [];
async function start(id) {
  const s = SERVERS[id];
  if (await up(s.port)) {
    if (id === "built") throw new Error(`port ${s.port} is already in use: the built site must be the runner's own (e2e/.dist). Stop what is running there.`);
    console.log(`  ${id}: using the server already on ${s.port}`); return;
  }
  const env = { ...process.env, ...s.env }, log = fs.openSync(path.join(OUT, `server-${id}.log`), "w");
  if (id === "built") {
    const b = spawnSync(process.execPath, [VITE, "build", "--outDir", DIST, "--emptyOutDir"], { cwd: WEB, env, encoding: "utf8" });
    fs.writeFileSync(path.join(OUT, "build.log"), (b.stdout || "") + (b.stderr || ""));
    if (b.status !== 0) throw new Error(`the build for the built-site checks failed:\n${(b.stderr || b.stdout || "").split("\n").slice(-12).join("\n")}`);
  }
  const child = spawn(process.execPath, id === "built" ? [VITE, "preview", "--outDir", DIST, "--port", String(s.port), "--strictPort"] : [VITE, "--port", String(s.port), "--strictPort"], { cwd: WEB, env, stdio: ["ignore", log, log] });
  started.push(child);
  for (let i = 0; i < 90; i++) { if (await up(s.port)) { console.log(`  ${id}: started on ${s.port}`); return; } if (child.exitCode != null) break; await sleep(1000); }
  throw new Error(`the ${id} server did not come up on ${s.port} (see e2e/.out/server-${id}.log)`);
}
const stopAll = () => { for (const c of started) { try { c.kill("SIGTERM"); } catch { /* gone */ } } };
// this run's record for e2e/widths.cjs, written at the start and again as each suite ends: the placement in force,
// any other preload in NODE_OPTIONS (by its file's name only), the part, each suite's part, and the try that decided it
const record = {
  placement: placed.mode, switches: placed.switches,
  preloads: [...(process.env.NODE_OPTIONS || "").matchAll(/(?:--require|-r)(?:=|\s+)("[^"]+"|'[^']+'|\S+)/g)].map((m) => path.basename(m[1].replace(/^["']|["']$/g, ""))).filter((f) => f !== "placement.cjs"),
  part, suites: chosen.map((s) => ({ name: s.name, part: PART_ONE.includes(s.name) ? 1 : 2 })), done: {},
};
const keep = () => { try { fs.writeFileSync(path.join(OUT, "run.json"), JSON.stringify(record, null, 1) + "\n"); } catch { /* the record only feeds e2e/widths.cjs: no run stops for it */ } };
process.on("SIGINT", () => { stopAll(); process.exit(130); });

function runOnce(suite, attempt) {
  return new Promise((res) => {
    const t0 = Date.now(), file = path.join(OUT, `${suite.name}${attempt > 1 ? `.try${attempt}` : ""}.log`), out = fs.openSync(file, "w");
    const c = spawn(process.execPath, ["--require", PLACEMENT, path.join(__dirname, `${suite.name}.cjs`)], { cwd: OUT, env: process.env, stdio: ["ignore", out, out] });
    const timer = setTimeout(() => { try { c.kill("SIGKILL"); } catch { /* gone */ } }, 6 * 60e3);
    c.on("exit", (code) => { clearTimeout(timer); fs.closeSync(out); const text = fs.readFileSync(file, "utf8"); res({ file, ok: code === 0, secs: Math.round((Date.now() - t0) / 1000), passed: (text.match(/^\s*✓ (?!all checks)/gm) || []).length, failed: (text.match(/^\s*✗ (?!\d+ check)/gm) || []), text }); });
  });
}
// The lines of a try that say what failed: its ✗ checks and any error with where it was thrown; for a suite that
// stopped without one, the last lines it printed.
const failLines = (r) => {
  const lines = r.text.split("\n").filter((l) => /✗|Error|at .*\.cjs/.test(l));
  return (lines.length ? lines.slice(0, 12) : r.text.split("\n").filter((l) => l.trim()).slice(-5)).map((l) => "    " + l.trim().slice(0, 600)).join("\n");
};
async function run(suite) {
  const first = await runOnce(suite, 1);
  const r = first.ok ? first : await runOnce(suite, 2), retried = r !== first;
  record.done[suite.name] = { ok: r.ok, checks: r.passed, tries: retried ? 2 : 1, log: path.basename(r.file) }; keep();
  console.log(`${r.ok ? "✓" : "✗"} ${suite.name}: ${r.passed} checks${r.ok ? "" : `, ${r.failed.length || "the suite stopped;"} failed`} in ${r.secs}s${retried ? (r.ok ? " (passed on the second try)" : " (failed twice)") : ""}`);
  // A check that fails once and passes on the retry is a flaky check: what failed is printed here too, so it can be
  // found from the publish job's log alone (GitHub's machines keep e2e/.out only as an artifact; 20 Nov 2026).
  if (retried && r.ok) console.log(`    the first try failed (e2e/.out/${suite.name}.log):\n${failLines(first)}`);
  if (!r.ok) console.log(failLines(r));
  return { ...r, name: suite.name };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true }); keep();
  const t0 = Date.now(); let results = [];
  try {
    console.log(`letter placement: ${placed.mode === "installed" ? `installed (every browser a suite starts gets ${placed.switches.join(" ")}: e2e/placement.cjs)` : "the browser's own (E2E_PLACEMENT is github or unset)"}\n`);
    console.log("servers:");
    for (const id of Object.keys(SERVERS)) if (chosen.some((s) => s.needs.includes(id))) await start(id);   // one after another: they share vite's dependency cache
    // suites of the built site rewrite its files, so they queue behind each other; the rest run alongside, two at a time
    const queue = [...chosen.filter((s) => !s.needs.includes("built"))], builtQueue = chosen.filter((s) => s.needs.includes("built"));
    const atOnce = serial ? 1 : Math.min(2, queue.length) + (builtQueue.length ? 1 : 0);
    console.log(`\nsuites (${chosen.length}, ${["none", "one at a time", "two at once", "three at once"][atOnce] ?? `${atOnce} at once`}):`);
    const lanes = serial ? [async () => { for (const s of [...queue, ...builtQueue]) results.push(await run(s)); }]
      : [async () => { for (const s of builtQueue) results.push(await run(s)); }, ...[0, 1].map(() => async () => { for (let s = queue.shift(); s; s = queue.shift()) results.push(await run(s)); })];
    await Promise.all(lanes.map((f) => f()));
  } catch (e) { console.error(`\n${e.message}`); stopAll(); process.exit(1); }
  stopAll();
  const bad = results.filter((r) => !r.ok), checks = results.reduce((n, r) => n + r.passed, 0);
  console.log(`\n${bad.length ? `✗ ${bad.length} of ${results.length} suites failed: ${bad.map((r) => r.name).join(", ")}` : `✓ all ${results.length} suites passed`} (${checks} checks, ${Math.round((Date.now() - t0) / 1000)}s). Logs: web/e2e/.out`);
  process.exit(bad.length ? 1 : 0);
})();
