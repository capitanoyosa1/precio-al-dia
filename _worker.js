const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });

const clean = (value, max = 100) =>
  String(value || "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s.'’-]/gu, "")
    .trim()
    .slice(0, max);

const aliases = {
  "Coahuila": "Coahuila de Zaragoza",
  "México": "Estado de México",
  "Michoacán": "Michoacán de Ocampo",
  "Veracruz": "Veracruz de Ignacio de la Llave"
};

const regexEscape = value =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const osmName = value =>
  regexEscape(value).replace(/"/g, '\\"');

function getType(tags = {}) {
  if (tags.shop) return "Tienda: " + tags.shop.replace(/_/g, " ");
  if (tags.amenity) return tags.amenity.replace(/_/g, " ");
  if (tags.office) return "Oficina: " + tags.office.replace(/_/g, " ");
  if (tags.craft) return "Taller: " + tags.craft.replace(/_/g, " ");
  return "Establecimiento";
}

function getAddress(tags = {}) {
  if (tags["addr:full"]) return tags["addr:full"];

  const street = [
    tags["addr:street"],
    tags["addr:housenumber"]
  ].filter(Boolean).join(" ");

  return [
    street,
    tags["addr:suburb"],
    tags["addr:city"] || tags["addr:town"] || tags["addr:village"]
  ].filter(Boolean).join(", ");
}

function getCoordinates(element) {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function buildQuery(estado, municipio) {
  const estadoSeguro = osmName(estado);
  const municipioSeguro = osmName(municipio);

  return `
[out:json][timeout:25];
rel["boundary"="administrative"]["admin_level"="4"]["name"~"^${estadoSeguro}$",i]->.estado;
.estado out tags;
.estado map_to_area->.areaEstado;
rel["boundary"="administrative"]["admin_level"="6"]["name"~"^${municipioSeguro}$",i](area.areaEstado)->.municipio;
.municipio out tags;
.municipio map_to_area->.zona;
(
  nwr["shop"]["name"](area.zona);
  nwr["amenity"~"^(marketplace|restaurant|cafe|fast_food|pharmacy|fuel|bank|clinic|doctors|hospital|post_office)$"]["name"](area.zona);
  nwr["office"]["name"](area.zona);
  nwr["craft"]["name"](area.zona);
);
out center tags 150;
`;
}

async function queryOverpass(query) {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];

  let ultimoError = "Servicio de mapas no disponible.";

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "Accept": "application/json"
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(28000)
      });

      if (!response.ok) {
        ultimoError = `El servicio de mapas respondió HTTP ${response.status}.`;
        continue;
      }

      const data = await response.json();

      if (!Array.isArray(data.elements)) {
        ultimoError = "La respuesta del mapa no tiene el formato esperado.";
        continue;
      }

      if (data.remark) {
        ultimoError = "El servicio de mapas no pudo completar la consulta.";
        continue;
      }

      return data;
    } catch (error) {
      ultimoError = "No fue posible conectar con el servicio de mapas.";
    }
  }

  throw new Error(ultimoError);
}

