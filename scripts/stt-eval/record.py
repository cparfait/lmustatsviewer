"""Enregistre les 40 phrases du banc avec ton micro (une par fichier).

Usage : python -I scripts/stt-eval/record.py [--out stt-eval/wav/moi] [--device N] [--list]

- Entrée : démarre l'enregistrement de la phrase affichée ; Entrée : l'arrête.
- r + Entrée : refaire la phrase précédente ; s + Entrée : passer ; q + Entrée : quitter.
- Reprend où tu t'es arrêté (les phrases déjà enregistrées sont sautées).
- `--list` : liste les micros (numéro à passer à `--device`).
Fichiers : <out>/<NN>.wav, mono 16 kHz 16 bits.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402

import argparse  # noqa: E402
import threading  # noqa: E402

import numpy as np  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join("stt-eval", "wav", "moi"))
    ap.add_argument("--device", type=int, default=None)
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    import sounddevice as sd

    if a.list:
        print(sd.query_devices())
        return
    dev = sd.query_devices(a.device, "input")
    sr = int(dev["default_samplerate"])
    print(f"Micro : {dev['name']} ({sr} Hz). Dossier : {a.out}\n")
    phrases = _boot.load_corpus()["phrases"]
    os.makedirs(a.out, exist_ok=True)
    i = 0
    while i < len(phrases):
        p = phrases[i]
        path = os.path.join(a.out, f"{p['id']}.wav")
        if os.path.exists(path):
            i += 1
            continue
        print(f"[{p['id']}/{len(phrases)}]  « {p['text']} »")
        cmd = input("  Entrée pour parler (r refaire la précédente, s passer, q quitter) : ").strip().lower()
        if cmd == "q":
            break
        if cmd == "s":
            i += 1
            continue
        if cmd == "r" and i > 0:
            prev = os.path.join(a.out, f"{phrases[i - 1]['id']}.wav")
            if os.path.exists(prev):
                os.remove(prev)
            i -= 1
            continue
        chunks = []
        stop = threading.Event()

        def cb(indata, frames, t, status):  # noqa: ARG001
            chunks.append(indata[:, 0].copy())

        with sd.InputStream(samplerate=sr, channels=1, dtype="float32", device=a.device, callback=cb):
            input("  … enregistrement — Entrée pour arrêter ")
            stop.set()
        x = np.concatenate(chunks) if chunks else np.zeros(1, np.float32)
        if sr != 16000:
            from math import gcd

            from scipy.signal import resample_poly

            g = gcd(sr, 16000)
            x = resample_poly(x, 16000 // g, sr // g).astype(np.float32)
        _boot.write_wav_16k(path, x)
        peak = float(np.max(np.abs(x))) if x.size else 0.0
        print(f"  ✓ {len(x) / 16000:.1f} s" + ("  ⚠ très faible, rapproche le micro" if peak < 0.05 else "") + "\n")
        i += 1
    done = sum(os.path.exists(os.path.join(a.out, f"{p['id']}.wav")) for p in phrases)
    print(f"{done}/{len(phrases)} phrases enregistrées dans {a.out}")


if __name__ == "__main__":
    main()
