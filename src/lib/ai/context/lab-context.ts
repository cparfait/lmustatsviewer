/**
 * Blocs de contexte de l'Atelier (opt-in, Config › Atelier) pour le Coach IA :
 * - style de pilotage déclaré (S10) ;
 * - setup imposé par le serveur (S9) : plus aucune proposition de réglage.
 * Étiquettes anglaises compactes, bloc vide quand l'option est coupée.
 */

import type { LiveData } from "@/lib/api";
import { FLAG_FIXED_SETUP, readConfigFlag } from "@/lib/configFlag";
import { readDriverStyle, styleForPrompt } from "@/lib/driverStyle";

/** Vrai si le jeu signale un setup imposé (`mIsFixedSetup`). */
export function isFixedSetup(data: Pick<LiveData, "extended"> | null | undefined): boolean {
  return data?.extended?.fixed_setup === true;
}

export const FIXED_SETUP_TEXT =
  "## Fixed setup\nThe server imposes a fixed setup: the driver cannot change the garage setup. Do NOT suggest setup changes (wings, springs, bars, pressures, ride heights, differential). Only in-car adjustments remain possible (brake balance, TC, ABS, engine map) — coach driving and these only.";

/** Bloc « setup imposé » si l'option est active et le jeu le signale. */
export async function fixedSetupContext(data: Pick<LiveData, "extended"> | null | undefined): Promise<string> {
  if (!isFixedSetup(data)) return "";
  return (await readConfigFlag(FLAG_FIXED_SETUP)) ? FIXED_SETUP_TEXT : "";
}

/** Bloc « préférence du pilote » si un style est déclaré. */
export async function driverStyleContext(): Promise<string> {
  const line = styleForPrompt(await readDriverStyle());
  return line ? `## Driver preference\nThe driver ${line}. Take it into account when discussing car balance or setup.` : "";
}
