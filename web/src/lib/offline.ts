/** Registers the service worker that keeps the app's files on the device (public/sw.js), in published builds only:
 *  a dev server's files change under it. The page that first installs the worker was loaded before the worker
 *  could listen, so it tells the worker which files it is made of. */
export function startOffline(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  // a tapped notification asks the open window to show the screen its alert is about (public/sw.js)
  navigator.serviceWorker.addEventListener("message", (e) => { const d = e.data as { type?: string; hash?: string } | null; if (d?.type === "goto" && typeof d.hash === "string" && d.hash.startsWith("#")) location.hash = d.hash; });
  const go = () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).then(async () => {
      const reg = await navigator.serviceWorker.ready;
      // the page, what its markup names, and what it has actually loaded (which adds the font files)
      const urls = [...new Set([base, ...[...document.querySelectorAll<HTMLScriptElement>("script[src]")].map((s) => s.src),
        ...[...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"], link[rel="manifest"], link[rel="apple-touch-icon"]')].map((l) => l.href),
        ...performance.getEntriesByType("resource").map((e) => e.name)])];
      reg.active?.postMessage({ type: "keep", urls });
    }).catch(() => { /* no worker (a private window, an old browser): the Monitor works as before, online only */ });
  };
  if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
}
