/**
 * Mapping ApexPoints → réf *macro* + table de correction par circuit
 * (COACH-LIVE-SPEC.md §2.1, §3.4, §4.2, §8).
 *
 * Le guide ApexPoints (`braking-guide-data.ts`) est une référence **macro** :
 * repères de freinage génériques (panneaux) par circuit × classe, couvrant
 * seulement 6-10 zones notables par circuit — jamais tous les virages. Ce module
 * en fait une source *structurée* pour le coach :
 *
 *  1. **Parse** les numéros de virage (`T2-T9`, `T10A`, `T20-T26`) — les plages
 *     deviennent des fenêtres composites (§4.2).
 *  2. **Corrige** les anomalies vérifiées dans les données via une table par
 *     circuit **embarquée** (§4.2, §15) : chevauchement à COTA (`T6` replié dans
 *     `T2-T9`), fichier non trié à Sebring (`T17` avant `T16`). La table sert
 *     aussi de **validation** : `validateCorrections()` échoue si elle diverge
 *     des données.
 *  3. **Enrichit** chaque virage : marqueur (m si parseable, mais **jamais** une
 *     coordonnée piste absolue — les panneaux n'en ont pas, §3.3/§3.4.3), plage
 *     de vitesse entrée→apex, rapport, trail détecté, tip FR/EN.
 *  4. **Mappe** les virages macro sur les fenêtres de la réf dense (§4.2) par
 *     alignement ordinal monotone — matière des **callouts prédictifs** (§8,
 *     mode Découverte/Drill), câblés en P3.3.
 *
 * Module **pur** (aucune dépendance React/Tauri) → rejouable et testable (§14).
 */

import { BRAKING_GUIDE, type BrakingCorner, type BrakingRef } from "@/lib/ai/knowledge/braking-guide-data";
import { matchBrakingClass, matchBrakingTrackId } from "@/lib/ai/knowledge/braking-guide";
import type { CoachWindow } from "./windows";

// ── Parsing des numéros de virage ────────────────────────────────────────────

/** Numéro de virage ApexPoints décodé (`T2-T9` → {start:2,end:9}). */
export interface ParsedTurn {
  /** Premier numéro (`T2-T9` → 2 ; `T10A` → 10). */
  start: number;
  /** Dernier numéro d'une plage (`T2-T9` → 9), sinon `null`. */
  end: number | null;
  /** Suffixe littéral (`T10A` → "A"), sinon `null`. */
  suffix: string | null;
}

/** `^T(\d+)([A-Z])?(-T(\d+))?$` — accepte `T5`, `T10A`, `T2-T9`, `T20-T26`. */
const TURN_RE = /^T(\d+)([A-Z])?(?:-T(\d+))?$/;

/** Décode un numéro de virage du guide, ou `null` si non conforme. */
export function parseCornerNumber(raw: string): ParsedTurn | null {
  const m = TURN_RE.exec(raw.trim());
  if (!m) return null;
  const start = Number(m[1]);
  const end = m[3] != null ? Number(m[3]) : null;
  if (!Number.isFinite(start) || (end != null && (!Number.isFinite(end) || end < start))) {
    return null;
  }
  return { start, end, suffix: m[2] ?? null };
}

/** Position ordinale d'une plage : milieu (`T2-T9` → 5,5) pour l'alignement. */
function turnMidpoint(p: ParsedTurn): number {
  return p.end != null ? (p.start + p.end) / 2 : p.start;
}

// ── Parseurs de champs (marqueur, vitesse, rapport, trail) ────────────────────

/**
 * Distance d'un marqueur en mètres si le libellé est un panneau chiffré
 * (`"150m board"` → 150), sinon `null` (`"Lift only"`, `"Light brake"`…).
 * ⚠️ C'est la distance **du panneau**, pas une coordonnée piste (§3.3) : bon
 * pour un repère parlé (« au panneau 150 »), jamais pour un delta absolu.
 */
export function parseMarkerMeters(marker: string): number | null {
  const m = /(\d+)\s*m\b/i.exec(marker);
  return m ? Number(m[1]) : null;
}

