// Sovereign yield curves from official publishers. Each fetcher returns rows for the `curves` table.
//   US  US Treasury daily par yield curve (handled in daily/index.ts, kept there for history)
//   JP  Japan MOF reference yields (idem)
//   DE  Deutsche Bundesbank term structure of listed Federal securities, residual maturities 1–30 years (BBSIS)
//   EA  ECB euro-area AAA-rated government curve, spot rates (YC, G_N_A)
//   EB  ECB euro-area all-ratings government curve, spot rates (YC, G_N_C)
//   GB  Bank of England nominal government spot curve (GLC, current-month workbook)
//   CA  Bank of Canada benchmark bond yields (Valet)
import { fetchText } from "./http.ts";

export interface CurveRow { country: string; d: string; tenor: string; years: number; yield: number; source: string }
export const CURVE_LABELS: Record<string, string> = {
  US: "US Treasury", JP: "Japan JGB", DE: "Germany Bund", EA: "Euro area AAA", EB: "Euro area all ratings", GB: "UK gilts", CA: "Canada",
};

// ---- Germany: one CSV per residual maturity (semicolon separated, decimal comma) ----
export async function fetchBundesbank(full: boolean): Promise<CurveRow[]> {
  const out: CurveRow[] = [];
  const src = "Deutsche Bundesbank, term structure of listed Federal securities (BBSIS)";
  for (let y = 1; y <= 30; y++) {
    const key = `R${String(y).padStart(2, "0")}XX`;
    const url = `https://api.statistiken.bundesbank.de/rest/data/BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.${key}.R.A.A._Z._Z.A?format=csv${full ? "" : "&lastNObservations=10"}`;
    const text = await fetchText(url, {}, 60000);
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^(\d{4}-\d{2}-\d{2});([-\d,.]+);/);
      if (!m) continue;
      const v = Number(m[2].replace(",", "."));
      if (Number.isFinite(v)) out.push({ country: "DE", d: m[1], tenor: `${y}Y`, years: y, yield: v, source: src });
    }
  }
  return out;
}

// ---- ECB euro-area curves: spot rates at the standard tenors ----
const ECB_TENORS: Array<[string, number]> = [["3M", 0.25], ["6M", 0.5], ["1Y", 1], ["2Y", 2], ["3Y", 3], ["5Y", 5], ["7Y", 7], ["10Y", 10], ["15Y", 15], ["20Y", 20], ["30Y", 30]];
export async function fetchEcb(code: "EA" | "EB", full: boolean): Promise<CurveRow[]> {
  const rating = code === "EA" ? "G_N_A" : "G_N_C";
  const keys = ECB_TENORS.map(([t]) => `SR_${t}`).join("+");
  const url = `https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.${rating}.SV_C_YM.${keys}?format=csvdata${full ? "" : "&lastNObservations=10"}`;
  const text = await fetchText(url, { headers: { accept: "text/csv" } }, 90000);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(",");
  const iKey = head.indexOf("KEY"), iT = head.indexOf("TIME_PERIOD"), iV = head.indexOf("OBS_VALUE");
  const src = code === "EA" ? "ECB, euro area AAA-rated government bonds, spot curve" : "ECB, euro area all-ratings government bonds, spot curve";
  const out: CurveRow[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const tenor = c[iKey]?.split(".").pop()?.replace(/^SR_/, "");
    const yrs = ECB_TENORS.find(([t]) => t === tenor)?.[1];
    const v = Number(c[iV]);
    if (!tenor || yrs == null || !/^\d{4}-\d{2}-\d{2}$/.test(c[iT] ?? "") || !Number.isFinite(v)) continue;
    out.push({ country: code, d: c[iT], tenor, years: yrs, yield: v, source: src });
  }
  return out;
}

