// Service Worker for AM Jewellery Customer App (network-first with safe fallback)
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response("Offline — please check your internet connection.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        })
    )
  );
});
