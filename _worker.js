const JSON_HEADERS = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const clean = (v,n=100)=>String(v||"").trim().slice(0,n);
const norm = s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
async function geocode(place){
  const u=new URL("https://nominatim.openstreetmap.org/search");u.searchParams.set("q",place+", México");u.searchParams.set("format","jsonv2");u.searchParams.set("limit","1");
  const r=await fetch(u,{headers:{"User-Agent":"PreciosAlDia/1.0 (contacto del proyecto)"}});if(!r.ok)throw new Error("No se pudo localizar el municipio");const a=await r.json();if(!a.length)throw new Error("No se encontró el municipio");return a[0];
}
async function places(estado,municipio){
  const g=await geocode(municipio+", "+estado),lat=Number(g.lat),lon=Number(g.lon);
  const query='[out:json][timeout:20];(node[shop](around:12000,'+lat+','+lon+');way[shop](around:12000,'+lat+','+lon+');relation[shop](around:12000,'+lat+','+lon+'););out center tags 80;';
  const r=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:query});if(!r.ok)throw new Error("El mapa no respondió");const d=await r.json();
  const rows=(d.elements||[]).map(x=>{const t=x.tags||{},c=x.center||x;return {nombre:t.name||t.brand||t.operator||"Establecimiento sin nombre",tipo:t.shop||"comercio",direccion:[t["addr:street"],t["addr:housenumber"],t["addr:suburb"]].filter(Boolean).join(" "),lat:c.lat,lon:c.lon,id:x.id};}).filter(x=>x.nombre).slice(0,80);
  return rows.map(x=>({...x,url:"https://www.openstreetmap.org/"+(x.id?"?mlat="+x.lat+"&mlon="+x.lon:"" )}));
}
async function apifyOffers(env){
  if(env.APIFY_ENABLED!=="true"||!env.APIFY_TOKEN)return [];
  const endpoint="https://api.apify.com/v2/acts/ambiotec~mexico-supermarket-prices/run-sync-get-dataset-items?maxItems=20&maxTotalChargeUsd=0.05&format=json&clean=true";
  const input={queries:["leche","huevo","aceite","arroz","frijol","azúcar","papel higiénico","detergente"],stores:["chedraui","soriana"],maxItemsPerQuery:2,maxItems:20,proxy:{useApifyProxy:true,apifyProxyGroups:["RESIDENTIAL"],apifyProxyCountry:"MX"}};
  const r=await fetch(endpoint,{method:"POST",headers:{"Authorization":"Bearer "+env.APIFY_TOKEN,"Content-Type":"application/json"},body:JSON.stringify(input)});if(!r.ok)throw new Error("El proveedor de precios en línea no respondió");const rows=await r.json();
  return (Array.isArray(rows)?rows:[]).filter(x=>Number(x.price)>0&&x.name&&x.url).map(x=>({id:x.productId||x.sku||x.ean||x.name,nombre:x.name,tienda:x.store==="chedraui"?"Chedraui en línea":"Soriana en línea",precio:Number(x.price),precioAnterior:Number(x.listPrice||0),categoria:x.category||"Otros",unidad:x.unit||"pieza",imagen:x.image||"",fuente:x.url,consultado:x.scrapedAt||new Date().toISOString(),tipo:"Precio en línea",verificada:true,ubicacion:"Venta en línea; sucursal local no confirmada",vigencia:"Consulta realizada; verificar en tienda"}));
}
export default {async fetch(request,env){
  const u=new URL(request.url);if(request.method!=="GET")return json({error:"Método no permitido"},405);
  if(u.pathname==="/api/status")return json({aplicacion:"Precios al Día",estado:"backend_activo",busquedaLocal:"OpenStreetMap",preciosOnline:env.APIFY_ENABLED==="true"&&!!env.APIFY_TOKEN?"habilitados":"desactivados"});
  if(u.pathname==="/api/places"){
    const estado=clean(u.searchParams.get("estado")),municipio=clean(u.searchParams.get("municipio"));if(!estado||!municipio)return json({mensaje:"Selecciona estado y municipio",establecimientos:[]},400);
    try{const establecimientos=await places(estado,municipio);return json({ubicacion:{estado,municipio},total:establecimientos.length,establecimientos,mensaje:establecimientos.length?"Resultados del mapa colaborativo; confirma horarios y existencia antes de acudir.":"No se encontraron establecimientos en el mapa para esta zona."});}catch(e){return json({mensaje:"No se pudo consultar el mapa en este momento.",establecimientos:[]},502)}
  }
  if(u.pathname==="/api/offers"){
    const estado=clean(u.searchParams.get("estado")),municipio=clean(u.searchParams.get("municipio"));if(!estado||!municipio)return json({mensaje:"Selecciona estado y municipio",ofertas:[]},400);
    try{const ofertas=await apifyOffers(env);return json({ubicacion:{estado,municipio},ofertas,total:ofertas.length,mensaje:ofertas.length?"Precios de tiendas en línea. No representan necesariamente una sucursal de la ubicación seleccionada.":"No hay precios comerciales en línea habilitados o disponibles. La búsqueda de tiendas locales funciona por separado."});}catch(e){return json({mensaje:"No fue posible consultar precios comerciales en línea. No se mostrarán datos estimados.",ofertas:[]},502)}
  }
  if(u.pathname.startsWith("/api/"))return json({error:"Ruta API no encontrada"},404);
  return env.ASSETS.fetch(request);
}};
