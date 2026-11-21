// The layout guard (e2e/layout-guard.cjs) with every market shut (the owner's request of 20 Nov 2026: beside every
// CLOSED, when that market next opens). The local copy's clock is set to Sat 21 Nov 2026, 10:00 SGT (om_mock_now), never
// the machine's: every market but crypto is shut then, so every chart tile and every phone line that says CLOSED
// carries its opening, at its longest ("opens 23 Nov 09:30 SGT, scheduled"), and WATCHLIST its "Closed now" line. On
// MARKETS, RATES & FX, EQUITIES, WATCHLIST, a US stock's page, a Tokyo stock's and a pair's, at every size the guard
// uses (C1, C2, C6, C7, C8, 1440x900 at text L, iPhone SE, iPhone 13, and a stock's page at D-51's windows): no figure
// cut, painted over or clipped, no chart label cut, nothing sideways, every phone tap 44 px. The guard's own run
// keeps its eight screens at the machine's clock, its walks of the statements and its proofs that it can fail.
// Run from web/:  node e2e/run.cjs layout-guard-closed
process.env.GUARD_CLOCK = "2026-11-21T02:00:00Z";
process.env.GUARD_SCREENS = "market,rates,equities,watch,asset/NVDA,asset/7203.T,asset/USDJPY%3DX";
require("./layout-guard.cjs");
