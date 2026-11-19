// The stand-in rows of the browser checks: web/src/lib/standin.json, the same rows the local copy's mock feed shows
// (web/src/lib/mock.ts). Synthetic: nothing in them is a real figure. Read once when a suite starts, with the same
// rule as the mock: "{h:N}" becomes the time N hours from now (ISO), "{h:N|day}" that time's date in Singapore.
const raw = require("../src/lib/standin.json");
const HOUR = 3600e3;
function live(x, now) {
  const at = (n, day) => { const t = now + Number(n) * HOUR; return day ? new Date(t + 8 * HOUR).toISOString().slice(0, 10) : new Date(t).toISOString(); };
  const walk = (v) => (typeof v === "string" ? v.replace(/\{h:(-?\d+(?:\.\d+)?)(\|day)?\}/g, (_m, n, d) => at(n, d))
    : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, w]) => [k, walk(w)])) : v);
  return walk(x);
}
const S = live(raw, Date.now());
/** A note for its date, as the server's `note` sends it; a date not in the list still gets one (as lib/mock.ts). */
const note = (d) => { const row = S.notes.find((n) => n.d === d) ?? null; return { ...S.noteBody, id: row?.id ?? 1, d, title: row?.title ?? S.notes[0].title, generatedAt: row?.generatedAt ?? `${d}T23:05:00Z`, kind: "daily" }; };
const report = (id) => ({ ...(S.reports.find((r) => r.id === id) ?? S.reports[0]), ...S.reportBody });
module.exports = { S, note, report };
