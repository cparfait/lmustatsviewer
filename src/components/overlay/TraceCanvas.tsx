/**
 * Trace accélérateur / frein dessinée en canvas haute définition (style Instrument).
 *
 * La surface de dessin suit la taille réellement affichée × la densité de l'écran :
 * le trait reste net quel que soit l'agrandissement du widget (zoom ou scale). Remplissage
 * en dégradé sous l'accélérateur, léger halo sur les courbes, points de blocage.
 */

import { useEffect, useRef } from "react";

export function TraceCanvas({
  throttle,
  brake,
  lock,
  length,
  height,
  throttleColor,
  brakeColor,
  lockColor = "#f2c230",
}: {
  throttle: number[];
  brake: number[];
  /** Points de blocage (même index que `brake`), facultatif. */
  lock?: boolean[];
  /** Nombre d'échantillons visibles sur toute la largeur. */
  length: number;
  /** Hauteur CSS en px (la largeur suit le conteneur). */
  height: number;
  throttleColor: string;
  brakeColor: string;
  lockColor?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  // Redessin à chaque rendu : le widget se re-rend à chaque trame de télémétrie.
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.max(1, Math.round(rect.width * dpr));
    const bh = Math.max(1, Math.round(rect.height * dpr));
    if (cv.width !== bw || cv.height !== bh) {
      cv.width = bw;
      cv.height = bh;
    }
    // Unité de dessin = 1 px CSS affiché (zoom/scale compris).
    const u = bh / height;
    const W = bw;
    const H = bh;
    const pad = 1.5 * u;
    const x = (i: number) => (i / Math.max(1, length - 1)) * W;
    const y = (v: number) => H - pad - Math.max(0, Math.min(1, v)) * (H - 2 * pad);

    ctx.clearRect(0, 0, W, H);
    // Fond + quadrillage discret (25 / 50 / 75 %).
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = Math.max(1, u * 0.75);
    ctx.beginPath();
    for (const f of [0.25, 0.5, 0.75]) {
      const yy = Math.round(y(f)) + 0.5;
      ctx.moveTo(0, yy);
      ctx.lineTo(W, yy);
    }
    ctx.stroke();

    const line = (arr: number[], color: string, fill: boolean) => {
      if (arr.length < 2) return;
      ctx.beginPath();
      arr.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
      if (fill) {
        ctx.save();
        ctx.lineTo(x(arr.length - 1), H);
        ctx.lineTo(x(0), H);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, `${color}55`);
        g.addColorStop(1, `${color}00`);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        arr.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
      }
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6 * u;
      ctx.lineJoin = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = 4 * u;
      ctx.stroke();
      ctx.restore();
    };
    line(throttle, throttleColor, true);
    line(brake, brakeColor, false);

    if (lock) {
      ctx.fillStyle = lockColor;
      lock.forEach((on, i) => {
        if (!on) return;
        ctx.beginPath();
        ctx.arc(x(i), y(brake[i] ?? 0), 2.2 * u, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });

  return <canvas ref={ref} className="block w-full rounded-[2px]" style={{ height }} />;
}
