#!/usr/bin/env python3
"""M-F1 / M-F1b asset derivatives. Masters in docs/design/mf/ (+ the game-repo faction
crest sheet) stay untouched; web-weight derivatives written to assets/brand/mf/.

DEFECT-1 fix: the four balance medallions + the runway hourglass are re-cut with a
RIM-TIGHT hard circle — the transparent circle hugs the medallion's outer gold rim, zero
background pixels outside it, no halo, no square edges.
DEFECT-2 fix: four faction-crest derivatives (Deva/Asura/Vanara/Naga) from the game repo's
already-transparent crest art, replacing the balance medallions in the sidebar card."""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs/design/mf")
OUT = os.path.join(ROOT, "assets/brand/mf")
GAME = os.path.expanduser("~/Projects/divya-yuddha/assets/img")  # READ-ONLY cross-repo crests
os.makedirs(OUT, exist_ok=True)

def gold_bbox(rgb, step=2):
    """tight bbox of the BRIGHT GOLD rim (excludes the dark drop-shadow + the grey bg)."""
    px = rgb.load()
    w, h = rgb.size
    minx, miny, maxx, maxy = w, h, 0, 0
    found = False
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b = px[x, y]
            # bright, SATURATED warm gold (cream/tan bg is bright but desaturated -> excluded)
            sat = max(r, g, b) - min(r, g, b)
            if r > 150 and g > 110 and r - b > 60 and sat > 70 and (r + g) > 300:
                found = True
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    return (minx, miny, maxx, maxy) if found else None


def rim_circle(crop, out_size, shrink=0.975):
    """isolate the medallion as a transparent circle cut a step INSIDE the gold rim's outer edge
    (M-F1c: the outermost ~2-3% of radius is shaved so the cut lands on solid gold — background
    residue is then geometrically impossible; the rim still reads as a complete gold ring)."""
    rgb = crop.convert("RGB")
    w, h = rgb.size
    bb = gold_bbox(rgb)
    if not bb:
        bb = (0, 0, w, h)
    cx = (bb[0] + bb[2]) / 2
    cy = (bb[1] + bb[3]) / 2
    # the gold rim IS the outer boundary; radius = half the gold extent (drop shadow is not gold, so excluded)
    rad = max(bb[2] - bb[0], bb[3] - bb[1]) / 2 * shrink
    s = int(rad * 2)
    box = (int(cx - rad), int(cy - rad), int(cx - rad) + s, int(cy - rad) + s)
    sq = crop.convert("RGBA").crop(box)
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))  # 1px antialias only, no halo
    sq.putalpha(mask)
    return sq.resize((out_size, out_size), Image.LANCZOS)


def crest_derivative(path, out_size):
    """trim a transparent crest to its content and fit into a square canvas (natural shape)."""
    im = Image.open(path).convert("RGBA")
    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    w, h = im.size
    s = max(w, h)
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((s - w) // 2, (s - h) // 2))
    return canvas.resize((out_size, out_size), Image.LANCZOS)


# ---- DEFECT 1: four balance medallions (from the 4-medallion master) ----
med = Image.open(os.path.join(SRC, "mf_header_citadel.png")).convert("RGB")
W, H = med.size
names = ["liquid", "vesting", "staked", "rewards"]
# each medallion sits in a horizontal quarter, vertically in the upper band
for i, name in enumerate(names):
    x0 = int(W * (i + 0.04) / 4)
    x1 = int(W * (i + 0.96) / 4)
    y0 = int(H * 0.20)
    y1 = int(H * 0.74)
    icon = rim_circle(med.crop((x0, y0, x1, y1)), 256)
    icon.save(os.path.join(OUT, f"icon_{name}.png"))
    print("icon_%s.png" % name)

# ---- DEFECT 1: runway hourglass dial (same saturated-gold-rim cut; crop tight to exclude the drop-shadow) ----
hg = Image.open(os.path.join(SRC, "mf_icon_runway_hourglass.png")).convert("RGB")
W, H = hg.size
RUNWAY_SHRINK = 0.78  # inside the round frame's gold (M-F1c inset), on solid gold at the perimeter
dial = hg.crop((int(W * 0.12), int(H * 0.17), int(W * 0.88), int(H * 0.63)))
dg = dial.convert("L").load()
dw, dh = dial.size
xs, ys = [], []
for y in range(0, dh, 2):
    for x in range(0, dw, 2):
        if dg[x, y] < 68: xs.append(x); ys.append(y)  # dial's near-black outer ring
cx = (min(xs) + max(xs)) // 2
cy = (min(ys) + max(ys)) // 2
rad = int(max(max(xs) - min(xs), max(ys) - min(ys)) / 2 * RUNWAY_SHRINK)
cy -= int(rad * 0.05)  # the bottom lotus pulls the bbox centre down; nudge back up so the circle is symmetric
sq = dial.convert("RGBA").crop((cx - rad, cy - rad, cx + rad, cy + rad))
s = sq.size[0]
m = Image.new("L", (s, s), 0)
ImageDraw.Draw(m).ellipse((0, 0, s - 1, s - 1), fill=255)
sq.putalpha(m.filter(ImageFilter.GaussianBlur(0.6)))
sq.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, "icon_runway.png"))
print("icon_runway.png")

# ---- DEFECT 2: four faction crests (canonical order) ----
for src, dst in [("crest_devas", "crest_deva"), ("crest_asuras", "crest_asura"),
                 ("crest_vanaras", "crest_vanara"), ("crest_nagas", "crest_naga")]:
    p = os.path.join(GAME, src + ".png")
    crest_derivative(p, 160).save(os.path.join(OUT, dst + ".png"))
    print("%s.png" % dst)


# ---- proof montage: every icon over a PURE DARK swatch at 2x ----
def montage(files, path, cell=110, scale=2):
    sheet = Image.new("RGBA", (len(files) * cell * scale + 20, cell * scale + 20), (16, 14, 10, 255))
    for i, f in enumerate(files):
        im = Image.open(os.path.join(OUT, f)).convert("RGBA").resize((cell * scale, cell * scale), Image.LANCZOS)
        sheet.alpha_composite(im, (10 + i * cell * scale, 10))
    sheet.convert("RGB").save(path)


montage(["icon_liquid.png", "icon_vesting.png", "icon_staked.png", "icon_rewards.png", "icon_runway.png"], "/tmp/mf_medallions.png")
montage(["crest_deva.png", "crest_asura.png", "crest_vanara.png", "crest_naga.png"], "/tmp/mf_crests.png")
print("montages: /tmp/mf_medallions.png /tmp/mf_crests.png")
