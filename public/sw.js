// Jobnest Academy: lets the portal be added to the home screen.
// It never intercepts requests: pages and files always come straight from the network,
// so a slow or failed request shows the browser's normal retry page instead of a dead end.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", () => {});
