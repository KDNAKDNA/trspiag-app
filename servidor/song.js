// Valida y limpia una canción que llega del navegador.
// Nunca se guarda lo que manda el cliente tal cual: se reconstruye un objeto
// nuevo con la forma esperada y cada número acotado a su rango.
const STEPS = 16, MEL_ROWS = 5, BANKS = 4, SLOTS = 8;
const SCALES = 9, EXTS = 6, MODES = 3, RATES = 3;

// [mín, máx, por defecto, entero] — los mismos parámetros que P en public/sketch.js
const PARAMS = {
  bpm: [50, 180, 92, true], swing: [0, .6, 0], gate: [.1, 2, .9], glide: [0, .2, .03],
  release: [.02, 2, .25], vib: [0, 40, 18, true],
  tonic: [0, 11, 0, true], scale: [0, SCALES - 1, 0, true],
  wave: [0, 3, 0, true], oct: [0, 2, 1, true], attack: [.002, .5, .01], detune: [0, 40, 8, true],
  slevel: [0, 1.2, .8], clevel: [0, 1.2, .9],
  pad: [0, 1, .3], padAtk: [.01, 2, .25], padTone: [300, 8000, 2200],
  ftype: [0, 2, 0, true], cutoff: [60, 16000, 7000], reso: [.5, 20, 2], lfoRate: [.05, 12, .4], lfoDepth: [0, 1, .2],
  dtime: [0, 4, 2, true], dfb: [0, .92, .38], dmix: [0, 1, .28], drive: [0, 1, .1], rev: [0, 1, .35], vol: [0, 1, .8],
};
// Progresión por defecto (pop: 1 5 6 4), para canciones que no traen una
const DEFAULT_PROG = [0, 4, 5, 3];

const obj = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const arr = v => (Array.isArray(v) ? v : []);
function num(v, min, max, def, int) {
  let n = Number(v);
  if (typeof v === "boolean" || v === null || v === "" || !Number.isFinite(n)) n = def;
  n = Math.min(max, Math.max(min, n));
  return int ? Math.round(n) : n;
}

function cleanRow(r) {
  r = obj(r);
  const steps = arr(r.steps);
  return {
    len: num(r.len, 1, STEPS, STEPS, true),
    pulses: num(r.pulses, 0, STEPS, 0, true),
    mute: r.mute === true,
    solo: r.solo === true,
    mode: num(r.mode, 0, MODES - 1, 1, true),       // 0 Voz, 1 Acorde, 2 Escala
    steps: Array.from({ length: STEPS }, (_, i) => {
      const s = obj(steps[i]);
      return { on: s.on === true, t: num(s.t, 0, 1, .5) };
    }),
  };
}

function cleanProg(p) {
  const given = p && typeof p === "object";
  p = obj(p);
  const slots = arr(p.slots);
  return {
    len: num(p.len, 1, SLOTS, given ? 1 : DEFAULT_PROG.length, true),
    rate: num(p.rate, 0, RATES - 1, 1, true),        // 0 ½ compás, 1 un compás, 2 dos compases
    slots: Array.from({ length: SLOTS }, (_, k) => {
      const s = obj(slots[k]);
      return { deg: num(s.deg, 0, 6, given ? 0 : (DEFAULT_PROG[k] ?? 0), true), ext: num(s.ext, 0, EXTS - 1, 0, true) };
    }),
  };
}

function sanitizeSong(input) {
  const d = obj(input);
  if (!Array.isArray(d.banks)) throw new Error("Falta la canción (banks)");
  const p = obj(d.P), P = {};
  for (const [k, [min, max, def, int]] of Object.entries(PARAMS)) P[k] = num(p[k], min, max, def, int);
  const mix = arr(d.mix);
  return {
    version: 2,
    bank: num(d.bank, 0, BANKS - 1, 0, true),
    chain: d.chain === true,
    P,
    mix: Array.from({ length: MEL_ROWS }, (_, i) => num(mix[i], 0, 1, .35)),
    banks: Array.from({ length: BANKS }, (_, b) => {
      const bk = obj(d.banks[b]);
      return {
        mel: Array.from({ length: MEL_ROWS }, (_, i) => cleanRow(arr(bk.mel)[i])),
        prog: cleanProg(bk.prog),
      };
    }),
  };
}

function sanitizeName(v) {
  const s = typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  return s.slice(0, 80) || "Sin título";
}

module.exports = { sanitizeSong, sanitizeName };
