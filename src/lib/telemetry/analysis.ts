/**
 * Analyse assistée d'un tour de télémétrie (#90 / #92).
 *
 * À partir des virages détectés (`detectCorners`) et — si une référence est
 * choisie — du delta de temps cumulé réaligné par distance, on calcule :
 *  - le **temps perdu/gagné par virage** (variation du delta sur le segment du virage) ;
 *  - l'**écart de vitesse à l'apex** vs référence ;
 *  - le **point le plus lent** du tour ;
 *  - les **focus zones** : les virages où l'on perd le plus de temps (#92).
 *
 * Tout est dérivé de NOS données (vitesse, distance, delta) — aucune valeur
 * inventée. Sans référence, seuls les indicateurs absolus sont renseignés.
 */

import type { Corner } from "./corners";

export interface CornerAnalysis extends Corner {
  /** Distance (m) de l'apex. */
  apexDist: number;
  /** Vitesse mini de référence sur le segment du virage (km/h), si comparaison. */
  refMinSpeed: number | null;
  /** Écart de vitesse à l'apex vs référence (km/h ; négatif = plus lent). */
  speedDelta: number | null;
  /** Temps perdu/gagné sur le segment du virage vs réf. (s ; positif = perdu). */
  timeLost: number | null;
  /** Décomposition du temps perdu par phase (s, signés) ; `null` sans réf./canaux. */
  phaseLoss: { braking: number; mid: number; exit: number } | null;
  /** Rang dans les zones à travailler (1 = pire perte) ; `null` hors top. */
  focusRank: number | null;
}

export interface LapAnalysis {
  corners: CornerAnalysis[];
  /** Point le plus lent du tour. */
  slowest: { dist: number; speed: number; idx: number } | null;
  /** Temps total perdu dans les virages vs réf. (s, ≥ 0) ; `null` sans comparaison. */
  totalCornerLoss: number | null;
  /** Vrai si une référence est disponible (active les colonnes de comparaison). */
  hasRef: boolean;
}

/** Nombre de focus zones mises en avant. */
const FOCUS_COUNT = 3;
/** Perte minimale (s) pour qu'un virage soit considéré comme focus zone (anti-bruit). */
const FOCUS_MIN_LOSS = 0.03;

export function analyzeLap(
  corners: Corner[],
  rawSpeed: number[],
  dist: number[],
  delta: number[] | null,
  refSpeed: number[] | null,
  brake?: number[] | null,
  throttle?: number[] | null,
): LapAnalysis {
  const n = rawSpeed.length;
  const hasRef = !!delta && !!refSpeed && delta.length === n && refSpeed.length === n;

  // Point le plus lent du tour (mini de vitesse absolu).
  let slowest: LapAnalysis["slowest"] = null;
  for (let k = 0; k < n; k++) {
    if (!slowest || rawSpeed[k] < slowest.speed) {
      slowest = { dist: dist[k] ?? 0, speed: rawSpeed[k], idx: k };
    }
  }

  const analyzed: CornerAnalysis[] = corners.map((c, i) => {
    // Segment du virage : du point de freinage à celui du virage suivant (ou fin).
    const startIdx = c.brakeIdx;
    const endIdx = i + 1 < corners.length ? corners[i + 1].brakeIdx : n - 1;

    let timeLost: number | null = null;
    let refMinSpeed: number | null = null;
    let speedDelta: number | null = null;
    if (hasRef && delta && refSpeed) {
      timeLost = (delta[endIdx] ?? 0) - (delta[startIdx] ?? 0);
      let rmin = Infinity;
      for (let k = startIdx; k <= endIdx; k++) {
        if (refSpeed[k] < rmin) rmin = refSpeed[k];
      }
      refMinSpeed = isFinite(rmin) ? rmin : null;
      speedDelta = refMinSpeed != null ? c.minSpeed - refMinSpeed : null;
    }

    // Décomposition du temps perdu par phase : on lit le delta cumulé aligné aux
    // frontières freinage / milieu / sortie (fin du frein, 1re remise de gaz).
    let phaseLoss: CornerAnalysis["phaseLoss"] = null;
    if (hasRef && delta && brake && throttle) {
      const apex = c.apexIdx;
      let brakeEnd = startIdx;
      for (let k = startIdx; k <= apex && k < n; k++) if ((brake[k] ?? 0) > 5) brakeEnd = k;
      let thrStart = apex;
      for (let k = apex; k <= endIdx && k < n; k++) {
        if ((throttle[k] ?? 0) > 10) {
          thrStart = k;
          break;
        }
      }
      const at = (i: number) => delta[Math.max(startIdx, Math.min(endIdx, i))] ?? 0;
      brakeEnd = Math.max(startIdx, Math.min(brakeEnd, apex));
      thrStart = Math.max(brakeEnd, Math.min(thrStart, endIdx));
      phaseLoss = {
        braking: at(brakeEnd) - at(startIdx),
        mid: at(thrStart) - at(brakeEnd),
        exit: at(endIdx) - at(thrStart),
      };
    }

    return {
      ...c,
      apexDist: dist[c.apexIdx] ?? 0,
      refMinSpeed,
      speedDelta,
      timeLost,
      phaseLoss,
      focusRank: null,
    };
  });

  let totalCornerLoss: number | null = null;
  if (hasRef) {
    totalCornerLoss = analyzed.reduce((s, c) => s + Math.max(0, c.timeLost ?? 0), 0);
    // Focus zones : virages classés par perte de temps décroissante.
    [...analyzed]
      .filter((c) => (c.timeLost ?? 0) >= FOCUS_MIN_LOSS)
      .sort((a, b) => (b.timeLost ?? 0) - (a.timeLost ?? 0))
      .slice(0, FOCUS_COUNT)
      .forEach((c, idx) => {
        c.focusRank = idx + 1;
      });
  }

  return { corners: analyzed, slowest, totalCornerLoss, hasRef };
}

