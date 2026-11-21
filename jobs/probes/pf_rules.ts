// The paper portfolio's probe of rule texts, the second run (P-0b: C/portfolio-plan.md §3.1b item 5): only what the
// run of 20 Nov 2026 missed or misread (C/probes/pf_rules.log). Read then and not asked again: NYSE's, the Fed's,
// SIFMA's and the BoJ's calendars, Rule 201, Rule 612's criteria, the IRS's 30%, GIPS 2.A.12, Morningstar's capture.
// Every read of JPX's rule pages (tick tables, price limits, the closing auction, short selling) is in pf_jpx, which
// the owner released on 21 Nov 2026 ("(c) all"). Read-only, no key, nothing written. In the order of the increments
// that wait:
//   P-2 (fees and ticks)
//   1. The SEC's order making the fiscal-year 2026 adjustments to transaction fee rates (Section 31), document
//      2026-04233 of 4 Mar 2026 itself: the rate and the date it applies from. On 20 Nov the probe opened its
//      correction of 7 May instead (l.170–182).
//   2. FINRA's Trading Activity Fee from FINRA's own filings as the Federal Register prints them (finra.org refuses
//      GitHub's machines, l.164–168): the newest notice that names the fee: the rate per share, the maximum per
//      trade and the dates.
//   3. Rule 612's operative dates: the lines of 17 CFR 242.612 (b)(1) that the first run cut (l.235), and the SEC's
//      order of 15 Jun 2026 granting temporary exemptive relief under Rules 610(f) and 612(d) (2026-11997, l.189):
//      does the half-cent tick apply on a trade date now?
//   P-3 (withholding)
//   4. The NTA's withholding rates on listed shares' dividends (15.315% as A recalls it; BP-42 for an investment
//      trust), from its site's own links: its English home page, the links that name withholding, two pages at most;
//      then, only if no rate was printed, one Japanese tax-answer page at an address from the engineer's memory.
//   P-5, P-11 (contracts)
//   5. The CFTC's contract units (C-35; B's V-15 (1)): the newest Commitments of Traders rows of every root P-5 lists
//      (ES NQ YM RTY NKD NIY ZT ZF ZN TN ZB UB CL BZ NG GC SI HG) and of ZQ, SR3, PL and TPY: name, code, units.
//   6. The SPX option's multiplier, on Cboe's specification page (the label alone was printed on 20 Nov, l.323). A
//      specification page, not one of the VIX-family files the owner's answer of 21 Nov sets aside.
//   7. CME: one request, its robots.txt, and none after it. Its pages answered 403 twice on 20 Nov (l.282–304); whether
//      that is its rule for automated readers or its wall was not read. The contract table stays B's (A) either way.
//   P-7a, §2.19 (standards)
//   8. The Basel Committee's 1996 back-testing framework (BP-34's zones): the address of 20 Nov ended at its
//      publication page (l.367); now that page's own link to the paper, and the paper.
//   9. Articles 7 and 8 of Regulation (EU) No 231/2013 (AIFMD's gross and commitment methods): EUR-Lex's PDF format
//      (its HTML answered 202 with no text, l.428), then the Publications Office's own address for the same act.
// Every address is a candidate where no log shows it; a refusal or a 404 is the finding. A site's robots.txt is read
// before its pages (CME's is the whole of its part), and a path it holds is not asked: where that is the Federal
// Register's API, a document's text is read at the address the log of 20 Nov gives the pattern of (l.180), if the
// file allows that path, and FINRA's search is not made. A site that refuses twice is not asked again.
// These are regulators', governments' and standard setters' own texts and files, and one specification page of
// Cboe's, whose disclaimers the log of 20 Nov holds (pf_bench.log l.460–469): their terms are not read here (the
// probes that read a site's terms are pf_bench and pf_borrow, for publishers' files).
// Requests: at most 27, 1 s apart, to nine sites; a robots.txt that answers 429 is asked once more after the wait it
// names (60 s at most), so 36 at the very most.
// Runtime: deno (PDFs are read with unpdf; under node they are only measured).
//   Actions > source-probe > Run workflow: probe = pf_rules, runtime = deno
import { bytes, head, linksOf, look, masked, page, pause, pdfPages, printLines, printPassages, requestsMade, robots, textLines, titleOf, type Robots } from "./lib.ts";

