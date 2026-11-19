// B-02: the economy from the statistics offices themselves, the sources that need no key. What a job on GitHub
// would read after each release (FRED refuses GitHub's machines, so nothing here goes through it):
//   - Eurostat (euro area): HICP headline and core, unemployment, GDP; JSON-stat, no key;
//   - ONS (UK): CPI, core CPI, unemployment, GDP; its time-series JSON, no key;
//   - BLS (US) version 1 of its API: no key, 25 queries a day per address (a GitHub machine's address is shared,
//     so whether that allowance is left is itself the finding); one query for five series, a read-only POST;
//   - BEA (US GDP): the published flat file of every quarterly NIPA series, which needs no UserID (the API does);
//   - Japan's Statistics Bureau: its CPI and labour pages, searched for data files (the e-Stat API needs an appId);
//   - China's National Bureau of Statistics: whether its pages answer GitHub's machines at all.
// Runtime: node (a job on GitHub, started by the database at each release time).
//   Actions > source-probe > Run workflow: probe = econ_offices, runtime = node
import { head, look } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const J = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };
const y = new Date().getUTCFullYear();

// ---- Eurostat: JSON-stat 2.0; with one value asked for in every other dimension, value[i] is the i-th period ----
const ES = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
type JStat = { label?: string; updated?: string; value?: Record<string, number>; dimension?: { time?: { category?: { index?: Record<string, number> } } } };
function jstat(t: string): string {
  const j = J(t) as JStat | null;
  const idx = j?.dimension?.time?.category?.index ?? {};
  const periods = Object.entries(idx).sort((a, b) => a[1] - b[1]);
  const vals = periods.map(([p, i]) => `${p} ${j?.value?.[String(i)] ?? "–"}`);
  return `${j?.label ?? "?"}; updated ${j?.updated ?? "?"}; ${periods.length} periods; last: ${vals.slice(-3).join(", ")}`;
}
for (const [what, url] of [
  ["Eurostat: HICP annual rate, euro area, all items", `${ES}/prc_hicp_manr?format=JSON&lang=EN&geo=EA&coicop=CP00&lastTimePeriod=4`],
  ["Eurostat: HICP annual rate, euro area, excluding energy, food, alcohol and tobacco", `${ES}/prc_hicp_manr?format=JSON&lang=EN&geo=EA&coicop=TOT_X_NRG_FOOD&lastTimePeriod=4`],
  ["Eurostat: unemployment rate, euro area, seasonally adjusted", `${ES}/une_rt_m?format=JSON&lang=EN&geo=EA20&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT&lastTimePeriod=4`],
  ["Eurostat: real GDP, euro area, change on the previous quarter", `${ES}/namq_10_gdp?format=JSON&lang=EN&geo=EA20&unit=CLV_PCH_PRE&s_adj=SCA&na_item=B1GQ&lastTimePeriod=4`],
  ["Eurostat: HICP annual rate, all periods (for the history's length)", `${ES}/prc_hicp_manr?format=JSON&lang=EN&geo=EA&coicop=CP00`],
]) {
  head(what);
  const r = await look(url, { headers: { accept: "application/json" }, show: 0, timeoutMs: 60000 });
  if (r.ok) console.log(`  ${jstat(r.text)}`);
  await pause(400);
}

