// JPX short-selling and margin statistics (all public files on jpx.co.jp):
//   positions  空売りの残高に関する情報   daily workbook, every short position of 0.5% or more by holder
//   ratio      空売り集計                 daily PDFs, short-selling value and share of trading value (market, 33 sectors)
//   margin     信用取引現在高             weekly workbook, market-wide margin balances (shares sold short / bought on margin)
import { chunk, db } from "./db.ts";
import { fetchText } from "./http.ts";
import * as XLSX from "npm:xlsx@0.18.5";

const BASE = "https://www.jpx.co.jp";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" };

async function fetchBytes(url: string, timeoutMs = 60000): Promise<Uint8Array> {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}
function sheetRows(bytes: Uint8Array): unknown[][] {
  const wb = XLSX.read(bytes, { type: "array" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true }) as unknown[][];
}
/** Excel serial date (1900 system) or an 8-digit string to ISO. */
function excelDate(v: unknown): string | null {
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400e3).toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4})[/-]?(\d{1,2})[/-]?(\d{1,2})$/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,▲△\s]/g, (c) => (c === "▲" || c === "△" ? "-" : ""))); return Number.isFinite(n) ? n : null; };

// ---------- positions ----------
/** Loads every Short_Positions workbook linked on the index page whose date is not in the table yet (most
 *  recent first, at most `maxFiles`). The file is published the morning after the calculation date. */
