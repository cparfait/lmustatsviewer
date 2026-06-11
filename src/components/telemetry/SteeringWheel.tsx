import { useEffect, useState } from "react";
import { STEERING_WHEEL_MAP } from "@/lib/steeringWheels";

interface SteeringWheelProps {
  /** Position volant en % (canal `Steering Pos`, plage ≈ −100..100). */
  steeringPct: number;
  /** Modèle de voiture (ex. « BMW M4 LMGT3 ») → image de volant dédiée. */
  car?: string;
  size?: number;
  theme: "dark" | "light";
}

/** Minuscules + accents pliés (pour un matching robuste). */
function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Trouve le volant d'une voiture par mots-clés (config V1) → slug WebP, ou null.
 * Tolérant aux variantes (Evo, Gibson, livrée, accents).
 */
function wheelSlug(car: string): string | null {
  const f = fold(car);
  for (const e of STEERING_WHEEL_MAP) {
    if (e.keywords.some((k) => f.includes(k))) return e.wheel;
  }
  return null;
}

/**
 * Volant qui tourne avec l'entrée volant (convention V1 : angle = steer/100·180°).
 *
 * Affiche l'**image de volant de la voiture** (WebP optimisé ~13 Ko, dérivé des
 * PNG V1/LMU Telemetry Lab — 45 Mo réduits à 0,5 Mo) ; repli sur un volant **SVG
 * générique** si la voiture n'a pas d'image ou si le chargement échoue.
 */
export function SteeringWheel({ steeringPct, car, size = 84, theme }: SteeringWheelProps) {
  const angle = (steeringPct / 100) * 180;
  const sg = car ? wheelSlug(car) : null;
  const src = sg ? `/steering_wheels/${sg}.webp` : null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]); // nouvelle voiture → on retente l'image

  const style: React.CSSProperties = {
    transform: `rotate(${angle}deg)`,
    transition: "transform 0.05s linear",
  };

  if (src && !failed) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        style={style}
        className="object-contain"
        alt=""
        aria-hidden
        onError={() => setFailed(true)}
      />
    );
  }

  // Repli SVG générique.
  const rim = theme === "dark" ? "#cbd5e1" : "#475569";
  const hub = theme === "dark" ? "#64748b" : "#94a3b8";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style} aria-hidden>
      <circle cx="50" cy="50" r="42" fill="none" stroke={rim} strokeWidth="7" />
      <line x1="50" y1="50" x2="12" y2="50" stroke={rim} strokeWidth="6" strokeLinecap="round" />
      <line x1="50" y1="50" x2="88" y2="50" stroke={rim} strokeWidth="6" strokeLinecap="round" />
      <line x1="50" y1="50" x2="50" y2="90" stroke={rim} strokeWidth="6" strokeLinecap="round" />
      <circle cx="50" cy="50" r="11" fill={hub} />
      <rect x="46" y="6" width="8" height="14" rx="2" fill="#FFB400" />
    </svg>
  );
}
