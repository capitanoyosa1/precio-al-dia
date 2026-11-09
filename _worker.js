const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function respuesta(datos, estadoHttp = 200) {
  return new Response(JSON.stringify(datos), {
    status: estadoHttp,
    headers: JSON_HEADERS
  });
}

function limpiarParametro(valor, maximo = 100) {
  return String(valor || "").trim().slice(0, maximo);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return respuesta({ error: "Método no permitido" }, 405);
    }

    if (url.pathname === "/api/profeco-test") {
      try {
        const upstream = await fetch(
          "https://qqp.profeco.gob.mx/results?city=0901&searchTerm=leche",
          {
            headers: {
              "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
              "User-Agent": "Mozilla/5.0 (compatible; PreciosAlDia/1.0)"
            },
            signal: AbortSignal.timeout(15000)
          }
        );

        const body = await upstream.text();

        return respuesta({
          prueba: "PROFECO QQP",
          http: upstream.status,
          correcto: upstream.ok,
          contentType: upstream.headers.get("content-type"),
          longitud: body.length,
          muestra: body.slice(0, 6000)
        });
      } catch (error) {
        return respuesta({
          prueba: "PROFECO QQP",
          correcto: false,
          error: String(error.message || error)
        }, 502);
      }
    }

    if (url.pathname === "/api/status") {
      return respuesta({
        aplicacion: "Precios al Día",
        estado: "backend_activo",
        mensaje: "Servicio activo."
      });
    }

    if (url.pathname === "/api/offers") {
      const estado = limpiarParametro(url.searchParams.get("estado"));
      const municipio = limpiarParametro(url.searchParams.get("municipio"));

      if (!estado || !municipio) {
        return respuesta({
          estado: "ubicacion_incompleta",
          ofertas: [],
          total: 0
        }, 400);
      }

      return respuesta({
        estado: "fuentes_pendientes",
        ubicacion: { estado, municipio },
        ofertas: [],
        total: 0,
        mensaje: "No hay ofertas comerciales verificadas conectadas."
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return respuesta({ error: "Ruta API no encontrada" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};