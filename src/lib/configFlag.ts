/**
 * Interrupteurs simples (« 1 » / absent) stockés en config, relus à chaud : un réglage
 * changé dans la Configuration prévient les composants et hooks déjà montés (évènement
 * fenêtre `lmusv:config-flag`). Toutes ces options sont désactivées par défaut.
 */
import { useEffect, useState } from "react";
import { config, isTauri } from "@/lib/api";

/** Évènement fenêtre émis quand un interrupteur change (`detail: { key, on }`). */
export const CONFIG_FLAG_EVENT = "lmusv:config-flag";
const EVENT = CONFIG_FLAG_EVENT;

/** Dernière valeur connue de chaque interrupteur (lue ou écrite par ce module). */
const known = new Map<string, boolean>();

/**
 * Valeur déjà connue d'un interrupteur, sans attendre (false si jamais lue) : pour le
 * code synchrone (contextes IA) appelé depuis une page qui lit déjà ce réglage.
 */
export function cachedConfigFlag(key: string): boolean {
  return known.get(key) ?? false;
}

/** Écrit l'interrupteur et prévient les abonnés de la fenêtre. */
export async function setConfigFlag(key: string, on: boolean): Promise<void> {
  known.set(key, on);
  await config.set(key, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, on } }));
}

/** Valeur courante d'un interrupteur (false tant qu'elle n'est pas lue). */
export function useConfigFlag(key: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void config
      .get(key)
      .then((v) => {
        known.set(key, v === "1");
        if (alive) setOn(v === "1");
      })
      .catch(() => {});
    const onChange = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; on: boolean }>).detail;
      if (d?.key === key) setOn(d.on);
    };
    window.addEventListener(EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, onChange);
    };
  }, [key]);
  return on;
}

/** Clés des nouveautés d'analyse (veille 2026-10-17), toutes désactivées par défaut. */
export const FLAG_REGULARITY = "session_regularity";
export const FLAG_COMPARABLE = "comparable_tags";
export const FLAG_RECORD_BEEPS = "record_beeps";
export const FLAG_REVIEW_MARKS = "review_marks_enabled";

/**
 * Atelier setup et analyses (veille du 2026-10-20), toutes désactivées par défaut
 * (Config › Atelier).
 */
export const FLAG_SETUP_AUDIT = "lab_setup_audit";
export const FLAG_BOX_DEBRIEF = "lab_box_debrief";
export const FLAG_SETUP_PROFILES = "lab_setup_profiles";
export const FLAG_AIDS_ZONES = "lab_aids_zones";
export const FLAG_PLATFORM_WATCH = "lab_platform_watch";
export const FLAG_FIXED_SETUP = "lab_fixed_setup";
export const FLAG_DRIVER_STYLE = "lab_driver_style";
export const FLAG_SETUP_PLATES = "lab_setup_plates";
export const FLAG_SETUP_SHARING = "lab_setup_sharing";
export const FLAG_RADIO_SPLIT = "lab_radio_split";
export const FLAG_STREAM_EVENTS = "lab_stream_events";
export const FLAG_ACHIEVEMENTS = "lab_achievements";

/**
 * Analyse et suivi (veille du 2026-10-21), tous désactivés par défaut
 * (Préférences › Affichage › « Analyse : nouveautés »).
 */
/** Relie un enregistrement télémétrie à sa session de résultats (empreinte des chronos). */
export const FLAG_TELEM_LINK = "an_telemetry_link";
/** Télémétrie : chronos officiels, tours annulés, secteurs du tour seul, tours de pause. */
export const FLAG_OFFICIAL_LAPS = "an_official_laps";
/** Débrief en cartes (confiance, preuves, aller au tour) + carte zone de freinage. */
export const FLAG_EVIDENCE_CARDS = "an_evidence_cards";
/** Pastilles de constance et phrase de progression (onglet Débrief). */
export const FLAG_CONSISTENCY_DOTS = "an_consistency_dots";
/** Comparaison avec la meilleure session du combo (même circuit, même voiture). */
export const FLAG_BEST_SESSION = "an_best_session";
/** Objectifs de la semaine sur le tableau de bord. */
export const FLAG_WEEKLY_GOALS = "an_weekly_goals";
/** Graphes de télémétrie en vue large : pics de pédale conservés. */
export const FLAG_PEAK_PEDALS = "an_peak_pedals";
/**
 * Détection fine des virages : analyse après la session (lecteur, coach IA post-course,
 * meilleur théorique) et coach en direct (fenêtres de la réf recalculées au chargement,
 * identités des virages connus conservées ; rien n'est réécrit en base).
 */
export const FLAG_FINE_CORNERS = "an_fine_corners";
/** Page Télémétrie : diagnostic du dossier et type de session lu dans le nom du fichier. */
export const FLAG_TELEM_DIAG = "an_telemetry_diag";

/** Lecture ponctuelle d'un interrupteur (hors composant React). */
export async function readConfigFlag(key: string): Promise<boolean> {
  if (!isTauri()) return false;
  const on = (await config.get(key).catch(() => null)) === "1";
  known.set(key, on);
  return on;
}
