"""Banc de reconnaissance vocale : Vosk (actuel), Parakeet v3 (sherpa-onnx), Whisper.

Usage :
  python -I scripts/stt-eval/bench.py run --engine <vosk|parakeet|whisper|whisper-p>
         --model <dossier> --wav <racine> --out <résultats.json> [--threads 2]
  python -I scripts/stt-eval/bench.py report <résultats.json>... [--md <fichier.md>]

<racine> : dossier contenant des sous-dossiers de WAV <NN>.wav (ex. stt-eval/wav/synth).
Chaque moteur tourne dans son propre processus, en priorité « sous la normale », avec une
phrase d'échauffement : le délai mesuré est celui qui suit la fin de la prise de parole
(l'audio entier est disponible au relâchement, comme dans l'app).
`whisper-p` : Whisper avec une amorce de vocabulaire (noms de virage, jargon), seule aide
que Parakeet ne sait pas recevoir.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402

import argparse  # noqa: E402
import glob  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402
import time  # noqa: E402
import unicodedata  # noqa: E402

import numpy as np  # noqa: E402

# ── Normalisation (identique pour la référence et la transcription) ──────────

NUM = {
    "zero": 0, "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6, "sept": 7,
    "huit": 8, "neuf": 9, "dix": 10, "onze": 11, "douze": 12, "treize": 13, "quatorze": 14, "quinze": 15,
    "seize": 16, "vingt": 20, "vingts": 20, "trente": 30, "quarante": 40, "cinquante": 50, "soixante": 60,
    "cent": 100, "cents": 100,
}


def _numbers(words):
    """Suites de nombres en lettres → chiffres (« quatre vingt treize » → 93)."""
    out, cur, open_ = [], 0, False

    def flush():
        nonlocal cur, open_
        if open_:
            out.append(str(cur))
        cur, open_ = 0, False

    for i, w in enumerate(words):
        nxt = words[i + 1] if i + 1 < len(words) else ""
        if w == "et" and open_ and nxt in NUM:
            continue
        if w not in NUM:
            flush()
            out.append(w)
            continue
        v = NUM[w]
        if not open_:
            cur, open_ = v, True
        elif v == 100:
            cur = max(cur, 1) * 100
        elif v == 20 and cur % 100 == 4:
            cur = cur - 4 + 80
        elif cur % 100 in (60, 80) and v < 20:
            cur += v
        elif cur % 100 == 10 and 7 <= v <= 9:
            cur += v
        elif cur % 10 == 0 and cur % 100 >= 20 and v < 10:
            cur += v
        elif cur % 100 == 0 and cur >= 100 and v < 100:
            cur += v
        else:
            flush()
            cur, open_ = v, True
    flush()
    return out


LANG = "fr"
PERCENT = {"en": " percent ", "es": " por ciento ", "de": " prozent ", "it": " per cento "}


def norm_chars(text):
    """Autres langues : lettres seules (mots composés allemands tolérés), chiffres en lettres.
    Les erreurs se comptent alors par caractère (CER), pas par mot."""
    from num2words import num2words

    t = text.lower().replace("%", PERCENT.get(LANG, " "))
    t = re.sub(r"\d+", lambda m: " " + num2words(int(m.group(0)), lang=LANG) + " ", t)
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c))
    return list(re.sub(r"[^a-z]+", "", t))


def norm(text):
    if LANG != "fr":
        return norm_chars(text)
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.replace("%", " pour cent ").replace("’", "'")
    t = re.sub(r"(\d)[.,](\d)", r"\1 virgule \2", t)
    t = re.sub(r"\banti[\s-]+", "anti", t)  # « anti-roulis » = « antiroulis »
    t = re.sub(r"[^a-z0-9]+", " ", t)
    t = re.sub(r"\bpourcent\b", "pour cent", t)
    words = _numbers([w for w in t.split() if w])
    # Pluriel et accord simples (après les nombres : « trois » n'est pas un pluriel) :
    # « stands », « pluies », « rentrent » ne sont pas des erreurs de sens.
    keep = lambda w: w.isdigit() or w in NUM  # noqa: E731
    words = [w[:-1] if not keep(w) and len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in words]
    words = [w[:-2] if not keep(w) and len(w) > 5 and w.endswith("nt") and w[:-2].endswith("e") else w for w in words]
    return words


def wer(ref, hyp):
    d = list(range(len(hyp) + 1))
    for i in range(1, len(ref) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(hyp) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (ref[i - 1] != hyp[j - 1]))
            prev = cur
    return d[len(hyp)] / max(1, len(ref))


def key_found(key, hyp_words):
    k = norm(key)
    h = hyp_words
    return any(h[i : i + len(k)] == k for i in range(len(h) - len(k) + 1))


# ── Moteurs ─────────────────────────────────────────────────────────────────

PROMPT = (
    "Radio d'ingénieur de course, Le Mans Ultimate. Tertre Rouge, virages Porsche, Arnage, "
    "Indianapolis, Parabolica, Lesmo, Eau Rouge, Bus Stop. Antipatinage, barre antiroulis, "
    "répartiteur de freinage, undercut, relais, pneus pluie, medium, stand, la quatorze, la cinquante et un."
)


def make_engine(name, model, threads):
    if name == "vosk":
        import vosk

        vosk.SetLogLevel(-1)
        m = vosk.Model(model)

        def run(x):
            rec = vosk.KaldiRecognizer(m, 16000)
            rec.SetWords(True)
            rec.AcceptWaveform((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
            r = json.loads(rec.FinalResult())
            confs = [w["conf"] for w in r.get("result", [])]
            return r.get("text", ""), (float(np.mean(confs)) if confs else None)

        return run
    if name == "parakeet":
        import sherpa_onnx

        f = lambda p: glob.glob(os.path.join(model, p))[0]  # noqa: E731
        rec = sherpa_onnx.OfflineRecognizer.from_transducer(
            encoder=f("encoder*.onnx"), decoder=f("decoder*.onnx"), joiner=f("joiner*.onnx"),
            tokens=f("tokens.txt"), num_threads=threads, model_type="nemo_transducer",
            decoding_method="greedy_search")

        def run(x):
            s = rec.create_stream()
            s.accept_waveform(16000, x)
            rec.decode_stream(s)
            return s.result.text, None

        return run
    if name in ("whisper", "whisper-p"):
        from faster_whisper import WhisperModel

        m = WhisperModel(model, device="cpu", compute_type="int8", cpu_threads=threads)
        prompt = PROMPT if name == "whisper-p" else None

        def run(x):
            segs, _ = m.transcribe(x, language=LANG, beam_size=1, vad_filter=False,
                                   condition_on_previous_text=False, initial_prompt=prompt)
            segs = list(segs)
            text = " ".join(s.text.strip() for s in segs)
            lp = [s.avg_logprob for s in segs]
            return text, (float(np.exp(np.mean(lp))) if lp else None)

        return run
    raise SystemExit(f"moteur inconnu : {name}")


def cmd_run(a):
    global LANG
    LANG = a.lang
    _boot.below_normal_priority()
    corpus = {p["id"]: p for p in _boot.load_corpus(lang=LANG)["phrases"]}
    files = sorted(glob.glob(os.path.join(a.wav, "**", "*.wav"), recursive=True))
    t0 = time.perf_counter()
    eng = make_engine(a.engine, a.model, a.threads)
    load_s = time.perf_counter() - t0
    eng(_boot.read_wav_16k(files[0]))  # échauffement
    rows = []
    for path in files:
        pid = os.path.splitext(os.path.basename(path))[0]
        if pid not in corpus:
            continue
        x = _boot.read_wav_16k(path)
        w0, c0 = time.perf_counter(), time.process_time()
        text, conf = eng(x)
        wall, cpu = time.perf_counter() - w0, time.process_time() - c0
        ref = corpus[pid]
        rw, hw = norm(ref["text"]), norm(text)
        rows.append({
            "file": os.path.relpath(path, a.wav).replace("\\", "/"), "id": pid, "cat": ref["cat"],
            "ref": ref["text"], "hyp": text, "conf": conf, "audio_s": len(x) / 16000,
            "wall_s": wall, "cpu_s": cpu, "wer": wer(rw, hw), "exact": rw == hw,
            "keys": len(ref["keys"]), "keys_ok": sum(key_found(k, hw) for k in ref["keys"]),
        })
        print(f"{a.engine:9} {rows[-1]['file']:28} {wall * 1000:6.0f} ms  wer {rows[-1]['wer']:.2f}  {text}")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump({"engine": a.engine, "lang": LANG, "model": a.model, "threads": a.threads, "load_s": load_s, "rows": rows},
                  fh, ensure_ascii=False, indent=1)


def summarize(rows):
    pct = lambda xs: 100.0 * sum(xs) / max(1, len(xs))  # noqa: E731
    walls = sorted(r["wall_s"] for r in rows)
    return {
        "n": len(rows),
        "wer": 100.0 * float(np.mean([r["wer"] for r in rows])) if rows else 0.0,
        "exact": pct([r["exact"] for r in rows]),
        "keys": 100.0 * sum(r["keys_ok"] for r in rows) / max(1, sum(r["keys"] for r in rows)),
        "p50_ms": 1000 * walls[len(walls) // 2] if walls else 0.0,
        "p95_ms": 1000 * walls[min(len(walls) - 1, int(0.95 * len(walls)))] if walls else 0.0,
        "cpu_per_audio": sum(r["cpu_s"] for r in rows) / max(1e-9, sum(r["audio_s"] for r in rows)),
    }


def rescore(d):
    """Recalcule erreurs et mots-clés depuis les textes gardés (normalisation à jour)."""
    global LANG
    LANG = d.get("lang", "fr")
    corpus = {p["id"]: p for p in _boot.load_corpus(lang=LANG)["phrases"]}
    for r in d["rows"]:
        ref = corpus[r["id"]]
        rw, hw = norm(ref["text"]), norm(r["hyp"])
        r["wer"], r["exact"] = wer(rw, hw), rw == hw
        r["keys"], r["keys_ok"] = len(ref["keys"]), sum(key_found(k, hw) for k in ref["keys"])
    return d


def cmd_report(a):
    lines = []
    data = [rescore(json.load(open(p, encoding="utf-8"))) for p in a.results]
    cond = lambda f: f.split("/")[0] if "/" in f else "voix"  # noqa: E731
    conds = sorted({cond(r["file"]) for d in data for r in d["rows"]})
    lines.append("| Moteur | Condition | Phrases | Erreurs par mot (WER) | Phrases exactes | Mots-clés compris | Délai p50 | Délai p95 | CPU / s d'audio |")
    lines.append("|---|---|---:|---:|---:|---:|---:|---:|---:|")
    for d in data:
        for c in conds + ["(tout)"]:
            rows = [r for r in d["rows"] if c == "(tout)" or cond(r["file"]) == c]
            if not rows:
                continue
            s = summarize(rows)
            lines.append(f"| {d['engine']} | {c} | {s['n']} | {s['wer']:.1f} % | {s['exact']:.0f} % | {s['keys']:.0f} % | "
                         f"{s['p50_ms']:.0f} ms | {s['p95_ms']:.0f} ms | {s['cpu_per_audio']:.2f} |")
    lines.append("")
    cats = sorted({r["cat"] for d in data for r in d["rows"]})
    lines.append("| Moteur | " + " | ".join(cats) + " |")
    lines.append("|---|" + "---:|" * len(cats))
    for d in data:
        cells = []
        for cat in cats:
            rows = [r for r in d["rows"] if r["cat"] == cat]
            cells.append(f"{summarize(rows)['keys']:.0f} %" if rows else "—")
        lines.append(f"| {d['engine']} | " + " | ".join(cells) + " |")
    lines.append("")
    lines.append("Chargement du modèle : " + ", ".join(f"{d['engine']} {d['load_s']:.1f} s" for d in data))
    text = "\n".join(lines)
    print(text)
    if a.md:
        with open(a.md, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--engine", required=True)
    r.add_argument("--model", required=True)
    r.add_argument("--wav", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--threads", type=int, default=2)
    r.add_argument("--lang", default="fr")
    p = sub.add_parser("report")
    p.add_argument("results", nargs="+")
    p.add_argument("--md")
    a = ap.parse_args()
    cmd_run(a) if a.cmd == "run" else cmd_report(a)


if __name__ == "__main__":
    main()