// ---- Canada: Valet CSV, 2/3/5/7/10 years and long (taken as 30) ----
export async function fetchBoc(full: boolean): Promise<CurveRow[]> {
  const url = `https://www.bankofcanada.ca/valet/observations/group/bond_yields_benchmark/csv?${full ? "start_date=2016-01-01" : "recent=10"}`;
  const text = await fetchText(url, {}, 60000);
  const lines = text.split(/\r?\n/);
  const hi = lines.findIndex((l) => l.startsWith('"date"'));
  if (hi < 0) throw new Error("BoC: observations header not found");
  const head = lines[hi].split(",").map((s) => s.replace(/"/g, ""));
  const map: Array<[string, string, number]> = [["BD.CDN.2YR.DQ.YLD", "2Y", 2], ["BD.CDN.3YR.DQ.YLD", "3Y", 3], ["BD.CDN.5YR.DQ.YLD", "5Y", 5], ["BD.CDN.7YR.DQ.YLD", "7Y", 7], ["BD.CDN.10YR.DQ.YLD", "10Y", 10], ["BD.CDN.LONG.DQ.YLD", "30Y", 30]];
  const out: CurveRow[] = [];
  for (const line of lines.slice(hi + 1)) {
    const c = line.split(",").map((s) => s.replace(/"/g, ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c[0] ?? "")) continue;
    for (const [col, tenor, yrs] of map) {
      const k = head.indexOf(col); const v = Number(c[k]);
      if (k >= 0 && c[k] !== "" && Number.isFinite(v)) out.push({ country: "CA", d: c[0], tenor, years: yrs, yield: v, source: "Bank of Canada, benchmark bond yields (Valet)" });
    }
  }
  return out;
}

// ---- UK: BoE GLC nominal workbook (zip -> xlsx -> sheet "4. spot curve"); current month only ----
const GB_TENORS = [0.5, 1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 40];
export async function fetchBoe(): Promise<CurveRow[]> {
  const r = await fetch("https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip", { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`BoE: HTTP ${r.status}`);
  const zip = new Uint8Array(await r.arrayBuffer());
  const { unzipSync } = await import("npm:fflate@0.8.2");
  const files = unzipSync(zip);
  const name = Object.keys(files).find((n) => /GLC Nominal daily data/i.test(n));
  if (!name) throw new Error("BoE: nominal workbook not in zip");
  return await parseBoeWorkbook(files[name]);
}

/** One GLC nominal workbook (the monthly file, or a multi-year file from the Bank's historical archive). */
export async function parseBoeWorkbook(bytes: Uint8Array): Promise<CurveRow[]> {
  const XLSX = await import("npm:xlsx@0.18.5");
  const wb = XLSX.read(bytes, { type: "array" });
  const ws = wb.Sheets["4. spot curve"];
  if (!ws) throw new Error("BoE: sheet '4. spot curve' missing");
  const rows = XLSX.utils.sheet_to_json<Array<number | string | null>>(ws, { header: 1, raw: true });
  const matRow = rows.find((row) => typeof row[1] === "number" && (row[1] as number) > 0 && (row[1] as number) < 1) ?? rows[3];
  const cols: Array<{ c: number; years: number; tenor: string }> = [];
  for (let c = 1; c < (matRow?.length ?? 0); c++) {
    const yrs = Number(matRow[c]);
    const t = GB_TENORS.find((g) => Math.abs(g - yrs) < 1e-6);
    if (t != null) cols.push({ c, years: t, tenor: t < 1 ? `${Math.round(t * 12)}M` : `${t}Y` });
  }
  const out: CurveRow[] = [];
  for (const row of rows) {
    const serial = row[0];
    if (typeof serial !== "number" || serial < 40000) continue;   // excel date serials only
    const d = new Date(Math.round((serial - 25569) * 86400) * 1000).toISOString().slice(0, 10);
    for (const { c, years, tenor } of cols) { const v = Number(row[c]); if (row[c] != null && Number.isFinite(v)) out.push({ country: "GB", d, tenor, years, yield: v, source: "Bank of England, nominal government spot curve (GLC)" }); }
  }
  return out;
}
