import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, Repeat2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { SessionDetail } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { computeDebrief, type DefectFact } from "@/lib/debrief/compute";
import { loadRecurring } from "@/lib/debrief/load";
import { MIN_RACES, type RecurringDefect } from "@/lib/debrief/recurring";

/** Écart signé en secondes (« +0.412 s »). */
const gap = (s: number) => `${s >= 0 ? "+" : ""}${s.toFixed(3)} s`;

/**
 * Débrief **calculé** de la session (sans IA) : résultat, arrêts, rythme, secteurs,
 * bascules de position, usure, incidents, familles de défaut, et le défaut qui revient
 * sur les dernières courses. Les mêmes chiffres sont joints à l'analyse du Coach IA.
 */
export function SessionDebrief({ detail }: { detail: SessionDetail }) {
  const { t } = useTranslation();
  const d = useMemo(() => computeDebrief(detail), [detail]);
  const [rec, setRec] = useState<{ races: number; defect: RecurringDefect | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRec(null);
    loadRecurring()
      .then((r) => !cancelled && setRec(r))
      .catch(() => !cancelled && setRec({ races: 0, defect: null }));
    return () => {
      cancelled = true;
    };
  }, [detail.session.id]);

  if (!d) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">{t("debrief.noPlayer")}</CardContent>
      </Card>
    );
  }

  const famText = (f: DefectFact) => t(`debrief.fam_${f.family}`, f.facts as Record<string, unknown>);
  const status = t(`debrief.status_${d.status}`);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <span className="font-semibold">{t("debrief.title")}</span>
            <span className="text-xs text-muted-foreground">{t("debrief.subtitle")}</span>
          </div>

          <ul className="space-y-1">
            <li>
              {d.classPos != null
                ? t("debrief.result", { status, p: d.classPos, n: d.classCount ?? "?" })
                : t("debrief.resultNoPlace", { status })}
              {d.overallPos != null && d.classCount != null && d.overallPos !== d.classPos && (
                <span className="text-muted-foreground"> {t("debrief.overall", { p: d.overallPos })}</span>
              )}
              {d.placesGained != null && (
                <span className="text-muted-foreground">
                  {" · "}
                  {t("debrief.grid", { n: `${d.placesGained > 0 ? "+" : ""}${d.placesGained}`, from: d.gridClassPos })}
                </span>
              )}
            </li>
            {d.isRace && (
              <li>
                {t("debrief.stops", { n: d.stops })}
                {d.topClassStops != null && <span className="text-muted-foreground"> · {t("debrief.topStops", { n: d.topClassStops })}</span>}
                {d.pitLossS != null && <span className="text-muted-foreground"> · {t("debrief.pitLoss", { s: d.pitLossS.toFixed(1) })}</span>}
              </li>
            )}
            {d.bestLap != null && (
              <li>
                {t("debrief.best", { t: formatTime(d.bestLap) })}
                {d.classBestLap != null && (
                  <span className="text-muted-foreground"> · {t("debrief.classBest", { t: formatTime(d.classBestLap), gap: gap(d.bestLap - d.classBestLap) })}</span>
                )}
                {d.optimalLap != null && <span className="text-muted-foreground"> · {t("debrief.optimal", { t: formatTime(d.optimalLap) })}</span>}
              </li>
            )}
            {d.cleanLaps > 0 && d.medianLap != null && (
              <li>
                {t("debrief.regularity", {
                  n: d.cleanLaps,
                  t: formatTime(d.medianLap),
                  pct: d.within05 != null ? Math.round(d.within05 * 100) : "?",
                })}
              </li>
            )}
            {d.sectorLosses.length > 0 && (
              <li>
                {t("debrief.sectors")}{" "}
                {d.sectorLosses.map((s) => `S${s.sector} ${s.lossS.toFixed(3)} s`).join(" · ")}
              </li>
            )}
            {d.lastStintWearPct != null && <li>{t("debrief.wear", { pct: d.lastStintWearPct.toFixed(2), n: d.lastStintLaps })}</li>}
            {(d.trackLimits > 0 || d.penalties > 0 || d.contacts > 0) && (
              <li>{t("debrief.incidents", { l: d.trackLimits, p: d.penalties, c: d.contacts })}</li>
            )}
          </ul>

          {d.swings.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">{t("debrief.swingsTitle")}</div>
              <ul className="space-y-0.5">
                {[...d.swings]
                  .sort((a, b) => a.lap - b.lap)
                  .map((s) => (
                    <li key={s.lap} className={s.delta > 0 ? "text-emerald-600" : "text-amber-600"}>
                      {t("debrief.swing", { lap: s.lap, from: s.from, to: s.to })}
                      {s.cause && <span className="text-muted-foreground"> — {t(`debrief.cause_${s.cause}`)}</span>}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">{t("debrief.familiesTitle")}</div>
            {d.families.length ? (
              <div className="flex flex-wrap gap-1.5">
                {d.families.map((f) => (
                  <span key={f.family} className="rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs">
                    {famText(f)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">{t("debrief.familiesNone")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <Repeat2 className="h-4 w-4 text-primary" />
            <span className="font-semibold">{t("debrief.recurringTitle")}</span>
          </div>
          {rec == null ? (
            <p className="text-muted-foreground">{t("debrief.loading")}</p>
          ) : rec.defect ? (
            <p>
              {t("debrief.recurring", {
                what: t(`debrief.recurName_${rec.defect.family}`),
                occ: rec.defect.occurrences,
                n: rec.defect.races,
              })}
              {rec.defect.trend && <span className="text-muted-foreground"> · {t(`debrief.trend_${rec.defect.trend}`)}</span>}
            </p>
          ) : rec.races < MIN_RACES ? (
            <p className="text-muted-foreground">{t("debrief.recurringFew", { n: rec.races, min: MIN_RACES })}</p>
          ) : (
            <p className="text-muted-foreground">{t("debrief.recurringNone")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
