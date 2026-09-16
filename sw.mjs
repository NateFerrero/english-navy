const VERSION = "v2";
const CACHE_NAME = `english-navy-${VERSION}`;

// Keep this list intentionally small and stable; cache-on-demand fills in the rest.
const PRECACHE = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/offline.html",
  "/sw.mjs",
  "/src/app.mjs",
  "/src/router.mjs",
  "/src/layout.mjs",
  "/src/theme.mjs",
  "/src/ui.mjs",
  "/src/session.mjs",
  "/src/pwa.mjs",
  "/src/api/index.mjs",
  "/src/api/mock.mjs",
  "/src/api/real.mjs",
  "/src/views/home.mjs",
  "/src/views/signup.mjs",
  "/src/views/signin.mjs",
  "/src/views/welcome.mjs",
  "/src/views/profile.mjs",
  "/src/views/settings.mjs",
  "/src/views/log.mjs",
  "/src/views/notfound.mjs",
  "/icons/favicon.svg",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable.svg",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE);
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("english-navy-") && k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put("/index.html", network.clone());
          return network;
        } catch {
          return (await caches.match("/index.html")) || (await caches.match("/offline.html"));
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) {
        event.waitUntil(
          (async () => {
            try {
              const fresh = await fetch(request);
              const cache = await caches.open(CACHE_NAME);
              await cache.put(request, fresh.clone());
            } catch {
              /* ignore */
            }
          })()
        );
        return cached;
      }

      try {
        const network = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, network.clone());
        return network;
      } catch {
        return new Response("", { status: 504 });
      }
    })()
  );
});
