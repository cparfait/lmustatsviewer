interface GaugeProps {
  speed: number; // km/h
  rpm: number;
  gear: string; // déjà formaté (N/R/1..)
  throttle: number; // 0–100
  brake: number; // 0–100
  theme: "dark" | "light";
}

const CX = 110;
const CY = 110;
const R = 86;
const SPEED_LABEL = "#94a3b8";

function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

/** Arc SVG entre deux angles (0° = haut, sens horaire). */
function arc(r: number, start: number, end: number): string {
  const s = polar(r, end);
  const e = polar(r, start);
  const large = end - start <= 180 ? "0" : "1";
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

/**
 * Jauge en arc (compteur) façon LMU Telemetry Lab :
 * - arc **gauche** = accélérateur (cyan), arc **droit** = frein (rouge),
 * - petit repère de régime sur l'arc,
 * - au centre : vitesse + KM/H + régime + rapport (texte centré, lisible).
 * SVG pur, aucune dépendance.
 */
export function Gauge({ speed, rpm, gear, throttle, brake, theme }: GaugeProps) {
  const thr = Math.max(0, Math.min(1, throttle / 100));
  const brk = Math.max(0, Math.min(1, brake / 100));

  const track = theme === "dark" ? "#334155" : "#cbd5e1";
  const W = 9;
  return (
    <svg viewBox="0 0 220 212" className="w-full max-w-[230px]" aria-hidden>
      {/* Piste complète (270°, trou en bas) */}
      <path d={arc(R, -135, 135)} fill="none" stroke={track} strokeWidth={W} strokeLinecap="round" />

      {/* Accélérateur — arc gauche, du bas-gauche (-135°) vers le haut (0°) */}
      {thr > 0.001 && (
        <path
          d={arc(R, -135, -135 + 135 * thr)}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={W}
          strokeLinecap="round"
          style={{ transition: "all 0.05s linear" }}
        />
      )}
      {/* Frein — arc droit, du bas-droit (135°) vers le haut (0°) */}
      {brk > 0.001 && (
        <path
          d={arc(R, 135 - 135 * brk, 135)}
          fill="none"
          stroke="#ef4444"
          strokeWidth={W}
          strokeLinecap="round"
          style={{ transition: "all 0.05s linear" }}
        />
      )}

      {/* Labels accélérateur / frein (clairs + colorés) */}
      <text x="8" y="190" style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.5 }} fill="#38bdf8">
        THR
      </text>
      <text x="8" y="204" style={{ fontSize: 13, fontWeight: 800 }} fill="#38bdf8">
        {throttle.toFixed(0)}%
      </text>
      <text x="212" y="190" textAnchor="end" style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.5 }} fill="#ef4444">
        BRK
      </text>
      <text x="212" y="204" textAnchor="end" style={{ fontSize: 13, fontWeight: 800 }} fill="#ef4444">
        {brake.toFixed(0)}%
      </text>

      {/* Centre : vitesse */}
      <text x={CX} y="62" textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1 }} fill={SPEED_LABEL}>
        SPEED
      </text>
      <text x={CX} y="104" textAnchor="middle" className="fill-foreground" style={{ fontSize: 44, fontWeight: 800 }}>
        {speed.toFixed(0)}
      </text>
      <text x={CX} y="120" textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1 }} fill={SPEED_LABEL}>
        KM/H
      </text>
      {/* Régime */}
      <text x={CX} y="146" textAnchor="middle" className="fill-foreground" style={{ fontSize: 16, fontWeight: 700 }}>
        {rpm.toFixed(0)}
      </text>
      <text x={CX} y="158" textAnchor="middle" style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1 }} fill={SPEED_LABEL}>
        RPM
      </text>
      {/* Rapport (dans le trou bas de l'arc) */}
      <text x={CX} y="200" textAnchor="middle" className="fill-foreground" style={{ fontSize: 28, fontWeight: 800 }}>
        {gear}
      </text>
    </svg>
  );
}
