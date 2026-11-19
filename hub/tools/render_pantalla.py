"""Dibuja la pantalla del hub (estado inicial) como imagen PNG para la TV de Blender.

Usa el mismo layout.js y la misma fuente que el navegador, con texto en bits
(sin suavizado), para que la TV del cuarto muestre lo mismo que el hub.

Uso:  python3 tools/render_pantalla.py   (desde la carpeta hub)
Sale: textures/pantalla_hub.png (480x270) y textures/pantalla_hub_1920.png (x4, pixelada)
"""
import json, os, re
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
HUB = os.path.dirname(HERE)
src = open(os.path.join(HUB, "layout.js"), encoding="utf-8").read()
L = json.loads(re.search(r"window\.LAYOUT\s*=\s*(\{.*\})\s*;", src, re.S).group(1))
C = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in L["colors"].items()}
font = ImageFont.truetype(os.path.join(HUB, "fonts", L["font"]), L["fontSize"])
W, H, cw, ch = L["w"], L["h"], L["cellW"], L["cellH"]
THRESH = 110

img = Image.new("RGB", (W, H), C["bg"])


def text_mask(text, scale=1):
    """Máscara 1-bit del texto en la rejilla de celdas (como hub.js)."""
    m = Image.new("L", (len(text) * cw, ch), 0)
    d = ImageDraw.Draw(m)
    for i, c in enumerate(text):
        d.text((i * cw, 0), c, font=font, fill=255)
    m = m.point(lambda p: 255 if p > THRESH else 0)
    if scale != 1:
        m = m.resize((m.width * scale, m.height * scale), Image.NEAREST)
    return m


def put(text, col, row, color, scale=1):
    m = text_mask(text, scale)
    img.paste(Image.new("RGB", m.size, C[color]), (col * cw, row * ch), m)


def put_px(text, x, y, color, scale=1):
    m = text_mask(text, scale)
    img.paste(Image.new("RGB", m.size, C[color]), (x, y), m)


# título grande con sombra corrida (look circuit bending)
t = L["title"]
tw = len(t["text"]) * cw * t["scale"]
tx = (W - tw) // 2
put_px(t["text"], tx + 2, t["row"] * ch + 1, "magenta", t["scale"])
put_px(t["text"], tx, t["row"] * ch, "fg", t["scale"])

for ln in L["lines"]:
    col = (L["cols"] - len(ln["text"])) // 2 if ln.get("center") else ln.get("col", 0)
    put(ln["text"], col, ln["row"], ln["color"])

mn = L["menu"]
for i, it in enumerate(mn["items"]):
    row = mn["row"] + i
    sel = i == 0
    if sel:
        d = ImageDraw.Draw(img)
        d.rectangle([(mn["col"] - 1) * cw, row * ch, (L["cols"] - 3) * cw - 1, (row + 1) * ch - 1], fill=C["fg"])
    put("[" + it["key"] + "]", mn["col"] + mn["keyCol"], row, "inverseFg" if sel else "amber")
    put(it["name"], mn["col"] + mn["nameCol"], row, "inverseFg" if sel else "fg")
    if it["desc"]:
        put(it["desc"], mn["col"] + mn["descCol"], row, "inverseFg" if sel else "dim")

put(L["prompt"]["text"] + "_", L["prompt"]["col"], L["prompt"]["row"], "fg")
s = L["status"]
d = ImageDraw.Draw(img)
d.rectangle([0, s["row"] * ch, W - 1, (s["row"] + 1) * ch - 1], fill=C["dim"])
put(s["text"], 0, s["row"], "inverseFg")

out = os.path.join(HUB, "textures")
os.makedirs(out, exist_ok=True)
img.save(os.path.join(out, "pantalla_hub.png"))
img.resize((W * 4, H * 4), Image.NEAREST).save(os.path.join(out, "pantalla_hub_1920.png"))
print("ok", os.path.join(out, "pantalla_hub.png"))
