// Minimal pass-through Service Worker for AM Jewellery Customer App installability
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Always use network for live ERP & customer order data
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});
