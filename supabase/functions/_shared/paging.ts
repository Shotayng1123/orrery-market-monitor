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

/** The rows of the first of `sets` (lists of columns, fullest first) the database answers: one from before a migration
 *  that added columns is read with the columns it has, as before the migration (`set`: the list that answered). A failed
 *  read moves to the next list only where `fallBack` says so (every failure, unless one is handed in). */
// deno-lint-ignore no-explicit-any
export async function selectCols<T>(build: (cols: string) => any, sets: string[], fallBack: (e: unknown) => boolean = () => true): Promise<{ rows: T[]; set: number }> {
  for (let i = 0; ; i++) {
    try { return { rows: await selectAll<T>(() => build(sets[i])), set: i }; }
    catch (e) { if (i + 1 >= sets.length || !fallBack(e)) throw e; }
  }
}

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