export async function loadShortPositions(maxFiles = 3): Promise<string> {
  const page = await fetchText(`${BASE}/markets/public/short-selling/index.html`, { headers: UA }, 30000);
  const links = [...new Set([...page.matchAll(/href="([^"]*\/(\d{8})_Short_Positions\.xlsx?)"/g)].map((m) => m[1]))].sort().reverse();
  if (!links.length) throw new Error("JPX positions: no workbook links on the page");
  const { data: have } = await db.from("jp_short_positions").select("d").order("d", { ascending: false }).limit(1);
  const latest = have?.[0]?.d as string | undefined;
  const parts: string[] = [];
  let done = 0;
  for (const href of links) {
    if (done >= maxFiles) break;
    const pub = href.match(/(\d{8})_Short_Positions/)![1];
    const pubIso = `${pub.slice(0, 4)}-${pub.slice(4, 6)}-${pub.slice(6, 8)}`;
    if (latest && pubIso <= latest) break;                      // calculation date is the day before publication; both monotonic
    const rows = sheetRows(await fetchBytes(BASE + href));
    const hi = rows.findIndex((r) => String(r[0] ?? "").includes("計算年月日"));
    if (hi < 0) { parts.push(`${pub}: header not found`); continue; }
    const out: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const r of rows.slice(hi + 2)) {
      const d = excelDate(r[0]); const code = String(r[1] ?? "").trim();
      if (!d || !/^\d{3,5}[A-Z]?$/.test(code)) continue;
      const holder = String(r[4] ?? "").trim() || "–";
      const key = `${d}|${code}|${holder}`; if (seen.has(key)) continue; seen.add(key);
      out.push({ d, code, name: String(r[3] || r[2] || "").trim() || null, holder, ratio: num(r[9]), shares: num(r[10]), prev_d: excelDate(r[12]), prev_ratio: num(r[13]) });
    }
    for (const part of chunk(out, 1000)) { const { error } = await db.from("jp_short_positions").upsert(part, { onConflict: "d,code,holder" }); if (error) throw new Error("jp_short_positions: " + error.message); }
    parts.push(`${pub}: ${out.length} positions`); done++;
  }
  await aggregatePositions();
  return parts.length ? parts.join("; ") : `up to date (${latest})`;
}
/** Index-level summary of the current reported positions, stored under the latest calculation date so the
 *  history builds up day by day. */
async function aggregatePositions(): Promise<void> {
  const { data: latest } = await db.from("jp_short_positions").select("d").order("d", { ascending: false }).limit(1);
  const d = latest?.[0]?.d as string | undefined;
  if (!d) return;
  const { data: pos } = await db.rpc("fn_jp_short_latest", { p_since: new Date(Date.parse(d) - 60 * 86400e3).toISOString().slice(0, 10) });
  const byCode = new Map(((pos ?? []) as Array<{ code: string; total_ratio: number }>).map((x) => [x.code, x.total_ratio]));
  const rows: Array<Record<string, unknown>> = [];
  for (const idx of ["NK225", "TOPIX"]) {
    const { data: cons } = await db.from("constituents").select("symbol").eq("idx", idx).limit(5000);
    const codes = (cons ?? []).map((c) => c.symbol.replace(/\.T$/, ""));
    if (!codes.length) continue;
    const vals = codes.map((c) => byCode.get(c) ?? 0);
    const names = vals.filter((v) => v > 0).length;
    rows.push({ d, idx, metric: "jpx_positions_avg", value: vals.reduce((a, v) => a + v, 0) / codes.length, n: codes.length }, { d, idx, metric: "jpx_positions_names", value: names, n: codes.length });
  }
  if (rows.length) { const { error } = await db.from("short_agg").upsert(rows, { onConflict: "d,idx,metric" }); if (error) throw new Error("short_agg: " + error.message); }
}

// ---------- daily short-selling ratio (PDF) ----------
type PdfLine = string[];
async function pdfLines(bytes: Uint8Array): Promise<PdfLine[]> {
  const { getDocument } = await import("npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true, isEvalSupported: false }).promise;
  const lines: PdfLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const byY = new Map<number, Array<{ s: string; x: number }>>();
    for (const it of tc.items as Array<{ str: string; transform: number[] }>) {
      if (!it.str.trim()) continue;
      const k = Math.round(it.transform[5] / 3) * 3;
      byY.set(k, [...(byY.get(k) ?? []), { s: it.str, x: it.transform[4] }]);
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) lines.push(byY.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.s.trim()));
  }
  return lines;
}
/** Collects the daily PDF links (YYMMDD-m.pdf market, -g.pdf sectors) from one JPX page. */
export function ratioLinks(page: string): Map<string, { m?: string; g?: string }> {
  const files = new Map<string, { m?: string; g?: string }>();
  for (const m of page.matchAll(/href="([^"]*\/(\d{6})-([mg])\.pdf)"/g)) { const e = files.get(m[2]) ?? {}; e[m[3] as "m" | "g"] = m[1]; files.set(m[2], e); }
  return files;
}
/** Parses one day's market and sector PDFs into jp_short_ratio rows. */
export async function ratioRows(d: string, f: { m?: string; g?: string }): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  const parse = (lines: PdfLine[], scope: "market" | "sector") => {
    for (const l of lines) {
      // rows: name | actual | % | restricted | % | free | % | total   (the market file has a date as the name)
      const nums = l.map((c) => c.replace(/[,%]/g, "")).map((c) => (/^-?\d+(\.\d+)?$/.test(c) ? Number(c) : null));
      const numeric = nums.filter((v): v is number => v != null);
      if (numeric.length < 7) continue;
      const name = l[0] ?? "";
      if (scope === "market" && !/\d{4}年\d{1,2}月\d{1,2}日/.test(name)) continue;
      if (scope === "sector" && (/\d{4}年/.test(name) || /合計|売買代金|比率/.test(name))) continue;
      const [actual, , restricted, , free, , total] = numeric.slice(-7);
      out.push({ d, scope, name: scope === "market" ? "TSE" : name, actual, short_restricted: restricted, short_free: free, total });
    }
  };
  if (f.m) parse(await pdfLines(await fetchBytes(BASE + f.m)), "market");
  if (f.g) parse(await pdfLines(await fetchBytes(BASE + f.g)), "sector");
  return out;
}
export const tagToDate = (tag: string) => `20${tag.slice(0, 2)}-${tag.slice(2, 4)}-${tag.slice(4, 6)}`;
/** Loads the market and sector short-selling PDFs for the dates linked on the index page that are not loaded yet. */
export async function loadShortRatio(maxDays = 3): Promise<string> {
  const page = await fetchText(`${BASE}/markets/statistics-equities/short-selling/index.html`, { headers: UA }, 30000);
  const files = ratioLinks(page);
  const days = [...files.keys()].sort().reverse();
  if (!days.length) throw new Error("JPX ratio: no PDF links on the page");
  const { data: have } = await db.from("jp_short_ratio").select("d").eq("scope", "market").order("d", { ascending: false }).limit(1);
  const latest = have?.[0]?.d as string | undefined;
  const parts: string[] = [];
  let done = 0;
  for (const tag of days) {
    if (done >= maxDays) break;
    const d = tagToDate(tag);
    if (latest && d <= latest) break;
    const out = await ratioRows(d, files.get(tag)!);
    for (const part of chunk(out, 500)) { const { error } = await db.from("jp_short_ratio").upsert(part, { onConflict: "d,scope,name" }); if (error) throw new Error("jp_short_ratio: " + error.message); }
    parts.push(`${d}: ${out.length} rows`); done++;
  }
  return parts.length ? parts.join("; ") : `up to date (${latest})`;
}
/** Backfill from JPX's monthly archive pages (00-archives-01.html = last month … -12 = a year ago). */
export async function backfillShortRatio(months = 12, log: (s: string) => void = () => {}): Promise<string> {
  const have = new Set((await (await import("./db.ts")).selectAll<{ d: string }>(() => db.from("jp_short_ratio").select("d").eq("scope", "market").order("d"))).map((r) => r.d));
  const files = new Map<string, { m?: string; g?: string }>();
  for (const n of [0, ...Array.from({ length: months }, (_, k) => k + 1)]) {
    const url = n === 0 ? `${BASE}/markets/statistics-equities/short-selling/index.html` : `${BASE}/markets/statistics-equities/short-selling/00-archives-${String(n).padStart(2, "0")}.html`;
    try { for (const [tag, f] of ratioLinks(await fetchText(url, { headers: UA }, 30000))) if (!files.has(tag)) files.set(tag, f); } catch (e) { log(`${url}: ${e instanceof Error ? e.message : e}`); }
  }
  const todo = [...files.keys()].filter((tag) => !have.has(tagToDate(tag))).sort();
  log(`${files.size} days linked, ${todo.length} to load`);
  let loaded = 0, failed = 0, i = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (;;) {
      const tag = todo[i++]; if (!tag) return;
      try {
        const out = await ratioRows(tagToDate(tag), files.get(tag)!);
        for (const part of chunk(out, 500)) { const { error } = await db.from("jp_short_ratio").upsert(part, { onConflict: "d,scope,name" }); if (error) throw new Error(error.message); }
        loaded++; if (loaded % 20 === 0) log(`  ${loaded}/${todo.length}`);
      } catch (e) { failed++; log(`${tag}: ${e instanceof Error ? e.message : e}`); }
    }
  }));
  return `${loaded} days loaded, ${failed} failed, ${files.size} linked`;
}

