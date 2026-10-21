/**
 * Style de pilotage déclaré par le pilote (opt-in, Config › Atelier) : la
 * voiture qu'il aime — stable, vive ou agressive. Il oriente le profil proposé
 * par défaut, l'audit IA et le Coach IA. Vide = non précisé.
 */

import { useEffect, useState } from "react";
import { config, isTauri } from "@/lib/api";
import { FLAG_DRIVER_STYLE } from "@/lib/configFlag";

export type DriverStyle = "" | "stable" | "lively" | "aggressive";
export const DRIVER_STYLE_KEY = "driver_style";
const EVENT = "lmusv:driver-style";

function clean(v: string | null | undefined): DriverStyle {
  return v === "stable" || v === "lively" || v === "aggressive" ? v : "";
}

/** Style retenu (vide si l'option est coupée ou rien n'est choisi). */
export async function readDriverStyle(): Promise<DriverStyle> {
  if (!isTauri()) return "";
  const [on, v] = await Promise.all([config.get(FLAG_DRIVER_STYLE), config.get(DRIVER_STYLE_KEY)]).catch(() => [null, null]);
  return on === "1" ? clean(v) : "";
}

export async function setDriverStyle(v: DriverStyle): Promise<void> {
  await config.set(DRIVER_STYLE_KEY, v);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
}

/** Valeur brute choisie (même option coupée), relue à chaud. */
export function useDriverStyleValue(): DriverStyle {
  const [v, setV] = useState<DriverStyle>("");
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void config
      .get(DRIVER_STYLE_KEY)
      .then((x) => alive && setV(clean(x)))
      .catch(() => {});
    const on = (e: Event) => setV(clean((e as CustomEvent<string>).detail));
    window.addEventListener(EVENT, on);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, on);
    };
  }, []);
  return v;
}

/** Ligne de contexte (anglais) pour les prompts de l'IA, vide si non précisé. */
export function styleForPrompt(s: DriverStyle): string {
  switch (s) {
    case "stable":
      return "prefers a stable, forgiving car (understeer is acceptable, avoid a nervous rear)";
    case "lively":
      return "prefers a lively, responsive car that turns in well, but still raceable";
    case "aggressive":
      return "prefers a sharp, aggressive car with maximum rotation (qualifying style), accepts a loose rear";
    default:
      return "";
  }
}
