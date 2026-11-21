// The paper portfolio's probe of the SEC (P-0: C/portfolio-plan.md §3.1 item 4, "pfsec"), for P-4b (the N-PORT
// fallback for the benchmarks' members and weights: A §6.2, §6.3) and P-9a (the fails-to-deliver files). The SEC
// refuses automated readers that declare no contact (C/probes/sec_edgar.log: 403 on 19 Nov 2026); the owner declared
// one (OD-4) as the repository secret SEC_USER_AGENT, which the SEC accepted on 20 Nov (owner-decisions.md).
// This probe has it only when the run asks for it: source-probe's input sec_user_agent = true gives that secret, and no
// other, to the Probe step alone. It is sent only as the User-Agent header and never printed: every line this probe
// prints is cleaned of it and of any e-mail address (GitHub also shows a registered secret as *** in a log). Without
// it nothing is asked of the SEC. Read-only, nothing written.
// It prints:
//   1. company_tickers_mf.json: EWJ's and ACWI's CIK, series id and class id;
//   2. for each, its newest N-PORT-P filings (EDGAR's company browse by series id, as Atom; by the registrant's CIK if
//      the series gives none), the newest one's file list and its primary document: the reporting period's end, the
//      filing date, total and net assets, and the number of holdings;
//   3. the fails-to-deliver data page: its newest files and their sizes.
// The Section 31 fee rate and the half-cent tick's status (Rule 612) are read by pf_rules from the Federal Register,
// where the SEC publishes its fee-rate orders and rules; it needs no declared contact.
// Requests: at most 11, all to sec.gov, at least 0.6 s apart (the SEC allows ten a second): the fund list (1), per fund
// the filings (1, and 1 more by the registrant), the file list (1) and the primary document (1), the fails page (2).
// Runtime: node.
//   Actions > source-probe > Run workflow: probe = pf_sec, runtime = node, sec_user_agent = true
import process from "node:process";
import { counted, head, pause, requestsMade } from "./lib.ts";

const MAX = 11, GAP = 600;
const UA_SEC = (process.env.SEC_USER_AGENT ?? "").trim();
/** Nothing secret is ever printed: the declared contact and any e-mail address are replaced. */
const clean = (s: string): string => (UA_SEC.length >= 4 ? s.split(UA_SEC).join("***") : s).replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "***@***");
const say = (s: string): void => console.log(clean(s));

