# models/

Modelos TensorFlow.js de MediaPipe usados por ml5 faceMesh (los mismos que ml5 descarga de tfhub.dev /
Kaggle). Copias tomadas del paquete npm `@vladmandic/human-models@3.0.4` (MIT), que los redistribuye.

| archivo | modelo | sha256 |
|---|---|---|
| facemesh.json | malla de 468 puntos (face_landmarks_detection/face_mesh) | `b60ca26f404724f43bd2b1575761d8265180e1f053cc0731caa68462927309e7` |
| facemesh.bin | malla de 468 puntos (face_landmarks_detection/face_mesh) | `3826da640b0a3021161605369ee6af293f75d518040355b960ec71a3390c1c0b` |
| facemesh-detection-short.json | detector de caras short (face_detection/short) | `39a0a802cee9aeacd430e35b819f3a77f1440ca94747388a4147185a0bda7a03` |
| facemesh-detection-short.bin | detector de caras short (face_detection/short) | `e9b69ee1c1f8cd33c58120bcd75bf8c56bfba20c880f447e9d293ec102059d4b` |
| facemesh-detection-full.json | detector de caras full (face_detection/full) | `1bdef3b5bfef3132ad5b625eca3493af01a373df4a3b2584fa250e5da16ed960` |
| facemesh-detection-full.bin | detector de caras full (face_detection/full) | `5c3f885a2fd36cb36a6e8bf96a902d9702d486dc76454536e7c15ba73c4e5b42` |

El sketch elige `facemesh-detection-full` o `-short` según `S.detector`.
