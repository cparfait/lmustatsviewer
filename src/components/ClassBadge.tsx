import {
  CAR_CLASS_COLORS,
  CAR_CLASS_LABELS,
  CAR_CLASS_SOLID_COLORS,
} from "@/lib/staticData";
import { BADGE_BASE } from "./badgeBase";

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

  const style: React.CSSProperties = palette
    ? {
        color: palette.color,
        backgroundColor: palette.background,
        border: palette.border ?? `1px solid ${palette.color}33`,
      }
    : {};

  return (
    <span className={BADGE_BASE} style={style}>
      {label}
    </span>
  );
}
