// Guardar y abrir canciones a través de la API del router (rutas relativas).
(function () {
  const API = "api/songs";
  const $ = id => document.getElementById(id);
  const form = $("songForm"), nameEl = $("songName"), list = $("songList"), statusEl = $("songStatus");
  const buttons = ["btnSave", "btnSaveNew", "btnNew", "btnOpen", "btnDelete"].map($);
  const defaults = getSongData();          // estado inicial, para "Nueva"
  let currentId = null;

  function status(msg, isError) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("is-error", !!isError);
  }
  function busy(on) { buttons.forEach(b => { b.disabled = on; }); }

  async function call(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch (e) { /* respuesta sin JSON */ }
    if (!res.ok) throw new Error((data && data.error) || `El servidor respondió ${res.status}`);
    return data;
  }

  async function refresh(selectId) {
    const songs = await call("GET", API);
    list.textContent = "";
    const first = new Option(songs.length ? "Elige una canción…" : "No hay canciones guardadas", "");
    list.add(first);
    for (const s of songs) {
      const when = new Date(s.updatedAt).toLocaleString();
      list.add(new Option(`${s.name} · ${when}`, s.id));
    }
    list.value = selectId && songs.some(s => s.id === selectId) ? selectId : "";
  }

  async function save(asNew) {
    busy(true); status("Guardando…");
    try {
      const body = { name: nameEl.value, song: getSongData() };
      const rec = currentId && !asNew
        ? await call("PUT", `${API}/${encodeURIComponent(currentId)}`, body)
        : await call("POST", API, body);
      currentId = rec.id; nameEl.value = rec.name;
      await refresh(rec.id);
      status(`Guardada: «${rec.name}»`);
    } catch (err) {
      status(`No se pudo guardar: ${err.message}`, true);
    } finally { busy(false); }
  }

  async function open() {
    const id = list.value;
    if (!id) return status("Elige primero una canción de la lista.", true);
    busy(true); status("Abriendo…");
    try {
      const rec = await call("GET", `${API}/${encodeURIComponent(id)}`);
      loadSongData(rec.song);
      currentId = rec.id; nameEl.value = rec.name;
      status(`Abierta: «${rec.name}»`);
    } catch (err) {
      status(`No se pudo abrir: ${err.message}`, true);
    } finally { busy(false); }
  }

  async function remove() {
    const id = list.value;
    if (!id) return status("Elige primero la canción que quieres borrar.", true);
    const label = list.options[list.selectedIndex].text;
    if (!window.confirm(`¿Borrar «${label}»? No se puede deshacer.`)) return;
    busy(true); status("Borrando…");
    try {
      await call("DELETE", `${API}/${encodeURIComponent(id)}`);
      if (currentId === id) currentId = null;
      await refresh();
      status("Canción borrada.");
    } catch (err) {
      status(`No se pudo borrar: ${err.message}`, true);
    } finally { busy(false); }
  }

  function startNew() {
    loadSongData(defaults);
    currentId = null; nameEl.value = ""; list.value = "";
    status("Canción nueva (sin guardar).");
  }

  form.addEventListener("submit", e => { e.preventDefault(); save(false); });
  $("btnSaveNew").addEventListener("click", () => save(true));
  $("btnNew").addEventListener("click", startNew);
  $("btnOpen").addEventListener("click", open);
  $("btnDelete").addEventListener("click", remove);
  // que Espacio vuelva a controlar el secuenciador después de usar la barra
  buttons.forEach(b => b.addEventListener("click", () => b.blur()));
  list.addEventListener("change", () => list.blur());

  refresh().catch(err => {
    list.textContent = ""; list.add(new Option("Sin conexión", ""));
    status(`No se pudo cargar la lista: ${err.message}`, true);
  });
})();
