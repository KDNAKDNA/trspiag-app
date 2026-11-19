// Sonidos del hub, todos sintetizados con Web Audio (sin archivos).
// El audio solo puede arrancar después de una tecla o un clic.
const Sonido = (() => {
  let ac = null, master = null, ruido = null;

  function iniciar() {
    if (ac) { if (ac.state !== "running") ac.resume(); return; }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);

    // buffer de ruido blanco reutilizable
    ruido = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) { d[i] = Math.random() * 2 - 1; }

    // zumbido eléctrico de fondo (60 Hz) + pito agudo del tubo
    const hum = ac.createOscillator(); hum.type = "sawtooth"; hum.frequency.value = 60;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 140;
    const hg = ac.createGain(); hg.gain.value = 0.035;
    hum.connect(lp).connect(hg).connect(master); hum.start();
    const pito = ac.createOscillator(); pito.frequency.value = 15734;
    const pg = ac.createGain(); pg.gain.value = 0.0025;
    pito.connect(pg).connect(master); pito.start();
  }

  function estatica(dur = 0.35, vol = 0.25) {
    if (!ac) return;
    const t = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = ruido;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2500; bp.Q.value = 0.6;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(bp).connect(g).connect(master);
    s.start(t, Math.random()); s.stop(t + dur);
  }

  function bip(freq = 880, dur = 0.07, vol = 0.08) {
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(); o.type = "square"; o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(0, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  function tecla() {
    if (!ac) return;
    const t = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = ruido;
    const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3000;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    s.connect(hp).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + 0.04);
  }

  // golpe grave del tubo al encender
  function encender() {
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.5);
    estatica(0.6, 0.18);
  }

  return { iniciar, estatica, bip, tecla, encender };
})();
