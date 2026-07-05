/**
 * Mode Drill (COACH-LIVE-SPEC.md §8/§11, P4.2) — module **pur** (types +
 * arithmétique seuls, aucune dépendance React/i18n/Tauri), rejouable (§14).
 *
 * En **Drill**, le pilote travaille 1-2 virages ciblés (les faiblesses chroniques
 * proposées par le coach, §11 « le coach propose ») : sur ces virages **seulement**,
 * le budget nominal (3 messages/tour) saute et le coach donne un retour à **chaque**
 * passage —
 *  1. **prédictif avant** (« Prochain : ton virage. ») ancré au point de freinage
 *     de la fenêtre, **sans fade** (contrairement à la Découverte §8 : ici on
 *     répète à chaque tour tant que le drill dure) ;
 *  2. **verdict après** (« Propre. Trois d'affilée. » ou le diagnostic chiffré du
 *     passage) + **compteur de réussites** (série + total).
 * Partout ailleurs : silence (le service ne route pas les virages hors-cible).
 *
 * Les cibles prédictives réutilisent le type `PredictiveTarget` et l'ordonnanceur
 * `stepPredictive` de `predictive.ts` (avec `fadeMax = Infinity`) : toute la
 * tuyauterie de pré-synthèse TTS et de restitution est partagée.
 */

import type { CornerMeasurement } from "./engine";
import type { DiagResult, DiagCode, CoachDiagnostic } from "./diagnostics";
import { voiceKeyForDiag } from "./voice";
import type { CoachWindow } from "./windows";
import type { PredictiveTarget } from "./predictive";

/** Un virage-cible du drill (issu d'un `CoachObjective` : uid + numéro suffisent). */
export interface DrillTarget {
  corner_uid: string;
  n: number;
}

/** Compteur de réussites d'un virage drillé (§8 « compteur de réussites »). */
export interface DrillCornerCount {
  corner_uid: string;
  n: number;
  /** Passages propres **consécutifs** (série courante). */
  streak: number;
  /** Passages propres cumulés sur la session de drill. */
  made: number;
  /** Passages comptabilisés (propres + fautifs ; hors passages muets/douteux). */
  total: number;
}

export interface DrillState {
  /** Virages travaillés (1-2), ou `[]` si le drill n'a pas encore de cible. */
  targets: DrillTarget[];
  /** Compteur par `corner_uid` (conservé tant que le virage reste ciblé). */
  counts: Map<string, DrillCornerCount>;
}

export function createDrillState(): DrillState {
  return { targets: [], counts: new Map() };
}

/**
 * (Re)fixe les virages travaillés. Les compteurs des virages **encore ciblés**
 * sont conservés (le drill continue) ; ceux des virages abandonnés sont oubliés ;
 * les nouveaux démarrent à zéro.
 */
export function setDrillTargets(st: DrillState, targets: DrillTarget[]): void {
  st.targets = targets.slice(0, 2); // 1-2 virages (§8)
  const keep = new Set(st.targets.map((t) => t.corner_uid));
  for (const uid of [...st.counts.keys()]) {
    if (!keep.has(uid)) st.counts.delete(uid);
  }
  for (const t of st.targets) {
    if (!st.counts.has(t.corner_uid)) {
      st.counts.set(t.corner_uid, {
        corner_uid: t.corner_uid,
        n: t.n,
        streak: 0,
        made: 0,
        total: 0,
      });
    }
  }
}

/** Le virage `corner_uid` fait-il partie du drill courant ? */
export function isDrillTarget(st: DrillState, corner_uid: string): boolean {
  return st.targets.some((t) => t.corner_uid === corner_uid);
}

/**
 * Cibles prédictives « ton virage » : chaque virage travaillé apparié à sa fenêtre
 * (par `corner_uid`) reçoit le `brakeDist` **absolu** de cette fenêtre (jamais un
 * marqueur, §3.3) + le texte fixe `vDrillNext`. Trié par `brakeDist` (ordre de
 * rencontre). Un virage sans fenêtre connue (pas encore projeté) est ignoré.
 */
export function buildDrillPredictTargets(
  targets: DrillTarget[],
  windows: CoachWindow[],
): PredictiveTarget[] {
  const out: PredictiveTarget[] = [];
  for (const t of targets) {
    const w = windows.find((x) => x.corner_uid === t.corner_uid);
    if (!w) continue;
    out.push({
      corner_uid: t.corner_uid,
      n: t.n,
      brakeDist: w.brakeDist,
      suffix: "vDrillNext",
      vars: { n: t.n },
    });
  }
  return out.sort((a, b) => a.brakeDist - b.brakeDist);
}

/** Verdict d'un passage drillé prêt à formater (voix + widget). */
export interface DrillVerdictMsg {
  /** Suffixe i18n sous `live.` (`vDrillClean`/`vDrillStreak` ou un `vCorner*`). */
  suffix: string;
  vars: Record<string, string | number>;
  /** Numéro de virage. */
  corner: number;
  corner_uid: string;
  /** Code widget : `clean` (propre, vert) ou le diagnostic (accent). */
  code: DiagCode | "clean";
  /** true = passage propre (styling « validé » côté widget). */
  clean: boolean;
  /** Série de passages propres consécutifs (compteur §8). */
  streak: number;
  /** Écart chiffré exact du diagnostic (0 pour un passage propre). */
  magnitude: number;
  unit: CoachDiagnostic["unit"];
  sign: number;
}

/**
 * Comptabilise un passage sur un virage travaillé et produit son **verdict**
 * (feedback à chaque passage, §8). Renvoie `null` si le virage n'est pas ciblé ou
 * si la mesure est douteuse (`muted` : ni comptée ni commentée). Sinon :
 *  - passage **propre** (`none`) → série +1, texte « propre » / « N d'affilée » ;
 *  - passage **fautif** (`diagnostic`) → série remise à zéro, texte = le
 *    diagnostic chiffré du passage (mêmes gabarits `vCorner*` que le nominal).
 */
export function recordDrillPass(
  st: DrillState,
  m: CornerMeasurement,
  result: DiagResult,
): DrillVerdictMsg | null {
  const c = st.counts.get(m.corner_uid);
  if (!c) return null; // virage hors drill
  if (result.kind === "muted") return null; // passage douteux : on ne compte pas

  c.total++;
  if (result.kind === "none") {
    c.streak++;
    c.made++;
    // « propre » au 1ᵉʳ succès, puis « N d'affilée » (compteur parlé §8).
    const streak = c.streak;
    return streak >= 2
      ? {
          suffix: "vDrillStreak",
          vars: { n: c.n, c: streak },
          corner: c.n,
          corner_uid: c.corner_uid,
          code: "clean",
          clean: true,
          streak,
          magnitude: 0,
          unit: "",
          sign: 0,
        }
      : {
          suffix: "vDrillClean",
          vars: { n: c.n },
          corner: c.n,
          corner_uid: c.corner_uid,
          code: "clean",
          clean: true,
          streak,
          magnitude: 0,
          unit: "",
          sign: 0,
        };
  }

  // result.kind === "diagnostic" → série cassée, verdict = le diagnostic du passage.
  c.streak = 0;
  const diag = result.diag;
  const { suffix, vars } = voiceKeyForDiag(diag);
  return {
    suffix,
    vars,
    corner: diag.n,
    corner_uid: diag.corner_uid,
    code: diag.code,
    clean: false,
    streak: 0,
    magnitude: diag.magnitude,
    unit: diag.unit,
    sign: diag.sign,
  };
}
