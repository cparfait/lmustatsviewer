/**
 * Briques visuelles communes aux widgets d'overlay.
 *
 * Esthétique « Trace HUB » : panneaux sombres translucides, liseré/glow d'accent,
 * chiffres en mono. Réutilise les couleurs d'accent du registre par overlay.
 */

import { cn } from "@/lib/utils";

/** Panneau de base d'un widget. */
export function Panel({
  accent,
  className,
  style,
  children,
}: {
  accent: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border backdrop-blur-md text-white shadow-2xl",
        className,
      )}
      style={{
        background:
          "linear-gradient(180deg, rgba(15,18,24,0.92) 0%, rgba(10,12,16,0.92) 100%)",
        borderColor: `${accent}55`,
        boxShadow: `0 8px 30px rgba(0,0,0,0.45), inset 0 0 0 1px ${accent}22`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** En-tête de widget (icône + titre, liseré d'accent). */
export function PanelHeader({
  accent,
  icon: Icon,
  title,
}: {
  accent: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div
      className="flex items-center gap-2 border-b px-3 py-1.5"
      style={{ borderColor: `${accent}33` }}
    >
      <Icon className="h-3.5 w-3.5" />
      <span
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: accent }}
      >
        {title}
      </span>
    </div>
  );
}

/** Barre de progression verticale (pédales). */
export function VBar({
  value,
  color,
  className,
}: {
  value: number; // 0..1
  color: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={cn("relative w-3 overflow-hidden rounded bg-white/10", className)}
    >
      <div
        className="absolute bottom-0 left-0 right-0 rounded"
        style={{ height: `${pct}%`, background: color }}
      />
    </div>
  );
}

/** Barre de progression horizontale. */
export function HBar({
  value,
  color,
  className,
}: {
  value: number; // 0..1
  color: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn("relative h-2 overflow-hidden rounded bg-white/10", className)}>
      <div
        className="absolute bottom-0 left-0 top-0 rounded"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

/** Petite statistique label + valeur. */
export function Stat({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wide text-white/45">
        {label}
      </span>
      <span className="font-mono text-sm font-semibold leading-tight" style={{ color }}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] text-white/45">{unit}</span>}
      </span>
    </div>
  );
}
