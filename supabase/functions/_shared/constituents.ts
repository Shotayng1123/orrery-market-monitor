// Index constituents for the server:
//   S&P 500      Wikipedia list table
//   Nasdaq-100   Nasdaq's own list endpoint (stand-in for the Composite)
//   Nikkei 225   Nikkei's constituent-weights CSV
//   TOPIX        JPX listed-issue workbook (TOPIX size class column), 17-sector classification
//   KOSPI 200    Korean Wikipedia list (GICS sector column), stand-in for the KOSPI
//   HSI          Wikipedia Hang Seng Index table (sub-index as sector)
//   SSE 180      CSI's constituent workbook, stand-in for the Shanghai Composite
import { fetchText } from "./http.ts";
import * as XLSX from "npm:xlsx@0.18.5";

export type IndexId = "SP500" | "NK225" | "NDX" | "TOPIX" | "KOSPI200" | "HSI" | "SSE180";
export const INDEX_IDS: IndexId[] = ["SP500", "NK225", "NDX", "TOPIX", "KOSPI200", "HSI", "SSE180"];
export interface Constituent { idx: IndexId; symbol: string; name: string; sector: string | null; weight: number | null; as_of: string }
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&#160;/g, " ").trim();
const today = () => new Date().toISOString().slice(0, 10);

