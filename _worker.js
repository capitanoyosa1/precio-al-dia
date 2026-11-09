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

function limpiarParametro(valor, maximo = 100) {
  return String(valor || "").trim().slice(0, maximo);
}

async function inspeccionar(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000)
    });
    const codigo = await r.text();
    const patrones = /fetch\(|axios|XMLHttpRequest|searchTerm|city=|\/api\/|graphql|results|products|precios|price/gi;
    const hallazgos = [];
    let coincidencia;

    while ((coincidencia = patrones.exec(codigo)) !== null && hallazgos.length < 60) {
      hallazgos.push(
        codigo.slice(Math.max(0, coincidencia.index - 120), coincidencia.index + 220)
      );
    }

    return {
      url,
      http: r.status,
      longitud: codigo.length,
      hallazgos
    };
  } catch (e) {
    return { url, error: String(e.message || e) };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return respuesta({ error: "Método no permitido" }, 405);
    }

    if (url.pathname === "/api/profeco-test") {
      const base = "https://qqp.profeco.gob.mx";
      const resultados = await Promise.all([
        inspeccionar(base + "/assets/main.js?v=1794185395"),
        inspeccionar(base + "/build/assets/app-DP31drAa.js")
      ]);
      return respuesta({ prueba: "Archivos JavaScript de PROFECO", resultados });
    }

    if (url.pathname === "/api/status") {
      return respuesta({
        aplicacion: "Precios al Día",
        estado: "backend_activo"
      });
    }

    if (url.pathname === "/api/offers") {
      const estado = limpiarParametro(url.searchParams.get("estado"));
      const municipio = limpiarParametro(url.searchParams.get("municipio"));

      if (!estado || !municipio) {
        return respuesta({ estado: "ubicacion_incompleta", ofertas: [], total: 0 }, 400);
      }

      return respuesta({
        estado: "fuentes_pendientes",
        ubicacion: { estado, municipio },
        ofertas: [],
        total: 0
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return respuesta({ error: "Ruta API no encontrada" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};