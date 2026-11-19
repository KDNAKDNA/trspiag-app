// TRANSPARENCIA: servidor de la app para el show.
//
//   node server.js            (puerto 3000)
//   PORT=8080 node server.js  (otro puerto)
//
// No usa paquetes de npm: funciona sin internet y sin "npm install".
// Corre en el laptop de la CÁMARA: allí la página de la cámara se abre en
// http://localhost:3000/camara/ (Chrome solo da cámara y micrófono en localhost).
// Los otros laptops entran por la red local con la IP que se imprime al arrancar.
//
//   /           hub (cuarto + menú)
//   /coro/      coro armónico (tortugas del dragón y la rata cósmica)
//   /bateria/   caja de ritmos (batería sintetizada)
//   /camara/    censura en vivo + visuales
//   /envivo/    panel: quién está conectado y qué está sonando
//   /objetos/   visor 3D (Three.js) de los modelos de Blender
//   /api/health responde {"ok": true} (lo usa Render para saber que la app está viva)
//   /comun/     scripts compartidos (envivo.js)
//   /coro/api/songs   canciones guardadas (compartidas entre los tres)
//   /api/envivo       canal en vivo: POST eventos, GET /stream (Server-Sent Events)
const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { sanitizeSong, sanitizeName } = require("./servidor/song");
const { createFileStore } = require("./servidor/file-store");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const MAX_SONGS = 200;
const store = createFileStore(path.join(ROOT, "data", "canciones"));

// Carpetas públicas: ruta -> carpeta
const MOUNTS = [
  ["/coro/", "coro"],
  ["/camara/", "camara"],
  ["/envivo/", "envivo"],
  ["/objetos/", "objetos"],
  ["/bateria/", "bateria"],
  ["/comun/", "comun"],
  ["/", "hub"],
];
// archivos sueltos que se sirven desde otro lugar
const ALIAS = {
  "/coro/lib/p5.min.js": "camara/libs/p5.min.js",   // el coro usa el mismo p5 local que la cámara
  "/envivo/fonts/LiberationMono-Bold.ttf": "hub/fonts/LiberationMono-Bold.ttf",
};
// archivos que no se sirven nunca
const PRIVADO = /(^|\/)(\.|CLAUDE\.md$|node_modules|data\/|servidor\/|server\.js$|package\.json$)/;

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2",
  ".mp4": "video/mp4", ".webm": "video/webm", ".bin": "application/octet-stream", ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".ico": "image/x-icon",
};

// ---------- Canal en vivo ----------
// Los navegadores mandan eventos (notas, golpes, patrón, play) con POST y los reciben por SSE.
const clientes = new Map();   // id -> { res, rol, nombre, desde, ip }
const ultimos = [];           // últimos eventos, para el panel
let bpm = null, sonando = false;

function difunde(eventos, origen) {
  const data = `data: ${JSON.stringify({ origen, eventos })}\n\n`;
  for (const c of clientes.values()) { c.res.write(data); }
}
function direcciones() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === "IPv4" && !i.internal).map(i => `http://${i.address}:${PORT}/`);
}
function estado() {
  return {
    direcciones: direcciones(),
    clientes: [...clientes.entries()].map(([id, c]) => ({ id, rol: c.rol, nombre: c.nombre, desde: c.desde, ip: c.ip })),
    ultimos: ultimos.slice(-30),
    bpm, sonando,
  };
}
function avisaEstado() {
  const data = `event: estado\ndata: ${JSON.stringify(estado())}\n\n`;
  for (const c of clientes.values()) { c.res.write(data); }
}
setInterval(() => { for (const c of clientes.values()) { c.res.write(": latido\n\n"); } }, 15000);

function abreStream(req, res, url) {
  const id = crypto.randomUUID();
  const rol = (url.searchParams.get("rol") || "otro").slice(0, 20);
  const nombre = (url.searchParams.get("nombre") || rol).slice(0, 40);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`event: hola\ndata: ${JSON.stringify({ id })}\n\n`);
  clientes.set(id, { res, rol, nombre, desde: Date.now(), ip: req.socket.remoteAddress });
  avisaEstado();
  req.on("close", () => { clientes.delete(id); avisaEstado(); });
}

