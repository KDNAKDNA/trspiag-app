// visuals.js — estilos extra para tapar caras y "looks" de imagen.
// Reglas de privacidad:
//  - Modos de cara (6 cara, 7 collage, 8 sonrisa): se ve SOLO la foto, sin base borrosa. Por eso la foto se
//    deforma con la misma transformación que la máscara probada: su borde es exactamente el contorno de la
//    máscara (mismo tamaño, crecimiento si se pierde la cara, y estela hacia donde se mueve). La foto es opaca,
//    así que tapa lo mismo que la máscara. Si algo falla al dibujarla, se vuelve a la máscara borrosa.
//  - Logo (5): base borrosa de la máscara + logo completo encima.
//  - Efectos y looks (shader): solo leen el cuadro YA censurado, nunca el video de la cámara.

const FACE_MODES = { logo: "logo en relieve", swap: "cara", collage: "collage", grin: "sonrisa" };
const FACE_ONLY = { swap: true, collage: true, grin: true };
const FUSES = ["auto", "source-over", "multiply", "hard-light", "difference", "luminosity"];
const FUSE_NAMES = { auto: "auto", "source-over": "normal", multiply: "multiplicar", "hard-light": "luz fuerte",
                     difference: "diferencia", luminosity: "luminosidad" };
const FX_NAMES = { glitch: "glitch", rgb: "colores corridos", pulse: "pulso", logo: "logo grande", mirror: "espejo", trails: "estelas" };
const FX_KEYS = { z: "glitch", x: "rgb", v: "pulse", m: "logo", k: "mirror", t: "trails" };
const LOOKS = ["ninguno", "fotocopia", "película", "mina", "semitono espejo", "papel doblado"];

const V = {
  fx: { glitch: false, rgb: false, pulse: false, logo: false, mirror: false, trails: false },
  look: 0, fuse: "auto", grin: 1.5, srcIdx: 0, collageMs: 700,
  logoImg: null, relief: null, paper: null, grit: null, sources: [], srcMsg: "", tri: null,
  comp: null, warpG: null, post: null, sh: null,
  layers: [mkCanvas(), mkCanvas()], px: mkCanvas(),
  seed: 1, lastShuffle: 0, glitchSeed: 0, level: 0, levelPeak: 0.02, lvlAn: null, lvlBuf: null, fallbacks: 0,
};

// La malla de ml5 deja huecos en los ojos y la boca: se rellenan con abanicos alrededor de su centro
// (vértices extra 468, 469, 470).
const HOLES = [
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
  [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
];
const withCenters = P => P.concat(HOLES.map(r => {
  let x = 0, y = 0; for (const i of r) { x += P[i][0]; y += P[i][1]; } return [x / r.length, y / r.length];
}));
const HOLE_TRIS = HOLES.flatMap((r, h) => r.map((v, j) => [v, r[(j + 1) % r.length], 468 + h]));
const OVAL_SET = new Set(OVAL);

const kickPulse = () => (typeof lastKickAt === "number" && lastKickAt ? Math.exp(-(performance.now() - lastKickAt) / 160) : 0);
const fxOn = () => V.look > 0 || Object.values(V.fx).some(Boolean);
const sizeCanvas = (o, w, h) => { if (o.c.width !== w || o.c.height !== h) { o.c.width = w; o.c.height = h; } return o; };

/* ---------- Carga ---------- */
function visPreload() {
  // logo.png es el logo del estudio (solo en el computador del show); en la versión publicada
  // no está y se usa el texto "TRANSPARENCIA" (assets/logo-texto.png).
  const alLogo = img => { V.logoImg = img; V.relief = makeRelief(img.canvas); };
  V.logoImg = loadImage("assets/logo.png", alLogo, () => { V.logoImg = loadImage("assets/logo-texto.png", alLogo); });
  V.paper = loadImage("assets/papel.png");
  V.grit = loadImage("assets/roca.png");
}

// Logo → imagen en relieve: gris neutro (no cambia nada con "luz fuerte"), bordes iluminados arriba-izquierda,
// sombra abajo-derecha y la tinta un poco hundida.
function makeRelief(src) {
  const w = src.width, h = src.height, d = src.getContext("2d").getImageData(0, 0, w, h).data;
  const a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] / 255;
  const A = (x, y) => a[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  const out = document.createElement("canvas"); out.width = w; out.height = h;
  const og = out.getContext("2d"), od = og.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = A(x + 2, y + 2) - A(x - 2, y - 2), ink = A(x, y), i = (y * w + x) * 4;
    const v = Math.max(0, Math.min(255, 128 + s * 125 - ink * 55));
    od.data[i] = od.data[i + 1] = od.data[i + 2] = v;
    od.data[i + 3] = Math.min(255, (Math.abs(s) * 1.6 + ink * 0.85) * 255);
  }
  og.putImageData(od, 0, 0);
  return out;
}

