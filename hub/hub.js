// HUB de TRANSPARENCIA
// Recorrido: pantalla apagada -> arranque tipo computador viejo -> video del cuarto
// (la cámara entra en la TV) -> el hub, que es lo mismo que mostraba la TV.
// "VOLVER AL CUARTO" hace el camino al revés.
//
// Para desarrollar: index.html?saltar entra directo al hub.

// ---------- Ajustes ----------
// Rutas de cada módulo (relativas al hub). Si no responden, el hub muestra "SIN SEÑAL".
const MODULOS = {
  envivo: "envivo/",
  componer: "coro/",
  bateria: "bateria/",
  camara: "camara/",
  canciones: "coro/",
  conectar: "envivo/",
  objetos: "objetos/",
};
const RAREZAS_CADA = [20, 45];   // segundos entre momentos raros (mínimo, máximo)

// ---------- Estado ----------
const L = window.LAYOUT;
const COL = L.colors;
const cv = document.getElementById("crt");
const vIn = document.getElementById("intro");
const vOut = document.getElementById("salida");

const txt = document.createElement("canvas");   // pantalla de texto 480x270
txt.width = L.w; txt.height = L.h;
const tx = txt.getContext("2d");
const comp = document.createElement("canvas");  // video + texto encima (modos de video)
comp.width = 960; comp.height = 540;
const cx = comp.getContext("2d");

let modo = "espera";          // espera | arranque | videoIn | hub | videoOut | cuarto
let sel = 0;                  // opción elegida del menú
let t0 = performance.now();   // inicio del modo actual
let golpe = 0;                // glitch extra que se apaga solo
let mensaje = null;           // { titulo, lineas[] } recuadro encima del hub
let ayuda = false;
let rareza = null;            // { tipo, hasta }
let proximaRareza = 0;
let arranqueTxt = "";
let fuenteLista = false;
let videoOk = true;

const ARRANQUE = [
  "TRANSPARENCIA BIOS  (C) 1987-2026",
  "",
  "MEMORIA ............. 640K  OK",
  "VOCES DEL CORO ...... 5     OK",
  "CAJA DE RITMOS ...... 6     OK",
  "CÁMARA .............. ESPERANDO",
  "SEÑAL DE VIDEO ...... INESTABLE",
  "",
  "ENCENDIENDO EL CUARTO...",
].join("\n");

// ---------- Texto en bits (igual que tools/render_pantalla.py) ----------
const cache = new Map();
function mascara(texto, color, escala = 1) {
  const k = texto + "|" + color + "|" + escala;
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement("canvas");
  c.width = Math.max(1, texto.length * L.cellW); c.height = L.cellH;
  const g = c.getContext("2d");
  g.font = `${L.fontSize}px TransMono`; g.textBaseline = "top"; g.fillStyle = "#fff";
  for (let i = 0; i < texto.length; i++) { g.fillText(texto[i], i * L.cellW, 0); }
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  const rgb = [1, 3, 5].map(i => parseInt(color.substr(i, 2), 16));
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] > 110;
    d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = on ? 255 : 0;
  }
  g.putImageData(im, 0, 0);
  let out = c;
  if (escala !== 1) {
    out = document.createElement("canvas");
    out.width = c.width * escala; out.height = c.height * escala;
    const o = out.getContext("2d"); o.imageSmoothingEnabled = false;
    o.drawImage(c, 0, 0, out.width, out.height);
  }
  cache.set(k, out);
  return out;
}
function escribe(g, texto, col, fila, color, escala = 1) {
  g.drawImage(mascara(texto, color, escala), col * L.cellW, fila * L.cellH);
}
function escribePx(g, texto, x, y, color, escala = 1) {
  g.drawImage(mascara(texto, color, escala), x, y);
}
const centro = s => Math.floor((L.cols - s.length) / 2);
const parpadeo = (hz = 2) => Math.floor(performance.now() / 1000 * hz) % 2 === 0;

// ---------- Dibujo de la pantalla de texto ----------
function fondo() { tx.fillStyle = COL.bg; tx.fillRect(0, 0, L.w, L.h); }

function dibujaEspera() {
  fondo();
  if (parpadeo(1.5)) {
    const s = "PULSA CUALQUIER TECLA PARA ENCENDER";
    escribe(tx, s, centro(s), 9, COL.fg);
  }
}

function dibujaArranque() {
  fondo();
  const lineas = arranqueTxt.split("\n");
  lineas.forEach((ln, i) => escribe(tx, ln, 2, 1 + i, i === 0 ? COL.amber : COL.fg));
  const ult = lineas.length - 1;
  if (parpadeo(3)) { escribe(tx, "_", 2 + lineas[ult].length, 1 + ult, COL.fg); }
}

