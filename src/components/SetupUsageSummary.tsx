/**
 * Ce qu'un setup a roulé (reconnu en piste) : tours, sec / pluie, course / qualif /
 * essais, meilleur tour propre et ses secteurs. Aperçu rapide et fiche setup.
 */
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Gauge } from "lucide-react";
import type { SetupStats } from "@/lib/api";
import { formatDateTime, formatSectorSeconds, formatTime } from "@/lib/utils";

export function SetupUsageSummary({ stats }: { stats: SetupStats | null | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (!stats || stats.laps === 0) return null;
  const parts = (pairs: [number, string][]) =>
    pairs
      .filter(([n]) => n > 0)
      .map(([n, k]) => `${t(k)} ${n}`)
      .join(" · ");
  const weather = parts([
    [stats.dry_laps, "lab.stats.dry"],
    [stats.wet_laps, "lab.stats.wet"],
  ]);
  const kinds = parts([
    [stats.race_laps, "lab.stats.race"],
    [stats.quali_laps, "lab.stats.quali"],
    [stats.practice_laps, "lab.stats.practice"],
  ]);
  return (
    <div className="space-y-1 text-xs">
      <p className="text-micro font-bold uppercase tracking-widest text-muted-foreground">{t("lab.stats.title")}</p>
      <p>
        {t("lab.stats.laps", { count: stats.laps })} · {t("lab.stats.clean", { count: stats.clean_laps })} ·{" "}
        {t("lab.stats.sessions", { count: stats.sessions })}
      </p>
      {weather && <p className="text-muted-foreground">{weather}</p>}
      {kinds && <p className="text-muted-foreground">{kinds}</p>}
      {stats.best_lap != null && (
        <button
          type="button"
          onClick={() => stats.best_session_id != null && navigate(`/sessions/${stats.best_session_id}`)}
          className="inline-flex flex-wrap items-center gap-x-2 text-left hover:text-primary"
          title={t("lab.stats.openBest")}
        >
          <Gauge className="h-3.5 w-3.5 text-primary" />
          <span>{t("lab.stats.best")}</span>
          <span className="font-mono font-semibold tabular-nums">{formatTime(stats.best_lap)}</span>
          {stats.best_sectors && (
            <span className="font-mono text-muted-foreground tabular-nums">
              {stats.best_sectors.map((s, i) => `S${i + 1} ${formatSectorSeconds(s)}`).join(" · ")}
            </span>
          )}
        </button>
      )}
      {stats.unsaved_laps > 0 && (
        <p className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          {t("lab.stats.unsaved", { count: stats.unsaved_laps })}
        </p>
      )}
      {stats.last_driven != null && (
        <p className="text-muted-foreground">{t("lab.stats.last", { date: formatDateTime(stats.last_driven) })}</p>
      )}
    </div>
  );
}
