import { useEffect, useState } from "react";

/** What the page knows about its connection (Shota, 18 Nov 2026): whether the last request to the Monitor's
 *  server got through, and whether any screen is showing kept data (lib/keep.ts) instead of a fresh answer. */
let failing = false;
const kept = new Map<symbol, number>();   // one entry per panel showing kept data: when that data was received
const EVENT = "om:net";
/** Fired when a request gets through after requests had been failing: panels still showing kept data, or an
 *  error, ask again at once (lib/useApi.ts) instead of waiting for their own turn, which for some is half an hour. */
export const BACK_EVENT = "om:back";
const emit = () => window.dispatchEvent(new Event(EVENT));

/** A request reached the server (whatever it answered). */
export function netOk(): void { if (failing) { failing = false; emit(); window.dispatchEvent(new Event(BACK_EVENT)); } }
/** A request did not get through. */
export function netFail(): void { if (!failing) { failing = true; emit(); } }
/** A panel starts (`at`) or stops (null) showing kept data. */
export function keptShown(id: symbol, at: number | null): void {
  if (at == null) { if (kept.delete(id)) emit(); } else if (kept.get(id) !== at) { kept.set(id, at); emit(); }
}

export interface NetState { offline: boolean; keptAt: number | null }   // keptAt: the oldest kept data in view
const read = (): NetState => ({ offline: failing || navigator.onLine === false, keptAt: kept.size ? Math.min(...kept.values()) : null });
export function useNet(): NetState {
  const [s, setS] = useState(read);
  useEffect(() => {
    const f = () => setS(read());
    f();
    window.addEventListener(EVENT, f); window.addEventListener("online", f); window.addEventListener("offline", f);
    return () => { window.removeEventListener(EVENT, f); window.removeEventListener("online", f); window.removeEventListener("offline", f); };
  }, []);
  return s;
}
