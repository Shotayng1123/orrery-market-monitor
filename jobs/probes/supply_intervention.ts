// B-17 (supply: Treasury and JGB auctions, QT) and B-19 (Japan's intervention record), no key.
//   - US Treasury, FiscalData "Treasury Securities Auctions Data" (v1/accounting/od/auctions_query; FiscalData's
//     host answered GitHub's machines on 19 Nov): the six newest note and bond auctions, the fields named like high
//     yield, bid-to-cover, indirect, direct, dealer, offering amount and tail printed by name.
//   - TreasuryDirect's securities web service, "announced" (upcoming auctions; the service is documented at
//     treasurydirect.gov/webapis/webapisecurities.htm, with a copy on slgs.gov: formats "xhtml, json, jsonp", "Max 250
//     results"; the address TA_WS/securities/announced?format=json is the one a data.gov record gives; search
//     extracts). Its terms page: "offered subject to your acceptance of the terms and conditions (Agreement)
//     contained herein" (treasurydirect.gov/legal-information/developers/web-api-terms); no rate limit was found there.
//   - New York Fed Markets API, SOMA holdings summary (soma/summary.json: a candidate endpoint; the API answered
//     GitHub's machines on 19 Nov for rates and repo).
//   - MOF, JGB auctions: the auction calendar page (a candidate address) for its links to results pages, whose
//     addresses follow jgbs/auction/calendar/nyusatsu/resul<yyyymmdd>.htm (seen in search results), and the newest
//     one's 応募額, 募入決定額, 募入最低価格, 募入平均価格 and 募入平均利回り (bid-to-cover and tail are worked out from them).
//   - MOF, foreign exchange intervention (外国為替平衡操作の実施状況): the data index page (feio/data/index.html: "日次ベース
//     (四半期公表)"), the quarterly page (feio/data/quarter/index.html) and the first data file it links; a monthly page
//     exists too (feio/data/monthly/index.html), by search extracts.
// Serves: B-17 (UST and JGB auctions ahead and results; the Fed's run-off), B-10 (SOMA beside H.4.1: I-16), B-19
// (intervention days and amounts on USD/JPY's chart), B-12 (auctions in the calendar).
// Terms: FiscalData: no key, by third-party pages (its own documentation page was not read); MOF: not read.
// No key, no secret, nothing written; eight requests at most, 0.7 s apart. Workbooks are opened only under Deno.
// Runtime: deno (a job on GitHub; auctions and intervention data come out on known days).
//   Actions > source-probe > Run workflow: probe = supply_intervention, runtime = deno
import { head, look, masked, UA } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const J = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };
const strip = (s: string) => s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const anchors = (html: string, base: string): Array<[string, string]> => [...html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  .map((m): [string, string] => { try { return [new URL(m[1].replace(/&amp;/g, "&"), base).toString(), strip(m[2])]; } catch { return ["", ""]; } })
  .filter(([u]) => u !== "");
const GAP = 700;
const A = { headers: { accept: "application/json" }, show: 0, timeoutMs: 60000 };
/** Every object in a JSON answer, depth first. */
function objects(x: unknown, out: Array<Record<string, unknown>> = [], depth = 0): Array<Record<string, unknown>> {
  if (depth > 10 || x === null || typeof x !== "object") return out;
  if (Array.isArray(x)) { for (const v of x) objects(v, out, depth + 1); return out; }
  const o = x as Record<string, unknown>;
  out.push(o);
  for (const v of Object.values(o)) objects(v, out, depth + 1);
  return out;
}
const flat = (o: Record<string, unknown>): string => Object.entries(o).filter(([, v]) => v === null || typeof v !== "object").map(([k, v]) => `${k}=${String(v)}`).join("; ");

const FD = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";
head("FiscalData: Treasury securities auctions, the six newest note and bond auctions");
{
  const q = `filter=${encodeURIComponent("security_type:in:(Note,Bond)")}&sort=-auction_date&${encodeURIComponent("page[size]")}=6`;
  const r = await look(`${FD}/v1/accounting/od/auctions_query?${q}`, A);
  const j = J(r.text) as { data?: Array<Record<string, unknown>>; meta?: Record<string, unknown> } | null;
  const rows = j?.data ?? [];
  if (rows[0]) console.log(`  ${Object.keys(rows[0]).length} fields: ${Object.keys(rows[0]).join(", ")}`);
  for (const x of rows) {
    const named = Object.entries(x).filter(([k]) => /yield|cover|indirect|direct|dealer|offering|tail/i.test(k)).map(([k, v]) => `${k}=${String(v)}`).join("; ");
    console.log(`  ${String(x.auction_date)} ${String(x.security_type)} ${String(x.security_term)} | ${named.slice(0, 420)}`);
  }
  if (j) console.log(`  rows in the dataset: ${String(j.meta?.["total-count"] ?? "?")}`);
  else if (r.text) console.log(`  ${r.text.slice(0, 300)}`);
}

await pause(GAP);
head("TreasuryDirect: securities announced and not yet auctioned (TA_WS/securities/announced, JSON)");
{
  const r = await look("https://www.treasurydirect.gov/TA_WS/securities/announced?format=json", { ...A, show: 200 });
  const j = J(r.text);
  const rows = Array.isArray(j) ? (j as Array<Record<string, unknown>>) : objects(j).filter((o) => "cusip" in o || "securityTerm" in o);
  console.log(`  ${rows.length} securities`);
  if (rows[0]) console.log(`  fields: ${Object.keys(rows[0]).slice(0, 40).join(", ")}`);
  for (const x of rows.slice(0, 10)) {
    const pick = ["securityType", "securityTerm", "announcementDate", "auctionDate", "issueDate", "offeringAmount", "cusip"].map((k) => `${k}=${String(x[k] ?? "–")}`).join("; ");
    console.log(`  ${pick}`);
  }
}

await pause(GAP);
head("New York Fed: SOMA holdings, summary (candidate endpoint soma/summary.json)");
{
  const r = await look("https://markets.newyorkfed.org/api/soma/summary.json", { ...A, show: 200 });
  const j = J(r.text);
  if (j !== null) {
    const rows = objects(j).filter((o) => Object.keys(o).some((k) => /date/i.test(k)));
    console.log(`  ${rows.length} dated entries; the last 3:`);
    for (const x of rows.slice(-3)) console.log(`  ${flat(x).slice(0, 300)}`);
  }
}

const MOF = "https://www.mof.go.jp";
await pause(GAP);
head("MOF: the JGB auction calendar page (candidate address), its links to results pages");
let newestResult = "";
{
  const url = `${MOF}/jgbs/auction/calendar/index.htm`;
  const r = await look(url, { show: 0 });
  if (r.ok) {
    const ls = [...new Set(anchors(r.text, url).map(([u]) => u).filter((u) => /resul\d{8}[a-z]?\.htm/i.test(u)))].sort();
    console.log(`  ${ls.length} results pages linked; the last 6:\n  ${ls.slice(-6).join("\n  ")}`);
    newestResult = ls[ls.length - 1] ?? "";
    const text = strip(r.text);
    const dates = [...text.matchAll(/令和\d+年\d+月\d+日|\d{1,2}月\d{1,2}日/g)].map((m) => m[0]);
    console.log(`  ${dates.length} dates in the page's text; the first 8: ${dates.slice(0, 8).join(", ")}`);
  }
}
if (newestResult) {
  await pause(GAP);
  head("MOF: the newest JGB auction results page linked: the figures bid-to-cover and tail are worked out from");
  const r = await look(newestResult, { show: 0 });
  if (r.ok) {
    const text = strip(r.text);
    console.log(`  ${text.slice(0, 120)}`);
    for (const label of ["応募額", "募入決定額", "募入最低価格", "募入平均価格", "募入平均利回り", "募入最高利回り"]) {
      const i = text.indexOf(label);
      console.log(`  ${label}: ${i >= 0 ? text.slice(i, i + 70) : "not found"}`);
    }
  }
}

/** Fetches a file as bytes and prints one line like look()'s. */
async function getBytes(url: string, timeoutMs = 60000): Promise<Uint8Array | null> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs) });
    const b = new Uint8Array(await r.arrayBuffer());
    const lm = r.headers.get("last-modified");
    console.log(`${r.status} ${r.ok ? "OK" : "NOT OK"}  ${r.headers.get("content-type") ?? "no type"}  ${b.length} bytes  ${Date.now() - t0} ms  ${masked(url)}${lm ? `\n  headers: last-modified=${lm}` : ""}`);
    return r.ok ? b : null;
  } catch (e) {
    console.log(`FAILED  ${Date.now() - t0} ms  ${masked(url)}\n  ${masked(e instanceof Error ? e.message : String(e))}`);
    return null;
  }
}
type Book = { SheetNames: string[]; Sheets: Record<string, unknown> };
type XlsxMod = { read(d: Uint8Array, o: { type: "array" }): Book; utils: { sheet_to_json(ws: unknown, o: { header: 1; raw: boolean; defval: string }): unknown[][] } };
const cell = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const rowText = (r: unknown[]) => { const cs = r.map(cell); return (cs.length > 10 ? [...cs.slice(0, 6), "…", ...cs.slice(-3)] : cs).join(" | ").slice(0, 220); };

