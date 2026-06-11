/**
 * Détection de virages à partir d'un tour de télémétrie (vitesse + frein +
 * distance). Algorithme : minima locaux de vitesse avec proéminence (capte aussi
 * les virages en levée de pied), fusion des plateaux, puis remontée jusqu'au
 * point de freinage (ou au max de vitesse précédent si pas de freinage).
 *
 * Extrait de `TelemetryView` pour être réutilisé par le contexte du Coach IA.
 */

export interface Corner {
  /** Numéro de virage (1-based, ordre sur le tour). */
  n: number;
  /** Index du point de freinage / entrée. */
  brakeIdx: number;
  /** Distance (m) du point de freinage. */
  brakeDist: number;
  /** Index de l'apex (vitesse minimale). */
  apexIdx: number;
  /** Vitesse minimale au virage (km/h, valeur brute). */
  minSpeed: number;
}

export function detectCorners(
  rawSpeed: number[],
  brake: number[],
  dist: number[],
): Corner[] {
  const N = rawSpeed.length;
  if (N < 20 || dist.length < N || brake.length < N) return [];

  // Lissage léger de la vitesse (réduit le bruit pour la détection d'apex).
  const W = 4;
  const sp = new Array<number>(N);
  for (let k = 0; k < N; k++) {
    let s = 0;
    let c = 0;
    for (let j = -W; j <= W; j++) {
      const m = k + j;
      if (m >= 0 && m < N) {
        s += rawSpeed[m];
        c++;
      }
    }
    sp[k] = s / c;
  }
  const maxS = Math.max(...sp);

  // Apex = minima locaux de vitesse, avec proéminence.
  const WIN = 12;
  const PROM = 8; // km/h de creux minimum
  const apexes: number[] = [];
  for (let k = WIN; k < N - WIN; k++) {
    const v = sp[k];
    if (v > maxS * 0.95) continue; // quasi-vmax → ligne droite
    let isMin = true;
    let leftMax = -Infinity;
    let rightMax = -Infinity;
    for (let j = 1; j <= WIN; j++) {
      if (sp[k - j] < v || sp[k + j] < v) {
        isMin = false;
        break;
      }
      leftMax = Math.max(leftMax, sp[k - j]);
      rightMax = Math.max(rightMax, sp[k + j]);
    }
    if (!isMin || Math.min(leftMax, rightMax) - v < PROM) continue;
    apexes.push(k);
  }
  // Fusion des minima trop proches (plateau) → garde le plus bas.
  const merged: number[] = [];
  for (const a of apexes) {
    const last = merged[merged.length - 1];
    if (last != null && a - last < WIN) {
      if (sp[a] < sp[last]) merged[merged.length - 1] = a;
    } else merged.push(a);
  }

  // Pour chaque apex : point de freinage (début d'appui frein avant l'apex,
  // sinon entrée = max de vitesse précédent pour les virages sans freinage).
  return merged.map((apex, idx) => {
    let bp = apex;
    let k = apex;
    while (k > 0 && brake[k] < 5 && apex - k < 40) k--;
    if (brake[k] >= 5) {
      while (k > 0 && brake[k] >= 5) k--;
      bp = k + 1;
    } else {
      let e = apex;
      for (let m = apex; m > 0 && apex - m < 200; m--) {
        if (sp[m] > sp[e]) e = m;
      }
      bp = e;
    }
    return {
      n: idx + 1,
      brakeIdx: bp,
      brakeDist: dist[bp],
      apexIdx: apex,
      minSpeed: rawSpeed[apex],
    };
  });
}

const MAX_CORNERS = 24;

/** Résumé textuel des virages pour le contexte du coach. */
export function summarizeCorners(corners: Corner[]): string {
  if (corners.length === 0) return "";
  const lines = corners
    .slice(0, MAX_CORNERS)
    .map((c) => `T${c.n}: brake @ ${(c.brakeDist / 1000).toFixed(2)} km → min ${c.minSpeed.toFixed(0)} km/h`);
  return lines.join("\n");
}
