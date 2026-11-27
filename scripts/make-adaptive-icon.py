#!/usr/bin/env python3
"""
make-adaptive-icon.py
Paints the two layers of SYPH's Android adaptive icon (app.json > android.adaptiveIcon) from the picture of the four people that
used to be the splash image (assets/images/splash_icon_new.png):

  assets/images/android-icon-foreground.png   the picture, 700 px square, centred on a transparent 1024 px canvas
  assets/images/android-icon-background.png   the same picture filled to the canvas, blurred and darkened

Android draws the 108 dp canvas through a mask (circle, rounded square, ...) that shows only the middle 72 dp. 700 / 1024 is a
little more than that, so the picture fills the visible shape, and all four faces lie well inside it. The background shows only at
the edges while the launcher moves the icon. Run it again if the picture changes:

    python3 scripts/make-adaptive-icon.py

Needs Python 3 with Pillow.
"""

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "assets" / "images"
CANVAS = 1024
PICTURE = 700


def main():
    source = Image.open(IMAGES / "splash_icon_new.png").convert("RGB")

    foreground = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    tile = source.resize((PICTURE, PICTURE), Image.LANCZOS).convert("RGBA")
    foreground.paste(tile, ((CANVAS - PICTURE) // 2, (CANVAS - PICTURE) // 2))
    foreground.save(IMAGES / "android-icon-foreground.png", optimize=True)

    background = source.resize((CANVAS, CANVAS), Image.LANCZOS).filter(ImageFilter.GaussianBlur(45))
    ImageEnhance.Brightness(background).enhance(0.35).save(IMAGES / "android-icon-background.png", optimize=True)
    print("wrote android-icon-foreground.png and android-icon-background.png")


if __name__ == "__main__":
    main()
