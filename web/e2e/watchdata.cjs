// Stand-in watchlist answers for the browser checks (synthetic; nothing here is a real figure). Register after harness routes().
// The rows are those of web/src/lib/standin.json (e2e/standin.cjs), the same ones the local copy's mock feed shows.
const { S } = require("./standin.cjs");
// every row the stand-in server knows, as its watch_list sends them; some are only found by searching
const ALL = S.watch.rows;
// what the server's search answers: a part of a symbol or of a name, whatever its case
const search = (q) => { const t = String(q || "").trim().toLowerCase(); return t ? S.watch.search.filter((x) => x.symbol.toLowerCase().includes(t) || x.name.toLowerCase().includes(t)) : []; };
const state = { syms: [...S.watch.start] };
// as the server's watch_feed: the alerts on the listed symbols, the headlines naming one, the pieces mentioning one
const feed = () => { const on = (s) => state.syms.includes(s), f = S.watch.feed;
  return { alerts: f.alerts.filter((a) => on(a.symbol)), news: f.news.filter((n) => n.tickers.some((t) => on(t.s))), research: f.research.map((r) => ({ ...r, symbols: r.symbols.filter(on) })).filter((r) => r.symbols.length) }; };
async function watchRoutes(p, { empty = false } = {}) {
  if (empty) state.syms = [];
  await p.route("**/fakeapi?*", async (r) => { const q = new URL(r.request().url()).searchParams, a = q.get("action");
    const ok = (body, status = 200) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify(body) });
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" } });
    if (a === "watch_syms") return ok({ symbols: state.syms });
    if (a === "watch_list") return ok({ rows: ALL.filter((x) => state.syms.includes(x.symbol)) });
    if (a === "search") { (p.__searches = p.__searches || []).push(q.get("q")); return ok({ rows: search(q.get("q")) }); }
    if (a === "watch_feed") return ok(state.syms.length ? feed() : { alerts: [], news: [], research: [] });
    if (a === "watch_set") { const b = JSON.parse(r.request().postData() || "{}"); (p.__sets = p.__sets || []).push(b);
      if (!ALL.some((x) => x.symbol === b.symbol)) return ok({ error: `Unknown symbol ${b.symbol}` }, 400);
      state.syms = b.on ? [...new Set([...state.syms, b.symbol])] : state.syms.filter((s) => s !== b.symbol); return ok({ symbols: state.syms }); }
    return r.fallback(); });
}
module.exports = { watchRoutes, state, ALL };
