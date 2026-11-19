// Censura en vivo — p5.js + ml5 faceMesh
// Cada cuadro de la cámara se congela, se analiza y se muestra JUNTO con las caras detectadas en ese
// mismo cuadro: la máscara nunca va atrasada respecto a la imagen. Ante cualquier duda (arranque,
// detección caída, faltan caras, cámara perdida) se censura el cuadro completo.

// Contorno de la cara (óvalo) en la malla de 468 puntos, en orden.
const OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,
              152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];

const S = {
  shape: "square",     // "square" = cuadrado sobre la cara | "face" = forma del contorno de la cara. Tecla Q.
  mode: "color",       // relleno: "blur" | "pixel" | "color" (color 0 = negro) | "kick" (colores con el bombo)
                       // | "logo" | "swap" | "collage" | "grin" (visuals.js, siempre sobre base borrosa)
  blur: 45,            // intensidad del blur (px)
  pixel: 26,           // tamaño del pixel (px)
  colors: ["#000000", "#ff2d2d", "#ffffff", "#00e0ff"],
  colorIdx: 0,
  size: 1.35,          // cuánto se agranda la censura sobre el contorno
  feather: 0,          // borde suave (0 = borde nítido)
  smooth: 0.85,        // 1 = sin suavizado. Solo estético: el contorno real siempre se censura también.
  blurMinFace: 0.18,   // blur mínimo = 18 % del ancho de la cara más grande
  pixelMaxBlocks: 8,   // como máximo 8 bloques a lo ancho de la cara más grande

  expected: 3,         // caras que deben verse. Menos que esto → censura total (0 = desactivado). Tecla E.
  missingGraceMs: 1500,// cuánto tiempo puede faltar una cara (con su máscara creciendo) antes de la censura total
  holdMisses: 15,      // resultados seguidos sin ver una cara antes de soltar su máscara (y además pasado missingGraceMs)
  growPerSec: 1.0,     // la máscara de una cara perdida crece +100 % por segundo…
  maxGrow: 2.2,        // …hasta 2.2× su tamaño
  leadMs: 180,         // la máscara se estira hacia donde se mueve la cara (180 ms de movimiento)
  peakHalfLifeMs: 600, // memoria de la velocidad máxima reciente de cada cara (para caras perdidas)
  speedSafety: 2,      // se asume que una cara perdida puede ir 2× más rápido de lo medido
  watchdogMs: 500,     // sin resultados de detección durante esto → censura total
  reinitMs: 4000,      // detección caída durante esto → se recarga el modelo
  roiTracking: false,  // false = cada cuadro se detecta desde cero (sin seguir la región del cuadro anterior):
                       // nada atrasado; si una cara no se detecta, cuenta como perdida.
  detector: "full",    // "full" (hasta ~2 m, requiere libs/ml5.min.js parcheado) | "short" (hasta ~1 m)

  // Relleno "kick" (tecla 4): escucha el micrófono del laptop y con cada golpe de bombo salta al color
  // opuesto en la rueda de color (colores vivos).
  kickRatio: 0.55,     // un golpe debe ser al menos 55 % del golpe más fuerte reciente. Menor = detecta
                       // golpes más suaves (pero más falsos). ↑↓ con el relleno 4.
  kickPeakHalfLifeMs: 2000, // cuánto "recuerda" el golpe más fuerte
  kickMinGapMs: 333,   // máximo 3 cambios por segundo: más rápido puede provocar crisis en personas con
                       // epilepsia fotosensible. No bajar de 333.
  kickRotateEvery: 8,  // cada 8 golpes el par de colores opuestos gira 30° en la rueda

  recSegmentMin: 10,   // la grabación se corta en archivos de 10 min
  panic: false,        // censura total manual
  hud: true,
  mic: false,
};

// El detector "full" solo existe en nuestra copia parcheada de ml5 (ver libs/README.md).
const DETECTOR = S.detector === "full" && window.ML5_PATCHED_FULL_DETECTOR ? "full" : "short";
window.ML5_FACE_DETECTOR = DETECTOR;
const FM_OPTS = {
  maxFaces: 5, refineLandmarks: false, flipped: false,   // el espejo lo hacemos nosotros al congelar el cuadro
  detectorModelUrl: `models/facemesh-detection-${DETECTOR}.json`,
  landmarkModelUrl: "models/facemesh.json",
};

let cnv, video, faceMesh, hud, tracks = [];
const mkCanvas = () => { const c = document.createElement("canvas"); return { c, x: c.getContext("2d") }; };
const snaps = [mkCanvas(), mkCanvas()];   // doble buffer: uno se analiza mientras el otro se muestra
const fx = mkCanvas(), msk = mkCanvas(), small = mkCanvas(), tiny = mkCanvas();
let shownIdx = -1, shownT = 0, frameW = 0, frameH = 0;
let lastResultAt = 0, loopStartAt = 0, belowSince = 0, armed = false, detectedNow = 0;
let detGen = 0, detErrors = 0, lastErr = "", lastErrAt = 0, reinits = 0, lastReinitAt = 0, rvfcWorks = false;
const detMs = [], paints = [];
let dirty = true, lastDrawn = "", fullReason = "", camLost = false, camStartAt = 0;
let ctrlWin = null, hudMsg = "", noteTxt = "", noteUntil = 0;

