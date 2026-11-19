// =====================================================================
//  Coro del Dragón (TRANSPARENCIA) · coro armónico + sinte  (p5.js)
//  Basado en el Coro de un amigo: mismo motor, personajes nuevos
//  Lo sirve el router de Express (index.js); también funciona en el editor de p5.
//  No necesita librerías extra: el sonido usa Web Audio directamente.
//
//  CÓMO SE USA
//  - Haz un clic en el lienzo para encender el audio.
//  - ▶ Play (o Espacio) arranca el secuenciador.
//  - ARMONÍA (abajo): elige la tónica y la escala, y arma una progresión
//    de hasta 8 acordes. En cada tarjeta: − / + cambia el grado (I–VII)
//    y el botón de abajo cambia el tipo (tríada, 7ª, sus2, sus4, add9, 6ª).
//    Clic en una tarjeta para oír el acorde. "Ideas" trae progresiones
//    conocidas; "Azar" inventa una que funciona.
//  - Cada fila del secuenciador tiene un modo:
//      Voz    = canta su voz del acorde (el coro se reparte las notas solo)
//      Acorde = la altura del paso elige entre las notas del acorde
//      Escala = la altura del paso elige entre las notas de la escala
//  - Cuadrícula: clic en un paso vacío = lo enciende; la altura del clic
//    dentro de la casilla es la nota. Arrastra en vertical sobre un paso
//    encendido para cambiar su nota; clic sin arrastrar lo apaga.
//  - Cada fila tiene su propio largo de loop (− / +). M = silenciar, S = solo.
//    E = ritmo euclidiano, ↻ = rotar, Azar = patrón al azar, ✕ = borrar.
//  - Perilla "sinte" de cada fila: mezcla entre la voz del coro y el sinte.
//  - Patrones A B C D (teclas 1-4), cada uno con su progresión. Cambian al
//    terminar el compás; "Cadena" los encadena.
//  - Escenario: mantén pulsado un personaje (o teclas A S D F G) y canta
//    en vivo sobre el acorde; arriba = agudo. Con ● Rec + Play se graba.
//  - Perillas: arrastra en vertical o usa la rueda del ratón.
// =====================================================================

// ---------- Lienzo virtual (todo se dibuja a 1200×1090 y se escala al ancho) ----------
const VW = 1200, VH = 1090;
let K = 1, OX = 0, OY = 0;

// ---------- Personajes ----------
const CHARS = [
  { name: "Rata Cósmica", voice: "bajo",  k: "a", low: 36, high: 55, col: "#4dc3ff", formants: [[400, 1, 7], [760, .45, 10], [2450, .14, 18]] },
  { name: "Ceniza",   voice: "barítono",  k: "s", low: 43, high: 62, col: "#8e9499", formants: [[650, 1, 8], [1080, .5, 11], [2650, .2, 20]] },
  { name: "Cuerno",   voice: "tenor",     k: "d", low: 48, high: 67, col: "#b5452f", formants: [[700, 1, 9], [1150, .5, 12], [2700, .22, 22]] },
  { name: "Circuito", voice: "contralto", k: "f", low: 55, high: 74, col: "#2fbf71", formants: [[800, 1, 9], [1150, .45, 12], [2800, .2, 22]] },
  { name: "Chispa",   voice: "soprano",   k: "g", low: 60, high: 79, col: "#e8b923", formants: [[860, 1, 10], [1220, .45, 13], [2950, .2, 24]] },
];
CHARS.forEach((c, i) => Object.assign(c, {
  i, mix: .35, open: 0, t: .5, ts: .5, midi: null, live: false, active: false,
  seqEnd: 0, seqMidi: null, seqT: .5, showMidi: null, blink: 60 + Math.random() * 200,
  v: null, sv: null, x: 0,
}));

// ---------- Armonía ----------
const NAMES = ["Do", "Do♯", "Re", "Mi♭", "Mi", "Fa", "Fa♯", "Sol", "La♭", "La", "Si♭", "Si"];
const SCALES = [
  { name: "Mayor (jónico)", iv: [0, 2, 4, 5, 7, 9, 11] },
  { name: "Dórico",         iv: [0, 2, 3, 5, 7, 9, 10] },
  { name: "Frigio",         iv: [0, 1, 3, 5, 7, 8, 10] },
  { name: "Lidio",          iv: [0, 2, 4, 6, 7, 9, 11] },
  { name: "Mixolidio",      iv: [0, 2, 4, 5, 7, 9, 10] },
  { name: "Menor (eólico)", iv: [0, 2, 3, 5, 7, 8, 10] },
  { name: "Locrio",         iv: [0, 1, 3, 5, 6, 8, 10] },
  { name: "Menor armónica", iv: [0, 2, 3, 5, 7, 8, 11] },
  { name: "Menor melódica", iv: [0, 2, 3, 5, 7, 9, 11] },
];
// Tipos de acorde: grados de la escala apilados desde la fundamental
const EXTS = [
  { short: "tríada", deg: [0, 2, 4] },
  { short: "7ª",     deg: [0, 2, 4, 6] },
  { short: "sus2",   deg: [0, 1, 4] },
  { short: "sus4",   deg: [0, 3, 4] },
  { short: "add9",   deg: [0, 2, 4, 8] },
  { short: "6ª",     deg: [0, 2, 4, 5] },
];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const MODES = ["Voz", "Acorde", "Escala"];
const RATES = [8, 16, 32], RATE_NAMES = ["½ compás", "1 compás", "2 compases"];
// Progresiones conocidas, en grados de la escala elegida: [grado, tipo]
const PRESETS = [
  { name: "Pop · 1 5 6 4",        p: [[0, 0], [4, 0], [5, 0], [3, 0]] },
  { name: "Doo-wop · 1 6 4 5",    p: [[0, 0], [5, 0], [3, 0], [4, 0]] },
  { name: "Melancólica · 6 4 1 5", p: [[5, 0], [3, 0], [0, 0], [4, 0]] },
  { name: "Jazz · 2 5 1 (7ª)",    p: [[1, 1], [4, 1], [0, 1], [0, 1]] },
  { name: "Canon · 1 5 6 3 4 1 4 5", p: [[0, 0], [4, 0], [5, 0], [2, 0], [3, 0], [0, 0], [3, 0], [4, 0]] },
  { name: "Blues · 1 4 1 5 (7ª)", p: [[0, 1], [3, 1], [0, 1], [4, 1]] },
  { name: "Andaluza · 1 7 6 5",   p: [[0, 0], [6, 0], [5, 0], [4, 0]] },
  { name: "Flotante · 1 4 (sus)", p: [[0, 2], [3, 3], [0, 4], [3, 5]] },
  { name: "Épica · 1 6 3 7",      p: [[0, 0], [5, 0], [2, 0], [6, 0]] },
];
const WAVES = ["sawtooth", "square", "triangle", "sine"], WAVE_NAMES = ["Sierra", "Cuadrada", "Triángulo", "Seno"];
const WAVE_GAIN = [1, .7, 1.6, 1.9];
const FTYPES = ["lowpass", "bandpass", "highpass"], FT_NAMES = ["Paso bajo", "Banda", "Paso alto"];
const DTIMES = [.25, .5, .75, 1, 1.5], DT_NAMES = ["1/16", "1/8", "1/8 ·", "1/4", "1/4 ·"];

// Todos los parámetros del sinte y del secuenciador (lib/song.js valida los mismos)
const P = {
  bpm: 92, swing: 0, gate: .9, glide: .03, release: .25, vib: 18, tonic: 0, scale: 0,
  wave: 0, oct: 1, attack: .01, detune: 8, slevel: .8, clevel: .9,
  pad: .3, padAtk: .25, padTone: 2200,
  ftype: 0, cutoff: 7000, reso: 2, lfoRate: .4, lfoDepth: .2,
  dtime: 2, dfb: .38, dmix: .28, drive: .1, rev: .35, vol: .8,
};

const mtof = m => 440 * 2 ** ((m - 69) / 12);
const scalePcs = () => SCALES[P.scale].iv.map(x => (x + P.tonic) % 12);

// Escritura de las notas según la escala: cada grado usa su propia letra,
// así La menor armónica escribe Sol♯ (no La♭) y Mi♭ mayor escribe La♭ (no Sol♯).
const LETTERS = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"], NAT = [0, 2, 4, 5, 7, 9, 11];
const TONIC_LETTER = [0, 0, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];   // letra de cada tónica tal como la escribe NAMES
const ACC = { 0: "", 1: "♯", 2: "♯♯", 11: "♭", 10: "♭♭" };
function spellDeg(k) {
  const pc = (P.tonic + SCALES[P.scale].iv[k]) % 12, L = (TONIC_LETTER[P.tonic] + k) % 7;
  const acc = ACC[((pc - NAT[L]) % 12 + 12) % 12];
  return acc === undefined ? NAMES[pc] : LETTERS[L] + acc;
}
function spellPc(pc) {
  const iv = SCALES[P.scale].iv;
  for (let k = 0; k < 7; k++) { if ((P.tonic + iv[k]) % 12 === pc) return spellDeg(k); }
  return NAMES[pc];
}
function noteName(m) {
  const r = Math.round(m), pc = ((r % 12) + 12) % 12, name = spellPc(pc);
  let oct = Math.floor(r / 12) - 1;
  if (name.startsWith("Do♭")) oct += 1;            // Do♭ se escribe en la octava siguiente
  if (name.startsWith("Si♯")) oct -= 1;            // Si♯ en la anterior
  return name + oct;
}

