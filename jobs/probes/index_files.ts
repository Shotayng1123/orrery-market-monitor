// B-18 (equity index valuation) and B-14 (implied volatility): index figures from the exchange and the index
// publishers, no key. jpx.co.jp and indexes.nikkei.co.jp are already read by the server (short selling, margin, the
// TOPIX list; the Nikkei 225 weights); cdn.cboe.com is new to the Monitor.
//   - JPX, 規模別・業種別PER・PBR (連結・単体): "各月末現在の規模別・業種別PER・PBR(連結・単体)を掲載", updated "毎月第1営業日
//     午後1時" (jpx.co.jp/markets/statistics-equities/misc/04.html, search extract), one workbook per month: the page's
//     files and the newest workbook's rows (the TSE Prime market's P/E and P/B).
//   - Nikkei Inc., the Nikkei 225's daily PER and PBR (日次投資指標, archive pages list=per and list=pbr; the index site's
//     FAQ: its daily summary goes back to 30 Sep 2004): whether the figures are in the page's HTML and the newest rows.
//   - Cboe: VIX3M's daily history as CSV ("cdn.cboe.com/api/global/us_indices/daily_prices/VIX3M_History.csv", by a
//     third-party guide; Cboe's own page lists the VIX9D history among its downloads, so VIX9D_History.csv in the
//     same folder is a candidate): header, rows, newest line.
// Serves: B-18 (trailing P/E and P/B of the Nikkei 225 and the TSE market with their sources and dates; the earnings
// yield against the real yield once I-15 exists), B-14 (VIX9D and VIX3M beside VIX, from the publisher instead of
// Yahoo: I-23).
// Terms, to be settled by the owner before any build: JPX: "有料情報としてJPXと契約して当サイトから取得する場合、または
// JPXの許可により当サイトから取得する場合を除き、商用目的によるデータ収集及び二次利用はできません" (jpx.co.jp/term-of-use,
// search extract). Nikkei: its licence page says showing Nikkei's indexes on a website or an app is done under a
// licence contract with Nikkei (indexes.nikkei.co.jp/nkave/license, search extract). Cboe: not read.
// The S&P 500's earnings file from S&P Dow Jones Indices (named in B-18) is not probed: its address was not found.
// No key, no secret, nothing written; six requests, 0.8 s apart. The JPX workbook is opened only under Deno.
// Runtime: deno (a job on GitHub: monthly for JPX, daily for Nikkei and Cboe).
//   Actions > source-probe > Run workflow: probe = index_files, runtime = deno
import { head, look, masked, UA } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const strip = (s: string) => s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const anchors = (html: string, base: string): Array<[string, string]> => [...html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  .map((m): [string, string] => { try { return [new URL(m[1].replace(/&amp;/g, "&"), base).toString(), strip(m[2])]; } catch { return ["", ""]; } })
  .filter(([u]) => u !== "");
const GAP = 800;

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

head("JPX: 規模別・業種別PER・PBR (by size and by sector), the page's files");
let newestBook = "";
{
  const url = "https://www.jpx.co.jp/markets/statistics-equities/misc/04.html";
  const r = await look(url, { show: 0 });
  if (r.ok) {
    const fs = anchors(r.text, url).filter(([u]) => /\.(?:xlsx?|csv|pdf)(?:$|\?)/i.test(u));
    console.log(`  ${fs.length} files; first 8:`);
    for (const [u, t] of fs.slice(0, 8)) console.log(`  ${u}  (${t.slice(0, 50)})`);
    newestBook = (fs.find(([u]) => /\.xlsx?(?:$|\?)/i.test(u)) ?? [""])[0];
  }
}
if (newestBook) {
  await pause(GAP);
  head("JPX: the first PER/PBR workbook listed (its rows on the Prime market, if any)");
  const b = await getBytes(newestBook);
  if (b) {
    try {
      // @ts-ignore: a Deno npm: specifier, the package the server uses; under Node the import fails and is reported
      const X = (await import("npm:xlsx@0.18.5")) as unknown as XlsxMod;
      const wb = X.read(b, { type: "array" });
      const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" }).filter((r) => r.some((c) => cell(c) !== ""));
      console.log(`  ${wb.SheetNames.length} sheets (${wb.SheetNames.slice(0, 6).join(", ")}); "${wb.SheetNames[0]}": ${rows.length} non-empty rows`);
      for (const row of rows.slice(0, 5)) console.log(`  ${rowText(row)}`);
      for (const row of rows.filter((x) => x.some((c) => /プライム|Prime|総合|合計/i.test(cell(c)))).slice(0, 3)) console.log(`  matching: ${rowText(row)}`);
    } catch (e) { console.log(`  (workbook not opened: ${(e instanceof Error ? e.message : String(e)).slice(0, 100)})`); }
  }
}

for (const [what, list] of [["PER", "per"], ["PBR", "pbr"]] as Array<[string, string]>) {
  await pause(GAP);
  head(`Nikkei Inc.: the Nikkei 225's daily ${what}, the index site's archive page`);
  const r = await look(`https://indexes.nikkei.co.jp/nkave/archives/data?list=${list}`, { show: 0, timeoutMs: 60000 });
  if (r.ok) {
    const rows = [...r.text.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => strip(m[0])).filter((t) => /\d/.test(t));
    console.log(`  ${rows.length} table rows with figures; first 4:\n  ${rows.slice(0, 4).map((t) => t.slice(0, 160)).join("\n  ")}`);
    if (!rows.length) console.log(`  page text (first 300 characters): ${strip(r.text).slice(0, 300)}`);
  }
}

const CBOE = "https://cdn.cboe.com/api/global/us_indices/daily_prices";
for (const [what, file] of [["VIX3M", "VIX3M_History.csv"], ["VIX9D (candidate file name)", "VIX9D_History.csv"]] as Array<[string, string]>) {
  await pause(GAP);
  head(`Cboe: ${what} daily history (CSV)`);
  const r = await look(`${CBOE}/${file}`, { show: 0, timeoutMs: 60000 });
  if (r.ok) {
    const ls = r.text.split(/\r?\n/).filter((l) => l.trim() !== "");
    console.log(`  ${ls.length} lines; header: ${ls[0] ?? ""}; first row: ${ls[1] ?? ""}; newest: ${ls[ls.length - 1] ?? ""}`);
  }
}
