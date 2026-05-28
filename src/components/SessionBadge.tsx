import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * Bulle de type de session (Course / Qualif / Essais).
 * Réutilisée sur Sessions, Dashboard (records), Records (historique).
 *
 * Palette reprise de la V1 PHP (`style.css.bak`) :
 *   .session-practice1 { #f1c40f } — jaune (essais)
 *   .session-qualify   { #e67e22 } — jaune (qualif)
 *   .session-race      { #e74c3c } — rouge (course)
 * Adaptée au thème sombre : texte coloré sur fond teinté + bordure douce.
 */

type SessionStyle = {
  color: string;
  background: string;
  border: string;
};

const SESSION_STYLES: Record<string, SessionStyle> = {
  // Course — rouge alizarin (#e74c3c)
  Race: {
    color: "#f87171",
    background: "rgba(231, 76, 60, 0.15)",
    border: "1px solid rgba(231, 76, 60, 0.45)",
  },
  // Qualif — jaune (#f59e0b)
  Qualify: {
    color: "#fbbf24",
    background: "rgba(245, 158, 11, 0.15)",
    border: "1px solid rgba(245, 158, 11, 0.45)",
  },
  // Essais — jaune tournesol (#f1c40f)
  Practice: {
    color: "#facc15",
    background: "rgba(241, 196, 15, 0.15)",
    border: "1px solid rgba(241, 196, 15, 0.45)",
  },
};

function styleFor(type: string): SessionStyle | undefined {
  if (type === "Race") return SESSION_STYLES.Race;
  if (type.startsWith("Qualif")) return SESSION_STYLES.Qualify;
  if (type.startsWith("Practice")) return SESSION_STYLES.Practice;
  return undefined;
}

export function sessionTypeLabel(
  type: string,
  t: (k: string) => string
): string {
  if (type === "Race") return t("records.sessionRace");
  if (type.startsWith("Qualif")) return t("records.sessionQualifying");
  if (type.startsWith("Practice")) return t("records.sessionPractice");
  return type;
}

export function SessionBadge({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const s = styleFor(type);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap",
        className
      )}
      style={
        s
          ? { color: s.color, backgroundColor: s.background, border: s.border }
          : undefined
      }
    >
      {sessionTypeLabel(type, t)}
    </span>
  );
}
