// The market table: one row per active instrument with last print, period anchors and % changes.
// Rebuilt by `tick` once a minute (and by `daily` after history runs) into snapshots.key = 'table'. The rows are worked
// out in tablecore.ts, which is handed this server's client (and the logic checks' stand-in: FH-3, 22 Nov 2026).
import { db } from "./db.ts";
import { partsIn, type Holidays } from "./sessions.ts";
import { computeTableWith, loadHolidaysWith, type TableRow } from "./tablecore.ts";

export type { TableRow };
export const loadHolidays = (): Promise<Holidays> => loadHolidaysWith(db);
export const computeTable = (now: Date = new Date()): Promise<{ rows: TableRow[]; asOf: string }> => computeTableWith(db, now);

export async function saveTableSnapshot(now: Date = new Date()): Promise<number> {
  const t = await computeTable(now);
  const { error } = await db.from("snapshots").upsert({ key: "table", payload: t, at: t.asOf }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return t.rows.length;
}

export const todayIn = (tz: string, now: Date = new Date()): string => partsIn(tz, now).ymd;
