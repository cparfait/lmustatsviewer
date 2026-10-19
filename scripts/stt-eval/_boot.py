"""Amorce commune des scripts du banc de reconnaissance vocale.

Les scripts tournent en `python -I` (mode isolé : ni dossier courant ni variables
d'environnement dans le chemin d'import, par prudence vis-à-vis des modèles
téléchargés passés en argument). Les bibliothèques du banc (vosk, sherpa-onnx,
faster-whisper, sounddevice) sont installées à part, dans `PYLIB` (hors du dépôt et
du Python de l'utilisateur) : on l'ajoute au chemin, puis le site-packages utilisateur.
"""

import os
import site
import sys

PYLIB = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "stt-eval", "pylib")
MODELS = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "stt-eval", "models")

if os.path.isdir(PYLIB) and PYLIB not in sys.path:
    sys.path.insert(0, PYLIB)
_user = site.getusersitepackages()
if _user not in sys.path:
    sys.path.append(_user)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


def below_normal_priority():
    """Passe le processus courant en priorité « sous la normale » (comme l'écoute dans l'app)."""
    if sys.platform == "win32":
        import ctypes

        k32 = ctypes.windll.kernel32
        k32.SetPriorityClass(k32.GetCurrentProcess(), 0x00004000)


def load_corpus(path=None, lang="fr"):
    """Corpus du banc : `corpus.json` (40 phrases, français) ou, pour une autre langue,
    les 20 phrases traduites de `corpus_xx.json`."""
    import json

    here = os.path.dirname(os.path.abspath(__file__))
    if lang != "fr" and path is None:
        with open(os.path.join(here, "corpus_xx.json"), encoding="utf-8") as f:
            return {"lang": lang, "phrases": json.load(f)[lang]}
    path = path or os.path.join(here, "corpus.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def read_wav_16k(path):
    """WAV → float32 mono 16 kHz (rééchantillonné si besoin)."""
    import wave

    import numpy as np

    with wave.open(path, "rb") as w:
        sr, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError(f"{path}: WAV 16 bits attendu")
    x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    if sr != 16000:
        from math import gcd

        from scipy.signal import resample_poly

        g = gcd(sr, 16000)
        x = resample_poly(x, 16000 // g, sr // g).astype(np.float32)
    return x


def write_wav_16k(path, x):
    """float32 mono 16 kHz → WAV 16 bits."""
    import wave

    import numpy as np

    os.makedirs(os.path.dirname(path), exist_ok=True)
    pcm = (np.clip(x, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(pcm.tobytes())
