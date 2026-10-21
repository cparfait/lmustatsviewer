/**
 * Vue télémétrie › Atelier (opt-in) :
 * - zones ABS / TC (où les aides travaillent, sur combien de tours) et effet
 *   mesuré du dernier changement de niveau (deux nombres, aucun verdict) ;
 * - vigie de la plateforme : tours qui s'écartent du meilleur tour (constat).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Gauge, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { telemetry, type AidEffect, type LabTelemetryReport } from "@/lib/api";
import { FLAG_AIDS_ZONES, FLAG_PLATFORM_WATCH, useConfigFlag } from "@/lib/configFlag";
import { platformWatch } from "@/lib/platformWatch";
import { cn, formatTime } from "@/lib/utils";
import { SECTION_TITLE } from "@/components/telemetry/viewParts";

function Title({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={cn("mb-1.5 flex items-center gap-1.5", SECTION_TITLE)}>
      {icon}
      {children}
    </div>
  );
}

export function TelemetryLabPanel({ path }: { path: string }) {
  const { t } = useTranslation();
  const aidsOn = useConfigFlag(FLAG_AIDS_ZONES);
  const platformOn = useConfigFlag(FLAG_PLATFORM_WATCH);
  const [report, setReport] = useState<LabTelemetryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!aidsOn && !platformOn) return;
    let alive = true;
    setLoading(true);
    setError(false);
    telemetry
      .analyzeLab(path)
      .then((r) => alive && setReport(r))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, aidsOn, platformOn]);

  const watch = useMemo(() => (report ? platformWatch(report.laps) : null), [report]);
  if (!aidsOn && !platformOn) return null;

  const effect = (e: AidEffect) =>
    e.laps === 0
      ? t("lab.tele.noLaps")
      : t("lab.tele.effect", {
          count: e.laps,
          lap: e.avg_lap != null ? formatTime(e.avg_lap) : "—",
          active: e.avg_active_s != null ? e.avg_active_s.toFixed(1) : "—",
        });

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-3 text-xs">
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {error && <p className="text-muted-foreground">{t("lab.tele.error")}</p>}
        {report && aidsOn && (
          <div>
            <Title icon={<Activity className="h-3.5 w-3.5" />}>{t("lab.tele.aidsTitle")}</Title>
            {report.zones.length === 0 ? (
              <p className="text-muted-foreground">{t("lab.tele.noZones")}</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {report.zones.map((z) => (
                  <li key={`${z.aid}${z.from_m}`} className="flex items-baseline justify-between gap-2">
                    <span>
                      <span className="mr-1.5 rounded bg-muted px-1 font-mono text-micro uppercase">{z.aid}</span>
                      {t("lab.tele.zone", { from: Math.round(z.from_m), to: Math.round(z.to_m) })}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {t("lab.tele.zoneLaps", { count: z.laps, s: z.seconds.toFixed(1) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {report.changes.map((c) => (
              <div key={c.aid} className="mt-2 rounded-md border border-border/60 p-2">
                <div className="font-medium">
                  {t("lab.tele.change", { aid: c.aid.toUpperCase(), from: c.from, to: c.to, lap: c.lap })}
                </div>
                <div className="text-muted-foreground">
                  {t("lab.tele.before")} : {effect(c.before)}
                </div>
                <div className="text-muted-foreground">
                  {t("lab.tele.after")} : {effect(c.after)}
                </div>
              </div>
            ))}
            <p className="mt-1.5 text-micro text-muted-foreground">{t("lab.tele.aidsHint")}</p>
          </div>
        )}
        {report && platformOn && watch && (
          <div>
            <Title icon={<Gauge className="h-3.5 w-3.5" />}>{t("lab.tele.platformTitle")}</Title>
            {watch.bestLap == null ? (
              <p className="text-muted-foreground">{t("lab.tele.platformFew")}</p>
            ) : watch.flags.length === 0 ? (
              <p className="text-muted-foreground">{t("lab.tele.platformOk", { lap: watch.bestLap })}</p>
            ) : (
              <>
                <p className="mb-1 text-muted-foreground">{t("lab.tele.platformRef", { lap: watch.bestLap })}</p>
                <ul className="flex flex-col gap-0.5">
                  {watch.flags.map((f) => (
                    <li key={`${f.lap}${f.metric}`} className="flex items-baseline justify-between gap-2">
                      <span>
                        {t("lab.tele.lapN", { n: f.lap })} · {t(`lab.tele.m.${f.metric}`)}
                      </span>
                      <span className={f.rel > 0 ? "tabular-nums text-amber-600" : "tabular-nums text-sky-600"}>
                        {f.rel > 0 ? "+" : ""}
                        {Math.round(f.rel * 100)} %
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-1.5 text-micro text-muted-foreground">{t("lab.tele.platformHint")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
