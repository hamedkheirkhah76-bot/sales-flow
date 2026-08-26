/* SalesFlow Service Worker - UI cache refresh */
const CACHE_VERSION = "salesflow-v9-ui";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles-base.css",
  "./ui-modern.css",
  "./app.js",
  "./xlsx.full.min.js",
  "./manifest.json",
  "./fonts/Vazirmatn-Regular.woff2",
  "./fonts/Vazirmatn-Medium.woff2",
  "./fonts/Vazirmatn-SemiBold.woff2",
  "./fonts/Vazirmatn-Bold.woff2",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/favicon.png",
  "./assets/logo.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