/** Plage de vitesse `"320→100 km/h"` → {entry:320, apex:100} (km/h). */
export function parseSpeedRange(speed: string): { entry: number | null; apex: number | null } {
  const nums = speed.match(/\d+/g);
  if (!nums || nums.length === 0) return { entry: null, apex: null };
  const entry = Number(nums[0]);
  const apex = nums.length > 1 ? Number(nums[1]) : null;
  return { entry, apex };
}

/** Numéro de rapport `"3rd"` → 3, `"2nd"` → 2, sinon `null`. */
export function parseGearNumber(gear: string): number | null {
  const m = /(\d+)/.exec(gear);
  return m ? Number(m[1]) : null;
}

/** Le mot-clé `trail` est-il présent (freinage dégressif attendu) ? (§5#8) */
export function hasTrailBraking(pressure: string): boolean {
  return /\btrail\b/i.test(pressure);
}

// ── Table de correction par circuit (embarquée, = table de validation §15) ────

/** Correction manuelle d'un circuit dont les données ApexPoints ont une anomalie. */
export interface CircuitCorrection {
  /**
   * Ordre physique canonique des `number`, quand le fichier n'est **pas trié**
   * (Sebring). Absent → l'ordre du fichier fait foi (déjà correct ailleurs).
   */
  order?: string[];
  /**
   * Repli d'un `number` dans un autre : chevauchement où un virage est **inclus**
   * dans une plage composite (COTA `T6` ⊂ `T2-T9`). Le repli devient un détail de
   * la fenêtre composite, pas une fenêtre ordinale distincte.
   */
  nested?: Record<string, string>;
  /** Note d'audit — l'anomalie vérifiée dans les données (traçabilité). */
  note: string;
}

/**
 * Anomalies **vérifiées dans les données** (§0.7, §4.2, §15). N'ajouter une
 * entrée qu'après confirmation contre `braking-guide-data.ts` ; `validateCorrections()`
 * garde la table synchrone.
 */
export const CIRCUIT_CORRECTIONS: Record<string, CircuitCorrection> = {
  cota: {
    nested: { T6: "T2-T9" },
    note:
      "Chevauchement : `T6` est listé après la plage `T2-T9` (Esses) qui l'englobe. " +
      "Replié en détail de la fenêtre composite, pas une fenêtre ordinale distincte.",
  },
  sebring: {
    order: ["T1", "T3", "T7", "T13-T15", "T16", "T17"],
    note:
      "Fichier non trié : `T17` (Hairpin) listé avant `T16` (Ford Chicane). " +
      "Ordre physique rétabli (T16 avant T17).",
  },
};

// ── Virage macro enrichi + résolution par combo ──────────────────────────────

/** Un virage du guide, corrigé, parsé et enrichi pour le coach. */
export interface MacroCorner {
  /** Numéro brut du guide (`"T2-T9"`). */
  number: string;
  parsed: ParsedTurn;
  name: string;
  /** Type ApexPoints (`chicane`, `fast_corner`, `hairpin`…). */
  type: string;
  /** Fenêtre composite (plage `Tx-Ty` ou virages repliés). */
  composite: boolean;
  /** Numéros repliés dans cette fenêtre (COTA `["T6"]` dans `T2-T9`). */
  nested: string[];

  // Réf de freinage résolue pour la classe (fallback comme `braking-guide.ts`).
  marker: string;
  /** Distance du **panneau** (m) si chiffrée, sinon `null` (§3.3). */
  markerM: number | null;
  speedEntry: number | null;
  speedApex: number | null;
  gear: string;
  gearN: number | null;
  pressure: string;
  /** Freinage dégressif (trail) attendu à ce virage. */
  trail: boolean;
  tip: string;
  tipFr: string;
}

/** Réf de freinage de la classe, avec fallback hypercar (§0.7). */
function resolveRef(c: BrakingCorner, classId: string): BrakingRef | null {
  return c.braking[classId] ?? c.braking.hypercar ?? Object.values(c.braking)[0] ?? null;
}

