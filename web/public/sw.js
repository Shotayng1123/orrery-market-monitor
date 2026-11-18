// Orrery Monitor service worker (Shota, 18 Nov 2026). It keeps the app's own files on the device so the Monitor
// opens without a connection; the data itself is kept by the page (src/lib/keep.ts). Rules:
//   the page         network first, asked past the browser's cache, so a new version is never held back here;
//                    the kept copy answers only when the network does not (or takes more than four seconds)
//   assets/*         kept forever: their names change with every build
//   icons, manifest  network first, the kept copy as a fallback
//   fonts            kept, refreshed in the background (Google Fonts: the stylesheet and the font files)
//   version.json, the API and everything else: never touched
const CACHE = "om-shell-v1";
const SCOPE = new URL(self.registration.scope).pathname;   // "/orrery-market-monitor/"
const PAGE = self.registration.scope;                       // the key the page is kept under, whatever its query
const SLOW_MS = 4000;
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("om-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// The page that installed this worker was loaded before it could listen: it sends the files it is made of.
self.addEventListener("message", (e) => {
  if (!e.data || e.data.type !== "keep" || !Array.isArray(e.data.urls)) return;
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const raw of e.data.urls) {
      try {
        const u = new URL(raw, self.registration.scope);
        if (FONT_HOSTS.includes(u.hostname)) {   // the stylesheet is asked for the way the page asks (no CORS), the font files with it
          if (await c.match(u.href)) continue;
          const f = await fetch(u.href, u.hostname === "fonts.googleapis.com" ? { mode: "no-cors" } : {});
          if (f.ok || f.type === "opaque") await c.put(u.href, f);
          continue;
        }
        if (u.origin !== self.location.origin || !u.pathname.startsWith(SCOPE)) continue;
        const rel = u.pathname.slice(SCOPE.length);
        if (rel !== "" && !rel.startsWith("assets/") && !rel.startsWith("icons/") && rel !== "manifest.webmanifest") continue;   // not the API, not version.json
        const key = rel === "" ? PAGE : u.href;
        if (await c.match(key)) continue;
        const r = await fetch(u.href, { cache: "no-cache" });
        if (r.ok && !r.redirected) await c.put(key, r);
      } catch { /* offline or blocked: kept on a later visit */ }
    }
  })());
});

async function page(e) {
  const c = await caches.open(CACHE);
  const net = fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(async (r) => { if (r.ok && !r.redirected) await c.put(PAGE, r.clone()); return r; });
  const kept = await c.match(PAGE);
  if (!kept) return net;
  e.waitUntil(net.catch(() => undefined));   // a slow answer still refreshes the kept copy
  const first = await Promise.race([net.then((r) => (r.ok ? r : null), () => null), new Promise((res) => setTimeout(() => res(null), SLOW_MS))]);
  return first || kept;
}
async function forever(req) {
  const c = await caches.open(CACHE);
  const kept = await c.match(req.url);
  if (kept) return kept;
  const r = await fetch(req);
  if (r.ok) await c.put(req.url, r.clone());
  return r;
}
async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try { const r = await fetch(req); if (r.ok) await c.put(req.url, r.clone()); return r; }
  catch (err) { const kept = await c.match(req.url); if (kept) return kept; throw err; }
}
async function keptThenRefresh(e) {
  const c = await caches.open(CACHE);
  const kept = await c.match(e.request.url);
  const net = fetch(e.request).then(async (r) => { if (r.ok || r.type === "opaque") await c.put(e.request.url, r.clone()); return r; });
  if (!kept) return net;
  e.waitUntil(net.catch(() => undefined));
  return kept;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (!u.pathname.startsWith(SCOPE)) return;
    if (req.mode === "navigate") { e.respondWith(page(e)); return; }
    const rel = u.pathname.slice(SCOPE.length);
    if (rel.startsWith("assets/")) { e.respondWith(forever(req)); return; }
    if (rel.startsWith("icons/") || rel === "manifest.webmanifest") { e.respondWith(networkFirst(req)); return; }
    return;
  }
  if (FONT_HOSTS.includes(u.hostname)) e.respondWith(keptThenRefresh(e));
});
