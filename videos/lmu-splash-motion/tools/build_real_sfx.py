# Construit la bande-son à partir de vrais enregistrements (Pixabay, assets/sfx-src/)
# et de la bibliothèque réaliste fournie avec HyperFrames (whoosh / impacts).
# Usage : python tools/build_real_sfx.py  → écrit assets/sfx-real/*.wav
# Chaque fichier est découpé, fondu et normalisé ; index.html le joue en entier à son data-start.
import glob
import os
import subprocess
import wave
import numpy as np

SR = 44100
ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "assets", "sfx-src")
OUT = os.path.join(ROOT, "assets", "sfx-real")
os.makedirs(OUT, exist_ok=True)


def lib_dir():
    pats = glob.glob(os.path.join(os.environ.get("LOCALAPPDATA", ""), "npm-cache", "_npx", "*", "node_modules", "hyperframes", "dist", "skills", "media-use", "audio", "assets", "sfx"))
    if not pats:
        raise SystemExit("Bibliothèque SFX HyperFrames introuvable (lancer une commande npx hyperframes d'abord)")
    return pats[0]


def load(path):
    """Décode n'importe quel fichier audio en mono 44.1 kHz via ffmpeg."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, "<i2").astype(float) / 32768.0


SRCS = {
    "nurb": load(os.path.join(SRC, "nurburgring-pass.mp3")),
    "gt": load(os.path.join(SRC, "gt-start-stop.mp3")),
    "accel": load(os.path.join(SRC, "accel-driveaway.mp3")),
    "long": load(os.path.join(SRC, "start-rev-run-stop.mp3")),
    "door": load(os.path.join(SRC, "door-close.mp3")),
    "flyby": load(os.path.join(SRC, "v8-flyby.mp3")),
    # extraits avec l'accord des ayants droit (cf. SOURCES.md)
    "gmr": load(os.path.join(SRC, "yt", "gmr001.wav")),
    "mcl": load(os.path.join(SRC, "yt", "mclaren-short.wav")),
}
LIB = lib_dir()
for n in ["whoosh", "whoosh-short", "whoosh-cinematic", "impact-bass-1", "impact-bass-2", "sparkle", "click-soft"]:
    SRCS[n] = load(os.path.join(LIB, n + ".mp3"))


def cut(name, a, b=None):
    x = SRCS[name]
    return x[int(a * SR) : (int(b * SR) if b is not None else len(x))].copy()


def fade(x, fin=0.0, fout=0.0):
    x = x.copy()
    ni, no = int(fin * SR), int(fout * SR)
    if ni:
        x[:ni] *= np.linspace(0, 1, ni) ** 2
    if no:
        x[-no:] *= np.linspace(1, 0, no) ** 2
    return x


def pitch(x, ratio):
    """Accélère (ratio > 1) : plus aigu et plus court, comme une voiture plus rapide."""
    n = int(len(x) / ratio)
    return np.interp(np.arange(n) * ratio, np.arange(len(x)), x)


def rms(x):
    return np.sqrt(np.mean(x**2)) + 1e-9


def place(length, *parts):
    out = np.zeros(int(length * SR))
    for t, x in parts:
        i = int(t * SR)
        seg = x[: max(0, len(out) - i)]
        out[i : i + len(seg)] += seg
    return out


def save(name, x, peak=0.9):
    x = x / (np.max(np.abs(x)) or 1) * peak
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())
    print(f"{name:13s} {len(x) / SR:5.2f}s")


def doppler_pass(x, dur, tc, speed=70.0, dist=6.0, base=1.0):
    """Fait passer un son embarqué devant le spectateur : Doppler + atténuation + filtrage à distance."""
    t = np.arange(int(dur * SR)) / SR
    s_ = speed * (t - tc)
    r = np.sqrt(s_ * s_ + dist * dist)
    rate = base * 343.0 / (343.0 + speed * s_ / r)
    pos = np.cumsum(rate)
    pos = pos[pos < len(x) - 1]
    y = np.interp(pos, np.arange(len(x)), x)
    amp = (dist / r[: len(y)]) ** 1.15
    far = np.clip(1 - dist / r[: len(y)], 0, 1)
    k = int(0.002 * SR)
    smooth = np.convolve(y, np.ones(k) / k, mode="same")
    y = y * (1 - 0.6 * far) + smooth * 0.6 * far
    return y * amp


def peak_time(x, win=0.05):
    n = int(win * SR)
    e = np.convolve(x**2, np.ones(n) / n, mode="same")
    return np.argmax(e) / SR


# Passages des rivales : moteur d'hypercar (GMR-001, plein rapport haut) passé « devant » le spectateur,
# puis le grondement McLaren pour la seconde (variété)
save("r1_pass", fade(doppler_pass(cut("gmr", 90.0, 94.0), 2.3, 1.0, speed=75), 0.05, 0.25))
save("r2_pass", fade(cut("mcl", 3.6, 6.2) * np.interp(np.arange(int(2.6 * SR)) / SR, [0, 1.0, 1.4, 1.9, 2.6], [0.15, 0.7, 1.0, 0.6, 0.0]), 0.1, 0.2))
# Dépassement : la rivale verte, plus lente, recule par rapport à nous
save("overtake", fade(doppler_pass(cut("gmr", 100.0, 104.0), 2.1, 1.0, speed=24, dist=3.5, base=0.9), 0.3, 0.4))

# Démarrage : démarreur (enregistrement GT), puis le V8 biturbo GMR-001 prend à bas régime
starter = fade(cut("gt", 0.42, 0.8), 0.03, 0.06)
low = fade(cut("gmr", 76.4, 77.05), 0.06, 0.0)
low *= rms(starter) / rms(low) * 1.2
save("engine_start", place(1.0, (0.0, starter), (0.33, low)))

# Course : accélération réelle GMR-001 (bas régime → rupteur, passages de rapports), fondu en sortie de cadre
run = cut("gmr", 77.05, 80.65)
n0 = int(3.08 * SR)  # la voiture sort du cadre à ~7,48 s (début du fichier : 4,4 s)
run[n0:] *= np.linspace(1, 0, len(run) - n0) ** 1.5
save("engine_run", fade(run, 0.01, 0.05))

save("door_close", fade(cut("door", 0.0), 0.0, 0.05))

# Bruitages réalistes (bibliothèque HyperFrames), sans effets cartoon
save("fall", fade(cut("whoosh-short", 0.0), 0.0, 0.08), 0.7)
save("land", fade(cut("impact-bass-2", 0.0, 0.7), 0.0, 0.3), 0.7)
save("door_open", place(0.6, (0.0, cut("click-soft", 0.0)), (0.04, fade(cut("whoosh", 0.0), 0.05, 0.1) * 0.5)), 0.7)
save("jump", fade(cut("whoosh", 0.0), 0.0, 0.08), 0.7)
save("car_land", fade(cut("impact-bass-1", 0.0, 0.7), 0.0, 0.3), 0.8)
wc = SRCS["whoosh-cinematic"]
pk = peak_time(wc)
save("wipe", fade(cut("whoosh-cinematic", max(0, pk - 0.35), pk + 0.4), 0.05, 0.2))
save("title_hit", fade(cut("impact-bass-1", 0.0, 1.6), 0.0, 0.6))
save("title_sparkle", fade(cut("sparkle", 0.0), 0.0, 0.3), 0.6)
save("zip", fade(pitch(cut("flyby", 0.0), 1.35), 0.02, 0.15))
print(f"whoosh-cinematic peak at {pk:.2f}s")