function preload() {
  faceMesh = ml5.faceMesh(FM_OPTS);
  visPreload();
}
let sourcesReady = false;

function setup() {
  pixelDensity(1);
  cnv = createCanvas(windowWidth, windowHeight);
  background(0);
  video = createCapture(
    { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
  video.hide();
  hud = createDiv("").id("hud");
  camStartAt = loopStartAt = performance.now();
  // Primero se ubican las caras de las fotos de caras/ (mismo modelo); después arranca la detección en vivo.
  visLoadSources().catch(e => console.error(e)).finally(() => {
    sourcesReady = true; loopStartAt = performance.now(); detectLoop(detGen);
  });
  setInterval(watchdog, 250);
  setInterval(pollKick, 10);
  window.addEventListener("message", onMessage);
  window.addEventListener("beforeunload", e => { if (recOn) { e.preventDefault(); e.returnValue = ""; } });
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); background(0); dirty = true; }

const camReady = () => video && video.elt.readyState >= 2 && video.elt.videoWidth > 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errMsg = e => String((e && e.message) || e).slice(0, 140);

/* ---------- Detección: congelar cuadro → analizar → mostrar ese mismo cuadro ---------- */
function nextVideoFrame() {
  const v = video.elt;
  return new Promise(res => {
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => { rvfcWorks = true; fin(); });
    setTimeout(fin, rvfcWorks ? 250 : 20);
  });
}

function snapshot(i) {
  const v = video.elt, w = v.videoWidth, h = v.videoHeight, s = snaps[i];
  if (w !== frameW || h !== frameH) {          // cambió la resolución: no reutilizar posiciones viejas
    frameW = w; frameH = h; tracks = []; armed = false;
  }
  if (s.c.width !== w || s.c.height !== h) { s.c.width = w; s.c.height = h; }
  s.x.setTransform(-1, 0, 0, 1, w, 0);         // espejo
  s.x.drawImage(v, 0, 0, w, h);
  s.x.setTransform(1, 0, 0, 1, 0, 0);
}

async function detectLoop(gen) {
  while (gen === detGen) {
    if (!camReady()) { await sleep(100); continue; }
    await nextVideoFrame();
    if (gen !== detGen) return;
    const i = shownIdx === 0 ? 1 : 0;
    snapshot(i);
    const t0 = performance.now();
    let faces;
    try {
      if (!S.roiTracking && faceMesh.model) faceMesh.model.prevFaceRectsFromLandmarks = null;
      faces = await faceMesh.detect(snaps[i].c);
    } catch (e) {
      if (gen !== detGen) return;
      detErrors++; lastErr = errMsg(e); lastErrAt = performance.now(); console.error("Detección falló:", e);
      await sleep(200);
      continue;
    }
    if (gen !== detGen) return;
    detErrors = 0;
    detMs.push(performance.now() - t0); if (detMs.length > 30) detMs.shift();
    onResult(faces, i, t0);
  }
}

function onResult(faces, i, t) {
  if (snaps[i].c.width !== frameW || snaps[i].c.height !== frameH) return;
  updateTracks(faces, t);
  shownIdx = i; shownT = t; dirty = true;
  lastResultAt = performance.now();
  if (S.expected === 0 || detectedNow >= S.expected) { belowSince = 0; armed = true; }
  else if (!belowSince) belowSince = lastResultAt;
}

// Detección colgada o fallando, cámara terminada.
function watchdog() {
  const now = performance.now();
  const tr = video && video.elt.srcObject && video.elt.srcObject.getVideoTracks()[0];
  if (tr && tr.readyState === "ended") camLost = true;
  if (sourcesReady && camReady() && !camLost && now - Math.max(lastResultAt, loopStartAt, lastReinitAt) > S.reinitMs) reinitDetector();
}

async function reinitDetector() {
  lastReinitAt = performance.now(); reinits++;
  const gen = ++detGen;
  try {
    const fm = ml5.faceMesh(FM_OPTS);
    await fm.ready;
    if (gen !== detGen) return;
    const old = faceMesh; faceMesh = fm;
    try { old && old.model && old.model.dispose && old.model.dispose(); } catch { /* ya roto */ }
    detErrors = 0; loopStartAt = performance.now();
    detectLoop(gen);
  } catch (e) { lastErr = "reinicio falló: " + errMsg(e); lastErrAt = performance.now(); console.error(e); }
}

