// EDINET DB (Cabocia) over REST: the statements of a Tokyo-listed company for its stock page (Shota, 18 Nov 2026).
// This file only asks, rations and stores; what the answers mean is read in finsrc.ts (edinetFin), which is
// checked in sim/logic.test.ts without a network.
//
// Three answers make a company's statements:
//   annual      /companies/{code}/financials?period=annual&years=10            有価証券報告書, ten fiscal years
//   standalone  /companies/{code}/financials?period=quarterly_standalone&years=4   single quarters from the quarterly reports
//   earnings    /companies/{code}/earnings?limit=30                            決算短信: year-to-date results and guidance
// The provider allows a hundred requests a day on its free plan, so each answer is stored (asset_cache) and asked
// again only when it can have changed:
//   earnings    after a week; daily once the next 決算短信 is due (70 days after the last one)
//   annual, standalone   after thirty days; every second day while a full-year 決算短信 is out whose 有価証券報告書
//                        is not yet in the annual answer
// A request that fails falls back on the stored answer, however old: past statements do not change.
import { db } from "./db.ts";
import { fetchText } from "./http.ts";
import { edinetFin, edinetWaiting } from "./finsrc.ts";
import type { Fin } from "./fin.ts";

const EDB = "https://edinetdb.jp/v1";
const HOUR = 3600e3, DAY = 86400e3;
const DAILY_BUDGET = Number(Deno.env.get("EDINETDB_DAILY_BUDGET") ?? "90");
/** The provider's day is Japan's (its limit returns at 00:00 JST), so the count is kept per JST day. */
const jstDay = (ms = Date.now()): string => new Date(ms + 9 * HOUR).toISOString().slice(0, 10);

/** Counts `n` requests against today's allowance; false (and nothing counted) when they would exceed it. */
async function spend(n: number): Promise<boolean> {
  const key = `edb:budget:${jstDay()}`;
  const { data } = await db.from("asset_cache").select("payload").eq("key", key).maybeSingle();
  const used = Number((data?.payload as { used?: number } | null)?.used ?? 0);
  if (used + n > DAILY_BUDGET) return false;
  await db.from("asset_cache").upsert({ key, payload: { used: used + n }, fetched_at: new Date().toISOString() });
  return true;
}
async function ask(path: string, apiKey: string): Promise<unknown> {
  if (!(await spend(1))) throw new Error("today's EDINET DB allowance is used up");
  return JSON.parse(await fetchText(`${EDB}${path}`, { headers: { "x-api-key": apiKey, accept: "application/json" } }, 30000)) as unknown;
}

/** A stored answer while it is younger than `ttl(answer)`, otherwise asked again and stored (`asked` says which).
 *  If asking fails, the stored answer is used whatever its age; with none stored the error is the caller's. */
async function piece(key: string, ttl: (json: unknown) => number, f: () => Promise<unknown>): Promise<{ json: unknown; asked: boolean }> {
  const { data } = await db.from("asset_cache").select("payload,fetched_at").eq("key", key).maybeSingle();
  const old = data ? (data.payload as { json?: unknown } | null)?.json : undefined;
  if (data && old !== undefined && Date.now() - Date.parse(data.fetched_at) < ttl(old)) return { json: old, asked: false };
  try {
    const json = await f();
    await db.from("asset_cache").upsert({ key, payload: { json } as unknown as Record<string, unknown>, fetched_at: new Date().toISOString() });
    return { json, asked: true };
  } catch (e) {
    if (data && old !== undefined) { console.log(`edinet: ${key}: using the stored answer:`, e instanceof Error ? e.message : String(e)); return { json: old, asked: false }; }
    throw e;
  }
}

/** Securities code -> EDINET code. Kept a year once found; a code EDINET DB does not know is asked again after
 *  thirty days (a new listing appears there later). */
async function codeFor(sec: string, apiKey: string): Promise<string> {
  const { json } = await piece(`edb:id:${sec}`, (v) => (typeof v === "string" && v ? 365 * DAY : 30 * DAY), async () => {
    const cj = (await ask(`/companies?sec_code=${encodeURIComponent(sec)}&per_page=5`, apiKey)) as { data?: unknown; companies?: unknown } | unknown[];
    const list = (Array.isArray(cj) ? cj : Array.isArray(cj?.data) ? cj.data : Array.isArray(cj?.companies) ? cj.companies : []) as Array<Record<string, unknown>>;
    return String(list[0]?.edinet_code ?? list[0]?.edinetCode ?? "");
  });
  return typeof json === "string" ? json : "";
}

/** The statements of a Tokyo-listed company (symbol like "7203.T") from EDINET DB, or null when EDINET DB does
 *  not know the company (a fund, a foreign listing). Throws when no key is set, the day's allowance is used up or
 *  the annual answer cannot be had: the caller then lets another source stand in and says why. */
export async function edinetStatements(symbol: string): Promise<Fin | null> {
  const apiKey = Deno.env.get("EDINETDB_API_KEY");
  if (!apiKey) throw new Error("no EDINET DB key is set");
  const code = await codeFor(symbol.replace(/\.T$/, ""), apiKey);
  if (!code) return null;
  const now = Date.now();
  const quiet = (what: string) => (e: unknown): null => { console.log(`edinet: ${symbol} ${what}:`, e instanceof Error ? e.message : String(e)); return null; };
  // the 決算短信 first: it says whether the other two can have changed
  const earnings = (await piece(`edb:earn:${code}`, (old) => (edinetWaiting({ annual: null, standalone: null, earnings: old }, now).earnings ? 20 * HOUR : 7 * DAY),
    () => ask(`/companies/${code}/earnings?limit=30`, apiKey)).catch(quiet("earnings")))?.json ?? null;
  const annual = await piece(`edb:fin:${code}`, (old) => (edinetWaiting({ annual: old, standalone: null, earnings }, now).annual ? 2 * DAY : 30 * DAY),
    () => ask(`/companies/${code}/financials?period=annual&years=10`, apiKey));
  // asked whenever the annual answer was: a new 有価証券報告書 completes the fourth quarter here as well
  const standalone = (await piece(`edb:qs:${code}`, () => (annual.asked ? 0 : Infinity),
    () => ask(`/companies/${code}/financials?period=quarterly_standalone&years=4`, apiKey)).catch(quiet("quarters")))?.json ?? null;
  return edinetFin({ annual: annual.json, standalone, earnings }, new Date(now).toISOString().slice(0, 10));
}
