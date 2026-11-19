// Canal en vivo de TRANSPARENCIA (lo usan el coro, la cámara y el panel).
//
//   EnVivo.conecta("coro")            // se presenta con un rol
//   EnVivo.envia({ type: "dhit", i: 0 })
//   EnVivo.escucha(e => { ... })      // recibe los eventos de los demás
//
// Los eventos viajan por dos caminos y se descartan los repetidos:
// - BroadcastChannel: entre pestañas del mismo laptop, sin pasar por la red (instantáneo).
// - El servidor (/api/envivo): entre laptops de la red local, por Server-Sent Events.
// Rutas relativas a la raíz del servidor, para que funcione desde /coro/, /camara/, etc.
window.EnVivo = (() => {
  const BASE = new URL("../", document.baseURI.replace(/[^/]*$/, "")).href;   // raíz del servidor
  const API = BASE + "api/envivo";
  const yo = Math.random().toString(36).slice(2, 10);
  const vistos = new Set(), orden = [];
  const oyentes = [], oyentesEstado = [];
  let cola = [], enviando = false, es = null, rol = "otro", conectado = false, ultimoRecibido = 0;
  let bc = null;
  try { bc = new BroadcastChannel("transparencia"); } catch (e) { bc = null; }

  function visto(uid) {
    if (vistos.has(uid)) return true;
    vistos.add(uid); orden.push(uid);
    if (orden.length > 500) vistos.delete(orden.shift());
    return false;
  }
  function entrega(e, local) {
    if (!e || !e.uid || visto(e.uid)) return;
    ultimoRecibido = performance.now();
    for (const f of oyentes) { try { f(e, local); } catch (err) { console.error(err); } }
  }

  async function vacia() {
    if (enviando || !cola.length) return;
    enviando = true;
    const lote = cola; cola = [];
    try {
      await fetch(API, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origen: yo, eventos: lote }), keepalive: true,
      });
    } catch (err) { /* sin servidor: seguimos por BroadcastChannel */ }
    enviando = false;
    if (cola.length) vacia();
  }

  function envia(e) {
    e = Object.assign({}, e, { uid: yo + "-" + Math.random().toString(36).slice(2, 10) });
    visto(e.uid);                                   // no recibirse a sí mismo
    if (bc) { bc.postMessage(e); }
    cola.push(e);
    if (cola.length > 100) cola = cola.slice(-100);
    queueMicrotask(vacia);
  }

  function conecta(r, nombre) {
    rol = r || rol;
    if (bc) { bc.onmessage = m => entrega(m.data, true); }
    if (!window.EventSource) return;
    const abre = () => {
      es = new EventSource(API + "/stream?rol=" + encodeURIComponent(rol) + "&nombre=" + encodeURIComponent(nombre || rol));
      es.onopen = () => { conectado = true; };
      es.onerror = () => { conectado = false; };   // EventSource reintenta solo
      es.onmessage = m => {
        let d; try { d = JSON.parse(m.data); } catch (err) { return; }
        if (d.origen === yo) return;
        for (const e of d.eventos || []) entrega(e, false);
      };
      es.addEventListener("estado", m => {
        let d; try { d = JSON.parse(m.data); } catch (err) { return; }
        for (const f of oyentesEstado) { try { f(d); } catch (err) { console.error(err); } }
      });
    };
    abre();
  }

  // ---------- Reloj compartido ----------
  // Cada computador mide la diferencia entre su reloj y el del servidor (se queda con la medición
  // de menor ida y vuelta). Así un "play en el instante X" suena a la vez en todos los laptops.
  let desfase = 0, mejorIdaVuelta = Infinity;
  async function mideReloj() {
    for (let k = 0; k < 5; k++) {
      try {
        const t0 = Date.now();
        const r = await fetch(API + "/hora", { cache: "no-store" });
        const { t } = await r.json();
        const t1 = Date.now(), iv = t1 - t0;
        if (iv <= mejorIdaVuelta + 5) { mejorIdaVuelta = Math.min(mejorIdaVuelta, iv); desfase = t - (t0 + t1) / 2; }
      } catch (err) { return; }
    }
  }
  mideReloj();
  setInterval(() => { mejorIdaVuelta += 20; mideReloj(); }, 30000);   // el reloj puede derivar: se vuelve a medir
  const ahora = () => Date.now() + desfase;                           // hora del servidor, en ms
  // Ejecuta fn en el instante "en" (hora del servidor). Si ya pasó, la ejecuta ya.
  const alInstante = (en, fn) => setTimeout(fn, Math.max(0, (en || 0) - ahora()));
  const RETRASO = 350;   // margen para que el aviso llegue a todos antes de arrancar

  return {
    ahora, alInstante, RETRASO,
    get idaVuelta() { return mejorIdaVuelta; },
    conecta, envia,
    escucha: f => oyentes.push(f),
    escuchaEstado: f => oyentesEstado.push(f),
    get conectado() { return conectado; },
    get rol() { return rol; },
    // ms desde el último evento recibido (Infinity si nunca)
    get silencio() { return ultimoRecibido ? performance.now() - ultimoRecibido : Infinity; },
  };
})();