// Fotos de caras: todas las imágenes de la carpeta caras/ (la lista la da python3 -m http.server).
async function visLoadSources() {
  try { V.tri = faceMesh.getTriangles().concat(HOLE_TRIS); } catch (e) { V.srcMsg = "sin triángulos de la malla"; return; }
  let names = [];
  try {
    const html = await (await fetch("caras/")).text();
    names = [...html.matchAll(/href="([^"?#]+\.(?:png|jpe?g|webp))"/gi)].map(m => decodeURIComponent(m[1]));
  } catch { /* sin lista */ }
  if (!names.length) names = ["senora.png"];
  const bad = [];
  for (const n of [...new Set(names)]) {
    try {
      const img = new Image(); img.src = "caras/" + encodeURIComponent(n); await img.decode();
      const kp = await findFace(img);
      if (!kp) { bad.push(n); continue; }
      const g = createGraphics(img.width, img.height); g.pixelDensity(1); g.drawingContext.drawImage(img, 0, 0);
      V.sources.push({ name: n, g, uv: withCenters(kp).map(([x, y]) => [x / img.width, y / img.height]) });
    } catch (e) { bad.push(n); }
  }
  if (bad.length) V.srcMsg = `no encontré cara en: ${bad.join(", ")}`;
  if (faceMesh.model) faceMesh.model.prevFaceRectsFromLandmarks = null;
}

// La malla de la foto. Fotos difíciles (puntilladas, cara que llena todo) se reintentan suavizadas y con margen.
async function findFace(img) {
  for (const [pad, blur] of [[0.5, 2], [0.5, 0], [0, 4], [1, 3], [0, 0], [0.5, 6]]) {
    const W = Math.round(img.width * (1 + pad)), H = Math.round(img.height * (1 + pad));
    const ox = (W - img.width) / 2, oy = (H - img.height) / 2;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
    g.filter = blur ? `blur(${blur}px)` : "none"; g.drawImage(img, ox, oy);
    if (faceMesh.model) faceMesh.model.prevFaceRectsFromLandmarks = null;
    const r = await faceMesh.detect(c);
    if (r.length) {
      const f = r.reduce((a, b) => (b.box.width > a.box.width ? b : a));
      return f.keypoints.map(p => [p.x - ox, p.y - oy]);
    }
  }
  return null;
}

/* ---------- Cara sobre cada músico (WebGL) ---------- */
// Toda la malla con la MISMA transformación que shapePts aplica al contorno de la máscara: el borde de la cara
// dibujada coincide exactamente con el contorno de la máscara de tamaño k.
function meshAt(t, k, grin) {
  const P = withCenters(grin ? grinPts(t.kp) : t.kp);
  let cx = 0, cy = 0;
  for (const p of t.raw) { cx += p[0]; cy += p[1]; }
  cx /= t.raw.length; cy /= t.raw.length;
  let ux = t.raw[0][0] - t.raw[18][0], uy = t.raw[0][1] - t.raw[18][1];
  const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  return P.map(p => {
    const dx = p[0] - cx, dy = p[1] - cy;
    const along = dx * ux + dy * uy, across = dx * -uy + dy * ux;
    const a = along * k * 1.08 + (along > 0 ? (k - 1) * 12 : 0), b = across * k;
    return [cx + ux * a - uy * b, cy + uy * a + ux * b];
  });
}

function renderWarp(src, meshes, w, h) {
  if (!V.warpG || V.warpG.width !== w || V.warpG.height !== h) {
    if (V.warpG) V.warpG.remove();
    V.warpG = createGraphics(w, h, WEBGL); V.warpG.pixelDensity(1);
  }
  const G = V.warpG, gl = G.drawingContext;
  G.clear(); gl.disable(gl.DEPTH_TEST);
  G.push(); G.noStroke(); G.textureMode(NORMAL); G.texture(src.g);
  G.beginShape(TRIANGLES);
  for (const P of meshes) for (const tri of V.tri) for (const i of tri) G.vertex(P[i][0] - w / 2, P[i][1] - h / 2, 0, src.uv[i][0], src.uv[i][1]);
  G.endShape(); G.pop();
  return G.elt;
}

// Sonrisa incómoda: boca más ancha con las comisuras hacia arriba, ojos más grandes (en el eje de la cara).
// El contorno de la cara (OVAL) no se mueve: así la cara deformada sigue tapando exactamente lo mismo.
function grinPts(A) {
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  let ux = A[10][0] - A[152][0], uy = A[10][1] - A[152][1];
  const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;          // hacia la frente
  const px = -uy, py = ux;                                       // a lo ancho de la cara
  const mc = mid(A[13], A[14]), mw = dist(A[61], A[291]) || 1, k = V.grin;
  const eyes = [mid(A[33], A[133]), mid(A[362], A[263])], ew = dist(A[33], A[133]) || 1;
  return A.map((p, idx) => {
    if (OVAL_SET.has(idx)) return p;
    let x = p[0], y = p[1], dx = x - mc[0], dy = y - mc[1], r = Math.hypot(dx, dy) / (mw * 1.15);
    if (r < 1) {
      const f = (1 - r * r) ** 2 * k, ac = dx * px + dy * py;
      x += px * ac * 0.9 * f + ux * Math.abs(ac) * 0.35 * f;
      y += py * ac * 0.9 * f + uy * Math.abs(ac) * 0.35 * f;
    }
    for (const e of eyes) {
      dx = x - e[0]; dy = y - e[1]; r = Math.hypot(dx, dy) / (ew * 1.2);
      if (r < 1) { const f = (1 - r * r) ** 2 * 0.55 * k; x += dx * f; y += dy * f; }
    }
    return [x, y];
  });
}

function clipPoly(g, pts, k) {
  g.beginPath();
  shapePts(pts, k, 0, 0).forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  g.closePath(); g.clip();
}

// Color promedio de cada cara en la escena (un solo color: no revela nada) para "fundir" la foto.
function tintFaces(x, snap, ks) {
  const fuse = V.fuse === "auto" ? "multiply" : V.fuse;
  if (fuse === "source-over") return;
  const p = sizeCanvas(V.px, 1, 1);
  tracks.forEach((t, i) => {
    const r = t.w * 0.5;
    p.x.drawImage(snap, Math.max(0, t.cx - r), Math.max(0, t.cy - r), 2 * r, 2 * r, 0, 0, 1, 1);
    let [R, G, B] = p.x.getImageData(0, 0, 1, 1).data;
    if (V.fuse === "auto") { R = (R + 255) / 2; G = (G + 255) / 2; B = (B + 255) / 2; }   // tono suave
    x.save(); clipPoly(x, t.raw, ks[i]);
    x.globalCompositeOperation = fuse; x.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
    x.fillRect(t.cx - 3 * t.w * ks[i], t.cy - 3 * t.w * ks[i], 6 * t.w * ks[i], 6 * t.w * ks[i]);
    x.restore();
  });
}

// Estela: desplazamientos desde donde está la cara hasta donde va (igual que la máscara).
function leadSteps(t, k) {
  const lead = S.leadMs + Math.max(0, shownT - t.lastFresh);
  let sx = t.vx * lead, sy = t.vy * lead;
  const len = Math.hypot(sx, sy), cap = 2 * t.w * k;
  if (len > cap) { sx *= cap / len; sy *= cap / len; }
  const steps = len < 3 ? 0 : Math.min(8, Math.ceil(Math.min(len, cap) / (0.25 * t.w)));
  const out = [];
  for (let i = steps; i >= 0; i--) out.push(steps ? [sx * i / steps, sy * i / steps] : [0, 0]);
  return out;   // de lejos a cerca: la posición real queda encima
}

// Modos 6/7/8: fx = solo caras. Devuelve false si no se pudo (entonces se usa la máscara borrosa).
function visBuildFaces(g, snap, w, h) {
  if (!V.sources.length || !V.tri || !tracks.length || tracks.some(t => !t.kp)) return false;
  try {
    const ks = tracks.map(t => S.size * growOf(t)), grin = S.mode === "grin";
    const src = V.sources[V.srcIdx % V.sources.length];
    const gl = renderWarp(src, tracks.map((t, i) => meshAt(t, ks[i], grin)), w, h);
    if (V.warpG.drawingContext.isContextLost()) return false;
    const L = sizeCanvas(V.layers[0], w, h);
    L.x.globalCompositeOperation = "source-over"; L.x.clearRect(0, 0, w, h); L.x.drawImage(gl, 0, 0);
    tintFaces(L.x, snap, ks);
    tracks.forEach((t, i) => {
      for (const [ox, oy] of leadSteps(t, ks[i])) {
        g.save(); g.translate(ox, oy); clipPoly(g, t.raw, ks[i]); g.drawImage(L.c, 0, 0); g.restore();
      }
    });
    if (S.mode === "collage") drawCollage(g, snap, w, h, ks, L.c);
    // Control: el centro de cada cara tiene que quedar tapado por completo.
    for (const t of tracks) {
      const a = g.getImageData(Math.round(Math.min(w - 1, Math.max(0, t.cx))), Math.round(Math.min(h - 1, Math.max(0, t.cy))), 1, 1).data[3];
      if (a < 250) { V.fallbacks++; return false; }
    }
    return true;
  } catch (e) { V.srcMsg = "error al dibujar la cara: " + errMsg(e); V.fallbacks++; return false; }
}

/* ---------- Collage tipo Aphex: franjas desfasadas encima de la cara (sin líneas) ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function drawCollage(g, snap, w, h, ks, baseLayer) {
  // Segunda capa: otra foto de caras/ (si hay) o la misma con sonrisa.
  const srcs = V.sources, two = srcs.length > 1;
  const src2 = srcs[(V.srcIdx + (two ? 1 : 0)) % srcs.length];
  const gl = renderWarp(src2, tracks.map((t, i) => meshAt(t, ks[i], !two)), w, h);
  const L2 = sizeCanvas(V.layers[1], w, h);
  L2.x.globalCompositeOperation = "source-over"; L2.x.clearRect(0, 0, w, h); L2.x.drawImage(gl, 0, 0);
  tintFaces(L2.x, snap, ks);
  const layers = [baseLayer, L2.c];
  tracks.forEach((t, ti) => {
    const R = rng(V.seed * 7919 + ti * 104729);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of shapePts(t.raw, ks[ti], 0, 0)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, bw = x1 - x0, bh = y1 - y0;
    const parts = 4 + Math.floor(R() * 4), wts = Array.from({ length: parts }, () => 0.4 + R()), sum = wts.reduce((a, b) => a + b, 0);
    let y = y0;
    for (const wt of wts) {
      const sh = bh * wt / sum, L = layers[Math.floor(R() * layers.length)];
      const dx = (R() - 0.5) * 0.55 * t.w, dy = (R() - 0.5) * 0.12 * t.w, sc = R() < 0.3 ? 1.25 : 1, mir = R() < 0.2;
      g.save(); g.beginPath(); g.rect(x0, y, bw, sh); g.clip();
      g.translate(mx + dx, my + dy); if (mir) g.scale(-1, 1); g.scale(sc, sc); g.translate(-mx, -my);
      g.drawImage(L, 0, 0);
      g.restore();
      y += sh;
    }
  });
}

/* ---------- Logo en relieve sobre cada cara (completo, sin recortar) ---------- */
function drawLogos(ctx) {
  if (!V.relief) return;
  const pulse = 1 + 0.18 * kickPulse(), ar = V.relief.width / V.relief.height;
  for (const t of tracks) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of shapePts(t.raw, S.size * growOf(t), 0, 0)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const side = Math.max(x1 - x0, y1 - y0);
    const lw = side * 1.25 * pulse, lh = lw / ar;
    const ux = t.raw[0][0] - t.raw[18][0], uy = t.raw[0][1] - t.raw[18][1];   // inclinación de la cabeza
    ctx.save(); ctx.translate((x0 + x1) / 2, (y0 + y1) / 2); ctx.rotate(Math.atan2(ux, -uy));
    ctx.drawImage(V.relief, -lw / 2, -lh / 2, lw, lh);
    ctx.restore();
  }
}

// Se llama al final de buildMask (modo logo): fx ya tiene la base borrosa dentro de la máscara.
function visDecorate(g, w, h) {
  if (S.mode !== "logo" || !tracks.length) return;
  g.globalCompositeOperation = V.fuse === "auto" ? "hard-light" : V.fuse;
  drawLogos(g);
  g.globalCompositeOperation = "source-over";
}

/* ---------- Composición, efectos y looks ---------- */
function visComp(w, h) {
  if (!V.comp || V.comp.width !== w || V.comp.height !== h) {
    if (V.comp) V.comp.remove();
    V.comp = createGraphics(w, h); V.comp.pixelDensity(1);
  }
  return V.comp.drawingContext;
}

const POST_VS = `
precision highp float;
attribute vec3 aPosition; attribute vec2 aTexCoord; varying vec2 vTexCoord;
void main() { vTexCoord = aTexCoord; gl_Position = vec4(aPosition.xy * 2.0 - 1.0, 0.0, 1.0); }`;
const POST_FS = `
precision highp float;
varying vec2 vTexCoord;
uniform sampler2D tex; uniform sampler2D logo; uniform sampler2D paper; uniform sampler2D grit;
uniform vec2 res; uniform float time, seed, glitch, rgb, zoom, look, logoAmt, logoScale, logoAspect, mirror, level, kick;
const vec3 W = vec3(0.299, 0.587, 0.114);
float h1(float n) { return fract(sin(n) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 img(vec2 uv) { return texture2D(tex, clamp(uv, 0.0, 1.0)).rgb; }
void main() {
  vec2 sc = vec2(vTexCoord.x, 1.0 - vTexCoord.y);       // posición en pantalla (arriba-izquierda = 0,0)
  vec2 uv = sc;
  if (mirror > 0.5 || (look > 3.5 && look < 4.5)) uv.x = uv.x < 0.5 ? uv.x : 1.0 - uv.x;
  uv = (uv - 0.5) / zoom + 0.5;
  if (glitch > 0.0) {                                   // franjas horizontales corridas
    float band = floor(uv.y * 26.0 + h1(seed) * 9.0);
    float r = h1(band * 3.1 + seed * 17.0);
    if (r < 0.12 + 0.45 * glitch) uv.x += (h1(band * 1.7 + seed) - 0.5) * 0.35 * glitch;
    float thin = floor(uv.y * 140.0);
    if (h1(thin + seed * 5.0) < 0.06 * glitch) uv.x += (h1(thin) - 0.5) * 0.08;
  }
  vec3 col = rgb > 0.0
    ? vec3(img(uv + vec2(rgb, 0.0)).r, img(uv).g, img(uv - vec2(rgb, rgb * 0.4)).b)
    : img(uv);
  if (logoAmt > 0.0) {                                  // logo grande en relieve, fundido con la imagen
    vec2 c = (uv - 0.5) * vec2(1.0, res.y / res.x * logoAspect) / logoScale + 0.5;
    if (c.x > 0.0 && c.x < 1.0 && c.y > 0.0 && c.y < 1.0) {
      vec2 px = 2.0 / res;
      float a = texture2D(logo, c).a;
      float e = texture2D(logo, c + px).a - texture2D(logo, c - px).a;
      col = col * (1.0 - 0.35 * a * logoAmt) + e * 0.9 * logoAmt;
    }
  }
  float l = dot(col, W);
  float fr = floor(time * 12.0);
  if (look > 0.5 && look < 1.5) {                       // FOTOCOPIA: 1 bit puntillado sobre papel cuadriculado
    l = clamp((l - 0.5) * 1.6 + 0.5, 0.0, 1.0);
    float n = h2(floor(gl_FragCoord.xy) + floor(time * 8.0) * 0.37);
    vec2 g = gl_FragCoord.xy / 42.0 + vec2(sin(gl_FragCoord.y * 0.013) * 0.08, sin(gl_FragCoord.x * 0.011) * 0.08);
    vec2 f = fract(g);
    float line = max(step(f.x, 0.04), step(f.y, 0.04));
    vec3 paperC = mix(vec3(1.0), vec3(0.55, 0.68, 1.0), line * 0.85);
    col = n < l * 1.2 - 0.08 ? paperC : vec3(0.0);
  } else if (look < 2.5 && look > 1.5) {                // PELÍCULA: color de rollo viejo, quemadura de luz, polvo
    col = mix(vec3(l), col, 1.4);
    col = col * vec3(1.02, 0.97, 1.1) + vec3(0.03, 0.0, 0.07) * (1.0 - l);
    float wob = 0.05 * sin(time * 0.6 + sc.y * 3.0) + 0.03 * sin(time * 1.7);
    float leak = smoothstep(0.45, 0.0, sc.x + wob) * (0.8 + 0.2 * sin(time * 1.1)) * (1.0 + 0.5 * kick);
    vec3 leakC = mix(vec3(1.0, 0.55, 0.08), vec3(1.0, 0.35, 0.65), smoothstep(0.02, 0.32, sc.x));
    col = 1.0 - (1.0 - col) * (1.0 - clamp(leakC * leak, 0.0, 1.0));
    float d = h2(floor(gl_FragCoord.xy / 3.0) + fr * 1.7);
    if (d > 0.9992) col = mix(col, vec3(1.0, 0.85, 0.55), 0.9);
    col += (h2(gl_FragCoord.xy + fr) - 0.5) * 0.07;
    vec2 q = sc - 0.5; col *= 1.0 - dot(q, q) * 0.7;
  } else if (look < 3.5 && look > 2.5) {                // MINA: oscuro, verdoso, roca, pliegues de papel
    vec3 g = vec3(l) * vec3(0.82, 1.0, 0.88);
    g = (g - 0.5) * 1.55 + 0.38;
    float gr = texture2D(grit, sc).r;
    g = g * (0.55 + 0.9 * gr) * 0.85;
    float cy = abs(sc.y - 0.49), cx = abs(sc.x - 0.56);
    g += vec3(0.22) * (smoothstep(0.003, 0.0, cy) + smoothstep(0.0025, 0.0, cx)) - vec3(0.1) * smoothstep(0.012, 0.003, cy);
    g += (h2(gl_FragCoord.xy + floor(time * 15.0)) - 0.5) * 0.12;
    col = g;
  } else if (look < 4.5 && look > 3.5) {                // SEMITONO ESPEJO: duotono azul con puntos de imprenta
    vec2 p = gl_FragCoord.xy;
    float n = h2(floor(p / 2.0) + floor(time * 6.0));
    float dots = length(fract(p / (6.0 - 1.5 * kick)) - 0.5) * 1.4;
    float on = step(mix(n, dots, 0.55), l * 1.15);
    vec3 dark = vec3(0.06, 0.08, 0.2), mid = vec3(0.24, 0.52, 0.6), light = vec3(0.9, 0.96, 1.0);
    vec3 tone = l < 0.5 ? mix(dark, mid, l * 2.0) : mix(mid, light, l * 2.0 - 1.0);
    col = on > 0.5 ? tone * 1.1 + 0.04 : dark;
    col *= mix(0.7, 1.0, smoothstep(0.0, 0.55, sc.y));
  } else if (look > 4.5) {                              // PAPEL DOBLADO: degradé verde-violeta, brillos dorados, pliegues
    vec3 grad = mix(vec3(0.62, 0.8, 0.7), vec3(0.22, 0.2, 0.37), smoothstep(0.1, 0.95, sc.y));
    col = grad * (0.35 + 1.05 * l) + vec3(0.3, 0.18, 0.0) * smoothstep(0.55, 1.0, l);
    float pp = texture2D(paper, sc).r;
    col = col * (0.7 + 0.6 * pp) + (pp - 0.5) * 0.2;
    col += (h2(gl_FragCoord.xy + floor(time * 10.0)) - 0.5) * 0.05;
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function runPost(w, h) {
  if (!V.post || V.post.width !== w || V.post.height !== h) {
    if (V.post) V.post.remove();
    V.post = createGraphics(w, h, WEBGL); V.post.pixelDensity(1);
    V.sh = V.post.createShader(POST_VS, POST_FS);
  }
  const P = V.post, sh = V.sh, kp = kickPulse(), f = V.fx;
  P.shader(sh);
  sh.setUniform("tex", V.comp);
  sh.setUniform("logo", V.logoImg);
  sh.setUniform("paper", V.paper);
  sh.setUniform("grit", V.grit);
  sh.setUniform("res", [w, h]);
  sh.setUniform("time", performance.now() / 1000);
  sh.setUniform("seed", V.glitchSeed + Math.floor(performance.now() / 90) * (f.glitch ? 1 : 0) * 0.013);
  sh.setUniform("glitch", f.glitch ? Math.min(1, 0.25 + 0.75 * kp + 0.3 * V.level) : 0);
  sh.setUniform("rgb", f.rgb ? 0.003 + 0.012 * V.level + 0.018 * kp : 0);
  sh.setUniform("zoom", f.pulse ? 1 + 0.08 * kp : 1);
  sh.setUniform("look", V.look);
  sh.setUniform("logoAmt", f.logo ? 1 : 0);
  sh.setUniform("logoScale", 0.75 * (1 + 0.1 * kp));
  sh.setUniform("logoAspect", V.logoImg && V.logoImg.width ? V.logoImg.width / V.logoImg.height : 2.4);
  sh.setUniform("mirror", f.mirror ? 1 : 0);
  sh.setUniform("level", V.level);
  sh.setUniform("kick", kp);
  P.noStroke(); P.rect(0, 0, w, h);
  return P.elt;
}

// Lleva el cuadro compuesto (ya censurado) a la pantalla, con o sin efectos.
function visPresent(w, h) {
  const L = layout(w, h), ctx = drawingContext;
  const src = fxOn() ? runPost(w, h) : V.comp.elt;
  if (V.fx.trails) { ctx.globalAlpha = 0.3; ctx.drawImage(src, ...L); ctx.globalAlpha = 1; }
  else { background(0); ctx.drawImage(src, ...L); }
}

/* ---------- Audio (nivel general) y bombo ---------- */
function visWantsAudio() {
  return S.mode === "logo" || S.mode === "collage" || V.look === 2 || V.look === 4
    || V.fx.glitch || V.fx.rgb || V.fx.pulse || V.fx.logo;
}
function visAudioSetup(ctx, src) {
  V.lvlAn = ctx.createAnalyser(); V.lvlAn.fftSize = 1024; V.lvlBuf = new Float32Array(V.lvlAn.fftSize);
  src.connect(V.lvlAn);
}
function visAudioPoll(dt) {
  if (!V.lvlAn) return;
  V.lvlAn.getFloatTimeDomainData(V.lvlBuf);
  let e = 0; for (const v of V.lvlBuf) e += v * v; e = Math.sqrt(e / V.lvlBuf.length);
  V.levelPeak = Math.max(e, 0.01, V.levelPeak * Math.pow(0.5, dt / 4000));   // ganancia automática
  V.level = 0.8 * V.level + 0.2 * Math.min(1, e / V.levelPeak);
}
function visOnKick() {
  V.glitchSeed = Math.random() * 1000;
  if (S.mode === "collage") { V.seed++; V.lastShuffle = performance.now(); }
}
// Cada cuadro: el collage se reordena solo cada collageMs (más lento si el bombo ya lo mueve).
function visTick(now) {
  if (S.mode === "collage" && now - V.lastShuffle > V.collageMs * (kickAn ? 2.5 : 1)) { V.seed++; V.lastShuffle = now; dirty = true; }
}
const visAnimating = () => fxOn();

/* ---------- Teclas ---------- */
function visKey(k) {
  if (k === "5") S.mode = "logo";
  else if (k === "6") S.mode = "swap";
  else if (k === "7") S.mode = "collage";
  else if (k === "8") S.mode = "grin";
  else if (k === "9") { if (V.sources.length) V.srcIdx = (V.srcIdx + 1) % V.sources.length; note(V.sources.length ? `foto: ${V.sources[V.srcIdx].name}` : "no hay fotos en caras/"); }
  else if (k === "g") V.fuse = FUSES[(FUSES.indexOf(V.fuse) + 1) % FUSES.length];
  else if (FX_KEYS[k]) V.fx[FX_KEYS[k]] = !V.fx[FX_KEYS[k]];
  else if (k === " ") { V.look = (V.look + 1) % LOOKS.length; note(`look: ${LOOKS[V.look]}`); }
  else if (k === "n") V.look = V.look === 1 ? 0 : 1;
  else if (k === "0") { for (const n in V.fx) V.fx[n] = false; V.look = 0; }
  else if (k === "s") surprise();
  else return false;
  return true;
}
function surprise() {
  S.mode = ["kick", "logo", "swap", "collage", "grin"][Math.floor(Math.random() * 5)];
  for (const n of Object.keys(V.fx)) V.fx[n] = Math.random() < 0.25;
  V.look = Math.floor(Math.random() * LOOKS.length);
  if (V.look && V.fx.trails) V.fx.trails = false;
  if (!fxOn()) V.fx[["glitch", "rgb", "pulse", "logo"][Math.floor(Math.random() * 4)]] = true;
}
function visBump(d) {
  if (S.mode === "grin") { V.grin = +constrain(V.grin + d * 0.15, 0.2, 2).toFixed(2); return true; }
  if (FACE_ONLY[S.mode]) { S.size = +constrain(S.size + d * 0.05, 1, 2.5).toFixed(2); return true; }   // tamaño de la cara
  if (S.mode === "logo") { S.blur = constrain(S.blur + d * 5, 20, 120); return true; }
  return false;
}

/* ---------- HUD ---------- */
const MODE_NAMES = { blur: "borroso", pixel: "pixelado", color: "color", kick: "colores con el bombo", ...FACE_MODES };
function visHud() {
  const on = Object.keys(V.fx).filter(n => V.fx[n]).map(n => FX_NAMES[n]);
  const src = V.sources.length ? `foto <b>${V.sources[V.srcIdx % V.sources.length].name}</b> (${V.srcIdx % V.sources.length + 1}/${V.sources.length})` : "<span class='warn'>sin fotos de caras</span>";
  let s = `look <b>${LOOKS[V.look]}</b> · efectos: <b>${on.length ? on.join(", ") : "ninguno"}</b>`;
  if (FACE_ONLY[S.mode]) s += ` · ${src} · fusión <b>${FUSE_NAMES[V.fuse]}</b>`;
  if (S.mode === "grin") s += ` · sonrisa <b>${V.grin}</b>`;
  if (V.fallbacks) s += ` · <span class="warn">cara no dibujada ${V.fallbacks}× (se usó borroso)</span>`;
  if (V.srcMsg) s += `<br><span class="warn">${V.srcMsg}</span>`;
  return s;
}
