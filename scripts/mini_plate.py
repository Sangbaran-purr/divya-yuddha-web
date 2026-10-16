#!/usr/bin/env python3
"""MINI-GAMES-2 · the mini games' background — the game's MULLIGAN plate (owner ruling 2026-10-16), baked to WebP.

    python3 scripts/mini_plate.py [--game PATH] [--ref COMMIT]

Reads (read-only, via `git show`, so the game's working tree is never touched) the two plates of the game's mulligan
screen at the pinned game commit:
    assets/img/mulligan_plate_port.png   853x1844   (the game uses it below 1024 px wide)
    assets/img/mulligan_plate_wide.png   1536x1024  (from 1024 px wide)
and writes play/shared/:
    mull-port-480.webp, mull-port-853.webp, mull-wide-1024.webp, mull-wide-1536.webp
    plate.json   GENERATED: the game commit, each original's path + sha256, each written file's width, bytes and sha256.
Needs Python 3 + Pillow (with WebP). The tests pin the originals' sha256 against the game checkout at that commit.
"""
import argparse, hashlib, io, json, os, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "play", "shared")
REF = "ad978f0"          # the game commit the plates are taken from (MINI-GAMES-2 Smriti door, pushed 2026-10-16)
PLATES = {"port": ("assets/img/mulligan_plate_port.png", (853, 1844), [480, 853]),
          "wide": ("assets/img/mulligan_plate_wide.png", (1536, 1024), [1024, 1536])}
QUALITY = 78


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", default=os.environ.get("DY_GAME", os.path.join(HERE, "..", "..", "divya-yuddha")))
    ap.add_argument("--ref", default=REF)
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    meta = {"gameCommit": a.ref, "originals": {}, "files": {}}
    for kind, (rel, size, widths) in PLATES.items():
        raw = subprocess.run(["git", "-C", a.game, "show", a.ref + ":" + rel], check=True, capture_output=True).stdout
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        if img.size != size:
            sys.exit("%s is %s, expected %s" % (rel, img.size, size))
        meta["originals"][kind] = {"path": rel, "w": size[0], "h": size[1], "sha256": hashlib.sha256(raw).hexdigest()}
        for w in widths:
            name = "mull-%s-%d.webp" % (kind, w)
            p = os.path.join(OUT, name)
            img.resize((w, round(w * size[1] / size[0])), Image.LANCZOS).save(p, "WEBP", quality=QUALITY, method=6)
            b = open(p, "rb").read()
            meta["files"][name] = {"w": w, "bytes": len(b), "sha256": hashlib.sha256(b).hexdigest()}
            print("%-22s %7d bytes" % (name, len(b)))
    with open(os.path.join(OUT, "plate.json"), "w") as f:
        json.dump(meta, f, indent=1); f.write("\n")


if __name__ == "__main__":
    main()
