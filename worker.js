const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function respuesta(datos, estado = 200) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: JSON_HEADERS
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return respuesta({
        error: "Método no permitido"
      }, 405);
    }

    if (url.pathname === "/api/status") {
      return respuesta({
        aplicacion: "Precios al Día",
        estado: "backend_activo",
        fuentes: [
          {
            nombre: "PROFECO - Quién es Quién en los Precios",
            tipo: "precios_de_referencia",
            estado: "pendiente_de_integracion"
          },
          {
            nombre: "PROFECO - Precios en Comercio Electrónico",
            tipo: "monitoreo_comercial",
            estado: "pendiente_de_integracion"
          }
        ],
        ultimaConsulta: null,
        mensaje: "No se muestran precios hasta verificar la fuente."
      });
    }

    if (url.pathname === "/api/offers") {
      return respuesta({
        estado: "fuentes_pendientes",
        ofertas: [],
        total: 0,
        mensaje: "Todavía no hay fuentes conectadas. No se muestran ofertas inventadas."
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return respuesta({
        error: "Ruta API no encontrada"
      }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};