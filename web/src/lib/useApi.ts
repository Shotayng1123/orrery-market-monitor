import { useEffect, useRef, useState } from "react";
import { api, apiConfigured, getToken, tokenId } from "./api";
import { keepGet, keepKey, keepSet } from "./keep";
import { BACK_EVENT, keptShown } from "./net";
import { mockAction } from "./mock";
import { held } from "./hold";

/** `keptAt`: set when `data` is not a fresh answer but what this screen last received (lib/keep.ts), with the
 *  time it was received. */
export interface ApiState<T> { data: T | null; error: string | null; loading: boolean; keptAt?: number | null }

// Dev-only synthetic feed (`VITE_DEV_MOCK=1 npm run dev`); compiled out of production builds.
export const DEV_MOCK = import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK === "1";

const SLOW_MS = 1500;                          // an empty panel waits this long for its answer before showing kept data
const NOT_KEPT = new Set(["search"]);          // answers to what is being typed

/** Fetches `action` once and again whenever `tick` changes (the app-level refresh counter). Keeps the last
 *  good payload on error so a failed refresh never blanks a panel. A panel that has nothing yet (a screen just
 *  opened) and gets no answer, or none within a second and a half, shows what it last received on this device;
 *  a fresh answer replaces it. Data already on screen is never replaced by kept data. When the connection comes
 *  back, a panel showing kept data or an error asks again at once, whatever its own refresh rhythm. */
export function useApi<T>(action: string | null, params: Record<string, string | number | boolean | undefined> | undefined, tick: number): ApiState<T> {
  const [state, set] = useState<ApiState<T>>({ data: null, error: null, loading: !!action && (apiConfigured || DEV_MOCK), keptAt: null });
  const key = JSON.stringify(params ?? {});
  const [again, setAgain] = useState(0);
  const waiting = useRef(false);
  waiting.current = state.keptAt != null || state.error != null;
  useEffect(() => { const f = () => { if (waiting.current) setAgain((n) => n + 1); }; window.addEventListener(BACK_EVENT, f); return () => window.removeEventListener(BACK_EVENT, f); }, []);
  useEffect(() => {
    if (!action) return;
    if (DEV_MOCK) {
      // as with real answers: nothing is put on screen while the opening plays
      let on = true; const put = () => { if (on) set({ data: mockAction(action, params) as T, error: null, loading: false, keptAt: null }); }, w = held();
      if (w) void w.then(put); else put();
      return () => { on = false; };
    }
    if (!apiConfigured) { set({ data: null, error: "API not configured (VITE_API_URL)", loading: false, keptAt: null }); return; }
    let alive = true, answered = false;
    const kk = NOT_KEPT.has(action) ? null : keepKey(tokenId(getToken()), action, params);
    const fill = async (error: string | null, loading: boolean) => {
      const kept = kk ? await keepGet<T>(kk) : null;
      if (!alive || (loading && answered)) return;   // the answer arrived while the store was being read
      set((s) => (s.data != null ? { ...s, error: error ?? s.error, loading } : kept ? { data: kept.data, error, loading, keptAt: kept.at } : { ...s, error: error ?? s.error, loading }));
    };
    // "no answer yet" is counted from the end of the opening: while it plays the answers are held on purpose
    let slow: ReturnType<typeof setTimeout> | undefined;
    const arm = () => { if (alive && !answered) slow = setTimeout(() => { if (!answered) void fill(null, true); }, SLOW_MS); }, w = held();
    if (w) void w.then(arm); else arm();
    set((s) => ({ ...s, loading: true }));
    api<T>(action, params)
      .then((d) => { answered = true; clearTimeout(slow); if (alive) set({ data: d, error: null, loading: false, keptAt: null }); if (kk) keepSet(kk, d); })
      .catch((e: unknown) => { answered = true; clearTimeout(slow); if (alive) void fill(e instanceof Error ? e.message : String(e), false); });
    return () => { alive = false; clearTimeout(slow); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, key, tick, again]);
  // the connection bar (components/FootBars.tsx) says when any panel is showing kept data
  const id = useRef(Symbol("panel"));
  const keptAt = state.keptAt ?? null;
  useEffect(() => { keptShown(id.current, keptAt); const me = id.current; return () => keptShown(me, null); }, [keptAt]);
  return state;
}
