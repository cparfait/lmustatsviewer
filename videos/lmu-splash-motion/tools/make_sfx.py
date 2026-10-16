# Génère les effets sonores de l'animation (synthèse pure, aucun échantillon externe).
# Usage : python tools/make_sfx.py   → écrit assets/sfx/*.wav et affiche les instants clés.
# La physique du départ reprend les constantes de index.html (T_LAUNCH, ACC, vTarget…).
import os
import wave
import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "sfx")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(42)  # graine fixe : rendu identique à chaque génération


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def noise(n):
    return rng.standard_normal(n)


def bp(x, lo, hi, order=2):
    b, a = butter(order, [lo / (SR / 2), hi / (SR / 2)], btype="band")
    return lfilter(b, a, x)


def lp(x, hi, order=2):
    b, a = butter(order, hi / (SR / 2), btype="low")
    return lfilter(b, a, x)


def hp(x, lo, order=2):
    b, a = butter(order, lo / (SR / 2), btype="high")
    return lfilter(b, a, x)


def env_adsr(n, a=0.005, r=0.03):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def saw_from_freq(f):
    ph = np.cumsum(f / SR)
    return 2 * (ph % 1.0) - 1, ph


def engine(f, drive=2.4, rasp=0.35):
    """Moteur de course : dent de scie + sous-harmonique + râpe d'échappement, saturé."""
    s1, ph = saw_from_freq(f)
    s2 = 2 * ((ph * 0.5) % 1.0) - 1
    pulse = np.exp(-((ph % 1.0) * 6.0))  # bouffée à chaque explosion
    raspn = bp(noise(len(f)), 400, 3500) * pulse
    x = 0.6 * s1 + 0.35 * s2 + rasp * raspn
    x = np.tanh(drive * x)
    x = bp(x, 45, 6000)
    return x


def save(name, x, peak=0.9):
    x = np.asarray(x, dtype=float)
    m = np.max(np.abs(x)) or 1.0
    x = x / m * peak
    pcm = (x * 32767).astype("<i2")
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ---------------------------------------------------------------- physique (= index.html)
CAR_X0, T_LAUNCH, ACC = 1150, 4.4, 1700


def smooth(u):
    u = min(1, max(0, u))
    return u * u * (3 - 2 * u)


def v_target(x):
    if x < 2950:
        return 1500
    if x < 4200:
        return 1500 - 430 * smooth((x - 2950) / 1250)
    return 1070 + 330 * smooth((x - 4200) / 500)


def run_physics():
    dt, t, x, out = 1 / 240, T_LAUNCH, CAR_X0, []
    while x < 5050:
        v = min(np.sqrt(2 * ACC * (x - CAR_X0)) + 40, v_target(x))
        out.append((t, x, v))
        x += v * dt
        t += dt
    return np.array(out)


PHYS = run_physics()


def t_at_x(xq):
    return float(PHYS[np.argmax(PHYS[:, 1] >= xq), 0])


T_CATCH = t_at_x(3560)
T_EXIT = t_at_x(4875)  # la voiture sort du cadre
T_END = float(PHYS[-1, 0])

# ---------------------------------------------------------------- sons courts
def fall():
    t = t_axis(0.45)
    f = 2100 * (0.25 ** (t / 0.45)) * (1 + 0.03 * np.sin(2 * np.pi * 7 * t))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    x += 0.15 * np.sin(2 * 2 * np.pi * np.cumsum(f) / SR)
    return x * env_adsr(len(t), 0.03, 0.08)


def thud(dur=0.3, f0=120, f1=45, k=14, click=0.25):
    t = t_axis(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 18)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * k)
    n = lp(noise(len(t)), 900) * np.exp(-t * 40)
    return (x + click * n) * env_adsr(len(t), 0.001, 0.02)


