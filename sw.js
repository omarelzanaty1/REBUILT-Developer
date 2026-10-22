/* REBUILT — retired service worker (kill switch).

   An earlier build shipped a cache-first service worker with a fixed file list. A browser that
   installed it would keep serving the old files and never show an updated deployment. The app no
   longer registers any service worker, so this file only exists to clean up after that one:
   if a browser still has the old worker, it picks this version up on its next visit, deletes the
   old caches, unregisters itself and reloads the open tabs from the network.

   Browsers that never installed a worker never fetch this file. There is deliberately no fetch
   handler, so requests always go straight to the network. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (e) { /* nothing to clear */ }
      try {
        await self.registration.unregister();
      } catch (e) { /* already gone */ }
      try {
        const windows = await self.clients.matchAll({ type: "window" });
        windows.forEach((client) => { try { client.navigate(client.url); } catch (e) { /* tab closed */ } });
      } catch (e) { /* no open tabs */ }
    })()
  );
});
