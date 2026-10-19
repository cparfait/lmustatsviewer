"""Essai : Parakeet (sherpa-onnx) avec une liste de mots favorisés (noms de virage, jargon).

Usage : python -I scripts/stt-eval/hotwords_try.py <dossier_parakeet> <dossier_wav> [--score 2.0]

L'archive ne fournit pas le vocabulaire BPE qu'exige l'encodage des mots favorisés : on
le dérive de `tokens.txt` (scores nuls). Compare greedy, beam sans liste et beam + liste.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402

import argparse  # noqa: E402
import glob  # noqa: E402
import tempfile  # noqa: E402
import time  # noqa: E402

import bench  # noqa: E402

HOT = [
    "Tertre Rouge", "virages Porsche", "Arnage", "Indianapolis", "Parabolica", "Lesmo", "Eau Rouge",
    "Bus Stop", "antipatinage", "antiroulis", "répartiteur", "undercut", "relais", "medium", "pneus pluie",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("wav")
    ap.add_argument("--score", type=float, default=2.0)
    a = ap.parse_args()
    import sherpa_onnx

    f = lambda p: glob.glob(os.path.join(a.model, p))[0]  # noqa: E731
    tmp = tempfile.mkdtemp()
    vocab = os.path.join(tmp, "bpe.vocab")
    with open(f("tokens.txt"), encoding="utf-8") as src, open(vocab, "w", encoding="utf-8") as dst:
        for line in src:
            tok = line.rsplit(" ", 1)[0]
            dst.write(f"{tok}\t0\n")
    hot = os.path.join(tmp, "hot.txt")
    with open(hot, "w", encoding="utf-8") as fh:
        fh.write("\n".join(HOT) + "\n")
    base = dict(encoder=f("encoder*.onnx"), decoder=f("decoder*.onnx"), joiner=f("joiner*.onnx"),
                tokens=f("tokens.txt"), num_threads=2, model_type="nemo_transducer")
    variants = {
        "greedy": dict(decoding_method="greedy_search"),
        "beam": dict(decoding_method="modified_beam_search", max_active_paths=4),
        "beam+mots": dict(decoding_method="modified_beam_search", max_active_paths=4, hotwords_file=hot,
                          hotwords_score=a.score, modeling_unit="bpe", bpe_vocab=vocab),
    }
    corpus = {p["id"]: p for p in _boot.load_corpus()["phrases"]}
    files = sorted(glob.glob(os.path.join(a.wav, "*.wav")))
    for name, kw in variants.items():
        try:
            rec = sherpa_onnx.OfflineRecognizer.from_transducer(**base, **kw)
        except Exception as e:  # noqa: BLE001
            print(f"{name}: refusé ({e})")
            continue
        ok = tot = 0
        ms = []
        for p in files:
            pid = os.path.splitext(os.path.basename(p))[0]
            ref = corpus[pid]
            if ref["cat"] not in ("virage", "jargon"):
                continue
            s = rec.create_stream()
            s.accept_waveform(16000, _boot.read_wav_16k(p))
            t0 = time.perf_counter()
            rec.decode_stream(s)
            ms.append((time.perf_counter() - t0) * 1000)
            hw = bench.norm(s.result.text)
            k = sum(bench.key_found(x, hw) for x in ref["keys"])
            ok, tot = ok + k, tot + len(ref["keys"])
            print(f"  {name:10} {pid} {k}/{len(ref['keys'])} {s.result.text}")
        print(f"{name}: mots-clés {ok}/{tot}, délai médian {sorted(ms)[len(ms) // 2]:.0f} ms\n")


if __name__ == "__main__":
    main()
