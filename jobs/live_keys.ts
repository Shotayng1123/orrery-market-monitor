// Whether the owner's source keys are in place and accepted (the owner's decisions of 20 Nov 2026: the contact the
// Monitor declares to the SEC, an EDINET API key, a BLS key). For each it prints "set" or "not set", never a value or
// its length, and where it is set makes one or two requests with it and prints only the HTTP status and the source's
// own short answer. No address that carries a key is printed, and anything printed is cleaned of the secrets and of
// e-mail addresses. It changes nothing.
//
//   SEC_USER_AGENT  the User-Agent the SEC asks automated clients to declare (a name and a contact address)
//   EDINET_API_KEY  the FSA's EDINET API v2 key (not EDINETDB_API_KEY, which is EDINET DB's, Cabocia's)
//   BLS_API_KEY     the BLS Public Data API v2 registration key
//
// By name only: Actions > live-check > Run workflow, only = keys. The workflow gives these three secrets to this
// step alone, never to the database step.
//   npx tsx live_keys.ts

const TIMEOUT = 30000;
const NAMES = ["SEC_USER_AGENT", "EDINET_API_KEY", "BLS_API_KEY"] as const;
const val = (k: string): string => (process.env[k] ?? "").trim();
const SECRETS = NAMES.map(val).filter((v) => v.length >= 4);
/** Nothing secret is ever printed: each secret's value, and any e-mail address, is replaced. */
const clean = (s: string): string => SECRETS.reduce((t, v) => t.split(v).join("***"), s).replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "***@***");
const say = (s: string): void => console.log(clean(s));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const J = (t: string): any => { try { return JSON.parse(t); } catch { return null; } };
const errText = (e: unknown): string => clean(String((e as Error)?.message ?? e)).slice(0, 120);

// The SEC: the same two requests the probe of 19 Nov 2026 made without a declared contact (both refused, 403).
// NVIDIA (CIK 1045810), as in jobs/probes/sec_edgar.ts. 200 = the declared contact is accepted.
async function sec(ua: string): Promise<void> {
  for (const url of ["https://www.sec.gov/files/company_tickers.json", "https://data.sec.gov/submissions/CIK0001045810.json"]) {
    const r = await fetch(url, { headers: { "user-agent": ua, accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT) }).catch((e) => e as Error);
    if (r instanceof Error) { say(`  ${url}: no answer (${errText(r)})`); continue; }
    const text = await r.text();
    say(`  ${url}: HTTP ${r.status} ${r.headers.get("content-type") ?? ""}, ${text.length} characters${r.status === 200 ? " (accepted)" : r.status === 403 ? " (refused)" : ""}`);
    await pause(400);   // the SEC allows ten requests a second
  }
}

// EDINET API v2: the list of one day's documents, metadata only (type=1); the key goes in the Subscription-Key
// parameter (the FSA's EDINET API specification, Version 2, June 2026, p.44). The day is yesterday in Japan; a day
// without filings still answers 200 with a count of 0. 401 = the key is refused.
async function edinet(key: string): Promise<void> {
  const day = new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10);
  const url = `https://api.edinet-fsa.go.jp/api/v2/documents.json?date=${day}&type=1&Subscription-Key=${encodeURIComponent(key)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) }).catch((e) => e as Error);
  if (r instanceof Error) { say(`  documents.json for ${day}: no answer (${errText(r)})`); return; }
  const text = await r.text(), j = J(text), m = j?.metadata;
  say(`  documents.json for ${day} (metadata only): HTTP ${r.status}; ${m ? `metadata status ${m.status}, "${String(m.message ?? "").slice(0, 60)}", ${m.resultset?.count ?? "–"} documents` : j?.StatusCode != null ? `StatusCode ${j.StatusCode}, "${String(j.message ?? "").slice(0, 120)}"` : `${text.length} characters, not JSON`}${r.status === 200 && m?.status === "200" ? " (accepted)" : r.status === 401 || j?.StatusCode === 401 ? " (refused)" : ""}`);
}

// BLS Public Data API v2: one series (CPI-U, all items, not seasonally adjusted: CUUR0000SA0), this year and last,
// with the key in the body. BLS answers 200 with its own "status" and messages; a key it does not take is said in
// the messages.
async function bls(key: string): Promise<void> {
  const y = new Date().getUTCFullYear();
  const body = JSON.stringify({ seriesid: ["CUUR0000SA0"], startyear: String(y - 1), endyear: String(y), registrationkey: key });
  const r = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(TIMEOUT) }).catch((e) => e as Error);
  if (r instanceof Error) { say(`  v2 timeseries: no answer (${errText(r)})`); return; }
  const text = await r.text(), j = J(text);
  const msgs: string[] = Array.isArray(j?.message) ? j.message.map((x: unknown) => String(x).slice(0, 140)) : [];
  say(`  v2 timeseries (CUUR0000SA0, ${y - 1}-${y}): HTTP ${r.status}; status ${j?.status ?? "–"}; ${j?.Results?.series?.[0]?.data?.length ?? "–"} monthly values; messages: ${msgs.length ? msgs.join(" | ") : "none"}`);
}

const CHECKS: Record<(typeof NAMES)[number], (v: string) => Promise<void>> = { SEC_USER_AGENT: sec, EDINET_API_KEY: edinet, BLS_API_KEY: bls };

async function main(): Promise<void> {
  console.log(`the owner's source keys, checked at ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
  for (const name of NAMES) {
    const v = val(name);
    console.log(`\n== ${name}: ${v ? "set" : "not set"}`);
    if (v) await CHECKS[name](v).catch((e) => say(`  could not be tried: ${errText(e)}`));
  }
}
main().catch((e) => { say(`failed: ${errText(e)}`); process.exit(1); });
