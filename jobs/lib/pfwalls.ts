// The paper portfolio's walls, as the live check reads them (P-1, 21 Nov 2026): the database's own look
// (pf_selftest, in the migration 20261121000001_pf_store.sql), which reads no portfolio and returns counts. Written
// here, handed its client, so that the logic checks can run it against a stand-in (DC-4 of the review of part 2a: no
// check held PV-5's fix, a wall down failing the run). It prints counts and one verdict; never an account, a
// portfolio's name, a note or a figure of any book: this repository's job logs are public.
// A function the database has just made may take a few seconds to be found by the API, and one request may meet a
// network error or a 5xx: the look is asked up to six times, `waitMs` apart, before it is called impossible.

/** The client's one call this needs. */
export type WallsDb = { rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** An error worth asking again for: the API has not found the function yet, or the request did not get through. */
export const TRY_AGAIN = /could not find|schema cache|does not exist|fetch failed|network|ECONN|ETIMEDOUT|timed? ?out|socket|\b5\d\d\b|PGRST000|bad gateway|service unavailable/i;

/** The look and its verdict: `ok` is false when a wall is down or the look could not be made (the caller's run then
 *  ends with a failure, so the workflow that runs it turns red), and the lines to print. */
export async function pfWalls(sb: WallsDb, waitMs = 10000): Promise<{ ok: boolean; lines: string[] }> {
  let r = await sb.rpc("pf_selftest");
  for (let k = 1; k < 6 && r.error && TRY_AGAIN.test(r.error.message); k++) { await new Promise((res) => setTimeout(res, waitMs)); r = await sb.rpc("pf_selftest"); }
  if (r.error) return { ok: false, lines: [`  pf_selftest could not be run: ${r.error.message}`] };
  const t = (r.data ?? {}) as Record<string, number | boolean | null>;
  const n = (k: string): string => (typeof t[k] === "number" ? String(t[k]) : "–");
  return { ok: t.ok === true, lines: [
    `  pf_selftest ${t.ok === true ? "ok" : "FAILED"}: ${n("rls")} of ${n("tables")} tables with row level security; ${n("openGrants")} privileges on them held by anon or authenticated, ${n("serviceRoleGrants")} by the server's own role, ${n("sequenceGrants")} on a sequence; ${n("openFunctions")} of its functions callable by anon or authenticated; ${n("rowsSeen")} rows seen as a made-up account; ${n("statements")} version(s) of the statement`,
    typeof t.functions === "number" && t.definerOwner === t.functions
      ? `  the second wall is in force: all ${n("functions")} functions run as the role the policies bind (${n("policies")} policies), and through the policies alone a made-up account sees ${n("rowsThroughPolicies")} rows`
      : `  the second wall is NOT in force: ${n("definerOwner")} of ${n("functions")} functions are owned by the role the policies bind; each function still names the account in every statement`,
  ] };
}