function dibujaHub() {
  fondo();
  const ahora = performance.now();
  const raro = rareza && ahora < rareza.hasta ? rareza.tipo : null;

  // título grande con sombra corrida
  const t = L.title;
  const titulo = raro === "titulo" ? "NO NOS APAGUES" : t.text;
  const tw = titulo.length * L.cellW * t.scale;
  const x = Math.floor((L.w - tw) / 2);
  escribePx(tx, titulo, x + 2, t.row * L.cellH + 1, COL.magenta, t.scale);
  escribePx(tx, titulo, x, t.row * L.cellH, COL.fg, t.scale);

  for (const ln of L.lines) {
    const col = ln.center ? centro(ln.text) : (ln.col || 0);
    escribe(tx, ln.text, col, ln.row, COL[ln.color]);
  }

  const m = L.menu;
  m.items.forEach((it, i) => {
    const fila = m.row + i;
    const s = i === sel;
    if (s) {
      tx.fillStyle = COL.fg;
      tx.fillRect((m.col - 1) * L.cellW, fila * L.cellH, (L.cols - 3 - m.col + 1) * L.cellW, L.cellH);
    }
    escribe(tx, "[" + it.key + "]", m.col + m.keyCol, fila, s ? COL.inverseFg : COL.amber);
    escribe(tx, it.name, m.col + m.nameCol, fila, s ? COL.inverseFg : COL.fg);
    if (it.desc) { escribe(tx, it.desc, m.col + m.descCol, fila, s ? COL.inverseFg : COL.dim); }
  });

  const p = L.prompt;
  escribe(tx, p.text + (parpadeo(2) ? "_" : " "), p.col, p.row, COL.fg);

  // barra de estado con reloj
  const st = L.status;
  tx.fillStyle = COL.dim; tx.fillRect(0, st.row * L.cellH, L.w, L.cellH);
  escribe(tx, textoEstado(), 0, st.row, COL.inverseFg);
  const hora = new Date().toLocaleTimeString("es-CO", { hour12: false });
  escribe(tx, hora, L.cols - hora.length - 1, st.row, COL.inverseFg);

  if (raro === "mirada") { escribe(tx, "●   ●", 50, 15, COL.amber); }

  if (ayuda) { recuadro("AYUDA", [
    "1-6 / FLECHAS  ELEGIR",
    "ENTER / CLIC   ENTRAR",
    "0              VOLVER AL CUARTO",
    "F              PANTALLA COMPLETA",
    "F1 / ESC       CERRAR ESTA AYUDA",
  ]); }
  if (mensaje) { recuadro(mensaje.titulo, mensaje.lineas); }
}

// barra de estado: laptops conectados, tempo y señal (si hay servidor)
let vivo = null;
if (window.EnVivo) {
  EnVivo.conecta("hub", "HUB");
  EnVivo.escuchaEstado(d => { vivo = d; });
}
function textoEstado() {
  if (!vivo || !window.EnVivo || !EnVivo.conectado) { return L.status.text; }
  const laptops = new Set(vivo.clientes.map(c => c.ip)).size;
  const senal = EnVivo.silencio < 1500 ? "OK" : "--";
  return ` LAPTOPS ${laptops}/3   BPM ${vivo.bpm || "---"}   SEÑAL ${senal}   F1 AYUDA`;
}

// recuadro con borde de caracteres, centrado
function recuadro(titulo, lineas) {
  const ancho = Math.max(titulo.length + 4, ...lineas.map(l => l.length)) + 4;
  const alto = lineas.length + 4;
  const c0 = Math.floor((L.cols - ancho) / 2), f0 = Math.floor((L.rows - alto) / 2);
  tx.fillStyle = COL.bg;
  tx.fillRect(c0 * L.cellW, f0 * L.cellH, ancho * L.cellW, alto * L.cellH);
  escribe(tx, "╔" + "═".repeat(ancho - 2) + "╗", c0, f0, COL.amber);
  for (let i = 1; i < alto - 1; i++) {
    escribe(tx, "║", c0, f0 + i, COL.amber);
    escribe(tx, "║", c0 + ancho - 1, f0 + i, COL.amber);
  }
  escribe(tx, "╚" + "═".repeat(ancho - 2) + "╝", c0, f0 + alto - 1, COL.amber);
  tx.fillStyle = COL.bg;
  tx.fillRect((c0 + 2) * L.cellW, f0 * L.cellH, (titulo.length + 2) * L.cellW, L.cellH);
  escribe(tx, " " + titulo + " ", c0 + 2, f0, COL.amber);
  lineas.forEach((l, i) => escribe(tx, l, c0 + 2, f0 + 2 + i, COL.fg));
}