// Acorde de un casillero de la progresión: notas, nombre y cifrado
function chordInfo(slot) {
  const sc = SCALES[P.scale].iv, d = slot.deg, ext = slot.ext;
  const pcs = EXTS[ext].deg.map(k => (P.tonic + sc[(d + k) % 7]) % 12);
  const iv = k => ((sc[(d + k) % 7] - sc[d]) % 12 + 12) % 12;
  const third = iv(2), fifth = iv(4), sev = iv(6);
  const q = third === 4 ? (fifth === 8 ? "aug" : "maj") : (fifth === 6 ? "dim" : "min");
  const R = ROMAN[d], r = q === "maj" || q === "aug" ? R : R.toLowerCase();
  const tri = { maj: "", min: "m", dim: "°", aug: "+" }[q], triR = { maj: "", min: "", dim: "°", aug: "+" }[q];
  let sym, rsuf, roman = r;
  if (ext === 0) { sym = tri; rsuf = triR; }
  else if (ext === 1) {
    sym = ({ maj: { 11: "maj7", 10: "7" }, min: { 10: "m7", 11: "m(maj7)" }, dim: { 10: "ø7", 9: "°7" }, aug: { 11: "+maj7", 10: "+7" } }[q][sev]) || "7";
    rsuf = sym.replace(/^m(?!aj)/, "");
  } else if (ext === 2 || ext === 3) { sym = rsuf = EXTS[ext].short; roman = R; }
  else if (ext === 4) { const a = q === "maj" ? "add9" : "(add9)"; sym = (q === "maj" ? "" : tri) + a; rsuf = triR + a; }
  else { sym = (q === "maj" ? "" : tri) + "6"; rsuf = triR + "6"; }
  return { pcs, name: spellDeg(d) + sym, roman: roman + rsuf, notes: EXTS[ext].deg.map(k => spellDeg((d + k) % 7)).join(" ") };
}

// Conducción de voces: la Rata Cósmica toma la fundamental y las otras cuatro voces
// eligen notas del acorde cerca de donde estaban, cubriendo el acorde sin cruzarse.
function nearestIn(pc, target, lo, hi) {
  let best = null;
  for (let m = lo; m <= hi; m++) {
    if (m % 12 === pc && (best === null || Math.abs(m - target) < Math.abs(best - target))) best = m;
  }
  return best;
}
function voiceChord(pcs, prev) {
  const center = i => (CHARS[i].low + CHARS[i].high) / 2;
  const ref = i => (prev ? prev[i] : center(i));
  const bass = nearestIn(pcs[0], ref(0), CHARS[0].low, CHARS[0].high);
  const cand = [1, 2, 3, 4].map(i => pcs.map(pc => nearestIn(pc, ref(i), CHARS[i].low, CHARS[i].high)));
  const n = pcs.length;
  let best = null, bestScore = Infinity;
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      for (let c = 0; c < n; c++) {
        for (let d = 0; d < n; d++) {
          const pick = [a, b, c, d], notes = pick.map((p, k) => cand[k][p]);
          const covered = new Set([0, a, b, c, d]);
          let score = 0;
          for (let k = 1; k < n; k++) { if (!covered.has(k)) score += (n === 4 && k === 2) ? 3 : 8; }
          for (let k = 0; k < 4; k++) {
            score += Math.abs(notes[k] - ref(k + 1)) + .15 * Math.abs(notes[k] - center(k + 1));
            if (k > 0 && notes[k] < notes[k - 1]) score += 12;
            if (k > 0 && notes[k] === notes[k - 1]) score += 3;
          }
          if (score < bestScore) { bestScore = score; best = notes; }
        }
      }
    }
  }
  return [bass, ...best];
}

// Nota de un personaje según el modo de su fila: Voz, Acorde o Escala
function noteFor(i, mode, t, ch) {
  const c = CHARS[i];
  if (mode === 0) return ch.voicing[i];
  const pcs = mode === 1 ? ch.pcs : scalePcs(), list = [];
  for (let m = c.low; m <= c.high; m++) { if (pcs.includes(m % 12)) list.push(m); }
  return list[Math.round(t * (list.length - 1))];
}

// ---------- Patrones y progresiones ----------
const STEPS = 16, SLOTS = 8;
function emptyRow(mode) { return { len: 16, pulses: 0, mute: false, solo: false, mode: mode ?? 1, steps: Array.from({ length: STEPS }, () => ({ on: false, t: .5 })) }; }
function progFrom(list, rate) {
  const slots = Array.from({ length: SLOTS }, (_, k) => ({ deg: list[k] ? list[k][0] : 0, ext: list[k] ? list[k][1] : 0 }));
  return { len: list.length, rate: rate ?? 1, slots };
}
function emptyBank() { return { mel: CHARS.map(() => emptyRow(1)), prog: progFrom(PRESETS[0].p) }; }
function setSteps(r, list) { list.forEach(([i, t]) => r.steps[i] = { on: true, t }); }
function randT() { return .15 + Math.random() * .75; }
function euclid(r, pulses, ts) {
  r.pulses = pulses; let k = 0;
  for (let i = 0; i < STEPS; i++) {
    const on = i < r.len && ((i * pulses) % r.len) < pulses;
    const prev = r.steps[i];
    r.steps[i] = { on, t: prev.on ? prev.t : (ts ? ts[k % ts.length] : randT()) };
    if (on) k++;
  }
}
function rotateRow(r) {
  const part = r.steps.slice(0, r.len);
  part.unshift(part.pop());
  r.steps.splice(0, r.len, ...part);
}
function randomRow(r) {
  r.pulses = 0;
  for (let i = 0; i < STEPS; i++) { r.steps[i] = { on: i < r.len && Math.random() < .38, t: randT() }; }
}
// Progresión al azar con funciones armónicas: tónica → subdominante → dominante → tónica
function randomProg(pr) {
  const next = { 0: [3, 4, 5, 1], 2: [5, 3], 5: [3, 1, 4], 1: [4, 6], 3: [4, 0, 1], 4: [0, 5], 6: [0, 2] };
  const len = pr.len < 2 ? 4 : pr.len;
  let d = 0;
  for (let k = 0; k < SLOTS; k++) {
    if (k > 0) { const opts = next[d]; d = opts[Math.floor(Math.random() * opts.length)]; }
    if (k === len - 1 && d === 0) d = 4;                       // cierra en la dominante para volver al inicio
    const r = Math.random();
    pr.slots[k] = { deg: d, ext: r < .65 ? 0 : r < .85 ? 1 : r < .93 ? 3 : 4 };
  }
  pr.len = len;
}
function demoA() {
  const b = emptyBank(), m = b.mel;
  b.prog = progFrom(PRESETS[0].p, 1);
  m[0].mode = 0; setSteps(m[0], [[0, .5], [6, .5], [8, .5], [11, .5], [14, .5]]);
  m[1].mode = 0; euclid(m[1], 5, [.5]);
  m[2].mode = 0; setSteps(m[2], [[2, .5], [6, .5], [10, .5], [14, .5]]);
  m[3].mode = 1; m[3].len = 12; setSteps(m[3], [[0, .2], [3, .45], [6, .7], [9, .95]]);
  m[4].mode = 2; setSteps(m[4], [[0, .55], [3, .65], [7, .75], [10, .6], [12, .5], [15, .45]]);
  return b;
}
function demoB() {
  const b = emptyBank(), m = b.mel;
  b.prog = progFrom(PRESETS[3].p, 1);
  m[0].mode = 1; setSteps(m[0], [[0, .1], [4, .4], [8, .6], [12, .35]]);
  m[1].mode = 0; setSteps(m[1], [[3, .5], [10, .5]]);
  m[2].mode = 0; setSteps(m[2], [[3, .5], [10, .5]]);
  m[3].mode = 0; setSteps(m[3], [[3, .5], [10, .5], [14, .5]]);
  m[4].mode = 2; m[4].len = 8; euclid(m[4], 5, [.5, .7, .9, .8, .6]);
  return b;
}
let banks = [demoA(), demoB(), emptyBank(), emptyBank()];
let bank = 0, pendingBank = null, chain = false, rec = false;
let selSlot = 0, presetIdx = 0;
const row = i => banks[bank].mel[i];
const prog = () => banks[bank].prog;
const bankEmpty = b => banks[b].mel.every(r => !r.steps.some(s => s.on));

// ---------- Guardar / cargar (lo usa songs.js) ----------
function cleanRow(r) {
  return { len: r.len, pulses: r.pulses, mute: !!r.mute, solo: !!r.solo, mode: r.mode ?? 1, steps: r.steps.map(st => ({ on: !!st.on, t: st.t })) };
}
function cleanProg(p) { return { len: p.len, rate: p.rate, slots: p.slots.map(s => ({ deg: s.deg, ext: s.ext })) }; }
function getSongData() {
  return {
    version: 2, bank, chain,
    P: Object.assign({}, P),
    mix: CHARS.map(c => c.mix),
    banks: banks.map(b => ({ mel: b.mel.map(cleanRow), prog: cleanProg(b.prog) })),
  };
}
function loadSongData(d) {
  // las canciones de la versión 1 no traen progresión: se les pone una por defecto
  banks = d.banks.map(b => ({ mel: b.mel.map(cleanRow), prog: b.prog ? cleanProg(b.prog) : progFrom(PRESETS[0].p) }));
  bank = d.bank; pendingBank = null; chain = !!d.chain; selSlot = 0;
  for (const k of Object.keys(P)) { if (d.P && typeof d.P[k] === "number") P[k] = d.P[k]; }
  if (!(P.scale >= 0 && P.scale < SCALES.length)) P.scale = 0;
  CHARS.forEach((c, i) => { c.mix = d.mix[i]; });
  applyParams();
}

// ---------- Audio ----------
let ac = null, choirBus, synthBus, padBus, padLP, mainFilter, lfo, lfoGain, shaper, delay, fb, dSend, revSend, conv, master, lastDrive = -1;
const pads = [];

function hold(p, t) {
  if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
  else { const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t); }
}
function impulse(sec, decay) {
  const len = Math.floor(ac.sampleRate * sec), buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  }
  return buf;
}
function driveCurve(d) {
  const n = 1024, curve = new Float32Array(n), k = d * 40;
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = k < .01 ? x : Math.tanh(k * x) / Math.tanh(k); }
  return curve;
}
const relTC = () => Math.max(.01, P.release / 4);

// Comportamiento común de las voces: nota en vivo y nota programada
class VoiceBase {
  shift() { return 0; }
  liveMidi(m) { this.oscs.forEach(o => o.frequency.setTargetAtTime(mtof(m + this.shift()), ac.currentTime, P.glide + .015)); }
  liveOn() {
    const t = ac.currentTime; hold(this.out.gain, t);
    this.out.gain.setTargetAtTime(this.level(), t, Math.max(.005, P.attack)); this.vibOn && this.vibOn(t);
  }
  liveOff() {
    const t = ac.currentTime; hold(this.out.gain, t);
    this.out.gain.setTargetAtTime(0, t, relTC()); this.vibOff && this.vibOff(t);
  }
  noteAt(t, m, dur) {
    const f = mtof(m + this.shift());
    this.oscs.forEach(o => o.frequency.setTargetAtTime(f, t, Math.max(.002, P.glide)));
    const g = this.out.gain; g.cancelScheduledValues(t);
    g.setTargetAtTime(this.level(), t, Math.max(.004, P.attack));
    g.setTargetAtTime(0, t + dur, relTC());
    this.vibAt && this.vibAt(t, dur);
  }
}

