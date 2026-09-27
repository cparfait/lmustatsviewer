#!/usr/bin/env python3
"""
Génère les contours de circuits du site (site/assets/tracks.js) à partir des
enregistrements de télémétrie du jeu (.duckdb de UserData/Telemetry).

- Clé = `TrackLayout` écrit par le jeu (le tracé exact) : un contour n'est jamais
  affiché sur une autre variante (règle « aucune donnée à tracé erroné »).
- Position = GPS Latitude / Longitude, rangées par distance au tour (Lap Dist) en
  300 tranches, moyennées sur tous les tours → tracé propre, départ en tranche 0.
- Un tracé dont moins de 95 % des tranches sont couvertes (tour incomplet) est rejeté.
- Les contours déjà présents (appris en jeu) sont conservés.

Usage : python scripts/tracks-from-telemetry.py "<...>/UserData/Telemetry" site/assets/tracks.js
Nécessite : pip install duckdb
"""
import glob
import json
import math
import os
import re
import sys

import duckdb

BUCKETS = 300
MIN_COVERAGE = 0.95


def channel(con, name):
    return [r[0] for r in con.execute(f'SELECT value FROM "{name}"').fetchall()]


def load(path):
    con = duckdb.connect(path, read_only=True)
    meta = dict(con.execute("SELECT * FROM metadata").fetchall())
    lat, lon, dist = channel(con, "GPS Latitude"), channel(con, "GPS Longitude"), channel(con, "Lap Dist")
    con.close()
    return meta.get("TrackLayout") or meta.get("TrackName"), lat, lon, dist


def outline(samples):
    """samples : [(lap_dist, lat, lon)] de tous les fichiers d'un même tracé."""
    length = max(d for d, _, _ in samples)
    if length < 1000:
        return None
    acc = [[0.0, 0.0, 0] for _ in range(BUCKETS)]
    for d, la, lo in samples:
        if d is None or la is None or lo is None or d < 0:
            continue
        b = min(BUCKETS - 1, int(d / length * BUCKETS))
        acc[b][0] += la
        acc[b][1] += lo
        acc[b][2] += 1
    pts = [(a[0] / a[2], a[1] / a[2]) for a in acc if a[2] > 0]
    if len(pts) < BUCKETS * MIN_COVERAGE:
        return None
    lat0 = sum(p[0] for p in pts) / len(pts)
    xs = [(p[1]) * math.cos(math.radians(lat0)) * 111320 for p in pts]
    ys = [-(p[0]) * 110540 for p in pts]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    w, h = maxx - minx, maxy - miny
    if w <= 0 or h <= 0:
        return None
    s = 180 / max(w, h)
    ox, oy = 10 + (180 - w * s) / 2, 10 + (180 - h * s) / 2
    d = [f"{'M' if i == 0 else 'L'}{(x - minx) * s + ox:.1f} {(y - miny) * s + oy:.1f}" for i, (x, y) in enumerate(zip(xs, ys))]
    return " ".join(d) + " Z"


def main(tele_dir, out_js):
    groups = {}
    for f in glob.glob(os.path.join(tele_dir, "*.duckdb")):
        try:
            layout, lat, lon, dist = load(f)
        except Exception as e:  # fichier en cours d'écriture, format inattendu…
            print("ignoré :", os.path.basename(f), e)
            continue
        if not layout or not lat or not dist:
            continue
        n = len(lat)
        # Canaux à fréquences différentes : on aligne par position relative.
        samples = [(dist[min(len(dist) - 1, i * len(dist) // n)], lat[i], lon[i]) for i in range(n)]
        groups.setdefault(layout, []).extend(samples)

    existing = {}
    if os.path.exists(out_js):
        src = open(out_js, encoding="utf-8").read()
        existing = dict(re.findall(r'^\s*"([^"]+)":\s*"([^"]+)",?$', src, re.M))

    for layout, samples in groups.items():
        path = outline(samples)
        if path is None:
            print("rejeté (tour incomplet) :", layout)
            continue
        if layout in existing:
            print("déjà présent (conservé) :", layout)
            continue
        existing[layout] = path
        print("ajouté :", layout)

    body = "".join(f"  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v)},\n" for k, v in sorted(existing.items()))
    open(out_js, "w", encoding="utf-8", newline="\n").write(
        "// Contours réels des circuits (appris en jeu / tirés de la télémétrie), normalisés dans\n"
        "// un carré 200×200, par TRACÉ exact (`TrackLayout` / `track_course` du jeu).\n"
        "// Généré par scripts/tracks-from-telemetry.py — ne pas éditer à la main.\n"
        "// eslint-disable-next-line no-unused-vars\n"
        "const TRACK_PATHS = {\n" + body + "};\n"
    )


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