def passby(tc, f0, dur=1.3, speed=75.0, dist=7.0):
    t = t_axis(dur)
    s = speed * (t - tc)
    r = np.sqrt(s * s + dist * dist)
    v_toward = -speed * s / r
    f = f0 * 343.0 / (343.0 - v_toward)
    amp = (dist / r) ** 1.1
    x = engine(f, drive=2.8) * amp
    wind = bp(noise(len(t)), 300, 2500) * amp * 0.5
    return (x + wind) * env_adsr(len(t), 0.02, 0.1)


def door_open():
    t = t_axis(0.45)
    click = bp(noise(len(t)), 1500, 5000) * np.exp(-t * 120)
    hiss = hp(noise(len(t)), 2500) * np.minimum(1, t / 0.05) * np.exp(-t * 7) * 0.5
    mot = np.sin(2 * np.pi * (180 + 120 * t) * t) * np.exp(-t * 6) * 0.25
    return (click + hiss + mot) * env_adsr(len(t), 0.001, 0.05)


def boing():
    t = t_axis(0.45)
    f = 190 + 380 * t + 90 * np.sin(2 * np.pi * 16 * t) * np.exp(-t * 5)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5)
    return x * env_adsr(len(t), 0.004, 0.06)


def car_land():
    t = t_axis(0.35)
    x = thud(0.35, 100, 40, 11, 0.4)
    spring = np.sin(2 * np.pi * np.cumsum(260 + 60 * np.sin(2 * np.pi * 9 * t)) / SR) * np.exp(-t * 10) * 0.18
    return x + spring


def door_close():
    t = t_axis(0.3)
    x = thud(0.3, 140, 55, 22, 0.2)
    latch = np.zeros(len(t))
    i0 = int(0.012 * SR)
    seg = bp(noise(len(t) - i0), 1800, 6000) * np.exp(-t[: len(t) - i0] * 160)
    latch[i0:] = seg * 0.6
    return x + latch


def engine_start():
    dur = 0.95
    t = t_axis(dur)
    tc = 0.33  # le moteur prend (3.78 s)
    # démarreur : moteur électrique + compressions
    crank = (0.5 + 0.5 * np.sin(2 * np.pi * 9 * t)) ** 2
    starter = (np.sin(2 * np.pi * 52 * t) * 0.6 + bp(noise(len(t)), 600, 2500) * 0.25) * crank
    starter += 0.12 * np.sin(2 * np.pi * np.cumsum(700 + 500 * np.minimum(t / tc, 1)) / SR)
    starter *= (t < tc + 0.03) * np.minimum(1, t / 0.02)
    # ça prend : coup de gaz puis ralenti qui cogne
    u = np.clip(t - tc, 0, None)
    f = 70 + 160 * np.exp(-((u - 0.1) ** 2) / 0.004) * (u > 0) + 10 * np.sin(2 * np.pi * 5 * t)
    f = np.maximum(f, 40)
    run = engine(f, drive=2.6, rasp=0.5)
    lope = 0.8 + 0.2 * np.sin(2 * np.pi * 4.5 * t)
    run *= (u > 0) * np.minimum(1, u / 0.015) * lope
    pop = bp(noise(len(t)), 200, 3000) * np.exp(-u * 30) * (u > 0) * 0.8
    x = 0.8 * starter + run + pop
    return x * env_adsr(len(t), 0.005, 0.03)


