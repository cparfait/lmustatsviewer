import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { BADGE_BASE } from "./badgeBase";

/**
 * Pastille d'origine d'un setup : « Jeu » (lecture seule) ou « App » (éditable).
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
  return (
    <span
      className={cn(
        BADGE_BASE,
        game
          ? "border-primary/45 bg-primary/15 text-primary"
          : "border-emerald-500/45 bg-emerald-500/15 text-emerald-400",
        className
      )}
    >
      {game ? t("setupDetail.sourceGame") : t("setupDetail.sourceApp")}
    </span>
  );
}
