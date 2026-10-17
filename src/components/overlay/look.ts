/**
 * Apparence des overlays (page Overlays › Apparence des overlays).
 *
 * Deux styles : « Classique » (l'apparence historique, par défaut, inchangée) et
 * « Instrument » (angles presque vifs, filets de relief, palette sémantique, lignes
 * de classement teintées par classe, graphes en canvas haute définition). Options
 * indépendantes : police d'affichage à chiffres fixes, agrandissement net (le widget
 * est réellement mis en page à sa taille au lieu d'être étiré), densité des lignes,
 * texture fibrée, animations de record. Tout est désactivé par défaut.
 *
 * Les widgets lisent l'apparence par `useOverlayLook()` (contexte fourni par la
 * fenêtre overlay et par la page de widget servie).
 */
import { createContext, useContext } from "react";
import "./look.css";

export type OverlayStyle = "classic" | "instrument";
export type OverlayDensity = "compact" | "normal" | "cosy";

export interface OverlayLook {
  style: OverlayStyle;
  /** Police d'affichage (Bahnschrift, police de Windows) à chiffres de chasse fixe. */
  displayFont: boolean;
  /** Agrandissement net : `zoom` (mise en page à la taille réelle) au lieu de `scale`. */
  sharpScale: boolean;
  /** Hauteur des lignes de classement (style Instrument). */
  density: OverlayDensity;
  /** Texture fibrée discrète en tête de panneau (style Instrument). */
  texture: boolean;
  /** Animation quand un record perso / de séance tombe. */
  recordFx: boolean;
}

export const DEFAULT_LOOK: OverlayLook = {
  style: "classic",
  displayFont: false,
  sharpScale: false,
  density: "normal",
  texture: false,
  recordFx: false,
};

/** Fusionne une apparence stockée (partielle, ancienne) avec les défauts. */
export function mergeLook(stored: Partial<OverlayLook> | undefined | null): OverlayLook {
  const s = stored ?? {};
  return {
    style: s.style === "instrument" ? "instrument" : "classic",
    displayFont: !!s.displayFont,
    sharpScale: !!s.sharpScale,
    density: s.density === "compact" || s.density === "cosy" ? s.density : "normal",
    texture: !!s.texture,
    recordFx: !!s.recordFx,
  };
}

/** Classes CSS à poser sur la racine des overlays (voir `look.css`). */
export function lookClasses(look: OverlayLook): string {
  return [
    "ov-root",
    look.style === "instrument" ? "ov-instrument" : "ov-classic",
    look.displayFont && "ov-font-display",
    `ov-density-${look.density}`,
    look.texture && "ov-texture",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Palette sémantique (style Instrument) : une couleur = une information, la même
 * dans tous les widgets. En style Classique, chaque widget garde ses couleurs.
 */
export const SEMANTIC = {
  /** Record perso battu / temps gagné. */
  gain: "#3ee07a",
  /** Meilleur de la séance (classe). */
  sessionBest: "#b86bff",
  /** Temps perdu / danger. */
  loss: "#ff5a5a",
  /** Voiture ou tour de référence. */
  reference: "#f2c230",
  /** Accélérateur / frein (graphes). */
  throttle: "#3ee07a",
  brake: "#ff5a5a",
  /** Valeur neutre. */
  neutral: "rgba(255,255,255,0.88)",
} as const;

export type Tone = keyof typeof SEMANTIC;

export const OverlayLookContext = createContext<OverlayLook>(DEFAULT_LOOK);

export function useOverlayLook(): OverlayLook {
  return useContext(OverlayLookContext);
}

/**
 * Couleur d'une information : la palette sémantique en style Instrument, sinon la
 * couleur historique du widget (inchangée).
 */
export function toneColor(look: OverlayLook, tone: Tone, classic: string): string {
  return look.style === "instrument" ? SEMANTIC[tone] : classic;
}
