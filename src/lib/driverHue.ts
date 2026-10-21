/**
 * Pastille d'un pilote sans avatar : la couleur de la classe affichée (teintes du site
 * communautaire), donnée déjà présente — aucune requête en plus. Classe inconnue : une
 * couleur stable tirée de son repère public (#xxxx), même calcul que `site.js`.
 */
import { CAR_CLASS_COLORS, liveClassKey } from "@/lib/staticData";

/** Teinte (0-359) stable pour une clé (repère du pilote, à défaut son nom). */
export function hueOf(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  return h;
}

/** Couleur de la pastille : celle de la classe si on la connaît, sinon celle du repère. */
export function driverDotColor(key: string, carClass?: string | null): string {
  const palette = carClass ? (CAR_CLASS_COLORS[carClass] ?? CAR_CLASS_COLORS[liveClassKey(carClass)]) : undefined;
  return palette?.color ?? `hsl(${hueOf(key)} 55% 50%)`;
}

/** Classe la plus jouée d'une liste de combos (fiche d'un pilote) ; `null` si vide. */
export function mainClassOf(combos: { car_class: string }[]): string | null {
  const n = new Map<string, number>();
  for (const c of combos) n.set(c.car_class, (n.get(c.car_class) ?? 0) + 1);
  let best: string | null = null;
  for (const [cls, k] of n) if (best === null || k > (n.get(best) ?? 0)) best = cls;
  return best;
}
