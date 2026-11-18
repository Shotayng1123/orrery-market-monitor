// Stand-in watchlist answers for the browser checks (synthetic; nothing here is a real figure). Register after harness routes().
const iso = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const row = (symbol, name, kind, sector, ccy, last, p, extra = {}) => ({ symbol, name, kind, sector, ccy, last, asOf: new Date().toISOString().slice(0, 10), pct1d: p, pct1w: p * 1.7, pct1m: p * -2.3, pct3m: p * 4.1, pct12m: p * 9.6, vs50: p * 1.2, vs200: p * 3, pos52: 50 + p * 10, mcap: 4e12, earningsAt: null, earningsEst: false, isYield: false, ...extra });
const ALL = [
  row("7203.T", "Toyota Motor Corp", "Equity", "Transportation", "JPY", 3120.5, 1.84, { earningsAt: iso(30), earningsEst: false }),
  row("NVDA", "NVIDIA Corporation", "Equity", "Information Technology", "USD", 182.44, -3.21, { earningsAt: iso(54), earningsEst: true }),
  row("6758.T", "Sony Group Corporation with a rather long registered name", "Equity", "Technology", "JPY", 4211, 0.42),
  row("^N225", "Nikkei 225", "Index", null, "JPY", 57434.77, -1.1, { mcap: null }),
  row("USDJPY=X", "USD/JPY", "Currency", null, "JPY", 158.21, 0.0, { mcap: null }),
  row("^TNX", "UST 10Y yield", "Rate", null, "USD", 4.859, 0.4, { mcap: null, isYield: true }),
  row("AAPL", "Apple Inc.", "Equity", "Information Technology", "USD", 251.3, 0.77, { earningsAt: iso(200) }),
];
// names that are only found by searching (never in the list at the start)
const MORE = [
  row("6201.T", "Toyota Industries Corp", "Equity", "Machinery", "JPY", 15230, 0.6),
  row("8015.T", "Toyota Tsusho Corp", "Equity", "Wholesale Trade", "JPY", 3355, -0.3),
  row("TM", "Toyota Motor Corporation ADR", "Equity", null, "USD", 201.4, 1.1),
];
// what the server's search answers: a part of a symbol or of a name, whatever its case
const NOTES = { "7203.T": "NK225 · Transportation", "6201.T": "NK225 · Machinery", "8015.T": "NK225 · Wholesale Trade", TM: "NYSE", NVDA: "SP500 · Information Technology", AAPL: "SP500 · Information Technology", "6758.T": "NK225 · Technology", "^N225": "Monitor instrument", "USDJPY=X": "Monitor instrument", "^TNX": "Monitor instrument" };
const search = (q) => { const t = String(q || "").trim().toLowerCase(); return t ? [...ALL, ...MORE].filter((x) => x.symbol.toLowerCase().includes(t) || x.name.toLowerCase().includes(t)).map((x) => ({ symbol: x.symbol, name: x.name, kind: x.kind, note: NOTES[x.symbol] || "" })) : []; };
const state = { syms: ALL.map((r) => r.symbol).filter((s) => s !== "AAPL") };
const feed = () => ({
  alerts: [{ id: 1, at: iso(-2), symbol: "NVDA", name: "NVIDIA Corporation", kind: "move", pct: -7.4, msg: "NVIDIA Corporation fell 7.4% on the day, beyond its 5% line (stand-in)", url: null }, { id: 2, at: iso(-20), symbol: "7203.T", name: "Toyota Motor Corp", kind: "buyback", pct: null, msg: "Toyota Motor Corp announced a share buyback of up to ¥1.2tn (stand-in)", url: "https://example.com/buyback" }],
  news: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, publishedAt: iso(-i * 3), source: ["Nikkei Asia", "FT Markets", "CNBC Markets"][i % 3], title: ["Toyota lifts its full-year outlook as the weaker yen offsets tariffs &amp; costs", "Nvidia suppliers slide after a guidance cut ripples through the chip chain", "Sony weighs a spin-off of its financial arm, people familiar say"][i % 3] + " (stand-in)", url: "https://example.com/n/" + i, tickers: [[{ s: "7203.T", n: "Toyota Motor" }], [{ s: "NVDA", n: "NVIDIA" }, { s: "AMD", n: "AMD" }], [{ s: "6758.T", n: "Sony Group" }]][i % 3] })),
  research: [{ key: "note:2026-11-16", d: "2026-11-16", kind: "daily", title: "Chip rout meets Toyota surge as Nikkei futures point lower before the open", symbols: ["7203.T", "NVDA"] }, { key: "report:1", d: "2026-11-14", kind: "weekly", title: "Weekly Strategy: stay long banks, fade the semis bounce, and hedge the yen into the Bank of Japan meeting", symbols: ["6758.T"] }],
});
async function watchRoutes(p, { empty = false } = {}) {
  if (empty) state.syms = [];
  await p.route("**/fakeapi?*", async (r) => { const q = new URL(r.request().url()).searchParams, a = q.get("action");
    const ok = (body, status = 200) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify(body) });
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" } });
    if (a === "watch_syms") return ok({ symbols: state.syms });
    if (a === "watch_list") return ok({ rows: [...ALL, ...MORE].filter((x) => state.syms.includes(x.symbol)) });
    if (a === "search") { (p.__searches = p.__searches || []).push(q.get("q")); return ok({ rows: search(q.get("q")) }); }
    if (a === "watch_feed") return ok(state.syms.length ? feed() : { alerts: [], news: [], research: [] });
    if (a === "watch_set") { const b = JSON.parse(r.request().postData() || "{}"); (p.__sets = p.__sets || []).push(b);
      if (![...ALL, ...MORE].some((x) => x.symbol === b.symbol)) return ok({ error: `Unknown symbol ${b.symbol}` }, 400);
      state.syms = b.on ? [...new Set([...state.syms, b.symbol])] : state.syms.filter((s) => s !== b.symbol); return ok({ symbols: state.syms }); }
    return r.fallback(); });
}
module.exports = { watchRoutes, state, ALL };
