import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { BADGE_BASE } from "./badgeBase";

/**
 * Pastille d'origine d'un setup : « Jeu » (lecture seule), « App » (éditable) ou
 * « Communauté » (téléchargé des setups partagés, éditable).
 * Même taille que toutes les pastilles de l'app via `BADGE_BASE` (cf.
 * `badgeBase.ts`) — ne pas redéfinir les classes de forme ici.
 */
export function SourceBadge({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const game = source === "game";
  // Téléchargé depuis les setups de la communauté (copie éditable).
  const shared = source === "community";
  return (
    <span
      className={cn(
        BADGE_BASE,
        game
          ? "border-primary/45 bg-primary/15 text-primary"
          : shared
            ? "border-sky-500/45 bg-sky-500/15 text-sky-600 dark:text-sky-400"
            : "border-emerald-500/45 bg-emerald-500/15 text-emerald-400",
        className
      )}
    >
      {game ? t("setupDetail.sourceGame") : shared ? t("setupDetail.sourceCommunity") : t("setupDetail.sourceApp")}
    </span>
  );
}
