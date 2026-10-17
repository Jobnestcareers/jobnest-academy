// Jobnest Academy: lets the portal be added to the home screen. Pages always load fresh from the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then((r) => r || new Response("You're offline. Check your connection and try again.", { status: 503, headers: { "Content-Type": "text/plain" } }))));
});
