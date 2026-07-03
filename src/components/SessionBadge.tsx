import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { sessionTypeLabel } from "@/lib/sessionLabels";
import { BADGE_BASE } from "./badgeBase";

/**
 * Bulle de type de session (Course / Qualif / Essais).
 * Réutilisée sur Sessions, Dashboard (records), Records (historique).
 *
 * Palette reprise de la V1 PHP (`style.css.bak`), centralisée dans les tokens
 * `--color-session-*` (cf. `index.css`) — plus aucun hex en dur ici :
 *   race      → texte rouge clair, fond/bordure alizarin (#e74c3c)
 *   qualify   → texte/fond ambre (#f59e0b)
 *   practice  → texte/fond jaune tournesol (#f1c40f)
 */

const SESSION_CLASSES: Record<string, string> = {
  Race: "text-session-race bg-session-race-accent/15 border border-session-race-accent/45",
  Qualify:
    "text-session-qualify bg-session-qualify-accent/15 border border-session-qualify-accent/45",
  Practice:
    "text-session-practice bg-session-practice-accent/15 border border-session-practice-accent/45",
};

function classFor(type: string): string | undefined {
  if (type === "Race") return SESSION_CLASSES.Race;
  if (type.startsWith("Qualif")) return SESSION_CLASSES.Qualify;
  if (type.startsWith("Practice")) return SESSION_CLASSES.Practice;
  return undefined;
}

export function SessionBadge({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span className={cn(BADGE_BASE, classFor(type), className)}>
      {sessionTypeLabel(type, t)}
    </span>
  );
}