// Voz del coro: dos sierras por un banco de formantes (vocal "aah")
class ChoirVoice extends VoiceBase {
  constructor(c) {
    super(); this.c = c;
    const f0 = mtof(c.low + 9);
    this.oscs = [0, 8].map(d => { const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = f0; o.detune.value = d; return o; });
    this.lfo = ac.createOscillator(); this.lfo.frequency.value = 4.6 + Math.random() * 1.1;
    this.vib = ac.createGain(); this.vib.gain.value = 0;
    this.lfo.connect(this.vib); this.oscs.forEach(o => this.vib.connect(o.detune));
    const src = ac.createGain(); src.gain.value = .5; this.oscs.forEach(o => o.connect(src));
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 4200; src.connect(lp);
    this.out = ac.createGain(); this.out.gain.value = 0;
    for (const [fr, g, q] of c.formants) {
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = fr; bp.Q.value = q;
      const gg = ac.createGain(); gg.gain.value = g * 2.4;
      lp.connect(bp); bp.connect(gg); gg.connect(this.out);
    }
    this.out.connect(choirBus);
    this.oscs.forEach(o => o.start()); this.lfo.start();
  }
  level() { return .3 * (1 - this.c.mix); }
  vibOn(t) { hold(this.vib.gain, t); this.vib.gain.setTargetAtTime(P.vib, t + .25, .3); }
  vibOff(t) { hold(this.vib.gain, t); this.vib.gain.setTargetAtTime(0, t, .2); }
  vibAt(t, dur) {
    const v = this.vib.gain; v.cancelScheduledValues(t); v.setTargetAtTime(0, t, .02);
    if (dur > .25) v.setTargetAtTime(P.vib, t + .2, .2);
    v.setTargetAtTime(0, t + dur, .1);
  }
}

// Voz del sinte: dos osciladores desafinados que siguen la parte del personaje
class SynthVoice extends VoiceBase {
  constructor(c) {
    super(); this.c = c;
    this.oscs = [-1, 1].map(s => { const o = ac.createOscillator(); o.type = WAVES[P.wave]; o.detune.value = s * P.detune; o.frequency.value = mtof(c.low + 9); return o; });
    this.out = ac.createGain(); this.out.gain.value = 0;
    this.oscs.forEach(o => { o.connect(this.out); o.start(); });
    this.out.connect(synthBus);
  }
  shift() { return 12 * (P.oct - 1); }
  level() { return .16 * this.c.mix * WAVE_GAIN[P.wave]; }
}

// Pad del sinte: cinco voces que sostienen el acorde (mismas notas que el coro)
class PadVoice {
  constructor() {
    this.oscs = [-1, 1].map(s => { const o = ac.createOscillator(); o.type = WAVES[P.wave]; o.detune.value = s * (P.detune + 5); o.frequency.value = 220; return o; });
    this.out = ac.createGain(); this.out.gain.value = 0;
    this.oscs.forEach(o => { o.connect(this.out); o.start(); });
    this.out.connect(padLP);
  }
  play(t, m) {
    const f = mtof(m);
    this.oscs.forEach(o => o.frequency.setTargetAtTime(f, t, .05));
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(.055 * WAVE_GAIN[P.wave], t, Math.max(.01, P.padAtk / 3));
  }
  off(t) { this.out.gain.cancelScheduledValues(t); this.out.gain.setTargetAtTime(0, t, Math.max(.05, P.release / 2)); }
}
function padChordAt(t, voicing, holdFor) {
  pads.forEach((p, k) => p.play(t, voicing[k]));
  if (holdFor) pads.forEach(p => p.off(t + holdFor));
}
function padStop() {
  const t = ac.currentTime;
  pads.forEach(p => { hold(p.out.gain, t); p.out.gain.setTargetAtTime(0, t, Math.max(.05, P.release / 2)); });
}

function ensureAudio() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ac.destination);
    master = ac.createGain(); master.connect(comp);
    choirBus = ac.createGain(); synthBus = ac.createGain(); padBus = ac.createGain();
    padLP = ac.createBiquadFilter(); padLP.type = "lowpass"; padLP.Q.value = .5; padLP.connect(padBus);
    // filtro con LFO (el LFO mueve el "detune" del filtro, en cents)
    mainFilter = ac.createBiquadFilter();
    lfo = ac.createOscillator(); lfoGain = ac.createGain();
    lfo.connect(lfoGain); lfoGain.connect(mainFilter.detune); lfo.start();
    choirBus.connect(mainFilter); synthBus.connect(mainFilter); padBus.connect(mainFilter);
    // saturación
    shaper = ac.createWaveShaper(); shaper.oversample = "2x";
    mainFilter.connect(shaper);
    const post = ac.createGain(); shaper.connect(post);
    post.connect(master);
    // delay con realimentación filtrada
    dSend = ac.createGain(); delay = ac.createDelay(3); fb = ac.createGain();
    const dTone = ac.createBiquadFilter(); dTone.type = "lowpass"; dTone.frequency.value = 3200;
    post.connect(dSend); dSend.connect(delay); delay.connect(dTone); dTone.connect(fb); fb.connect(delay); dTone.connect(master);
    // reverb
    revSend = ac.createGain(); conv = ac.createConvolver(); conv.buffer = impulse(3.4, 2.6);
    post.connect(revSend); revSend.connect(conv); conv.connect(master);
    dTone.connect(revSend);

    CHARS.forEach(c => { c.v = new ChoirVoice(c); c.sv = new SynthVoice(c); pads.push(new PadVoice()); });
    applyParams();
    setInterval(scheduler, 25);
  }
  if (ac.state !== "running") ac.resume().catch(() => {});
}
let audioErr = "";
function unlockAudio() {
  try { ensureAudio(); } catch (err) { audioErr = String(err && err.message || err); console.error(err); }
}

function applyParams() {
  if (!ac) return;
  const now = ac.currentTime;
  choirBus.gain.setTargetAtTime(P.clevel, now, .02);
  synthBus.gain.setTargetAtTime(P.slevel, now, .02);
  padBus.gain.setTargetAtTime(P.pad, now, .02);
  padLP.frequency.setTargetAtTime(P.padTone, now, .02);
  mainFilter.type = FTYPES[P.ftype];
  mainFilter.frequency.setTargetAtTime(P.cutoff, now, .02);
  mainFilter.Q.setTargetAtTime(P.reso, now, .02);
  lfo.frequency.setTargetAtTime(P.lfoRate, now, .02);
  lfoGain.gain.setTargetAtTime(P.lfoDepth * 3600, now, .02);
  delay.delayTime.setTargetAtTime(DTIMES[P.dtime] * 60 / P.bpm, now, .05);
  fb.gain.setTargetAtTime(P.dfb, now, .02);
  dSend.gain.setTargetAtTime(P.dmix, now, .02);
  revSend.gain.setTargetAtTime(P.rev * 1.2, now, .02);
  master.gain.setTargetAtTime(P.vol, now, .02);
  if (P.drive !== lastDrive) { shaper.curve = driveCurve(P.drive); lastDrive = P.drive; }
  CHARS.forEach(c => c.sv.oscs.forEach((o, k) => { o.type = WAVES[P.wave]; o.detune.value = (k ? 1 : -1) * P.detune; }));
  pads.forEach(p => p.oscs.forEach((o, k) => { o.type = WAVES[P.wave]; o.detune.value = (k ? 1 : -1) * (P.detune + 5); }));
}

// ---------- Acorde actual ----------
let playChord = null;                    // el que suena (llega por la cola visual)
let selCache = { key: "", ch: null };
const chordKey = (b, k) => { const s = banks[b].prog.slots[k]; return [b, k, s.deg, s.ext, P.tonic, P.scale].join("|"); };
function slotChord(k, prev) {
  const info = chordInfo(prog().slots[k]);
  return Object.assign(info, { voicing: voiceChord(info.pcs, prev), idx: k });
}
// Con el secuenciador andando: el acorde que suena. Detenido: el casillero elegido.
function displayChord() {
  if (playing && playChord) return playChord;
  const k = Math.min(selSlot, prog().len - 1), key = chordKey(bank, k);
  if (selCache.key !== key) selCache = { key, ch: slotChord(k, null) };
  return selCache.ch;
}
function auditionChord() {
  selCache.key = "";
  unlockAudio(); if (!ac || playing) return;
  const ch = displayChord(), now = ac.currentTime;
  padChordAt(now, ch.voicing, 1.6);
  CHARS.forEach((c, i) => {
    const t = now + i * .035;
    c.v.noteAt(t, ch.voicing[i], 1.2); c.sv.noteAt(t, ch.voicing[i], 1.2);
    visQ.push({ time: t, type: "note", ci: i, midi: ch.voicing[i], t: .6, end: now + 1.25 });
  });
}

// ---------- Secuenciador (programación con anticipación) ----------
let playing = false, nextTime = 0, gStep = 0, bankStart = 0, schedKey = "", schedChord = null, lastVoicing = null;
const visQ = [];                 // eventos para sincronizar la animación con el audio
const rowPh = [-1, -1, -1, -1, -1];
const stepDur = () => 60 / P.bpm / 4;

