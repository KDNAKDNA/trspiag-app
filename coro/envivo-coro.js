// Conecta el coro con el canal en vivo de TRANSPARENCIA.
// No cambia el motor: envuelve update() y togglePlay() del sketch.
//
// Envía:  cada nota que canta un personaje, cada cambio de acorde, cambio de patrón,
//         Play/Stop y cambios de tempo.
// Sincronía: al dar Play se elige un instante unos 350 ms en el futuro (hora del servidor)
//         y el coro y la batería arrancan exactamente en ese instante, aunque estén en
//         computadores distintos. Si llega un Play mientras ya suena, se reinicia alineado.
(function () {
  EnVivo.conecta("coro", "CORO");
  let remoto = false;           // true mientras aplicamos algo que vino de otro laptop
  let ultimoBank = bank, ultimoBpm = P.bpm, bpmTimer = null, arranque = null;

  // 1) Eventos del secuenciador: se mandan cuando suenan (no cuando se programan)
  const updateOriginal = update;
  window.update = function () {
    const now = ac ? ac.currentTime : 0;
    for (const e of visQ) {
      if (e.time > now) continue;
      if (e.type === "note") {
        EnVivo.envia({ type: "note", ci: e.ci, midi: e.midi, t: e.t, dur: Math.max(0, e.end - e.time) });
      } else if (e.type === "chord" && e.ch) {
        EnVivo.envia({ type: "chord", idx: e.ch.idx, nombre: e.ch.name, midi: e.ch.voicing ? e.ch.voicing[0] : undefined });
      }
    }
    updateOriginal();
    if (bank !== ultimoBank) { ultimoBank = bank; EnVivo.envia({ type: "bank", bank }); }
    if (P.bpm !== ultimoBpm) {
      ultimoBpm = P.bpm;
      clearTimeout(bpmTimer);
      if (!remoto) { bpmTimer = setTimeout(() => EnVivo.envia({ type: "bpm", bpm: P.bpm }), 150); }
    }
  };

  // 1b) Acordes tocados en vivo con el teclado (Q W E R T Y U): también llegan a la cámara
  if (typeof liveChordOn === "function") {
    const acordeOriginal = liveChordOn;
    window.liveChordOn = function (deg, seventh, key) {
      acordeOriginal(deg, seventh, key);
      if (typeof liveChord !== "undefined" && liveChord && liveChord.ch) {
        const ch = liveChord.ch;
        EnVivo.envia({ type: "chord", idx: 0, nombre: ch.name, midi: ch.voicing ? ch.voicing[0] : undefined });
      }
    };
  }

  // 2) Play / Stop con arranque sincronizado
  const toggleOriginal = togglePlay;
  function arrancarEn(en) {
    clearTimeout(arranque);
    arranque = EnVivo.alInstante(en, () => {
      remoto = true;
      try {
        if (playing) toggleOriginal();     // si ya sonaba, se reinicia alineado con los demás
        toggleOriginal();
      } finally { remoto = false; }
    });
  }
  window.togglePlay = function () {
    if (remoto) { toggleOriginal(); return; }
    unlockAudio();
    if (!playing && !arranque) {
      const en = EnVivo.ahora() + EnVivo.RETRASO;
      EnVivo.envia({ type: "play", bpm: P.bpm, en });
      arrancarEn(en);
      setTimeout(() => { arranque = null; }, EnVivo.RETRASO + 50);
    } else if (playing) {
      toggleOriginal();
      EnVivo.envia({ type: "stop" });
    }
  };

  // 3) Lo que llega de los otros laptops
  EnVivo.escucha(e => {
    remoto = true;
    try {
      if (e.type === "bpm" || (e.type === "play" && e.bpm)) {
        P.bpm = e.bpm; ultimoBpm = e.bpm;
        if (typeof applyParams === "function") { applyParams(); }
      }
      if (e.type === "stop" && playing) { toggleOriginal(); }
    } finally { remoto = false; }
    if (e.type === "play") {
      if (!ac || ac.state !== "running") { aviso = "Otro laptop dio Play: haz clic aquí para encender el audio"; return; }
      arrancarEn(e.en);
    }
  });

  // 4) Indicador de conexión en la barra
  let aviso = "";
  const ind = document.getElementById("envivoEstado");
  EnVivo.escuchaEstado(d => {
    if (!ind) return;
    const n = d.clientes.length;
    ind.textContent = `EN VIVO: ${n} CONECTADO${n === 1 ? "" : "S"}`;
  });
  setInterval(() => {
    if (!ind) return;
    if (!EnVivo.conectado) ind.textContent = "EN VIVO: SIN SERVIDOR";
    if (aviso && ac && ac.state === "running") aviso = "";
    ind.title = aviso;
    if (aviso) ind.textContent = "HAZ CLIC PARA ENCENDER EL AUDIO";
  }, 1000);
})();
