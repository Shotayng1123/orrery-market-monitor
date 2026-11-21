// The paper portfolio's probe of the benchmarks' free mirrors, the second run (P-0b: C/portfolio-plan.md §3.1b item 3
// with the PMs' additions of 21 Nov 2026): what the run of 20 Nov did not open (C/probes/pf_bench.log). Read then and
// not asked again: the iShares fund pages' links (each page links a latest-holdings.csv and a "Data Download Excel":
// l.53, l.71, l.89, l.126, l.143, l.161, l.177: the addresses used here are those lines'), SPY's holdings workbook and
// page, Nikkei's pages. Set aside by the owner's answer of 21 Nov 2026: JPX's TOPIX weight file, Nomura's holdings files,
// Cboe's VIX files (lib.ts refuses them); every other read of jpx.co.jp is in pf_jpx, held. For the issuers' files
// the owner's "personal use, credited" of 20 Nov stands (iShares, State Street), each read with its own terms: so
// HERE A SITE'S robots.txt AND TERMS ARE READ FIRST, and a site whose terms bar automated reading, or any re-use
// whatever the purpose, keeps its data files unread: that finding goes to the owner.
// Read-only, no key, no login, nothing written.
//   1. iShares (US): its terms, by its own link from a fund page; its product list again, for every field the list
//      has and the NAV, duration and fee of each candidate, and MLRG's row; MLRG's page: the index the issuer states
//      and since when (V-8); the latest-holdings.csv of EWJ, ACWI, IVV, EEM, EPP and IEUR (status, as-of date, header,
//      rows, countries: C-17) and of AGG and IAGG (does a line carry weight, currency, maturity, duration, sector and
//      country?); the "Data Download Excel" of EWJ, ACWI and MLRG: has it a NAV history and a distribution history?
//      EWJ's distributions of three years (V-7, beside Yahoo's events in pf_yahoo_funds' log);
//   2. iShares (UK): the London Global Aggregate fund (AGGU.L's fund), found by its name in the UK site's own product
//      list, never at a guessed product address: its page, its terms, its holdings file: the dollar share (V-14), and
//      the profile a bond file gives (weights by currency, sector and maturity, duration): the Fixed-income start
//      waits on one (P-4c);
//   3. State Street: its terms; SPY's NAV history workbook (navhist-us-en-spy.xlsx, linked on SPY's page: l.212);
//   4. Vanguard: BNDW's page once more, searched whole (it is built by scripts: 4 lines of text on 20 Nov) for the
//      fee and the index it states, and the data addresses it names (none is followed: its terms were not found);
//   5. BlackRock Japan: the iShares Core TOPIX ETF (1475), found by its name in the Japanese site's own product
//      list: its terms first, then its holdings file (V-9: a candidate for TOPIX's weights, not checked).
// Requests: at most 37, 1.5 s apart: ishares.com 20, blackrock.com 10, ssga.com 5, vanguard.com 2 (a site's terms
// take a second request where its first "legal" page is only a hub); a robots.txt that answers 429 is asked once more
// after the wait it names (60 s at most), so 41 at the very most.
// Runtime: deno (workbooks are opened with the package the server uses; under node they are only measured).
//   Actions > source-probe > Run workflow: probe = pf_bench, runtime = deno
import { bytes, cellText, decoded, head, linksOf, look, masked, page, pause, printLines, readTerms, requestsMade, robots, rowText, termsLink, textLines, titleOf, workbook, type Page, type Robots } from "./lib.ts";

