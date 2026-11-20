// Two helpers every reader of the database uses, with no client of their own, so a module that is handed a client
// (pagefeed.ts) can use them outside the server too: under Node in sim/logic.test.ts and jobs/live_check.ts. db.ts
// exports them as before.

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
