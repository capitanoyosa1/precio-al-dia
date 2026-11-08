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
          },
          {
            nombre: "Directorio DENUE - INEGI",
            tipo: "directorio_de_establecimientos",
            estado: "pendiente_de_credenciales"
          }
        ],
        ultimaConsulta: null,
        mensaje: "El servicio está activo. Las fuentes de precios todavía no están conectadas."
      });
    }

    if (url.pathname === "/api/offers") {
      const estado = limpiarParametro(
        url.searchParams.get("estado")
      );

      const municipio = limpiarParametro(
        url.searchParams.get("municipio")
      );

      if (!estado || !municipio) {
        return respuesta({
          estado: "ubicacion_incompleta",
          ubicacion: {
            estado: estado || null,
            municipio: municipio || null
          },
          ofertas: [],
          total: 0,
          ultimaConsulta: null,
          mensaje: "Selecciona un estado y un municipio para consultar la zona."
        }, 400);
      }

      return respuesta({
        estado: "fuentes_pendientes",
        ubicacion: {
          estado,
          municipio
        },
        ofertas: [],
        total: 0,
        ultimaConsulta: new Date().toISOString(),
        mensaje: `Ubicación recibida: ${municipio}, ${estado}. Todavía no hay fuentes comerciales conectadas para mostrar ofertas verificadas. No se muestran precios inventados.`
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