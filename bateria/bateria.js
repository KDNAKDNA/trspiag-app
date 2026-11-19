/*!
 * Batería de la Alcantarilla — caja de ritmos sintetizada (Web Audio, sin dependencias)
 * Versión TRANSPARENCIA: agrega las opciones onHit, onPlay, onStop, onBank, startGate y los
 * métodos setBpm, playNow y audioListo.
 *
 * Uso:
 *   <div id="bateria"></div>
 *   <script src="bateria.js"></script>
 *   <script>
 *     const bateria = BateriaAlcantarilla.mount(document.getElementById("bateria"));
 *   </script>
 *
 * Todo vive dentro de este archivo: estilos (con prefijo .bt-), audio e interfaz.
 * Lo único que se agrega a window es BateriaAlcantarilla.
 */
(function (global) {
  "use strict";

  // ---------- Instrumentos ----------
  // tune/decay: [mín, máx, por defecto]; x = el tercer control propio de cada uno
  const DRUMS = [
    { name: "Bombo",       key: "z", col: "#9fe8ff", xl: "Golpe", tune: [30, 120, 52],      decay: [.08, 1.5, .45], x: .6 },
    { name: "Caja",        key: "x", col: "#b5651d", xl: "Ruido", tune: [120, 340, 190],    decay: [.04, .6, .18],  x: .65 },
    { name: "Hat cerrado", key: "c", col: "#a8861a", xl: "Metal", tune: [4000, 14000, 9000], decay: [.02, .25, .05], x: .5 },
    { name: "Hat abierto", key: "v", col: "#6f7d1e", xl: "Metal", tune: [4000, 14000, 8200], decay: [.15, 1.4, .45], x: .5 },
    { name: "Palmas",      key: "b", col: "#c2417a", xl: "Abrir", tune: [600, 3000, 1300],  decay: [.05, .8, .22],  x: .4 },
    { name: "Tom",         key: "n", col: "#2a8c8c", xl: "Golpe", tune: [60, 400, 140],     decay: [.05, 1, .3],    x: .5 },
  ];
  const STEPS = 16, BANKS = 4;
  const DTIMES = [.25, .5, .75, 1], DT_NAMES = ["1/16", "1/8", "1/8 ·", "1/4"];
  const HAT_METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

  // ---------- Estado ----------
  const emptyRow = () => ({ len: STEPS, pulses: 0, mute: false, solo: false, steps: Array.from({ length: STEPS }, () => ({ on: false, v: .7 })) });
  const emptyBank = () => ({ rows: DRUMS.map(emptyRow) });
  function setSteps(r, list) { list.forEach(([i, v]) => { r.steps[i] = { on: true, v }; }); }
  function demoA() {
    const b = emptyBank(), d = b.rows;
    setSteps(d[0], [[0, .95], [7, .6], [8, .85], [14, .5]]);
    setSteps(d[1], [[4, .9], [12, .9], [15, .3]]);
    setSteps(d[2], [[0, .7], [2, .4], [4, .7], [6, .4], [8, .7], [10, .4], [12, .7]]);
    setSteps(d[3], [[14, .6]]);
    setSteps(d[4], [[12, .7]]);
    d[5].len = 12; setSteps(d[5], [[3, .5], [10, .6]]);
    return b;
  }
  function demoB() {
    const b = emptyBank(), d = b.rows;
    setSteps(d[0], [[0, .95], [4, .9], [8, .95], [12, .9]]);
    setSteps(d[1], [[7, .25], [15, .3]]);
    setSteps(d[2], [[1, .3], [3, .3], [5, .3], [9, .3], [11, .3], [13, .3]]);
    setSteps(d[3], [[2, .65], [6, .65], [10, .65], [14, .65]]);
    setSteps(d[4], [[4, .85], [12, .85]]);
    euclid(d[5], 3, [.5, .7, .6]);
    return b;
  }
  function euclid(r, pulses, vs) {
    r.pulses = pulses; let k = 0;
    for (let i = 0; i < STEPS; i++) {
      const on = i < r.len && ((i * pulses) % r.len) < pulses;
      const prev = r.steps[i];
      r.steps[i] = { on, v: prev.on ? prev.v : (vs ? vs[k % vs.length] : .7) };
      if (on) k++;
    }
  }
  function rotateRow(r) { const part = r.steps.slice(0, r.len); part.unshift(part.pop()); r.steps.splice(0, r.len, ...part); }
  function randomRow(r) {
    r.pulses = 0;
    for (let i = 0; i < STEPS; i++) { r.steps[i] = { on: i < r.len && Math.random() < .35, v: .3 + Math.random() * .65 }; }
  }
  function defaultState() {
    return {
      version: 1, bpm: 100, swing: 0, bank: 0, chain: false,
      banks: [demoA(), demoB(), emptyBank(), emptyBank()],
      drums: DRUMS.map(d => ({ tune: d.tune[2], decay: d.decay[2], x: d.x, level: .85 })),
      bus: { cutoff: 16000, reso: .7, drive: .15, delay: .1, dtime: 2, dfb: .35, rev: .15, vol: .85 },
    };
  }
  // Limpia un estado que viene de afuera (setState): misma forma, números acotados
  const clamp = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) && typeof v !== "boolean" ? Math.min(hi, Math.max(lo, n)) : def; };
  function cleanState(s) {
    const d = defaultState(), o = v => (v && typeof v === "object" ? v : {});
    s = o(s);
    const bus = o(s.bus);
    return {
      version: 1,
      bpm: Math.round(clamp(s.bpm, 50, 200, d.bpm)), swing: clamp(s.swing, 0, .6, d.swing),
      bank: Math.round(clamp(s.bank, 0, BANKS - 1, 0)), chain: s.chain === true,
      banks: Array.from({ length: BANKS }, (_, b) => ({
        rows: DRUMS.map((_, i) => {
          const r = o(o(o(s.banks)[b]).rows ? s.banks[b].rows[i] : null), steps = Array.isArray(r.steps) ? r.steps : [];
          return {
            len: Math.round(clamp(r.len, 1, STEPS, STEPS)), pulses: Math.round(clamp(r.pulses, 0, STEPS, 0)),
            mute: r.mute === true, solo: r.solo === true,
            steps: Array.from({ length: STEPS }, (_, k) => { const st = o(steps[k]); return { on: st.on === true, v: clamp(st.v, 0, 1, .7) }; }),
          };
        }),
      })),
      drums: DRUMS.map((dr, i) => {
        const p = o(Array.isArray(s.drums) ? s.drums[i] : null);
        return { tune: clamp(p.tune, dr.tune[0], dr.tune[1], dr.tune[2]), decay: clamp(p.decay, dr.decay[0], dr.decay[1], dr.decay[2]), x: clamp(p.x, 0, 1, dr.x), level: clamp(p.level, 0, 1, .85) };
      }),
      bus: {
        cutoff: clamp(bus.cutoff, 200, 16000, d.bus.cutoff), reso: clamp(bus.reso, .5, 15, d.bus.reso),
        drive: clamp(bus.drive, 0, 1, d.bus.drive), delay: clamp(bus.delay, 0, 1, d.bus.delay),
        dtime: Math.round(clamp(bus.dtime, 0, DTIMES.length - 1, d.bus.dtime)), dfb: clamp(bus.dfb, 0, .9, d.bus.dfb),
        rev: clamp(bus.rev, 0, 1, d.bus.rev), vol: clamp(bus.vol, 0, 1.2, d.bus.vol),
      },
    };
  }

  // ---------- Estilos (con prefijo, para no tocar los de la app) ----------
  const CSS = `
.bt-root{--bt-bg:#dfe6da;--bt-panel:#e9ede5;--bt-row:#d7dfd3;--bt-row2:#dce3d8;--bt-ink:#1c2520;--bt-muted:#4b5a51;--bt-line:#aab4a7;--bt-field:#f6f7f3;--bt-cell:#eef1ea;--bt-cell2:#c9d2c5;--bt-off:#e3e8df;--bt-accent:#f2b52c;--bt-rec:#d4372c;
  box-sizing:border-box;background:var(--bt-bg);color:var(--bt-ink);border-radius:18px;padding:16px;font:13px/1.3 ui-monospace,"SF Mono",Menlo,Consolas,monospace;display:flex;flex-direction:column;gap:14px;outline:none;user-select:none;-webkit-user-select:none;max-width:100%}
.bt-root *,.bt-root *::before,.bt-root *::after{box-sizing:border-box}
.bt-root button{font:inherit;color:inherit;cursor:pointer}
.bt-root :focus-visible{outline:3px solid var(--bt-accent);outline-offset:2px}
.bt-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;justify-content:space-between}
.bt-title{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em}
.bt-status{color:var(--bt-muted);font-size:11px;margin-top:2px;min-height:1.3em}
.bt-transport{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.bt-btn{background:var(--bt-field);border:1px solid var(--bt-line);border-radius:8px;padding:6px 11px;font-weight:700;min-width:30px}
.bt-btn:hover{background:#fff}
.bt-btn[aria-pressed="true"]{background:var(--bt-ink);border-color:var(--bt-ink);color:var(--bt-field)}
.bt-btn.bt-rec[aria-pressed="true"]{background:var(--bt-rec);border-color:var(--bt-rec)}
.bt-btn.bt-solo[aria-pressed="true"]{background:var(--bt-accent);border-color:var(--bt-accent);color:var(--bt-ink)}
.bt-btn.bt-pending{outline:2px dashed var(--bt-ink);outline-offset:2px}
.bt-btn.bt-play{min-width:92px}
.bt-btn.bt-sm{padding:2px 0;font-size:11px;min-width:26px}
.bt-group{display:flex;gap:4px;align-items:center}
.bt-tracks{overflow-x:auto;padding-bottom:4px}
.bt-grid{display:flex;flex-direction:column;gap:6px;min-width:940px}
.bt-nums,.bt-row{display:grid;grid-template-columns:100px 60px 84px 44px repeat(16,minmax(32px,1fr)) 96px;gap:4px;align-items:center}
.bt-nums span{text-align:center;color:var(--bt-muted);font-size:10px}
.bt-row{background:var(--bt-row);border-radius:10px;padding:5px 6px;border-left:6px solid var(--c)}
.bt-row:nth-child(odd){background:var(--bt-row2)}
.bt-pad{height:44px;border-radius:8px;border:0;background:color-mix(in srgb,var(--c) 22%,transparent);text-align:left;padding:4px 8px;display:flex;flex-direction:column;justify-content:center;transition:background .08s}
.bt-pad b{font-size:11px}.bt-pad small{font-size:9px;color:var(--bt-muted)}
.bt-pad.bt-hit{background:var(--c);color:#fff}.bt-pad.bt-hit small{color:#fff}
.bt-row.bt-dim .bt-pad b{color:#7d8a82}
.bt-ms,.bt-len{display:flex;gap:3px;align-items:center;justify-content:center}
.bt-len output{min-width:20px;text-align:center;font-weight:700}
.bt-step{position:relative;height:44px;border:0;border-radius:7px;background:var(--bt-cell);padding:0;overflow:hidden;touch-action:none}
.bt-step.bt-beat{background:var(--bt-cell2)}
.bt-step.bt-out{background:var(--bt-off);cursor:default;opacity:.6}
.bt-step.bt-on{background:color-mix(in srgb,var(--c) 28%,var(--bt-cell))}
.bt-step .bt-vel{position:absolute;left:6px;right:6px;bottom:4px;border-radius:4px;background:var(--c);display:none}
.bt-step.bt-on .bt-vel{display:block}
.bt-row.bt-dim .bt-step .bt-vel{background:#9aa59d}
.bt-step.bt-ph{box-shadow:inset 0 0 0 2.5px var(--bt-ink)}
.bt-tools{display:grid;grid-template-columns:1fr 1fr;gap:3px}
.bt-sound{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.bt-card{background:var(--bt-panel);border-radius:12px;padding:10px 10px 8px}
.bt-card h3{margin:0 0 6px;font-size:11px;letter-spacing:.04em;display:flex;align-items:center;gap:8px}
.bt-card h3::before{content:"";width:8px;height:8px;border-radius:2px;background:var(--c)}
.bt-knobs{display:flex;flex-wrap:wrap;gap:4px 2px;justify-content:space-around}
.bt-knob{display:flex;flex-direction:column;align-items:center;gap:2px;width:52px;touch-action:none;cursor:ns-resize;border-radius:8px}
.bt-dial{--a:0deg;width:36px;height:36px;border-radius:50%;position:relative;background:conic-gradient(from 225deg,var(--c) 0 var(--p),#c2cabe var(--p) 75%,transparent 75%)}
.bt-dial::before{content:"";position:absolute;inset:4px;border-radius:50%;background:var(--bt-field)}
.bt-dial::after{content:"";position:absolute;inset:9px;border-radius:50%;background:var(--c)}
.bt-dial i{position:absolute;left:50%;top:50%;width:3px;height:10px;margin-left:-1.5px;background:#fff;border-radius:2px;transform-origin:50% 0;transform:rotate(var(--a)) translateY(0);z-index:1}
.bt-knob.bt-mini{width:40px}.bt-knob.bt-mini .bt-dial{width:26px;height:26px}.bt-knob.bt-mini .bt-dial::before{inset:3px}.bt-knob.bt-mini .bt-dial::after{inset:7px}.bt-knob.bt-mini .bt-dial i{height:7px;width:2px;margin-left:-1px}
.bt-knob b{font-size:10px}.bt-knob span{font-size:10px;color:var(--bt-muted);white-space:nowrap}
.bt-knob.bt-mini b{display:none}
.bt-hint{color:var(--bt-muted);font-size:10px;margin:0}
@media (prefers-reduced-motion:reduce){.bt-pad{transition:none}}
`;
  function injectCSS() {
    if (document.getElementById("bt-styles")) return;
    const st = document.createElement("style"); st.id = "bt-styles"; st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ---------- Utilidades de DOM ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach(c => { if (c != null) el.append(c.nodeType ? c : document.createTextNode(c)); });
    return el;
  }
  const pct = v => Math.round(v * 100) + "%";
  const hz = v => v >= 1000 ? (v / 1000).toFixed(1) + " kHz" : Math.round(v) + " Hz";
  const msf = v => Math.round(v * 1000) + " ms";

  // Perilla: arrastre vertical, rueda, flechas del teclado y doble clic para volver al valor inicial
  function knob(o) {
    const opts = o.opts, def = o.get();
    const norm = v => opts ? v / (opts.length - 1) : o.log ? Math.log(v / o.min) / Math.log(o.max / o.min) : (v - o.min) / (o.max - o.min);
    const fromNorm = n => {
      n = Math.min(1, Math.max(0, n));
      let v = opts ? Math.round(n * (opts.length - 1)) : o.log ? o.min * (o.max / o.min) ** n : o.min + n * (o.max - o.min);
      if (o.step) v = Math.round(v / o.step) * o.step;
      return v;
    };
    const text = v => opts ? opts[v] : o.fmt ? o.fmt(v) : String(v);
    const dial = h("div", { class: "bt-dial" }, h("i")), val = h("span");
    const el = h("div", { class: "bt-knob" + (o.mini ? " bt-mini" : ""), role: "slider", tabindex: "0", "aria-label": o.label, style: `--c:${o.col}`, title: o.mini ? o.label : null },
      dial, h("b", null, o.label), val);
    function paint() {
      const v = o.get(), n = norm(v);
      dial.style.setProperty("--p", (n * 75) + "%");
      dial.style.setProperty("--a", (n * 270 + 45) + "deg");   // 0 = abajo a la izquierda, 1 = abajo a la derecha
      val.textContent = text(v);
      el.setAttribute("aria-valuenow", String(+(+v).toFixed(3)));
      el.setAttribute("aria-valuetext", text(v));
    }
    const set = n => { o.set(fromNorm(n)); o.change && o.change(); paint(); };
    let drag = null;
    el.addEventListener("pointerdown", e => { e.preventDefault(); el.focus({ preventScroll: true }); el.setPointerCapture(e.pointerId); drag = { y: e.clientY, n: norm(o.get()) }; });
    el.addEventListener("pointermove", e => { if (drag) set(drag.n + (drag.y - e.clientY) / 160); });
    el.addEventListener("pointerup", () => { drag = null; });
    el.addEventListener("pointercancel", () => { drag = null; });
    el.addEventListener("wheel", e => { e.preventDefault(); set(norm(o.get()) - e.deltaY / 900); }, { passive: false });
    el.addEventListener("dblclick", () => { o.set(def); o.change && o.change(); paint(); });
    el.addEventListener("keydown", e => {
      const stepN = opts ? 1 / (opts.length - 1) : .02;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); set(norm(o.get()) + stepN); }
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); set(norm(o.get()) - stepN); }
    });
    paint();
    return { el, paint };
  }

  // ---------- La caja de ritmos ----------
  function mount(container, options) {
    if (!container) throw new Error("BateriaAlcantarilla.mount: falta el elemento donde dibujarla");
    options = options || {};
    injectCSS();
    let S = cleanState(options.state || defaultState());
    let ac = null, audioErr = "", timer = 0, raf = 0, destroyed = false;
    let drumBus, busFilter, shaper, comp, out, dSend, delay, fb, revSend, master, noiseBuf, ohEnv = null, lastDrive = -1;
    let playing = false, rec = false, nextTime = 0, gStep = 0, pendingBank = null;
    const visQ = [], ph = DRUMS.map(() => -1), flashUntil = DRUMS.map(() => 0);
    const stepDur = () => 60 / S.bpm / 4;
    const bank = () => S.banks[S.bank];
    const row = i => bank().rows[i];
    const bankEmpty = b => S.banks[b].rows.every(r => !r.steps.some(s => s.on));

    // ----- audio -----
    function hold(p, t) { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t); } }
    function driveCurve(d) {
      const n = 1024, c = new Float32Array(n), k = d * 40;
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = k < .01 ? x : Math.tanh(k * x) / Math.tanh(k); }
      return c;
    }
    function impulse(sec, decay) {
      const len = Math.floor(ac.sampleRate * sec), buf = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } }
      return buf;
    }
    function ensureAudio() {
      if (destroyed) return;
      if (!ac) {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) throw new Error("este navegador no tiene Web Audio");
        ac = new Ctx();
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const nd = noiseBuf.getChannelData(0);
        for (let i = 0; i < nd.length; i++) { nd[i] = Math.random() * 2 - 1; }
        const limiter = ac.createDynamicsCompressor(); limiter.threshold.value = -6; limiter.ratio.value = 12; limiter.connect(ac.destination);
        master = ac.createGain(); master.connect(limiter);
        drumBus = ac.createGain();
        busFilter = ac.createBiquadFilter(); busFilter.type = "lowpass";
        shaper = ac.createWaveShaper(); shaper.oversample = "2x";
        comp = ac.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3; comp.attack.value = .004; comp.release.value = .12;
        out = ac.createGain();
        drumBus.connect(busFilter); busFilter.connect(shaper); shaper.connect(comp); comp.connect(out); out.connect(master);
        // delay sincronizado con realimentación filtrada
        dSend = ac.createGain(); delay = ac.createDelay(2); fb = ac.createGain();
        const dTone = ac.createBiquadFilter(); dTone.type = "lowpass"; dTone.frequency.value = 3500;
        out.connect(dSend); dSend.connect(delay); delay.connect(dTone); dTone.connect(fb); fb.connect(delay); dTone.connect(master);
        // reverb
        revSend = ac.createGain(); const conv = ac.createConvolver(); conv.buffer = impulse(2.2, 3);
        out.connect(revSend); revSend.connect(conv); conv.connect(master);
        applyBus();
        timer = setInterval(scheduler, 25);
      }
      if (ac.state !== "running") ac.resume().catch(() => {});
    }
    function unlock() {
      try { ensureAudio(); audioErr = ""; } catch (err) { audioErr = String(err && err.message || err); }
      status();
    }
    function applyBus() {
      if (!ac) return;
      const b = S.bus, now = ac.currentTime;
      busFilter.frequency.setTargetAtTime(b.cutoff, now, .02);
      busFilter.Q.setTargetAtTime(b.reso, now, .02);
      out.gain.setTargetAtTime(b.vol, now, .02);
      dSend.gain.setTargetAtTime(b.delay, now, .02);
      delay.delayTime.setTargetAtTime(DTIMES[b.dtime] * 60 / S.bpm, now, .05);
      fb.gain.setTargetAtTime(b.dfb, now, .02);
      revSend.gain.setTargetAtTime(b.rev, now, .02);
      if (b.drive !== lastDrive) { shaper.curve = driveCurve(b.drive); lastDrive = b.drive; }
    }
    function noiseSrc(t, dur) { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, Math.random() * .5); s.stop(t + dur + .05); return s; }
    function envG(t, peak, dec) {
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(Math.max(peak, 0), t + .002);
      g.gain.exponentialRampToValueAtTime(.0005, t + Math.max(.01, dec));
      return g;
    }
    function bq(type, f, q) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q == null ? .7 : q; return b; }
    function wire(...n) { for (let k = 0; k < n.length - 1; k++) { n[k].connect(n[k + 1]); } }

    // Cada golpe crea sus propios nodos, que se descartan al terminar
    function playDrum(i, t, vel) {
      const p = S.drums[i], g = (.25 + .75 * vel) * p.level, dec = p.decay;
      if (i === 0) {                 // bombo: seno con caída de tono + click
        const o = ac.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(p.tune * (1 + p.x * 7), t);
        o.frequency.exponentialRampToValueAtTime(p.tune, t + .02 + .06 * p.x);
        wire(o, envG(t, g * 1.2, dec), drumBus); o.start(t); o.stop(t + dec + .05);
        wire(noiseSrc(t, .015), bq("highpass", 2500), envG(t, g * .4 * p.x, .012), drumBus);
      } else if (i === 1) {          // caja: triángulo + ruido
        const o = ac.createOscillator(); o.type = "triangle";
        o.frequency.setValueAtTime(p.tune * 1.6, t); o.frequency.exponentialRampToValueAtTime(p.tune, t + .03);
        wire(o, envG(t, g * (1 - p.x) * 1.1, dec * .7), drumBus); o.start(t); o.stop(t + dec + .05);
        wire(noiseSrc(t, dec), bq("highpass", 1200), envG(t, g * (.1 + p.x) * .8, dec), drumBus);
      } else if (i === 2 || i === 3) { // hats: ruido + 6 cuadradas metálicas
        const env = envG(t, g * .6, dec), bp = bq("bandpass", p.tune, .8), hp = bq("highpass", p.tune * .7);
        wire(bp, hp, env, drumBus);
        const ng = ac.createGain(); ng.gain.value = 1.4 * (1 - p.x); wire(noiseSrc(t, dec), ng, bp);
        if (p.x > .02) {
          const mg = ac.createGain(); mg.gain.value = p.x * .9; mg.connect(bp);
          HAT_METAL.forEach(f => { const o = ac.createOscillator(); o.type = "square"; o.frequency.value = f * p.tune / 9000 * 1.2; o.connect(mg); o.start(t); o.stop(t + dec + .05); });
        }
        if (i === 3) ohEnv = env.gain;                       // el hat cerrado corta al abierto
        else if (ohEnv) { hold(ohEnv, t); ohEnv.setTargetAtTime(0, t, .008); ohEnv = null; }
      } else if (i === 4) {          // palmas: tres ráfagas de ruido + cola
        const sp = .006 + p.x * .016, e = ac.createGain(), G = e.gain, pk = g * 2.2;
        G.setValueAtTime(0, t);
        for (let k = 0; k < 3; k++) { G.setValueAtTime(pk, t + k * sp); G.exponentialRampToValueAtTime(pk * .08, t + k * sp + sp * .9); }
        G.setValueAtTime(pk * .8, t + 3 * sp); G.exponentialRampToValueAtTime(.0005, t + 3 * sp + dec);
        wire(noiseSrc(t, 3 * sp + dec), bq("bandpass", p.tune, 1.6), bq("highpass", 400), e, drumBus);
      } else {                       // tom: seno con caída de tono
        const o = ac.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(p.tune * (1 + p.x * 1.6), t);
        o.frequency.exponentialRampToValueAtTime(p.tune, t + dec * .5);
        wire(o, envG(t, g, dec), drumBus); o.start(t); o.stop(t + dec + .05);
        wire(noiseSrc(t, .02), bq("bandpass", p.tune * 4, 1), envG(t, g * .3 * p.x, .02), drumBus);
      }
    }

    // ----- secuenciador (se programa con anticipación sobre el reloj de audio) -----
    function scheduler() {
      if (!playing || !ac || ac.state !== "running") return;
      if (nextTime < ac.currentTime - .2) nextTime = ac.currentTime + .05;
      while (nextTime < ac.currentTime + .12) { scheduleStep(gStep, nextTime); nextTime += stepDur(); gStep++; }
    }
    function scheduleStep(s, time) {
      if (s > 0 && s % 16 === 0) {
        if (S.chain && pendingBank === null) {
          for (let k = 1; k <= BANKS; k++) { const b = (S.bank + k) % BANKS; if (!bankEmpty(b)) { pendingBank = b; break; } }
        }
        if (pendingBank !== null) { S.bank = pendingBank; pendingBank = null; visQ.push({ time, type: "bank" }); }
      }
      const t = time + (s % 2 === 1 ? S.swing * stepDur() * .5 : 0);
      const rows = bank().rows, anySolo = rows.some(r => r.solo);
      rows.forEach((r, i) => {
        const idx = s % r.len;
        visQ.push({ time, type: "ph", i, idx });
        if (r.skip === s) { r.skip = null; return; }
        const st = r.steps[idx];
        if (!st.on || r.mute || (anySolo && !r.solo)) return;
        playDrum(i, t, st.v);
        visQ.push({ time: t, type: "hit", i, v: st.v });
      });
    }
    function hitLive(i, vel) {
      unlock(); if (!ac) return;
      const now = ac.currentTime;
      playDrum(i, now, vel); visQ.push({ time: now, type: "hit", i, v: vel });
      if (rec && playing) {                         // graba en el paso más cercano
        const r = row(i), n = Math.round(gStep - (nextTime - now) / stepDur());
        r.steps[((n % r.len) + r.len) % r.len] = { on: true, v: vel };
        if (n >= gStep) r.skip = n;                 // ese paso aún no sonó: que no suene dos veces
        r.pulses = 0; renderRow(i); emit();
      }
    }
    // TRANSPARENCIA: si la app da "startGate", ella decide el instante del arranque (sincronía entre laptops)
    function play() {
      unlock(); if (!ac || playing) return;
      if (typeof options.startGate === "function") { options.startGate(playNow); return; }
      playNow();
    }
    function playNow() {
      if (!ac) return;
      if (playing) { playing = false; visQ.length = 0; ph.fill(-1); pendingBank = null; }   // reinicio alineado
      playing = true; gStep = 0; nextTime = ac.currentTime + .03; render();
      hook("onPlay", S.bpm);
    }
    function stop() {
      if (!playing) return;
      playing = false; visQ.length = 0; ph.fill(-1); pendingBank = null; render();
      hook("onStop");
    }
    function selectBank(j) { if (playing) pendingBank = j; else S.bank = j; render(); }

    // ----- interfaz -----
    const root = h("div", { class: "bt-root", tabindex: "0", role: "application", "aria-label": "Batería de la Alcantarilla" });
    const statusEl = h("div", { class: "bt-status", "aria-live": "polite" });
    let msg = "", msgUntil = 0;
    function flash(m) { msg = m; msgUntil = Date.now() + 2200; status(); setTimeout(status, 2300); }
    function status() {
      let s;
      if (audioErr) s = "No se pudo iniciar el audio: " + audioErr;
      else if (!ac) s = "Pulsa ▶ Play o un instrumento para encender el audio";
      else if (ac.state !== "running") s = "El audio está en pausa: haz clic en la batería para activarlo";
      else if (Date.now() < msgUntil) s = msg;
      else if (rec) s = "● Grabando: toca los pads (o Z X C V B N) mientras suena";
      else s = "Espacio play · Z X C V B N tocar · 1–4 patrones · R grabar";
      statusEl.textContent = s;
    }
    // TRANSPARENCIA: avisos hacia afuera (golpes sincronizados con el audio, play/stop, patrón)
    const hook = (name, ...a) => { if (typeof options[name] === "function") { try { options[name](...a); } catch (e) { console.error(e); } } };
    const emit = () => { if (options.onChange) { try { options.onChange(api.getState()); } catch (e) { console.error(e); } } };

    // transporte
    const btnPlay = h("button", { class: "bt-btn bt-play", type: "button", onclick: () => (playing ? stop() : play()) });
    const btnRec = h("button", { class: "bt-btn bt-rec", type: "button", onclick: () => { rec = !rec; render(); status(); } }, "● Rec");
    const bankBtns = "ABCD".split("").map((L, j) => h("button", { class: "bt-btn", type: "button", "aria-label": "Patrón " + L, onclick: () => selectBank(j) }, L));
    const btnChain = h("button", { class: "bt-btn", type: "button", onclick: () => { S.chain = !S.chain; render(); emit(); } }, "Cadena");
    const btnCopy = h("button", { class: "bt-btn", type: "button", onclick: () => {
      const to = (S.bank + 1) % BANKS; S.banks[to] = JSON.parse(JSON.stringify(bank())); flash(`Patrón ${"ABCD"[S.bank]} copiado a ${"ABCD"[to]}`); emit();
    } }, "Copiar →");
    const kBpm = knob({ label: "BPM", col: "#7cff8a", min: 50, max: 200, step: 1, get: () => S.bpm, set: v => { S.bpm = v; }, change: () => { applyBus(); emit(); } });
    const kSwing = knob({ label: "Swing", col: "#7cff8a", min: 0, max: .6, fmt: pct, get: () => S.swing, set: v => { S.swing = v; }, change: emit });
    root.append(h("div", { class: "bt-head" },
      h("div", null, h("h2", { class: "bt-title" }, "Batería de la Alcantarilla"), statusEl),
      h("div", { class: "bt-transport" }, btnPlay, btnRec, h("div", { class: "bt-group" }, bankBtns), btnChain, btnCopy, kBpm.el, kSwing.el)));

    // pistas
    const grid = h("div", { class: "bt-grid" }, h("div", { class: "bt-nums", "aria-hidden": "true" },
      h("span"), h("span"), h("span"), h("span"), Array.from({ length: STEPS }, (_, s) => h("span", null, s + 1)), h("span")));
    const rowsUI = DRUMS.map((d, i) => {
      const pad = h("button", { class: "bt-pad", type: "button", "aria-label": `Tocar ${d.name} (tecla ${d.key.toUpperCase()})` }, h("b", null, d.name), h("small", null, "tecla " + d.key.toUpperCase()));
      pad.addEventListener("pointerdown", e => { e.preventDefault(); hitLive(i, .85); });
      pad.addEventListener("click", e => { if (e.detail === 0) hitLive(i, .85); });   // teclado
      const mBtn = h("button", { class: "bt-btn bt-sm", type: "button", "aria-label": "Silenciar " + d.name, onclick: () => { row(i).mute = !row(i).mute; renderRow(i); emit(); } }, "M");
      const sBtn = h("button", { class: "bt-btn bt-sm bt-solo", type: "button", "aria-label": "Solo " + d.name, onclick: () => { row(i).solo = !row(i).solo; renderAll(); emit(); } }, "S");
      const lenOut = h("output");
      const lenDown = h("button", { class: "bt-btn bt-sm", type: "button", "aria-label": "Acortar loop", onclick: () => { row(i).len = Math.max(1, row(i).len - 1); renderRow(i); emit(); } }, "−");
      const lenUp = h("button", { class: "bt-btn bt-sm", type: "button", "aria-label": "Alargar loop", onclick: () => { row(i).len = Math.min(STEPS, row(i).len + 1); renderRow(i); emit(); } }, "+");
      const kLevel = knob({ label: "Nivel " + d.name, mini: true, col: d.col, min: 0, max: 1, fmt: pct, get: () => S.drums[i].level, set: v => { S.drums[i].level = v; }, change: emit });
      const cells = Array.from({ length: STEPS }, (_, s) => h("button", { class: "bt-step" + (Math.floor(s / 4) % 2 ? " bt-beat" : ""), type: "button", "data-s": s, "aria-label": `${d.name}, paso ${s + 1}` }, h("span", { class: "bt-vel" })));
      const eBtn = h("button", { class: "bt-btn bt-sm", type: "button", "aria-label": "Ritmo euclidiano: sumar un golpe", onclick: () => { const r = row(i); euclid(r, (r.pulses % r.len) + 1, [.8, .55, .7, .5]); renderRow(i); emit(); } });
      const tools = h("div", { class: "bt-tools" }, eBtn,
        h("button", { class: "bt-btn bt-sm", type: "button", "aria-label": "Rotar", onclick: () => { rotateRow(row(i)); renderRow(i); emit(); } }, "↻"),
        h("button", { class: "bt-btn bt-sm", type: "button", onclick: () => { randomRow(row(i)); renderRow(i); emit(); } }, "Azar"),
        h("button", { class: "bt-btn bt-sm", type: "button", "aria-label": "Borrar pista", onclick: () => { const r = row(i); r.pulses = 0; r.steps.forEach(st => { st.on = false; }); renderRow(i); emit(); } }, "✕"));
      const el = h("div", { class: "bt-row", style: `--c:${d.col}` }, pad, h("div", { class: "bt-ms" }, mBtn, sBtn), h("div", { class: "bt-len" }, lenDown, lenOut, lenUp), kLevel.el, cells, tools);
      grid.append(el);
      return { el, pad, mBtn, sBtn, lenOut, cells, eBtn, kLevel };
    });
    root.append(h("div", { class: "bt-tracks" }, grid));

    // pasos: clic enciende (la altura del clic es la fuerza), arrastre vertical ajusta, clic sin mover apaga
    let sdrag = null;
    const velAt = (cell, y) => { const r = cell.getBoundingClientRect(); return Math.min(1, Math.max(.05, 1 - (y - r.top) / r.height)); };
    const cellInfo = el => { const c = el && el.closest && el.closest(".bt-step"); if (!c) return null; const i = rowsUI.findIndex(u => u.cells.includes(c)); return i < 0 ? null : { i, s: +c.dataset.s, c }; };
    grid.addEventListener("pointerdown", e => {
      const ci = cellInfo(e.target); if (!ci) return;
      e.preventDefault(); unlock();
      const r = row(ci.i); if (ci.s >= r.len) return;
      const st = r.steps[ci.s];
      if (!st.on) { r.steps[ci.s] = { on: true, v: velAt(ci.c, e.clientY) }; sdrag = { type: "paint", i: ci.i }; if (!playing && ac) playDrum(ci.i, ac.currentTime, r.steps[ci.s].v); }
      else sdrag = { type: "adjust", i: ci.i, s: ci.s, y0: e.clientY, v0: st.v, moved: false };
      r.pulses = 0; grid.setPointerCapture(e.pointerId); renderRow(ci.i);
    });
    grid.addEventListener("pointermove", e => {
      if (!sdrag) return;
      if (sdrag.type === "paint") {
        const ci = cellInfo(document.elementFromPoint(e.clientX, e.clientY));
        if (ci && ci.i === sdrag.i && ci.s < row(ci.i).len && !row(ci.i).steps[ci.s].on) {
          row(ci.i).steps[ci.s] = { on: true, v: velAt(ci.c, e.clientY) }; renderRow(ci.i);
          if (!playing && ac) playDrum(ci.i, ac.currentTime, row(ci.i).steps[ci.s].v);
        }
      } else {
        const dy = sdrag.y0 - e.clientY;
        if (Math.abs(dy) > 3) sdrag.moved = true;
        if (sdrag.moved) { row(sdrag.i).steps[sdrag.s].v = Math.min(1, Math.max(.05, sdrag.v0 + dy / 90)); renderRow(sdrag.i); }
      }
    });
    const endDrag = () => {
      if (sdrag && sdrag.type === "adjust") {
        const st = row(sdrag.i).steps[sdrag.s];
        if (!sdrag.moved) st.on = false; else if (!playing && ac) playDrum(sdrag.i, ac.currentTime, st.v);
        renderRow(sdrag.i);
      }
      if (sdrag) emit();
      sdrag = null;
    };
    grid.addEventListener("pointerup", endDrag);
    grid.addEventListener("pointercancel", endDrag);
    grid.addEventListener("click", e => {          // activar un paso con el teclado (Enter / Espacio)
      if (e.detail !== 0) return;
      const ci = cellInfo(e.target); if (!ci || ci.s >= row(ci.i).len) return;
      const st = row(ci.i).steps[ci.s]; st.on = !st.on; row(ci.i).pulses = 0; renderRow(ci.i); emit();
    });

    // panel de sonido
    const knobs = [kBpm, kSwing, ...rowsUI.map(u => u.kLevel)];
    const sound = h("div", { class: "bt-sound" });
    DRUMS.forEach((d, i) => {
      const ks = [
        knob({ label: "Tono", col: d.col, min: d.tune[0], max: d.tune[1], log: true, fmt: hz, get: () => S.drums[i].tune, set: v => { S.drums[i].tune = v; }, change: emit }),
        knob({ label: "Decay", col: d.col, min: d.decay[0], max: d.decay[1], log: true, fmt: msf, get: () => S.drums[i].decay, set: v => { S.drums[i].decay = v; }, change: emit }),
        knob({ label: d.xl, col: d.col, min: 0, max: 1, fmt: pct, get: () => S.drums[i].x, set: v => { S.drums[i].x = v; }, change: emit }),
      ];
      knobs.push(...ks);
      sound.append(h("section", { class: "bt-card", style: `--c:${d.col}` }, h("h3", null, d.name.toUpperCase()), h("div", { class: "bt-knobs" }, ks.map(k => k.el))));
    });
    const busKnob = (label, key, o) => knob(Object.assign({ label, col: "#7cff8a", get: () => S.bus[key], set: v => { S.bus[key] = v; }, change: () => { applyBus(); emit(); } }, o));
    const bks = [
      busKnob("Filtro", "cutoff", { min: 200, max: 16000, log: true, fmt: hz }),
      busKnob("Reso", "reso", { min: .5, max: 15, log: true, fmt: v => v.toFixed(1) }),
      busKnob("Saturar", "drive", { min: 0, max: 1, fmt: pct }),
      busKnob("Delay", "delay", { min: 0, max: 1, fmt: pct }),
      busKnob("Tiempo", "dtime", { opts: DT_NAMES }),
      busKnob("Repetir", "dfb", { min: 0, max: .9, fmt: pct }),
      busKnob("Reverb", "rev", { min: 0, max: 1, fmt: pct }),
      busKnob("Volumen", "vol", { min: 0, max: 1.2, fmt: pct }),
    ];
    knobs.push(...bks);
    sound.append(h("section", { class: "bt-card", style: "--c:#1c2520;grid-column:1 / -1" }, h("h3", null, "BUS (TODA LA BATERÍA)"), h("div", { class: "bt-knobs" }, bks.map(k => k.el))));
    root.append(sound);
    root.append(h("p", { class: "bt-hint" }, "Pasos: clic para encender (la altura del clic es la fuerza del golpe), arrastre vertical para ajustarla, clic sin mover para apagar. Perillas: arrastre vertical, rueda, flechas o doble clic para volver al valor inicial."));

    function renderRow(i) {
      const u = rowsUI[i], r = row(i), anySolo = bank().rows.some(x => x.solo);
      u.el.classList.toggle("bt-dim", r.mute || (anySolo && !r.solo));
      u.mBtn.setAttribute("aria-pressed", String(r.mute));
      u.sBtn.setAttribute("aria-pressed", String(r.solo));
      u.lenOut.textContent = r.len;
      u.eBtn.textContent = "E" + (r.pulses || "·");
      u.cells.forEach((c, s) => {
        const st = r.steps[s], out = s >= r.len;
        c.classList.toggle("bt-out", out);
        c.classList.toggle("bt-on", !out && st.on);
        c.firstChild.style.height = `calc(${Math.round(st.v * 100)}% - 8px)`;
        c.setAttribute("aria-pressed", String(!out && st.on));
        c.setAttribute("aria-disabled", String(out));
      });
      u.kLevel.paint();
    }
    function renderAll() { DRUMS.forEach((_, i) => renderRow(i)); }
    function render() {
      btnPlay.textContent = playing ? "■ Stop" : "▶ Play";
      btnPlay.setAttribute("aria-pressed", String(playing));
      btnRec.setAttribute("aria-pressed", String(rec));
      btnChain.setAttribute("aria-pressed", String(S.chain));
      bankBtns.forEach((b, j) => { b.setAttribute("aria-pressed", String(S.bank === j)); b.classList.toggle("bt-pending", pendingBank === j); });
      renderAll(); knobs.forEach(k => k.paint()); status();
    }

    // animación sincronizada con el reloj de audio
    function frame() {
      if (destroyed) return;
      const now = ac ? ac.currentTime : 0, wall = performance.now();
      for (let n = visQ.length - 1; n >= 0; n--) {
        const e = visQ[n]; if (e.time > now) continue;
        if (e.type === "ph") ph[e.i] = e.idx;
        else if (e.type === "hit") { flashUntil[e.i] = wall + 90; hook("onHit", e.i, e.v == null ? 1 : e.v); }
        else if (e.type === "bank") { render(); hook("onBank", S.bank); }
        visQ.splice(n, 1);
      }
      rowsUI.forEach((u, i) => {
        u.cells.forEach((c, s) => c.classList.toggle("bt-ph", playing && ph[i] === s));
        u.pad.classList.toggle("bt-hit", wall < flashUntil[i]);
      });
      raf = requestAnimationFrame(frame);
    }

    // teclado: solo cuando el foco está dentro de la batería (o en toda la página con keys: "global")
    const keyTarget = options.keys === "global" ? document : root;
    function onKey(e) {
      if (e.target.closest && e.target.closest("input, select, textarea, [contenteditable]")) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === " ") { if (e.target.closest && e.target.closest("button, [role=slider]") && e.target !== root) return; e.preventDefault(); if (!e.repeat) (playing ? stop() : play()); return; }
      if ("1234".includes(k) && k.length === 1) { selectBank(+k - 1); return; }
      if (k === "r" && !e.repeat) { rec = !rec; render(); return; }
      const di = DRUMS.findIndex(d => d.key === k);
      if (di >= 0 && !e.repeat) { e.preventDefault(); hitLive(di, .85); }
    }
    if (options.keys !== false) keyTarget.addEventListener("keydown", onKey);
    // Safari no siempre acepta pointerdown como gesto para el audio: se intenta en varios eventos
    const unlockEvents = ["pointerup", "click", "touchend", "keydown"];
    unlockEvents.forEach(ev => root.addEventListener(ev, unlock, true));

    container.append(root);
    render(); raf = requestAnimationFrame(frame);

    // ----- API pública -----
    const api = {
      play, stop, playNow,
      audioListo: () => !!ac && ac.state === "running",
      isPlaying: () => playing,
      // TRANSPARENCIA: cambiar el tempo desde afuera (sincronía con el coro)
      setBpm(v) { if (typeof v === "number" && isFinite(v)) { S.bpm = Math.min(200, Math.max(50, Math.round(v))); applyBus(); render(); } },
      getState: () => { const c = JSON.parse(JSON.stringify(S)); c.banks.forEach(b => b.rows.forEach(r => { delete r.skip; })); return c; },
      setState(s) { S = cleanState(s); pendingBank = null; applyBus(); render(); },
      reset() { api.setState(defaultState()); },
      destroy() {
        destroyed = true; stop(); clearInterval(timer); cancelAnimationFrame(raf);
        if (options.keys !== false) keyTarget.removeEventListener("keydown", onKey);
        root.remove(); if (ac) ac.close().catch(() => {});
      },
    };
    return api;
  }

  const BateriaAlcantarilla = { mount, version: "1.0.0" };
  if (typeof module === "object" && module.exports) module.exports = BateriaAlcantarilla;
  global.BateriaAlcantarilla = BateriaAlcantarilla;
})(typeof window !== "undefined" ? window : globalThis);
