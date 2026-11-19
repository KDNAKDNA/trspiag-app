# TRANSPARENCIA — app de performance en vivo

Una sola app que junta dos proyectos que ya existen:

- **Coro** (proyecto de un amigo, carpeta `coro-alcantarilla`): instrumento musical en el navegador con cinco
  voces de grave a agudo, secuenciador de 16 pasos, sinte y batería sintetizada.
- **Cámara** (carpeta `censura-p5`): proyección en vivo que censura las caras de los músicos con efectos y looks.

Las une un **hub 3D** hecho en Blender, con estética de TV análoga, circuit bending y computador viejo.
La idea central: **la música que se hace en el Coro es la que dispara los visuales de la Cámara**, como un VJ automático.

---

## 1. Qué hace la app

Es un instrumento y una máquina de visuales para tocar en vivo.

- **Componer y tocar** con el Coro: canto en vivo con el puntero o el teclado, patrones A–D, sinte y batería.
- **Proyectar** la cámara con las caras censuradas, con los mismos estilos, efectos y looks que ya existen.
- **Conectar los dos:** cada evento musical viaja a la Cámara y la hace reaccionar al instante.

### Cómo se conectan (ya existe en el código)

El secuenciador del Coro guarda cada evento en la cola `visQ`, sincronizada con el reloj de audio:
`{type:"note", ci, midi, t}` (canta una voz), `{type:"dhit", i}` (suena un tambor), `{type:"ph"/"dph", row, idx}` (avanza un paso).
La app reenvía esos eventos en tiempo real a la Cámara. Ya no hace falta adivinar el bombo con el micrófono: la Cámara sabe exactamente qué sonó.

| Evento musical | Reacción en la Cámara |
|---|---|
| Bombo | Salto de color (estilo 4) y pulso. Se mantiene el límite de 3 cambios por segundo por epilepsia fotosensible |
| Caja / palmas | Corte de glitch (franjas que se corren) |
| Hats | Estática y scanlines; el abierto deja una estela |
| Tom | Espejo momentáneo |
| Nota de cada voz | Cada voz tiene su color; la altura de la nota mueve los colores corridos y el tamaño del logo |
| Voz más grave (bajo) | Distorsión de la imagen tipo onda de TV mal sintonizada |
| Cambio de patrón A–D | Cambia el look (fotocopia, película, mina, semitono espejo, papel doblado) |
| BPM y swing | Velocidad de las estelas y del parpadeo de la TV |
| Play / Stop | Al parar, la imagen se congela con ruido de "sin señal" |

El micrófono queda como **respaldo**: si se cae la conexión, la Cámara vuelve a detectar el bombo como hoy.

---

## 2. Quién la usa

**Nosotros tres, tocando en vivo en el evento**, cada uno con su laptop:

| Laptop | Rol | Módulo |
|---|---|---|
| 1 | Batería | Coro, panel de batería |
| 2 | Voces y sinte | Coro, voces y sinte |
| 3 | Visuales | Cámara + proyector |

El **público** solo ve la proyección. No es (todavía) una app para que la use cualquier persona.

---

## 3. Elementos 3D y estética

### El hub (Blender → web)

Un cuarto oscuro y un poco inquietante, iluminado por un tubo fluorescente verdoso que titila.
Cada opción del menú es un objeto del cuarto:

| Objeto | Opción |
|---|---|
| Televisor CRT gigante en el centro, con el logo "Transparencia" en la pantalla | **EN VIVO** |
| Estante con las cinco figuras del coro | **COMPONER** |
| Caja de ritmos destripada, con la placa y los cables a la vista | **BATERÍA** |
| Cámara de video vieja sobre un trípode | **CÁMARA** |
| Archivador de casetes VHS | **CANCIONES** |
| Maraña de cables que salen del televisor | **CONECTAR** |

Se modela en Blender, se exporta a `.glb` y se muestra en el navegador con three.js y un filtro de pantalla CRT encima.

### Texturas y materiales

- **TV análoga:** scanlines, ruido de nieve, sangrado de color, desfase RGB, rodado vertical, tracking de VHS y viñeta de vidrio curvo.
- **Circuit bending:** franjas que se corren, colores que se rompen, cuadros repetidos y placas de circuito con LEDs y soldaduras.
- **Materiales:** plástico beige amarillento, madera falsa de los TV de los 80, vidrio curvo, metal oxidado y cinta aislante.
- **Colores:** base negra, gris y beige. El texto en fósforo verde o ámbar. Los colores saturados de las voces solo aparecen en los glitches.

### Lo uncanny

- Los objetos respiran apenas con la música, aunque no haya nada sonando fuerte.
- Los ojos de las figuras siguen el cursor; a veces se quedan mirando a la cámara un segundo de más.
- La TV a veces muestra un cuadro que no debería estar ahí y desaparece.
- Silencios de sonido con la imagen congelada.

### Los personajes del coro: las Tortugas del Dragón y la Rata Cósmica

