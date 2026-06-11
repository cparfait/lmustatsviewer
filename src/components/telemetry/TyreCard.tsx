interface TyreCardProps {
  label: string; // FL / FR / RL / RR
  pressure?: number; // kPa
  tempL?: number;
  tempC?: number;
  tempR?: number;
  wear?: number; // % gomme restante
  compoundIdx?: number;
  carClass?: string;
  brakeTemp?: number; // °C
}

/** Compound (lettre + couleur) selon la classe — calqué sur LMU Telemetry Lab. */
function compoundInfo(idx: number | undefined, carClass?: string): { label: string; color: string } {
  if (idx == null || isNaN(idx)) return { label: "—", color: "#9ca3af" };
  const r = Math.round(idx);
  const c = (carClass || "").toUpperCase();
  const hyper = ["HYPER", "GTP", "LMH", "LMDH", "LMP"].some((k) => c.includes(k));
  const hyperMap = [
    { label: "S", color: "#ef4444" },
    { label: "M", color: "#eab308" },
    { label: "H", color: "#e5e7eb" },
    { label: "W", color: "#3b82f6" },
  ];
  const otherMap = [
    { label: "M", color: "#eab308" },
    { label: "W", color: "#3b82f6" },
  ];
  return (hyper ? hyperMap : otherMap)[r] ?? { label: "?", color: "#9ca3af" };
}

/** Couleur de température pneu (bleu froid → vert OK → orange → rouge chaud). */
function tempColor(t: number | undefined): string {
  if (t == null || !isFinite(t)) return "#9ca3af";
  if (t < 70) return "#3b82f6";
  if (t > 105) return "#ef4444";
  if (t > 95) return "#f59e0b";
  return "#22c55e";
}

/**
 * Carte pneu « jolie » (SVG, comme LMU Telemetry Lab) : anneau d'usure coloré
 * (rouge→vert) avec compound au centre, pression, température 3 points colorée,
 * température de frein. Tout en SVG/CSS — aucune dépendance.
 */
export function TyreCard({
  label,
  pressure,
  tempL,
  tempC,
  tempR,
  wear,
  compoundIdx,
  carClass,
  brakeTemp,
}: TyreCardProps) {
  const comp = compoundInfo(compoundIdx, carClass);
  const wearPct = wear != null && isFinite(wear) ? Math.round(wear) : 0;
  // r=16 → circonférence ≈ 100 → dasharray « wear 100 » = pourcentage.
  const wearColor = `hsl(${(wearPct / 100) * 120}, 80%, 50%)`;

  return (
    <div className="relative flex flex-col items-center rounded-lg border border-border bg-background/40 p-2">
      {/* Étiquette coin */}
      <span className="absolute left-1 top-1 rounded bg-muted px-1 text-[8px] font-bold uppercase text-muted-foreground">
        {label}
      </span>
      {/* Pression */}
      <span className="text-micro font-mono text-muted-foreground">
        {pressure != null ? pressure.toFixed(1) : "--"} kPa
      </span>

      {/* Anneau d'usure + compound */}
      <div className="relative my-0.5 h-14 w-14">
        <svg viewBox="0 0 36 36" className="h-full w-full -scale-x-100 rotate-90">
          <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3.5" className="text-border" />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke={wearColor}
            strokeWidth="3.5"
            strokeDasharray={`${wearPct} 100`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.1s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold leading-none" style={{ color: comp.color }}>
            {comp.label}
          </span>
          <span className="text-[9px] font-bold">{wearPct ? `${wearPct}%` : "--%"}</span>
        </div>
      </div>

      {/* Température centre (grosse, colorée) */}
      <span
        className="font-mono text-sm font-bold tabular-nums"
        style={{ color: tempColor(tempC) }}
      >
        {tempC != null ? tempC.toFixed(0) : "--"}°
      </span>

      {/* 3 points : intérieur / centre / extérieur */}
      <div className="flex w-full justify-between px-0.5 text-[9px] font-mono tabular-nums">
        <span style={{ color: tempColor(tempL) }}>{tempL != null ? tempL.toFixed(0) : "--"}</span>
        <span style={{ color: tempColor(tempR) }}>{tempR != null ? tempR.toFixed(0) : "--"}</span>
      </div>

      {/* Frein */}
      <span className="mt-0.5 text-[9px] text-muted-foreground tabular-nums">
        <span className="font-bold">F</span> {brakeTemp != null ? brakeTemp.toFixed(0) : "--"}°
      </span>
    </div>
  );
}
