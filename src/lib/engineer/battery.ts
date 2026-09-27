/**
 * Batterie hybride (Hypercar) — module pur.
 *
 * Trois situations qu'un ingénieur signale, chacune avec hystérésis (réarmée
 * seulement quand la situation s'est nettement résorbée) :
 *  - **critique** : charge < `CRITICAL_PCT` en début de tour — le déploiement va
 *    manquer (réarmée au-dessus de `CRITICAL_REARM_PCT`) ;
 *  - **déficit** : bilan moyen des 2 derniers tours ≤ `DEFICIT_PCT` par tour —
 *    tu vas te retrouver à sec (réarmé au-dessus de `DEFICIT_REARM_PCT`) ;
 *  - **saturée** : charge mini du tour ≥ `SATURATED_PCT` — tu ne déploies pas
 *    ce que tu as (réarmée quand le mini repasse sous `SATURATED_REARM_PCT`).
 * Charge en pourcentage (0-100).
 */

export const CRITICAL_PCT = 15;
export const CRITICAL_REARM_PCT = 35;
export const DEFICIT_PCT = -8;
export const DEFICIT_REARM_PCT = -2;
export const SATURATED_PCT = 95;
export const SATURATED_REARM_PCT = 85;

export type BatteryEvent =
  | { kind: "critical"; soc: number }
  | { kind: "deficit"; perLap: number }
  | { kind: "saturated" };

export class BatteryWatcher {
  private minLap = Infinity;
  private lastLine: number | null = null;
  private deltas: number[] = [];
  private armed = { critical: true, deficit: true, saturated: true };

  reset(): void {
    this.minLap = Infinity;
    this.lastLine = null;
    this.deltas = [];
    this.armed = { critical: true, deficit: true, saturated: true };
  }

  /** À chaque trame : suit la charge mini du tour. */
  tick(soc: number): void {
    if (soc >= 0 && soc < this.minLap) this.minLap = soc;
  }

  /** Tour bouclé : évalue les trois situations. */
  lap(soc: number): BatteryEvent[] {
    const out: BatteryEvent[] = [];
    if (soc < CRITICAL_PCT) {
      if (this.armed.critical) {
        this.armed.critical = false;
        out.push({ kind: "critical", soc });
      }
    } else if (soc > CRITICAL_REARM_PCT) this.armed.critical = true;

    if (this.lastLine != null) {
      this.deltas.push(soc - this.lastLine);
      if (this.deltas.length > 2) this.deltas.shift();
    }
    this.lastLine = soc;
    if (this.deltas.length >= 2) {
      const mean = (this.deltas[0] + this.deltas[1]) / 2;
      if (mean <= DEFICIT_PCT) {
        if (this.armed.deficit) {
          this.armed.deficit = false;
          out.push({ kind: "deficit", perLap: -mean });
        }
      } else if (mean >= DEFICIT_REARM_PCT) this.armed.deficit = true;
    }

    if (isFinite(this.minLap)) {
      if (this.minLap >= SATURATED_PCT) {
        if (this.armed.saturated) {
          this.armed.saturated = false;
          out.push({ kind: "saturated" });
        }
      } else if (this.minLap < SATURATED_REARM_PCT) this.armed.saturated = true;
    }
    this.minLap = soc;
    return out;
  }
}
