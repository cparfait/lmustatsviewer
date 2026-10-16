# Profil de chaque son : RMS (dB) et fréquence dominante (60-600 Hz ~ régime moteur) par pas de 0.25 s
import sys, glob, os, wave, numpy as np
for p in sorted(glob.glob(sys.argv[1] + "/*.wav")):
    w = wave.open(p); x = np.frombuffer(w.readframes(w.getnframes()), "<i2") / 32768.0; sr = w.getframerate()
    step = int(0.25 * sr); rows = []
    for i in range(0, len(x) - step + 1, step):
        seg = x[i:i + step]; rms = 20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9)
        sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))); fr = np.fft.rfftfreq(len(seg), 1 / sr)
        band = (fr > 60) & (fr < 600); f0 = fr[band][np.argmax(sp[band])]
        cen = np.sum(fr * sp) / (np.sum(sp) + 1e-9)
        rows.append(f"{i/sr:5.2f}:{rms:5.0f}dB/{f0:4.0f}Hz/c{cen/1000:3.1f}k")
    print(f"== {os.path.basename(p)} ({len(x)/sr:.2f}s, peak {np.max(np.abs(x)):.2f})")
    for k in range(0, len(rows), 6): print("   " + "  ".join(rows[k:k + 6]))
