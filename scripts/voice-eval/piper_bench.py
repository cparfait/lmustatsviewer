"""Banc Piper : même protocole que l'app (worker `--json-input` persistant, priorité
« sous la normale », sans fenêtre console), sur le corpus radio.

Usage :
  python -I piper_bench.py <piper.exe> <corpus.json> <dossier_sortie> <lang>=<voix.onnx> [...] [--tag idle]

Chaque voix : un worker, une phrase d'échauffement, puis les 10 phrases (latence =
écriture de la ligne JSON → WAV complet sur disque, comme `tts.rs`).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402,F401

import argparse  # noqa: E402
import json  # noqa: E402
import shutil  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402
import time  # noqa: E402
import wave  # noqa: E402

CREATE_NO_WINDOW = 0x08000000
BELOW_NORMAL_PRIORITY_CLASS = 0x00004000


def wav_seconds(path):
    with wave.open(path, "rb") as w:
        return w.getnframes() / w.getframerate()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("piper")
    ap.add_argument("corpus")
    ap.add_argument("out")
    ap.add_argument("voices", nargs="+")
    ap.add_argument("--tag", default="idle")
    ap.add_argument("--no-wav", action="store_true")
    args = ap.parse_args()

    corpus = json.load(open(args.corpus, encoding="utf-8"))
    results = []
    for spec in args.voices:
        lang, model = spec.split("=", 1)
        # Locuteur facultatif : « fr=chemin.onnx#1 » (modèles multi-locuteurs).
        model, _, spk = model.partition("#")
        voice = os.path.basename(model)[: -len(".onnx")] + (f"-spk{spk}" if spk else "")
        tmp = tempfile.mkdtemp(prefix="piper_bench_")
        t0 = time.perf_counter()
        proc = subprocess.Popen(
            [args.piper, "--model", model, "--json-input", "--output_dir", tmp],
            cwd=os.path.dirname(args.piper),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS,
        )

        def say(text):
            req = {"text": text, **({"speaker_id": int(spk)} if spk else {})}
            proc.stdin.write((json.dumps(req) + "\n").encode("utf-8"))
            proc.stdin.flush()
            line = proc.stdout.readline().decode("utf-8", "replace").strip()
            return line

        say("ok")
        load_s = time.perf_counter() - t0
        for i, item in enumerate(corpus[lang]):
            ti = time.perf_counter()
            path = say(item["text"])
            infer_ms = (time.perf_counter() - ti) * 1000
            dur = wav_seconds(path)
            results.append({
                "tag": args.tag, "engine": "piper", "model": "", "threads": "", "lang": lang, "voice": voice,
                "idx": i, "key": item["key"], "text": item["text"], "infer_ms": round(infer_ms, 1),
                "audio_s": round(dur, 3), "rtf": round(infer_ms / 1000 / dur, 3), "load_s": round(load_s, 2),
            })
            if not args.no_wav:
                d = os.path.join(args.out, lang)
                os.makedirs(d, exist_ok=True)
                shutil.copyfile(path, os.path.join(d, f"{i + 1:02d}_piper-{voice}.wav"))
        proc.stdin.close()
        proc.wait(timeout=10)
        shutil.rmtree(tmp, ignore_errors=True)
        print(f"{lang}/{voice} ok (chargement {load_s:.2f} s)", flush=True)

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, f"piper-{args.tag}.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