/** One request to the SEC with the declared contact as its User-Agent; one line printed, cleaned. */
async function get(url: string, accept = "*/*", timeoutMs = 60000): Promise<{ ok: boolean; status: number | null; text: string }> {
  const t0 = Date.now();
  counted();
  try {
    const r = await fetch(url, { headers: { "user-agent": UA_SEC, accept, "accept-encoding": "gzip, deflate" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    const text = await r.text();
    say(`${r.status} ${r.ok ? "OK" : "NOT OK"}  ${r.headers.get("content-type") ?? "no type"}  ${text.length} chars  ${Date.now() - t0} ms  ${url}${r.url && r.url !== url ? `  (ended at ${r.url})` : ""}${r.headers.get("last-modified") ? `  last-modified ${r.headers.get("last-modified")}` : ""}`);
    await pause(GAP);
    return { ok: r.ok, status: r.status, text };
  } catch (e) {
    say(`FAILED  ${Date.now() - t0} ms  ${url}\n  ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    await pause(GAP);
    return { ok: false, status: null, text: "" };
  }
}
const tag = (xml: string, name: string): string | null => xml.match(new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`))?.[1]?.trim() ?? null;

const t0 = Date.now();
say(`run at ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
head("The declared contact (SEC_USER_AGENT)");
if (!UA_SEC) {
  say("  not given to this run: nothing is asked of the SEC (run with sec_user_agent = true)");
} else {
  say("  given to this run (its value is not printed)");

  head("1. company_tickers_mf.json: EWJ and ACWI");
  const funds = new Map<string, { cik: number; series: string; cls: string }>();
  {
    const r = await get("https://www.sec.gov/files/company_tickers_mf.json", "application/json");
    let j: { fields?: string[]; data?: unknown[][] } | null = null;
    try { j = JSON.parse(r.text); } catch { /* below */ }
    const f = j?.fields ?? [], iC = f.indexOf("cik"), iS = f.indexOf("seriesId"), iK = f.indexOf("classId"), iY = f.indexOf("symbol");
    say(`  fields ${f.join(", ") || "–"}; ${j?.data?.length ?? 0} rows`);
    for (const row of j?.data ?? []) {
      const sym = String(row[iY] ?? "").toUpperCase();
      if (sym === "EWJ" || sym === "ACWI") funds.set(sym, { cik: Number(row[iC]), series: String(row[iS]), cls: String(row[iK]) });
    }
    for (const sym of ["EWJ", "ACWI"]) { const x = funds.get(sym); say(`  ${sym}: ${x ? `CIK ${x.cik}, series ${x.series}, class ${x.cls}` : "not in the list"}`); }
  }

  for (const sym of ["EWJ", "ACWI"]) {
    const x = funds.get(sym);
    if (!x) continue;
    head(`2. ${sym}: its newest N-PORT-P filings, the newest one's primary document`);
    const atom = async (id: string) => {
      const r = await get(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(id)}&type=NPORT-P&dateb=&owner=include&count=10&output=atom`, "application/atom+xml,*/*");
      return [...r.text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => ({ date: tag(m[1], "filing-date"), href: tag(m[1], "filing-href"), acc: tag(m[1], "accession-number"), type: tag(m[1], "filing-type") })).filter((e) => e.href);
    };
    let entries = await atom(x.series), bySeries = true;
    if (!entries.length) { bySeries = false; say("  the series id gave no filings: the registrant's instead (these may be any of its funds)"); entries = await atom(String(x.cik).padStart(10, "0")); }
    say(`  ${entries.length} filings${bySeries ? " of the series" : " of the registrant"}; newest: ${entries.slice(0, 5).map((e) => `${e.type ?? "–"} filed ${e.date ?? "–"} (${e.acc ?? "–"})`).join("; ") || "–"}`);
    const top = entries[0];
    if (!top?.href || !bySeries) { if (!bySeries) say("  not opened: a registrant's newest N-PORT need not be this fund's"); continue; }
    const folder = top.href.replace(/[^/]+$/, "");
    const idx = await get(`${folder}index.json`, "application/json");
    let items: Array<{ name?: string; size?: string | number }> = [];
    try { items = (JSON.parse(idx.text) as { directory?: { item?: Array<{ name?: string; size?: string | number }> } }).directory?.item ?? []; } catch { /* below */ }
    say(`  the filing's files: ${items.map((i) => `${i.name} (${i.size ?? "–"})`).join(", ") || "none listed"}`);
    const prim = items.find((i) => /primary_doc\.xml$/i.test(i.name ?? "")) ?? items.find((i) => /\.xml$/i.test(i.name ?? ""));
    if (!prim?.name) continue;
    const doc = await get(`${folder}${prim.name}`, "application/xml,text/xml,*/*", 120000);
    if (!doc.ok) continue;
    const n = (doc.text.match(/<(?:\w+:)?invstOrSec>/g) ?? []).length;
    say(`  ${prim.name}: series "${tag(doc.text, "seriesName") ?? "–"}" (${tag(doc.text, "seriesId") ?? "–"}); period ending ${tag(doc.text, "repPdEnd") ?? "–"}, as of ${tag(doc.text, "repPdDate") ?? "–"}; total assets ${tag(doc.text, "totAssets") ?? "–"}, net assets ${tag(doc.text, "netAssets") ?? "–"}; ${n} holdings (invstOrSec)`);
    const first = doc.text.match(/<(?:\w+:)?invstOrSec>([\s\S]*?)<\/(?:\w+:)?invstOrSec>/)?.[1] ?? "";
    if (first) say(`  its first holding: name "${tag(first, "name") ?? "–"}", title "${tag(first, "title") ?? "–"}", ISIN ${first.match(/<(?:\w+:)?isin value="([^"]+)"/)?.[1] ?? "–"}, balance ${tag(first, "balance") ?? "–"} ${tag(first, "units") ?? ""}, value USD ${tag(first, "valUSD") ?? "–"}, ${tag(first, "pctVal") ?? "–"}% of net assets, country ${tag(first, "invCountry") ?? "–"}`);
  }

  head("3. The fails-to-deliver data page (P-9a): its newest files");
  for (const url of ["https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data", "https://www.sec.gov/foia/docs/failsdata.htm"]) {
    const r = await get(url, "text/html,*/*");
    if (!r.ok) continue;
    const zips = [...new Set([...r.text.matchAll(/href=["']([^"']*cnsfails[^"']*\.zip)["']/gi)].map((m) => m[1]))];
    say(`  ${zips.length} files${zips.length ? `; the first five: ${zips.slice(0, 5).join(", ")}` : ""}`);
    break;
  }
}

say(`\nrequests made: ${requestsMade()} (at most ${MAX}); ${Math.round((Date.now() - t0) / 1000)} s`);
