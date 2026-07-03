/**
 * Fenêtres de virage curvilignes + identité stable (COACH-LIVE-SPEC.md §4.2).
 *
 * Une **fenêtre** couvre `[brakeDist − 150 m ; exitDist]` : toutes les métriques
 * du coach sont des agrégats DANS la fenêtre (jamais point à point), si bien
 * qu'une trajectoire de dépassement qui déplace l'apex de 15 m laisse la mesure
 * définie. La fenêtre se **ferme** à la sortie (`exitDist`), pas à l'apex.
 *
 * Deux origines de fenêtres :
 *  - **projetées depuis la réf** (cas nominal live) : bornes figées par le
 *    meilleur tour, on n'a plus qu'à mesurer le tour courant dedans ;
 *  - **auto-détectées** sur un tour bouclé (pas de réf, ou construction de réf
 *    P1.3) : `detectCorners` (freinage) complété d'un détecteur **gLat** pour
 *    les virages à fond (Eau Rouge) que l'algo vitesse-seule rate.
 *
 * L'**identité** d'un virage (`corner_uid`) survit aux re-détections : on
 * apparie par `|apexDist_new − apexDist_old| < 40 m`. La mémoire chronique
 * s'indexe sur cet UID, jamais sur l'ordre `n` (qui bouge dès qu'un kink apparaît).
 */

import { detectCorners } from "@/lib/telemetry/corners";
import type { CoachRef, CoachCornerRow } from "@/lib/api";

/** Ordre fixe des 8 canaux d'une réf dense (§3.1). */
export const CHANNELS = [
  "time",
  "speed",
  "brake",
  "throttle",
  "steer",
  "gLat",
  "gLong",
  "gear",
] as const;
export type ChannelName = (typeof CHANNELS)[number];

/** Recul de la borne d'entrée avant le point de freinage (m). */
export const WINDOW_LEAD_M = 150;
/** Tolérance d'appariement d'apex pour conserver un `corner_uid` (m). */
export const APEX_MATCH_M = 40;
/** Seuil « plein gaz » pour la sortie (%). */
const FULL_THROTTLE_PCT = 95;
/** Seuil de gLat soutenu pour un virage à fond (g). */
const GLAT_FLAT_G = 1.0;

/** Fenêtre de virage exploitable par le moteur (bornes + cibles de réf). */
export interface CoachWindow {
  corner_uid: string;
  n: number;
  /** Borne d'entrée de la fenêtre (= brakeDist − 150 m, bornée). */
  startDist: number;
  /** Borne de sortie (fermeture de fenêtre). */
  endDist: number;
  brakeDist: number;
  apexDist: number;
  exitDist: number;
  /** Cibles de réf (0 si inconnues). */
  refVmin: number;
  refVentry: number;
  refVexit: number;
  refFullThrottleDist: number;
}

/** Virage brut auto-détecté sur un tour bouclé (avant attribution d'UID). */
export interface DetectedCorner {
  n: number;
  entryDist: number;
  brakeDist: number;
  apexDist: number;
  exitDist: number;
  minSpeed: number;
  gLatMax: number;
}

/** Tampon d'un tour (canaux alignés, même longueur). */
export interface LapBuffer {
  dist: number[];
  time: number[];
  speed: number[];
  brake: number[]; // %
  throttle: number[]; // %
  steer: number[];
  gLat: number[];
  gLong: number[];
  gear: number[];
}

// ── Décodage d'une réf dense (grille régulière `step_m`) ─────────────────────

/** Valeur d'un canal de réf à l'indice de grille `i`. */
function refAt(ref: CoachRef, ch: ChannelName, i: number): number {
  const c = CHANNELS.indexOf(ch);
  return ref.channels[c * ref.n_points + i] ?? 0;
}

/** Interpolation linéaire d'un canal de réf à la distance `d` (grille §3.1). */
export function refValueAt(ref: CoachRef, ch: ChannelName, d: number): number {
  if (ref.n_points < 2 || ref.step_m <= 0) return 0;
  const g = d / ref.step_m;
  const i = Math.max(0, Math.min(ref.n_points - 2, Math.floor(g)));
  const f = Math.max(0, Math.min(1, g - i));
  const v0 = refAt(ref, ch, i);
  const v1 = refAt(ref, ch, i + 1);
  return v0 + (v1 - v0) * f;
}

// ── Fenêtres projetées depuis une réf ────────────────────────────────────────

/** Construit les fenêtres exploitables d'une réf, triées par entrée. */
export function windowsFromRef(ref: CoachRef): CoachWindow[] {
  return ref.corners
    .map((c: CoachCornerRow) => ({
      corner_uid: c.corner_uid,
      n: c.n,
      startDist: Math.max(0, c.brake_dist - WINDOW_LEAD_M),
      endDist: c.exit_dist,
      brakeDist: c.brake_dist,
      apexDist: c.apex_dist,
      exitDist: c.exit_dist,
      refVmin: c.vmin,
      refVentry: c.ventry,
      refVexit: c.vexit,
      refFullThrottleDist: c.full_throttle_dist,
    }))
    .sort((a, b) => a.startDist - b.startDist);
}

// ── Auto-détection (tour bouclé) ─────────────────────────────────────────────

