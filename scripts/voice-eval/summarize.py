"""Résumé des mesures (médiane / p90 de latence, RTF) par moteur × modèle × threads × voix.

Usage : python -I summarize.py <mesures.json> [...]
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402,F401

import json  # noqa: E402
import statistics as st  # noqa: E402
from collections import defaultdict  # noqa: E402


def pct(v, p):
    v = sorted(v)
    return v[min(len(v) - 1, int(round(p * (len(v) - 1))))]


rows = []
for path in sys.argv[1:]:
    rows += json.load(open(path, encoding="utf-8"))

groups = defaultdict(list)
for r in rows:
    k = (r.get("tag", ""), r["engine"], r.get("model", ""), r.get("threads", ""), r["lang"], r["voice"])
    groups[k].append(r)

print(f"{'cond':6} {'engine':7} {'model':22} {'thr':>3} {'lang':4} {'voice':34} {'med ms':>7} {'p90 ms':>7} {'RTF':>5} {'audio s':>7}")
for k, rs in sorted(groups.items(), key=lambda kv: [str(x) for x in kv[0]]):
    lat = [r["infer_ms"] + r.get("g2p_ms", 0) for r in rs]
    rtf = st.median(r["rtf"] for r in rs)
    aud = st.median(r["audio_s"] for r in rs)
    print(f"{k[0]:6} {k[1]:7} {k[2]:22} {k[3]!s:>3} {k[4]:4} {k[5]:34} {st.median(lat):7.0f} {pct(lat, 0.9):7.0f} {rtf:5.2f} {aud:7.2f}")
