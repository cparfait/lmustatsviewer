/**
 * Fenêtre d'arrêt (module pur).
 *
 * L'autonomie effective est le minimum entre le carburant (estimation du plugin)
 * et, pour les voitures WEC, l'**énergie virtuelle** (mesurée tour après tour ici,
 * car c'est souvent elle qui limite une Hypercar). Si elle ne suffit pas pour
 * finir, un arrêt est requis et l'ingénieur le cadre :
 *  - « fenêtre ouverte » quand il reste ≤ `WINDOW_LAPS` tours d'autonomie ;
 *  - « ta fenêtre se ferme » à ≤ `CLOSING_LAPS` tours ;
 *  - « box box » (sécurité) à ≤ `BOX_CRITICAL_LAPS` tour.
 * Chaque message une fois par relais. Si le pilote accuse réception, les rappels
 * se taisent `ACK_SILENCE_LAPS` tours ; s'il annonce qu'il reste dehors,
 * `STAYOUT_SILENCE_LAPS` tours — le « box box » de sécurité, lui, part toujours.
 */

export const WINDOW_LAPS = 4;
export const CLOSING_LAPS = 2;
export const BOX_CRITICAL_LAPS = 1.5;
export const ACK_SILENCE_LAPS = 2;
export const STAYOUT_SILENCE_LAPS = 5;

export interface PitWindowInfo {
  /** Un arrêt est nécessaire pour finir (inconnu → false). */
  required: boolean;
  /** Autonomie effective (tours, fraction). */
  rangeLaps: number;
  /** Dernier tour à boucler avant de rentrer (numéro de tour absolu). */
  lastLap: number;
  limitedBy: "fuel" | "energy";
}

/**
 * `totalLaps` = tours bouclés ; `fuelLaps` / `energyLaps` = autonomie (tours,
 * ≤ 0 ou null si inconnue) ; `sessionLapsLeft` = tours restants (null si inconnu).
 */
export function pitWindow(
  totalLaps: number,
  fuelLaps: number,
  energyLaps: number | null,
  sessionLapsLeft: number | null,
): PitWindowInfo | null {
  let range = fuelLaps > 0 ? fuelLaps : Infinity;
  let by: PitWindowInfo["limitedBy"] = "fuel";
  if (energyLaps != null && energyLaps > 0 && energyLaps < range) {
    range = energyLaps;
    by = "energy";
  }
  if (!isFinite(range)) return null;
  return {
    required: sessionLapsLeft != null && range < sessionLapsLeft,
    rangeLaps: range,
    lastLap: totalLaps + Math.floor(range),
    limitedBy: by,
  };
}

/** Arrêts encore nécessaires pour finir (0 si l'autonomie suffit), ou null. */
export function stopsNeeded(
  sessionLapsLeft: number | null,
  rangeLaps: number,
  lapsPerStint: number | null,
): number | null {
  if (sessionLapsLeft == null || rangeLaps <= 0) return null;
  const missing = sessionLapsLeft - rangeLaps;
  if (missing <= 0) return 0;
  if (!lapsPerStint || lapsPerStint <= 0) return null;
  return Math.ceil(missing / lapsPerStint);
}

export type PitWindowEvent = "open" | "closing" | "box";

export class PitWindowTracker {
  private stint = -1;
  private said = { open: false, closing: false, box: false };
  private ackUntil = -1;
  private stayOutUntil = -1;

  reset(): void {
    this.stint = -1;
    this.said = { open: false, closing: false, box: false };
    this.ackUntil = -1;
    this.stayOutUntil = -1;
  }

  /** Le pilote a accusé réception (« compris », « box »). */
  ack(lap: number): void {
    this.ackUntil = lap + ACK_SILENCE_LAPS;
  }

  /** Le pilote reste dehors : rappels tus, puis ré-armés. */
  stayOut(lap: number): void {
    this.stayOutUntil = lap + STAYOUT_SILENCE_LAPS;
    this.said.closing = false;
  }

  update(info: PitWindowInfo | null, lap: number, pitstops: number, inPits: boolean): PitWindowEvent[] {
    if (pitstops !== this.stint) {
      this.stint = pitstops;
      this.said = { open: false, closing: false, box: false };
    }
    if (!info || !info.required || inPits) return [];
    if (info.rangeLaps <= BOX_CRITICAL_LAPS) {
      if (this.said.box) return [];
      this.said.box = true;
      return ["box"];
    }
    if (lap < this.ackUntil || lap < this.stayOutUntil) return [];
    const margin = Math.floor(info.rangeLaps);
    if (margin <= CLOSING_LAPS && !this.said.closing) {
      this.said.closing = true;
      this.said.open = true;
      return ["closing"];
    }
    if (margin <= WINDOW_LAPS && !this.said.open) {
      this.said.open = true;
      return ["open"];
    }
    return [];
  }
}

/**
 * Autonomie en énergie virtuelle, mesurée à la ligne : consommation moyenne des
 * derniers tours (fraction/tour). Un bond vers le haut (ravitaillement) repart
 * de zéro.
 */
export class EnergyTracker {
  private samples: number[] = [];

  reset(): void {
    this.samples = [];
  }

  /** Tour bouclé : énergie virtuelle restante (0-1). */
  push(ve: number): void {
    if (!(ve > 0)) return;
    const last = this.samples[this.samples.length - 1];
    if (last != null && ve > last + 0.02) this.samples = [];
    this.samples.push(ve);
    if (this.samples.length > 4) this.samples.shift();
  }

  /** Consommation moyenne (fraction/tour), ou null (moins de 2 tours mesurés). */
  perLap(): number | null {
    if (this.samples.length < 3) return null;
    let sum = 0;
    for (let i = 1; i < this.samples.length; i++) sum += this.samples[i - 1] - this.samples[i];
    const mean = sum / (this.samples.length - 1);
    return mean > 0.001 ? mean : null;
  }

  lapsRemaining(ve: number): number | null {
    const per = this.perLap();
    return per && ve > 0 ? ve / per : null;
  }
}
