/**
 * Plage de fonctionnement des disques selon la classe (module pur).
 * Sources (recherche du 06/10/2026, cf. SUIVI) :
 *  - Brembo, 24 h du Mans 2025 : Hypercar et LMP2 = carbone, 250–850 °C ;
 *    LMGT3 = fonte, 250–750 °C. LMP3 = acier imposé (règlement LMP3 art. 12.3).
 *  - Seuils par matériau d'un ingénieur vocal communautaire : fonte course
 *    « chaud » au-delà de 700 °C, carbone au-delà de 1 200 °C.
 * La moyenne restant sous les pics, son dépassement du HAUT de la plage de
 * fonctionnement signale une vraie surchauffe, pas un gros freinage.
 * Classe inconnue (GTE, autres) : 750 °C, valeur d'origine.
 */

import { radioClass } from "./text";

/** Bas de la plage de fonctionnement (°C) : en dessous, les disques sont froids. */
export const BRAKE_COLD_C = 250;

export function brakeAvgLimits(vehicleClass: string): { hot: number; rearm: number } {
  const cls = radioClass(vehicleClass);
  if (cls === "Hypercar" || cls === "LMP2") return { hot: 850, rearm: 800 }; // carbone
  return { hot: 750, rearm: 700 }; // fonte/acier (LMP3, GT3) et repli
}
