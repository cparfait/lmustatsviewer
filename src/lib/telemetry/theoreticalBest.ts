/**
 * Référence « meilleur théorique self » (sans données pro).
 *
 * Pour chaque virage du tour analysé, on cherche la **meilleure vitesse d'apex**
 * atteinte à ce virage sur l'ENSEMBLE des tours du pilote (appariement par
 * distance du point de freinage). L'écart révèle où, même sur son meilleur tour,
 * le pilote reste sous son propre optimum (« au T7 tu fais 95, ton meilleur 102 »).
 *
 * Local, gratuit, honnête (même voiture/circuit/conditions). Donne des deltas de
 * vitesse d'apex — pas de temps perdu (ça exige une trace de référence alignée).
 */

import type { Corner } from "./corners";

export interface ApexBest {
  n: number;
  brakeDist: number; // m
  minSpeed: number; // km/h (tour analysé)
  bestSpeed: number; // km/h (meilleur sur tous les tours, à ce virage)
  delta: number; // km/h (négatif = sous son meilleur)
}

const MATCH_WINDOW_M = 150;
const SIGNIFICANT = 2; // km/h : seuil pour considérer un écart « réel »

/**
 * `target` = virages du tour analysé. `allLaps` = virages de tous les tours
 * (le tour analysé peut y figurer, sans incidence : on prend le max).
 */
export function compareToBestApex(target: Corner[], allLaps: Corner[][]): ApexBest[] {
  return target.map((c) => {
    let best = c.minSpeed;
    for (const laps of allLaps) {
      // Sur chaque tour, on ne retient que le virage LE PLUS PROCHE de `c` dans la
      // fenêtre — et non n'importe quel virage qui la chevauche. Sur un tracé serré
      // (enchaînement, chicane), deux virages voisins ne se prêtent plus leur
      // vitesse d'apex, ce qui évite un « meilleur théorique » trop optimiste.
      let nearest: Corner | null = null;
      let nearestGap = MATCH_WINDOW_M;
      for (const o of laps) {
        const gap = Math.abs(o.brakeDist - c.brakeDist);
        if (gap <= nearestGap) {
          nearestGap = gap;
          nearest = o;
        }
      }
      if (nearest && nearest.minSpeed > best) best = nearest.minSpeed;
    }
    return {
      n: c.n,
      brakeDist: c.brakeDist,
      minSpeed: c.minSpeed,
      bestSpeed: best,
      delta: c.minSpeed - best,
    };
  });
}

/** Résumé (EN, compact) pour le contexte du coach. Met en avant les virages sous l'optimum. */
export function summarizeTheoreticalBest(rows: ApexBest[]): string {
  if (rows.length === 0) return "";
  const below = rows
    .filter((r) => r.delta <= -SIGNIFICANT)
    .sort((a, b) => a.delta - b.delta);
  const lines: string[] = [];
  lines.push("## Vs your theoretical best (best apex speed per corner across all your laps)");
  if (below.length === 0) {
    lines.push("This lap is at/near your personal best apex in every corner.");
    return lines.join("\n");
  }
  for (const r of below) {
    lines.push(
      `T${r.n} @ ${(r.brakeDist / 1000).toFixed(2)}km: apex ${r.minSpeed.toFixed(0)} km/h — your best here ${r.bestSpeed.toFixed(0)} (${r.delta.toFixed(0)})`,
    );
  }
  return lines.join("\n");
}
