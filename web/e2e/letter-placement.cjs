// The two letter placements the browser checks run in (slice 8, 23 Nov 2026): web/e2e/placement.cjs adds its
// switches to a browser's start only with E2E_PLACEMENT=installed, they move the letters, and nothing else does.
// GitHub runs every suite both ways (deploy-web.yml); this one, in part 2, says in the logs of test-2 and
// test-2-installed how each way draws there.
//
// Each way starts a node process of its own with the preload and E2E_PLACEMENT as given (and nothing else in
// NODE_OPTIONS), which launches Chromium with Playwright's debug lines on (DEBUG=pw:browser prints the command line
// Playwright starts, before any launcher script of the machine adds its own) and measures lines of text in two fonts
// of this machine, loaded by the page as faces of its own: the switch places the letters of a page's faces, not
// those of a system font (placement.cjs). No server and no network. What a machine's browser does with no switch
// is printed, not checked (fractional on the engineer's machine; whole px on GitHub's runner, by its failures of 21
// Nov 2026); what is checked holds on every machine: E2E_PLACEMENT unset or github changes nothing, installed adds
// its two switches once and draws letters at fractional widths, a start with --font-render-hinting=full draws them
// on whole px (GitHub's placement), and the installed switches win over it when they come after it. DejaVu's files
// are taken where a machine has them, so that the widths in the engineer's log and in GitHub's can be set side by side.
const { spawnSync, execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const PRELOAD = path.join(__dirname, "placement.cjs");
const MARK = Symbol.for("orrery.e2e.placement");

if (process.argv[2] === "--child") {
  // one way: launch, measure, print one line
  const { chromium } = require("playwright");
  const fonts = JSON.parse(process.argv[3]).map((f) => ({ name: path.basename(f), b64: fs.readFileSync(f).toString("base64") }));
  (async () => {
    const b = await chromium.launch();
    const p = await b.newPage();
    await p.setContent("<!doctype html><html><body></body></html>");
    const widths = await p.evaluate(async (fonts) => {
      const out = [];
      for (const [i, f] of fonts.entries()) {
        const face = new FontFace(`Probe${i}`, Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0)));
        await face.load(); document.fonts.add(face);
        for (const size of [11, 13, 15]) {
          const e = document.createElement("span");
          e.style.cssText = `font:${size}px Probe${i};white-space:pre;position:absolute;left:0;top:0`;
          e.textContent = "USD/JPY 155.42 · TOPIX 3,310.7";
          document.body.appendChild(e);
          out.push({ font: f.name, size, w: e.getBoundingClientRect().width });
          e.remove();
        }
      }
      return out;
    }, fonts);
    await b.close();
    console.log("RESULT " + JSON.stringify(widths));
  })().catch((e) => { console.error(e); process.exit(1); });
  return;
}

