// B-09 (UK real yields and implied inflation) and OD-B1 (what the market prices for Bank Rate). The server already
// downloads the Bank of England's "latest yield curve data" zip for the nominal gilt curve (supabase/functions/
// _shared/curves.ts, fetchBoe) and reads one workbook from it. This lists every file in that zip and, for the real,
// inflation and OIS workbooks, their sheets, maturities, newest date and a few values: the OIS curve is the Bank's
// own estimate of the overnight-index swap curve, which would give the BoE part of a priced path from an official
// source. The history archives are only asked for their size here, not downloaded.
// Runtime: deno (the server's daily curves job would read these; the npm imports are the ones it uses).
//   Actions > source-probe > Run workflow: probe = boe_curves_more, runtime = deno
import { head, UA } from "./lib.ts";

const BASE = "https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves";

async function bytes(url: string, timeoutMs = 120000): Promise<Uint8Array | null> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs) });
    const b = new Uint8Array(await r.arrayBuffer());
    console.log(`${r.status} ${r.ok ? "OK" : "NOT OK"}  ${r.headers.get("content-type") ?? "no type"}  ${b.length} bytes  ${Date.now() - t0} ms  ${url}${r.headers.get("last-modified") ? `\n  headers: last-modified=${r.headers.get("last-modified")}` : ""}`);
    return r.ok ? b : null;
  } catch (e) { console.log(`FAILED  ${Date.now() - t0} ms  ${url}\n  ${e instanceof Error ? e.message : String(e)}`); return null; }
}
async function sizeOnly(url: string): Promise<void> {
  try {
    const r = await fetch(url, { method: "HEAD", headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(30000) });
    console.log(`  ${r.status} ${r.headers.get("content-type") ?? "no type"} ${r.headers.get("content-length") ?? "?"} bytes, last-modified ${r.headers.get("last-modified") ?? "?"}  ${url}`);
  } catch (e) { console.log(`  FAILED ${url}: ${e instanceof Error ? e.message : String(e)}`); }
}
const serialDay = (s: number) => new Date(Math.round((s - 25569) * 86400) * 1000).toISOString().slice(0, 10);

head("Bank of England: the 'latest yield curve data' zip the server already downloads, and the files inside it");
const zip = await bytes(`${BASE}/latest-yield-curve-data.zip`);
if (zip) {
  const { unzipSync } = await import("npm:fflate@0.8.2");
  const XLSX = await import("npm:xlsx@0.18.5");
  const files = unzipSync(zip) as Record<string, Uint8Array>;
  for (const [name, data] of Object.entries(files)) console.log(`  ${name}  (${data.length} bytes)`);
  for (const [name, data] of Object.entries(files)) {
    if (!/real|inflation|ois/i.test(name)) continue;
    head(`workbook: ${name}`);
    const wb = XLSX.read(data, { type: "array" });
    console.log(`  sheets: ${wb.SheetNames.join(" | ")}`);
    for (const sn of wb.SheetNames) {
      if (!/spot|fwd|forward/i.test(sn)) continue;
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true }) as Array<Array<number | string | null>>;
      const mat = rows.find((row) => (row[0] == null || typeof row[0] === "string") && row.slice(1, 4).every((c) => typeof c === "number"));
      const dated = rows.filter((row) => typeof row[0] === "number" && (row[0] as number) > 40000);
      const last = dated[dated.length - 1];
      const ms = mat ? mat.slice(1).map((c) => Number(c)).filter((n) => Number.isFinite(n)) : [];
      console.log(`  sheet "${sn}": ${dated.length} dated rows${dated.length ? ` (${serialDay(dated[0][0] as number)} .. ${serialDay(last[0] as number)})` : ""}; ${ms.length} maturities, first ${ms.slice(0, 8).join(", ")}${ms.length > 8 ? ` … last ${ms[ms.length - 1]}` : ""}`);
      if (mat && last) {
        const at = (yrs: number) => { const k = mat.findIndex((c, i) => i > 0 && typeof c === "number" && Math.abs((c as number) - yrs) < 1e-6); return k > 0 && last[k] != null ? `${yrs}Y ${last[k]}` : null; };
        console.log(`    newest row: ${[0.5, 1, 2, 3, 5, 10, 20, 30].map(at).filter(Boolean).join(", ") || `first cells ${last.slice(0, 6).join(", ")}`}`);
      }
    }
  }
}

head("history archives on the same site (status and size only)");
for (const n of ["glcnominalddata.zip", "glcrealddata.zip", "glcinflationddata.zip", "oisddata.zip"]) await sizeOnly(`${BASE}/${n}`);
