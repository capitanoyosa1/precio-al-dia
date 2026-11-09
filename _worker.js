const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });

const clean = (value, max = 100) =>
  String(value || "").trim().slice(0, max);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return json({ error: "Método no permitido" }, 405);
    }

    if (url.pathname === "/api/status") {
      return json({
        aplicacion: "Precios al Día",
        estado: "backend_activo",
        busquedaLocal: "pausada_temporalmente",
        motivo: "La búsqueda local se reactivará cuando exista una fuente de datos adecuada y autorizada.",
        preciosOnline: "desactivados",
        cargosExternos: "desactivados"
      });
    }

    if (url.pathname === "/api/places") {
      const estado = clean(url.searchParams.get("estado"));
      const municipio = clean(url.searchParams.get("municipio"));

      if (!estado || !municipio) {
        return json({
          mensaje: "Selecciona estado y municipio.",
          establecimientos: []
        }, 400);
      }

      return json({
        ubicacion: { estado, municipio },
        total: 0,
        establecimientos: [],
        disponible: false,
        mensaje: "La búsqueda automática de establecimientos está temporalmente pausada. No se mostrarán comercios inventados ni resultados de otra zona."
      });
    }

    if (url.pathname === "/api/offers") {
      const estado = clean(url.searchParams.get("estado"));
      const municipio = clean(url.searchParams.get("municipio"));

      if (!estado || !municipio) {
        return json({
          mensaje: "Selecciona estado y municipio.",
          ofertas: []
        }, 400);
      }

      return json({
        ubicacion: { estado, municipio },
        total: 0,
        ofertas: [],
        disponible: false,
        mensaje: "La consulta automática de precios comerciales está desactivada. No se mostrarán precios estimados ni se ejecutarán servicios externos."
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Ruta API no encontrada" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};