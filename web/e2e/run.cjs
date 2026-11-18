#!/usr/bin/env node
// The browser checks of the web app, in one command (Shota, 18 Nov 2026). From web/:
//
//   node e2e/run.cjs                          every suite
//   node e2e/run.cjs offline notifications    only these (names as in SUITES below)
//   node e2e/run.cjs --serial                 one suite at a time (default: three at once)
//
// The runner starts the servers the chosen suites need, runs the suites, tries a failed one once more, prints
// one line per suite and exits with 1 if any failed twice. Nothing here needs the real API or a sign-in:
//   mock     5179  dev server with the in-page mock feed, no sign-in
//   standin  5181  dev server, no sign-in; API calls are answered by the suite (e2e/harness.cjs)
//   gate     5183  dev server with the real sign-in screen; API calls answered by the suite
//   built    5187  the site as published (a build in e2e/.dist), for what only a built site has: the service
//                  worker, version.json. Suites that rewrite its files run one after another.
// A dev server already answering on its port is used as it is. Logs and screenshots go to e2e/.out (git-ignored).
const { spawn, spawnSync } = require("child_process"), fs = require("fs"), http = require("http"), path = require("path");
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
  { name: "phone-default", needs: ["mock", "gate"] },
  { name: "accounts", needs: ["gate"] },
  { name: "install-hint", needs: ["mock"] },
  { name: "update-bar", needs: ["mock", "built"] },
  { name: "offline", needs: ["mock", "built"] },
  { name: "notifications", needs: ["mock", "built"] },
];

const args = process.argv.slice(2), serial = args.includes("--serial"), names = args.filter((a) => !a.startsWith("--"));
const unknown = names.filter((n) => !SUITES.some((s) => s.name === n));
if (unknown.length) { console.error(`unknown suite: ${unknown.join(", ")}\nsuites: ${SUITES.map((s) => s.name).join(", ")}`); process.exit(2); }
const chosen = names.length ? SUITES.filter((s) => names.includes(s.name)) : SUITES;

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
process.on("SIGINT", () => { stopAll(); process.exit(130); });

function runOnce(suite, attempt) {
  return new Promise((res) => {
    const t0 = Date.now(), file = path.join(OUT, `${suite.name}${attempt > 1 ? `.try${attempt}` : ""}.log`), out = fs.openSync(file, "w");
    const c = spawn(process.execPath, [path.join(__dirname, `${suite.name}.cjs`)], { cwd: OUT, env: process.env, stdio: ["ignore", out, out] });
    const timer = setTimeout(() => { try { c.kill("SIGKILL"); } catch { /* gone */ } }, 6 * 60e3);
    c.on("exit", (code) => { clearTimeout(timer); fs.closeSync(out); const text = fs.readFileSync(file, "utf8"); res({ ok: code === 0, secs: Math.round((Date.now() - t0) / 1000), passed: (text.match(/^\s*✓ (?!all checks)/gm) || []).length, failed: (text.match(/^\s*✗ (?!\d+ check)/gm) || []), text }); });
  });
}
async function run(suite) {
  let r = await runOnce(suite, 1), retried = false;
  if (!r.ok) { retried = true; r = await runOnce(suite, 2); }
  console.log(`${r.ok ? "✓" : "✗"} ${suite.name}: ${r.passed} checks${r.ok ? "" : `, ${r.failed.length || "the suite stopped;"} failed`} in ${r.secs}s${retried ? (r.ok ? " (passed on the second try)" : " (failed twice)") : ""}`);
  if (!r.ok) console.log(r.text.split("\n").filter((l) => /✗|Error|at .*\.cjs/.test(l)).slice(0, 12).map((l) => "    " + l.trim().slice(0, 600)).join("\n"));
  return { ...r, name: suite.name };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now(); let results = [];
  try {
    console.log("servers:");
    for (const id of Object.keys(SERVERS)) if (chosen.some((s) => s.needs.includes(id))) await start(id);   // one after another: they share vite's dependency cache
    console.log(`\nsuites (${chosen.length}${serial ? ", one at a time" : ", three at once"}):`);
    // suites of the built site rewrite its files, so they queue behind each other; the rest run alongside
    const queue = [...chosen.filter((s) => !s.needs.includes("built"))], builtQueue = chosen.filter((s) => s.needs.includes("built"));
    const lanes = serial ? [async () => { for (const s of [...queue, ...builtQueue]) results.push(await run(s)); }]
      : [async () => { for (const s of builtQueue) results.push(await run(s)); }, ...[0, 1].map(() => async () => { for (let s = queue.shift(); s; s = queue.shift()) results.push(await run(s)); })];
    await Promise.all(lanes.map((f) => f()));
  } catch (e) { console.error(`\n${e.message}`); stopAll(); process.exit(1); }
  stopAll();
  const bad = results.filter((r) => !r.ok), checks = results.reduce((n, r) => n + r.passed, 0);
  console.log(`\n${bad.length ? `✗ ${bad.length} of ${results.length} suites failed: ${bad.map((r) => r.name).join(", ")}` : `✓ all ${results.length} suites passed`} (${checks} checks, ${Math.round((Date.now() - t0) / 1000)}s). Logs: web/e2e/.out`);
  process.exit(bad.length ? 1 : 0);
})();
