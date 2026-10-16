/**
 * Menu des stands du jeu (module pur) : options d'énergie virtuelle / de
 * carburant et choix de la bonne option pour l'arrêt.
 *
 * Les libellés viennent du jeu (« 50% 10.1 laps », « 60% (12.1 laps) »,
 * « No Change ») : on ne lit que le pourcentage.
 */

import type { PitMenuItem } from "@/lib/api";

export interface EnergyOption {
  index: number;
  /** Niveau visé à la sortie des stands (0-1). */
  frac: number;
}

/** Élément « énergie virtuelle » du menu (sinon null : voiture sans énergie). */
export function energyItem(menu: PitMenuItem[]): PitMenuItem | null {
  return menu.find((m) => /energy/i.test(m.name)) ?? null;
}

export function energyOptions(item: PitMenuItem): EnergyOption[] {
  const out: EnergyOption[] = [];
  item.options.forEach((text, index) => {
    const m = /(\d{1,3}(?:[.,]\d+)?)\s*%/.exec(text);
    if (m) out.push({ index, frac: Number(m[1].replace(",", ".")) / 100 });
  });
  return out;
}

/** Marge ajoutée au besoin (en tours de conso). */
export const ENERGY_MARGIN_LAPS = 0.5;

/**
 * Niveau d'énergie à demander pour l'arrêt : de quoi finir (+ marge) si c'est
 * le dernier relais, sinon le plein.
 */
export function energyNeed(lapsLeft: number | null, perLap: number | null): number | null {
  if (lapsLeft == null || !perLap || perLap <= 0) return null;
  return Math.min(1, (lapsLeft + ENERGY_MARGIN_LAPS) * perLap);
}

/** Plus petite option qui couvre le besoin, sinon la plus haute. */
export function chooseEnergy(options: EnergyOption[], need: number): EnergyOption | null {
  if (!options.length) return null;
  const sorted = [...options].sort((a, b) => a.frac - b.frac);
  return sorted.find((o) => o.frac >= need - 1e-9) ?? sorted[sorted.length - 1];
}
