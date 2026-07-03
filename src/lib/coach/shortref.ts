/**
 * Réf *courte* : médiane glissante des N derniers passages propres par virage
 * (COACH-LIVE-SPEC.md §3.3, §3.4, P3.2) — module **pur**.
 *
 * La réf dense (best/ghost) est la meilleure cible possible, mais elle peut être
 * **périmée** (autre build, température écartée, pneus différents — §3.3) ou tout
 * simplement absente au début d'une session. La réf courte fournit une base
 * **toujours valide dans les conditions du moment** : « tu freines 12 m plus tôt
 * que **d'habitude** ». C'est :
 *
 *  - la **cible par défaut** quand la réf dense est indicative (deltas relatifs
 *    seulement, jamais de chiffre absolu de point de freinage) ;
 *  - un **garde-fou de confirmation** quand la réf dense est fraîche : on n'alerte
 *    que si l'écart se confirme **sur les deux réfs** (§3.3), ce qui tue les faux
 *    positifs dus au bruit ou à une trajectoire ponctuelle.
 *
 * On agrège par **médiane** (robuste à un passage aberrant, contrairement à la
 * moyenne) sur les 3 derniers passages **non tainted** du virage. La réf courte ne
 * peut exister que si le moteur produit des `corner-passed`, donc uniquement quand
 * une réf dense a projeté des fenêtres — pas de réf courte « en Découverte pure ».
 *
 * Déterministe (aucune horloge, aucune I/O) → rejouable/testable (§14).
 */

import type { CornerMeasurement } from "./engine";

/** Nombre de passages propres agrégés (§3.3 : « 3 derniers tours propres »). */
export const SHORT_REF_WINDOW = 3;
/** Passages minimaux pour qu'une réf courte soit exploitable (médiane crédible). */
export const SHORT_REF_MIN = 2;

/** Un passage propre retenu pour la médiane (champs mesurés utiles au diagnostic). */
interface ShortSample {
  brakeDist: number;
  vmin: number;
  vexit: number;
  fullThrottleDist: number;
  gLatMax: number;
  brakeReleaseDist: number;
}

/** Cibles « habituelles » du virage (médianes) — même forme que les cibles de réf. */
export interface ShortRefTargets {
  brakeDist: number;
  vmin: number;
  vexit: number;
  fullThrottleDist: number;
  gLatMax: number;
  brakeReleaseDist: number;
  /** Nombre de passages agrégés (≥ SHORT_REF_MIN pour être servi). */
  n: number;
}

/** État de la réf courte : un anneau de passages propres par `corner_uid`. */
export interface ShortRefState {
  corners: Map<string, ShortSample[]>;
}

export function createShortRefState(): ShortRefState {
  return { corners: new Map() };
}

/** Médiane d'un échantillon (⩽ 3 valeurs ici) : trie et prend le milieu. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  const mid = n >> 1;
  return n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Enregistre un passage dans la réf courte **s'il est propre** (fenêtre non
 * tainted : ni pit, ni reset, ni couverture partielle du tampon). Un passage
 * douteux ne doit pas fixer « l'habitude ». Garde les `SHORT_REF_WINDOW` derniers.
 */
export function updateShortRef(state: ShortRefState, m: CornerMeasurement): void {
  if (m.tainted) return;
  let ring = state.corners.get(m.corner_uid);
  if (!ring) {
    ring = [];
    state.corners.set(m.corner_uid, ring);
  }
  ring.push({
    brakeDist: m.brakeDist,
    vmin: m.vmin,
    vexit: m.vexit,
    fullThrottleDist: m.fullThrottleDist,
    gLatMax: m.gLatMax,
    brakeReleaseDist: m.brakeReleaseDist,
  });
  if (ring.length > SHORT_REF_WINDOW) ring.shift();
}

/**
 * Cibles habituelles d'un virage (médiane des passages retenus), ou `null` tant
 * qu'on n'a pas `SHORT_REF_MIN` passages propres (habitude pas encore crédible).
 */
export function shortRefTargets(
  state: ShortRefState,
  uid: string,
): ShortRefTargets | null {
  const ring = state.corners.get(uid);
  if (!ring || ring.length < SHORT_REF_MIN) return null;
  return {
    brakeDist: median(ring.map((s) => s.brakeDist)),
    vmin: median(ring.map((s) => s.vmin)),
    vexit: median(ring.map((s) => s.vexit)),
    fullThrottleDist: median(ring.map((s) => s.fullThrottleDist)),
    gLatMax: median(ring.map((s) => s.gLatMax)),
    brakeReleaseDist: median(ring.map((s) => s.brakeReleaseDist)),
    n: ring.length,
  };
}
