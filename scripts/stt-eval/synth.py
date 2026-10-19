"""Audio de synthèse du banc : les 40 phrases dites par des voix Piper, en propre puis
avec un bruit de moteur (premier tri, avant les vrais enregistrements).

Usage : python -I scripts/stt-eval/synth.py <piper.exe> <dossier_voix> [--out stt-eval/wav/synth]

Voix : tom (fr.onnx, masculine, 44,1 kHz), siwis (féminine), upmc/pierre (masculine).
Sorties : <out>/<conditions>/<voix>/<NN>.wav, conditions = propre, bruit10 (RSB 10 dB),
bruit5 (RSB 5 dB). Le bruit est synthétique (harmoniques d'un moteur dont le régime
monte et descend + souffle rose) : il imite un habitacle, ce n'est pas un vrai son de jeu.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402

import argparse  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402

import numpy as np  # noqa: E402

VOICES = {
    "fr": [("tom", "fr.onnx", None), ("siwis", "fr_FR-siwis-medium.onnx", None), ("pierre", "fr_FR-upmc-medium.onnx", 1)],
    "en": [("ryan", "en.onnx", None), ("alan", "en_GB-alan-medium.onnx", None)],
    "es": [("davefx", "es.onnx", None), ("claude", "es_MX-claude-high.onnx", None)],
    "de": [("thorsten", "de.onnx", None), ("eva", "de_DE-eva_k-x_low.onnx", None)],
    "it": [("paola", "it_IT-paola-medium.onnx", None)],
}
SNR_DB = {"bruit10": 10.0, "bruit5": 5.0}


def engine_noise(n, seed):
    """Bruit d'habitacle : moteur (fondamentale 90-160 Hz qui varie, 8 harmoniques) + rose."""
    rng = np.random.default_rng(seed)
    t = np.arange(n) / 16000.0
    f0 = 125 + 35 * np.sin(2 * np.pi * 0.15 * t + rng.uniform(0, 6.28))
    phase = 2 * np.pi * np.cumsum(f0) / 16000.0
    eng = sum((0.6 / k) * np.sin(k * phase + rng.uniform(0, 6.28)) for k in range(1, 9))
    white = rng.standard_normal(n)
    spec = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(n, 1 / 16000.0)
    spec[1:] /= np.sqrt(freqs[1:])
    pink = np.fft.irfft(spec, n)
    pink /= np.std(pink) + 1e-9
    x = eng / (np.std(eng) + 1e-9) + 0.7 * pink
    return (x / (np.std(x) + 1e-9)).astype(np.float32)


def mix(speech, snr_db, seed):
    """Mélange au rapport signal/bruit voulu (puissance de la parole active)."""
    active = speech[np.abs(speech) > 0.02 * np.max(np.abs(speech))]
    p_s = float(np.mean(active**2)) if active.size else float(np.mean(speech**2))
    noise = engine_noise(len(speech), seed)
    k = np.sqrt(p_s / (10 ** (snr_db / 10)))
    out = speech + k * noise
    peak = np.max(np.abs(out))
    return out / peak * 0.9 if peak > 0.99 else out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("piper")
    ap.add_argument("voices", nargs="+", help="dossiers de voix (le premier qui contient le modèle)")
    ap.add_argument("--lang", default="fr")
    ap.add_argument("--out", default=os.path.join("stt-eval", "wav", "synth"))
    a = ap.parse_args()
    phrases = _boot.load_corpus(lang=a.lang)["phrases"]
    find = lambda m: next(os.path.join(d, m) for d in a.voices if os.path.exists(os.path.join(d, m)))  # noqa: E731
    with tempfile.TemporaryDirectory() as tmp:
        for name, model, spk in VOICES[a.lang]:
            for p in phrases:
                raw = os.path.join(tmp, f"{name}_{p['id']}.wav")
                cmd = [a.piper, "--model", find(model), "--output_file", raw]
                if spk is not None:
                    cmd += ["--speaker", str(spk)]
                subprocess.run(cmd, input=p["text"].encode("utf-8"), check=True, capture_output=True,
                               cwd=os.path.dirname(a.piper))
                x = _boot.read_wav_16k(raw)
                # 0,3 s de silence avant et après, comme une prise push-to-talk
                pad = np.zeros(int(0.3 * 16000), np.float32)
                x = np.concatenate([pad, x, pad])
                _boot.write_wav_16k(os.path.join(a.out, "propre", name, f"{p['id']}.wav"), x)
                for cond, snr in SNR_DB.items():
                    seed = int(p["id"]) * 100 + len(name)
                    _boot.write_wav_16k(os.path.join(a.out, cond, name, f"{p['id']}.wav"), mix(x, snr, seed))
            print(f"{name} : {len(phrases)} phrases × {1 + len(SNR_DB)} conditions")


if __name__ == "__main__":
    main()