// ---- ONS: time-series JSON ----
for (const [what, url] of [
  ["ONS: CPI annual rate (D7G7)", "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23/data"],
  ["ONS: CPI excluding energy, food, alcohol and tobacco, annual rate (DKO8)", "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/dko8/mm23/data"],
  ["ONS: unemployment rate, 16 and over, seasonally adjusted (MGSX)", "https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms/data"],
  ["ONS: GDP, quarter on quarter (IHYQ)", "https://www.ons.gov.uk/economy/grossdomesticproductgdp/timeseries/ihyq/qna/data"],
]) {
  head(what);
  const r = await look(url, { headers: { accept: "application/json" }, show: 0 });
  const j = J(r.text) as { description?: { title?: string; releaseDate?: string; nextRelease?: string }; months?: Array<{ date: string; value: string }>; quarters?: Array<{ date: string; value: string }> } | null;
  if (j) {
    const xs = j.months?.length ? j.months : j.quarters ?? [];
    console.log(`  ${j.description?.title}; released ${j.description?.releaseDate}; next ${j.description?.nextRelease}; ${xs.length} periods (${xs[0]?.date} ..); last: ${xs.slice(-3).map((x) => `${x.date} ${x.value}`).join(", ")}`);
  }
  await pause(400);
}

// ---- BLS: API version 1, no key ----
head("BLS: API version 1, no key (CPI, core CPI, unemployment rate, payrolls, average hourly earnings)");
{
  const body = JSON.stringify({ seriesid: ["CUUR0000SA0", "CUUR0000SA0L1E", "LNS14000000", "CES0000000001", "CES0500000003"], startyear: String(y - 1), endyear: String(y) });
  const r = await look("https://api.bls.gov/publicAPI/v1/timeseries/data/", { method: "POST", headers: { "content-type": "application/json" }, body, show: 0 });
  const j = J(r.text) as { status?: string; message?: string[]; Results?: { series?: Array<{ seriesID: string; data?: Array<{ year: string; period: string; periodName: string; value: string }> }> } } | null;
  if (j) {
    console.log(`  status ${j.status}${j.message?.length ? `; messages: ${j.message.join(" | ")}` : ""}`);
    for (const s of j.Results?.series ?? []) console.log(`  ${s.seriesID}: ${s.data?.length ?? 0} months; newest ${s.data?.[0]?.periodName} ${s.data?.[0]?.year} = ${s.data?.[0]?.value}`);
  } else console.log(`  first 300 chars: ${JSON.stringify(r.text.slice(0, 300))}`);
}

// ---- BEA: the quarterly NIPA flat file, no UserID ----
await pause(400);
head("BEA: every quarterly NIPA series as one published file (real GDP growth is series A191RL)");
{
  const r = await look("https://apps.bea.gov/national/Release/TXT/NipaDataQ.txt", { show: 200, timeoutMs: 180000 });
  if (r.ok) {
    const lines = r.text.split(/\r?\n/);
    const gdp = lines.filter((l) => /^"?A191RL/.test(l));
    console.log(`  ${lines.length} lines; A191RL: ${gdp.length} quarters; last 3: ${gdp.slice(-3).join(" | ")}`);
  }
}

// ---- Japan: the Statistics Bureau's pages, searched for data files ----
const links = (html: string, base: string): string[] => [...new Set([...html.matchAll(/href="([^"]+\.(?:csv|xlsx?|zip))"/gi)].map((m) => new URL(m[1], base).toString()))];
for (const [what, url] of [
  ["Statistics Bureau of Japan: consumer price index (English page; candidate address)", "https://www.stat.go.jp/english/data/cpi/index.html"],
  ["Statistics Bureau of Japan: labour force survey (English page; candidate address)", "https://www.stat.go.jp/english/data/roudou/index.html"],
]) {
  await pause(400);
  head(what);
  const r = await look(url, { show: 0 });
  if (r.ok) { const ls = links(r.text, url); console.log(`  ${ls.length} data-file links; first 8:\n  ${ls.slice(0, 8).join("\n  ")}`); }
}

// ---- China: does the NBS answer at all ----
for (const [what, url] of [
  ["National Bureau of Statistics of China: data portal (reachability only)", "https://data.stats.gov.cn/english/"],
  ["National Bureau of Statistics of China: press releases (reachability only)", "https://www.stats.gov.cn/english/PressRelease/"],
]) {
  await pause(400);
  head(what);
  await look(url, { show: 200, timeoutMs: 30000 });
}
