/**
 * Noms de virages pour la voix (module pur).
 *
 * Le coach numérote ses virages lui-même (ordre de détection sur ses mesures),
 * les cartes affichent la numérotation **officielle** (`trackCorners.ts`, « tout
 * ou rien » : seulement si le nombre de virages détectés sur le tracé égale celui
 * de la fiche officielle). Ici on rapproche les deux par la distance : le sommet
 * d'un virage du coach (identifiant `c<distance>`) est rattaché au repère
 * officiel le plus proche, à moins de `MATCH_M`. On peut alors dire « virage 1,
 * La Source » au lieu de « virage 3 ».
 */

import { officialCornerLabels } from "@/lib/trackCorners";
import type { Pt } from "@/lib/trackMapGeom";

/** Écart maximal sommet du coach ↔ repère officiel (m). */
export const MATCH_M = 80;

export interface NamedCorner {
  dist: number;
  n: string;
  name: string | null;
}

/** Repères officiels avec leur distance-tour (vide si le circuit ne colle pas). */
export function officialCornerDists(track: string, pts: Pt[], dists: number[]): NamedCorner[] {
  return officialCornerLabels(track, pts, dists).map((l) => ({ dist: dists[l.idx], n: l.n, name: l.name }));
}

/** Distance du sommet d'après l'identifiant de virage du coach (`c1234`). */
export function apexFromUid(uid: string | null | undefined): number | null {
  const m = /^c(\d+)$/.exec(uid ?? "");
  return m ? Number(m[1]) : null;
}

/** Repère officiel le plus proche d'une distance-tour (tour bouclé compris). */
export function nearestCorner(list: NamedCorner[], dist: number, lapLen: number): NamedCorner | null {
  let best: NamedCorner | null = null;
  let bestGap = MATCH_M;
  for (const c of list) {
    let gap = Math.abs(c.dist - dist);
    if (lapLen > 0) gap = Math.min(gap, lapLen - gap);
    if (gap <= bestGap) {
      bestGap = gap;
      best = c;
    }
  }
  return best;
}

/** Libellé parlé : « 1, La Source » ou « 10A » (numéro officiel seul). */
export function spokenCorner(c: NamedCorner): string {
  return c.name ? `${c.n}, ${c.name}` : c.n;
}

/**
 * Registre partagé des repères du circuit courant, mis à jour par l'ingénieur
 * (qui reçoit le tracé live) et lu par le coach au moment de parler.
 */
class CornerNamer {
  private track = "";
  private count = 0;
  private list: NamedCorner[] = [];
  private lapLen = 0;

  update(track: string, pts: Pt[], dists: number[], lapLen: number) {
    // Recalcul seulement si le circuit change ou si le tracé a grossi.
    if (track === this.track && pts.length === this.count) return;
    this.track = track;
    this.count = pts.length;
    this.lapLen = lapLen;
    this.list = track && pts.length >= 30 ? officialCornerDists(track, pts, dists) : [];
  }

  /** Numéro (et nom) officiel du virage du coach, ou null si inconnu. */
  forUid(uid: string | null | undefined): string | null {
    const d = apexFromUid(uid);
    if (d == null || !this.list.length) return null;
    const c = nearestCorner(this.list, d, this.lapLen);
    return c ? spokenCorner(c) : null;
  }

  get known(): NamedCorner[] {
    return this.list;
  }
}

export const cornerNamer = new CornerNamer();