def engine_run():
    dur = 3.6
    t = t_axis(dur) + T_LAUNCH
    v = np.interp(t, PHYS[:, 0], PHYS[:, 2], right=PHYS[-1, 2])
    xs = np.interp(t, PHYS[:, 0], PHYS[:, 1], right=PHYS[-1, 1])
    gears = [430, 780, 1120, 1520]
    f = np.zeros_like(t)
    shift = np.zeros_like(t)
    g = 0
    for i, vi in enumerate(v):
        while g < len(gears) - 1 and vi > gears[g] * 0.97:
            g += 1
            shift[i] = 1
        frac = min(1.0, vi / gears[g])
        f[i] = 78 + 215 * frac
    # patinage au départ : régime qui grimpe tout de suite
    u = t - T_LAUNCH
    f = np.maximum(f, (95 + 150 * np.minimum(1, u / 0.12)) * (u < 0.35) + 0 * u)
    # en l'air à la crête : les roues se délestent, le régime s'envole
    air = np.clip((xs - 4200) / 700, 0, 1)
    f *= 1 + 0.2 * np.sin(np.pi * air)
    # s'éloigne : léger effet Doppler et fondu
    away = np.clip((t - T_EXIT) / 0.6, 0, 1)
    f *= 1 - 0.08 * away
    f = lp(f, 25, 1)  # adoucit les sauts de régime
    x = engine(f, drive=2.9, rasp=0.45)
    # trou de couple au passage de rapport
    dip = np.ones_like(t)
    for i in np.nonzero(shift)[0]:
        n = int(0.06 * SR)
        dip[i : i + n] = np.minimum(dip[i : i + n], 0.45)
    dip = lp(dip, 40, 1)
    amp = (0.85 + 0.15 * np.minimum(1, u / 0.5)) * (1 - away) ** 1.5
    tyre = bp(noise(len(t)), 800, 4000) * np.exp(-u * 4) * 0.35  # patinage
    return (x * dip + tyre) * amp * env_adsr(len(t), 0.02, 0.05)


def wipe():
    dur = 0.6
    t = t_axis(dur)
    n = noise(len(t))
    out = np.zeros_like(n)
    # filtre passe-bande à fréquence glissante (bloc par bloc)
    blk = 256
    zi = None
    for i in range(0, len(n), blk):
        u = i / len(n)
        fc = 300 * (16 ** u)
        b, a = butter(2, [fc / (SR / 2), min(0.95, fc * 2.2 / (SR / 2))], btype="band")
        from scipy.signal import lfilter_zi

        if zi is None:
            zi = lfilter_zi(b, a) * 0
        seg, zi = lfilter(b, a, n[i : i + blk], zi=zi)
        out[i : i + blk] = seg
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return out * e


def sting():
    dur = 1.6
    t = t_axis(dur)
    x = np.zeros_like(t)
    notes = [(523.25, 0.0), (659.25, 0.06), (783.99, 0.12), (1046.5, 0.2)]
    for f, d in notes:
        u = np.clip(t - d, 0, None)
        on = (t >= d).astype(float)
        tone = np.sin(2 * np.pi * f * u) + 0.3 * np.sin(2 * np.pi * 2 * f * u) + 0.12 * np.sin(2 * np.pi * 3.01 * f * u)
        x += tone * np.exp(-u * 2.6) * on * np.minimum(1, u / 0.004)
    pad = (np.sin(2 * np.pi * 130.81 * t) + 0.6 * np.sin(2 * np.pi * 196.0 * t)) * np.minimum(1, t / 0.08) * np.exp(-t * 1.6) * 0.5
    return (x * 0.6 + pad) * env_adsr(len(t), 0.002, 0.2)


def zip_car():
    dur = 0.6
    t = t_axis(dur)
    f = 260 * (3.2 ** (t / dur))
    x = engine(f, drive=2.2, rasp=0.2)
    x = hp(x, 300)
    e = np.minimum(1, t / 0.08) * np.exp(-np.clip(t - 0.4, 0, None) * 10)
    return x * e


if __name__ == "__main__":
    save("fall", fall(), 0.8)
    save("land", thud())
    save("pass1", passby(0.557, 150))
    save("pass2", passby(0.532, 172))
    save("door_open", door_open())
    save("boing", boing(), 0.8)
    save("car_land", car_land())
    save("door_close", door_close())
    save("engine_start", engine_start())
    save("engine_run", engine_run())
    save("overtake", passby(0.3, 128, dur=1.0, speed=22, dist=4.0), 0.8)
    save("wipe", wipe())
    save("sting", sting())
    save("zip", zip_car())
    print(f"T_CATCH={T_CATCH:.3f}  overtake data-start={T_CATCH - 0.3:.2f}  T_EXIT={T_EXIT:.3f}  T_END={T_END:.3f}")
