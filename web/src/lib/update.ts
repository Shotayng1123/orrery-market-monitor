import { useCallback, useEffect, useState } from "react";

/** Noticing that a newer version of the Monitor has been published (Shota, 18 Nov 2026). An open page keeps the
 *  code it started with: the data refreshes every minute, the layout does not. The host also lets a browser reuse
 *  the page for ten minutes, so even closing and reopening the app could bring the old one back. Each build has an
 *  id (vite.config.ts) and writes it to version.json; the page asks for that file once a minute and whenever it
 *  comes back into view, past every cache, and offers to update when the id is no longer its own. */
export const BUILD_ID: string = __BUILD_ID__;
const TRIED_KEY = "om_upd_tried", RETRY_MS = 5 * 60e3, EVERY_MS = 60e3;

// "?v=<id>" is how an update is loaded (a new address, so no cache can answer it with the old page); remove it
// from the address once the page is up
(() => {
  try {
    document.documentElement.dataset.build = BUILD_ID;
    const u = new URL(location.href);
    if (!u.searchParams.has("v")) return;
    u.searchParams.delete("v");
    history.replaceState(null, "", u.pathname + u.search + u.hash);
  } catch { /* the parameter stays in the address */ }
})();

/** The id of the newest published build, or null when it cannot be read (offline, or a dev server without the file). */
export async function latestBuild(): Promise<string | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { id?: unknown };
    return typeof j.id === "string" && j.id ? j.id : null;
  } catch { return null; }
}

/** An update was asked for and the page that came back was still the old build (a cache in between had not caught
 *  up): do not offer the same one again for a few minutes. */
function triedLately(id: string): boolean {
  try { const t = JSON.parse(sessionStorage.getItem(TRIED_KEY) ?? "null") as { id: string; at: number } | null; return !!t && t.id === id && Date.now() - t.at < RETRY_MS; } catch { return false; }
}

/** `id`: a newer build than this page, when there is one. `apply` loads it. */
export function useUpdate(): { id: string | null; apply: () => void } {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const check = async () => { const latest = await latestBuild(); if (live) setId(latest && latest !== BUILD_ID && !triedLately(latest) ? latest : null); };
    void check();
    const t = setInterval(() => { if (document.visibilityState === "visible") void check(); }, EVERY_MS);
    const seen = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", seen);
    window.addEventListener("pageshow", seen);
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", seen); window.removeEventListener("pageshow", seen); };
  }, []);
  const apply = useCallback(() => {
    if (!id) return;
    try { sessionStorage.setItem(TRIED_KEY, JSON.stringify({ id, at: Date.now() })); } catch { /* not kept */ }
    const u = new URL(location.href);
    u.searchParams.set("v", id);
    location.replace(u.toString());
  }, [id]);
  return { id, apply };
}