export async function fetchSp500(): Promise<Constituent[]> {
  const html = await fetchText("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", {}, 30000);
  const table = html.match(/<table[^>]*id="constituents"[^>]*>[\s\S]*?<\/table>/)?.[0];
  if (!table) throw new Error("S&P 500: constituents table not found");
  const asOf = today();
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

/** Nasdaq-100 from Nasdaq's own list endpoint (stand-in for the Composite). Weights are market-cap shares of
 *  the list; sectors are filled from the S&P 500 rows of the same symbol where available. */
export async function fetchNasdaq100(sectorOf: (symbol: string) => string | null = () => null): Promise<Constituent[]> {
  const text = await fetchText("https://api.nasdaq.com/api/quote/list-type/nasdaq100", { headers: { accept: "application/json", origin: "https://www.nasdaq.com", referer: "https://www.nasdaq.com/" } }, 30000);
  const j = JSON.parse(text) as { data?: { data?: { rows?: Array<{ symbol: string; companyName: string; marketCap: string; sector?: string }> } } };
  const rows = j.data?.data?.rows ?? [];
  if (rows.length < 90) throw new Error(`Nasdaq-100: only ${rows.length} rows`);
  const asOf = today();
  const caps = rows.map((r) => Number(String(r.marketCap).replace(/[^0-9.]/g, "")) || 0);
  const total = caps.reduce((a, b) => a + b, 0);
  return rows.map((r, i) => {
    const symbol = r.symbol.trim().replace(/\./g, "-").replace(/\//g, "-");
    return { idx: "NDX" as const, symbol, name: r.companyName.replace(/ Common Stock| Class [A-C] Common Stock| Ordinary Shares.*$/i, "").trim(), sector: r.sector || sectorOf(symbol), weight: total ? (caps[i] / total) * 100 : null, as_of: asOf };
  });
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

async function fetchBytes(url: string, init: RequestInit = {}, timeoutMs = 60000): Promise<Uint8Array> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}
function sheetRows(bytes: Uint8Array, sheet = 0): unknown[][] {
  const wb = XLSX.read(bytes, { type: "array" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[sheet]], { header: 1, raw: true }) as unknown[][];
}

/** TOPIX: every row of the JPX listed-issue workbook whose size class is a TOPIX bucket (Core30, Large70,
 *  Mid400, Small 1, Small 2). Sector = the 17-industry classification; weight = null (free-float caps are not
 *  public), so the treemap sizes by market cap. */
export async function fetchTopix(): Promise<Constituent[]> {
  const page = await fetchText("https://www.jpx.co.jp/markets/statistics-equities/misc/01.html", {}, 30000);
  const href = page.match(/href="([^"]*data_j\.xlsx?)"/)?.[1];
  if (!href) throw new Error("TOPIX: listed-issue workbook link not found");
  const rows = sheetRows(await fetchBytes(`https://www.jpx.co.jp${href}`));
  const head = rows[0].map(String);
  const iDate = head.indexOf("日付"), iCode = head.indexOf("コード"), iName = head.indexOf("銘柄名"), iSeg = head.indexOf("市場・商品区分"), iS17 = head.indexOf("17業種区分"), iSize = head.indexOf("規模区分");
  if ([iDate, iCode, iName, iSeg, iS17, iSize].some((i) => i < 0)) throw new Error("TOPIX: unexpected columns " + head.join(","));
  const out: Constituent[] = [];
  let asOf = today();
  for (const r of rows.slice(1)) {
    const size = String(r[iSize] ?? ""), code = String(r[iCode] ?? "").trim();
    if (!size.startsWith("TOPIX") || !/^(\d{4}|\d{3}[A-Z])$/.test(code)) continue;
    const d = String(r[iDate] ?? ""); if (/^\d{8}$/.test(d)) asOf = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    out.push({ idx: "TOPIX", symbol: `${code}.T`, name: String(r[iName] ?? "").replace(/\s+/g, " ").trim(), sector: String(r[iS17] ?? "") || null, weight: null, as_of: asOf });
  }
  if (out.length < 1200) throw new Error(`TOPIX: only ${out.length} rows parsed`);
  return out;
}

/** KOSPI 200 from the Korean Wikipedia list (회사명 / 종목코드 / GICS 섹터). Stand-in for the KOSPI. */
export async function fetchKospi200(): Promise<Constituent[]> {
  const html = await fetchText("https://ko.wikipedia.org/wiki/KOSPI_200", {}, 30000);
  const out: Constituent[] = [];
  const asOf = today();
  for (const tr of html.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...tr[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
    if (cells.length < 3 || !/^\d{6}$/.test(cells[1])) continue;
    out.push({ idx: "KOSPI200", symbol: `${cells[1]}.KS`, name: cells[0], sector: cells[2] || null, weight: null, as_of: asOf });
  }
  if (out.length < 180) throw new Error(`KOSPI 200: only ${out.length} rows parsed`);
  return out;
}

/** Hang Seng Index members from the Wikipedia table (Ticker / Name / Sub-index). */
export async function fetchHsi(): Promise<Constituent[]> {
  const html = await fetchText("https://en.wikipedia.org/wiki/Hang_Seng_Index", {}, 30000);
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]).filter((t) => /Ticker/.test(t) && /Sub-index/i.test(t));
  if (!tables.length) throw new Error("HSI: constituents table not found");
  const out: Constituent[] = [];
  const asOf = today();
  for (const tr of tables[0].matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...tr[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
    if (cells.length < 3) continue;
    const code = cells[0].match(/(\d{1,5})\s*$/)?.[1];
    if (!code) continue;
    out.push({ idx: "HSI", symbol: `${code.padStart(4, "0")}.HK`, name: cells[1], sector: cells[2] || null, weight: null, as_of: asOf });
  }
  if (out.length < 60) throw new Error(`HSI: only ${out.length} rows parsed`);
  return out;
}

/** SSE 180 from CSI's constituent workbook (all Shanghai-listed). Stand-in for the Shanghai Composite; sectors
 *  are not in the file and are filled later from Yahoo quote data where available. */
export async function fetchSse180(): Promise<Constituent[]> {
  const bytes = await fetchBytes("https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/cons/000010cons.xls", { headers: { referer: "https://www.csindex.com.cn/" } });
  const rows = sheetRows(bytes);
  const head = rows[0].map(String);
  const iDate = head.findIndex((h) => h.startsWith("日期")), iCode = head.findIndex((h) => h.startsWith("成份券代码")), iName = head.findIndex((h) => h.startsWith("成份券英文名称")), iNameCn = head.findIndex((h) => h.startsWith("成份券名称"));
  if (iCode < 0) throw new Error("SSE 180: unexpected columns " + head.join(","));
  const out: Constituent[] = [];
  let asOf = today();
  for (const r of rows.slice(1)) {
    const code = String(r[iCode] ?? "").trim();
    if (!/^\d{6}$/.test(code)) continue;
    const d = String(r[iDate] ?? ""); if (/^\d{8}$/.test(d)) asOf = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    out.push({ idx: "SSE180", symbol: `${code}.SS`, name: String((iName >= 0 && r[iName]) || r[iNameCn] || code).trim(), sector: null, weight: null, as_of: asOf });
  }
  if (out.length < 150) throw new Error(`SSE 180: only ${out.length} rows parsed`);
  return out;
}
