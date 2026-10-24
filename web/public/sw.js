/* Minimal safe service worker. Caches only same-origin static assets (Next build files, icons, manifest).
   Never touches /api, HTML pages, non-GET requests, or anything carrying game state. */
const CACHE = "mm-static-v1";
const STATIC = /^\/(_next\/static\/|icon\.svg$|icon-maskable\.svg$|manifest\.webmanifest$)/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !STATIC.test(url.pathname)) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    })
  );
});