/**
 * Détecteur de virages à fond par **gLat soutenu** (> `GLAT_FLAT_G` pendant
 * > 1 s) — complète `detectCorners` qui filtre les points > 95 % de Vmax.
 * Renvoie les apex (indices) des zones non plates absentes de la détection
 * vitesse. Bornes de piste ignorées (12 échantillons, comme `detectCorners`).
 */
function detectFlatCornersGLat(buf: LapBuffer): number[] {
  const N = buf.gLat.length;
  const out: number[] = [];
  if (N < 40) return out;
  let runStart = -1;
  let bestIdx = -1;
  let bestMag = 0;
  const flush = (endIdx: number) => {
    if (runStart < 0) return;
    const dur = buf.time[endIdx] - buf.time[runStart];
    if (dur > 1.0 && bestIdx >= 0) out.push(bestIdx);
    runStart = -1;
    bestIdx = -1;
    bestMag = 0;
  };
  for (let k = 12; k < N - 12; k++) {
    const mag = Math.abs(buf.gLat[k]);
    if (mag > GLAT_FLAT_G) {
      if (runStart < 0) runStart = k;
      if (mag > bestMag) {
        bestMag = mag;
        bestIdx = k;
      }
    } else {
      flush(k);
    }
  }
  flush(N - 1);
  return out;
}

/** Première distance à `throttle ≥ 95 %` soutenu 0,5 s après `fromIdx`. */
function fullThrottleDist(buf: LapBuffer, fromIdx: number): number {
  const N = buf.throttle.length;
  for (let k = Math.max(0, fromIdx); k < N; k++) {
    if (buf.throttle[k] < FULL_THROTTLE_PCT) continue;
    const t0 = buf.time[k];
    let held = true;
    let m = k;
    while (m < N && buf.time[m] - t0 < 0.5) {
      if (buf.throttle[m] < FULL_THROTTLE_PCT) {
        held = false;
        break;
      }
      m++;
    }
    if (held) return buf.dist[k];
  }
  return buf.dist[N - 1] ?? 0;
}

/** Borne de sortie : là où le plein gaz reprend après l'apex. */
function exitIndex(buf: LapBuffer, apexIdx: number): number {
  const d = fullThrottleDist(buf, apexIdx);
  const N = buf.dist.length;
  for (let k = apexIdx; k < N; k++) if (buf.dist[k] >= d) return k;
  return N - 1;
}

/**
 * Détecte tous les virages d'un tour bouclé (freinage + à fond), fusionnés et
 * triés, avec bornes d'entrée/sortie et cibles vitesse.
 */
export function detectAllCorners(buf: LapBuffer): DetectedCorner[] {
  const speedCorners = detectCorners(buf.speed, buf.brake, buf.dist);
  // Index d'apex connus (vitesse) pour dédoublonner les apex gLat.
  const apexIdxs = speedCorners.map((c) => c.apexIdx);
  const flatIdxs = detectFlatCornersGLat(buf).filter((fi) =>
    apexIdxs.every((ai) => Math.abs(buf.dist[fi] - buf.dist[ai]) >= APEX_MATCH_M),
  );

  type Raw = { apexIdx: number; brakeIdx: number; minSpeed: number };
  const raws: Raw[] = [
    ...speedCorners.map((c) => ({
      apexIdx: c.apexIdx,
      brakeIdx: c.brakeIdx,
      minSpeed: c.minSpeed,
    })),
    // Virage à fond : pas de vrai point de freinage → entrée = apex − 150 m.
    ...flatIdxs.map((ai) => ({ apexIdx: ai, brakeIdx: ai, minSpeed: buf.speed[ai] })),
  ].sort((a, b) => buf.dist[a.apexIdx] - buf.dist[b.apexIdx]);

  return raws.map((r, idx) => {
    const brakeDist = buf.dist[r.brakeIdx] ?? 0;
    const apexDist = buf.dist[r.apexIdx] ?? 0;
    const exitIdx = exitIndex(buf, r.apexIdx);
    let gLatMax = 0;
    for (let k = r.brakeIdx; k <= exitIdx; k++) {
      const m = Math.abs(buf.gLat[k] ?? 0);
      if (m > gLatMax) gLatMax = m;
    }
    return {
      n: idx + 1,
      entryDist: Math.max(0, brakeDist - WINDOW_LEAD_M),
      brakeDist,
      apexDist,
      exitDist: buf.dist[exitIdx] ?? apexDist,
      minSpeed: r.minSpeed,
      gLatMax,
    };
  });
}

// ── Identité stable (corner_uid) ─────────────────────────────────────────────

/** Réf. d'appariement : un UID connu et l'apex qui lui est associé. */
export interface KnownApex {
  corner_uid: string;
  apexDist: number;
}

/**
 * Attribue un `corner_uid` stable à un apex : réutilise l'UID connu le plus
 * proche si `< 40 m`, sinon en forge un déterministe (bucket de distance) — pas
 * d'aléa (rejouabilité des tests §14).
 */
export function assignUid(apexDist: number, known: KnownApex[]): string {
  let best: KnownApex | null = null;
  let bestGap = APEX_MATCH_M;
  for (const k of known) {
    const gap = Math.abs(k.apexDist - apexDist);
    if (gap < bestGap) {
      bestGap = gap;
      best = k;
    }
  }
  if (best) return best.corner_uid;
  return `c${Math.round(apexDist)}`;
}
