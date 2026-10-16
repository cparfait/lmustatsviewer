/**
 * Numéros (et noms en infobulle) officiels des virages sur la carte Live.
 * Rien n'est affiché si la fiche du circuit manque ou si le nombre de virages
 * détectés sur le tracé ne correspond pas à la numérotation officielle.
 */

import { useMemo } from "react";
import type { Pt } from "@/lib/trackMapGeom";
import { officialCornerLabels } from "@/lib/trackCorners";

export function CornerLabels({
  track,
  pts,
  dists,
  project,
}: {
  track: string;
  pts: Pt[];
  dists: number[];
  lapLen: number;
  project: (p: Pt) => Pt;
}) {
  // Le tracé change peu : on ne recalcule qu'au changement de taille.
  const labels = useMemo(() => officialCornerLabels(track, pts, dists), [track, pts.length, dists.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!labels.length) return null;
  return (
    <g pointerEvents="none">
      {labels.map((c) => {
        const [x, y] = project(pts[c.idx]);
        return (
          <g key={c.n}>
            {c.name && <title>{`${c.n} — ${c.name}`}</title>}
            <circle cx={x} cy={y} r={15} fill="#0A0E1A" stroke="#ffffff" strokeWidth={2} opacity={0.85} />
            <text x={x} y={y + 6} textAnchor="middle" fontSize={17} fontWeight="bold" fill="#ffffff">
              {c.n}
            </text>
          </g>
        );
      })}
    </g>
  );
}
