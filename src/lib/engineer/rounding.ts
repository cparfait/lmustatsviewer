/**
 * Arrondis de la parole (module pur + un interrupteur).
 *
 * Un ingénieur humain ne lit pas un relevé d'instrument : à la radio, un écart se dit
 * au dixième, une distance à la dizaine de mètres, une vitesse à 5 km/h près. Le
 * **calcul** reste précis (diagnostics, journaux, écrans) ; seul ce qui est **dit**
 * passe par ici.
 *
 * Réglage « Chiffres arrondis à la radio » (`radio_extras.roundedNumbers`, actif par
 * défaut). Coupé : la précision d'avant (freinages par 5 m, vitesses au km/h, écarts
 * de secteur au centième, objectif de chrono au millième).
 */

let rounded = true;

/** Interrupteur posé par le store des réglages. */
export function setRadioRounding(on: boolean): void {
  rounded = on;
}

export function radioRounding(): boolean {
  return rounded;
}

const stepRound = (x: number, step: number) => Math.max(step, Math.round(x / step) * step);

/** Distance dite (m) : 5 m près sous 20 m, puis à la dizaine. Coupé : par 5 m. */
export function sayMeters(m: number, on = rounded): number {
  const a = Math.abs(m);
  if (!on) return stepRound(a, 5);
  return a < 17.5 ? stepRound(a, 5) : stepRound(a, 10);
}

/** Écart de vitesse dit (km/h) : au km/h sous 5, puis à 5 km/h près. Coupé : au km/h. */
export function sayKmh(v: number, on = rounded): number {
  const a = Math.abs(v);
  if (!on || a < 4.5) return stepRound(a, 1);
  return stepRound(a, 5);
}

/** Écart de temps dit (s, texte décimal) : au dixième. Coupé : `oldDigits` décimales. */
export function saySeconds(s: number, oldDigits: number, on = rounded): string {
  return Math.abs(s).toFixed(on ? 1 : oldDigits);
}

/** Chrono dit (« 1:42.8 ») : au dixième. Coupé : au millième (« 1:42.881 »). */
export function sayLap(seconds: number, on = rounded): string {
  if (!(seconds > 0) || !isFinite(seconds)) return "";
  const unit = on ? 100 : 1;
  const total = Math.round((seconds * 1000) / unit) * unit;
  const min = Math.floor(total / 60000);
  const sec = (total % 60000) / 1000;
  return `${min}:${sec.toFixed(on ? 1 : 3).padStart(on ? 4 : 6, "0")}`;
}
