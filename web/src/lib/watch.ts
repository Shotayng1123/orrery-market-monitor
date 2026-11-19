// The signed-in user's watchlist: the symbols they have starred. Kept on the server (so the laptop and the
// phone agree), loaded once per session and shared by every star on the page. In the dev server's mock feed
// (VITE_DEV_MOCK=1) the list is the mock's, kept in this browser (lib/mock.ts), so the star, the add box and
// removal can be tried in the local copy.
import { useEffect, useState } from "react";
import { api } from "./api";
import { DEV_MOCK } from "./useApi";
import { mockWatchSet, mockWatchSyms } from "./mock";

let symbols: Set<string> | null = null;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function load(): Promise<void> {
  loading ??= (DEV_MOCK ? Promise.resolve(mockWatchSyms()) : api<{ symbols: string[] }>("watch_syms")).then((r) => { symbols = new Set(r.symbols); emit(); }).catch(() => { symbols = new Set(); loading = null; emit(); });
  return loading;
}

/** Adds or removes a symbol. The star flips at once and is put back if the server refuses. */
export async function setWatched(symbol: string, on: boolean, name?: string): Promise<string | null> {
  const before = new Set(symbols ?? []);
  symbols = new Set(before); if (on) symbols.add(symbol); else symbols.delete(symbol);
  emit();
  try {
    const r = DEV_MOCK ? mockWatchSet(symbol, on, name) : await api<{ symbols: string[] }>("watch_set", undefined, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol, on, name }) });
    symbols = new Set(r.symbols); emit();
    return null;
  } catch (e) { symbols = before; emit(); return e instanceof Error ? e.message : String(e); }
}

/** The watched symbols (empty until loaded) and a version counter that changes whenever the list does. */
export function useWatch(): { has: (s: string) => boolean; list: string[]; ready: boolean; version: number } {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const f = () => setVersion((v) => v + 1);
    subs.add(f);
    if (!symbols) void load();
    return () => { subs.delete(f); };
  }, []);
  return { has: (s) => !!symbols?.has(s), list: [...(symbols ?? [])], ready: symbols != null, version };
}
