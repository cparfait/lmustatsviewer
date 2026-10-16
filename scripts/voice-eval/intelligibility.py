"""Intelligibilité : transcrit chaque WAV avec Whisper et calcule le taux d'erreur
de mots (WER) par voix. Indicateur objectif, ne remplace pas l'écoute.

Usage : python -I intelligibility.py <dossier_wav> <corpus.json> <modele_whisper> [--pylib <dossier>]

<dossier_wav>/<lang>/<NN>_<moteur>-<voix>.wav ; écrit <dossier_wav>/intelligibility.json.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402,F401

import argparse  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402
import unicodedata  # noqa: E402
import wave  # noqa: E402
from collections import defaultdict  # noqa: E402

import numpy as np  # noqa: E402

NUM = {
    "fr": {"trois": "3", "quatre": "4", "dix": "10", "deux": "2", "sept": "7", "neuf": "9"},
    "en": {"three": "3", "four": "4", "ten": "10", "two": "2", "seven": "7", "nine": "9"},
    "es": {"tres": "3", "cuatro": "4", "diez": "10", "dos": "2", "siete": "7", "nueve": "9"},
    "de": {"drei": "3", "vier": "4", "zehn": "10", "zwei": "2", "sieben": "7", "neun": "9"},
    "it": {"tre": "3", "quattro": "4", "dieci": "10", "due": "2", "sette": "7", "nove": "9"},
}


def norm(text, lang):
    t = unicodedata.normalize("NFKC", text.lower())
    t = re.sub(r"[^\w\s]", " ", t)
    words = [NUM[lang].get(w, w) for w in t.split()]
    return words


def wer(ref, hyp):
    d = list(range(len(hyp) + 1))
    for i in range(1, len(ref) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(hyp) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (ref[i - 1] != hyp[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(hyp)] / max(1, len(ref))


def load_16k(path):
    with wave.open(path, "rb") as w:
        sr, n = w.getframerate(), w.getnframes()
        a = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32768
    # Rééchantillonnage linéaire vers 16 kHz (suffisant pour la reconnaissance).
    m = int(len(a) * 16000 / sr)
    return np.interp(np.linspace(0, len(a) - 1, m), np.arange(len(a)), a).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wavdir")
    ap.add_argument("corpus")
    ap.add_argument("model")
    ap.add_argument("--pylib")
    args = ap.parse_args()
    if args.pylib:
        sys.path.append(args.pylib)
    from faster_whisper import WhisperModel

    corpus = json.load(open(args.corpus, encoding="utf-8"))
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    per_voice = defaultdict(list)
    rows = []
    for lang in corpus:
        d = os.path.join(args.wavdir, lang)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            m = re.match(r"(\d\d)_(.+)\.wav$", f)
            if not m:
                continue
            idx, voice = int(m.group(1)) - 1, m.group(2)
            ref = corpus[lang][idx]["text"]
            segs, _ = model.transcribe(load_16k(os.path.join(d, f)), language=lang, beam_size=5, vad_filter=False)
            hyp = " ".join(s.text for s in segs).strip()
            e = wer(norm(ref, lang), norm(hyp, lang))
            # CER sans espaces : insensible au découpage des mots composés (« Reifen schaden »).
            c = wer(list("".join(norm(ref, lang))), list("".join(norm(hyp, lang))))
            per_voice[(lang, voice)].append((e, c))
            rows.append({"lang": lang, "voice": voice, "idx": idx, "ref": ref, "hyp": hyp, "wer": round(e, 3), "cer": round(c, 3)})
        print(f"{lang} ok", flush=True)
    with open(os.path.join(args.wavdir, "intelligibility.json"), "w", encoding="utf-8") as fh:
        json.dump(rows, fh, ensure_ascii=False, indent=1)
    print(f"{'lang':4} {'voice':40} {'WER %':>6} {'CER %':>6} {'exactes':>8}")
    for (lang, voice), es in sorted(per_voice.items()):
        exact = sum(1 for e, _ in es if e == 0)
        w = 100 * sum(e for e, _ in es) / len(es)
        c = 100 * sum(c for _, c in es) / len(es)
        print(f"{lang:4} {voice:40} {w:6.1f} {c:6.1f} {exact:>5}/{len(es)}")


if __name__ == "__main__":
    main()