function scheduler() {
  if (!playing || ac.state !== "running") return;
  if (nextTime < ac.currentTime - .2) nextTime = ac.currentTime + .05;
  while (nextTime < ac.currentTime + .12) {
    scheduleStep(gStep, nextTime);
    nextTime += stepDur(); gStep++;
  }
}
function scheduleStep(s, time) {
  if (s > 0 && s % 16 === 0) {
    if (chain && pendingBank === null) {
      for (let k = 1; k <= 4; k++) { const b = (bank + k) % 4; if (!bankEmpty(b)) { pendingBank = b; break; } }
    }
    if (pendingBank !== null) { bank = pendingBank; pendingBank = null; bankStart = s; }
  }
  // acorde de este paso; si cambió, nueva conducción de voces y nuevo pad
  const pr = prog(), ci = Math.floor((s - bankStart) / RATES[pr.rate]) % pr.len, key = chordKey(bank, ci);
  if (key !== schedKey) {
    schedKey = key;
    schedChord = slotChord(ci, lastVoicing); lastVoicing = schedChord.voicing;
    padChordAt(time, schedChord.voicing);
    visQ.push({ time, type: "chord", ch: schedChord });
  }
  const t = time + (s % 2 === 1 ? P.swing * stepDur() * .5 : 0);
  const rows = banks[bank].mel, anySolo = rows.some(r => r.solo);
  rows.forEach((r, i) => {
    const idx = s % r.len, c = CHARS[i];
    visQ.push({ time, type: "ph", row: i, idx });
    if (c.live) {                         // cantando en vivo: se graba o se respeta
      if (rec) r.steps[idx] = { on: true, t: c.t };
      return;
    }
    const st = r.steps[idx];
    if (!st.on || r.mute || (anySolo && !r.solo)) return;
    const midi = noteFor(i, r.mode, st.t, schedChord), dur = stepDur() * P.gate;
    c.v.noteAt(t, midi, dur); c.sv.noteAt(t, midi, dur);
    visQ.push({ time: t, type: "note", ci: i, midi, t: st.t, end: t + dur });
  });
}
function togglePlay() {
  unlockAudio(); if (!ac) return;
  if (playing) {
    playing = false; visQ.length = 0; rowPh.fill(-1); playChord = null;
    CHARS.forEach(c => { c.seqEnd = 0; if (!c.live) { c.v.liveOff(); c.sv.liveOff(); } });
    padStop();
  } else {
    playing = true; gStep = 0; bankStart = 0; schedKey = ""; lastVoicing = null; playChord = null;
    nextTime = ac.currentTime + .06;
  }
}
function selectBank(j) { if (playing) pendingBank = j; else { bank = j; selSlot = 0; } }
let msg = "", msgUntil = 0;
function flash(m) { msg = m; msgUntil = millis() + 2200; }
function copyToNext() {
  const to = (bank + 1) % 4;
  banks[to] = JSON.parse(JSON.stringify(banks[bank]));
  flash(`Patrón ${"ABCD"[bank]} copiado a ${"ABCD"[to]}`);
}
function audition(i, t) {
  unlockAudio(); if (!ac || playing) return;
  const c = CHARS[i], m = noteFor(i, row(i).mode, t, displayChord()), now = ac.currentTime;
  c.v.noteAt(now, m, .28); c.sv.noteAt(now, m, .28);
  visQ.push({ time: now, type: "note", ci: i, midi: m, t, end: now + .28 });
}
// En vivo, el modo Voz se toca como Acorde: la altura del puntero elige entre las notas del acorde
const liveNote = (i, t) => noteFor(i, row(i).mode === 0 ? 1 : row(i).mode, t, displayChord());

// ---------- Geometría ----------
const ST = { x: 16, y: 64, w: 548, h: 336 };            // escenario
const SHELF = 352, CS = 84;                              // estante y tamaño de muñeco
const PANEL = { x: 580, y: 64, w: 604, h: 336 };
const SEQ_Y = 444, ROW_H = 62, GX = 214, CW = 50, CG = 4;
const rowY = i => SEQ_Y + i * ROW_H;
const HAR_Y = 776, KEY_Y = 792, CARD_Y = 864, CARD_H = 152, CARD_W = 140, CARD_G = 6, BOT_Y = 1030;
const HAR_COL = "#2a6f5e";
const GRIDS = [{ id: "mel", y0: SEQ_Y, rowH: ROW_H, ch: 50, n: 5, get: i => banks[bank].mel[i] }];

// ---------- Widgets dibujados en el lienzo ----------
const UI = [];
const addBtn = o => UI.push(Object.assign({ kind: "btn", col: "#7cff8a", size: 13 }, o));
const addKnob = o => UI.push(Object.assign({ kind: "knob", r: 20 }, o));
const pKnob = (key, o) => addKnob(Object.assign({ get: () => P[key], set: v => P[key] = v }, o));
const isHidden = w => !!(w.hidden && w.hidden());

function knobNorm(k) {
  const v = k.get();
  if (k.opts) return v / (k.opts.length - 1);
  if (k.log) return Math.log(v / k.min) / Math.log(k.max / k.min);
  return (v - k.min) / (k.max - k.min);
}
function knobSetNorm(k, n) {
  n = constrain(n, 0, 1);
  let v;
  if (k.opts) v = Math.round(n * (k.opts.length - 1));
  else if (k.log) v = k.min * (k.max / k.min) ** n;
  else v = k.min + n * (k.max - k.min);
  if (k.step) v = Math.round(v / k.step) * k.step;
  k.set(v); applyParams();
}
function knobText(k) { const v = k.get(); return k.opts ? k.opts[v] : k.fmt ? k.fmt(v) : String(v); }

const SECTIONS = [
  { title: "TEMPO · VOZ", col: "#7cff8a" },
  { title: "SINTE", col: "#2c6ad1" },
  { title: "FILTRO", col: "#ef8325" },
  { title: "DELAY · FX", col: "#ff3d8b" },
];
const pct = v => Math.round(v * 100) + "%";
const ms = v => v >= 1 ? v.toFixed(2) + " s" : Math.round(v * 1000) + " ms";
const hz = v => v >= 1000 ? (v / 1000).toFixed(1) + " kHz" : Math.round(v) + " Hz";

