// The layout guard (e2e/layout-guard.cjs) on the instruments' own pages (I-4, 20 Nov 2026): USD/JPY (a pair), UST 10Y
// (a yield from the market), JGB 10Y (a yield published once a day by Japan MOF), the Euro Stoxx 50 (an index without
// an EQUITIES page) and gold (a future), at every size the guard uses for every screen (C1, C2, C6, C7, C8, 1440x900 at text L, iPhone SE,
// iPhone 13): no figure cut, painted
// over or clipped, no chart label cut, nothing sideways, every phone tap 44 px. The guard's own run keeps its eight
// screens, its walks of the statements and its proofs that it can fail.
// Run from web/:  node e2e/run.cjs layout-guard-instruments
// Gold joined on 21 Nov 2026 (the designer's D-64): a future with a recorded change of contract, whose KEY DATA scrolled
// sideways at text L and cut every figure; the guard's three windows of D-51 take it too (1366x768 and 1536x864 at L,
// 1680x1050 at XL).
process.env.GUARD_SCREENS = "asset/USDJPY%3DX,asset/%5ETNX,asset/JGB10Y,asset/%5ESTOXX50E,asset/GC%3DF";
require("./layout-guard.cjs");