const FEIO = `${MOF}/policy/international_policy/reference/feio/data`;
await pause(GAP);
head("MOF: foreign exchange intervention, the data index page and what it links under feio/");
{
  const url = `${FEIO}/index.html`;
  const r = await look(url, { show: 0 });
  if (r.ok) {
    const ls = [...new Set(anchors(r.text, url).filter(([u]) => /\/feio\//i.test(u)).map(([u, t]) => `${u}  (${t.slice(0, 50)})`))];
    console.log(`  ${ls.length} links under feio/; first 14:\n  ${ls.slice(0, 14).join("\n  ")}`);
    const latest = strip(r.text).match(/最新のデータ[^。]{0,40}/)?.[0];
    if (latest) console.log(`  ${latest}`);
  }
}
await pause(GAP);
head("MOF: foreign exchange intervention, the quarterly (daily data) page, its files, and the first one");
{
  const url = `${FEIO}/quarter/index.html`;
  const r = await look(url, { show: 0 });
  if (r.ok) {
    const fs = anchors(r.text, url).filter(([u]) => /\.(?:csv|xlsx?|pdf)(?:$|\?)/i.test(u));
    console.log(`  ${fs.length} files; first 10:`);
    for (const [u, t] of fs.slice(0, 10)) console.log(`  ${u}  (${t.slice(0, 50)})`);
    const f = (fs.find(([u]) => /\.(?:csv|xlsx?)(?:$|\?)/i.test(u)) ?? fs[0] ?? [""])[0];
    if (f) {
      await pause(GAP);
      const b = await getBytes(f);
      if (b && /\.xlsx?(?:$|\?)/i.test(f)) {
        try {
          // @ts-ignore: a Deno npm: specifier, the package the server uses; under Node the import fails and is reported
          const X = (await import("npm:xlsx@0.18.5")) as unknown as XlsxMod;
          const wb = X.read(b, { type: "array" });
          const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" }).filter((r) => r.some((c) => cell(c) !== ""));
          console.log(`  ${wb.SheetNames.length} sheets; "${wb.SheetNames[0]}": ${rows.length} non-empty rows`);
          for (const row of [...rows.slice(0, 4), ...rows.slice(-3)]) console.log(`  ${rowText(row)}`);
        } catch (e) { console.log(`  (workbook not opened: ${(e instanceof Error ? e.message : String(e)).slice(0, 100)})`); }
      } else if (b && /\.csv(?:$|\?)/i.test(f)) {
        let text: string;
        try { text = new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { text = new TextDecoder("shift_jis").decode(b); }
        const ls = text.split(/\r?\n/).filter((l) => l.trim() !== "");
        console.log(`  ${ls.length} lines; first 3 and last 2:\n  ${[...ls.slice(0, 3), ...ls.slice(-2)].map((l) => l.slice(0, 200)).join("\n  ")}`);
      }
    }
  }
}
