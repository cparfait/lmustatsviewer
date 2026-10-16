import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { eventsForSession, type LiveEvent } from "@/lib/liveEvents";
import { loadEvents, useEventsStore } from "@/lib/useLiveEvents";
import { cn } from "@/lib/utils";

const TONE: Record<LiveEvent["kind"], string> = {
  overtake: "text-emerald-500",
  start: "text-emerald-500",
  wheelToWheel: "text-sky-500",
  lostPlace: "text-amber-600",
  contact: "text-red-500",
  trackLimits: "text-amber-600",
  offTrack: "text-purple-500",
};

/**
 * Temps forts et incidents enregistrés en direct pendant cette séance
 * (repères par tour) : rien n'apparaît si la séance n'a pas été roulée avec
 * l'app ouverte.
 */
export function SessionMoments({ track, timestamp, durationS, isRace }: { track: string; timestamp: number; durationS: number; isRace: boolean }) {
  const { t } = useTranslation();
  const events = useEventsStore((s) => s.events);
  useEffect(() => {
    void loadEvents();
  }, []);
  const list = useMemo(() => eventsForSession(events, track, timestamp, durationS, isRace), [events, track, timestamp, durationS, isRace]);
  if (!list.length) return null;
  return (
    <Card className="mb-4">
      <CardContent className="p-4 flex flex-col gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {t("sessionDetail.moments")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("sessionDetail.momentsDesc")}</p>
        <ul className="text-sm flex flex-col gap-1">
          {list.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{t("sessionDetail.momentLap", { n: e.lap })}</span>
              <span className={cn("font-medium", TONE[e.kind])}>
                {t(`live.incident.${e.kind === "start" && (e.value ?? 0) < 0 ? "startLost" : e.kind}`, { name: e.detail ?? "", count: Math.abs(e.value ?? 0) })}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
