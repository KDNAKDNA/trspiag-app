"""Regenera libs/ml5.min.js a partir del ml5.min.js original de npm (ml5@1.4.0).

    python3 libs/patch-ml5.py ruta/al/ml5.min.js-original libs/ml5.min.js

Parches (solo afectan a faceMesh):
 1. Detector de caras elegible: window.ML5_FACE_DETECTOR = "full" usa el detector de largo alcance
    de MediaPipe (~2 m) en vez del "short" (~1 m) que ml5 trae fijo.
 2. Cuando una detección nueva se superpone con la región de la cara del cuadro anterior, gana la
    detección nueva (original: ganaba la región vieja → con movimiento rápido la malla quedaba atrás).
 3. Si el detector no encuentra ninguna cara, se siguen usando las regiones del cuadro anterior
    (original: se descartaba todo → caras perdidas en baja luz).
 4. Cada cara devuelta trae `tracked: true` si salió de la región del cuadro anterior y no de una
    detección nueva (puede ir atrasada si la cara se mueve rápido: el sketch lo trata como no confirmado).
"""
import sys

PATCHES = [
    ('MediaPipeFaceDetector,{modelType:"short",maxFaces:t.maxFaces',
     'MediaPipeFaceDetector,{modelType:(window.ML5_FACE_DETECTOR||"short"),maxFaces:t.maxFaces'),
    ('[o,a||[]].forEach((function(e){return e.forEach((function(e){(y=y.filter(',
     '[a||[],o].forEach((function(e){return e.forEach((function(e){(y=y.filter('),
    ('case 1:return 0===(s=g.sent()).length?(this.reset(),i.dispose(),[2,[]]):(o=s.map((function(e){return m.faceDetectionFrontDetectionToRoi(e,r)})),[3,3]);',
     'case 1:return s=g.sent(),o=s.map((function(e){return m.faceDetectionFrontDetectionToRoi(e,r)})),[3,3];'),
    ('case 3:return y=[],[a||[],o]',
     'case 3:return (a||[]).forEach((function(e){e.__prev=1})),y=[],[a||[],o]'),
    ('c.push({keypoints:f,box:p.locationData.relativeBoundingBox})',
     'c.push({keypoints:f,box:p.locationData.relativeBoundingBox,tracked:!!(u[h]&&u[h].__prev)})'),
]

src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()
for old, new in PATCHES:
    n = s.count(old)
    if n != 1:
        sys.exit(f"patch no aplicable ({n} coincidencias): {old[:60]}…")
    s = s.replace(old, new)
s += "\n;window.ML5_PATCHED_FULL_DETECTOR=true;\n"
open(dst, "w", encoding="utf-8").write(s)
print("ok:", dst)
