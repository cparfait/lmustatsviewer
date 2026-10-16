import { useTranslation } from "react-i18next";
import { nearestIndex } from "@/lib/trackMapGeom";
import { INCIDENT_KINDS, type EventKind } from "@/lib/liveEvents";
import { useEventsStore } from "@/lib/useLiveEvents";
import { useAppStore } from "@/stores/app";

type Pt = [number, number];

const COLOR: Partial<Record<EventKind, string>> = { contact: "#ef4444", trackLimits: "#f59e0b", offTrack: "#a855f7" };

/**
 * Carte des incidents : mes chocs, coupures et sorties de piste sur ce circuit,
 * toutes séances confondues, placés par distance dans le tour. Réglage
 * `mapIncidents` (la carte reste comme avant quand il est coupé).
 */
export function IncidentDots({ track, pts, dists, project }: { track: string; pts: Pt[]; dists: number[]; project: (p: Pt) => Pt }) {
  const { t } = useTranslation();
  const show = useAppStore((s) => s.mapIncidents);
  const events = useEventsStore((s) => s.events);
  if (!show || !track || !dists.length) return null;
  const list = events.filter((e) => e.track === track && INCIDENT_KINDS.includes(e.kind) && e.lapDist > 0).slice(-300);
  return (
    <g pointerEvents="none">
      {list.map((e, i) => {
        const idx = nearestIndex(dists, e.lapDist);
        if (idx < 0 || !pts[idx]) return null;
        const [x, y] = project(pts[idx]);
        return (
          <circle key={i} cx={x} cy={y} r={9} fill={COLOR[e.kind]} fillOpacity={0.35} stroke={COLOR[e.kind]} strokeOpacity={0.6}>
            <title>{t(`live.incident.${e.kind}`)}</title>
          </circle>
        );
      })}
    </g>
  );
}
