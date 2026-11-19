# HUB de TRANSPARENCIA

Pantalla de inicio de la app. Recorrido:

1. **Pantalla apagada:** "PULSA CUALQUIER TECLA PARA ENCENDER". El audio solo puede arrancar después de una tecla o un clic.
2. **Arranque tipo computador viejo:** la TV se enciende y se escribe un BIOS.
3. **El cuarto:** video renderizado en Blender. La cámara entra en la pantalla del televisor, que ya muestra el hub.
4. **El hub:** el mismo menú que se veía en la TV, ahora interactivo, con filtro de TV análoga.

`[0] VOLVER AL CUARTO` hace el camino al revés. Durante el video, cualquier tecla lo salta.

## Correr

Desde esta carpeta:

```bash
python3 -m http.server 8000
```

Luego abre <http://localhost:8000> en Chrome. Con `?saltar` (<http://localhost:8000/?saltar>) se entra directo al hub.

## Teclas

| Tecla | Acción |
|---|---|
| 1–6, flechas + Enter, clic | Entrar a una opción |
| 0 | Volver al cuarto |
| F | Pantalla completa |
| F1 | Ayuda |

## Archivos

| Archivo | Qué hace |
|---|---|
| `layout.js` | Diseño de la pantalla en modo texto (60×19 celdas). Lo usan el navegador y el script de la TV |
| `hub.js` | Estados, menú, teclado y mouse, momentos raros, enlaces a los módulos (`MODULOS`) |
| `crt.js` | Filtro WebGL: curvatura, scanlines, máscara RGB, ruido, barra que rueda y glitches |
| `sonido.js` | Zumbido, estática, bips y teclas, sintetizados con Web Audio |
| `fonts/` | Liberation Mono Bold (licencia SIL OFL) dibujada en bits |
| `video/intro.mp4`, `video/salida.mp4` | Entrada y salida del cuarto |
| `blender/cuarto_hub.blend` | El cuarto en 3D |
| `tools/render_pantalla.py` | Dibuja `textures/pantalla_hub_1920.png`, la imagen que muestra la TV en Blender |

## Si cambias el menú

1. Edita `layout.js`.
2. Corre `python3 tools/render_pantalla.py` para regenerar la imagen de la TV.
3. En Blender, recarga la imagen y vuelve a renderizar. Si no, la TV del video mostrará el menú viejo.

## Pendiente

Los módulos todavía no están montados. Mientras no existan, cada opción muestra "SIN SEÑAL". Cuando esté el servidor de Node, las rutas de `MODULOS` en `hub.js` apuntarán a `coro/`, `camara/`, etc.
