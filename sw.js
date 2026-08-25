/* SalesFlow Service Worker
   Caches the app shell for offline use. */

const CACHE_VERSION = "salesflow-v5";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
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
];

const SALESFLOW_PATCH = `
/* SalesFlow v5 compatibility patch: normalize Excel text/codes before matching. */
(function () {
  const originalComputeSalesReport = window.computeSalesReport;
  if (typeof originalComputeSalesReport !== "function") return;

  function normalizeCell(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return value;
    let s = String(value)
      .replace(/[يى]/g, "ی")
      .replace(/[ك]/g, "ک")
      .replace(/[ۀة]/g, "ه")
      .replace(/[\u200c\u200d\u200e\u200f]/g, "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .trim();
    s = s.replace(/,/g, "");
    if (/^[+-]?\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
    return s;
  }

  window.computeSalesReport = function (rows, columnMap, lines, productMap, groupsById) {
    const normalizedLines = {
      ...lines,
      line1: { ...lines.line1, excelValue: normalizeCell(lines.line1 && lines.line1.excelValue) },
      line2: { ...lines.line2, excelValue: normalizeCell(lines.line2 && lines.line2.excelValue) },
    };

    const normalizedRows = rows.map((row) => {
      const copy = { ...row };
      for (const key of Object.keys(copy)) copy[key] = normalizeCell(copy[key]);
      return copy;
    });

    const normalizedProductMap = new Map();
    for (const [key, product] of productMap.entries()) {
      normalizedProductMap.set(normalizeCell(key), product);
    }

    return originalComputeSalesReport(
      normalizedRows,
      columnMap,
      normalizedLines,
      normalizedProductMap,
      groupsById
    );
  };
})();
`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        if (new URL(event.request.url).pathname.endsWith("/app.js")) {
          return cached.text().then((text) =>
            new Response(text + "\n" + SALESFLOW_PATCH, {
              status: cached.status,
              statusText: cached.statusText,
              headers: cached.headers,
            })
          );
        }
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }

          if (new URL(event.request.url).pathname.endsWith("/app.js")) {
            return response.text().then((text) =>
              new Response(text + "\n" + SALESFLOW_PATCH, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
              })
            );
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
