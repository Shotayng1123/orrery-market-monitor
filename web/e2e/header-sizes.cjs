// The one-screen header, one row by rule (the designer's notes of 22 Nov 2026, Part A, revision 2: its check A.7 (a) to
// (f)) at the text sizes S, M, L and XL and at the floor's heights (1114x800 S, 1310x800 and 1420x900 M, 1507x900 and
// 1633x1000 L, 1769x1000 XL; 1310x560 M, 1507x644 L, 1769x756 XL), both tab counts. The checks are e2e/header.cjs's,
// which runs the AUTO windows, the floor and the layouts outside; split so that each run stays well inside the
// runner's six minutes. The wider drawings and the scrollbars: e2e/header-wide.cjs.
// Run from web/:  node e2e/run.cjs header-sizes
process.env.HEADER_WINDOWS = "sizes";
require("./header.cjs");
