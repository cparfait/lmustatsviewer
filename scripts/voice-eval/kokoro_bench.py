"""Banc Kokoro-82M (ONNX) : synthétise le corpus radio et mesure la latence CPU.

Usage :
  python -I kokoro_bench.py <dossier_kokoro> <corpus.json> <dossier_sortie> [--threads 1,2,4]
         [--models model.onnx,model_quantized.onnx] [--tag idle]

<dossier_kokoro> = copie du dépôt « Kokoro-82M-v1.0-ONNX » (onnx/, voices/, tokenizer.json).
Phonétisation par espeak-ng (comme le ferait une intégration Rust qui réutilise
l'espeak-ng déjà livré avec Piper), y compris en anglais (pas de dictionnaire misaki).
Écrit les WAV (16 bits, 24 kHz) et un `kokoro-<tag>.json` de mesures.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402,F401

import argparse  # noqa: E402
import json  # noqa: E402
import time  # noqa: E402
import wave  # noqa: E402

import numpy as np  # noqa: E402
import onnxruntime as ort  # noqa: E402
from misaki import espeak  # noqa: E402

# Voix Kokoro retenues par langue (pas d'allemand dans Kokoro v1.0).
VOICES = {
    "fr": [("fr-fr", "ff_siwis")],
    "en": [("en-gb", "bm_george"), ("en-gb", "bm_lewis"), ("en-us", "am_michael"), ("en-us", "af_heart")],
    "es": [("es", "em_alex"), ("es", "ef_dora")],
    "it": [("it", "im_nicola"), ("it", "if_sara")],
}
SR = 24000


def write_wav(path, audio):
    pcm = np.clip(audio, -1.0, 1.0)
    pcm = (pcm * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kokoro")
    ap.add_argument("corpus")
    ap.add_argument("out")
    ap.add_argument("--threads", default="1,2,4")
    ap.add_argument("--models", default="model.onnx,model_quantized.onnx")
    ap.add_argument("--tag", default="idle")
    ap.add_argument("--no-wav", action="store_true")
    ap.add_argument("--below-normal", action="store_true")
    args = ap.parse_args()
    if args.below_normal:
        _boot.below_normal_priority()

    corpus = json.load(open(args.corpus, encoding="utf-8"))
    vocab = json.load(open(os.path.join(args.kokoro, "tokenizer.json"), encoding="utf-8"))["model"]["vocab"]
    g2ps = {}
    results = []

    for model_name in args.models.split(","):
        for threads in [int(t) for t in args.threads.split(",")]:
            so = ort.SessionOptions()
            so.intra_op_num_threads = threads
            so.inter_op_num_threads = 1
            t0 = time.perf_counter()
            sess = ort.InferenceSession(os.path.join(args.kokoro, "onnx", model_name), so, providers=["CPUExecutionProvider"])
            load_s = time.perf_counter() - t0
            for lang, voices in VOICES.items():
                for esp_lang, voice in voices:
                    style_all = np.fromfile(os.path.join(args.kokoro, "voices", voice + ".bin"), dtype=np.float32).reshape(-1, 1, 256)
                    g2p = g2ps.setdefault(esp_lang, espeak.EspeakG2P(language=esp_lang))
                    # Échauffement (premier passage plus lent : allocations ORT).
                    ids = [0] + [vocab[c] for c in g2p("ok")[0] if c in vocab] + [0]
                    sess.run(None, {"input_ids": np.array([ids], dtype=np.int64), "style": style_all[len(ids) - 2], "speed": np.array([1.0], dtype=np.float32)})
                    for i, item in enumerate(corpus[lang]):
                        tg = time.perf_counter()
                        phon = g2p(item["text"])[0]
                        g2p_ms = (time.perf_counter() - tg) * 1000
                        toks = [vocab[c] for c in phon if c in vocab][:510]
                        ids = [0] + toks + [0]
                        ti = time.perf_counter()
                        audio = sess.run(None, {
                            "input_ids": np.array([ids], dtype=np.int64),
                            "style": style_all[len(toks)],
                            "speed": np.array([1.0], dtype=np.float32),
                        })[0][0]
                        infer_ms = (time.perf_counter() - ti) * 1000
                        dur = len(audio) / SR
                        results.append({
                            "tag": args.tag, "engine": "kokoro", "model": model_name, "threads": threads, "lang": lang,
                            "voice": voice, "idx": i, "key": item["key"], "text": item["text"], "phonemes": phon,
                            "g2p_ms": round(g2p_ms, 1), "infer_ms": round(infer_ms, 1),
                            "audio_s": round(dur, 3), "rtf": round(infer_ms / 1000 / dur, 3), "load_s": round(load_s, 2),
                        })
                        # Un seul jeu de WAV : modèle fp32, 1er nombre de threads (identiques sinon).
                        is_ref = model_name == args.models.split(",")[0] and threads == int(args.threads.split(",")[0])
                        if not args.no_wav and (is_ref or model_name != args.models.split(",")[0] and threads == int(args.threads.split(",")[0])):
                            d = os.path.join(args.out, lang)
                            os.makedirs(d, exist_ok=True)
                            suffix = "" if is_ref else "-int8"
                            write_wav(os.path.join(d, f"{i + 1:02d}_kokoro-{voice}{suffix}.wav"), audio)
                    print(f"{model_name} t={threads} {lang}/{voice} ok", flush=True)

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, f"kokoro-{args.tag}.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
