# TRANSPARENCIA

App para el show en vivo. Tiene tres partes y un hub:

- **Hub:** el cuarto en 3D. La cámara entra en la TV y el menú de la TV es el hub.
- **Coro del Dragón:** voces de la Rata Cósmica y las Tortugas del Dragón, con armonía y progresiones.
- **Caja de ritmos:** batería sintetizada de 6 pistas; cada golpe dispara efectos en la cámara.
- **Objetos 3D:** visor con Three.js de los modelos exportados de Blender.
- **Cámara:** proyección con las caras censuradas. **Reacciona a la música del coro.**
- **En vivo:** panel con quién está conectado y qué está sonando.

Ver `PROYECTO.md` para la idea completa.

## Antes del show (una sola vez)

Solo hace falta **Node.js** (nodejs.org, versión 18 o más nueva). No hay que instalar paquetes ni tener internet.

## El día del show

1. **Router:** conecten los tres laptops al mismo wifi. Mejor un router propio que el wifi del lugar.
2. **Laptop de la cámara** (el que va al proyector). En la Terminal:
   ```bash
   cd ~/Desktop/universidad/iag/trspiag-app
   node server.js
   ```
   La Terminal muestra las direcciones. Déjenla abierta todo el show.
3. **En ese mismo laptop**, abran en Chrome `http://localhost:3000/camara/`. La cámara y el micrófono solo funcionan en `localhost`. Pulsen **C** para la ventana de control y **F** en la ventana del proyector.
4. **Laptops del coro:** abran en Chrome la dirección que mostró la Terminal (por ejemplo `http://192.168.0.12:3000/`). Entren por el hub o directo a `/coro/`. Hagan un clic en el lienzo para encender el audio.
5. Cuando uno da **Play** (Espacio), el otro coro arranca también, y la cámara empieza a reaccionar.

## Qué dispara qué en la cámara

| Suena en el coro | Pasa en la cámara |
|---|---|
| Bombo | Salto de color (estilo 4) y pulso. Máximo 3 cambios por segundo, por epilepsia fotosensible |
| Caja / palmas | Golpe de glitch |
| Hats | Colores corridos (el abierto dura más) |
| Tom | Espejo (máximo uno cada 600 ms) |
| Voces | Suben el "volumen" que mueve colores corridos, glitch y looks |
| Patrón A–D | Cambia el look, si se activa con **L** |

Teclas nuevas en la cámara: **J** música on/off, **L** looks con el patrón.

Si el coro se calla 4 segundos, la cámara vuelve sola a escuchar el bombo por el micrófono, como antes. La censura no cambia: todos los efectos van sobre el cuadro ya censurado.

## Estructura

| Carpeta / archivo | Qué es |
|---|---|
| `server.js` | Servidor sin dependencias: archivos, canciones y canal en vivo |
| `servidor/` | Guardado y limpieza de canciones (del coro original) |
| `comun/envivo.js` | Canal en vivo: BroadcastChannel en el mismo laptop + Server-Sent Events entre laptops |
| `hub/` | El cuarto, la TV y el menú (ver `hub/README.md`) |
| `coro/` | Copia del coro de tu amigo con personajes nuevos, estilo retro y `envivo-coro.js` |
| `camara/` | Copia de censura-p5 con `musica.js` |
| `envivo/` | Panel del show |
| `data/canciones/` | Las canciones guardadas (se crea sola) |

Los proyectos originales (`coro-alcantarilla` y `censura-p5`) no se tocaron.