let pass = 0, fail = 0;
const ck = (name, ok, detail) => { if (ok) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  ->  " + JSON.stringify(detail) : "")); } };

// two font files of this machine: DejaVu Sans Mono and DejaVu Sans where they are (on the engineer's machine and,
// with Ubuntu's fonts, on GitHub's runner, so that the widths printed in both logs can be set side by side), else
// Liberation's (which Playwright's dependencies install), else what fontconfig picks for monospace and sans-serif;
// each way's process reads them and sends them to its page as bytes
function fontFiles() {
  const known = ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"].filter((f) => fs.existsSync(f));
  const picked = [];
  for (const family of ["monospace", "sans-serif"]) {
    try { const f = execFileSync("fc-match", ["-f", "%{file}", family], { encoding: "utf8" }).trim(); if (f && fs.existsSync(f)) picked.push(f); } catch { /* no fc-match */ }
  }
  return [...new Set([...known, ...picked])].slice(0, 2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orrery-placement-"));
// another preload, as one that draws GitHub's placement on the engineer's machine is written: it wraps
// chromium.launch on the first of Playwright's modules required (playwright requires playwright-core) and adds
// --font-render-hinting=full
const FULL = path.join(tmp, "full.cjs");
fs.writeFileSync(FULL, `const Module = require("module"), load = Module._load;
Module._load = function (request) { const m = load.apply(this, arguments);
  if (["playwright", "playwright-core", "@playwright/test"].includes(request) && m && m.chromium && !m.chromium.__full) { const f = m.chromium.launch.bind(m.chromium); m.chromium.launch = (o = {}) => f({ ...o, args: [...(o.args || []), "--font-render-hinting=full"] }); m.chromium.__full = true; }
  return m; };\n`);

const fonts = fontFiles();
function way(placement, requires) {
  const env = { ...process.env, NODE_OPTIONS: requires.map((r) => `--require ${r}`).join(" "), DEBUG: "pw:browser", DEBUG_COLORS: "0" };
  if (placement === undefined) delete env.E2E_PLACEMENT; else env.E2E_PLACEMENT = placement;
  const r = spawnSync(process.execPath, [__filename, "--child", JSON.stringify(fonts)], { cwd: __dirname, env, encoding: "utf8", timeout: 90e3, maxBuffer: 64 << 20 });
  const launching = (r.stderr || "").split("\n").find((l) => l.includes("<launching>")) || "";
  const args = launching.slice(launching.indexOf("<launching>") + 12).split(" ").slice(1).filter((a) => a && !a.startsWith("--user-data-dir="));
  const result = /^RESULT (.*)$/m.exec(r.stdout || "");
  return { status: r.status, args, switches: args.filter((a) => /^--font-render-hinting=|^--disable-lcd-text$/.test(a)), widths: result ? JSON.parse(result[1]) : null, err: (r.stderr || "").split("\n").filter((l) => /Error|placement\.cjs/.test(l)).slice(0, 3).join(" | ").slice(0, 400) };
}
const whole = (ws) => !!ws && ws.length > 0 && ws.every((x) => Math.abs(x.w - Math.round(x.w)) < 0.001);
const fractional = (ws) => !!ws && ws.length > 0 && ws.some((x) => Math.abs(x.w - Math.round(x.w)) >= 0.001);
const same = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
const line = (ws) => (ws ? ws.filter((x) => x.size === 13).map((x) => `${+x.w.toFixed(3)} px in ${x.font}`).join(", ") : "nothing measured");

console.log(`\n[letter-placement] the preload's switches, both ways, and what they do to a line of letters (${fonts.map((f) => path.basename(f)).join(" and ") || "no font file found"})`);
try {
  const bare = way(undefined, []), unset = way(undefined, [PRELOAD]), github = way("github", [PRELOAD]), installed = way("installed", [PRELOAD]);
  const full = way(undefined, [FULL]), over = way("installed", [PRELOAD, FULL]), under = way("installed", [FULL, PRELOAD]), typo = way("instaled", [PRELOAD]);
  const own = bare.args.length > 0 && bare.widths !== null;
  ck(`with no preload the browser starts and a 13-px line measures ${line(bare.widths)} (${whole(bare.widths) ? "whole px: GitHub's placement" : "fractional: the installed placement"} is this machine's own)`, own && fonts.length === 2, { status: bare.status, err: bare.err, fonts: fonts.length });
  ck(`E2E_PLACEMENT unset or github: the preload adds no switch (the command line is Playwright's own, ${bare.switches.length} of the two switches in it) and the letters fall as with no preload`,
    own && same(unset.args, bare.args) && same(github.args, bare.args) && bare.switches.length === 0 && same(unset.widths, bare.widths) && same(github.widths, bare.widths), { unset: unset.switches, github: github.switches, err: [unset.err, github.err] });
  const INSTALLED = ["--font-render-hinting=none", "--disable-lcd-text"], rest = installed.args.filter((a) => !INSTALLED.includes(a));
  ck(`E2E_PLACEMENT=installed: the browser starts with --font-render-hinting=none and --disable-lcd-text, once each, and Playwright's own switches as they were; the line measures ${line(installed.widths)}, fractional (the installed placement)`,
    installed.status === 0 && same(installed.switches, INSTALLED) && same(rest, bare.args) && fractional(installed.widths), { status: installed.status, switches: installed.switches, extra: rest.filter((a) => !bare.args.includes(a)), err: installed.err });
  ck(`a start with --font-render-hinting=full draws GitHub's placement on this machine too: ${line(full.widths)}, every line on whole px; with the preload loaded first, the installed switches come after it and win: ${line(over.widths)}, as installed`,
    full.status === 0 && whole(full.widths) && over.status === 0 && same(over.switches, ["--font-render-hinting=full", "--font-render-hinting=none", "--disable-lcd-text"]) && same(over.widths, installed.widths), { full: full.switches, over: over.switches, err: [full.err, over.err] });
  ck(`a misspelt E2E_PLACEMENT ("instaled") stops the process with the preload's words, and so does E2E_PLACEMENT=installed with a preload that wrapped the launch before it (whose switch would win): no leg runs silently in the other placement`,
    typo.status !== 0 && typo.widths === null && /E2E_PLACEMENT is "instaled"; it must be "installed", "github" or unset/.test(typo.err) && under.status !== 0 && under.widths === null && /load web\/e2e\/placement\.cjs first/.test(under.err), { typo: [typo.status, typo.err], under: [under.status, under.err] });
  const mine = globalThis[MARK], asked = process.env.E2E_PLACEMENT || "";
  ck(`this run${asked ? ` (E2E_PLACEMENT=${asked})` : ""}: ${mine ? `the preload is loaded in this suite's own process (run.cjs loads it into every suite), placement "${mine.mode}"` : "the preload is not loaded here (a suite started by hand without it)"}`,
    asked ? !!mine && mine.mode === asked : !mine || mine.mode === "github", { asked, mine });
} catch (e) { ck(`the ways ran (${e.message})`, false); }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n✗ ${fail} check(s) failed` : "\n✓ all checks passed");
process.exit(fail ? 1 : 0);
