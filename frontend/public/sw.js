/* global self, caches, fetch */
// DAES service worker — tiny, hand-written, no deps.
// Strategy:
//   - Precache the app shell (HTML fallback + static assets)
//   - Network-first for /api/* so live probes stay live
//   - Cache-first for static assets with a revalidate-in-background tail
//   - Respond with cached shell when offline and route is a page navigation
//   - Also handles Web Push notifications — see push / notificationclick.

const VERSION = "daes-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

// Routes we want available offline.
const APP_SHELL_ROUTES = [
  "/",
  "/bridge",
  "/bridge/sim",
  "/archetypes",
  "/accounts",
  "/audit",
  "/risk",
  "/design",
  "/docs",
  "/manifest.webmanifest",
  "/icon.svg",
  "/logo.svg",
  "/logo-mark.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Best-effort — if any route 404s we don't abort install
      await Promise.all(
        APP_SHELL_ROUTES.map((r) =>
          cache.add(r).catch(() => undefined),
        ),
      );
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches that aren't from this version
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Helpers
const isApi       = (url) => url.pathname.startsWith("/api/");
const isNavigate  = (req) => req.mode === "navigate";
const isAsset     = (url) =>
  url.pathname.startsWith("/_next/") ||
  /\.(svg|png|jpg|jpeg|webp|ico|css|woff2?|ttf|otf)$/i.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API: network-first, fall back to cache only if the request previously
  // succeeded (rare; we mostly want fresh).
  if (isApi(url)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          // Skip caching SSE / chunked streams
          const ct = fresh.headers.get("content-type") ?? "";
          if (!ct.includes("text/event-stream")) {
            const c = await caches.open(ASSET_CACHE);
            c.put(req, fresh.clone()).catch(() => undefined);
          }
          return fresh;
        } catch (e) {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ error: "offline", demo: true }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }
      })(),
    );
    return;
  }

  // Page navigation: network-first with shell fallback on failure.
  if (isNavigate(req)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const c = await caches.open(SHELL_CACHE);
          c.put(req, fresh.clone()).catch(() => undefined);
          return fresh;
        } catch {
          const cached = await caches.match(req) ?? await caches.match("/");
          return cached ?? new Response("Offline", { status: 503 });
        }
      })(),
    );
    return;
  }

  // Static assets: cache-first with network revalidation.
  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        const networkPromise = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone()).catch(() => undefined);
            return res;
          })
          .catch(() => null);
        return cached ?? (await networkPromise) ?? new Response("Offline", { status: 503 });
      })(),
    );
  }
});

/* ─── Web Push ───────────────────────────────────────────────────────── */

self.addEventListener("push", (event) => {
  const data = (() => {
    try { return event.data ? event.data.json() : {}; }
    catch { return { title: "DAES", body: event.data ? event.data.text() : "" }; }
  })();
  const title = data.title ?? "DAES";
  const options = {
    body: data.body ?? "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: data.url ?? "/" },
    tag: data.tag ?? "daes",
    renotify: Boolean(data.renotify),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        // If any open client can navigate, reuse it.
        if ("focus" in c && "navigate" in c) {
          await c.navigate(url);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});
