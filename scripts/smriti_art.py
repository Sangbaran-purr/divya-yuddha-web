#!/usr/bin/env python3
"""MINI-GAMES-2 · SMRITI — the board art, baked from the owner's two originals (never modified).

    python3 scripts/smriti_art.py [--land PATH] [--port PATH]

Needs Python 3 + Pillow (with WebP). Reads:
  --land  the desktop/landscape board (default ~/Desktop/DY_smriti_board.png, 1672x941)
  --port  the phone/portrait board    (default ~/Desktop/DY_smriti_board_portrait.png, 941x1672)
Writes play/smriti/art/:
  board-land-{960,1280,1672}.webp   the landscape art, three widths
  board-port-{480,720,941}.webp     the portrait art, three widths, with the four faction emblems BAKED into its empty
                                    corner rings (cropped from the landscape art, same corners, masked to a circle)
  geometry.js                       GENERATED: every measured edge (art px) the page and the tests read — the inner navy
                                    field, the safe card area inside it, the banners and their text zones, the rings and
                                    the emblems — plus the sha256 of each original and each written file.

The measurements are the ones taken from the originals (see the comments by each number); the script re-checks the
emblems' and rings' fit and refuses to write if an emblem would not sit inside its ring.
"""
import argparse, hashlib, json, os, sys
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "play", "smriti", "art")

# ── measured on the originals (art px) ──
LAND = {
    "size": [1672, 941],
    # the inner navy field: the frame's inner edge, scanned outward from the field's interior (consensus of six rows/columns)
    "field": [191, 148, 1463, 758],
    # the card area: the field inset 30 px — clear of the chamfered, ornamented corners
    "safe": [221, 178, 1433, 728],
    # the red top banner and the purple bottom banner; each has a gold medallion at its centre (x 836, ~50 px each side),
    # so text sits in the zone left and the zone right of it
    "bannerTop": [300, 36, 1380, 124], "bannerBottom": [270, 780, 1410, 868],
    "zonesTop": [[316, 36, 772, 124], [900, 36, 1364, 124]],
    "zonesBottom": [[290, 780, 772, 868], [900, 780, 1390, 868]],
    # the four faction emblem discs (centre, radius incl. the thin gold rim) — top-left water, top-right flame,
    # bottom-left leaf, bottom-right serpent
    "emblems": {"tl": [193, 134, 38], "tr": [1478, 131, 38], "bl": [140, 771, 38], "br": [1532, 771, 38]},
}
PORT = {
    "size": [941, 1672],
    "field": [85, 188, 857, 1439],
    "safe": [115, 218, 827, 1409],
    # the dark-blue banners; each carries a gold medallion at its centre (x 470, ~45 px each side)
    "bannerTop": [176, 94, 766, 170], "bannerBottom": [176, 1460, 766, 1540],
    "zonesTop": [[188, 94, 422, 170], [518, 94, 754, 170]],
    "zonesBottom": [[188, 1460, 422, 1540], [518, 1460, 754, 1540]],
    # the four EMPTY corner rings: centre and the radius of the ring's inner gold edge
    "rings": {"tl": [88, 146, 53], "tr": [855, 145, 53], "bl": [89, 1476, 53], "br": [855, 1477, 53]},
}
EMBLEM_R = 48     # the baked emblem's radius in the portrait: inside the ring's inner edge (53) with a dark hairline gap
LAND_W = [960, 1280, 1672]
PORT_W = [480, 720, 941]
QUALITY = 82


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 16), b""): h.update(b)
    return h.hexdigest()


def disc(img, cx, cy, r, out_r):
    """crop a disc of radius r around (cx, cy), scale it to radius out_r, return RGBA with a soft circular mask"""
    s = 4  # supersampled mask for a clean edge
    box = (cx - r, cy - r, cx + r, cy + r)
    crop = img.crop(box).convert("RGBA").resize((out_r * 2, out_r * 2), Image.LANCZOS)
    m = Image.new("L", (out_r * 2 * s, out_r * 2 * s), 0)
    ImageDraw.Draw(m).ellipse([0, 0, out_r * 2 * s - 1, out_r * 2 * s - 1], fill=255)
    m = m.resize((out_r * 2, out_r * 2), Image.LANCZOS)
    crop.putalpha(m)
    return crop


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--land", default=os.path.expanduser("~/Desktop/DY_smriti_board.png"))
    ap.add_argument("--port", default=os.path.expanduser("~/Desktop/DY_smriti_board_portrait.png"))
    a = ap.parse_args()
    land = Image.open(a.land).convert("RGB"); port = Image.open(a.port).convert("RGB")
    if list(land.size) != LAND["size"] or list(port.size) != PORT["size"]:
        sys.exit("the originals are not the measured sizes (%s, %s) — re-measure before baking" % (land.size, port.size))
    for k in ("tl", "tr", "bl", "br"):
        if EMBLEM_R >= PORT["rings"][k][2]:
            sys.exit("emblem %s would not sit inside its ring" % k)
    os.makedirs(OUT, exist_ok=True)
    # the portrait with its four emblems baked in (a NEW image: the original file is never written)
    baked = port.convert("RGBA")
    emb = {}
    for k in ("tl", "tr", "bl", "br"):
        ex, ey, er = LAND["emblems"][k]; rx, ry, rr = PORT["rings"][k]
        d = disc(land, ex, ey, er, EMBLEM_R)
        baked.alpha_composite(d, (rx - EMBLEM_R, ry - EMBLEM_R))
        emb[k] = {"from": [ex, ey, er], "to": [rx, ry, EMBLEM_R], "ring": [rx, ry, rr]}
    baked = baked.convert("RGB")
    files = {}
    for w in LAND_W:
        p = os.path.join(OUT, "board-land-%d.webp" % w)
        land.resize((w, round(w * LAND["size"][1] / LAND["size"][0])), Image.LANCZOS).save(p, "WEBP", quality=QUALITY, method=6)
        files[os.path.basename(p)] = {"w": w, "bytes": os.path.getsize(p), "sha256": sha(p)}
    for w in PORT_W:
        p = os.path.join(OUT, "board-port-%d.webp" % w)
        baked.resize((w, round(w * PORT["size"][1] / PORT["size"][0])), Image.LANCZOS).save(p, "WEBP", quality=QUALITY, method=6)
        files[os.path.basename(p)] = {"w": w, "bytes": os.path.getsize(p), "sha256": sha(p)}
    geo = {"land": LAND, "port": dict(PORT, emblems=emb), "emblemR": EMBLEM_R, "files": files,
           "originals": {"land": {"name": os.path.basename(a.land), "sha256": sha(a.land)},
                         "port": {"name": os.path.basename(a.port), "sha256": sha(a.port)}}}
    js = ("/* GENERATED by scripts/smriti_art.py — do not edit by hand; re-run the script. The measured board geometry\n"
          "   (art px) and the baked files. UMD: browser window.DY_SMRITI_ART, Node require. */\n"
          "(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.DY_SMRITI_ART = f(); })"
          "(typeof self !== 'undefined' ? self : this, function () {\n  return " + json.dumps(geo, indent=1) + ";\n});\n")
    with open(os.path.join(OUT, "geometry.js"), "w") as f: f.write(js)
    for n, v in sorted(files.items()): print("%-24s %7d bytes" % (n, v["bytes"]))


if __name__ == "__main__":
    main()
