#!/usr/bin/env python3
"""
make-hue-icons.py
Paints the 12 launcher icons the colour wheel chooses from (assets/images/hue-icons/hue000.png ... hue330.png).

Each one is the SYPH logo of assets/images/Cyber.png (a single colour on black) with the logo recoloured to the accent for that
hue. The accents come from src/utils/accentColor.ts (`hueIconAccents`), the same function the app uses for its own colours, so an
icon and the app match. Run it again only if the logo or the colour rules change:

    python3 scripts/make-hue-icons.py

Needs Python 3 with Pillow and numpy, and Node 22.18 or newer (it reads the TypeScript file directly).
The icons are 512 x 512: Android shrinks them to 192 at most.
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "images" / "Cyber.png"
OUT = ROOT / "assets" / "images" / "hue-icons"
SIZE = 512
BACKGROUND = np.array([0, 0, 0], dtype=np.float64)  # Cyber.png's black


def accents():
    script = "import('./src/utils/accentColor.ts').then((m) => console.log(JSON.stringify(m.hueIconAccents())))"
    done = subprocess.run(["node", "-e", script], cwd=ROOT, capture_output=True, text=True)
    if done.returncode != 0:
        sys.exit(f"could not read the accents from accentColor.ts:\n{done.stderr}")
    return json.loads(done.stdout)


def hex_rgb(value):
    value = value.lstrip("#")
    return np.array([int(value[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)


def main():
    source = np.asarray(Image.open(SOURCE).convert("RGB"), dtype=np.float64)
    # The logo colour of the source: the brightest pixels, which are all the same flat colour.
    brightness = source.sum(axis=2)
    logo = np.median(source[brightness >= np.percentile(brightness, 99)], axis=0)
    # How much of each pixel is logo (0 = black, 1 = logo colour). A smooth step removes the speckle the source image has
    # around its edges and keeps the soft edge of the shapes.
    amount = np.clip(((source - BACKGROUND) @ (logo - BACKGROUND)) / float((logo - BACKGROUND) @ (logo - BACKGROUND)), 0, 1)
    amount = np.clip((amount - 0.06) / (0.94 - 0.06), 0, 1)
    amount = amount * amount * (3 - 2 * amount)

    OUT.mkdir(parents=True, exist_ok=True)
    for entry in accents():
        accent = hex_rgb(entry["accent"])
        painted = BACKGROUND + amount[..., None] * (accent - BACKGROUND)
        image = Image.fromarray(np.clip(painted + 0.5, 0, 255).astype(np.uint8), "RGB").resize((SIZE, SIZE), Image.LANCZOS)
        image.save(OUT / f"{entry['name']}.png", optimize=True)
        print(f"{entry['name']}  hue {entry['hue']:>3}  {entry['accent']}")


if __name__ == "__main__":
    main()
