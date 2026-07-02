// InspectFlow Service Worker
// Caches static assets and pages for offline use.
// API routes are NEVER intercepted — they require the server.

const CACHE_NAME = "inspectflow-v1";

// Core assets to pre-cache on install
const PRE_CACHE = ["/", "/smart-inspection"];

// ── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRE_CACHE))
      .catch(() => {
        // Pre-cache failures are non-critical; SW still installs
      })
  );
  // Take control immediately without waiting for old SW to finish
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );
  // Claim all open clients immediately
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only intercept GET requests
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // NEVER intercept API routes — they need the server
  if (url.pathname.startsWith("/api/")) return;

  // Skip chrome-extension and other non-http schemes
  if (!url.protocol.startsWith("http")) return;

  // ── External requests (fonts, CDN) ────────────────────────────────────────
  if (url.origin !== self.location.origin) {
    // Cache-first for Google Fonts
    if (
      url.hostname.includes("fonts.googleapis.com") ||
      url.hostname.includes("fonts.gstatic.com")
    ) {
      event.respondWith(
        caches.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              if (response.ok) {
                const clone = response.clone();
                caches
                  .open(CACHE_NAME)
                  .then((cache) => cache.put(request, clone));
              }
              return response;
            })
        )
      );
    }
    return;
  }

  // ── Next.js static assets — cache-first ───────────────────────────────────
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // ── Static file extensions — cache-first ──────────────────────────────────
  if (/\.(png|jpg|jpeg|svg|ico|webp|gif|woff2?|ttf|otf|css)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // ── HTML / navigation — network-first, fallback to cache ──────────────────
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
