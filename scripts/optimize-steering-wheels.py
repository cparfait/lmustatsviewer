#!/usr/bin/env python3
"""Génère les volants optimisés (public/steering_wheels/*.webp).

Source : les PNG de volants par voiture de la V1 / LMU Telemetry Lab (~45 Mo,
trop lourds pour l'app auto-update). On les redimensionne à 256 px et on les
encode en WebP (transparence conservée) → ~0,5 Mo pour ~36 voitures.

Les noms de fichiers sont « slugifiés » (minuscules, non-alphanum → « - ») pour
correspondre au slug calculé côté frontend à partir de `car_model`
(cf. `src/components/telemetry/SteeringWheel.tsx`).

Usage : python scripts/optimize-steering-wheels.py [dossier_source_png]
Défaut source : la V1 PHP locale.
"""
import os
import re
import sys
import glob
from PIL import Image

DEFAULT_SRC = r"C:/tmp/__DEV__/OLDLMU_Stats_Viewer_095/htdocs/live/steering_wheels"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "steering_wheels")


def slug(name: str) -> str:
    s = re.sub(r"\.png$", "", name, flags=re.I).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    if not os.path.isdir(src):
        print(f"Dossier source introuvable : {src}")
        sys.exit(1)
    os.makedirs(OUT, exist_ok=True)
    total_in = total_out = 0
    count = 0
    for p in sorted(glob.glob(os.path.join(src, "*.png"))):
        im = Image.open(p).convert("RGBA")
        im.thumbnail((256, 256), Image.LANCZOS)
        dst = os.path.join(OUT, slug(os.path.basename(p)) + ".webp")
        im.save(dst, "WEBP", quality=82, method=6)
        total_in += os.path.getsize(p)
        total_out += os.path.getsize(dst)
        count += 1
    print(f"{count} volants | {total_in/1e6:.1f} Mo -> {total_out/1e6:.2f} Mo -> {OUT}")


if __name__ == "__main__":
    main()
