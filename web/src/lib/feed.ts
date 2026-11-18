import { useEffect, useState } from "react";
import type { Health } from "./types";

/** Whether the price feed has stopped (19 Nov 2026): the server's own reading (supabase/functions/_shared/
 *  feedhealth.ts), kept here so that the bar at the foot of every screen can say so. On 18 Nov every price on
 *  screen was an hour and a half old with New York open, and nothing said it: the jobs were on time. */
export interface FeedStopped { since: string; lateMin: number }
let state: FeedStopped | null = null;
const EVENT = "om:feed";

/** Called with each health answer (null when it could not be had: then nothing is known, and nothing is claimed). */
export function feedFrom(h: Health | null): void {
  const f = h?.feed, next = f && f.expected && !f.ok && f.newest && f.lateMin != null ? { since: f.newest, lateMin: f.lateMin } : null;
  if (next?.since === state?.since && next?.lateMin === state?.lateMin) return;
  state = next; window.dispatchEvent(new Event(EVENT));
}
export function useFeedStopped(): FeedStopped | null {
  const [s, setS] = useState(state);
  useEffect(() => { const f = () => setS(state); f(); window.addEventListener(EVENT, f); return () => window.removeEventListener(EVENT, f); }, []);
  return s;
}
/** "1 h 39 min" / "45 min". */
export const lateText = (min: number): string => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`);
