import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * Pastille d'origine d'un setup : « Jeu » (lecture seule) ou « App » (éditable).
 * Même style que les autres pastilles de l'app (ClassBadge / SessionBadge) :
 * pilule `rounded-full`, `text-micro`, contour visible.
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
        "inline-flex items-center rounded-full border px-1.5 py-0 text-micro font-semibold uppercase tracking-wide whitespace-nowrap",
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