/* ---------- Seguimiento de cada cara ---------- */
function contour(face) {
  const kp = face.keypoints;
  const pts = OVAL.map(i => [kp[i].x, kp[i].y]);
  let cx = 0, cy = 0, x0 = Infinity, x1 = -Infinity;
  for (const p of pts) { cx += p[0]; cy += p[1]; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
  return { pts, cx: cx / pts.length, cy: cy / pts.length, w: x1 - x0, tracked: !!face.tracked,
           kp: kp.map(p => [p.x, p.y]) };
}

function updateTracks(list, now) {
  const fresh = list.map(contour);
  // Emparejar por cercanía, empezando por los pares más cercanos.
  const pairs = [], maxD = frameW * 0.25;
  fresh.forEach((f, fi) => tracks.forEach((t, ti) => {
    const d = Math.hypot(t.cx - f.cx, t.cy - f.cy);
    if (d < maxD) pairs.push([d, fi, ti]);
  }));
  pairs.sort((a, b) => a[0] - b[0]);
  const fUsed = new Set(), tUsed = new Set(), a = S.smooth;
  for (const [, fi, ti] of pairs) {
    if (fUsed.has(fi) || tUsed.has(ti)) continue;
    fUsed.add(fi); tUsed.add(ti);
    const t = tracks[ti], f = fresh[fi];
    // "tracked" = ml5 la siguió desde la región del cuadro anterior (puede ir atrasada). La velocidad
    // solo se mide entre detecciones nuevas.
    if (!f.tracked) {
      const dt = Math.max(1, now - t.lastFresh);
      const vx = (f.cx - t.fcx) / dt, vy = (f.cy - t.fcy) / dt;   // px por ms
      const keep = dt < 400 ? 0.5 : 0;
      t.vx = keep * t.vx + (1 - keep) * vx; t.vy = keep * t.vy + (1 - keep) * vy;
      t.peak = Math.max(Math.hypot(vx, vy), (t.peak || 0) * Math.pow(0.5, dt / S.peakHalfLifeMs));
      t.fcx = f.cx; t.fcy = f.cy; t.lastFresh = now;
    }
    t.tracked = f.tracked;
    t.smooth = t.smooth.map((p, k) => [lerp(p[0], f.pts[k][0], a), lerp(p[1], f.pts[k][1], a)]);
    Object.assign(t, { raw: f.pts, kp: f.kp, cx: f.cx, cy: f.cy, w: f.w, seen: now, miss: 0 });
  }
  // Caras distintas en este cuadro (dos detecciones sobre la misma cara cuentan una).
  const uniq = [];
  for (const f of fresh) if (!uniq.some(u => Math.hypot(u.cx - f.cx, u.cy - f.cy) < 0.5 * Math.max(u.w, f.w))) uniq.push(f);
  detectedNow = uniq.length;
  // Una máscara perdida solo se suelta cuando ya no hace falta: o se ven todas las caras esperadas,
  // o la censura total ya está activa (nunca antes: eso dejaría un cuadro con la cara expuesta).
  const fallbackOn = belowSince && performance.now() - belowSince > S.missingGraceMs;
  const canDrop = S.expected === 0 || detectedNow >= S.expected || fallbackOn;
  const next = [];
  tracks.forEach((t, ti) => {
    if (tUsed.has(ti)) { next.push(t); return; }
    t.miss++;   // cara perdida: sigue censurada (y creciendo) un rato
    if (!(canDrop && t.miss > S.holdMisses && now - t.seen > S.missingGraceMs)) next.push(t);
  });
  fresh.forEach((f, fi) => {
    if (!fUsed.has(fi)) next.push({ raw: f.pts, kp: f.kp, smooth: f.pts, cx: f.cx, cy: f.cy, w: f.w, seen: now, miss: 0, vx: 0, vy: 0, peak: 0,
                                   fcx: f.cx, fcy: f.cy, lastFresh: now, tracked: f.tracked });
  });
  tracks = next;
}

const maxFaceW = () => tracks.reduce((m, t) => Math.max(m, t.w * (t.miss ? growOf(t) : 1)), 0);
// Máscara de una cara no confirmada en este cuadro: crece con el tiempo y, si se movía, lo suficiente para
// cubrir todo lugar al que pudo llegar a su velocidad máxima reciente. Si eso supera maxGrow → censura total.
const unsure = t => t.miss > 0 || t.tracked;
const needGrow = t => {
  const dt = Math.max(0, shownT - t.lastFresh), r0 = S.size * t.w / 2;
  return Math.max(1 + S.growPerSec * dt / 1000, (S.speedSafety * (t.peak || 0) * dt + t.w / 2) / r0);
};
const growOf = t => unsure(t) ? Math.min(S.maxGrow, needGrow(t)) : 1;

/* ---------- Censura ---------- */
// Blur sobre una copia reducida (4× más chica): mucho más barato. Se dibuja con margen para que
// los bordes del cuadro queden 100 % opacos.
function blurInto(src, w, h, sigma, mirror) {
  const f = 4, sw = Math.ceil(w / f), sh = Math.ceil(h / f), s = sigma / f, m = Math.ceil(s * 3);
  if (small.c.width !== sw || small.c.height !== sh) { small.c.width = sw; small.c.height = sh; }
  const x = small.x;
  x.filter = "none"; x.fillStyle = "#444"; x.fillRect(0, 0, sw, sh);
  if (mirror) x.setTransform(-1, 0, 0, 1, sw, 0);
  x.filter = `blur(${s}px)`;
  x.drawImage(src, -m, -m, sw + 2 * m, sh + 2 * m);
  x.filter = "none"; x.setTransform(1, 0, 0, 1, 0, 0);
  return small.c;
}

function drawCensor(g, src, w, h) {
  const fw = maxFaceW();
  if (S.mode === "color" || S.mode === "kick") {
    g.fillStyle = S.mode === "kick" ? `hsl(${kickHue}, 100%, 50%)` : S.colors[S.colorIdx];
    g.fillRect(0, 0, w, h);
  } else if (S.mode === "pixel") {
    const b = Math.max(S.pixel, fw / S.pixelMaxBlocks), tw = Math.ceil(w / b), th = Math.ceil(h / b);
    if (tiny.c.width !== tw || tiny.c.height !== th) { tiny.c.width = tw; tiny.c.height = th; }
    tiny.x.drawImage(src, 0, 0, tw, th);
    g.imageSmoothingEnabled = false;
    g.drawImage(tiny.c, 0, 0, tw, th, 0, 0, tw * b, th * b);
    g.imageSmoothingEnabled = true;
  } else {
    g.drawImage(blurInto(src, w, h, Math.max(S.blur, fw * S.blurMinFace), false), 0, 0, w, h);
  }
}

// Agranda el contorno k veces, un poco más a lo largo del eje de la cara (mentón → frente, sirve
// también con la cabeza inclinada) y desplazado hacia la frente para cubrir el pelo.
function shapePts(pts, k, ox, oy) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  let ux = pts[0][0] - pts[18][0], uy = pts[0][1] - pts[18][1];   // OVAL[0] = frente, OVAL[18] = mentón
  const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  return pts.map(p => {
    const dx = p[0] - cx, dy = p[1] - cy;
    const along = dx * ux + dy * uy, across = dx * -uy + dy * ux;
    const a = along * k * 1.08 + (along > 0 ? (k - 1) * 12 : 0), b = across * k;
    return [cx + ux * a - uy * b + ox, cy + uy * a + ux * b + oy];
  });
}
function poly(g, pts, k, ox, oy) {
  g.beginPath();
  shapePts(pts, k, ox, oy).forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  g.closePath(); g.fill();
}