function buildUI() {
  // transporte
  addBtn({ x: 616, y: 14, w: 96, h: 36, label: () => playing ? "■ Stop" : "▶ Play", on: () => playing, click: togglePlay });
  addBtn({ x: 720, y: 14, w: 78, h: 36, label: () => "● Rec", on: () => rec, click: () => { rec = !rec; flash(rec ? "Rec: canta en el escenario mientras suena" : "Rec apagado"); }, col: "#ff3d8b" });
  "ABCD".split("").forEach((L, j) => addBtn({ x: 812 + j * 42, y: 14, w: 38, h: 36, label: () => L, on: () => bank === j, pending: () => pendingBank === j, click: () => selectBank(j) }));
  addBtn({ x: 988, y: 14, w: 84, h: 36, label: () => "Cadena", on: () => chain, click: () => chain = !chain, col: "#7b49c4" });
  addBtn({ x: 1080, y: 14, w: 104, h: 36, label: () => "Copiar →", click: copyToNext });

  // perillas del panel
  const kx = s => [PANEL.x + s * 151 + 44, PANEL.x + s * 151 + 108], ky = [128, 212, 296];
  const place = (s, list) => list.forEach((o, n) => { const [a, b] = kx(s); o.x = n % 2 ? b : a; o.y = ky[Math.floor(n / 2)]; o.col = SECTIONS[s].col; });
  const tempo = [
    { key: "bpm", label: "BPM", min: 50, max: 180, step: 1 },
    { key: "swing", label: "Swing", min: 0, max: .6, fmt: pct },
    { key: "gate", label: "Largo", min: .1, max: 2, fmt: v => v.toFixed(2) + "×" },
    { key: "glide", label: "Glide", min: 0, max: .2, fmt: v => Math.round(v * 1000) + " ms" },
    { key: "release", label: "Release", min: .02, max: 2, log: true, fmt: ms },
    { key: "vib", label: "Vibrato", min: 0, max: 40, step: 1, fmt: v => v + " ct" },
  ];
  const synth = [
    { key: "wave", label: "Onda", opts: WAVE_NAMES },
    { key: "oct", label: "Octava", opts: ["−1", "0", "+1"] },
    { key: "attack", label: "Ataque", min: .002, max: .5, log: true, fmt: ms },
    { key: "detune", label: "Desafine", min: 0, max: 40, step: 1, fmt: v => v + " ct" },
    { key: "slevel", label: "Vol. sinte", min: 0, max: 1.2, fmt: pct },
    { key: "clevel", label: "Vol. coro", min: 0, max: 1.2, fmt: pct },
  ];
  const filt = [
    { key: "ftype", label: "Tipo", opts: FT_NAMES },
    { key: "cutoff", label: "Corte", min: 60, max: 16000, log: true, fmt: hz },
    { key: "reso", label: "Resonancia", min: .5, max: 20, log: true, fmt: v => v.toFixed(1) },
    { key: "lfoRate", label: "LFO vel.", min: .05, max: 12, log: true, fmt: v => v.toFixed(2) + " Hz" },
    { key: "lfoDepth", label: "LFO prof.", min: 0, max: 1, fmt: pct },
  ];
  const fx = [
    { key: "dtime", label: "Delay", opts: DT_NAMES },
    { key: "dfb", label: "Repetir", min: 0, max: .92, fmt: pct },
    { key: "dmix", label: "Mezcla", min: 0, max: 1, fmt: pct },
    { key: "drive", label: "Saturar", min: 0, max: 1, fmt: pct },
    { key: "rev", label: "Eco túnel", min: 0, max: 1, fmt: pct },
    { key: "vol", label: "Volumen", min: 0, max: 1, fmt: pct },
  ];
  [tempo, synth, filt, fx].forEach((list, s) => { place(s, list); list.forEach(o => pKnob(o.key, o)); });

  // controles por fila
  CHARS.forEach((c, i) => {
    const y = rowY(i), r = () => row(i);
    addBtn({ x: 28, y: y + 32, w: 74, h: 20, size: 10, label: () => "◆ " + MODES[r().mode], click: () => { r().mode = (r().mode + 1) % MODES.length; audition(i, .5); }, col: HAR_COL });
    addBtn({ x: 110, y: y + 6, w: 26, h: 22, size: 11, label: () => "M", on: () => r().mute, click: () => r().mute = !r().mute });
    addBtn({ x: 140, y: y + 6, w: 26, h: 22, size: 11, label: () => "S", on: () => r().solo, click: () => r().solo = !r().solo, col: "#ffb000" });
    addBtn({ x: 110, y: y + 32, w: 22, h: 22, size: 12, label: () => "−", click: () => r().len = Math.max(1, r().len - 1) });
    addBtn({ x: 162, y: y + 32, w: 22, h: 22, size: 12, label: () => "+", click: () => r().len = Math.min(STEPS, r().len + 1) });
    addKnob({ x: 198, y: y + 22, r: 11, mini: true, label: "sinte", col: c.col, min: 0, max: 1, get: () => c.mix, set: v => c.mix = v, fmt: pct });
    addBtn({ x: 1088, y: y + 6, w: 44, h: 24, size: 11, label: () => "E" + (r().pulses || "·"), click: () => { const rr = r(); euclid(rr, (rr.pulses % rr.len) + 1); } });
    addBtn({ x: 1136, y: y + 6, w: 44, h: 24, size: 13, label: () => "↻", click: () => rotateRow(r()) });
    addBtn({ x: 1088, y: y + 32, w: 44, h: 24, size: 11, label: () => "Azar", click: () => randomRow(r()) });
    addBtn({ x: 1136, y: y + 32, w: 44, h: 24, size: 12, label: () => "✕", click: () => { const rr = r(); rr.pulses = 0; rr.steps.forEach(s => s.on = false); } });
  });

  // armonía: tónica, escala y pad
  NAMES.forEach((n, j) => addBtn({ x: 78 + j * 44, y: KEY_Y, w: 40, h: 30, size: 11, label: () => n, on: () => P.tonic === j, click: () => { P.tonic = j; auditionChord(); }, col: HAR_COL }));
  addBtn({ x: 690, y: KEY_Y, w: 30, h: 30, label: () => "◀", click: () => { P.scale = (P.scale + SCALES.length - 1) % SCALES.length; auditionChord(); } });
  addBtn({ x: 914, y: KEY_Y, w: 30, h: 30, label: () => "▶", click: () => { P.scale = (P.scale + 1) % SCALES.length; auditionChord(); } });
  pKnob("pad", { x: 1000, y: 806, r: 16, label: "Pad", col: HAR_COL, min: 0, max: 1, fmt: pct });
  pKnob("padAtk", { x: 1062, y: 806, r: 16, label: "Entrada", col: HAR_COL, min: .01, max: 2, log: true, fmt: ms });
  pKnob("padTone", { x: 1124, y: 806, r: 16, label: "Brillo", col: HAR_COL, min: 300, max: 8000, log: true, fmt: hz });

  // armonía: tarjetas de la progresión
  for (let k = 0; k < SLOTS; k++) {
    const x = 16 + k * (CARD_W + CARD_G), y = CARD_Y, slot = () => prog().slots[k];
    const pick = () => { selSlot = k; };
    addBtn({ x, y, w: CARD_W, h: CARD_H, k, draw: drawCard, label: () => "", click: () => {
      const pr = prog();
      if (k >= pr.len) pr.len = k + 1;
      pick(); auditionChord();
    } });
    const hidden = () => k >= prog().len;
    addBtn({ x: x + 8, y: y + 114, w: 30, h: 28, label: () => "−", hidden, click: () => { slot().deg = (slot().deg + 6) % 7; pick(); auditionChord(); } });
    addBtn({ x: x + 42, y: y + 114, w: 30, h: 28, label: () => "+", hidden, click: () => { slot().deg = (slot().deg + 1) % 7; pick(); auditionChord(); } });
    addBtn({ x: x + 76, y: y + 114, w: 56, h: 28, size: 11, label: () => EXTS[slot().ext].short, hidden, click: () => { slot().ext = (slot().ext + 1) % EXTS.length; pick(); auditionChord(); }, col: HAR_COL });
  }

  // armonía: largo, ritmo armónico, ideas y azar
  addBtn({ x: 92, y: BOT_Y, w: 28, h: 30, label: () => "−", click: () => { const pr = prog(); pr.len = Math.max(1, pr.len - 1); selSlot = Math.min(selSlot, pr.len - 1); } });
  addBtn({ x: 150, y: BOT_Y, w: 28, h: 30, label: () => "+", click: () => { const pr = prog(); pr.len = Math.min(SLOTS, pr.len + 1); } });
  addBtn({ x: 300, y: BOT_Y, w: 28, h: 30, label: () => "◀", click: () => { const pr = prog(); pr.rate = (pr.rate + RATES.length - 1) % RATES.length; } });
  addBtn({ x: 450, y: BOT_Y, w: 28, h: 30, label: () => "▶", click: () => { const pr = prog(); pr.rate = (pr.rate + 1) % RATES.length; } });
  addBtn({ x: 548, y: BOT_Y, w: 28, h: 30, label: () => "◀", click: () => { presetIdx = (presetIdx + PRESETS.length - 1) % PRESETS.length; } });
  addBtn({ x: 806, y: BOT_Y, w: 28, h: 30, label: () => "▶", click: () => { presetIdx = (presetIdx + 1) % PRESETS.length; } });
  addBtn({ x: 840, y: BOT_Y, w: 62, h: 30, size: 12, label: () => "Usar", col: HAR_COL, click: () => {
    const pr = prog(), np = progFrom(PRESETS[presetIdx].p, pr.rate);
    pr.len = np.len; pr.slots = np.slots; selSlot = 0; auditionChord();
    flash(`Progresión «${PRESETS[presetIdx].name}» en el patrón ${"ABCD"[bank]}`);
  } });
  addBtn({ x: 912, y: BOT_Y, w: 66, h: 30, size: 12, label: () => "Azar", click: () => { randomProg(prog()); selSlot = 0; auditionChord(); flash("Progresión nueva al azar"); } });
  addBtn({ x: 986, y: BOT_Y, w: 198, h: 30, size: 12, label: () => "♪ Escuchar acorde", col: HAR_COL, click: auditionChord });
}
function hitWidget(v) {
  for (let n = UI.length - 1; n >= 0; n--) {
    const w = UI[n];
    if (isHidden(w)) continue;
    if (w.kind === "btn" && v.x >= w.x && v.x <= w.x + w.w && v.y >= w.y && v.y <= w.y + w.h) return w;
    if (w.kind === "knob" && Math.hypot(v.x - w.x, v.y - w.y) <= w.r + 7) return w;
  }
  return null;
}
function cellAt(v) {
  if (v.x < GX || v.x >= GX + STEPS * (CW + CG)) return null;
  for (const g of GRIDS) {
    if (v.y < g.y0 || v.y >= g.y0 + g.n * g.rowH) continue;
    const i = Math.floor((v.y - g.y0) / g.rowH), s = Math.floor((v.x - GX) / (CW + CG));
    const cy = g.y0 + i * g.rowH + 4, r = g.get(i);
    if (s >= r.len || v.x - GX - s * (CW + CG) > CW || v.y < cy || v.y > cy + g.ch) return null;
    return { g, i, s, r, ty: constrain(1 - (v.y - cy) / g.ch, 0, 1) };
  }
  return null;
}
const inStage = v => v.x >= ST.x && v.x <= ST.x + ST.w && v.y >= ST.y && v.y <= ST.y + ST.h;
const stageCol = x => constrain(Math.floor((x - ST.x) / (ST.w / 5)), 0, 4);
const stageT = y => 1 - constrain((y - ST.y) / ST.h, 0, 1);

// ---------- Entrada ----------
const pointers = new Map(), heldKeys = new Set();
let hover = null, stageHover = null, lastStageY = null, drag = null;

function setup() {
  createCanvas(windowWidth, 400);
  pixelDensity(Math.min(2, displayDensity()));
  textFont("TransMono");
  buildUI(); sizeCanvas();

  const el = drawingContext.canvas;
  el.style.touchAction = "none";
  el.tabIndex = 0;
  ["pointerup", "mousedown", "click", "touchend", "keydown"].forEach(ev => window.addEventListener(ev, unlockAudio, true));
  const toV = e => { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left - OX) / K, y: (e.clientY - r.top - OY) / K }; };

  el.addEventListener("pointerdown", e => {
    e.preventDefault(); el.focus({ preventScroll: true }); unlockAudio();
    const v = toV(e); hover = v;
    const w = hitWidget(v);
    if (w && w.kind === "btn") { w.click(); return; }
    if (w && w.kind === "knob") { drag = { type: "knob", k: w, y0: v.y, n0: knobNorm(w) }; el.setPointerCapture(e.pointerId); return; }
    const cell = cellAt(v);
    if (cell) {
      const st = cell.r.steps[cell.s];
      if (!st.on) { st.on = true; st.t = cell.ty; drag = { type: "paint", g: cell.g, i: cell.i }; audition(cell.i, st.t); }
      else drag = { type: "adjust", st, g: cell.g, i: cell.i, y0: v.y, t0: st.t, moved: false };
      cell.r.pulses = 0;
      el.setPointerCapture(e.pointerId); return;
    }
    if (inStage(v)) {
      el.setPointerCapture(e.pointerId);
      stageHover = v; lastStageY = v.y;
      pointers.set(e.pointerId, { col: stageCol(v.x), y: v.y });
    }
  });
  el.addEventListener("pointermove", e => {
    const v = toV(e); hover = v;
    stageHover = inStage(v) || pointers.has(e.pointerId) ? v : null;
    if (stageHover) lastStageY = v.y;
    const p = pointers.get(e.pointerId); if (p) p.y = v.y;
    if (!drag) return;
    if (drag.type === "knob") knobSetNorm(drag.k, drag.n0 + (drag.y0 - v.y) / 160);
    if (drag.type === "paint") {
      const cell = cellAt(v);
      if (cell && cell.g === drag.g && cell.i === drag.i && !cell.r.steps[cell.s].on) { cell.r.steps[cell.s] = { on: true, t: cell.ty }; audition(cell.i, cell.ty); }
    }
    if (drag.type === "adjust") {
      const dy = drag.y0 - v.y;
      if (Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) drag.st.t = constrain(drag.t0 + dy / 110, 0, 1);
    }
  });
  const up = e => {
    if (drag && drag.type === "adjust") { if (!drag.moved) drag.st.on = false; else audition(drag.i, drag.st.t); }
    drag = null; pointers.delete(e.pointerId);
  };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", () => { if (!pointers.size && !drag) { hover = null; stageHover = null; } });
  el.addEventListener("wheel", e => {
    const w = hitWidget(toV(e));
    if (w && w.kind === "knob") { e.preventDefault(); knobSetNorm(w, knobNorm(w) - e.deltaY / 900); }
  }, { passive: false });

  window.addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("select, input, textarea")) return;
    const k = e.key.toLowerCase();
    if (k === " ") { e.preventDefault(); if (!e.repeat) togglePlay(); return; }
    if ("1234".includes(k) && k.length === 1) { selectBank(+k - 1); return; }
    if (k === "r" && !e.repeat) { rec = !rec; return; }
    if (CHARS.some(c => c.k === k)) { e.preventDefault(); if (!e.repeat) { unlockAudio(); heldKeys.add(k); } }
  });
  window.addEventListener("keyup", e => heldKeys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => { heldKeys.clear(); pointers.clear(); });
}
// El lienzo usa el ancho de <main> y crece hacia abajo (la página se desplaza)
function sizeCanvas() {
  for (let k = 0; k < 2; k++) {   // dos pasadas: la barra de desplazamiento cambia el ancho
    const host = document.querySelector("main");   // el lienzo se adapta a su contenedor
    let w = 0;
    if (host) { const cs = getComputedStyle(host); w = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }
    w = Math.floor(w) || document.documentElement.clientWidth || windowWidth;
    K = w / VW; OX = 0; OY = 0;
    resizeCanvas(w, Math.ceil(VH * K));
  }
}
function windowResized() { sizeCanvas(); }

