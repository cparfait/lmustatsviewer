"""Tableau Markdown de synthèse : latence (repos, charge 6 et 12 threads) +
intelligibilité (CER Whisper) par voix.

Usage : python -I report_table.py <dossier_data>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402,F401

import glob  # noqa: E402
import json  # noqa: E402
import statistics as st  # noqa: E402
from collections import defaultdict  # noqa: E402

d = sys.argv[1]
lat = defaultdict(list)  # (voice, tag) -> ms
for path in glob.glob(os.path.join(d, "*-*.json")):
    name = os.path.basename(path)
    if name.startswith("intelligibility"):
        continue
    for r in json.load(open(path, encoding="utf-8")):
        if r["engine"] == "kokoro" and not (r["model"] == "model.onnx" and r["threads"] == 2):
            continue
        v = f"{r['engine']}-{r['voice']}"
        lat[(r["lang"], v, r.get("tag", "idle"))].append(r["infer_ms"] + r.get("g2p_ms", 0))

cer = defaultdict(list)
for path in glob.glob(os.path.join(d, "intelligibility*.json")):
    for r in json.load(open(path, encoding="utf-8")):
        cer[(r["lang"], r["voice"])].append(r["cer"])

voices = sorted({(k[0], k[1]) for k in lat} | set(cer))


def med(lang, v, tag):
    x = lat.get((lang, v, tag))
    return f"{st.median(x):.0f}" if x else "—"


print("| Langue | Voix | Repos (ms) | Charge 6 thr (ms) | Charge 12 thr (ms) | Erreurs Whisper (CER) |")
print("|---|---|---:|---:|---:|---:|")
for lang, v in voices:
    c = cer.get((lang, v))
    cs = f"{100 * sum(c) / len(c):.1f} %" if c else "—"
    print(f"| {lang} | {v} | {med(lang, v, 'idle')} | {med(lang, v, 'load6')} | {med(lang, v, 'load')} | {cs} |")