// video + texto retro encima (para el cuarto)
function componeVideo(v, texto) {
  if (v.readyState >= 2) { cx.drawImage(v, 0, 0, comp.width, comp.height); }
  else { cx.fillStyle = "#000"; cx.fillRect(0, 0, comp.width, comp.height); }
  if (texto && parpadeo(1.2)) {
    const m = mascara(texto, COL.fg, 2);
    cx.drawImage(m, Math.floor((comp.width - m.width) / 2), comp.height - 70);
  }
}

// ---------- Cambios de modo ----------
function cambia(m) { modo = m; t0 = performance.now(); }

// pantalla completa con el primer toque (los navegadores no dejan hacerlo sin un gesto)
function pantallaCompleta() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) { el.requestFullscreen().catch(() => {}); }
}

function encender() {
  pantallaCompleta();
  Sonido.iniciar(); Sonido.encender();
  CRT.P.power = 0; arranqueTxt = "";
  cambia("arranque");
}

function entrarCuarto() {
  if (!videoOk) { entrarHub(); return; }
  Sonido.estatica(0.5, 0.2);
  golpe = 0.8;
  vIn.currentTime = 0;
  vIn.play().then(() => cambia("videoIn")).catch(() => entrarHub());
}

function entrarHub() {
  vIn.pause();
  Sonido.estatica(0.4, 0.22);
  golpe = 1;
  CRT.P.power = 1;
  cambia("hub");
  programaRareza();
}

function salirAlCuarto() {
  if (!videoOk) { mensaje = { titulo: "SIN VIDEO", lineas: ["FALTA video/salida.mp4", "", "PULSA CUALQUIER TECLA"] }; return; }
  Sonido.estatica(0.5, 0.22);
  golpe = 1;
  vOut.currentTime = 0;
  vOut.play().then(() => cambia("videoOut")).catch(() => {});
}

function programaRareza() {
  const [a, b] = RAREZAS_CADA;
  proximaRareza = performance.now() + (a + Math.random() * (b - a)) * 1000;
}

function lanzaRareza() {
  const tipos = ["mirada", "titulo", "solo", "glitch"];
  const tipo = tipos[Math.floor(Math.random() * tipos.length)];
  const ahora = performance.now();
  if (tipo === "mirada") { rareza = { tipo, hasta: ahora + 450 }; }
  if (tipo === "titulo") { rareza = { tipo, hasta: ahora + 140 }; golpe = 0.5; }
  if (tipo === "glitch") { golpe = 0.75; Sonido.estatica(0.25, 0.12); }
  if (tipo === "solo") {
    // el cursor se mueve solo y vuelve
    const antes = sel;
    sel = (sel + 1) % L.menu.items.length; Sonido.tecla();
    setTimeout(() => { if (modo === "hub") { sel = antes; Sonido.tecla(); } }, 700);
  }
  programaRareza();
}

// ---------- Acciones del menú ----------
async function activar(i) {
  const it = L.menu.items[i];
  sel = i;
  Sonido.bip(1320, 0.06);
  if (it.id === "cuarto") { salirAlCuarto(); return; }
  const url = MODULOS[it.id];
  golpe = 0.6;
  let ok = false;
  if (url) {
    try { ok = (await fetch(url, { method: "HEAD", cache: "no-store" })).ok; } catch (e) { ok = false; }
  }
  if (ok) {
    Sonido.estatica(0.6, 0.25); golpe = 1.2;
    setTimeout(() => { location.href = url; }, 450);
  } else {
    Sonido.bip(220, 0.18, 0.1); Sonido.estatica(0.3, 0.15);
    mensaje = { titulo: "SIN SEÑAL", lineas: [it.name + ": MÓDULO NO CONECTADO", "TODAVÍA NO ESTÁ EN ESTE SERVIDOR", "", "PULSA CUALQUIER TECLA"] };
  }
}

// ---------- Entrada ----------
let primerToque = true;
function alPulsar(e) {
  Sonido.iniciar();
  if (primerToque) { primerToque = false; pantallaCompleta(); }
  if (modo === "espera") { encender(); return; }
  if (modo === "arranque") { return; }
  if (modo === "videoIn") { entrarHub(); return; }        // saltar el video
  if (modo === "videoOut") { return; }
  if (modo === "cuarto") { entrarCuarto(); return; }
  if (modo !== "hub") { return; }

  if (mensaje) { mensaje = null; Sonido.tecla(); return; }
  const k = e && e.key;
  if (!k) { return; }
  if (k === "F1") { e.preventDefault(); ayuda = !ayuda; Sonido.tecla(); return; }
  if (k === "Escape") { ayuda = false; return; }
  if (ayuda) { ayuda = false; return; }
  if (k === "f" || k === "F") {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(() => {}); }
    else { document.exitFullscreen(); }
    return;
  }
  const n = L.menu.items.length;
  if (k === "ArrowDown") { sel = (sel + 1) % n; Sonido.tecla(); e.preventDefault(); return; }
  if (k === "ArrowUp") { sel = (sel - 1 + n) % n; Sonido.tecla(); e.preventDefault(); return; }
  if (k === "Enter") { activar(sel); return; }
  const idx = L.menu.items.findIndex(it => it.key === k);
  if (idx >= 0) { activar(idx); }
}
window.addEventListener("keydown", alPulsar);