function buildMask() {
  const s = snaps[shownIdx], w = s.c.width, h = s.c.height, g = fx.x;
  if (fx.c.width !== w || fx.c.height !== h) { fx.c.width = w; fx.c.height = h; }
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, w, h);
  if (!tracks.length) return;
  // Modos 6/7/8: solo la foto de la cara (con el mismo contorno que la máscara). Si no se puede, máscara normal.
  if (FACE_ONLY[S.mode]) {
    if (visBuildFaces(g, s.c, w, h)) return;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, w, h);
  }
  // Con borde suave la forma se dibuja a media resolución (el blur cuesta 4× menos);
  // sin borde suave se dibuja directo, a resolución completa y nítida.
  const soft = S.feather > 0, mw = Math.ceil(w / 2), mh = Math.ceil(h / 2), m = soft ? msk.x : g;
  if (soft) {
    if (msk.c.width !== mw || msk.c.height !== mh) { msk.c.width = mw; msk.c.height = mh; }
    m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, mw, mh);
    m.setTransform(0.5, 0, 0, 0.5, 0, 0);
    m.filter = `blur(${S.feather / 2}px)`;
  }
  m.fillStyle = "#fff";
  for (const t of tracks) {
    const k = S.size * growOf(t);
    // Movimiento: con caras rápidas la malla puede quedar atrás, y una cara perdida sigue moviéndose.
    // Se estira la máscara desde donde está hasta donde va (unión de copias desplazadas).
    const lead = S.leadMs + Math.max(0, shownT - t.lastFresh);
    let sx = t.vx * lead, sy = t.vy * lead;
    const len = Math.hypot(sx, sy), cap = 2 * t.w * k;
    if (len > cap) { sx *= cap / len; sy *= cap / len; }
    const steps = len < 3 ? 0 : Math.min(8, Math.ceil(Math.min(len, cap) / (0.25 * t.w)));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i <= steps; i++) {
      const ox = steps ? sx * i / steps : 0, oy = steps ? sy * i / steps : 0;
      for (const pts of S.smooth < 1 ? [t.raw, t.smooth] : [t.raw]) {   // contorno real + suavizado (unión)
        if (S.shape === "face") { poly(m, pts, k, ox, oy); continue; }
        for (const [x, y] of shapePts(pts, k, ox, oy)) {
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
    }
    if (S.shape !== "face") {
      // Cuadrado que contiene toda la forma de la cara (incluido crecimiento y movimiento):
      // tapa siempre al menos lo mismo que el contorno.
      const side = Math.max(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const qx = Math.floor(mx - side / 2), qy = Math.floor(my - side / 2), qs = Math.ceil(side) + 1;
      m.fillRect(qx, qy, qs, qs);
    }
  }
  if (soft) {
    m.filter = "none"; m.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(msk.c, 0, 0, w, h);
  }
  g.globalCompositeOperation = "source-in";   // solo deja la censura dentro de la forma de las caras
  drawCensor(g, s.c, w, h);
  g.globalCompositeOperation = "source-over";
  visDecorate(g, w, h);   // logo / cara fusionada / collage / sonrisa: encima de la base, dentro de la máscara
}

/* ---------- Draw ---------- */
function layout(w, h) {
  const sc = Math.min(width / w, height / h), dw = w * sc, dh = h * sc;
  return [(width - dw) / 2, (height - dh) / 2, dw, dh];
}

function fullCensorReason(now) {
  if (S.panic) return "manual (B)";
  if (camLost) return "cámara desconectada";
  if (shownIdx < 0) return "iniciando detección";
  if (now - lastResultAt > S.watchdogMs) return "detección detenida";
  if (!armed) return `esperando ${S.expected} caras (veo ${detectedNow})`;
  if (belowSince && now - belowSince > S.missingGraceMs) return `faltan caras (veo ${detectedNow} de ${S.expected})`;
  // Una cara rápida que no se detectó de nuevo en este cuadro (perdida, o solo seguida desde el cuadro
  // anterior) puede haberse salido de su máscara: más de media cara de movimiento posible → censura total.
  const missingOk = S.expected > 0 && detectedNow >= S.expected;
  for (const t of tracks) {
    if (!unsure(t)) continue;
    if (t.miss && missingOk) continue;   // máscara fantasma: las caras esperadas están todas a la vista
    if (needGrow(t) > S.maxGrow) return t.miss ? "cara rápida perdida" : "cara rápida sin confirmar";
  }
  return "";
}

function draw() {
  const now = performance.now();
  if (!camReady()) {
    background(0);
    if (frameCount % 10 === 0) updateHud(now - camStartAt > 8000
      ? "⚠ <b>Cámara no disponible.</b> Revisa el permiso de cámara de Chrome (y en macOS: Ajustes › Privacidad › Cámara), y que ninguna otra app (Zoom, OBS…) la esté usando. Luego recarga."
      : "Esperando cámara…");
    return;
  }
  fullReason = fullCensorReason(now);
  visTick(now);
  if (fullReason) {
    // Censura total sobre el video en vivo: se ve movimiento, nunca caras.
    const v = video.elt, w = v.videoWidth, h = v.videoHeight, c = visComp(w, h);
    c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
    c.drawImage(blurInto(v, w, h, Math.max(60, S.blur, maxFaceW() * S.blurMinFace), true), 0, 0, w, h);
    visPresent(w, h);
    lastDrawn = "full";
  } else if (dirty || lastDrawn !== "frame" || visAnimating()) {
    const s = snaps[shownIdx], w = s.c.width, h = s.c.height;
    if (dirty || lastDrawn !== "frame") {
      buildMask();
      const c = visComp(w, h);
      c.drawImage(s.c, 0, 0); c.drawImage(fx.c, 0, 0);   // cuadro congelado + su censura
      dirty = false;
      paints.push(now); while (paints.length && now - paints[0] > 1000) paints.shift();
    }
    visPresent(w, h);   // con efectos de imagen, si hay alguno activo (solo leen el cuadro ya censurado)
    lastDrawn = "frame";
  }
  if (frameCount % 10 === 0) updateHud();
}

/* ---------- HUD (HTML: no sale en la grabación; pasa a la ventana de control con C) ---------- */
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const note = t => { noteTxt = t; noteUntil = performance.now() + 5000; updateHud(); };
const ctrlOpen = () => { try { return !!ctrlWin && !ctrlWin.closed; } catch { return false; } };

function hudHtml() {
  if (hudMsg) return hudMsg;
  const now = performance.now();
  const val = S.mode === "blur" ? S.blur : S.mode === "pixel" ? S.pixel
    : S.mode === "kick" ? `sensibilidad ${Math.round(10 * (0.9 - S.kickRatio) / 0.7)}/10`
    : S.mode === "grin" ? `sonrisa ${V.grin}` : FACE_ONLY[S.mode] ? `solo la cara`
    : S.mode === "logo" ? `base borrosa ${S.blur}` : S.colors[S.colorIdx];
  const ms = detMs.length ? Math.round(detMs.reduce((a, b) => a + b, 0) / detMs.length) : 0;
  const state = fullReason
    ? `<span class="rec">CENSURA TOTAL — ${fullReason}</span>`
    : `<span class="ok">OK</span>`;
  const recTxt = recOn
    ? `<span class="rec">● REC ${fmt((Date.now() - recStart) / 1000)}</span> parte ${recSeg} → ${recDir ? "carpeta <b>" + recDir.name + "</b>" : "<span class='warn'>memoria (descarga cada " + S.recSegmentMin + " min)</span>"}`
    : `○ sin grabar · carpeta: ${recDir ? "<b>" + recDir.name + "</b>" : "<span class='warn'>ninguna (D)</span>"}`;
  const warn = [];
  if (DETECTOR !== S.detector) warn.push(`detector "${S.detector}" no disponible en esta ml5: usando "${DETECTOR}"`);
  if (detErrors || (lastErr && now - lastErrAt < 15000)) warn.push(`detección: ${detErrors} errores seguidos · ${lastErr}`);
  if (reinits) warn.push(`modelo recargado ${reinits}× (si sigue cayendo: F5 y luego F otra vez)`);
  if (recErr) warn.push(`grabación: ${recErr}`);
  if (noteTxt && now < noteUntil) warn.push(noteTxt);
  return `
    <b>CENSURA EN VIVO</b> · ${state}<br>
    caras <b>${detectedNow}</b> / esperadas <b>${S.expected || "—"}</b> · máscaras ${tracks.length} · detector ${DETECTOR}
    · ${paints.length} img/s · ${Math.round(frameRate())} fps · análisis ${ms} ms<br>
    forma <b>${S.shape === "face" ? "cara" : "cuadrado"}</b> · relleno <b>${MODE_NAMES[S.mode] || S.mode}</b> (${val}) · tamaño <b>${S.size.toFixed(2)}×</b> · borde <b>${S.feather}</b> · respuesta <b>${Math.round(S.smooth * 100)}%</b><br>
    ${recTxt} · audio mic <b>${S.mic ? (micStream ? "sí" : "…") : "no"}</b>
    <br>${visHud()}
    ${audioWanted() ? "<br>" + kickHud(now) : ""}
    ${warn.length ? `<div class="warn">${warn.join("<br>")}</div>` : ""}
    <div class="keys"><b>Caras:</b> Q forma · 1 borroso · 2 pixelado · 3 color · 4 colores con el bombo · 5 logo en relieve
    · 6 cara · 7 collage · 8 sonrisa · 9 otra foto · G fusión<br>
    <b>Imagen:</b> Espacio siguiente look · N fotocopia · Z glitch · X colores corridos · V pulso · M logo grande · K espejo
    · T estelas · S sorpresa · 0 apagar todo<br>
    ↑↓ intensidad (en 6 y 7: tamaño de la cara; en 8: sonrisa) · ←→ tamaño · [ ] borde · - + respuesta · E caras esperadas · B censura total<br>
    R grabar · D carpeta · A audio en la grabación · F pantalla completa (ventana del proyector) · H ocultar · C control</div>`;
}

function updateHud(msg) {
  hudMsg = msg || "";
  const show = S.hud && !ctrlOpen();
  hud.style("display", show ? "block" : "none");
  document.body.classList.toggle("nocursor", !show);
  if (show) hud.html(hudHtml());
}

function openControl() {
  ctrlWin = window.open("control.html", "censura-control", "popup,width=640,height=430");
  if (!ctrlWin) note("Chrome bloqueó la ventana emergente: permite pop-ups para localhost y pulsa C otra vez.");
}

function onMessage(e) {
  if (e.origin !== location.origin || !e.data) return;
  if (e.data.type === "recDir") { recDir = e.data.handle; note(`Carpeta de grabación: ${recDir.name}`); }
}

/* ---------- Teclas (también llegan desde la ventana de control) ---------- */
function keyPressed() { return handleKey(key, false); }

function handleKey(kRaw, fromControl) {
  const k = kRaw.length === 1 ? kRaw.toLowerCase() : kRaw;
  if (k === "q") S.shape = S.shape === "face" ? "square" : "face";
  else if (k === "1") S.mode = "blur";
  else if (k === "2") S.mode = "pixel";
  else if (k === "3") { if (S.mode === "color") S.colorIdx = (S.colorIdx + 1) % S.colors.length; S.mode = "color"; }
  else if (k === "4") { S.mode = "kick"; startKick(); }
  else if (k === "ArrowUp")    bump(+1);
  else if (k === "ArrowDown")  bump(-1);
  else if (k === "ArrowRight") S.size = +constrain(S.size + 0.05, 1, 2.5).toFixed(2);
  else if (k === "ArrowLeft")  S.size = +constrain(S.size - 0.05, 1, 2.5).toFixed(2);
  else if (k === "]") S.feather = constrain(S.feather + 2, 0, 30);
  else if (k === "[") S.feather = constrain(S.feather - 2, 0, 30);
  else if (k === "+" || k === "=") S.smooth = constrain(S.smooth + 0.05, 0.3, 1);
  else if (k === "-") S.smooth = constrain(S.smooth - 0.05, 0.3, 1);
  else if (k === "e") { S.expected = (S.expected + 1) % 6; armed = false; }
  else if (k === "b") S.panic = !S.panic;
  else if (k === "r") toggleRec();
  else if (k === "d") pickRecDir();
  else if (k === "a") toggleMic();
  else if (k === "c") openControl();
  else if (k === "f") { if (fromControl) note("F solo funciona en la ventana del proyector: haz clic en ella y pulsa F."); else fullscreen(!fullscreen()); }
  else if (k === "h") S.hud = !S.hud;
  else if (visKey(k)) { /* estilos y efectos nuevos (visuals.js) */ }
  else return true;
  if (audioWanted() && !kickAn && !kickErr) startKick();   // micrófono para lo que reacciona al sonido
  dirty = true;
  updateHud();
  return false;
}
function bump(d) {
  if (visBump(d)) return;
  if (S.mode === "blur")  S.blur  = constrain(S.blur  + d * 5, 20, 120);
  if (S.mode === "pixel") S.pixel = constrain(S.pixel + d * 4, 16, 80);
  if (S.mode === "kick")  S.kickRatio = +constrain(S.kickRatio - d * 0.07, 0.2, 0.9).toFixed(2);
}

/* ---------- Grabación (solo el canvas censurado), en archivos de S.recSegmentMin minutos ---------- */
let recOn = false, recBusy = false, rec = null, recStream = null, recDir = null, recSeg = 0, recStart = 0;
let recName = "", recMime = "", recErr = "", segTimer = 0, micStream = null;

async function pickRecDir() {
  if (!window.showDirectoryPicker) { note("Este navegador no permite elegir carpeta: usa Chrome."); return; }
  try { recDir = await window.showDirectoryPicker({ id: "censura-rec", mode: "readwrite", startIn: "videos" }); note(`Carpeta de grabación: ${recDir.name}`); }
  catch (e) { if (e.name !== "AbortError") note("No se pudo usar la carpeta: " + errMsg(e)); }
}

// Un solo micrófono compartido: para la grabación (tecla A) y para el detector de bombo (relleno 4).
async function getMic() {
  if (micStream && micStream.getAudioTracks().some(t => t.readyState === "live")) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  return micStream;
}

async function toggleMic() {
  S.mic = !S.mic;
  if (!S.mic) {
    if (!kickAn) { micStream && micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  } else {
    try { await getMic(); }   // se pide el permiso ahora (y no en medio del show)
    catch (e) { S.mic = false; note("Sin micrófono: " + errMsg(e)); }
  }
  if (recOn) note("El cambio de audio se aplica en la próxima grabación.");
  updateHud();
}

async function toggleRec() {
  if (recBusy) return;
  recBusy = true;
  try {
    if (recOn) { recOn = false; clearTimeout(segTimer); const r = rec; rec = null; await stopRecorder(r); }
    else {
      recStream = cnv.elt.captureStream(30);
      if (S.mic && micStream) micStream.getAudioTracks().forEach(t => recStream.addTrack(t));
      recMime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
        .find(m => MediaRecorder.isTypeSupported(m)) || "";
      recName = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      recSeg = 0; recErr = ""; recStart = Date.now(); recOn = true;
      await startSegment();
    }
  } catch (e) { recErr = errMsg(e); recOn = false; console.error(e); }
  finally { recBusy = false; updateHud(); }
}

async function startSegment() {
  recSeg++;
  const name = `performance-${recName}-${String(recSeg).padStart(2, "0")}.${recMime.includes("mp4") ? "mp4" : "webm"}`;
  let sink;
  if (recDir) {   // directo a disco
    const fh = await recDir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    let chain = Promise.resolve();
    sink = {
      write: b => { chain = chain.then(() => w.write(b)).catch(e => { recErr = errMsg(e); }); },
      close: () => chain.then(() => w.close()).catch(e => { recErr = errMsg(e); }),
    };
  } else {        // sin carpeta: en memoria, se descarga al cerrar cada parte
    const parts = [];
    sink = {
      write: b => parts.push(b),
      close: async () => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(parts, { type: recMime })); a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      },
    };
  }
  const r = new MediaRecorder(recStream, { mimeType: recMime, videoBitsPerSecond: 8_000_000 });
  r.ondataavailable = e => { if (e.data.size) sink.write(e.data); };
  r.done = new Promise(res => { r.onstop = () => res(sink.close()); });
  r.start(1000);
  rec = r;
  clearTimeout(segTimer);
  segTimer = setTimeout(rollSegment, S.recSegmentMin * 60000);
}

