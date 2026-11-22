// The last data each screen received, kept on the device (Shota, 18 Nov 2026) so that a screen opened without a
// connection, or on a slow one, shows what it last had instead of nothing (lib/useApi.ts decides when). One entry
// per signed-in account, request and parameters, in the browser's own database; a week old at most, and emptied
// at sign-out and at a start of the page that finds no sign-in (App.tsx: a sign-in that was not to be remembered
// ended with its tab). An answer is stored only while the sign-in it was asked with is still the one in hand
// (lib/useApi.ts, lib/pf.ts). This file must not import lib/api.ts (which empties the store).
const DB = "om-keep", STORE = "api", MAX_AGE_MS = 7 * 86400e3;
export interface Kept<T> { at: number; data: T }

let opening: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
      r.onsuccess = () => { res(r.result); prune(r.result); };
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch { res(null); }   // no database in this browser (some private windows): nothing is kept
  });
  return opening;
}
/** Once per visit: entries older than a week go. */
function prune(db: IDBDatabase): void {
  try {
    const rq = db.transaction(STORE, "readwrite").objectStore(STORE).openCursor();
    rq.onsuccess = () => { const c = rq.result; if (!c) return; if (Date.now() - ((c.value as Kept<unknown>).at ?? 0) > MAX_AGE_MS) c.delete(); c.continue(); };
  } catch { /* ignore */ }
}

/** The key of a request: the account, the action and its parameters without `v` (a counter some requests carry
 *  only to be asked again, which would give every change its own entry). */
export function keepKey(user: string | null, action: string, params: Record<string, string | number | boolean | undefined> | undefined): string {
  const p: Record<string, string | number | boolean> = {};
  for (const k of Object.keys(params ?? {}).sort()) { const v = params![k]; if (k !== "v" && v !== undefined) p[k] = v; }
  return `${user ?? "-"}|${action}|${JSON.stringify(p)}`;
}
export async function keepGet<T>(key: string): Promise<Kept<T> | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((res) => {
    try {
      const rq = db.transaction(STORE).objectStore(STORE).get(key);
      rq.onsuccess = () => { const v = rq.result as Kept<T> | undefined; res(v && Date.now() - v.at < MAX_AGE_MS ? v : null); };
      rq.onerror = () => res(null);
    } catch { res(null); }
  });
}
export function keepSet(key: string, data: unknown): void {
  void open().then((db) => { if (!db) return; try { db.transaction(STORE, "readwrite").objectStore(STORE).put({ at: Date.now(), data } satisfies Kept<unknown>, key); } catch { /* too large or not storable: not kept */ } });
}
/** One entry goes (a book that was deleted: its last answer must not stand in for it). */
export function keepDel(key: string): void {
  void open().then((db) => { if (!db) return; try { db.transaction(STORE, "readwrite").objectStore(STORE).delete(key); } catch { /* nothing to remove */ } });
}
export async function keepClear(): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((res) => { try { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).clear(); t.oncomplete = () => res(); t.onerror = () => res(); t.onabort = () => res(); } catch { res(); } });
}