const TIPOS = new Set(["note", "chord", "dhit", "bank", "play", "stop", "bpm", "fx"]);
function limpiaEvento(e) {
  if (!e || typeof e !== "object" || !TIPOS.has(e.type)) return null;
  const n = (v, a, b) => (typeof v === "number" && isFinite(v) ? Math.min(b, Math.max(a, v)) : undefined);
  return {
    type: e.type,
    uid: typeof e.uid === "string" ? e.uid.slice(0, 40) : undefined,
    ci: n(e.ci, 0, 4), i: n(e.i, 0, 5), midi: n(e.midi, 0, 127), t: n(e.t, 0, 1), dur: n(e.dur, 0, 10),
    vel: n(e.vel, 0, 1), bank: n(e.bank, 0, 3), bpm: n(e.bpm, 20, 300), idx: n(e.idx, 0, 7), en: n(e.en, 0, 1e15),
    nombre: typeof e.nombre === "string" ? e.nombre.slice(0, 30) : undefined,
    ts: Date.now(),
  };
}

// ---------- Utilidades HTTP ----------
function json(res, code, data) {
  const body = data === undefined ? "" : JSON.stringify(data);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
async function leeCuerpo(req, limite = 256 * 1024) {
  const partes = []; let total = 0;
  for await (const p of req) {
    total += p.length;
    if (total > limite) { const e = new Error("demasiado grande"); e.code = 413; throw e; }
    partes.push(p);
  }
  try { return JSON.parse(Buffer.concat(partes).toString("utf8") || "null"); }
  catch { const e = new Error("El cuerpo no es JSON válido"); e.code = 400; throw e; }
}

// ---------- API de canciones (la misma del coro original) ----------
async function apiCanciones(req, res, sub) {
  const id = sub.replace(/^\/+/, "") || null;
  const cuerpo = async () => {
    const b = await leeCuerpo(req);
    try { return { name: sanitizeName(b && b.name), song: sanitizeSong(b && b.song) }; }
    catch (e) { e.code = e.code || 400; throw e; }
  };
  try {
    if (!id && req.method === "GET") return json(res, 200, await store.list(null));
    if (!id && req.method === "POST") {
      const body = await cuerpo();
      if ((await store.list(null)).length >= MAX_SONGS) {
        return json(res, 409, { error: `Llegaron al máximo de ${MAX_SONGS} canciones. Borren alguna para guardar otra.` });
      }
      const rec = await store.create(null, body);
      return json(res, 201, rec);
    }
    if (id && req.method === "GET") {
      const rec = await store.get(null, id);
      return rec ? json(res, 200, rec) : json(res, 404, { error: "No existe esa canción" });
    }
    if (id && req.method === "PUT") {
      const rec = await store.update(null, id, await cuerpo());
      return rec ? json(res, 200, rec) : json(res, 404, { error: "No existe esa canción" });
    }
    if (id && req.method === "DELETE") {
      const ok = await store.remove(null, id);
      if (!ok) return json(res, 404, { error: "No existe esa canción" });
      res.writeHead(204); return res.end();
    }
    json(res, 405, { error: "Método no permitido" });
  } catch (err) {
    if (err.code === 413) return json(res, 413, { error: "La canción es demasiado grande" });
    if (err.code === 400 || err instanceof TypeError || err instanceof RangeError) return json(res, 400, { error: err.message });
    console.error("[canciones]", err);
    json(res, 500, { error: "Error interno del servidor de canciones" });
  }
}

// ---------- Archivos ----------
function rutaSegura(base, rel) {
  const b = path.join(ROOT, base);
  const p = path.normalize(path.join(b, rel));
  return p === b || p.startsWith(b + path.sep) ? p : null;
}

async function listado(res, dir, urlPath) {
  const nombres = (await fsp.readdir(dir, { withFileTypes: true })).filter(d => !d.name.startsWith("."));
  const items = nombres.map(d => {
    const n = d.name + (d.isDirectory() ? "/" : "");
    return `<li><a href="${encodeURIComponent(d.name)}${d.isDirectory() ? "/" : ""}">${n.replace(/</g, "&lt;")}</a></li>`;
  }).join("\n");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(`<!DOCTYPE html><meta charset="utf-8"><title>${urlPath}</title><ul>\n${items}\n</ul>`);
}

async function sirveArchivo(req, res, file) {
  const st = await fsp.stat(file);
  const tipo = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  const head = { "Content-Type": tipo, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
  const rango = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (rango) {   // los videos necesitan rangos para adelantar y repetir
    let a = rango[1] ? parseInt(rango[1], 10) : 0;
    let b = rango[2] ? parseInt(rango[2], 10) : st.size - 1;
    if (!rango[1] && rango[2]) { a = st.size - parseInt(rango[2], 10); b = st.size - 1; }
    if (a > b || b >= st.size) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...head, "Content-Range": `bytes ${a}-${b}/${st.size}`, "Content-Length": b - a + 1 });
    if (req.method === "HEAD") return res.end();
    return fs.createReadStream(file, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { ...head, "Content-Length": st.size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

async function estatico(req, res, pathname) {
  if (ALIAS[pathname]) return sirveArchivo(req, res, path.join(ROOT, ALIAS[pathname]));
  const m = MOUNTS.find(([pre]) => pathname.startsWith(pre) || pathname + "/" === pre);
  if (!m) return json(res, 404, { error: "No existe" });
  const [pre, carpeta] = m;
  if (pathname + "/" === pre) { res.writeHead(301, { Location: pre }); return res.end(); }
  const rel = pathname.slice(pre.length);
  if (PRIVADO.test(rel)) return json(res, 404, { error: "No existe" });
  const file = rutaSegura(carpeta, rel);
  if (!file) return json(res, 404, { error: "No existe" });
  let st;
  try { st = await fsp.stat(file); } catch { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("SIN SEÑAL: no existe " + pathname); }
  if (st.isDirectory()) {
    if (!pathname.endsWith("/")) { res.writeHead(301, { Location: pathname + "/" }); return res.end(); }
    const idx = path.join(file, "index.html");
    if (fs.existsSync(idx)) return sirveArchivo(req, res, idx);
    return listado(res, file, pathname);   // la cámara busca las fotos de "caras/" en este listado
  }
  return sirveArchivo(req, res, file);
}

// ---------- Rutas ----------
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, "http://x"); } catch { res.writeHead(400); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  try {
    if (pathname === "/api/health") return json(res, 200, { ok: true });
    if (pathname === "/api/envivo/stream" && req.method === "GET") return abreStream(req, res, url);
    if (pathname === "/api/envivo/estado" && req.method === "GET") return json(res, 200, estado());
    if (pathname === "/api/envivo/hora") return json(res, 200, { t: Date.now() });
    if (pathname === "/api/envivo" && req.method === "POST") {
      const b = await leeCuerpo(req, 64 * 1024);
      const lista = (Array.isArray(b && b.eventos) ? b.eventos : []).slice(0, 200).map(limpiaEvento).filter(Boolean);
      const origen = typeof (b && b.origen) === "string" ? b.origen.slice(0, 40) : null;
      if (lista.length) {
        for (const e of lista) {
          if (e.type === "play") { sonando = true; if (e.bpm) bpm = e.bpm; }
          if (e.type === "stop") { sonando = false; }
          if (e.type === "bpm") { bpm = e.bpm; }
          ultimos.push(e);
        }
        if (ultimos.length > 200) ultimos.splice(0, ultimos.length - 200);
        difunde(lista, origen);
        if (lista.some(e => e.type === "play" || e.type === "stop" || e.type === "bpm")) { avisaEstado(); }
      }
      res.writeHead(204); return res.end();
    }
    if (pathname.startsWith("/coro/api/songs")) return apiCanciones(req, res, pathname.slice("/coro/api/songs".length));
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "Método no permitido" });
    return await estatico(req, res, pathname);
  } catch (err) {
    if (err.code === 413 || err.code === 400) return json(res, err.code, { error: err.message });
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: "Error interno" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("\n  TRANSPARENCIA ESTÁ ENCENDIDO\n");
  console.log(`  En este laptop (cámara):  http://localhost:${PORT}/`);
  console.log(`  Cámara (abrir aquí):      http://localhost:${PORT}/camara/`);
  for (const d of direcciones()) { console.log(`  Otros laptops:            ${d}`); }
  console.log("\n  Ctrl+C para apagar.\n");
});