async function rollSegment() {   // la parte nueva arranca antes de cerrar la anterior: sin huecos
  if (!recOn || recBusy) return;
  recBusy = true;
  const old = rec;
  try { await startSegment(); } catch (e) { recErr = errMsg(e); }
  finally { recBusy = false; }
  await stopRecorder(old);
  updateHud();
}

async function stopRecorder(r) {
  if (r && r.state !== "inactive") { r.stop(); await r.done; }
}

/* ---------- Colores con el bombo (relleno 4) ---------- */
// El micrófono pasa por un filtro de graves (35–130 Hz, donde está el bombo). Cada 10 ms se mide la
// energía de los últimos ~10 ms. Un golpe es una subida brusca de energía que llega al menos a
// kickRatio × la subida más fuerte de los últimos segundos (el bombo suele ser el golpe más fuerte en
// los graves; así el bajo no lo confunde) y que se destaca sobre el ruido de fondo.
let audioCtx = null, kickAn = null, kickBuf = null, kickPrevE = 0, lastKickAt = 0, kickPeak = 0, kickPollAt = 0;
let kickBase = 0, kickFlip = false, kickHue = 0, kickCount = 0, kickErr = "", kickLevel = 0;
const kickFlux = [], kicks = [];

async function startKick() {
  try {
    const ms = await getMic();
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    if (!kickAn || kickAn.stream !== ms) {
      const src = audioCtx.createMediaStreamSource(ms);
      const hp = audioCtx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 35;
      const lp1 = audioCtx.createBiquadFilter(); lp1.type = "lowpass"; lp1.frequency.value = 130;
      const lp2 = audioCtx.createBiquadFilter(); lp2.type = "lowpass"; lp2.frequency.value = 130;
      const an = audioCtx.createAnalyser(); an.fftSize = 2048;
      src.connect(hp); hp.connect(lp1); lp1.connect(lp2); lp2.connect(an);
      visAudioSetup(audioCtx, src);
      an.stream = ms; kickBuf = new Float32Array(an.fftSize); kickAn = an;
    }
    kickErr = "";
  } catch (e) { kickErr = "sin micrófono: " + errMsg(e); }
  updateHud();
}

