# libs/

Copias locales para funcionar sin internet. Origen: registro de npm.

| archivo | paquete npm | licencia | sha256 |
|---|---|---|---|
| p5.min.js | p5@1.11.1 (`lib/p5.min.js`, sin cambios) | LGPL-2.1 | `2dbe3fbaf46e43ec61d65fd614cb4300e38b1bc2dc4c0885b4c627d77503c1df` |
| ml5.min.js | ml5@1.4.0 (`dist/ml5.min.js`, **parcheado**) | MIT | `4694bc1f3b6351d18164a208921ee77a2f1d61a2da0cb3f7bcadd24a9a211734` |

ml5.min.js original (sin parchear): sha256 `5facbc15115a5f0277f0e99e634ffe606f5382c9efd72d5092d9701aaaf680c5`.

## Parches a ml5 (solo faceMesh)
Se aplican con `patch-ml5.py` (falla si algún texto no coincide exactamente una vez):

1. **Detector de largo alcance.** ml5 usa siempre el detector "short" de MediaPipe (caras dentro de ~1 m:
   en las pruebas no detecta caras de menos del ~10 % del ancho del cuadro). Con
   `window.ML5_FACE_DETECTOR = "full"` usa el detector "full" (~2 m: detecta desde ~4.7 %).
   El sketch lo activa si ve `window.ML5_PATCHED_FULL_DETECTOR`; con una ml5 sin parche vuelve solo a "short".
2. Detección nueva gana sobre la región del cuadro anterior cuando se superponen.
3. Si el detector no encuentra caras, se siguen usando las regiones del cuadro anterior.
4. Cada cara trae `tracked: true` si salió de la región del cuadro anterior.

Los parches 2–4 solo importan con `S.roiTracking = true` (por defecto está en `false`).

Para regenerar: `npm pack ml5@1.4.0`, descomprimir, y
`python3 libs/patch-ml5.py package/dist/ml5.min.js libs/ml5.min.js`.
