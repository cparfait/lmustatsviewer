/**
 * Benchmark du temps perdu au stand (T13 #152).
 *
 * Mesure **automatiquement** la perte d'un arrêt : la perte se concentre sur le
 * **S3 du tour d'entrée** (in-lap : entrée pit lane + roulage jusqu'au box) et le
 * **S1 du tour de sortie** (out-lap : roulage depuis le box + sortie pit lane).
 * On la compare aux **meilleurs secteurs verts** (référence) :
 *
 *   perte ≈ (S3_in-lap − S3_réf) + (S1_out-lap − S1_réf)
 *
 * Le résultat alimente l'estimation `pitLossSeconds` utilisée par la prédiction de
 * position à la sortie des stands (#151), **sauvegardée par circuit × voiture**.
 *
 * Module **pur** (calcul + machine à états alimentée par des instantanés), sans
 * dépendance React/Tauri → testable (§14).
 */

/** Perte minimale plausible d'un arrêt (s) — filtre le bruit. */
const MIN_LOSS_S = 5;
/** Perte maximale plausible d'un arrêt (s) — filtre les aberrations. */
const MAX_LOSS_S = 120;

/**
 * Perte d'un arrêt = surplus du S3 d'entrée + du S1 de sortie vs les secteurs de
 * référence. `null` si un secteur manque ou si la valeur est hors plage plausible.
 */
export function computePitLoss(
  inLapS3: number,
  outLapS1: number,
  refS3: number,
  refS1: number,
): number | null {
  if (inLapS3 <= 0 || outLapS1 <= 0 || refS3 <= 0 || refS1 <= 0) return null;
  const loss = inLapS3 - refS3 + (outLapS1 - refS1);
  if (loss < MIN_LOSS_S || loss > MAX_LOSS_S) return null;
  return loss;
}

/** Instantané par trame nécessaire au suivi d'un arrêt. */
export interface PitLossSample {
  inPits: boolean;
  totalLaps: number;
  /** Secteurs du **dernier tour bouclé** (s). */
  lastS1: number;
  lastS3: number;
  /** Meilleurs secteurs (référence, s). */
  bestS1: number;
  bestS3: number;
}

type State = "idle" | "pitting" | "outlap";

/**
 * Détecteur d'arrêt : alimenté par un `PitLossSample` à chaque trame, il capture le
 * S3 du tour d'entrée puis le S1 du tour de sortie et renvoie la **perte mesurée**
 * (s) au moment où l'out-lap est bouclé ; `null` sinon.
 *
 * Séquence : entrée aux stands (`inPits` faux→vrai) → clôture de l'in-lap
 * (`totalLaps` +1, on saisit `lastS3`) → clôture de l'out-lap (`totalLaps` +1, on
 * saisit `lastS1`) → calcul.
 */
export class PitLossTracker {
  private state: State = "idle";
  private inLapNum = -1;
  private inLapS3 = 0;
  private lastTotalLaps = -1;
  private wasInPits = false;

  reset(): void {
    this.state = "idle";
    this.inLapNum = -1;
    this.inLapS3 = 0;
    this.lastTotalLaps = -1;
    this.wasInPits = false;
  }

  push(s: PitLossSample): number | null {
    const lapCompleted = this.lastTotalLaps >= 0 && s.totalLaps > this.lastTotalLaps;

    // Entrée aux stands (front) → on arme la mesure sur le tour courant (in-lap).
    if (!this.wasInPits && s.inPits && this.state === "idle") {
      this.state = "pitting";
      this.inLapNum = s.totalLaps;
    }

    let result: number | null = null;
    if (lapCompleted) {
      if (this.state === "pitting" && s.totalLaps > this.inLapNum) {
        // Le tour qui vient de se clôturer est l'in-lap → son S3 est dans `lastS3`.
        this.inLapS3 = s.lastS3;
        this.state = "outlap";
      } else if (this.state === "outlap") {
        // Le tour qui vient de se clôturer est l'out-lap → son S1 est dans `lastS1`.
        result = computePitLoss(this.inLapS3, s.lastS1, s.bestS3, s.bestS1);
        this.state = "idle";
      }
    }

    this.lastTotalLaps = s.totalLaps;
    this.wasInPits = s.inPits;
    return result;
  }
}
