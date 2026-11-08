
const CACHE_NAME = "precios-al-dia-v3";

const ARCHIVOS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Instalación y almacenamiento de archivos
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

// Activación y limpieza de versiones anteriores
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Funcionamiento sin conexión
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copia = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, copia));
        }
        return response;
      })
      .catch(async () => {
        const respuesta = await caches.match(event.request);

        if (respuesta) return respuesta;

        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }

        return new Response("Sin conexión a Internet", {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8"
          }
        });
      })
  );
});
