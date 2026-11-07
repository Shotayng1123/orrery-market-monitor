// Index constituents for the server (same sources as jobs/lib/constituents.ts):
//   S&P 500 from the Wikipedia list table, Nikkei 225 from Nikkei's constituent-weights CSV.
import { fetchText } from "./http.ts";

export interface Constituent { idx: "SP500" | "NK225"; symbol: string; name: string; sector: string | null; weight: number | null; as_of: string }
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();

export async function fetchSp500(): Promise<Constituent[]> {
  const html = await fetchText("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", {}, 30000);
  const table = html.match(/<table[^>]*id="constituents"[^>]*>[\s\S]*?<\/table>/)?.[0];
  if (!table) throw new Error("S&P 500: constituents table not found");
  const asOf = new Date().toISOString().slice(0, 10);
  const rows: Constituent[] = [];
  for (const tr of table.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...tr[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
    if (cells.length < 3) continue;
    const symbol = cells[0].replace(/\./g, "-");
    if (!/^[A-Z][A-Z0-9-]{0,6}$/.test(symbol)) continue;
    rows.push({ idx: "SP500", symbol, name: cells[1], sector: cells[2], weight: null, as_of: asOf });
  }
  if (rows.length < 480) throw new Error(`S&P 500: only ${rows.length} rows parsed`);
  return rows;
}

export async function fetchNikkei225(): Promise<Constituent[]> {
  const text = await fetchText("https://indexes.nikkei.co.jp/nkave/archives/file/nikkei_stock_average_weight_en.csv", {}, 30000);
  const rows: Constituent[] = [];
  let asOf = "";
  for (const line of text.split(/\r?\n/).slice(1)) {
    const c = line.match(/("([^"]*)"|[^,]*)(,|$)/g)?.map((x) => x.replace(/,$/, "").replace(/^"|"$/g, "").trim()) ?? [];
    if (c.length < 6 || !/^(\d{4}|\d{3}[A-Z])$/.test(c[1])) continue;
    asOf = asOf || c[0].replace(/\//g, "-");
    rows.push({ idx: "NK225", symbol: `${c[1]}.T`, name: c[2], sector: c[4] || c[3] || null, weight: Number(c[5].replace("%", "")) || null, as_of: asOf });
  }
  if (rows.length < 200) throw new Error(`Nikkei 225: only ${rows.length} rows parsed`);
  return rows;
}