Personajes propios, que reemplazan a las figuras del código original (mismo motor, mismos registros):

| Voz | Personaje (propuesta) | Diseño |
|---|---|---|
| Bajo | **La Rata Cósmica** (jefe) | Casco espacial rayado, antena que suelta estática, ojos de pantalla verde |
| Barítono | **Tortuga Ceniza** | Caparazón de escamas de dragón negras, cuernos cortos, humo |
| Tenor | **Tortuga Cuerno** | Cuernos largos, escamas rojas oxidadas |
| Contralto | **Tortuga Circuito** | Caparazón con placa de circuito y LEDs |
| Soprano | **Tortuga Chispa** | Pequeña, escamas que brillan con cada nota |

Sin bandanas: el color de cada voz está en las escamas y en las luces del caparazón. Los nombres son propuesta y se pueden cambiar.

### Logo

Se usa el texto **"Transparencia"** del logo. La figura que lo acompaña no se usa en el hub.

---

## 4. Qué ve la persona en pantalla

### Arranque
Pantalla negra de computador viejo: texto que se escribe solo (`TRANSPARENCIA OS v1.0 ... CARGANDO VOCES ... OK`), un pitido y la TV se enciende.

### Hub
El cuarto 3D con un menú grande en fuente de computador viejo (tipo DOS/VGA, monoespaciada y en mayúsculas):

```
[1] EN VIVO   [2] COMPONER   [3] BATERÍA
[4] CÁMARA    [5] CANCIONES  [6] CONECTAR
```

Al pasar el mouse por un objeto se ilumina y aparece su nombre. Se entra con clic o con el número.

### Dentro de cada módulo
- **COMPONER / BATERÍA:** el Coro con su interfaz, con texto y estilos de computador viejo, y una barra superior: `<- HUB`, BPM, patrón y estado de conexión.
- **CÁMARA:** la ventana del proyector a pantalla completa y la ventana de control con el HUD.
- **EN VIVO:** panel de los tres laptops con una luz de `SEÑAL` cada uno, BPM compartido, el último evento que llegó y el look activo.

### Reglas de diseño
- Todo el texto en español, corto y en mayúsculas: `GRABAR`, `PARAR`, `SIN SEÑAL`.
- Botones grandes y pocas opciones por pantalla.
- `F1 AYUDA` siempre visible, con la guía de teclas sencilla (como `GUIA-TECLAS.txt`).

---

## 5. Qué puede hacer la persona

- **Laptop 1 y 2 (música):** tocar en vivo, programar patrones, encadenar A–D, ajustar sinte y efectos, y guardar y abrir canciones. Todo lo que ya hace el Coro.
- **Laptop 3 (visuales):**
  - Elegir estilos de censura, efectos y looks, igual que hoy.
  - Decidir qué eventos musicales controlan qué efecto, con interruptores simples en el control.
  - Grabar el show.
- **Todos:**
  - Conectarse a la sesión con un solo botón.
  - Ver que los demás estén conectados.
  - Volver al hub en cualquier momento.
  - Botón de emergencia: `B`, todo borroso.

---

## 6. Qué se comparte entre usuarios

Se comparte **todo**, en la red local del evento:

- **Reloj y tempo:** un solo BPM y un solo Play/Stop para los tres.
- **Eventos musicales en vivo:** notas y golpes viajan a la Cámara al instante.
- **Canciones y patrones:** una biblioteca común en el servidor; lo que guarda uno lo abren los otros.
- **Estado de los visuales:** look y efectos activos, visibles en el panel EN VIVO.
- **Grabaciones del show:** se guardan en una carpeta común.
- **Fotos de caras y ajustes** de la Cámara.

---

## Cómo se arma (técnico, resumido)

- **Servidor:** una app de Node.js con Express corre en un laptop. Los demás entran por la red local (`http://IP-DEL-LAPTOP:3000`).
  - Monta el Coro con `createCoroRouter` en `/coro/` (ya está hecho como módulo para esto).
  - Sirve la Cámara en `/camara/`.
  - Sirve el hub en `/`.
  - Usa WebSocket en `/live` para reenviar eventos, tempo y estado.
- Cada módulo vive en **su propia página**, porque el Coro y la Cámara usan p5 en modo global.
- **Hub:** three.js con el `.glb` de Blender y un shader de CRT. Todo local, para que funcione sin internet como hoy funciona la Cámara.

## Pendientes y cuidados

- **Red del evento:** mejor un router propio que el wifi del lugar.
- **Rendimiento:** confirmar que la Cámara siga a 30 fps recibiendo eventos (es lo crítico).
- **Censura:** la prioridad sigue siendo que ninguna cara quede visible nunca. Los efectos se aplican sobre el cuadro ya censurado.
- **Epilepsia:** no bajar el límite de 3 cambios de color por segundo, aunque la música vaya más rápido.
- **Fotos de caras:** usar solo fotos de personas que hayan dado permiso.
- **Personajes:** confirmar nombres y diseño de las Tortugas del Dragón y la Rata Cósmica.
