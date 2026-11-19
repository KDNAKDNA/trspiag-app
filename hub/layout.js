// Diseño de la pantalla del hub en modo texto.
// Lo usan hub.js (navegador) y tools/render_pantalla.py (imagen para la TV de Blender),
// así lo que se ve en la TV del cuarto es igual al hub.
// Pantalla virtual: 480x270 px, celdas de 8x14 px (60 columnas x 19 filas).
window.LAYOUT = {
  "w": 480, "h": 270, "cellW": 8, "cellH": 14, "cols": 60, "rows": 19,
  "font": "LiberationMono-Bold.ttf", "fontSize": 13,
  "colors": {
    "bg": "#020a04", "fg": "#7cff8a", "dim": "#2f8a3e", "amber": "#ffb000",
    "magenta": "#ff3d8b", "inverseFg": "#020a04"
  },
  "title": { "text": "TRANSPARENCIA", "row": 1, "scale": 3 },
  "lines": [
    { "row": 4, "text": "SISTEMA DE PERFORMANCE EN VIVO  ·  v1.0", "color": "amber", "center": true },
    { "row": 5, "text": "════════════════════════════════════════════════════════════", "color": "dim", "col": 0 }
  ],
  "menu": {
    "row": 7, "col": 4, "keyCol": 0, "nameCol": 4, "descCol": 19,
    "items": [
      { "key": "1", "name": "EN VIVO",   "desc": "LOS TRES LAPTOPS AL TIEMPO",   "id": "envivo" },
      { "key": "2", "name": "COMPONER",  "desc": "VOCES DEL CORO Y SINTE",       "id": "componer" },
      { "key": "3", "name": "BATERÍA",   "desc": "LA CAJA DE RITMOS DESTRIPADA", "id": "bateria" },
      { "key": "4", "name": "CÁMARA",    "desc": "CENSURA Y VISUALES",           "id": "camara" },
      { "key": "5", "name": "CANCIONES", "desc": "EL ARCHIVO DE CINTAS",         "id": "canciones" },
      { "key": "6", "name": "CONECTAR",  "desc": "ENCUENTRA A LOS OTROS LAPTOPS", "id": "conectar" },
      { "key": "7", "name": "OBJETOS 3D", "desc": "EL CUARTO EN TRES DIMENSIONES", "id": "objetos" },
      { "key": "0", "name": "VOLVER AL CUARTO", "desc": "", "id": "cuarto" }
    ]
  },
  "prompt": { "row": 16, "col": 4, "text": "> ELIGE UN NÚMERO O USA LAS FLECHAS + ENTER" },
  "status": { "row": 18, "text": " LAPTOPS 0/3   BPM ---   SEÑAL --   F1 AYUDA" }
};