const audioWanted = () => S.mode === "kick" || visWantsAudio();
function pollKick() {
  if (!audioWanted() || !kickAn) return;
  if (audioCtx.state === "suspended") { audioCtx.resume().catch(() => {}); return; }
  kickAn.getFloatTimeDomainData(kickBuf);
  const n = Math.round(audioCtx.sampleRate * 0.01);
  let e = 0;
  for (let i = kickBuf.length - n; i < kickBuf.length; i++) e += kickBuf[i] * kickBuf[i];
  e = Math.sqrt(e / n);
  kickLevel = e;
  const flux = Math.max(0, e - kickPrevE);   // cuánto subió la energía desde la medición anterior
  kickPrevE = e;
  const now = performance.now(), dt = kickPollAt ? now - kickPollAt : 10;
  kickPollAt = now;
  visAudioPoll(dt);
  const hist = kickFlux.slice().sort((a, b) => a - b);
  kickFlux.push(flux); if (kickFlux.length > 150) kickFlux.shift();
  const peak = kickPeak;
  kickPeak = Math.max(flux, kickPeak * Math.pow(0.5, dt / S.kickPeakHalfLifeMs));
  if (hist.length < 50) return;
  const noise = 3 * hist[hist.length >> 1] + 0.002;   // ruido de fondo
  if (flux > S.kickRatio * peak && flux > noise && now - lastKickAt >= S.kickMinGapMs) onKick(now);
}

