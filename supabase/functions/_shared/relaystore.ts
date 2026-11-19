// The two notes the machines of the second path leave each other (_shared/relay.ts), in `snapshots`: 'feed_own'
// by the server's tick, every minute, saying how far behind its own answers are; 'relay' by the relay on GitHub,
// every minute while it is writing.
import { db } from "./db.ts";
import { beatFresh, type Reading, type RelayNote } from "./relay.ts";

export async function saveOwn(r: Reading): Promise<void> {
  const { error } = await db.from("snapshots").upsert({ key: "feed_own", payload: r, at: r.at }, { onConflict: "key" });
  if (error) throw new Error("feed_own: " + error.message);
}
export async function readOwn(): Promise<Reading | null> {
  const { data } = await db.from("snapshots").select("payload").eq("key", "feed_own").maybeSingle();
  return ((data as { payload: Reading } | null)?.payload) ?? null;
}
export async function relayNote(): Promise<RelayNote | null> {
  const { data } = await db.from("snapshots").select("payload").eq("key", "relay").maybeSingle();
  return ((data as { payload: RelayNote } | null)?.payload) ?? null;
}
/** The relay's beat: `at` null says it has ended (the server carries on at its next minute). */
export async function relayBeat(n: RelayNote): Promise<void> {
  const { error } = await db.from("snapshots").upsert({ key: "relay", payload: n, at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error("relay: " + error.message);
}
/** Whether a relay is writing right now. A read that fails counts as no: the server must not stop on a doubt. */
export async function relayOn(nowMs: number = Date.now()): Promise<RelayNote | null> {
  try { const n = await relayNote(); return n && beatFresh(n.at, nowMs) ? n : null; } catch { return null; }
}
