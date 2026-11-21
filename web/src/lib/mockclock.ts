// Dev-only (the local copy, `VITE_DEV_MOCK=1`): a clock for the stand-in feed. Never active in a production build.
// With `om_mock_now` in the browser's storage (an ISO time: "2026-11-24T02:45:00Z" is Tue 24 Nov 2026, 10:45 SGT) the
// page's clock starts at that moment each time the page loads and runs on from it, and the stand-in market rows follow
// the session table at that moment (lib/mock.ts): a market that is shut is CLOSED with its last print at its close, one
// in its regular hours is live. So a closed market, a midday break, a holiday or an early close can be looked at
// whatever the real time is (the bar at the top says the clock is set). Without it the clock is the machine's; with
// "now" in place of a time the clock is the machine's too, and the rows follow the session table all the same.
// Imported first by main.tsx, before anything reads the time.
if (import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK === "1") {
  let at = NaN;
  try { at = Date.parse(localStorage.getItem("om_mock_now") ?? ""); } catch { /* no storage: the machine's clock */ }
  if (Number.isFinite(at)) {
    const Real = Date, shift = at - Real.now();
    class MockDate extends Real {
      constructor(...a: unknown[]) { if (a.length === 0) super(Real.now() + shift); else super(...(a as [number])); }
      static now(): number { return Real.now() + shift; }
    }
    (globalThis as unknown as { Date: unknown }).Date = MockDate;
  }
}
export {};