function onKick(now) {
  lastKickAt = now; kickCount++;
  if (kickCount % S.kickRotateEvery === 0) kickBase = (kickBase + 30) % 360;
  kickFlip = !kickFlip;
  kickHue = (kickBase + (kickFlip ? 180 : 0)) % 360;   // color opuesto en la rueda
  kicks.push(now); if (kicks.length > 2000) kicks.shift();
  visOnKick();
  dirty = true;
}

function kickHud(now) {
  if (kickErr) return `<span class="warn">bombo: ${kickErr}</span>`;
  if (!kickAn) return "bombo: iniciando micrófono…";
  if (audioCtx.state === "suspended") return `<span class="warn">bombo: haz clic en la ventana del proyector para activar el audio</span>`;
  const bars = "▮".repeat(Math.min(12, Math.round(kickLevel * 120)));
  return `bombo ${now - lastKickAt < 150 ? "<span class='rec'>●</span>" : "○"} · golpes ${kickCount}`
    + ` · color <span style="color:hsl(${kickHue},100%,50%)">■</span> · nivel ${bars || "·"}`;
}

/* ---------- Para la ventana de control ---------- */
window.CENSURA = {
  S,
  key: (k, fromControl) => handleKey(k, fromControl),
  hudHtml,
  registerControl: w => { ctrlWin = w; },
  dbg: {
    get shown() { return shownIdx < 0 ? null : snaps[shownIdx].c; },
    get fx() { return fx.c; },
    get full() { return fullReason; },
    get tracks() { return tracks; },
    get detected() { return detectedNow; },
    get rvfc() { return rvfcWorks; },
    get detMs() { return detMs; },
    get rec() { return { recOn, recSeg, recErr, recDir }; },
    get kicks() { return kicks; },
    get vis() { return V; },
    get kick() { return { kickCount, kickHue, kickLevel, kickErr, ctx: audioCtx && audioCtx.state }; },
    setRecDir: d => { recDir = d; },
  },
};
