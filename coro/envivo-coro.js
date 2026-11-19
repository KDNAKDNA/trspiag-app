// Conecta el coro con el canal en vivo de TRANSPARENCIA.
// No cambia el motor: envuelve update() y togglePlay() del sketch.
//
// Envía:  cada nota que canta un personaje, cada cambio de acorde, cambio de patrón,
//         Play/Stop y cambios de tempo.
// Recibe: Play/Stop y tempo de los otros laptops, para arrancar y parar juntos.
(function () {
  EnVivo.conecta("coro", "CORO");
  let remoto = false;           // true mientras aplicamos algo que vino de otro laptop
  let ultimoBank = bank, ultimoBpm = P.bpm, bpmTimer = null;

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
      } else if (e.type === "dhit") {   // por si la batería vuelve algún día
        EnVivo.envia({ type: "dhit", i: e.i, vel: e.vel != null ? e.vel : 1 });
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

  // 2) Play / Stop
  const toggleOriginal = togglePlay;
  window.togglePlay = function () {
    toggleOriginal();
    if (!remoto) { EnVivo.envia(playing ? { type: "play", bpm: P.bpm } : { type: "stop" }); }
  };

  // 3) Lo que llega de los otros laptops
  EnVivo.escucha(e => {
    remoto = true;
    try {
      if (e.type === "bpm" || (e.type === "play" && e.bpm)) {
        P.bpm = e.bpm; ultimoBpm = e.bpm;
        if (typeof applyParams === "function") { applyParams(); }
      }
      if (e.type === "play" && !playing && ac && ac.state === "running") { togglePlay(); }
      if (e.type === "stop" && playing) { togglePlay(); }
    } finally { remoto = false; }
  });

  // 4) Indicador de conexión en la barra
  const ind = document.getElementById("envivoEstado");
  EnVivo.escuchaEstado(d => {
    if (!ind) return;
    const n = d.clientes.length;
    ind.textContent = `EN VIVO: ${n} CONECTADO${n === 1 ? "" : "S"}`;
  });
  setInterval(() => { if (ind && !EnVivo.conectado) ind.textContent = "EN VIVO: SIN SERVIDOR"; }, 2000);
})();