/** Enrichit un virage brut du guide pour une classe (marqueur/vitesse/rapport…). */
function enrich(c: BrakingCorner, parsed: ParsedTurn, classId: string, nested: string[]): MacroCorner | null {
  const b = resolveRef(c, classId);
  if (!b) return null;
  const speed = parseSpeedRange(b.speed);
  return {
    number: c.number,
    parsed,
    name: c.name,
    type: c.type,
    composite: parsed.end != null || nested.length > 0,
    nested,
    marker: b.marker,
    markerM: parseMarkerMeters(b.marker),
    speedEntry: speed.entry,
    speedApex: speed.apex,
    gear: b.gear,
    gearN: parseGearNumber(b.gear),
    pressure: b.pressure,
    trail: hasTrailBraking(b.pressure),
    tip: b.tip,
    tipFr: b.tipFr,
  };
}

/**
 * Virages macro d'un circuit pour une classe : corrigés (ordre + replis),
 * parsés, enrichis, **triés dans l'ordre physique**. `[]` si circuit non couvert.
 */
export function guideMacroCorners(trackId: string, classId: string): MacroCorner[] {
  const gt = BRAKING_GUIDE.find((x) => x.id === trackId);
  if (!gt) return [];
  const corr = CIRCUIT_CORRECTIONS[trackId];
  const byNumber = new Map(gt.corners.map((c) => [c.number, c]));
  const nestedChild = corr?.nested ?? {};
  // Enfants repliés par parent (COTA : parent "T2-T9" → ["T6"]).
  const childrenOf = new Map<string, string[]>();
  for (const [child, parent] of Object.entries(nestedChild)) {
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), child]);
  }

  // Séquence de base : ordre canonique explicite, sinon ordre du fichier — en
  // sautant les virages repliés (qui rejoignent leur parent).
  const sequence = corr?.order ?? gt.corners.map((c) => c.number);
  const out: MacroCorner[] = [];
  for (const num of sequence) {
    if (num in nestedChild) continue; // enfant replié → pas une fenêtre ordinale
    const c = byNumber.get(num);
    if (!c) continue; // incohérence : capturée par validateCorrections()
    const parsed = parseCornerNumber(c.number);
    if (!parsed) continue;
    const m = enrich(c, parsed, classId, childrenOf.get(num) ?? []);
    if (m) out.push(m);
  }
  return out;
}

/**
 * Virages macro pour le combo courant (résolution circuit/classe comme le coach
 * IA). `[]` si le circuit n'est pas couvert par le guide. `classId` résolu tombe
 * en silence sur `hypercar` si la classe est inconnue (§0.7).
 */
export function macroForCombo(args: {
  track: string;
  trackCourse?: string;
  carClass: string;
}): MacroCorner[] {
  const trackId = matchBrakingTrackId(args.track, args.trackCourse);
  if (!trackId) return [];
  const classId = matchBrakingClass(args.carClass)?.id ?? "hypercar";
  return guideMacroCorners(trackId, classId);
}

// ── Mapping ordinal macro → fenêtres de la réf dense (§4.2) ───────────────────

/** Association d'un virage macro à une fenêtre de la réf (ou aucune). */
export interface MappedMacro {
  corner: MacroCorner;
  /** Indice dans le tableau de fenêtres, ou `null` si non apparié. */
  windowIndex: number | null;
  /** `corner_uid` de la fenêtre appariée (ancre de la mémoire chronique), ou `null`. */
  corner_uid: string | null;
}

/**
 * Apparie les virages macro (ordonnés) aux fenêtres de la réf (ordonnées),
 * par **alignement monotone** sur la position normalisée : le guide ne couvre
 * qu'un sous-ensemble des virages, et les marqueurs n'ont **pas** de coordonnée
 * piste (§3.3) → on ne peut aligner que l'*ordre*, pas des distances absolues.
 *
 * Heuristique (documentée comme telle) : chaque virage macro vise la fenêtre la
 * plus proche en position relative (n° de virage / n° max ↔ apexDist / apexMax),
 * sans jamais reculer (monotone). Une fenêtre déjà prise n'est pas réutilisée.
 * Sert les callouts prédictifs quand une réf existe (P3.3) ; la Découverte pure
 * (sans réf → sans fenêtre) délivrera sur les virages détectés à la volée.
 */
