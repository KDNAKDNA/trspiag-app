// La música del coro dispara los visuales de la cámara (TRANSPARENCIA).
//
// Escucha el canal en vivo y traduce cada evento en un efecto corto. No toca la detección ni la
// censura: todos los efectos van sobre el cuadro ya censurado (runPost), como los de teclado.
//
// El coro ya no tiene batería: el pulso lo marcan el bajo y los cambios de acorde.
//   Bajo (Rata Cósmica) -> salto de color (estilo 4) y pulso. Máx. 3 por segundo (S.kickMinGapMs).
//   Cambio de acorde    -> golpe de glitch
//   Voces agudas        -> colores corridos (Circuito y Chispa)
//   Todas las notas     -> nivel de "volumen" (mueve colores corridos, glitch y looks)
//   Patrón A-D          -> look (solo con L activado)
//   Si vuelve a llegar batería (dhit), también reacciona como antes.
//
// Mientras llega música, el micrófono deja de detectar golpes (no se duplica).
// Si la música se calla 4 s, todo vuelve a funcionar con el micrófono como antes.
//
// Teclas nuevas:  J = música on/off   L = looks automáticos con el patrón
(function () {
  EnVivo.conecta("camara", "CÁMARA");

  const M = window.MUSICA = {
    on: true, autoLook: false, ultimo: "", nivel: 0,
    forzados: {}, hasta: {}, ultimoEspejo: 0, eventos: 0,
  };
  const activa = () => M.on && EnVivo.silencio < 4000;
  const BATERIA = ["BOMBO", "CAJA", "HAT", "HAT ABIERTO", "PALMAS", "TOM"];
  const VOCES = ["RATA CÓSMICA", "CENIZA", "CUERNO", "CIRCUITO", "CHISPA"];
  const LOOK_POR_PATRON = [0, 1, 2, 4];

  // --- el bombo del micrófono se apaga mientras llega música
  const onKickOriginal = onKick;
  window.onKick = function (now, desdeMusica) {
    if (!desdeMusica && activa()) return;
    onKickOriginal(now);
  };

  // --- el nivel general viene de las notas, no del micrófono
  const pollOriginal = visAudioPoll;
  window.visAudioPoll = function (dt) {
    if (activa()) return;
    pollOriginal(dt);
  };
  let tAnterior = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = now - tAnterior; tAnterior = now;
    M.nivel *= Math.pow(0.5, dt / 220);
    if (activa()) { V.level = 0.7 * V.level + 0.3 * Math.min(1, M.nivel); }
  }, 16);

  // --- efectos cortos: se prenden un momento y se apagan solos,
  //     sin tocar los que el operador dejó prendidos con el teclado
  function destello(fx, ms) {
    const now = performance.now();
    if (!V.fx[fx]) { V.fx[fx] = true; M.forzados[fx] = true; }
    if (M.forzados[fx]) { M.hasta[fx] = Math.max(M.hasta[fx] || 0, now + ms); }
  }
  const tickOriginal = visTick;
  window.visTick = function (now) {
    for (const fx in M.hasta) {
      if (performance.now() > M.hasta[fx]) {
        if (M.forzados[fx]) { V.fx[fx] = false; }
        delete M.forzados[fx]; delete M.hasta[fx];
      }
    }
    tickOriginal(now);
  };

  // --- teclas
  const keyOriginal = handleKey;
  window.handleKey = function (kRaw, fromControl) {
    const k = kRaw.length === 1 ? kRaw.toLowerCase() : kRaw;
    if (k === "j") { M.on = !M.on; note(`música ${M.on ? "conectada" : "apagada (vuelve el micrófono)"}`); return false; }
    if (k === "l") { M.autoLook = !M.autoLook; note(`looks con el patrón: ${M.autoLook ? "sí" : "no"}`); return false; }
    // si el operador toca un efecto que la música tenía prendido, queda en sus manos
    const fx = typeof FX_KEYS !== "undefined" && FX_KEYS[k];
    if (fx && M.forzados[fx]) { V.fx[fx] = false; delete M.forzados[fx]; delete M.hasta[fx]; }
    return keyOriginal(kRaw, fromControl);
  };

  // --- lo que llega del coro
  EnVivo.escucha(e => {
    if (!M.on) return;
    const now = performance.now();
    M.eventos++;
    if (e.type === "dhit") {
      M.ultimo = BATERIA[e.i] || "BATERÍA";
      M.nivel += 0.35 * (e.vel == null ? 1 : e.vel);
      if (e.i === 0) {
        if (now - lastKickAt >= S.kickMinGapMs) { window.onKick(now, true); }   // nunca más de 3 por segundo
        destello("pulse", 220);
      } else if (e.i === 1 || e.i === 4) {
        V.glitchSeed = Math.random() * 1000;
        destello("glitch", 140);
      } else if (e.i === 2) {
        destello("rgb", 90);
      } else if (e.i === 3) {
        destello("rgb", 260);
      } else if (e.i === 5 && now - M.ultimoEspejo > 600) {
        M.ultimoEspejo = now;
        destello("mirror", 160);
      }
    } else if (e.type === "note") {
      M.ultimo = VOCES[e.ci] || "VOZ";
      M.nivel += 0.18 + 0.12 * (e.t || 0.5);
      if (e.ci === 0) {                       // el bajo marca el pulso
        if (now - lastKickAt >= S.kickMinGapMs) { window.onKick(now, true); }   // nunca más de 3 por segundo
        destello("pulse", 220);
      } else if (e.ci >= 3) {
        destello("rgb", 120);
      }
    } else if (e.type === "chord") {
      M.ultimo = "ACORDE " + (e.nombre || "");
      M.nivel += 0.4;
      V.glitchSeed = Math.random() * 1000;
      destello("glitch", 180);
    } else if (e.type === "bank") {
      M.ultimo = "PATRÓN " + "ABCD"[e.bank];
      if (M.autoLook) { V.look = LOOK_POR_PATRON[e.bank] || 0; }
    } else if (e.type === "play") { M.ultimo = "PLAY"; }
    else if (e.type === "stop") { M.ultimo = "STOP"; }
  });

  // --- una línea más en el HUD
  const hudOriginal = visHud;
  window.visHud = function () {
    const est = !M.on ? "apagada (J)" : !EnVivo.conectado ? "<span class='warn'>sin servidor</span>"
      : activa() ? `<b>sonando</b> · ${M.ultimo}` : "esperando al coro";
    return hudOriginal() + `<br>música ${est} · looks con patrón ${M.autoLook ? "sí" : "no"} (L)`;
  };
})();