const GAP = 1000, MAX = 27;
const t0 = Date.now();
const refused = new Map<string, number>();
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return u; } };
const skip = (u: string) => (refused.get(hostOf(u)) ?? 0) >= 2;
const note = (u: string, ok: boolean) => { if (!ok) refused.set(hostOf(u), (refused.get(hostOf(u)) ?? 0) + 1); };
const gates = new Map<string, Robots>();
/** A site's robots.txt, once; then whether a path of it may be read. */
async function gate(origin: string, paths: string[]): Promise<Robots> {
  const had = gates.get(origin);
  if (had) return had;
  const rb = await robots(origin, paths);
  gates.set(origin, rb);
  await pause(GAP);
  return rb;
}
/** Whether `url` may be asked: not where the site's robots.txt holds its path (a documented API's path too: whether a
 *  rule written for crawlers binds a program that calls an API is the owner's to say, not this probe's), and not of a
 *  site that refused twice. */
const API_NOTE: Record<string, string> = {
  "https://www.federalregister.gov": " (the Federal Register's documented API, which the run of 20 Nov read before any probe had read this file: for the owner)",
  "https://publicreporting.cftc.gov": " (the CFTC's documented API, which the probe cftc_cot read before any probe had read this file: for the owner)",
};
const may = (url: string): boolean => {
  const origin = new URL(url).origin, rb = gates.get(origin);
  if (rb && !rb.allows(url)) { console.log(rb.outcome === "read" ? `  not asked: robots.txt holds ${new URL(url).pathname}${/\/api\/|\/resource\//.test(url) ? API_NOTE[origin] ?? "" : ""}` : `  not asked: ${new URL(url).pathname} (this site's robots.txt was not read: ${rb.outcome})`); return false; }
  if (skip(url)) { console.log(`  not asked: ${hostOf(url)} refused twice already`); return false; }
  return true;
};
console.log(`run at ${new Date(t0).toISOString().slice(0, 16).replace("T", " ")} UTC`);