// mouse: convierte la posición a celdas de la pantalla de texto
function aCelda(e) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * L.w, y = (e.clientY - r.top) / r.height * L.h;
  return { col: Math.floor(x / L.cellW), fila: Math.floor(y / L.cellH) };
}
function opcionEn(e) {
  const { col, fila } = aCelda(e);
  const i = fila - L.menu.row;
  if (i >= 0 && i < L.menu.items.length && col >= L.menu.col - 1 && col < L.cols - 3) { return i; }
  return -1;
}
cv.addEventListener("mousemove", e => {
  if (modo !== "hub" || mensaje || ayuda) { cv.style.cursor = "default"; return; }
  const i = opcionEn(e);
  cv.style.cursor = i >= 0 ? "pointer" : "default";
  if (i >= 0 && i !== sel) { sel = i; Sonido.tecla(); }
});
cv.addEventListener("click", e => {
  if (modo === "hub" && !mensaje && !ayuda) {
    const i = opcionEn(e);
    if (i >= 0) { activar(i); }
    return;
  }
  alPulsar(e);
});

// videos
vIn.addEventListener("ended", () => { if (modo === "videoIn") { entrarHub(); } });
vOut.addEventListener("ended", () => { if (modo === "videoOut") { cambia("cuarto"); } });
vIn.addEventListener("error", () => { videoOk = false; });
vOut.addEventListener("error", () => { videoOk = false; });

// ---------- Bucle ----------
function cuadro(now) {
  const t = now / 1000, dt = (now - t0) / 1000;
  const P = CRT.P;
  golpe *= 0.9;

  if (modo === "espera") {
    P.power = 1; P.curv = 0.06; P.scan = 1; P.noise = 0.09; P.isText = 1; P.bend = 0.05;
    dibujaEspera();
    CRT.dibujar(txt, L.w, L.h, true, t);
  } else if (modo === "arranque") {
    P.power = Math.min(1, dt / 0.9); P.curv = 0.06; P.noise = 0.06; P.isText = 1;
    const n = Math.max(0, Math.floor((dt - 0.9) * 55));
    const antes = arranqueTxt.length;
    arranqueTxt = ARRANQUE.slice(0, n);
    if (arranqueTxt.length > antes && arranqueTxt.length % 3 === 0) { Sonido.tecla(); }
    if (n > ARRANQUE.length + 40) { entrarCuarto(); }
    P.bend = Math.max(0.02, golpe);
    dibujaArranque();
    CRT.dibujar(txt, L.w, L.h, true, t);
  } else if (modo === "videoIn" || modo === "videoOut" || modo === "cuarto") {
    const v = modo === "videoIn" ? vIn : vOut;
    P.power = 1; P.curv = 0; P.scan = 0.35; P.noise = 0.05; P.isText = 0;
    P.bend = Math.max(0.03, golpe);
    componeVideo(v, modo === "cuarto" ? "PULSA PARA ENTRAR A LA TV" : null);
    CRT.dibujar(comp, L.w, L.h, false, t);
  } else if (modo === "hub") {
    P.power = 1; P.scan = 1; P.noise = 0.05; P.isText = 1;
    P.curv = 0.06 * Math.min(1, dt / 0.4);       // la curva de la TV aparece al entrar
    P.bend = Math.max(0.02, golpe);
    if (now > proximaRareza && !mensaje && !ayuda) { lanzaRareza(); }
    dibujaHub();
    CRT.dibujar(txt, L.w, L.h, true, t);
  }
  requestAnimationFrame(cuadro);
}

// ---------- Arranque ----------
CRT.init(cv);
new FontFace("TransMono", "url(fonts/LiberationMono-Bold.ttf)").load().then(f => {
  document.fonts.add(f); fuenteLista = true; cache.clear();
  if (new URLSearchParams(location.search).has("saltar")) { CRT.P.power = 1; cambia("hub"); programaRareza(); }
  requestAnimationFrame(cuadro);
});
