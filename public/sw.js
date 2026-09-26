// RECALL service worker: makes the app installable and quick to open.
// It only caches the app's own static files (never your cards; those always come from Supabase).
const CACHE = "recall-static-v1";

const OFFLINE_PAGE = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RECALL</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#06070A;color:#A7AEBA;font-family:system-ui,sans-serif;text-align:center">
<div><p style="letter-spacing:.3em;color:#E9ECF1">RECALL</p><p>You're offline. Connect to the internet and reopen the app.</p></div>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Build files have unique names, so a cached copy is always correct.
  if (url.pathname.includes("/_next/static/") || url.pathname.includes("/icons/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } })),
    );
  }
});