async function probarPrecioCheck(env) {
  const apiKey = env.PRECIOCHECK_API_KEY;

  if (!apiKey) {
    return json({
      conectado: false,
      estado: "secreto_no_encontrado",
      mensaje: "No se encontró PRECIOCHECK_API_KEY en los secretos de Cloudflare."
    }, 503);
  }

  try {
    const response = await fetch(
      "https://preciocheck.com/api/v1/categorias",
      {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "X-API-Key": apiKey
        },
        signal: AbortSignal.timeout(15000)
      }
    );

    if (response.status === 401 || response.status === 403) {
      return json({
        conectado: false,
        estado: "clave_rechazada",
        codigo: response.status,
        mensaje: "PrecioCheck rechazó la clave. Revisa el secreto configurado en Cloudflare."
      }, 502);
    }

    if (response.status === 429) {
      return json({
        conectado: false,
        estado: "limite_alcanzado",
        codigo: 429,
        mensaje: "PrecioCheck informó que se alcanzó el límite de consultas. Inténtalo más tarde."
      }, 429);
    }

    if (!response.ok) {
      return json({
        conectado: false,
        estado: "error_proveedor",
        codigo: response.status,
        mensaje: "PrecioCheck respondió con un error HTTP."
      }, 502);
    }

    let data;

    try {
      data = await response.json();
    } catch (error) {
      return json({
        conectado: false,
        estado: "respuesta_invalida",
        mensaje: "PrecioCheck respondió, pero el formato recibido no es JSON válido."
      }, 502);
    }

    if (data.ok === false) {
      return json({
        conectado: false,
        estado: "respuesta_no_confirmada",
        mensaje: "La API respondió, pero no confirmó la consulta."
      }, 502);
    }

    const categorias = Array.isArray(data.categorias)
      ? data.categorias.length
      : 0;

    return json({
      conectado: true,
      estado: "conexion_correcta",
      proveedor: "PrecioCheck",
      prueba: "Consulta de categorías",
      totalCategorias: categorias,
      mensaje: "La conexión con PrecioCheck funciona correctamente."
    });

  } catch (error) {
    return json({
      conectado: false,
      estado: "error_de_conexion",
      mensaje: "No fue posible conectar con PrecioCheck. Inténtalo de nuevo."
    }, 503);
  }
}

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
        busquedaLocal: "openstreetmap_overpass",
        fuenteEstablecimientos: "OpenStreetMap",
        preciosOnline: "pendientes_de_integracion",
        proveedorPrecios: "PrecioCheck"
      });
    }

    if (url.pathname === "/api/preciocheck/test") {
      return probarPrecioCheck(env);
    }

    if (url.pathname === "/api/places") {
      const estadoOriginal = clean(url.searchParams.get("estado"));
      const municipio = clean(url.searchParams.get("municipio"));

      if (!estadoOriginal || !municipio) {
        return json({
          mensaje: "Selecciona estado y municipio.",
          establecimientos: []
        }, 400);
      }

      const estado = aliases[estadoOriginal] || estadoOriginal;
      const cacheKey = new Request(
        "https://precio-al-dia-cache.local/api/places?estado=" +
        encodeURIComponent(estado) +
        "&municipio=" +
        encodeURIComponent(municipio)
      );

      const cache = caches.default;

      try {
        const cached = await cache.match(cacheKey);
        if (cached) return cached;
      } catch (error) {
        // Si la caché no está disponible, se consulta el mapa normalmente.
      }

      try {
        const query = buildQuery(estado, municipio);
        const data = await queryOverpass(query);

        const stateFound = data.elements.some(element =>
          element.type === "relation" &&
          element.tags?.admin_level === "4"
        );

        const municipalityFound = data.elements.some(element =>
          element.type === "relation" &&
          element.tags?.admin_level === "6"
        );

        if (!stateFound || !municipalityFound) {
          return json({
            ubicacion: { estado: estadoOriginal, municipio },
            total: 0,
            establecimientos: [],
            disponible: false,
            mensaje: "No se encontró el límite administrativo de esa ubicación en OpenStreetMap. Revisa el nombre del estado y municipio."
          }, 404);
        }

        const establecimientos = [];
        const vistos = new Set();

        for (const element of data.elements) {
          if (!["node", "way", "relation"].includes(element.type)) continue;

          const tags = element.tags || {};
          const nombre = clean(
            tags.name || tags["name:es"] || tags.brand,
            120
          );

          const coordinates = getCoordinates(element);
          if (!nombre || !coordinates) continue;

          const id = `${element.type}/${element.id}`;
          if (vistos.has(id)) continue;
          vistos.add(id);

          establecimientos.push({
            id,
            nombre,
            tipo: getType(tags),
            direccion: getAddress(tags),
            lat: coordinates.lat,
            lon: coordinates.lon,
            url: `https://www.openstreetmap.org/${id}`,
            fuente: "OpenStreetMap"
          });
        }

        establecimientos.sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es")
        );

        const resultado = {
          ubicacion: { estado: estadoOriginal, municipio },
          total: establecimientos.length,
          establecimientos: establecimientos.slice(0, 150),
          disponible: true,
          mensaje:
            `Establecimientos encontrados: ${establecimientos.length}. ` +
            "Datos © OpenStreetMap contributors. " +
            "La cobertura depende de los registros disponibles en el mapa.",
          atribucion: {
            texto: "© OpenStreetMap contributors",
            url: "https://www.openstreetmap.org/copyright"
          }
        };

        const response = json(resultado, 200, {
          "Cache-Control": "public, max-age=21600"
        });

        try {
          await cache.put(cacheKey, response.clone());
        } catch (error) {
          // La respuesta sigue funcionando aunque no se pueda guardar en caché.
        }

        return response;
      } catch (error) {
        return json({
          ubicacion: { estado: estadoOriginal, municipio },
          total: 0,
          establecimientos: [],
          disponible: false,
          mensaje:
            "No se pudo consultar OpenStreetMap en este momento. " +
            "Inténtalo de nuevo más tarde. " +
            "No se mostrarán establecimientos inventados."
        }, 503);
      }
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
        mensaje: "La consulta automática de precios comerciales aún no está activada. No se mostrarán precios estimados ni ofertas inventadas."
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Ruta API no encontrada" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};