const GAP = 1500, MAX = 37;
const t0 = Date.now();
console.log(`run at ${new Date(t0).toISOString().slice(0, 16).replace("T", " ")} UTC`);
async function get(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Page> { const p = await page(url, { timeoutMs: 45000, ...init }); await pause(GAP); return p; }

/** One CSV line as its cells (quoted cells may hold commas and doubled quotes). */
function csvCells(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}
const numOf = (s: string | undefined): number | null => { if (s == null) return null; const x = Number(s.replace(/[,%\s]/g, "")); return s.trim() !== "" && s.trim() !== "-" && Number.isFinite(x) ? x : null; };
const top = (m: Map<string, number>, n: number, unit = "%") => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k || "(blank)"} ${v.toFixed(2)}${unit}`).join(", ");

/** A fund's holdings file (iShares' CSV): its status, the lines before its header (the as-of date among them), the
 *  header, the rows, and what a line carries. For a bond file: the profile it gives. Returns the weight by currency. */
async function holdings(what: string, url: string, rb: Robots | null): Promise<Map<string, number> | null> {
  if (rb && !rb.allows(url)) { console.log(`  ${what}: not asked, robots.txt holds its path`); return null; }
  const b = await bytes(url, { timeoutMs: 90000 });
  await pause(GAP);
  if (!b.data) return null;
  let text = new TextDecoder("utf-8").decode(b.data);
  if ((text.match(/�/g) ?? []).length > 20) { try { text = new TextDecoder("shift_jis").decode(b.data); } catch { /* keep */ } }
  const ls = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (/^\s*<(!doctype|html)/i.test(ls[0] ?? "")) { console.log(`  ${what}: an HTML page came back in the file's place: not a holdings file`); return null; }
  const hi = ls.findIndex((l) => { const c = csvCells(l); return c.length >= 5 && c.some((x) => /^(Name|銘柄名|発行体名称?)$/i.test(x)) && c.some((x) => /Weight|Market Value|保有比率|構成比|時価/i.test(x)); });
  console.log(`  ${what}: ${ls.length} lines; before the header: ${ls.slice(0, Math.max(0, Math.min(hi < 0 ? 6 : hi, 9))).map((l) => l.slice(0, 80)).join(" · ") || "–"}`);
  if (hi < 0) { console.log(`  no header line found; the first five lines: ${ls.slice(0, 5).map((l) => l.slice(0, 120)).join(" · ")}`); return null; }
  const H = csvCells(ls[hi]), rows = ls.slice(hi + 1).map(csvCells).filter((c) => c.length >= H.length - 2 && c.length >= 5);
  const col = (re: RegExp) => H.findIndex((h) => re.test(h));
  const iW = col(/^Weight|保有比率|構成比/i), iAC = col(/^Asset Class|資産クラス/i), iLoc = col(/^Location|国・地域|国$/i), iCur = col(/^Market Currency/i) >= 0 ? col(/^Market Currency/i) : col(/^Currency|通貨/i), iSec = col(/^Sector|セクター|業種/i), iMat = col(/^Maturity|償還/i), iDur = col(/^Mod\. Duration/i) >= 0 ? col(/^Mod\. Duration/i) : col(/^Duration|デュレーション/i);
  console.log(`  header (${H.length} columns): ${H.join(" | ").slice(0, 600)}`);
  console.log(`  ${rows.length} rows; a line carries: weight ${iW >= 0 ? "yes" : "NO"}, currency ${iCur >= 0 ? `yes (${H[iCur]})` : "NO"}, maturity ${iMat >= 0 ? "yes" : "no"}, duration ${iDur >= 0 ? `yes (${H[iDur]})` : "no"}, sector ${iSec >= 0 ? "yes" : "no"}, country ${iLoc >= 0 ? `yes (${H[iLoc]})` : "no"}`);
  console.log(`  the first two rows: ${rows.slice(0, 2).map((c) => c.join(" | ").slice(0, 260)).join(" · ")}`);
  const by = (i: number) => { const m = new Map<string, number>(); if (i >= 0 && iW >= 0) for (const c of rows) { const w = numOf(c[iW]); if (w != null) m.set(c[i] ?? "", (m.get(c[i] ?? "") ?? 0) + w); } return m; };
  const total = iW >= 0 ? rows.reduce((a, c) => a + (numOf(c[iW]) ?? 0), 0) : null;
  if (total != null) console.log(`  the weights sum to ${total.toFixed(2)}%${iAC >= 0 ? `; by asset class: ${top(by(iAC), 8)}` : ""}`);
  if (iLoc >= 0 && iW >= 0) { const m = by(iLoc); console.log(`  by country (${m.size}): ${top(m, 30)}`); }
  const cur = by(iCur);
  if (cur.size) console.log(`  by currency (${cur.size}): ${top(cur, 12)}${iDur >= 0 && total ? ` · THE DOLLAR SHARE (V-14): ${(cur.get("USD") ?? 0).toFixed(2)}% of ${total.toFixed(2)}%` : ""}`);
  if (iDur >= 0 && iW >= 0) {
    // a bond file's profile: weights by sector and maturity, duration in all and by currency
    let wd = 0, ww = 0; const dc = new Map<string, number>();
    for (const c of rows) { const w = numOf(c[iW]), d = numOf(c[iDur]); if (w == null || d == null) continue; wd += w * d; ww += w; if (iCur >= 0) dc.set(c[iCur] ?? "", (dc.get(c[iCur] ?? "") ?? 0) + w * d / 100); }
    console.log(`  duration (${H[iDur]}), weight-averaged over the ${ww.toFixed(1)}% of lines that carry one: ${ww ? (wd / ww).toFixed(2) : "–"} years${dc.size ? `; its contribution by currency, in years: ${top(dc, 8, "")}` : ""}`);
    if (iSec >= 0) console.log(`  by sector: ${top(by(iSec), 10)}`);
    if (iMat >= 0) {
      const asOf = Date.parse((ls.slice(0, hi).join(" ").match(/as of[^A-Za-z0-9]*"?([A-Za-z]{3,9}\.? \d{1,2}, \d{4}|\d{1,2}[-/][A-Za-z]{3}[-/]\d{4}|\d{4}-\d{2}-\d{2})/i)?.[1]) ?? "") || t0;
      const bk = new Map<string, number>(), name = (y: number) => (y < 1 ? "under 1y" : y < 3 ? "1–3y" : y < 5 ? "3–5y" : y < 7 ? "5–7y" : y < 10 ? "7–10y" : y < 20 ? "10–20y" : "20y and over");
      let undated = 0;
      for (const c of rows) { const w = numOf(c[iW]), t = Date.parse(c[iMat] ?? ""); if (w == null) continue; if (!Number.isFinite(t)) { undated += w; continue; } const k = name((t - asOf) / (365.25 * 86400e3)); bk.set(k, (bk.get(k) ?? 0) + w); }
      console.log(`  by years to maturity: ${["under 1y", "1–3y", "3–5y", "5–7y", "7–10y", "10–20y", "20y and over"].map((k) => `${k} ${(bk.get(k) ?? 0).toFixed(2)}%`).join(", ")}; with no maturity date ${undated.toFixed(2)}%`);
    }
  }
  return cur;
}

/** Rows of a workbook's sheets; an Excel 2003 XML sheet the package does not open is read by its tags. */
async function sheetsOf(data: Uint8Array): Promise<Array<{ name: string; rows: unknown[][] }> | null> {
  const lead = new TextDecoder("utf-8").decode(data.slice(0, 400));
  if (/<\?xml|<ss:Workbook|<Workbook/i.test(lead)) {
    const xml = new TextDecoder("utf-8").decode(data);
    const out = [...xml.matchAll(/<(?:ss:)?Worksheet\b[^>]*?(?:ss:)?Name="([^"]*)"[^>]*>([\s\S]*?)<\/(?:ss:)?Worksheet>/g)].map((m) => ({ name: decoded(m[1]), rows: [...m[2].matchAll(/<(?:ss:)?Row\b[\s\S]*?<\/(?:ss:)?Row>/g)].map((r) => [...r[0].matchAll(/<(?:ss:)?Data\b[^>]*>([\s\S]*?)<\/(?:ss:)?Data>/g)].map((c) => decoded(c[1].replace(/<[^>]+>/g, "")) as unknown)).filter((r) => r.some((c) => cellText(c) !== "")) }));
    if (out.length) { console.log("  (an Excel 2003 XML workbook, read by its tags)"); return out; }
  }
  return workbook(data);
}
/** A fund's data workbook: its sheets; for a sheet of a NAV history or of distributions, its header, its newest and
 *  oldest rows; with `distYears`, the distributions since that many years ago, row by row. */
async function fundBook(what: string, url: string, rb: Robots | null, distYears = 0): Promise<void> {
  if (rb && !rb.allows(url)) { console.log(`  ${what}: not asked, robots.txt holds its path`); return; }
  const b = await bytes(url, { timeoutMs: 120000 });
  await pause(GAP);
  if (!b.data) return;
  const wb = await sheetsOf(b.data);
  if (!wb) { console.log(`  ${what}: not opened; its first 200 characters: ${JSON.stringify(new TextDecoder("utf-8").decode(b.data.slice(0, 200)))}`); return; }
  console.log(`  ${what}: ${wb.length} sheets: ${wb.map((s) => `${s.name} (${s.rows.length} rows)`).join(", ")}`);
  const dateOf = (v: unknown): number => { const s = cellText(v); const n = Number(s); if (s !== "" && Number.isFinite(n) && n > 20000 && n < 80000) return (n - 25569) * 86400e3; const t = Date.parse(s); return Number.isFinite(t) ? t : NaN; };
  for (const s of wb.slice(0, 8)) {
    const hi = s.rows.findIndex((r) => r.filter((c) => cellText(c) !== "").length >= 2 && r.some((c) => /date|as of|日付/i.test(cellText(c))));
    const isNav = /histor|nav|price|基準価額/i.test(s.name) || (hi >= 0 && s.rows[hi].some((c) => /^nav|nav per share|net asset value/i.test(cellText(c))));
    const isDist = /distribut|dividend|分配/i.test(s.name);
    if (!isNav && !isDist) { console.log(`   "${s.name}": ${s.rows.slice(0, 2).map((r) => rowText(r, 160)).join(" · ")}`); continue; }
    const body = hi >= 0 ? s.rows.slice(hi + 1).filter((r) => Number.isFinite(dateOf(r[0]))) : [];
    const ts = body.map((r) => dateOf(r[0])).sort((a, b) => a - b), d = (t: number) => new Date(t).toISOString().slice(0, 10);
    console.log(`   "${s.name}" (${isDist ? "DISTRIBUTIONS" : "NAV HISTORY"}): header ${hi >= 0 ? rowText(s.rows[hi], 300) : "not found"}; ${body.length} dated rows${ts.length ? `, ${d(ts[0])} to ${d(ts[ts.length - 1])}` : ""}; the first ${rowText(body[0] ?? [], 200)}; the last ${rowText(body[body.length - 1] ?? [], 200)}`);
    if (isDist && distYears) {
      const since = t0 - distYears * 365.25 * 86400e3, recent = body.filter((r) => dateOf(r[0]) >= since).sort((x, y) => dateOf(x[0]) - dateOf(y[0]));
      console.log(`     the distributions since ${d(since)}, the first column read as a date (${recent.length}): ${recent.map((r) => `${d(dateOf(r[0]))}: ${r.slice(1, 6).map(cellText).join(" | ")}`).join("; ") || "none"}`);
    }
  }
}
/** For each label of a fund page: the line that carries it and the line after it (where the page prints the value). */
function labelled(ls: string[], labels: RegExp, max = 14): void {
  const seen = new Set<string>();
  let n = 0;
  ls.forEach((l, i) => {
    if (!labels.test(l) || l.length > 90 || n >= max) return;
    const out = `${l}  ->  ${(ls[i + 1] ?? "").slice(0, 160)}`;
    if (seen.has(out)) return;
    seen.add(out); n++;
    console.log(`  | ${masked(out.slice(0, 260))}`);
  });
  if (!n) console.log("  no label of those looked for is on the page");
}
const LABELS = /^(Benchmark Index|Index|Expense Ratio|Net Expense Ratio|Gross Expense Ratio|Management Fee|Fund Inception|Inception Date|Number of Holdings|NAV as of|Net Assets( of Fund)?( as of)?|Distribution Frequency|Effective Duration|Weighted Avg Maturity|30 Day SEC Yield|Total Expense Ratio|Ongoing Charges?( Figure)?|Use of Income|Fund Base Currency|Share Class Currency|Benchmark Ticker|連動対象指標|信託報酬|ベンチマーク|純資産総額|設定日)(?![A-Za-z])/i;
const ISH = "https://www.ishares.com", BLK = "https://www.blackrock.com";
type Item = Record<string, unknown>;
const itemsOf = (text: string): Item[] => { let j: unknown = null; try { j = JSON.parse(text); } catch { /* none */ } return j && typeof j === "object" ? Object.values(j as Record<string, unknown>).filter((v): v is Item => !!v && typeof v === "object" && !Array.isArray(v)) : []; };
const show = (v: unknown) => (v && typeof v === "object" ? JSON.stringify((v as { d?: unknown; r?: unknown }).d ?? (v as { r?: unknown }).r ?? v).slice(0, 60) : String(v).slice(0, 80));
const pageUrlOf = (o: Item, base: string): string | null => { const u = Object.values(o).find((v) => typeof v === "string" && /\/products\/\d+/.test(v)) as string | undefined; return u ? new URL(u, base).toString() : null; };
/** The address of a site's product-list data as its own list page names it. */
const screenerIn = (html: string, base: string): string | null => { const m = html.match(/["']([^"'<>\s]*product-screener[^"'<>\s]*\.jsn[^"'<>\s]*)["']/i); try { return m ? new URL(decoded(m[1]).replace(/\\u0026/g, "&").replace(/\\\//g, "/"), base).toString() : null; } catch { return null; } };

// ---- 1. iShares, US ----
head("1. iShares (US): robots.txt, then a fund page for the site's own terms link (IAGG's, whose page the first run did not read)");
const rbIsh = await robots(ISH, ["/us/products/239665/ishares-msci-japan-etf/latest-holdings.csv", "/us/product-screener/product-screener-v3.1.jsn", "/uk/individual/en/products/etf-investments"]);
await pause(GAP);
const LOGGED: Record<string, string> = {   // from pf_bench.log of 20 Nov: each page's own "Download latest fund holdings" link
  EWJ: `${ISH}/us/products/239665/ishares-msci-japan-etf/latest-holdings.csv`, ACWI: `${ISH}/us/products/239600/ishares-msci-acwi-etf/latest-holdings.csv`,
  IVV: `${ISH}/us/products/239726/ishares-core-s-p-500-etf/latest-holdings.csv`, EEM: `${ISH}/us/products/239637/ishares-msci-emerging-markets-etf/latest-holdings.csv`,
  EPP: `${ISH}/us/products/239674/ishares-msci-pacific-ex-japan-etf/latest-holdings.csv`, IEUR: `${ISH}/us/products/264617/ishares-core-msci-europe-etf/latest-holdings.csv`,
  AGG: `${ISH}/us/products/239458/ishares-core-u-s-aggregate-bond-etf/latest-holdings.csv`,
};
const download = (portfolioId: string) => `${BLK}/varnish-api/blk-one01-product-data/product-data/api/v1/get-fund-document?appType=PRODUCT_PAGE&appSubType=ISHARES&targetSite=us-ishares&locale=en_US&portfolioId=${portfolioId}&component=fundDownload&userType=individual`;   // the pages' own "Data Download Excel" link, as that log prints it
let ishBarred = false, ishTerms = false, iaggHoldings: string | null = null, mlrgDownload: string | null = null;
let rbBlkOnce: Robots | null = null;
/** blackrock.com's robots.txt, read once (the iShares pages' Data Download and BlackRock Japan's site are both on it). */
const blackrock = async (): Promise<Robots> => { if (!rbBlkOnce) { rbBlkOnce = await robots(BLK, ["/varnish-api/blk-one01-product-data/product-data/api/v1/get-fund-document", "/jp/individual/ja/products/product-list"]); await pause(GAP); } return rbBlkOnce; };
const IAGG_PAGE = `${ISH}/us/products/279626/ishares-core-international-aggregate-bond-etf`;   // the product list's address for it on 20 Nov (pf_bench.log l.30)
if (!rbIsh.allows(IAGG_PAGE)) console.log("  not asked: robots.txt holds the fund pages");
else {
  const p = await get(IAGG_PAGE);
  if (p.ok) {
    const ls = textLines(p.html);
    console.log(`  title: ${titleOf(p.html) || "–"}; ${ls.length} lines of text`);
    labelled(ls, LABELS);
    iaggHoldings = linksOf(p.html, p.final).find((l) => /latest-holdings\.csv|fileType=csv.*holding/i.test(l.href))?.href ?? null;
    console.log(`  its holdings file: ${iaggHoldings ? masked(iaggHoldings) : "no link found"}`);
    head("1a. iShares (US): its terms, by the page's own link");
    const t = await readTerms(p, { allows: (u) => rbIsh.allows(u), gapMs: GAP });
    ishTerms = t.read; ishBarred = t.barred;
  }
}
// The owner's "personal use, credited" of 20 Nov covers the iShares and State Street files (and stood on 21 Nov): they
// are read unless their own terms, read here, bar it. Terms not found is said, and is not a bar.
const ishGo = !ishBarred && rbIsh.outcome !== "unreachable" && rbIsh.outcome !== "busy";
if (ishBarred) console.log("\n  iShares' data files are NOT opened in this run: its terms carry a line that bars automated reading or re-use (above): FOR THE OWNER");
else if (!ishGo) console.log("\n  iShares' data files are not asked in this run: its robots.txt could not be read");
else if (!ishTerms) console.log("\n  iShares' terms proper were not found by its page's links; its files are read under the owner's \"personal use, credited\" of 20 Nov, which named the iShares files");

if (ishGo) {
  head("1b. iShares (US): the product list: every field it has; each candidate's NAV, duration, fee and page");
  const WANT = ["EWJ", "HEWJ", "ACWI", "IVV", "EEM", "EPP", "IEUR", "MLRG", "AGG", "IAGG", "SHY", "IEI", "IEF", "TLH", "TLT", "LQD", "MBB", "IGOV", "HYG", "EMB", "TIP", "FLOT"];
  const url = `${ISH}/us/product-screener/product-screener-v3.1.jsn?dcrPath=/templatedata/config/product-screener-v3/data/en/us-ishares/ishares-product-screener-backend-config&siteEntryPassthrough=true`;
  let mlrgPage: string | null = null;
  if (rbIsh.allows(url)) {
    const r = await look(url, { headers: { accept: "application/json" }, show: 0, timeoutMs: 60000 });
    await pause(GAP);
    const items = itemsOf(r.text);
    console.log(`  ${items.length} products${items[0] ? `; a product's ${Object.keys(items[0]).length} fields: ${Object.keys(items[0]).join(", ")}` : ""}`);
    const KEEP = /^(fees|ter|netr|mgt|navAmount|navAmountAsOf|effectiveDuration|modelOad|cleanDuration|inceptionDate|aladdinAssetClass|aladdinCountry|aladdinRegion|investmentStyle|productView|portfolioId)$|benchmark|index/i;
    for (const t of WANT) {
      const o = items.find((x) => String(x.localExchangeTicker ?? "").toUpperCase() === t);
      if (!o) { console.log(`  ${t}: not in the list`); continue; }
      if (t === "MLRG") mlrgPage = pageUrlOf(o, ISH);
      console.log(`  ${t}: ${o.fundName ?? "–"} · ${Object.entries(o).filter(([k, v]) => KEEP.test(k) && v != null && v !== "" && v !== "-").map(([k, v]) => `${k} ${show(v)}`).join(", ")} · ${pageUrlOf(o, ISH)?.replace(ISH, "") ?? "no page address"}`);
    }
  }
  head("1c. iShares (US): MLRG's page: the index its issuer states, and since when (V-8)");
  if (mlrgPage && rbIsh.allows(mlrgPage)) {
    const p = await get(mlrgPage);
    if (p.ok) {
      const ls = textLines(p.html);
      console.log(`  title: ${titleOf(p.html) || "–"}; ${ls.length} lines of text`);
      labelled(ls, LABELS);
      console.log("  lines on a change of the fund's index or name:");
      printLines(ls.filter((l) => l.length < 600), /(prior to|before|until|effective|as of|on or about|formerly|previously)[^.]{0,160}(index|benchmark|fund name|ticker)|(index|benchmark)[^.]{0,120}(changed|replaced|prior to|formerly|effective)/i, 6);
      const links = linksOf(p.html, p.final), dl = links.find((l) => /fundDownload|Data Download/i.test(`${l.href} ${l.text}`));
      if (dl) mlrgDownload = dl.href;
      console.log(`  its Data Download: ${mlrgDownload ? masked(mlrgDownload) : "no link found"}; its holdings file: ${masked(links.find((l) => /latest-holdings\.csv/i.test(l.href))?.href ?? "no link found")}`);
    }
  } else console.log("  MLRG's page address was not found in the list");

  head("1d. iShares (US): the latest-holdings.csv of EWJ, ACWI, IVV, EEM, EPP and IEUR (members, weights, countries), and of AGG and IAGG (a bond file's columns)");
  for (const t of ["EWJ", "ACWI", "IVV", "EEM", "EPP", "IEUR", "AGG"]) await holdings(`${t}'s holdings file`, LOGGED[t], rbIsh);
  if (iaggHoldings) await holdings("IAGG's holdings file", iaggHoldings, rbIsh); else console.log("  IAGG: no holdings link was found on its page");

  head("1e. The \"Data Download Excel\" of EWJ, ACWI and MLRG (blackrock.com): a NAV history? a distribution history? EWJ's distributions of three years (V-7)");
  const rbBlk = await blackrock();
  await fundBook("EWJ's Data Download", download("239665"), rbBlk, 3);
  await fundBook("ACWI's Data Download", download("239600"), rbBlk);
  if (mlrgDownload) await fundBook("MLRG's Data Download (its NAV total-return file, V-8)", mlrgDownload, /blackrock\.com/.test(mlrgDownload) ? rbBlk : rbIsh, 10); else console.log("  MLRG: no Data Download link was found on its page: not asked");

}

// ---- 2. iShares, UK: a site of its own, with its own terms ----
head("2. iShares (UK): the London Global Aggregate fund, found by its name in the UK site's own product list");
{
  const ukList = `${ISH}/uk/individual/en/products/etf-investments`;
  if (rbIsh.allows(ukList)) {
    const lp = await get(`${ukList}?switchLocale=y&siteEntryPassthrough=true`);
    if (lp.ok) {
      const ls = textLines(lp.html), sc = screenerIn(lp.html, lp.final);
      console.log(`  title: ${titleOf(lp.html) || "–"}; ${ls.length} lines of text; the product list's data address named in the page: ${sc ? masked(sc) : "none"}`);
      if (!sc) printLines(ls, /important information|professional|individual investor|accept|terms/i, 6);
      head("2a. iShares (UK): its terms, by the list page's own link (before its product list's data is read)");
      const t0 = await readTerms(lp, { allows: (x) => rbIsh.allows(x), gapMs: GAP });
      if (t0.barred) console.log("  the UK site's terms bar automated reading or re-use (above): its product list and the fund's holdings file are not opened; FOR THE OWNER");
      head("2b. iShares (UK): the fund in the product list, and its page");
      const r = sc && rbIsh.allows(sc) && !t0.barred ? await look(sc, { headers: { accept: "application/json" }, show: 0, timeoutMs: 60000 }) : null;
      if (r) await pause(GAP);
      const items = r ? itemsOf(r.text) : [];
      const hits = items.filter((o) => /core global aggregate bond/i.test(String(o.fundName ?? "")));
      if (r) console.log(`  ${items.length} products; named "Core Global Aggregate Bond": ${hits.slice(0, 8).map((o) => `${o.fundName ?? "–"} (${o.localExchangeTicker ?? "–"}${o.investorClassName ? `, ${show(o.investorClassName)}` : ""})`).join(" · ") || "none"}`);
      const pick = hits.find((o) => /AGGU/i.test(String(o.localExchangeTicker ?? ""))) ?? hits.find((o) => /usd.{0,3}hedged/i.test(JSON.stringify(o))) ?? hits[0];
      const fp = pick ? pageUrlOf(pick, ISH) : null;
      if (pick) console.log(`  taken: ${pick.fundName} (${pick.localExchangeTicker ?? "–"}) · ${Object.entries(pick).filter(([k, v]) => /^(fees|ter|navAmount|navAmountAsOf|effectiveDuration|modelOad|inceptionDate)$|benchmark|index/i.test(k) && v != null && v !== "").map(([k, v]) => `${k} ${show(v)}`).join(", ")} · ${fp?.replace(ISH, "") ?? "no page address"}`);
      if (fp && rbIsh.allows(fp)) {
        const u = new URL(fp); u.searchParams.set("switchLocale", "y"); u.searchParams.set("siteEntryPassthrough", "true");
        const p = await get(u.toString());
        if (p.ok) {
          const pl = textLines(p.html);
          console.log(`  title: ${titleOf(p.html) || "–"}; ${pl.length} lines of text`);
          labelled(pl, LABELS);
          // the terms, from the fund's page where the list page linked none
          const t = t0.read ? t0 : await readTerms(p, { allows: (x) => rbIsh.allows(x), gapMs: GAP });
          const h = linksOf(p.html, p.final).find((l) => /fileType=csv[^"']*holding|holdings[^"']*fileType=csv|latest-holdings\.csv/i.test(l.href));
          head("2c. iShares (UK): the fund's holdings file: the dollar share (V-14) and the Global Aggregate's profile (P-4c)");
          if (!h) console.log("  no holdings file is linked on the page");
          else if (t.barred) console.log(`  linked (${masked(h.href)}), but the UK site's terms bar it (above): not opened; FOR THE OWNER`);
          else if (!t.read) console.log(`  linked (${masked(h.href)}), but the UK site's terms were not found: not opened (a site this probe has not read before)`);
          else await holdings("the London fund's holdings file", h.href, rbIsh);
        }
      } else if (hits.length) console.log("  no page address for it in the list");
    }
  }
}

// ---- 3. State Street ----
head("3. State Street: its terms; SPY's NAV history workbook (linked on SPY's page: pf_bench.log l.212)");
{
  const SSGA = "https://www.ssga.com", file = "/library-content/products/fund-data/etfs/us/navhist-us-en-spy.xlsx";
  const rb = await robots(SSGA, [file, "/us/en/intermediary"]);
  await pause(GAP);
  const hp = rb.allows("/us/en/intermediary") ? await get(`${SSGA}/us/en/intermediary`) : null;
  const t = hp?.ok ? await readTerms(hp, { allows: (x) => rb.allows(x), gapMs: GAP }) : { read: false, barred: false };
  if (!rb.allows(file)) console.log("  not asked: robots.txt holds the NAV file's path");
  else if (t.barred) console.log("  its terms bar it (above): the NAV file is not opened; FOR THE OWNER");
  else {
    if (!t.read) console.log("  State Street's terms proper were not found by its home page's links (a footer may be drawn by scripts); its NAV file is read under the owner's \"personal use, credited\" of 20 Nov, as its holdings workbook was");
    await fundBook("SPY's NAV history", SSGA + file, rb);
  }
}

// ---- 4. Vanguard ----
head("4. Vanguard: BNDW's page, searched whole for the fee and the index it states (V-14; its \"near index\" label)");
{
  const V = "https://investor.vanguard.com", path = "/investment-products/etfs/profile/bndw";
  const rb = await robots(V, [path]);
  await pause(GAP);
  if (rb.allows(path)) {
    const p = await get(V + path);
    if (p.ok) {
      const raw = decoded(decoded(p.html)).replace(/\\u0026/g, "&").replace(/\\"/g, '"').replace(/<\\\//g, "</");
      const snippets = new Set<string>();
      for (const re of [/expense ratio[^<>{}]{0,120}/gi, /"expenseRatio"\s*:\s*"?[\d.]+%?"?/gi, /"?(benchmark|primaryBenchmark|benchmarkName|indexName)"?\s*[:=]\s*"[^"]{3,160}"/gi, /Bloomberg[^<>"{}]{0,120}Index[^<>"{}]{0,80}/gi, /seeks to track[^<>"{}]{0,260}/gi])
        for (const m of raw.matchAll(re)) { if (snippets.size >= 14) break; snippets.add(m[0].replace(/\s+/g, " ").slice(0, 300)); }
      console.log(`  title: ${titleOf(p.html) || "–"}; ${p.bytes} bytes, ${textLines(p.html).length} lines of visible text; passages in the page's source that name the fee or the index: ${snippets.size}`);
      for (const x of snippets) console.log(`  | ${masked(x)}`);
      const apis = [...new Set([...raw.matchAll(/["'`]((?:https?:\/\/[^"'`\s]+)?\/[^"'`\s]*\/api\/[^"'`\s]*)["'`]/g)].map((m) => m[1]))].slice(0, 10);
      console.log(`  data addresses the page's source names (none is followed: Vanguard's terms were not found on 20 Nov): ${apis.map((x) => masked(x)).join(" · ") || "none"}`);
      const t = termsLink(p.html, p.final);
      if (!t) console.log("  and no terms link is in this page's HTML either");
    }
  }
}

// ---- 5. BlackRock Japan: the iShares Core TOPIX ETF (1475) ----
head("5. BlackRock Japan: the iShares Core TOPIX ETF (1475), found in the Japanese site's own product list; its terms first (V-9)");
{
  const rb = await blackrock();
  const listUrl = `${BLK}/jp/individual/ja/products/product-list`;
  if (rb.allows(listUrl)) {
    const lp = await get(`${listUrl}?switchLocale=y&siteEntryPassthrough=true`);
    if (lp.ok) {
      const sc = screenerIn(lp.html, lp.final);
      console.log(`  title: ${titleOf(lp.html) || "–"}; ${textLines(lp.html).length} lines of text; the product list's data address named in the page: ${sc ? masked(sc) : "none"}`);
      head("5a. BlackRock Japan: its terms, by the page's own link");
      const t = await readTerms(lp, { allows: (x) => rb.allows(x), gapMs: GAP });
      const ok = t.read && !t.barred;
      head("5b. BlackRock Japan: 1475 in the list, its page, its holdings file");
      const r = sc && rb.allows(sc) && ok ? await look(sc, { headers: { accept: "application/json" }, show: 0, timeoutMs: 60000 }) : null;
      if (r) await pause(GAP);
      if (!ok) console.log(`  the site's terms ${t.barred ? "bar automated reading or re-use (above): FOR THE OWNER" : "were not found (a site this probe has not read before)"}: its list and its holdings file are not opened`);
      const items = r ? itemsOf(r.text) : [];
      const o = items.find((x) => String(x.localExchangeTicker ?? "") === "1475") ?? items.find((x) => /TOPIX/i.test(String(x.fundName ?? "")) && /コア|core/i.test(String(x.fundName ?? "")));
      if (r) console.log(`  ${items.length} products; 1475: ${o ? `${o.fundName ?? "–"} · ${Object.entries(o).filter(([k, v]) => /^(fees|ter|navAmount|navAmountAsOf|inceptionDate)$|benchmark|index/i.test(k) && v != null && v !== "").map(([k, v]) => `${k} ${show(v)}`).join(", ")}` : "not in the list"}`);
      const fp = o ? pageUrlOf(o, BLK) : null;
      if (fp && rb.allows(fp)) {
        const u = new URL(fp); u.searchParams.set("switchLocale", "y"); u.searchParams.set("siteEntryPassthrough", "true");
        const p = await get(u.toString());
        if (p.ok) {
          const pl = textLines(p.html);
          console.log(`  title: ${titleOf(p.html) || "–"}; ${pl.length} lines of text`);
          labelled(pl, LABELS);
          const h = linksOf(p.html, p.final).find((l) => /fileType=csv[^"']*holding|holdings[^"']*fileType=csv|latest-holdings\.csv/i.test(l.href)) ?? linksOf(p.html, p.final).find((l) => /保有銘柄|構成銘柄/.test(l.text) && /csv|ajax/i.test(l.href));
          if (h) await holdings("1475's holdings file", h.href, rb); else console.log("  no holdings file is linked on the page");
        }
      }
    }
  }
}

console.log(`\nrequests made: ${requestsMade()} (at most ${MAX}); ${Math.round((Date.now() - t0) / 1000)} s`);
