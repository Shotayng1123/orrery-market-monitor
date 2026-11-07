// Service-role Supabase client for the batch jobs (GitHub Actions or this PC).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Pages through a PostgREST query (1,000-row cap per response). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export const SGT = "Asia/Singapore";
export function ymdIn(tz: string, d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