// ---------- Estado por cuadro ----------
function update() {
  const now = ac ? ac.currentTime : 0;
  for (let n = visQ.length - 1; n >= 0; n--) {
    const e = visQ[n];
    if (e.time > now) continue;
    if (e.type === "ph") rowPh[e.row] = e.idx;
    else if (e.type === "chord") playChord = e.ch;
    else { const c = CHARS[e.ci]; c.seqEnd = e.end; c.seqMidi = e.midi; c.seqT = e.t; }
    visQ.splice(n, 1);
  }
  CHARS.forEach((c, i) => {
    let y = null;
    for (const p of pointers.values()) { if (p.col === i) y = p.y; }
    if (y === null && heldKeys.has(c.k)) y = lastStageY ?? ST.y + ST.h / 2;
    const live = y !== null && !!ac;
    if (live) {
      c.t = stageT(y); c.midi = liveNote(i, c.t);
      c.v.liveMidi(c.midi); c.sv.liveMidi(c.midi);
      if (!c.live) { c.v.liveOn(); c.sv.liveOn(); }
    } else if (c.live) { c.v.liveOff(); c.sv.liveOff(); }
    c.live = live;
    const act = live || now < c.seqEnd;
    c.active = act;
    c.showMidi = live ? c.midi : c.seqMidi;
    c.open += ((act ? 1 : 0) - c.open) * .28;
    c.ts += ((act ? (live ? c.t : c.seqT) : c.ts) - c.ts) * .25;
    if (!act) { c.blink -= 1; if (c.blink < -7) c.blink = 120 + Math.random() * 260; }
  });
}

// ---------- Dibujo ----------
function draw() {
  update();
  background("#020a04");
  push(); translate(OX, OY); scale(K);
  drawHeader(); drawStage(); drawPanel(); drawSeq(); drawHarmony(); drawWidgets();
  pop();
  const el = drawingContext.canvas;
  const w = hover && hitWidget(hover);
  el.style.cursor = drag && drag.type === "knob" ? "ns-resize" : w ? (w.kind === "knob" ? "ns-resize" : "pointer") : hover && (cellAt(hover) || inStage(hover)) ? "crosshair" : "default";
}

function drawHeader() {
  noStroke(); fill("#7cff8a"); textAlign(LEFT, TOP); textStyle(BOLD); textSize(26);
  text("CORO DEL DRAGÓN", 18, 12);
  textStyle(NORMAL); textSize(11); fill("#3fae55");
  let s;
  if (audioErr) s = "No se pudo iniciar el audio: " + audioErr;
  else if (!ac) s = "Haz clic en cualquier parte para encender el audio";
  else if (ac.state !== "running") s = "El audio está en pausa: haz clic en el lienzo para activarlo";
  else if (millis() < msgUntil) s = msg;
  else if (rec) s = "● Grabando: lo que cantes en el escenario se escribe en el patrón";
  else s = "Espacio play · A S D F G cantar · 1–4 patrones · R grabar · clic en un acorde para oírlo";
  text(s, 20, 44);
}

function drawStage() {
  const T = millis() / 1000, colW = ST.w / 5, ctx = drawingContext;
  ctx.save(); ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(ST.x, ST.y, ST.w, ST.h, 16) : ctx.rect(ST.x, ST.y, ST.w, ST.h);
  ctx.clip();
  noStroke(); fill("#06140a"); rect(ST.x, ST.y, ST.w, ST.h);
  stroke("#0d2413"); strokeWeight(1);
  for (let r = 0, y = ST.y; y < SHELF; y += 26, r++) {
    line(ST.x, y, ST.x + ST.w, y);
    for (let x = ST.x - (r % 2) * 21; x < ST.x + ST.w; x += 42) { line(x, y, x, Math.min(y + 26, SHELF)); }
  }
  noStroke();
  CHARS.forEach((c, i) => {
    const hov = stageHover && stageCol(stageHover.x) === i;
    if (c.active || hov) { fill(124, 255, 138, c.active ? 34 : 16); rect(ST.x + i * colW + 4, ST.y + 4, colW - 8, SHELF - ST.y - 8, 12); }
  });
  fill("#3fae55"); textSize(10); textAlign(LEFT, TOP); text("↑ agudo", ST.x + 10, ST.y + 8);

  // acorde actual, arriba a la derecha
  const ch = displayChord();
  textAlign(RIGHT, TOP); fill(HAR_COL); textStyle(BOLD); textSize(18); text(ch.name, ST.x + ST.w - 12, ST.y + 8);
  textStyle(NORMAL); textSize(10); fill("#3fae55"); text(`${ch.roman} · ${NAMES[P.tonic]} ${SCALES[P.scale].name.toLowerCase()}`, ST.x + ST.w - 12, ST.y + 32);

  if (stageHover) {
    const y = constrain(stageHover.y, ST.y, ST.y + ST.h), i = stageCol(stageHover.x), c = CHARS[i];
    stroke("#7cff8a"); strokeWeight(1.2); ctx.setLineDash([5, 6]); line(ST.x, y, ST.x + ST.w, y); ctx.setLineDash([]);
    const lbl = `${c.name} · ${noteName(liveNote(i, stageT(y)))}`;
    textSize(11); const lw = textWidth(lbl) + 14;
    const lx = constrain(stageHover.x + 12, ST.x + 6, ST.x + ST.w - lw - 6), ly = constrain(y - 24, ST.y + 4, ST.y + ST.h - 24);
    noStroke(); fill("#7cff8a"); rect(lx, ly, lw, 18, 9); fill("#06140a"); textAlign(LEFT, CENTER); text(lbl, lx + 7, ly + 9.5);
  }

  noStroke();
  fill("#5a3a1e"); rect(ST.x, SHELF, ST.w, 10);
  fill("#7a5230"); rect(ST.x, SHELF + 10, ST.w, 4);
  fill("#07130b"); rect(ST.x, SHELF + 14, ST.w, ST.h);

  CHARS.forEach((c, i) => {
    c.x = ST.x + colW * (i + .5);
    const bob = Math.sin(T * 1.6 + i * 1.3) * CS * .006 + (c.active ? Math.sin(T * 11 + i) * CS * .006 : 0);
    if (i === 0) drawRataCosmica(c, c.x, SHELF + bob, CS * 1.06, T); else drawTortugaDragon(c, c.x, SHELF + bob, CS, T);
    fill("#7cff8a"); textAlign(CENTER, TOP); textStyle(BOLD); textSize(11); text(c.name, c.x, SHELF + 20); textStyle(NORMAL);
  });
  CHARS.forEach((c, i) => {
    if (c.open < .1 || c.showMidi === null) return;
    const y = SHELF - CS * 1.42 - (i === 0 ? CS * .12 : 0) - c.open * CS * .08, lbl = noteName(c.showMidi);
    textSize(12); textStyle(BOLD); const w = textWidth(lbl) + 16;
    push(); translate(c.x, y); scale(.6 + .4 * c.open);
    noStroke(); fill(c.col); rect(-w / 2, -12, w, 24, 12); triangle(-5, 11, 5, 11, 0, 17);
    fill(255); textAlign(CENTER, CENTER); text(lbl, 0, 1); pop(); textStyle(NORMAL);
  });
  ctx.restore();
}

function drawPanel() {
  noStroke();
  SECTIONS.forEach((s, n) => {
    const x = PANEL.x + n * 151;
    fill("#0a1d0f"); rect(x, PANEL.y, 145, PANEL.h, 14);
    fill(s.col); rect(x + 14, PANEL.y + 16, 8, 8, 2);
    fill("#7cff8a"); textAlign(LEFT, CENTER); textStyle(BOLD); textSize(11); text(s.title, x + 28, PANEL.y + 20.5); textStyle(NORMAL);
  });
}

function drawSeq() {
  noStroke(); fill("#7cff8a"); textAlign(LEFT, CENTER); textStyle(BOLD); textSize(12);
  const pend = pendingBank !== null ? `  →  ${"ABCD"[pendingBank]} al final del compás` : "";
  text(`SECUENCIADOR · patrón ${"ABCD"[bank]}${pend}`, 18, SEQ_Y - 20);
  textStyle(NORMAL); fill("#3fae55"); textSize(10); textAlign(CENTER, CENTER);
  for (let s = 0; s < STEPS; s++) { text(s + 1, GX + s * (CW + CG) + CW / 2, SEQ_Y - 8); }
  GRIDS.forEach(drawGrid);
}

