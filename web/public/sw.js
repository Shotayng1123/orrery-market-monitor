// Orrery Monitor service worker (Shota, 18 Nov 2026). It shows the alerts the server pushes as notifications (at
// the foot of this file), and it keeps the app's own files on the device so the Monitor opens without a
// connection; the data itself is kept by the page (src/lib/keep.ts). Rules for the files:
//   the page         network first, asked past the browser's cache, so a new version is never held back here;
//                    the kept copy answers only when the network does not (or takes more than four seconds).
//                    Only the app's own page: another page in scope (the 1-minute tour, tour/) is the network's,
//                    never kept and never answered from here (slice 11, the designer's work order §7.4)
//   assets/*         kept forever: their names change with every build
//   icons, manifest  network first, the kept copy as a fallback
//   fonts            kept, refreshed in the background (Google Fonts: the stylesheet and the font files)
//   version.json, the API and everything else (the tour's film among it): never touched
// The name's v2 came with the tour (slice 11): the worker before it kept any page of its scope under the app's own key,
// the tour's page too, and the activation of this one removes that older cache (v1), once what it keeps has come over.
const CACHE = "om-shell-v2";
const SCOPE = new URL(self.registration.scope).pathname;   // "/orrery-market-monitor/"
const PAGE = self.registration.scope;                       // the key the page is kept under, whatever its query
const SLOW_MS = 4000;
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
const appPage = (u) => u.origin === self.location.origin && (u.pathname === SCOPE || u.pathname === SCOPE + "index.html");   // not another page of the scope (the tour's)
const older = async () => (await caches.keys()).filter((k) => k.startsWith("om-") && k !== CACHE);

// An update from a worker with an older cache (slice 11's fix of V11-1). The visit that brings this worker is answered
// by the one before it, and the page's "keep" at its load goes there too, so the device's copy of that visit is in the
// older cache: the activation brings it over before removing that cache, its page only if it is the app's own. And as
// the worker before v2 kept any page of its scope under the app's key, a first visit to the tour's page leaves no copy of
// the app's page there: the install keeps the app's page and the files it names, from the network, before this worker
// takes over (the worker before still answers meanwhile). A first visit, with no older cache, is left to its page's "keep".
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    if (!(await older()).length) return;
    const r = await fetch(PAGE, { cache: "no-cache" });
    if (!r.ok || r.redirected) return;
    const named = [...(await r.clone().text()).matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => new URL(m[1], PAGE)).filter((u) => u.origin === self.location.origin);
    await (await caches.open(CACHE)).put(PAGE, r);
    await keep(named.map(String));
  })().catch(() => undefined));
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const k of await older()) {
      const old = await caches.open(k);
      for (const req of await old.keys()) {
        const r = await old.match(req);
        if (r && !(await c.match(req)) && (req.url !== PAGE || (r.url && appPage(new URL(r.url))))) await c.put(req, r);
      }
      await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

// The page that installed this worker was loaded before it could listen: it sends the files it is made of.
self.addEventListener("message", (e) => {
  if (!e.data || e.data.type !== "keep" || !Array.isArray(e.data.urls)) return;
  e.waitUntil(keep(e.data.urls));
});
// what the page sends, and the files an update's install finds named in the app's page: the app's own files, and the fonts
async function keep(urls) {
  const c = await caches.open(CACHE);
  for (const raw of urls) {
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
}

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
    const rel = u.pathname.slice(SCOPE.length);
    // only the app's own page is kept and answered from here; another page in scope (the tour, tour/) is the network's
    if (req.mode === "navigate") { if (appPage(u)) e.respondWith(page(e)); return; }
    if (rel.startsWith("assets/")) { e.respondWith(forever(req)); return; }
    if (rel.startsWith("icons/") || rel === "manifest.webmanifest") { e.respondWith(networkFirst(req)); return; }
    return;
  }
  if (FONT_HOSTS.includes(u.hostname)) e.respondWith(keptThenRefresh(e));
});

// ---- alerts as notifications (the server's side: supabase/functions/_shared/push.ts) ----
// A message is { title, body, hash, tag }: the alert's line, its kind and time, and the screen a tap opens.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(typeof d.title === "string" && d.title ? d.title : "Orrery Monitor", {
    body: typeof d.body === "string" ? d.body : "", tag: typeof d.tag === "string" ? d.tag : undefined,
    data: { hash: typeof d.hash === "string" ? d.hash : "" }, icon: SCOPE + "icons/icon-192.png", badge: SCOPE + "icons/icon-192.png",
  }));
});
// A tap: the Monitor comes to the front on the screen the alert is about (an open window is told to go there, or a new one opens on it).
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const raw = e.notification.data && e.notification.data.hash, hash = typeof raw === "string" && /^#[A-Za-z0-9/%.^=&_-]*$/.test(raw) ? raw : "";
  e.waitUntil((async () => {
    const open = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).find((c) => c.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); open.postMessage({ type: "goto", hash }); return; }
    await self.clients.openWindow(self.registration.scope + hash);
  })());
});