export function mapMacroToWindows(corners: MacroCorner[], windows: CoachWindow[]): MappedMacro[] {
  if (windows.length === 0) {
    return corners.map((corner) => ({ corner, windowIndex: null, corner_uid: null }));
  }
  const maxTurn = Math.max(1, ...corners.map((c) => c.parsed.end ?? c.parsed.start));
  const maxApex = Math.max(1, ...windows.map((w) => w.apexDist));
  const winPos = windows.map((w) => w.apexDist / maxApex);

  const result: MappedMacro[] = [];
  let cursor = 0; // 1ʳᵉ fenêtre encore disponible (garantit la monotonie)
  for (let i = 0; i < corners.length; i++) {
    const corner = corners[i];
    const target = turnMidpoint(corner.parsed) / maxTurn;
    // Réserve une fenêtre pour chacun des virages restants : sans ce plafond, le
    // glouton peut sauter une fenêtre et échouer à en attribuer une au dernier.
    const remaining = corners.length - i - 1;
    const maxJ = windows.length - 1 - remaining;
    let bestIdx = -1;
    let bestGap = Infinity;
    for (let j = cursor; j <= maxJ; j++) {
      const gap = Math.abs(winPos[j] - target);
      if (gap < bestGap) {
        bestGap = gap;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0) {
      result.push({ corner, windowIndex: bestIdx, corner_uid: windows[bestIdx].corner_uid });
      cursor = bestIdx + 1;
    } else {
      // Plus de virages macro que de fenêtres : celui-ci reste sans ancre.
      result.push({ corner, windowIndex: null, corner_uid: null });
    }
  }
  return result;
}

// ── Validation de la table de correction (= filet contre la dérive des données) ─

/** Incohérence détectée entre la table de correction et les données du guide. */
export interface ValidationIssue {
  track: string;
  kind: "unknown-track" | "unknown-number" | "order-mismatch" | "nested-missing-parent" | "bad-number";
  detail: string;
}

/**
 * Vérifie que chaque `number` cité par la table de correction existe dans les
 * données, que `order` couvre exactement les virages **non repliés**, et que les
 * numéros restent parsables (§15 : « la table de correction est aussi une table
 * de validation »). `[]` = tout est cohérent. À exécuter en test/CI.
 */
export function validateCorrections(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [track, corr] of Object.entries(CIRCUIT_CORRECTIONS)) {
    const gt = BRAKING_GUIDE.find((x) => x.id === track);
    if (!gt) {
      issues.push({ track, kind: "unknown-track", detail: `Circuit "${track}" absent du guide.` });
      continue;
    }
    const numbers = new Set(gt.corners.map((c) => c.number));
    const nested = corr.nested ?? {};
    // Chaque enfant et chaque parent replié doit exister.
    for (const [child, parent] of Object.entries(nested)) {
      if (!numbers.has(child)) {
        issues.push({ track, kind: "unknown-number", detail: `Repli "${child}" inconnu.` });
      }
      if (!numbers.has(parent)) {
        issues.push({ track, kind: "nested-missing-parent", detail: `Parent "${parent}" du repli "${child}" inconnu.` });
      }
    }
    // `order` doit lister exactement les virages non repliés.
    if (corr.order) {
      const expected = new Set([...numbers].filter((n) => !(n in nested)));
      for (const num of corr.order) {
        if (!numbers.has(num)) {
          issues.push({ track, kind: "unknown-number", detail: `Ordre : "${num}" inconnu.` });
        } else {
          expected.delete(num);
        }
      }
      for (const missing of expected) {
        issues.push({ track, kind: "order-mismatch", detail: `Ordre : "${missing}" non listé.` });
      }
    }
    // Tous les numéros doivent rester parsables (le mapping en dépend).
    for (const c of gt.corners) {
      if (!parseCornerNumber(c.number)) {
        issues.push({ track, kind: "bad-number", detail: `Numéro non parsable : "${c.number}".` });
      }
    }
  }
  return issues;
}
