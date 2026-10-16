/**
 * Virages d'un tracé détectés par la géométrie (module pur), et rapprochement
 * avec la numérotation officielle (`src/data/cornerNames.ts`).
 *
 * Détection : cap de la route mesuré sur ±40 m ; un virage = zone où la route
 * tourne (rayon < 250 m) et cumule au moins 10° ; zones de même sens à moins de
 * 40 m fusionnées ; repère = point de courbure maximale. Réglage retenu sur le
 * tracé réel de Road Atlanta : 13 virages détectés = 13 repères officiels
 * (1-9, 10A, 10B, 11, 12) ; seuils plus serrés manquent les courbes rapides et
 * les coudes de la ligne arrière (6 à 11 virages). Les numéros officiels ne
 * sont affichés **que si le nombre de virages détectés est exactement celui de
 * la table** (règle du projet : jamais de donnée qui ne colle pas au tracé).
 */

import type { Pt } from "@/lib/trackMapGeom";
import { CORNER_TABLE, type CornerTable } from "@/data/cornerNames";

export interface DetectedCorner {
  /** Distance-tour du point le plus serré (m). */
  dist: number;
  /** Indice du point dans le tracé. */
  idx: number;
  /** +1 = gauche, −1 = droite (repère du monde). */
  dir: number;
}

/** Rayon max (m) d'un virage ; au-delà c'est une courbe rapide ignorée. */
const MAX_RADIUS_M = 250;
const MIN_TURN_DEG = 10;
const MERGE_M = 40;

function heading(a: Pt, b: Pt): number {
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export interface DetectOpts {
  maxRadiusM?: number;
  minTurnDeg?: number;
  mergeM?: number;
}

/** Virages détectés sur un tracé fermé (points tous les ~20 m). */
export function detectTrackCorners(pts: Pt[], dists: number[], o: DetectOpts = {}): DetectedCorner[] {
  const maxRadius = o.maxRadiusM ?? MAX_RADIUS_M;
  const minTurnDeg = o.minTurnDeg ?? MIN_TURN_DEG;
  const mergeM = o.mergeM ?? MERGE_M;
  const n = pts.length;
  if (n < 30 || dists.length !== n) return [];
  const span = 2; // ±2 points ≈ ±40 m
  // Variation de cap par mètre, signée.
  const rate: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - span + n) % n];
    const b = pts[i];
    const c = pts[(i + span) % n];
    const dh = wrapAngle(heading(b, c) - heading(a, b));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]);
    rate.push(len > 0 ? dh / (len / 2) : 0);
  }
  const minRate = 1 / maxRadius;
  // Zones contiguës où |rate| dépasse le seuil, même sens.
  const zones: { from: number; to: number; turn: number; peak: number; dir: number }[] = [];
  let cur: { from: number; to: number; turn: number; peak: number; dir: number } | null = null;
  for (let i = 0; i < n; i++) {
    const r = rate[i];
    const dir = Math.sign(r);
    if (Math.abs(r) >= minRate && (!cur || cur.dir === dir)) {
      if (!cur) cur = { from: i, to: i, turn: 0, peak: i, dir };
      cur.to = i;
      cur.turn += Math.abs(r) * 20;
      if (Math.abs(r) > Math.abs(rate[cur.peak])) cur.peak = i;
    } else {
      if (cur) zones.push(cur);
      cur = Math.abs(r) >= minRate ? { from: i, to: i, turn: Math.abs(r) * 20, peak: i, dir } : null;
    }
  }
  if (cur) zones.push(cur);
  // Fusion des zones proches de même sens (virage en deux temps).
  const merged: typeof zones = [];
  for (const z of zones) {
    const last = merged[merged.length - 1];
    if (last && last.dir === z.dir && dists[z.from] - dists[last.to] <= mergeM) {
      last.to = z.to;
      last.turn += z.turn;
      if (Math.abs(rate[z.peak]) > Math.abs(rate[last.peak])) last.peak = z.peak;
    } else merged.push({ ...z });
  }
  return merged
    .filter((z) => (z.turn * 180) / Math.PI >= minTurnDeg)
    .map((z) => ({ dist: dists[z.peak], idx: z.peak, dir: z.dir }));
}

const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Fiche officielle du circuit, ou null. */
export function cornerTableFor(track: string, table: CornerTable[] = CORNER_TABLE): CornerTable | null {
  const t = norm(track);
  if (!t) return null;
  return table.find((c) => c.match.some((m) => t.includes(norm(m)))) ?? null;
}

export interface CornerLabel {
  idx: number;
  n: string;
  name: string | null;
}

/**
 * Étiquettes officielles : seulement si le compte détecté égale le compte
 * officiel (sinon tableau vide — rien plutôt que faux). Les virages sont
 * numérotés dans l'ordre du tour depuis la ligne.
 */
export function officialCornerLabels(track: string, pts: Pt[], dists: number[], table: CornerTable[] = CORNER_TABLE): CornerLabel[] {
  const fiche = cornerTableFor(track, table);
  if (!fiche) return [];
  const found = detectTrackCorners(pts, dists).sort((a, b) => a.dist - b.dist);
  if (found.length !== fiche.corners.length) return [];
  return found.map((c, i) => ({ idx: c.idx, n: fiche.corners[i].n, name: fiche.corners[i].name }));
}
