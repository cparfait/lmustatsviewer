/**
 * Détection de virages à partir d'un tour de télémétrie (vitesse + frein +
 * distance). Algorithme : minima locaux de vitesse avec proéminence (capte aussi
 * les virages en levée de pied), fusion des plateaux, puis remontée jusqu'au
 * point de freinage (ou au max de vitesse précédent si pas de freinage).
 *
 * Extrait de `TelemetryView` pour être réutilisé par le contexte du Coach IA.
 */

/** Écart entre deux points pour lequel les fenêtres ci-dessous ont été réglées (m). */
const REF_STEP_M = 6;
/**
 * Détection fine : remontée de vitesse mesurée sur ±150 m autour du creux (au lieu
 * de la seule fenêtre du minimum local, ≈ ±72 m). À la sortie d'un virage lent la
 * voiture réaccélère progressivement : sur ±72 m la vitesse ne remonte souvent que de
 * 3 à 7 km/h et le virage était ignoré (Spa : Malmedy, Campus, Blanchimont, chicane).
 */
export const FINE_PROM_WINDOW_M = 150;

export interface DetectCornersOptions {
  /** Proéminence mesurée sur ±`FINE_PROM_WINDOW_M` (désactivé = comportement d'origine). */
  fine?: boolean;
}

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

/**
 * @param rawSpeed vitesse (km/h)
 * @param brake pression de frein en POURCENTS (0-100) — les seuils internes
 *   (appui ≥ 5) supposent cette échelle. Un canal fraction [0,1] (télémétrie
 *   live brute) doit être multiplié par 100 par l'appelant.
 * @param dist distance parcourue sur le tour (m)
 */
export function detectCorners(
  rawSpeed: number[],
  brake: number[],
  dist: number[],
  opts?: DetectCornersOptions,
): Corner[] {
  const N = rawSpeed.length;
  if (N < 20 || dist.length < N || brake.length < N) return [];

  // Fenêtres réglées à l'origine pour ~1 000 points par tour (≈ 6 m entre deux
  // points) : on les convertit en distance pour qu'elles gardent la même taille en
  // mètres quelle que soit la résolution (4 000 points du lecteur, pleine résolution
  // du coach). Sans cela, à 4 000 points, aucun creux n'atteignait la proéminence
  // dans ±12 points (±0,45 s) et aucun virage n'était détecté. Jamais plus petites
  // qu'avant : rien ne change en basse résolution.
  const span = Math.abs((dist[N - 1] ?? 0) - (dist[0] ?? 0));
  const step = span > 0 ? span / (N - 1) : REF_STEP_M;
  const scale = (samples: number) => Math.max(samples, Math.round((samples * REF_STEP_M) / step));

  // Lissage léger de la vitesse (réduit le bruit pour la détection d'apex).
  const W = scale(4);
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
  // Boucle (et non `Math.max(...sp)`) : le spread d'un tableau pleine résolution
  // peut dépasser la limite d'arguments du moteur JS (RangeError).
  let maxS = -Infinity;
  for (const v of sp) if (v > maxS) maxS = v;

  // Apex = minima locaux de vitesse, avec proéminence.
  const WIN = scale(12);
  const PROM = 8; // km/h de creux minimum
  // Fenêtre où l'on mesure la remontée de vitesse (proéminence) : celle du minimum
  // local par défaut, ±150 m en détection fine.
  const PW = opts?.fine ? Math.max(WIN, Math.round(FINE_PROM_WINDOW_M / step)) : WIN;
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
    if (!isMin) continue;
    for (let j = WIN + 1; j <= PW; j++) {
      if (k - j >= 0) leftMax = Math.max(leftMax, sp[k - j]);
      if (k + j < N) rightMax = Math.max(rightMax, sp[k + j]);
    }
    if (Math.min(leftMax, rightMax) - v < PROM) continue;
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
  const BRAKE_BACK = scale(40);
  const ENTRY_BACK = scale(200);
  return merged.map((apex, idx) => {
    let bp = apex;
    let k = apex;
    while (k > 0 && brake[k] < 5 && apex - k < BRAKE_BACK) k--;
    if (brake[k] >= 5) {
      while (k > 0 && brake[k] >= 5) k--;
      bp = k + 1;
    } else {
      let e = apex;
      for (let m = apex; m > 0 && apex - m < ENTRY_BACK; m--) {
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
