
const CACHE_NAME = "precios-al-dia-v2";

const ARCHIVOS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const respuesta = await caches.match(event.request);
      return respuesta || new Response(
        "Sin conexión a Internet",
        {
          status: 503,
          headers: {"Content-Type": "text/plain; charset=utf-8"}
        }
      );
    })
  );
});