function drawGrid(g) {
  const rows = banks[bank].mel, H = g.ch, ch = displayChord();
  const anySolo = rows.some(r => r.solo), hc = hover && cellAt(hover);
  rows.forEach((r, i) => {
    const y = g.y0 + i * g.rowH, c = CHARS[i], dim = r.mute || (anySolo && !r.solo), voz = r.mode === 0;
    noStroke(); fill(i % 2 ? "#0b1f10" : "#0b1f10"); rect(16, y, 1168, g.rowH - 4, 10);
    fill(c.col); rect(16, y, 6, g.rowH - 4, 10, 0, 0, 10);
    fill(dim ? "#2f8a3e" : "#7cff8a"); textAlign(LEFT, CENTER); textStyle(BOLD); textSize(12); text(c.name, 30, y + 17); textStyle(NORMAL);
    fill("#7cff8a"); textAlign(CENTER, CENTER); textSize(11); text(r.len, 147, y + 43.5);
    for (let s = 0; s < STEPS; s++) {
      const x = GX + s * (CW + CG), cy = y + 4, inLen = s < r.len, st = r.steps[s];
      noStroke();
      fill(!inLen ? "#10291a" : Math.floor(s / 4) % 2 ? "#163522" : "#10291a");
      rect(x, cy, CW, H, 7);
      if (inLen && st.on) {
        const col = color(c.col); col.setAlpha(dim ? 50 : 70); fill(col); rect(x, cy, CW, H, 7);
        fill(dim ? "#2f8a3e" : c.col);
        if (voz) { rect(x + 6, cy + 6, CW - 12, H - 12, 4); }        // modo Voz: la altura no cuenta
        else { const h = 6 + st.t * (H - 12); rect(x + 6, cy + H - 4 - h, CW - 12, h, 4); }
        if (hc && hc.g === g && hc.i === i && hc.s === s) {
          fill(voz ? "#ffffff" : "#7cff8a"); textSize(9); textAlign(CENTER, TOP);
          text(noteName(noteFor(i, r.mode, st.t, ch)), x + CW / 2, cy + 3);
        }
      }
      if (!inLen) { stroke("#0d2413"); strokeWeight(1); line(x + 8, cy + H - 8, x + CW - 8, cy + 8); }
      if (playing && rowPh[i] === s) { noFill(); stroke("#7cff8a"); strokeWeight(2.5); rect(x - 1, cy - 1, CW + 2, H + 2, 8); }
    }
    noStroke();
  });
}

function drawHarmony() {
  const pr = prog();
  noStroke(); fill("#7cff8a"); textAlign(LEFT, CENTER); textStyle(BOLD); textSize(12);
  text(`ARMONÍA · patrón ${"ABCD"[bank]} · ${NAMES[P.tonic]} ${SCALES[P.scale].name.toLowerCase()}`, 18, HAR_Y - 4);
  textStyle(NORMAL);
  // fila de tónica y escala
  fill("#7cff8a"); textStyle(BOLD); textSize(11); textAlign(LEFT, CENTER);
  text("Tónica", 18, KEY_Y + 15); text("Escala", 634, KEY_Y + 15); textStyle(NORMAL);
  fill("#020a04"); stroke("#2f8a3e"); strokeWeight(1); rect(724, KEY_Y, 186, 30, 8); noStroke();
  fill("#7cff8a"); textAlign(CENTER, CENTER); textStyle(BOLD); textSize(12); text(SCALES[P.scale].name, 817, KEY_Y + 16); textStyle(NORMAL);
  // notas de la escala, debajo
  fill("#3fae55"); textSize(10); textAlign(LEFT, CENTER);
  text("Notas: " + [0, 1, 2, 3, 4, 5, 6].map(spellDeg).join(" · "), 78, KEY_Y + 46);
  // fila inferior
  fill("#7cff8a"); textStyle(BOLD); textSize(11); textAlign(LEFT, CENTER);
  text("Acordes", 18, BOT_Y + 15); text("Cambio cada", 196, BOT_Y + 15); text("Ideas", 500, BOT_Y + 15); textStyle(NORMAL);
  textAlign(CENTER, CENTER); textSize(13); textStyle(BOLD); text(pr.len, 135, BOT_Y + 16); textStyle(NORMAL);
  fill("#020a04"); stroke("#2f8a3e"); rect(332, BOT_Y, 114, 30, 8); rect(580, BOT_Y, 222, 30, 8); noStroke();
  fill("#7cff8a"); textSize(11); text(RATE_NAMES[pr.rate], 389, BOT_Y + 16); text(PRESETS[presetIdx].name, 691, BOT_Y + 16);
  fill("#3fae55"); textSize(10); textAlign(LEFT, CENTER);
  text("Clic en una tarjeta para oír el acorde · − / + cambia el grado · el botón verde cambia el tipo · cada patrón A–D tiene su progresión", 18, BOT_Y + 50);
}

function drawCard(w, hov) {
  const pr = prog(), k = w.k, act = k < pr.len;
  const sel = act && k === Math.min(selSlot, pr.len - 1), now = playing && playChord && playChord.idx === k && act;
  noStroke(); fill(now ? HAR_COL : act ? "#0a1d0f" : "#0b1f10"); rect(w.x, w.y, w.w, w.h, 12);
  if (sel) { noFill(); stroke("#7cff8a"); strokeWeight(2.5); rect(w.x + 1, w.y + 1, w.w - 2, w.h - 2, 11); noStroke(); }
  else if (hov) { noFill(); stroke("#2f8a3e"); strokeWeight(1); rect(w.x, w.y, w.w, w.h, 12); noStroke(); }
  const ink = now ? "#020a04" : "#7cff8a", sub = now ? "#10291a" : "#3fae55";
  fill(act ? sub : "#2f8a3e"); textSize(10); textAlign(LEFT, TOP); text(k + 1, w.x + 10, w.y + 9);
  if (!act) { textAlign(CENTER, CENTER); textSize(11); text("+ agregar", w.x + w.w / 2, w.y + w.h / 2); return; }
  const info = chordInfo(pr.slots[k]);
  fill(ink); textAlign(CENTER, CENTER); textStyle(BOLD); textSize(26); text(info.roman, w.x + w.w / 2, w.y + 40);
  textSize(14); text(info.name, w.x + w.w / 2, w.y + 72); textStyle(NORMAL);
  fill(sub); textSize(10); text(info.notes, w.x + w.w / 2, w.y + 94);
}

function drawWidgets() {
  for (const w of UI) {
    if (isHidden(w)) continue;
    const hov = hover && hitWidget(hover) === w;
    if (w.draw) { w.draw(w, hov); continue; }
    if (w.kind === "btn") {
      const on = w.on && w.on(), pend = w.pending && w.pending();
      stroke(on ? w.col : hov ? "#2f8a3e" : "#2f8a3e"); strokeWeight(1);
      fill(on ? w.col : hov ? "#163522" : "#020a04");
      rect(w.x, w.y, w.w, w.h, 8);
      if (pend) { noFill(); stroke(w.col); strokeWeight(2); drawingContext.setLineDash([3, 3]); rect(w.x - 3, w.y - 3, w.w + 6, w.h + 6, 10); drawingContext.setLineDash([]); }
      noStroke(); fill(on ? "#020a04" : "#7cff8a"); textAlign(CENTER, CENTER); textStyle(BOLD); textSize(w.size);
      if (w.label() === "● Rec" && rec && Math.floor(millis() / 450) % 2) fill("#ffd0c8");
      text(w.label(), w.x + w.w / 2, w.y + w.h / 2 + 1); textStyle(NORMAL);
    } else {
      const n = knobNorm(w), a0 = PI * .75, a1 = PI * 2.25, a = a0 + (a1 - a0) * n, r = w.r;
      noFill(); strokeCap(ROUND);
      stroke("#163522"); strokeWeight(w.mini ? 2.5 : 3.5); arc(w.x, w.y, r * 2 + 8, r * 2 + 8, a0, a1);
      stroke(w.col); arc(w.x, w.y, r * 2 + 8, r * 2 + 8, a0, Math.max(a0 + .01, a));
      noStroke(); fill(hov || (drag && drag.k === w) ? "#163522" : "#020a04"); circle(w.x, w.y, r * 2 - 2);
      fill(w.col); circle(w.x, w.y, r * 1.25);
      stroke("#ffffff"); strokeWeight(w.mini ? 2 : 3); line(w.x, w.y, w.x + Math.cos(a) * r * .55, w.y + Math.sin(a) * r * .55);
      noStroke(); textAlign(CENTER, TOP);
      if (w.mini) {
        fill("#3fae55"); textSize(9);
        text(hov || (drag && drag.k === w) ? knobText(w) : w.label, w.x, w.y + r + 6);
      } else {
        fill("#7cff8a"); textStyle(BOLD); textSize(10); text(w.label, w.x, w.y + r + 9); textStyle(NORMAL);
        fill("#3fae55"); textSize(10); text(knobText(w), w.x, w.y + r + 22);
      }
    }
  }
}

// ---------- Personajes ----------
function eyes(c, hd, ex, ey, ew, eh, white, pupil) {
  const singing = c.open > .5, closed = c.blink < 0;
  for (const sx of [-1, 1]) {
    const x = sx * ex;
    if (singing || closed) {
      noFill(); stroke(white); strokeWeight(hd * .035); strokeCap(ROUND);
      if (singing) arc(x, ey + eh * .15, ew * .8, eh * .9, PI + .3, TWO_PI - .3);
      else line(x - ew * .4, ey, x + ew * .4, ey);
      noStroke();
    } else {
      fill(white); ellipse(x, ey, ew, eh);
      let dx = 0, dy = 0;
      if (hover) { const a = Math.atan2(hover.y - (SHELF - hd * 1.6), hover.x - c.x); dx = Math.cos(a) * ew * .2; dy = Math.sin(a) * eh * .2; }
      fill(pupil); ellipse(x + dx, ey + dy, ew * .45, eh * .6);
    }
  }
}
function mouth(c, hd, my, bg) {
  const o = c.open;
  if (o < .06) { noFill(); stroke(bg); strokeWeight(hd * .03); strokeCap(ROUND); arc(0, my - hd * .03, hd * .2, hd * .1, .2, PI - .2); noStroke(); return; }
  const mw = hd * (.14 + .08 * o), mh = hd * (.04 + .22 * o * (.55 + .45 * c.ts));
  noStroke(); fill(bg); ellipse(0, my, mw, mh);
  fill("#e2797a"); ellipse(0, my + mh * .28, mw * .55, mh * .35);
}
// Pantallas CRT en vez de ojos: pupila de píxel que sigue el mouse, onda al cantar, línea al parpadear.
function crtEyes(c, hd, ex, ey, ew, eh, T) {
  const singing = c.open > .5, closed = c.blink < 0;
  for (const sx of [-1, 1]) {
    const x = sx * ex;
    noStroke(); fill("#141414"); rect(x - ew * .62, ey - eh * .62, ew * 1.24, eh * 1.24, ew * .22);
    fill(closed ? "#05140a" : "#0c2a12"); rect(x - ew / 2, ey - eh / 2, ew, eh, ew * .16);
    stroke("#7cff8a"); strokeWeight(Math.max(1, hd * .022)); noFill();
    if (closed) { line(x - ew * .38, ey, x + ew * .38, ey); }
    else if (singing) {
      beginShape();
      for (let k = 0; k <= 10; k++) {
        const u = k / 10, amp = eh * .32 * (.4 + .6 * c.ts);
        vertex(x - ew * .4 + u * ew * .8, ey + Math.sin(u * 9 + T * 18 + c.i) * amp);
      }
      endShape();
    } else {
      noStroke(); fill("#7cff8a");
      let dx = 0, dy = 0;
      if (hover) { const a = Math.atan2(hover.y - (SHELF - hd * 1.6), hover.x - c.x); dx = Math.cos(a) * ew * .2; dy = Math.sin(a) * eh * .2; }
      const p = ew * .26;
      rect(x + dx - p / 2, ey + dy - p / 2, p, p);
    }
    noStroke(); fill(124, 255, 138, 40);
    for (let k = 0; k < 3; k++) { rect(x - ew / 2, ey - eh / 2 + k * eh / 3, ew, Math.max(1, eh * .06)); }
  }
}