// ---- the Federal Register: one document by its number, then its text ----
const FR = "https://www.federalregister.gov";
const FIELDS = ["title", "publication_date", "type", "document_number", "html_url", "raw_text_url", "dates", "effective_on", "abstract"].map((f) => `fields[]=${f}`).join("&");
async function frText(raw: string, want: RegExp, max: number): Promise<void> {
  if (!raw || !may(raw)) return;
  const t = await page(raw, { headers: { accept: "text/plain,*/*" }, timeoutMs: 60000 });
  note(raw, t.ok);
  await pause(GAP);
  if (t.ok) printPassages([t.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")], want, max);
}
/** One document: its record from the API, then its text. `published` (its date in the log of 20 Nov) gives the text's
 *  address by the pattern that log shows, used only where the API's path is held or does not answer. */
async function frDocument(what: string, number: string, published: string, want: RegExp, max = 8): Promise<void> {
  head(what);
  const url = `${FR}/api/v1/documents/${number}.json?${FIELDS}`, byPattern = `${FR}/documents/full_text/text/${published.replace(/-/g, "/")}/${number}.txt`;
  if (!may(url)) { if (gates.get(FR)?.outcome === "read") { console.log(`  its text, at the address the log of 20 Nov gives the pattern of (published ${published}):`); await frText(byPattern, want, max); } return; }
  const r = await look(url, { headers: { accept: "application/json" }, show: 0 });
  note(url, r.ok);
  await pause(GAP);
  let d: Record<string, unknown> | null = null;
  try { d = JSON.parse(r.text) as Record<string, unknown>; } catch { /* below */ }
  if (!r.ok || !d) { console.log(`  the document was not returned by the API; its text, at the address the log of 20 Nov gives the pattern of (published ${published}):`); await frText(byPattern, want, max); return; }
  console.log(`  ${d.publication_date} · ${d.type} · ${d.document_number} · "${String(d.title ?? "").slice(0, 200)}"${d.effective_on ? ` · effective ${d.effective_on}` : ""}${d.dates ? ` · dates: ${String(d.dates).slice(0, 300)}` : ""} · ${d.html_url ?? ""}`);
  if (d.abstract) console.log(`  abstract: ${String(d.abstract).slice(0, 500)}`);
  await frText(String(d.raw_text_url ?? ""), want, max);
}
head("The Federal Register's robots.txt (its API is made for programs)");
await gate(FR, ["/api/v1/documents/2026-04233.json", "/api/v1/documents.json", "/documents/full_text/text/2026/03/04/2026-04233.txt", "/documents/full_text/text/2026/06/15/2026-11997.txt"]);

await frDocument("1. Section 31: the SEC's order making fiscal year 2026 adjustments to transaction fee rates (2026-04233), itself", "2026-04233", "2026-03-04", /\$\s?\d+(\.\d+)? per million|fee rates? (applicable|will|shall)|will (be|become) effective|effective (on|date)|30 days after|uniform adjusted rate/i, 10);

head("2. FINRA's Trading Activity Fee, from FINRA's filings in the Federal Register (finra.org refuses GitHub's machines)");
{
  const url = `${FR}/api/v1/documents.json?conditions[term]=${encodeURIComponent('"Trading Activity Fee"')}&conditions[agencies][]=securities-and-exchange-commission&order=newest&per_page=10&${FIELDS}`;
  if (may(url)) {
    const r = await look(url, { headers: { accept: "application/json" }, show: 0 });
    note(url, r.ok);
    await pause(GAP);
    let docs: Array<Record<string, unknown>> = [];
    try { docs = (JSON.parse(r.text) as { results?: Array<Record<string, unknown>> }).results ?? []; } catch { /* below */ }
    for (const d of docs) console.log(`  ${d.publication_date} · ${d.type} · ${d.document_number} · "${String(d.title ?? "").slice(0, 190)}"`);
    const isFinra = (d: Record<string, unknown>) => /Financial Industry Regulatory Authority|FINRA/i.test(String(d.title ?? ""));
    const pick = docs.find((d) => isFinra(d) && /fee|Schedule A|Section 1/i.test(`${d.title ?? ""} ${d.abstract ?? ""}`)) ?? docs.find(isFinra);
    if (!pick) console.log(`  ${docs.length ? "no document of FINRA's among them" : "no document found"}: the fee stays unread`);
    else {
      console.log(`  opened: ${pick.document_number} (${pick.publication_date}), the newest of FINRA's${/fee|Schedule A|Section 1/i.test(String(pick.title ?? "")) ? " on its fees" : ""}`);
      await frText(String(pick.raw_text_url ?? ""), /Trading Activity Fee[^.]{0,220}\$0?\.\d{4,}|\$0?\.\d{5,} per share[^.]{0,200}|maximum (charge|per[- ]trade charge|of)[^.]{0,120}\$\d[\d.,]*|\$\d+\.\d{2} per trade|TAF[^.]{0,160}(effective|operative|beginning|as of)[^.]{0,80}20\d\d/i, 12);
    }
  }
}

await frDocument("3a. Rule 612's half-cent tick: the SEC's order of 15 Jun 2026 granting temporary exemptive relief under Rules 610(f) and 612(d) (2026-11997)", "2026-11997", "2026-06-15", /(compliance date|operative|exempt(ion|ive relief)?)[^.]{0,200}(20\d\d|first business day)|until[^.]{0,120}20\d\d|minimum pricing increment[^.]{0,200}|Rule 612[^.]{0,200}(20\d\d|exempt)/i, 10);
head("3b. Rule 612 itself: the lines of 17 CFR 242.612 (b)(1), \"shall be operative on\"");
{
  const url = "https://www.ecfr.gov/current/title-17/section-242.612";
  await gate("https://www.ecfr.gov", ["/current/title-17/section-242.612"]);
  if (may(url)) {
    const p = await page(url, { timeoutMs: 45000 });
    note(url, p.ok);
    await pause(GAP);
    if (p.ok) {
      const ls = textLines(p.html), at = ls.findIndex((l) => /shall be operative on/i.test(l));
      console.log(`  title: ${titleOf(p.html) || "–"}; ${ls.length} lines of text; "shall be operative on" at line ${at}`);
      for (const l of ls.filter((x) => /up to date as of|last amended/i.test(x)).slice(0, 1)) console.log(`  date line: ${l.slice(0, 200)}`);
      if (at >= 0) for (const l of ls.slice(at, at + 9)) console.log(`  | ${l.slice(0, 500)}`);
      else printLines(ls, /operative|first business day|evaluation period|November|May/i, 12);
    }
  }
}

// ---- P-3: Japan's withholding ----
head("4. The NTA: withholding on listed shares' dividends, from its site's own links");
{
  const NTA = "https://www.nta.go.jp", WANT = /15\.315|20\.315|20\.42|10\.21|dividend|listed (share|stock)|investment trust|non-?resident|配当|上場株式|源泉徴収|投資信託/i;
  const rb = await gate(NTA, ["/english/index.htm", "/english/taxes/", "/taxes/shiraberu/taxanswer/shotoku/1330.htm"]);
  let found = false, asked = 0;
  const read = async (url: string, max = 14): Promise<Array<{ href: string; text: string }>> => {
    if (!rb.allows(url) || skip(url)) { console.log(`  not asked: ${masked(url)}`); return []; }
    const p = await page(url, { timeoutMs: 45000 });
    note(url, p.ok); asked++;
    await pause(GAP);
    if (!p.ok) return [];
    const ls = textLines(p.html), error = /error|404|表示できません/i.test(new URL(p.final).pathname + titleOf(p.html));
    console.log(`  title: ${titleOf(p.html) || "–"}; ${ls.length} lines of text${error ? " (the site's error page)" : ""}`);
    if (error) return [];
    if (ls.some((l) => /15\.315|20\.315|20\.42/.test(l))) found = true;
    printLines(ls, WANT, max);
    return linksOf(p.html, p.final).filter((l) => /nta\.go\.jp/.test(l.href));
  };
  if (rb.outcome === "unreachable" || rb.outcome === "busy") console.log("  nothing is asked of the NTA in this run (its robots.txt was not read): Japan's withholding stays A's (A) figure");
  else {
    const home = await read(`${NTA}/english/index.htm`, 6);
    const named = (ls: Array<{ href: string; text: string }>, re: RegExp) => ls.filter((l) => re.test(l.text) && l.text.length < 120);
    const first = named(home, /withholding/i)[0] ?? named(home, /income tax|taxes|tax system|guide/i)[0];
    console.log(`  links of the English home page that name withholding or income tax: ${[...named(home, /withholding/i), ...named(home, /income tax|taxes|tax system|guide/i)].slice(0, 8).map((l) => `${l.text.slice(0, 50)} -> ${masked(l.href)}`).join(" · ") || "none"}`);
    if (first) {
      const next = await read(first.href);
      const second = named(next, /dividend|interest|non-?resident|withholding tax guide|investment trust/i).find((l) => l.href !== first.href);
      if (!found && second) { console.log(`  followed: ${second.text.slice(0, 60)} -> ${masked(second.href)}`); await read(second.href); }
    }
    if (!found) {
      console.log("  no rate was printed from the pages its own links gave. One candidate from the engineer's memory, not from a link: the tax answer No.1330 (配当所得)");
      await read(`${NTA}/taxes/shiraberu/taxanswer/shotoku/1330.htm`);
    }
    console.log(`  ${asked} pages asked; a rate of 15.315%, 20.315% or 20.42% printed: ${found ? "yes" : "NO: Japan's withholding stays A's (A) figure"}`);
  }
}

// ---- P-5: the CFTC's contract units ----
head("5. The CFTC's contract units (C-35): the newest Commitments of Traders rows, by root");
{
  const BASE = "https://publicreporting.cftc.gov", DATE = "report_date_as_yyyy_mm_dd";
  await gate(BASE, ["/resource/gpe5-46if.json", "/resource/72hh-3qpy.json"]);
  /** A looser word for each root: where the pattern above it finds no market, the names that carry this word are
   *  printed, so that a name the CFTC writes otherwise is seen in this run and not asked for in another. */
  const LOOSE: Record<string, RegExp> = { ES: /S&P/i, NQ: /NASDAQ/i, YM: /DJIA|DOW/i, RTY: /RUSSELL/i, NKD: /NIKKEI/i, NIY: /NIKKEI/i, TPY: /TOPIX|TOKYO|JAPAN/i, ZT: /2Y|2-YEAR/i, ZF: /5Y|5-YEAR/i, ZN: /10Y|10-YEAR/i, TN: /ULTRA|10Y|10-YEAR/i, ZB: /BOND/i, UB: /ULTRA|BOND/i, ZQ: /FUNDS/i, SR3: /SOFR/i, CL: /CRUDE|WTI/i, BZ: /BRENT/i, NG: /GAS|HENRY/i, GC: /GOLD/i, SI: /SILVER/i, HG: /COPPER/i, PL: /PLATINUM/i };
  const ROOTS: Array<[string, string, RegExp]> = [
    ["ES", "fin", /E-MINI S&P 500 -|S&P 500 E-MINI|^E-MINI S&P 500/i], ["NQ", "fin", /NASDAQ[- ]100.*(MINI|CONSOLIDATED)|NASDAQ MINI|E-MINI NASDAQ/i], ["YM", "fin", /DJIA.*\$5|DOW JONES.*\$5|MINI DOW/i], ["RTY", "fin", /RUSSELL.*(E-MINI|2000 MINI)|E-MINI RUSSELL/i],
    ["NKD", "fin", /NIKKEI STOCK AVERAGE(?! YEN)/i], ["NIY", "fin", /NIKKEI.*YEN/i], ["TPY", "fin", /TOPIX/i],
    ["ZT", "fin", /UST 2Y|2-YEAR U\.?S\.? TREASURY/i], ["ZF", "fin", /UST 5Y|5-YEAR U\.?S\.? TREASURY/i], ["ZN", "fin", /^UST 10Y|^10-YEAR U\.?S\.? TREASURY|^10Y UST/i], ["TN", "fin", /ULTRA.*10/i], ["ZB", "fin", /^UST BOND|^U\.?S\.? TREASURY BONDS/i], ["UB", "fin", /ULTRA.*BOND/i],
    ["ZQ", "fin", /FED FUNDS|FEDERAL FUNDS/i], ["SR3", "fin", /SOFR.*3|3.*SOFR/i],
    ["CL", "com", /CRUDE OIL, LIGHT SWEET|WTI.*PHYSICAL|^WTI CRUDE/i], ["BZ", "com", /BRENT.*LAST DAY/i], ["NG", "com", /NAT(URAL)? GAS.*(NYME|NEW YORK MERC)|HENRY HUB - NEW YORK/i],
    ["GC", "com", /^GOLD - /i], ["SI", "com", /^SILVER - /i], ["HG", "com", /^COPPER/i], ["PL", "com", /^PLATINUM - /i],
  ];
  const sets: Record<string, Array<Record<string, unknown>>> = { fin: [], com: [] };
  for (const [kind, id, name] of [["fin", "gpe5-46if", "Traders in Financial Futures, futures only"], ["com", "72hh-3qpy", "Disaggregated, futures only"]] as const) {
    const url = `${BASE}/resource/${id}.json?$select=${encodeURIComponent(`market_and_exchange_names,cftc_contract_market_code,contract_units,${DATE}`)}&$order=${encodeURIComponent(`${DATE} DESC`)}&$limit=700`;
    if (!may(url)) continue;
    const r = await look(url, { headers: { accept: "application/json" }, show: 0, timeoutMs: 60000 });
    note(url, r.ok);
    await pause(GAP);
    let rows: Array<Record<string, unknown>> = [];
    try { const j = JSON.parse(r.text); if (Array.isArray(j)) rows = j as Array<Record<string, unknown>>; } catch { /* below */ }
    const newest = rows.map((x) => String(x[DATE] ?? "")).sort().pop() ?? "";
    sets[kind] = rows.filter((x) => String(x[DATE] ?? "") === newest);
    console.log(`  ${name} (${id}): ${rows.length} rows read, ${sets[kind].length} markets in the newest report (${newest.slice(0, 10) || "–"}); with a contract_units field: ${sets[kind].filter((x) => x.contract_units != null).length}`);
  }
  if (!sets.fin.length && !sets.com.length) console.log("  no row was read: nothing to match the roots against; the multipliers stay B's (A) values");
  else for (const [root, kind, re] of ROOTS) {
    const hits = sets[kind].filter((x) => re.test(String(x.market_and_exchange_names ?? "")));
    const show = (x: Record<string, unknown>) => `${x.market_and_exchange_names} [${x.cftc_contract_market_code}] ${x.contract_units ?? "no units given"}`;
    const near = hits.length || !sets[kind].length ? [] : sets[kind].filter((x) => LOOSE[root].test(String(x.market_and_exchange_names ?? "")));
    console.log(`  ${root}: ${hits.length ? hits.slice(0, 3).map(show).join(" · ") : !sets[kind].length ? "its report was not read" : `no market's name matches ${re}; names in the report with ${LOOSE[root]}: ${near.slice(0, 6).map(show).join(" · ") || "none"}${near.length > 6 ? ` · and ${near.length - 6} more` : ""}`}${hits.length > 3 ? ` · and ${hits.length - 3} more` : ""}`);
  }
}

// ---- P-11: the SPX multiplier ----
head("6. Cboe: the SPX option's multiplier (a specification page; the label alone was printed on 20 Nov)");
{
  const url = "https://www.cboe.com/tradable-products/sp-500/spx-options/spx-specifications";
  await gate("https://www.cboe.com", ["/tradable-products/sp-500/spx-options/spx-specifications"]);
  if (may(url)) {
    const p = await page(url, { timeoutMs: 45000 });
    note(url, p.ok);
    await pause(GAP);
    if (p.ok) {
      const ls = textLines(p.html), at = ls.map((l, i) => (/^multiplier\b/i.test(l) ? i : -1)).filter((i) => i >= 0);
      console.log(`  title: ${titleOf(p.html) || "–"}; ${ls.length} lines of text; "Multiplier" heads ${at.length} line(s)`);
      for (const i of at.slice(0, 3)) console.log(`  | ${ls.slice(i, i + 3).map((l) => l.slice(0, 200)).join("  /  ")}`);
      printLines(ls, /\$100\b|multiplier (of|is)|times \$?100/i, 4);
      for (const l of ls.filter((x) => /as of [A-Z][a-z]+ \d{1,2}, 20\d\d/.test(x)).slice(0, 1)) console.log(`  date line: ${l.slice(0, 120)}`);
    }
  }
}

// ---- CME: one request ----
head("7. CME: its robots.txt, the one request made of it (its pages answered 403 twice on 20 Nov)");
{
  const rb = await robots("https://www.cmegroup.com", ["/markets/equities/sp/e-mini-sandp500.contractSpecs.html", "/markets/equities/sp/e-mini-sandp500.margins.html", "/trading/price-limits.html", "/company/clearing-fees.html"]);
  console.log(`  FINDING: ${rb.outcome === "read" ? "CME serves a robots.txt to GitHub's machines; the verdicts on its pages are above, and its pages themselves answered 403 on 20 Nov" : rb.status === 403 || rb.status === 401 ? "CME refuses even its robots.txt (a wall for automated readers, not a rule that can be read)" : `no rule read (${rb.outcome}${rb.status ? `, HTTP ${rb.status}` : ""})`}. No page of CME's is asked in this run: the contract table stays B's (A) values, each naming the refused page, until a person enters a row from CME's page with its address and date (V-15)`);
  // a robots.txt refused (401, 403, 418) is a refusal, and counts as one in the last line (it went uncounted: the line
  // read "sites that refused: none" after CME's 403; the checks of round 3b, PR-15)
  note("https://www.cmegroup.com/robots.txt", !(rb.outcome === "none" && (rb.status === 401 || rb.status === 403 || rb.status === 418)));
  await pause(GAP);
}

// ---- P-7a: Basel 1996 ----
head("8. The Basel Committee's 1996 back-testing framework (BP-34), by its publication page's own link");
{
  const BIS = "https://www.bis.org", pub = `${BIS}/publications/199601-standards-supervisory-framework-use-of-backtesting-conjunction-internal-models-approach-market-risk-capital-requirements`;
  await gate(BIS, [new URL(pub).pathname, "/publ/bcbs22.pdf"]);
  if (may(pub)) {
    const p = await page(pub, { timeoutMs: 60000 });
    note(pub, p.ok);
    await pause(GAP);
    if (p.ok) {
      const pdfs = linksOf(p.html, p.final).filter((l) => /\.pdf(\?|$)/i.test(l.href));
      console.log(`  title: ${titleOf(p.html) || "–"}; PDF links: ${pdfs.slice(0, 5).map((l) => `${l.text.slice(0, 40) || "(no text)"} -> ${masked(l.href)}`).join(" · ") || "none in the page's HTML"}`);
      const pick = pdfs.find((l) => /bcbs22|backtest/i.test(l.href)) ?? pdfs.find((l) => /full text|download|pdf/i.test(l.text)) ?? pdfs[0];
      if (pick && may(pick.href)) {
        const b = await bytes(pick.href, { timeoutMs: 90000 });
        note(pick.href, b.ok);
        await pause(GAP);
        const isPdf = !!b.data && b.data.length > 4 && b.data[0] === 0x25 && b.data[1] === 0x50 && b.data[2] === 0x44 && b.data[3] === 0x46;
        if (b.data && !isPdf) console.log("  what came back is not a PDF (it does not begin %PDF): not read");
        const pages = isPdf ? await pdfPages(b.data as Uint8Array) : null;
        if (pages) { console.log(`  ${pages.length} pages; page 1: ${pages[0]?.slice(0, 200) ?? "–"}`); printPassages(pages, /green zone|yellow zone|red zone|four or fewer|five (to|or) (nine|more)|ten or more exceptions|250 (trading )?(days|observations)/i, 8); }
      }
    }
  }
}

// ---- §2.19: AIFMD's gross and commitment methods ----
head("9. Regulation (EU) No 231/2013, Articles 7 and 8: EUR-Lex's PDF format, then the Publications Office's address for the act");
{
  const EUR = "https://eur-lex.europa.eu", pdfUrl = `${EUR}/legal-content/EN/TXT/PDF/?uri=CELEX:32013R0231`;
  const show = (text: string): boolean => {
    let n = 0;
    for (const re of [/Article 7\s+Gross method[\s\S]{0,1400}/i, /Article 8\s+Commitment method[\s\S]{0,1400}/i]) { const m = text.match(re); if (m) { n++; console.log(`  | ${m[0].replace(/\s+/g, " ").slice(0, 1400)} …`); } }
    return n > 0;
  };
  let got = false;
  await gate(EUR, ["/legal-content/EN/TXT/PDF/"]);
  if (may(pdfUrl)) {
    const b = await bytes(pdfUrl, { headers: { accept: "application/pdf,*/*" }, timeoutMs: 90000 });
    note(pdfUrl, b.ok);
    await pause(GAP);
    const isPdf = !!b.data && b.data.length > 4 && b.data[0] === 0x25 && b.data[1] === 0x50 && b.data[2] === 0x44 && b.data[3] === 0x46;
    if (b.status === 202 || (b.data && !isPdf)) { console.log(`  EUR-Lex answered ${b.status} with ${b.type || "no type"}, not a PDF: its wait page for automated readers, as on 20 Nov`); note(pdfUrl, false); }
    const pages = isPdf ? await pdfPages(b.data as Uint8Array) : null;
    if (pages) { console.log(`  ${pages.length} pages`); got = show(pages.join(" ")); if (!got) console.log("  the headings of Articles 7 and 8 were not found in the PDF's text"); }
  }
  if (!got) {
    const OP = "https://publications.europa.eu", url = `${OP}/resource/celex/32013R0231`;
    await gate(OP, ["/resource/celex/32013R0231"]);
    if (may(url)) {
      const p = await page(url, { headers: { accept: "application/xhtml+xml, text/html;q=0.9", "accept-language": "eng, en;q=0.9" }, timeoutMs: 90000 });
      note(url, p.ok);
      await pause(GAP);
      if (p.ok) {
        const ls = textLines(p.html);
        console.log(`  title: ${titleOf(p.html) || "–"}; ${ls.length} lines of text; type ${p.type || "–"}`);
        got = show(ls.join("\n"));
        if (!got) { const a = ls.findIndex((l) => /^Article 7$/i.test(l)); if (a >= 0) { got = true; for (const l of ls.slice(a, a + 40)) console.log(`  | ${l.slice(0, 400)}`); } }
        if (!got) console.log("  the headings of Articles 7 and 8 were not found in what came back");
      }
    }
  }
  if (!got) console.log("  NOT READ: the macro book's adjusted gross stays B's method as B knows AIFMD's, labelled so (§2.19)");
}

console.log(`\nsites that refused a request, or answered it with a wait page: ${[...refused].map(([h, n]) => `${h} (${n})`).join(", ") || "none"}`);
console.log(`requests made: ${requestsMade()} (at most ${MAX}); ${Math.round((Date.now() - t0) / 1000)} s`);
