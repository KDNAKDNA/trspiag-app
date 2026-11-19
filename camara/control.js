// Ventana de control: muestra el HUD en la pantalla del laptop y reenvía las teclas a la ventana del proyector.
const hud = document.getElementById("hud");
const main = () => { try { return window.opener && !window.opener.closed && window.opener.CENSURA; } catch { return null; } };

setInterval(() => {
  const c = main();
  if (c) { c.registerControl(window); hud.innerHTML = c.hudHtml(); }
  else hud.innerHTML = "<b>Sin conexión</b> con la ventana del proyector.<br>Abre http://localhost:3000/camara/ y pulsa C allí.";
}, 200);

document.addEventListener("keydown", async e => {
  const c = main();
  if (!c) return;
  if (e.key.toLowerCase() === "d") {   // el selector de carpeta tiene que abrirse en esta ventana
    e.preventDefault();
    if (e.repeat || !window.showDirectoryPicker) return;
    try {
      const handle = await window.showDirectoryPicker({ id: "censura-rec", mode: "readwrite", startIn: "videos" });
      window.opener.postMessage({ type: "recDir", handle }, location.origin);
    } catch (err) { if (err.name !== "AbortError") console.error(err); }
    return;
  }
  if (c.key(e.key, true) === false) e.preventDefault();
});
