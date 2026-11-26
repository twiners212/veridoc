// VeriDoc PWA Service Worker
// Compliance: DEC-07 & docs/SECURITY.md §5.2
// STRICT MANDATE: NO offline caching of SOP PDFs, signed preview URLs, or controlled document payloads.
// Immediate access revocation requires live network verification.

const CACHE_NAME = "veridoc-shell-v1";
const STATIC_SHELL_ASSETS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// Patterns that MUST NEVER be cached under any circumstances (DEC-07)
const NEVER_CACHE_PATTERNS = [
  /\/api\/documents\/.*\/preview-url/,
  /\/api\/documents\/.*\/upload/,
  /\/api\/acknowledgments/,
  /\/api\/auth/,
  /\.pdf($|\?)/i,
  /supabase.*storage/i,
  /veridoc-controlled-docs/i,
];

function shouldNeverCache(url) {
  return NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(url));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_SHELL_ASSETS).catch(() => {
        // Ignore if icons do not exist yet in dev
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = event.request.url;

  // DEC-07 ENFORCEMENT: Never intercept or cache sensitive document previews, PDFs, or auth calls
  if (shouldNeverCache(requestUrl) || event.request.method !== "GET") {
    // Pass straight to network without Service Worker caching
    return;
  }

  // Network-first strategy for navigation and static assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        // Fall back to cache for static shell assets only if network is offline
        return caches.match(event.request);
      })
  );
});