/**
 * Résumé textuel (EN, compact) de la comparaison par virage pour le contexte du
 * Coach IA. Vide si pas de référence. Met en avant les zones à travailler.
 */
/** « — mostly braking (65%) » à partir de la décomposition par phase. */
function dominantPhase(pl: CornerAnalysis["phaseLoss"]): string {
  if (!pl) return "";
  const total = pl.braking + pl.mid + pl.exit;
  if (total <= 0.02) return "";
  const entries: [string, number][] = [
    ["braking", pl.braking],
    ["mid-corner", pl.mid],
    ["exit", pl.exit],
  ];
  const top = entries.sort((x, y) => y[1] - x[1])[0];
  if (top[1] <= 0) return "";
  return ` — mostly ${top[0]} (${Math.round((top[1] / total) * 100)}%)`;
}

export function summarizeLapAnalysis(a: LapAnalysis): string {
  if (!a.hasRef || a.corners.length === 0) return "";
  const lines: string[] = [];
  lines.push("## Corner comparison vs reference lap (apex speed + time lost)");
  if (a.totalCornerLoss != null) {
    lines.push(`Total time lost in corners: ${a.totalCornerLoss >= 0 ? "+" : ""}${a.totalCornerLoss.toFixed(3)} s`);
  }
  const fmtDelta = (v: number | null) =>
    v == null ? "" : ` (${v >= 0 ? "+" : ""}${v.toFixed(0)} km/h vs ref)`;
  const fmtLost = (v: number | null) =>
    v == null ? "" : `, ${v >= 0 ? "+" : ""}${v.toFixed(2)} s`;
  // Zones à travailler en tête.
  const focus = a.corners
    .filter((c) => c.focusRank != null)
    .sort((x, y) => (x.focusRank ?? 0) - (y.focusRank ?? 0));
  if (focus.length > 0) {
    lines.push("Focus zones (most time lost):");
    for (const c of focus) {
      lines.push(
        `  T${c.n}: apex ${c.minSpeed.toFixed(0)} km/h${fmtDelta(c.speedDelta)}${fmtLost(c.timeLost)}${dominantPhase(c.phaseLoss)}`,
      );
    }
  }
  // Tous les virages (vue compacte).
  lines.push("All corners:");
  for (const c of a.corners) {
    lines.push(`  T${c.n} @ ${(c.apexDist / 1000).toFixed(2)} km: ${c.minSpeed.toFixed(0)} km/h${fmtDelta(c.speedDelta)}${fmtLost(c.timeLost)}`);
  }
  if (a.slowest) {
    lines.push(`Slowest point: ${a.slowest.speed.toFixed(0)} km/h @ ${(a.slowest.dist / 1000).toFixed(2)} km`);
  }
  return lines.join("\n");
}
