/**
 * Modes d'usage du coach par virage (COACH-LIVE-SPEC.md §8, P2.4) — module **pur**
 * (aucune dépendance React/Tauri) : mappe le **type de session** vers un mode, et
 * chaque mode vers une **politique de restitution** que l'ordonnanceur vocal
 * (`voice.ts`) consulte pour décider quoi (et combien) prononcer en roulage.
 *
 * Périmètre P2.4 (cf. spec §13) : **Practice / Course / Qualif**. Le mode
 * **Découverte** (callouts prédictifs, pré-synthèse TTS) est câblé en **P3.3**
 * (`predictive: true`). Le mode **Drill** (P4.2) a sa **propre cadence** (feedback à
 * chaque passage sur les virages travaillés) pilotée directement par le service
 * (`drill.ts` + `setDrillMode`), **hors** `policyFor` : la valeur `drill` du type est
 * conservée pour la complétude et retombe ici sur la politique nominale.
 */

/** Les 5 modes de la spec §8 (Découverte/Drill = P3.3/P4.2). */
export type CoachMode = "practice" | "race" | "qualify" | "discovery" | "drill";

/**
 * Politique de restitution d'un mode : les leviers que `voice.ts` honore.
 *  - `live` : le coaching par virage est-il autorisé **en roulage** ?
 *  - `budgetPerLap` : plafond de messages par tour (§9).
 *  - `escalationOnly` : ne parler que d'une **erreur répétée coûteuse** (≥ 3×, §8
 *    Course), sans focus collant ni renforcement.
 *  - `positive` : appliquer le renforcement positif §1.4.
 *  - `degressive` : appliquer le feedback dégressif §1.5.
 *  - `predictive` : émettre des **callouts ApexPoints prédictifs** avant le
 *    freinage (§8 Découverte, P3.3). Réservé à la Découverte (pas de réf joueur) :
 *    jamais de prédictif permanent quand une réf existe (dépendance, §8).
 */
export interface ModePolicy {
  mode: CoachMode;
  live: boolean;
  budgetPerLap: number;
  escalationOnly: boolean;
  positive: boolean;
  degressive: boolean;
  predictive: boolean;
}

/**
 * Type de session rF2/LMU (`LiveSession.session`) → mode par défaut (§8),
 * **surchargé** en « Découverte » quand aucune réf joueur n'existe (guidage
 * prédictif, mode P3.3 ; en P2.4 le moteur mute déjà tout en l'absence de réf).
 * Mapping session : 0 = test, 1-4 = practice, 5-8 = qualif, 9 = warm-up, 10+ = course
 * (cf. `ai/context/live-context.ts`).
 */
export function modeFromSession(sessionNum: number, hasRef: boolean): CoachMode {
  if (!hasRef) return "discovery";
  if (sessionNum >= 10) return "race";
  if (sessionNum >= 5 && sessionNum <= 8) return "qualify";
  return "practice"; // test / practice / warm-up : politique nominale
}

/** Politique de restitution pour un mode (§8). */
export function policyFor(mode: CoachMode): ModePolicy {
  switch (mode) {
    case "race":
      // Silence par défaut : seulement l'erreur répétée coûteuse (§8). Le spotter
      // garde la priorité (assurée par la priorité vocale `coach`). Débrief de
      // relais = P4.
      return {
        mode,
        live: true,
        budgetPerLap: 1,
        escalationOnly: true,
        positive: false,
        degressive: false,
        predictive: false,
      };
    case "qualify":
      // Aucun message pendant un tour lancé (§8). Le coaching sur l'out-lap /
      // débrief est P4 : en P2.4, Qualif = silence en roulage.
      return {
        mode,
        live: false,
        budgetPerLap: 0,
        escalationOnly: false,
        positive: false,
        degressive: false,
        predictive: false,
      };
    case "practice":
    case "discovery":
    case "drill":
    default:
      // Nominal (§1) : focus collant + dégressif + renforcement positif. En
      // **Découverte** (pas de réf → le moteur mute tout diagnostic), on ajoute
      // les callouts prédictifs ApexPoints (§8, P3.3) : `predictive: true`.
      return {
        mode: mode ?? "practice",
        live: true,
        budgetPerLap: 3,
        escalationOnly: false,
        positive: true,
        degressive: true,
        predictive: mode === "discovery",
      };
  }
}
