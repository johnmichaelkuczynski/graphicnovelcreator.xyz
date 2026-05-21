// Minimal service worker so Chrome/Edge treat the app as installable on
// Windows, macOS, and Android. We deliberately do NOT cache anything —
// stale caches caused user-visible breakage in the past and the install
// criteria only require that a fetch handler exists, not that it caches.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through. Network is the source of truth.
  event.respondWith(fetch(event.request));
});
