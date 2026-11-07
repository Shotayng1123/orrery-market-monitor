// Index constituents for movers, breadth and sector tables.
//   S&P 500:    Wikipedia "List of S&P 500 companies" (table id=constituents; Symbol, Security, GICS Sector)
//   Nikkei 225: Nikkei's own CSV nikkei_stock_average_weight_en.csv (Date, Code, Company, Nikkei classification, Sector, Weight)
// A successful fetch is cached to jobs/data/*.json; the cache is the fallback when a source is unavailable.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, "..", "data");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export interface Constituent { symbol: string; name: string; sector: string; weight: number | null }
export interface ConstituentList { index: "SP500" | "NK225"; asOf: string; source: string; rows: Constituent[] }

const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();

function cachePath(index: string) { return path.join(DATA, `${index.toLowerCase()}.json`); }
function readCache(index: "SP500" | "NK225"): ConstituentList | null { try { return JSON.parse(fs.readFileSync(cachePath(index), "utf8")) as ConstituentList; } catch { return null; } }
function writeCache(list: ConstituentList) { try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(cachePath(list.index), JSON.stringify(list, null, 1)); } catch { /* read-only checkout: ignore */ } }

export async function sp500(): Promise<ConstituentList> {
  try {
    const html = await (await fetch("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30000) })).text();
    const table = html.match(/<table[^>]*id="constituents"[^>]*>[\s\S]*?<\/table>/)?.[0];
    if (!table) throw new Error("constituents table not found");
    const rows: Constituent[] = [];
    for (const tr of table.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
      const cells = [...tr[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
      if (cells.length < 3) continue;
      const symbol = cells[0].replace(/\./g, "-");   // BRK.B -> BRK-B (Yahoo)
      if (!/^[A-Z][A-Z0-9-]{0,6}$/.test(symbol)) continue;
      rows.push({ symbol, name: cells[1], sector: cells[2], weight: null });
    }
    if (rows.length < 480) throw new Error(`only ${rows.length} rows parsed`);
    const list: ConstituentList = { index: "SP500", asOf: new Date().toISOString().slice(0, 10), source: "Wikipedia: List of S&P 500 companies", rows };
    writeCache(list);
    return list;
  } catch (e) {
    const c = readCache("SP500");
    if (!c) throw e;
    console.warn(`sp500: live list unavailable (${e instanceof Error ? e.message : e}); using cache of ${c.asOf}`);
    return c;
  }
}

export async function nikkei225(): Promise<ConstituentList> {
  try {
    const text = await (await fetch("https://indexes.nikkei.co.jp/nkave/archives/file/nikkei_stock_average_weight_en.csv", { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30000) })).text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const rows: Constituent[] = [];
    let asOf = "";
    for (const line of lines.slice(1)) {
      const c = line.match(/("([^"]*)"|[^,]*)(,|$)/g)?.map((x) => x.replace(/,$/, "").replace(/^"|"$/g, "").trim()) ?? [];
      if (c.length < 6 || !/^(\d{4}|\d{3}[A-Z])$/.test(c[1])) continue;   // TSE codes: 4 digits, or 3 digits + a letter (e.g. 285A)
      asOf = asOf || c[0].replace(/\//g, "-");
      rows.push({ symbol: `${c[1]}.T`, name: c[2], sector: c[4] || c[3], weight: Number(c[5].replace("%", "")) || null });
    }
    if (rows.length < 200) throw new Error(`only ${rows.length} rows parsed`);
    const list: ConstituentList = { index: "NK225", asOf: asOf || new Date().toISOString().slice(0, 10), source: "Nikkei Inc. constituent weights CSV", rows };
    writeCache(list);
    return list;
  } catch (e) {
    const c = readCache("NK225");
    if (!c) throw e;
    console.warn(`nikkei225: live list unavailable (${e instanceof Error ? e.message : e}); using cache of ${c.asOf}`);
    return c;
  }
}
