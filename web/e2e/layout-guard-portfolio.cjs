// The layout guard (e2e/layout-guard.cjs) on the paper portfolio's screens (P-1, 21 Nov 2026; the designer's build
// note D/p1-design.md §10), with the local copy's clock at Sat 21 Nov 2026, 17:00 SGT (om_mock_now), never the
// machine's: the list, the three forms, and the three stand-in books' Overview and Settings (lib/mockPf.ts gives the
// stand-in books fixed ids, so their addresses can be named here: the book with every default, two changes and four
// notes; the one on a yen base whose name has 60 characters; the macro book). At every size the guard uses for every
// screen (C1, C2, C6, C7, C8, 1440x900 at text L, iPhone SE, iPhone 13): no figure cut, painted over or clipped,
// nothing sideways, every phone tap 44 px. The states with something open (the statement, the change form, the
// delete lines, a phone's Review and sections, no book) are measured by portfolio.cjs and phone-portfolio.cjs.
// Run from web/:  node e2e/run.cjs layout-guard-portfolio
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
process.env.GUARD_CLOCK = "2026-11-21T09:00:00Z";
process.env.GUARD_SCREENS = ["portfolio/all", "portfolio/new/ar-ls-jp", "portfolio/new/ar-ls-gl", "portfolio/new/ar-macro", ...[1, 2, 3].flatMap((n) => [`portfolio/${id(n)}`, `portfolio/${id(n)}/settings`])].join(",");
require("./layout-guard.cjs");
