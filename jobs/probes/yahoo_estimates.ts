// Facts for an owner decision, OD-1 (A-03 consensus, A-06 surprises, A-22 ratings; B-18 forward P/E): what the free
// option would give. Yahoo Finance's quoteSummary modules earningsTrend, earningsHistory, recommendationTrend,
// financialData and calendarEvents, for NVDA and 7203.T. Yahoo is unofficial and does not name the vendor of its
// estimates; this prints what it carries for a US and a Tokyo name (periods, number of analysts, revisions), and
// whether any field names a vendor. Nothing is built on it until the owner decides.
// The session cookie and crumb Yahoo requires (as supabase/functions/_shared/yahoo.ts gets them) are not printed.
// Runtime: node.
//   Actions > source-probe > Run workflow: probe = yahoo_estimates, runtime = node
import { head, look, UA } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const J = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };
const raw = (v: unknown): unknown => (v && typeof v === "object" && "raw" in (v as Record<string, unknown>) ? (v as { raw: unknown }).raw : v);

async function session(): Promise<{ cookie: string; crumb: string } | null> {
  try {
    const r1 = await fetch("https://fc.yahoo.com", { headers: { "user-agent": UA, accept: "*/*" }, redirect: "manual", signal: AbortSignal.timeout(20000) });
    const setc: string[] = (r1.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [r1.headers.get("set-cookie") ?? ""];
    const cookie = setc.filter(Boolean).map((c) => c.split(";")[0]).join("; ");
    console.log(`  fc.yahoo.com: HTTP ${r1.status}, session cookie ${cookie ? "received" : "not received"}`);
    const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "user-agent": UA, accept: "*/*", cookie }, signal: AbortSignal.timeout(20000) });
    const crumb = (await r2.text()).trim();
    const ok = r2.ok && !!crumb && !crumb.includes("<");
    console.log(`  getcrumb: HTTP ${r2.status}, crumb ${ok ? "received" : "not received"}`);
    return ok ? { cookie, crumb } : null;
  } catch (e) { console.log(`  FAILED: ${e instanceof Error ? e.message : String(e)}`); return null; }
}

head("Yahoo Finance: a session (cookie and crumb), as the server gets one");
const s = await session();
if (s) for (const sym of ["NVDA", "7203.T"]) {
  await pause(800);
  head(`${sym}: quoteSummary earningsTrend, earningsHistory, recommendationTrend, financialData, calendarEvents`);
  const r = await look(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=earningsTrend,earningsHistory,recommendationTrend,financialData,calendarEvents&crumb=${encodeURIComponent(s.crumb)}`, { headers: { cookie: s.cookie, accept: "*/*" }, show: 0 });
  const res = ((J(r.text) as { quoteSummary?: { result?: Array<Record<string, unknown>> } } | null)?.quoteSummary?.result ?? [])[0];
  if (!res) { console.log(`  no result; first 300 chars: ${JSON.stringify(r.text.slice(0, 300))}`); continue; }
  type Est = Record<string, unknown>;
  const trend = ((res.earningsTrend as { trend?: Est[] } | undefined)?.trend ?? []);
  for (const t of trend) {
    const e = (t.earningsEstimate ?? {}) as Est, v = (t.revenueEstimate ?? {}) as Est, et = (t.epsTrend ?? {}) as Est, rv = (t.epsRevisions ?? {}) as Est;
    console.log(`  ${t.period} (ends ${t.endDate}): EPS mean ${raw(e.avg)} low ${raw(e.low)} high ${raw(e.high)} from ${raw(e.numberOfAnalysts)} analysts; revenue mean ${raw(v.avg)} from ${raw(v.numberOfAnalysts)}; EPS mean now ${raw(et.current)}, 7d ago ${raw(et["7daysAgo"])}, 30d ${raw(et["30daysAgo"])}, 90d ${raw(et["90daysAgo"])}; revisions up 30d ${raw(rv.upLast30days)}, down 30d ${raw(rv.downLast30days)}`);
  }
  if (!trend.length) console.log("  earningsTrend: none");
  const hist = ((res.earningsHistory as { history?: Est[] } | undefined)?.history ?? []);
  console.log(`  earningsHistory: ${hist.length} quarters${hist.length ? `; newest: ${hist.slice(-2).map((h) => `${raw(h.quarter)} actual ${raw(h.epsActual)} vs estimate ${raw(h.epsEstimate)} (${raw(h.surprisePercent)})`).join(" | ")}` : ""}`);
  const rec = ((res.recommendationTrend as { trend?: Est[] } | undefined)?.trend ?? [])[0];
  console.log(`  recommendationTrend now: ${rec ? `strong buy ${rec.strongBuy}, buy ${rec.buy}, hold ${rec.hold}, sell ${rec.sell}, strong sell ${rec.strongSell}` : "none"}`);
  const fd = (res.financialData ?? {}) as Est;
  console.log(`  financialData: target mean ${raw(fd.targetMeanPrice)}, low ${raw(fd.targetLowPrice)}, high ${raw(fd.targetHighPrice)}, analysts ${raw(fd.numberOfAnalystOpinions)}, recommendation ${raw(fd.recommendationKey)}`);
  const ce = (res.calendarEvents ?? {}) as Est;
  console.log(`  calendarEvents: earnings ${JSON.stringify(((ce.earnings as Est | undefined)?.earningsDate as unknown[] | undefined)?.map(raw) ?? [])}, ex-dividend ${raw(ce.exDividendDate)}, dividend ${raw(ce.dividendDate)}`);
  const vendor = r.text.match(/Refinitiv|LSEG|I\/B\/E\/S|FactSet|S&P Global|Capital IQ|Morningstar|Zacks|Visible Alpha|QUICK|IFIS/gi);
  console.log(`  a data vendor named anywhere in the answer: ${vendor ? [...new Set(vendor)].join(", ") : "none"}`);
}
