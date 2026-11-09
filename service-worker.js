"use strict";

const CACHE_NAME = "precios-al-dia-v6";

const ARCHIVOS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

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

self.addEventListener("fetch", event => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  // No almacenar respuestas de la API.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(req)
      .then(async response => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(req, response.clone());
        }

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(req);

        if (cached) return cached;

        if (req.mode === "navigate") {
          const home = await caches.match("./index.html");
          if (home) return home;
        }

        return new Response(
          "Sin conexión a Internet",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          }
        );
      })
  );
});