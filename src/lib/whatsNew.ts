/**
 * Fenêtre « Mise à jour installée » : quelles versions du journal montrer.
 *
 * Module pur (aucun accès au store ni à l'IPC) : la fenêtre lui passe la
 * dernière version vue et la version installée.
 */

import { compareVersions } from "@/lib/utils";
import {
  APP_VERSION,
  CHANGELOG,
  normalizeItem,
  type ChangelogEntry,
  type ChangelogItem,
  type ChangelogSectionKind,
} from "@/lib/changelog";

/** Versions montrées au plus (un pilote qui saute beaucoup de versions voit les plus récentes). */
export const MAX_ENTRIES = 3;
/** Items montrés au moins par version : les mises en avant, complétées par les
 *  premiers items ordinaires (ajouts d'abord) quand il y en a peu. */
export const MAX_PLAIN_ITEMS = 5;

/** Ordre des types dans le résumé « Et aussi : … ». */
const KIND_ORDER: ChangelogSectionKind[] = ["added", "improved", "changed", "fixed", "removed"];

/**
 * Entrées à montrer, de la plus récente à la plus ancienne : celles postérieures à
 * `lastSeen` et jusqu'à la version installée comprise. `lastSeen` vide (installation
 * mise à jour depuis une version sans ce suivi) → la version installée seule.
 */
export function pendingEntries(
  lastSeen: string,
  appVersion: string = APP_VERSION,
  changelog: ChangelogEntry[] = CHANGELOG,
): ChangelogEntry[] {
  const upTo = changelog.filter((e) => compareVersions(e.version, appVersion) <= 0);
  const fresh = lastSeen
    ? upTo.filter((e) => compareVersions(e.version, lastSeen) > 0)
    : upTo.filter((e) => compareVersions(e.version, appVersion) === 0);
  return [...fresh].sort((a, b) => compareVersions(b.version, a.version)).slice(0, MAX_ENTRIES);
}

/** Vrai si la version installée est plus récente que la dernière vue. */
export function isUpgrade(lastSeen: string, appVersion: string = APP_VERSION): boolean {
  return !lastSeen || compareVersions(appVersion, lastSeen) > 0;
}

export interface EntryDigest {
  /** Items mis en avant (`featured`), à montrer en entier. */
  highlights: ChangelogItem[];
  /** Premiers items ordinaires, pour compléter jusqu'à `maxPlain` items montrés. */
  plain: ChangelogItem[];
  /** Ce qui n'est pas montré, par type de section. */
  rest: Partial<Record<ChangelogSectionKind, number>>;
}

/**
 * Résumé d'une version pour la fenêtre : les nouveautés mises en avant, complétées
 * par les premiers items ordinaires (dans l'ordre ajouts, améliorations, …) jusqu'à
 * `maxPlain` items montrés ; le reste est compté par type (« 12 corrections »).
 */
export function digestEntry(entry: ChangelogEntry, maxPlain = MAX_PLAIN_ITEMS): EntryDigest {
  const highlights: ChangelogItem[] = [];
  for (const s of entry.sections)
    for (const it of s.items) if (normalizeItem(it).featured) highlights.push(it);

  const shown = new Set<ChangelogItem>(highlights);
  const plain: ChangelogItem[] = [];
  const ordered = [...entry.sections].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  for (const s of ordered)
    for (const it of s.items)
      if (highlights.length + plain.length < maxPlain && !shown.has(it)) {
        plain.push(it);
        shown.add(it);
      }

  const rest: Partial<Record<ChangelogSectionKind, number>> = {};
  for (const s of ordered) {
    const n = s.items.filter((it) => !shown.has(it)).length;
    if (n) rest[s.kind] = (rest[s.kind] ?? 0) + n;
  }
  return { highlights, plain, rest };
}
