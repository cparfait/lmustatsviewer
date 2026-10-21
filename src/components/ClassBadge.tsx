import {
  CAR_CLASS_COLORS,
  CAR_CLASS_LABELS,
  CAR_CLASS_SOLID_COLORS,
} from "@/lib/staticData";
import { BADGE_BASE } from "./badgeBase";
import { cn } from "@/lib/utils";

interface ClassBadgeProps {
  carClass: string;
  solid?: boolean;
  /**
   * @deprecated Conservé pour rétro-compat — toutes les pastilles partagent
   * désormais la même taille (text-micro px-1.5 py-0) pour aligner ClassBadge
   * et SessionBadge.
   */
  size?: "sm" | "md";
}

export function ClassBadge({ carClass, solid }: ClassBadgeProps) {
  const palette = solid ? CAR_CLASS_SOLID_COLORS[carClass] : CAR_CLASS_COLORS[carClass];
  const label = CAR_CLASS_LABELS[carClass] ?? carClass;

  // Texte foncé en thème clair (teintes du site communautaire), clair en thème sombre.
  const light = solid ? undefined : CAR_CLASS_COLORS[carClass]?.light;
  const style = (
    palette
      ? {
          ...(light ? { "--cls-light": light, "--cls-dark": palette.color } : { color: palette.color }),
          backgroundColor: palette.background,
          border: palette.border ?? `1px solid ${palette.color}33`,
        }
      : {}
  ) as React.CSSProperties;

  return (
    <span className={cn(BADGE_BASE, light && "font-bold text-[var(--cls-light)] dark:text-[var(--cls-dark)]")} style={style}>
      {label}
    </span>
  );
}
