// Service-role client and the two bookkeeping writes every job makes.
import { createClient } from "npm:@supabase/supabase-js@2";

export const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

export async function logRun(job: string, ok: boolean, detail: string, startedAt: number): Promise<void> {
  await db.from("job_runs").insert({ job, ok, detail: detail.slice(0, 2000), ms: Date.now() - startedAt });
}

export async function sourceOk(name: string): Promise<void> {
  await db.from("source_status").upsert({ name, last_ok: new Date().toISOString() }, { onConflict: "name" });
}
export async function sourceErr(name: string, err: unknown): Promise<void> {
  await db.from("source_status").upsert({ name, last_error: String(err instanceof Error ? err.message : err).slice(0, 500), last_error_at: new Date().toISOString() }, { onConflict: "name" });
}

/** PostgREST caps a response at 1,000 rows; this pages through a query until it runs dry. */
// deno-lint-ignore no-explicit-any
export async function selectAll<T>(build: () => any, pageSize = 1000, maxRows = 50000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export interface InstrumentRow {
  symbol: string; name: string; cls: string; grp: string; market: string; tz: string; currency: string; decimals: number;
  proxy_for: string | null; provider: string; provider_symbol: string | null; ord: number; active: boolean; notes: string | null;
}