// Tortuga del Dragón: caparazón de escamas con púas, cuernos, ojos de pantalla. El color de la voz
// va en las escamas y las púas.
function drawTortugaDragon(c, x, base, s, T) {
  const o = c.open, hd = s * .56, bw = s * .74, bh = s * .56;
  const dark = lerpColor(color(c.col), color("#0b0f0c"), .55), lite = lerpColor(color(c.col), color("#ffffff"), .25);
  push(); translate(x, base); noStroke();
  fill(0, 0, 0, 40); ellipse(0, 0, s * .86, s * .1);
  // cola con púas
  fill("#3d5a2a"); triangle(bw * .38, -s * .06, bw * .78, -s * .02, bw * .4, -s * .16);
  fill(dark); triangle(bw * .55, -s * .09, bw * .62, -s * .15, bw * .67, -s * .06);
  // patas con garras
  for (const sx of [-1, 1]) {
    fill("#3d5a2a"); ellipse(sx * bw * .36, -s * .06, s * .2, s * .14);
    fill("#d9cfb0"); for (const g of [-1, 0, 1]) { triangle(sx * bw * .36 + g * s * .045 - s * .015, -s * .01, sx * bw * .36 + g * s * .045 + s * .015, -s * .01, sx * bw * .36 + g * s * .045, s * .02); }
  }
  // caparazón
  fill("#1b211c"); rect(-bw / 2, -bh, bw, bh * .92, s * .34, s * .34, s * .08, s * .08);
  for (let r = 0; r < 4; r++) {
    const yy = -bh * .82 + r * bh * .2, half = bw * (.26 + r * .055);
    for (let xx = -half, k = 0; xx <= half + .1; xx += s * .11, k++) {
      fill((k + r) % 2 ? c.col : dark); ellipse(xx, yy, s * .12, s * .1);
      fill(255, 255, 255, 30); ellipse(xx - s * .015, yy - s * .02, s * .05, s * .03);
    }
  }
  fill("#2a3a24"); rect(-bw / 2, -bh * .14, bw, s * .07, s * .03);
  // púas del lomo
  for (let k = -2; k <= 2; k++) {
    const px = k * bw * .16, py = -bh - Math.cos(k * .55) * s * .02 + Math.abs(k) * s * .03;
    fill(lite); triangle(px - s * .045, py + s * .03, px + s * .045, py + s * .03, px, py - s * .09 - (k === 0 ? s * .03 : 0));
  }
  // cabeza
  const hy = -bh - hd * .3 - o * s * (.03 + .05 * c.ts);
  push(); translate(0, hy); rotate(Math.sin(T * 6 + c.i) * .05 * o);
  // cuernos
  for (const sx of [-1, 1]) {
    fill("#d9cfb0");
    beginShape(); vertex(sx * hd * .22, -hd * .3); vertex(sx * hd * .4, -hd * .32);
    vertex(sx * hd * (.52 + .08 * (c.i % 2)), -hd * (.72 + .1 * (c.i === 2))); endShape(CLOSE);
    fill("#8c7f5f"); ellipse(sx * hd * (.5 + .08 * (c.i % 2)), -hd * (.68 + .1 * (c.i === 2)), hd * .05, hd * .05);
  }
  // gola de escamas detrás de la cabeza
  for (let k = -3; k <= 3; k++) { fill(k % 2 ? dark : c.col); const a = k * .38 - HALF_PI; triangle(Math.cos(a) * hd * .38, Math.sin(a) * hd * .38, Math.cos(a - .2) * hd * .62, Math.sin(a - .2) * hd * .62, Math.cos(a + .2) * hd * .62, Math.sin(a + .2) * hd * .62); }
  fill("#4f6b3a"); ellipse(0, 0, hd, hd * .9);
  fill("#6f8f4f"); ellipse(0, hd * .24, hd * .7, hd * .4);
  fill("#1b211c"); ellipse(-hd * .1, hd * .14, hd * .05, hd * .035); ellipse(hd * .1, hd * .14, hd * .05, hd * .035);
  crtEyes(c, hd, hd * .2, -hd * .1, hd * .24, hd * .17, T);
  mouth(c, hd, hd * .32, "#1a0d0d");
  // humo cuando canta
  if (o > .3) {
    noStroke();
    for (let k = 0; k < 3; k++) { const f = (T * 1.5 + k / 3) % 1; fill(190, 190, 190, 120 * (1 - f) * o); ellipse(Math.sin(f * 6 + k) * hd * .1, hd * .1 - f * hd * .9, hd * (.08 + f * .14)); }
  }
  pop(); pop();
}

// La Rata Cósmica: traje espacial con luces, casco de vidrio y antena que suelta estática.
function drawRataCosmica(c, x, base, s, T) {
  const o = c.open, hd = s * .5, bw = s * .66, bh = s * .64;
  push(); translate(x, base); noStroke();
  fill(0, 0, 0, 40); ellipse(0, 0, s * .86, s * .1);
  noFill(); stroke("#c98f86"); strokeWeight(s * .028); strokeCap(ROUND);
  const tw = Math.sin(T * 1.4) * s * .05;
  bezier(bw * .3, -s * .03, bw * .78, 0, bw * .95 + tw, -bh * .3, bw * .82 + tw, -bh * .6);
  noStroke();
  // traje
  fill("#c9c9c2"); rect(-bw / 2, -bh, bw, bh, s * .26, s * .26, s * .08, s * .08);
  fill("#9a9a92"); rect(-bw / 2, -bh * .3, bw, s * .06);
  for (const sx of [-1, 1]) { fill("#b3b3ab"); ellipse(sx * bw * .5, -bh * .6, s * .17, s * .32); }
  // panel del pecho con luces
  fill("#2a2a2a"); rect(-bw * .26, -bh * .82, bw * .52, bh * .34, s * .03);
  const leds = ["#ff3d3d", "#ffb000", "#7cff8a", "#4dc3ff"];
  for (let k = 0; k < 4; k++) {
    const on = (Math.floor(T * 4 + k * 1.7) % 3 !== 0) || o > .5;
    fill(on ? leds[k] : "#333"); ellipse(-bw * .16 + k * bw * .107, -bh * .74, s * .045);
  }
  fill(c.col); rect(-bw * .18, -bh * .62, bw * .36 * (.3 + .7 * o), s * .03);
  // cabeza
  const hy = -bh - hd * .5 - o * s * (.03 + .05 * c.ts);
  push(); translate(0, hy); rotate(Math.sin(T * 4 + 1) * .04 * o);
  for (const sx of [-1, 1]) {
    push(); translate(sx * hd * .36, -hd * .32); rotate(sx * .2);
    fill("#7d7f86"); ellipse(0, 0, hd * .42, hd * .42); fill("#d99a92"); ellipse(0, hd * .02, hd * .24, hd * .24); pop();
  }
  fill("#8d9097"); ellipse(0, 0, hd, hd * .9);
  fill("#b9bcc2"); beginShape(); vertex(-hd * .2, hd * .14); vertex(hd * .2, hd * .14); vertex(0, hd * .52 + o * hd * .05); endShape(CLOSE);
  fill("#2b1d18"); ellipse(0, hd * .46, hd * .1, hd * .07);
  stroke("#2b1d18"); strokeWeight(hd * .012);
  const wv = Math.sin(T * 3) * hd * .02;
  for (const sx of [-1, 1]) { for (const dy of [-.02, .04]) { line(sx * hd * .1, hd * (.36 + dy), sx * hd * .48, hd * (.3 + dy * 2) + wv); } }
  noStroke();
  crtEyes(c, hd, hd * .19, -hd * .06, hd * .22, hd * .16, T);
  mouth(c, hd, hd * .28, "#1a0d0d");
  // casco
  noFill(); stroke(232, 246, 255, 200); strokeWeight(s * .02); ellipse(0, -hd * .05, hd * 1.55, hd * 1.5);
  stroke(255, 255, 255, 120); strokeWeight(s * .014); arc(0, -hd * .05, hd * 1.3, hd * 1.25, PI + .5, PI + 1.3);
  noStroke(); fill(200, 230, 255, 22); ellipse(0, -hd * .05, hd * 1.55, hd * 1.5);
  // antena
  stroke("#9a9a92"); strokeWeight(s * .015); line(hd * .3, -hd * .75, hd * .42, -hd * 1.15); noStroke();
  const blink = Math.floor(T * 2) % 2 === 0 || o > .5;
  fill(blink ? c.col : "#444"); ellipse(hd * .42, -hd * 1.15, s * .06);
  if (o > .2) {   // estática alrededor de la antena
    for (let k = 0; k < 10; k++) { fill(255, 255, 255, 180 * o); rect(hd * .42 + (Math.random() - .5) * hd * .5, -hd * 1.15 + (Math.random() - .5) * hd * .5, 2, 2); }
  }
  pop(); pop();
}
