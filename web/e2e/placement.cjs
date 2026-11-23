// The letter placement the browser checks run in: E2E_PLACEMENT=installed or github (slice 8, 23 Nov 2026).
//
// Why. A line of text is not as wide on every machine. The engineer's machine starts Playwright's Chromium through
// an installed launcher script that adds --font-render-hinting=none and --disable-lcd-text: each letter keeps its
// fractional width. GitHub's runner starts the same browser without them, and there a letter takes a whole number
// of px (IBM Plex Mono at 13 px: 8 px a letter, not 7.8), so a line comes out a few px wider or narrower: a row or a
// cell with less than that to spare fits on one machine and not on the other (TOPIX's name cell and two header
// checks of the paper portfolio, 21 Nov 2026; e2e/letter-placement.cjs prints the width of one line both ways).
// Readers' browsers differ in the same way, so a layout has to pass both ways. Until this file, GitHub ran the checks
// only its own way, and the engineer's whole run as installed was the only run of the other.
//
// What it does. Loaded before a suite (web/e2e/run.cjs loads it into every suite it starts), it reads E2E_PLACEMENT:
//   installed  every chromium.launch() of the process (and launchPersistentContext, launchServer) adds
//              --font-render-hinting=none and --disable-lcd-text, the two switches of the engineer's launcher that
//              Playwright does not pass itself (the launcher's third, --force-color-profile=srgb, Playwright passes):
//              on GitHub the browser then places letters as on the engineer's machine. Measured there with the
//              browser's own binary, the launcher bypassed: --font-render-hinting=none alone gives the launcher's
//              widths; --disable-lcd-text changed none of the widths measured (it is about how a letter's edges
//              are shaded), and is added so that the browser starts with the launcher's switches.
//   github     (or unset, or empty) nothing changes: the browser's own placement, GitHub's on GitHub. On the
//              engineer's machine that is still the installed one, because its launcher adds the switches anyway.
// Any other value stops the process here, so that a misspelt leg never runs silently in the other placement.
//
// What it does not reach. The switch sets how the browser places the letters of the faces a page loads (the
// Monitor's IBM Plex Mono, IBM Plex Sans JP and Cormorant Garamond, which GitHub's runner and the engineer's machine
// both take from fonts.googleapis.com). Text drawn in a font of the machine itself (a letter the page's faces lack,
// such as σ, or a check that forces monospace) follows that machine's own font settings (fontconfig) in either
// placement: measured on the engineer's machine, whose fontconfig sets every system font unhinted.
//
// GitHub's own placement on the engineer's machine needs the browser started with --font-render-hinting=full, which
// this file does not do (README.md, "Tests", says how each GitHub leg is drawn again there).
//
// Use: cd web && E2E_PLACEMENT=installed node e2e/run.cjs [suite …]. A suite started by hand takes it with
// NODE_OPTIONS="--require $PWD/e2e/placement.cjs" (an absolute path: run.cjs starts each suite in e2e/.out).
// Another preload that wraps chromium.launch has to be loaded after this one: its switches would otherwise come
// after these, and of a switch given twice the browser keeps the last; with E2E_PLACEMENT=installed this file stops
// the process when it finds launch already wrapped.
const Module = require("module");

const SWITCHES = { installed: ["--font-render-hinting=none", "--disable-lcd-text"], github: [] };
const raw = process.env.E2E_PLACEMENT ?? "";
const mode = raw === "" ? "github" : raw;
if (!Object.prototype.hasOwnProperty.call(SWITCHES, mode)) {
  throw new Error(`web/e2e/placement.cjs: E2E_PLACEMENT is "${raw}"; it must be "installed", "github" or unset`);
}
// what is in force, for run.cjs's first line and the letter-placement suite
globalThis[Symbol.for("orrery.e2e.placement")] = { mode, switches: SWITCHES[mode] };

const DONE = Symbol.for("orrery.e2e.placement.wrapped");
const WRAPPED = ["launch", "launchPersistentContext", "launchServer"];
const NAMES = new Set(["playwright", "playwright-core", "@playwright/test"]);
const load = Module._load;
Module._load = function (request) {
  const m = load.apply(this, arguments);
  const bt = NAMES.has(request) && m ? m.chromium : null;
  if (!bt || bt[DONE] || SWITCHES[mode].length === 0) return m;
  const early = WRAPPED.filter((k) => Object.prototype.hasOwnProperty.call(bt, k));
  if (early.length) throw new Error(`web/e2e/placement.cjs: chromium.${early.join(", ")} was wrapped by a preload loaded before this one, whose switches would come after "${SWITCHES[mode].join(" ")}" and win: load web/e2e/placement.cjs first`);
  const add = (o) => ({ ...(o || {}), args: [...((o && o.args) || []), ...SWITCHES[mode]] });
  for (const k of WRAPPED) {
    if (typeof bt[k] !== "function") continue;
    const f = bt[k].bind(bt);
    bt[k] = k === "launchPersistentContext" ? (dir, o) => f(dir, add(o)) : (o) => f(add(o));
  }
  bt[DONE] = true;
  return m;
};
