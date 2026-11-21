/**
 * Bandeau de la page Live : multiplicateurs de conso et d'usure de la séance,
 * lus dans le jeu (`sessions`). Affiché seulement s'ils sortent de x1, pour
 * expliquer une conso ou une usure hors normes.
 */
import { useTranslation } from "react-i18next";
import { Gauge } from "lucide-react";
import type { LmuRestLive } from "@/lib/api";
import { sessionMultipliers } from "@/lib/lmuRest";

export function SessionMultipliersBadge({ rest }: { rest: LmuRestLive | null | undefined }) {
  const { t } = useTranslation();
  const m = sessionMultipliers(rest);
  if (!m) return null;
  const parts: string[] = [];
  if (m.fuel != null && m.fuel !== 1) parts.push(t("live.sessionMultFuel", { value: m.fuel }));
  if (m.tire != null && m.tire !== 1) parts.push(t("live.sessionMultTire", { value: m.tire }));
  if (!parts.length) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-muted/30 px-6 py-1.5 text-xs"
      title={t("live.sessionMultHint")}
    >
      <span className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-micro">
        <Gauge className="h-3.5 w-3.5 text-primary" />
        {t("live.sessionMultLabel")}
      </span>
      <span className="font-medium text-foreground">{parts.join(" · ")}</span>
    </div>
  );
}