// ---------- weekly margin balances (market total) ----------
/** 信用取引現在高: the weekly market-wide workbook (customers' account totals). Stored in jp_short_ratio with
 *  scope 'margin' so the panel can show the week-on-week change without another table: actual = shares sold
 *  short (thousand shares), short_restricted = their value (JPY m), short_free = shares bought on margin,
 *  total = their value. */
export async function loadMarginTotals(): Promise<string> {
  const page = await fetchText(`${BASE}/markets/statistics-equities/margin/05.html`, { headers: UA }, 30000);
  const href = [...page.matchAll(/href="([^"]*\/(\d{8})_mtsk\.xlsx?)"/g)].map((m) => m[1]).sort().reverse()[0];
  if (!href) throw new Error("JPX margin: workbook link not found");
  const rows = sheetRows(await fetchBytes(BASE + href));
  const out: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    const d = excelDate(r[0]); if (!d) continue;
    const sellSh = num(r[9]), sellVal = num(r[10]), buySh = num(r[11]), buyVal = num(r[12]);   // 合計 Total: 売残高 株数/金額, 買残高 株数/金額
    if (sellSh == null || buySh == null) continue;
    out.push({ d, scope: "margin", name: "TSE", actual: sellSh, short_restricted: sellVal, short_free: buySh, total: buyVal });
  }
  if (!out.length) throw new Error("JPX margin: no dated rows parsed");
  const recent = out.slice(-120);
  for (const part of chunk(recent, 500)) { const { error } = await db.from("jp_short_ratio").upsert(part, { onConflict: "d,scope,name" }); if (error) throw new Error("jp_short_ratio: " + error.message); }
  return `margin totals to ${recent[recent.length - 1].d} (${recent.length} weeks)`;
}
