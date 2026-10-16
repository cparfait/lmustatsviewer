/**
 * Notation des interventions radio (idée ④, module pur + singleton de séance).
 *
 * Le pilote juge une annonce à la voix (« utile », « inutile », « trop tard »,
 * « faux » → porte sur la DERNIÈRE annonce) ou après la séance (liste). Les
 * notes sont cumulées par famille d'annonce et gardées en local (`config`,
 * clé `radio_feedback`). Une famille jugée surtout inutile ou fausse devient
 * plus rare (délai de redite allongé, priorité abaissée) — jamais les annonces
 * de sécurité (drapeaux, mécanique, box…), toujours dites.
 */

import type { Candidate } from "./arbiter";
import { classOf } from "./policy";

export type Rating = "useful" | "useless" | "late" | "wrong";
export const RATINGS: Rating[] = ["useful", "useless", "late", "wrong"];

export interface LogEntry {
  id: number;
  /** Horodatage (ms epoch). */
  at: number;
  key: string;
  /** Famille de la clé (cumul des notes). */
  family: string;
  text: string;
  /** Séance (circuit + type) au moment de l'annonce. */
  session: string;
  rating?: Rating;
}

export type Counts = Record<Rating, number>;
export type Stats = Record<string, Counts>;

/** Taille max du journal de la séance. */
export const LOG_MAX = 200;
/** Une note vocale porte sur une annonce d'il y a au plus N ms. */
export const RATE_WINDOW_MS = 120_000;
/** Seuil de malus : au moins N notes négatives… */
export const MIN_NEGATIVE = 3;

const zero = (): Counts => ({ useful: 0, useless: 0, late: 0, wrong: 0 });

/**
 * Famille d'une clé : 1er segment, + le 2e s'il est un identifiant fixe
 * (`tyres:wear`, `pit:open`) et non une donnée (`rivalpit:Jean Dupont:2`).
 */
export function familyOf(key: string): string {
  const [a, b] = key.split(":");
  return b && /^[a-z][a-z0-9_]*$/.test(b) ? `${a}:${b}` : a;
}

/** Famille à rendre plus rare : ≥ 3 notes « inutile/faux » et plus du double des « utile ». */
export function penalized(c: Counts | undefined): boolean {
  if (!c) return false;
  const neg = c.useless + c.wrong;
  return neg >= MIN_NEGATIVE && neg > 2 * c.useful;
}

/**
 * Applique le malus aux candidats d'une trame : délai de redite d'au moins
 * 3 tours et 3 min, priorité abaissée. Les annonces de sécurité sont intactes.
 */
export function adjust(cands: Candidate[], stats: Stats): Candidate[] {
  return cands.map((c) => {
    if (classOf(c) === "safety" || !penalized(stats[familyOf(c.key)])) return c;
    return {
      ...c,
      score: (c.score ?? 50) - 25,
      cooldownLaps: Math.max(c.cooldownLaps ?? 0, 3),
      cooldownS: Math.max(c.cooldownS ?? 0, 180),
    };
  });
}

/** Ajoute une note aux cumuls (renvoie un nouvel objet). Une note remplacée est retirée. */
export function addRating(stats: Stats, family: string, r: Rating, previous?: Rating): Stats {
  const c = { ...(stats[family] ?? zero()) };
  if (previous) c[previous] = Math.max(0, c[previous] - 1);
  c[r] += 1;
  return { ...stats, [family]: c };
}

/** Journal de la séance (mémoire) + cumuls (persistés par l'appelant). */
export class RadioLog {
  entries: LogEntry[] = [];
  stats: Stats = {};
  private nextId = 1;
  private listeners = new Set<() => void>();
  /** Appelé après chaque note (persistance). */
  onStatsChanged: ((s: Stats) => void) | null = null;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  /** Annonces réellement retenues par l'arbitre (une entrée par annonce, fusions dépliées). */
  record(spoken: { key: string; text: string }[], session: string, at = Date.now()): void {
    if (!spoken.length) return;
    for (const c of spoken) {
      this.entries.push({ id: this.nextId++, at, key: c.key, family: familyOf(c.key), text: c.text, session });
    }
    if (this.entries.length > LOG_MAX) this.entries.splice(0, this.entries.length - LOG_MAX);
    this.notify();
  }

  /** Note une entrée (par id). Renvoie vrai si trouvée. */
  rate(id: number, r: Rating): boolean {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return false;
    if (e.rating === r) return true;
    this.stats = addRating(this.stats, e.family, r, e.rating);
    e.rating = r;
    this.onStatsChanged?.(this.stats);
    this.notify();
    return true;
  }

  /** Note vocale : la dernière annonce (≤ 2 min). Renvoie l'entrée notée ou null. */
  rateLast(r: Rating, now = Date.now()): LogEntry | null {
    const e = this.entries[this.entries.length - 1];
    if (!e || now - e.at > RATE_WINDOW_MS) return null;
    this.rate(e.id, r);
    return e;
  }

  /** Annonces de la dernière séance (la plus récente présente dans le journal). */
  lastSession(): LogEntry[] {
    const last = this.entries[this.entries.length - 1];
    return last ? this.entries.filter((e) => e.session === last.session) : [];
  }

  resetStats(): void {
    this.stats = {};
    this.onStatsChanged?.(this.stats);
    this.notify();
  }
}

export const radioLog = new RadioLog();
