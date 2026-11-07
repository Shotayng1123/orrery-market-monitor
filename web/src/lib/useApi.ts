import { useEffect, useState } from "react";
import { api, apiConfigured } from "./api";
import { mockAction } from "./mock";

export interface ApiState<T> { data: T | null; error: string | null; loading: boolean }

// Dev-only synthetic feed (`VITE_DEV_MOCK=1 npm run dev`); compiled out of production builds.
export const DEV_MOCK = import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK === "1";

/** Fetches `action` once and again whenever `tick` changes (the app-level refresh counter). Keeps the last
 *  good payload on error so a failed refresh never blanks a panel. */
export function useApi<T>(action: string | null, params: Record<string, string | number | boolean | undefined> | undefined, tick: number): ApiState<T> {
  const [state, set] = useState<ApiState<T>>({ data: null, error: null, loading: !!action && (apiConfigured || DEV_MOCK) });
  const key = JSON.stringify(params ?? {});
  useEffect(() => {
    if (!action) return;
    if (DEV_MOCK) { set({ data: mockAction(action, params) as T, error: null, loading: false }); return; }
    if (!apiConfigured) { set({ data: null, error: "API not configured (VITE_API_URL)", loading: false }); return; }
    let alive = true;
    set((s) => ({ ...s, loading: true }));
    api<T>(action, params)
      .then((d) => { if (alive) set({ data: d, error: null, loading: false }); })
      .catch((e: unknown) => { if (alive) set((s) => ({ data: s.data, error: e instanceof Error ? e.message : String(e), loading: false })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, key, tick]);
  return state;
}
