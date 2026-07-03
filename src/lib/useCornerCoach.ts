/**
 * Coach par virage — restitution vocale (COACH-LIVE-SPEC.md §1/§9, P2.2).
 *
 * Démarre le **service coach autonome** (moteur de mesure + diagnostic, abonné au
 * flux `live-data` brut) et prononce les conseils que le service laisse passer :
 * un diagnostic qui a franchi sa **fenêtre de délivrance** (§1 : fenêtre calme +
 * fraîcheur) et l'**anti-spam** (§9). Le texte vient des gabarits i18n éditables
 * (`live.vCorner*`, groupe `corners` de la modale d'annonces), interpolés avec le
 * numéro de virage et l'unique chiffre du format radio (§1.2).
 *
 * Monté une seule fois (App.tsx), à côté de `useSpotter`/`useCoachVoice`. Gated
 * sur `voiceAnnouncements` : c'est l'interrupteur vocal global (raccourci Mute).
 * Quand la voix est coupée, le service s'arrête (aucun travail de fond inutile).
 * Priorité `coach` → ne coupe jamais le spotter.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { emit } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/app";
import { isTauri } from "@/lib/api";
import { speak, prewarmSpeech, clearSpeechCache } from "@/lib/voice";
import {
  startCoachService,
  stopCoachService,
  onCoachSpeak,
  onCoachPredict,
  onPredictTargets,
  onCoachReport,
  onCoachRecall,
  coachCornerEvent,
  type CoachCornerEvent,
} from "@/lib/coach";

/** TTL vocal étendu du débrief (§11) : plusieurs phrases → ne pas couper trop tôt. */
const REPORT_TTL_MS = 15000;

export function useCornerCoach() {
  const { t, i18n } = useTranslation();
  const enabled = useAppStore((s) => s.voiceAnnouncements);

  // Refs « vivantes » : le handler de délivrance est enregistré une seule fois
  // mais doit lire la langue / les traductions courantes (comme `useSpotter`).
  const tRef = useRef(t);
  const langRef = useRef(i18n.language);
  tRef.current = t;
  langRef.current = i18n.language;

  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let disposed = false;

    // Abonnement synchrone (avant le démarrage async du service) → aucun message
    // manqué entre `startCoachService()` et l'installation du listener.
    const off = onCoachSpeak((msg) => {
      if (disposed) return;
      // Re-vérifie le mute au moment de parler (l'utilisateur a pu couper depuis).
      if (!useAppStore.getState().voiceAnnouncements) return;
      const text = tRef.current(`live.${msg.suffix}`, msg.vars);
      if (!text) return;
      speak(text, langRef.current, "coach");
      // Miroir visuel (P2.3) : le widget overlay `cornercoach` affiche le même
      // conseil + le détail chiffré exact que la voix n'énonce pas (§1.2). Porte
      // aussi les retours positifs §1.4 (`positive` → styling « validé »).
      void emit("coach-corner", coachCornerEvent(msg, text));
    });

    // Callouts prédictifs Découverte (§8, P3.3) : repère ApexPoints prononcé avant
    // le freinage, joué depuis le tampon **pré-synthétisé** (aucune latence Piper).
    const offPredict = onCoachPredict((msg) => {
      if (disposed) return;
      if (!useAppStore.getState().voiceAnnouncements) return;
      const text = tRef.current(`live.${msg.suffix}`, msg.vars);
      if (!text) return;
      speak(text, langRef.current, "coach");
      // Miroir widget : code `predict` (styling « repère à venir » côté overlay).
      const ev: CoachCornerEvent = {
        text,
        corner: msg.corner,
        code: "predict",
        magnitude: 0,
        unit: "",
        sign: 0,
        positive: false,
      };
      void emit("coach-corner", ev);
    });

    // (Re)calcul des cibles → pré-synthèse Piper des textes fixes au chargement du
    // combo (§8) : le callout jouera ensuite dans sa fenêtre « ≥ 2 s avant ».
    const offTargets = onPredictTargets((targets) => {
      if (disposed) return;
      const texts = targets.map((tg) => tRef.current(`live.${tg.suffix}`, tg.vars));
      void prewarmSpeech(texts, langRef.current);
    });

    // Débrief de relais (§11, P4.1) : rapport « 1+1+1 » (progrès / chantier / cap).
    // Prononcé d'un bloc (TTL étendu) ; miroir widget = texte multi-lignes, badge
    // ancré sur le virage-chantier (code `report`).
    const offReport = onCoachReport((report) => {
      if (disposed) return;
      if (!useAppStore.getState().voiceAnnouncements) return;
      const texts = report.lines
        .map((l) => tRef.current(`live.${l.suffix}`, l.vars))
        .filter(Boolean);
      if (!texts.length) return;
      speak(texts.join(" "), langRef.current, "coach", REPORT_TTL_MS);
      const chantier = report.lines.find((l) => l.kind === "chantier");
      const ev: CoachCornerEvent = {
        text: texts.join("  •  "),
        corner: chantier?.corner ?? 0,
        code: "report",
        magnitude: 0,
        unit: "",
        sign: 0,
        positive: false,
      };
      void emit("coach-corner", ev);
    });

    // Rappel inter-sessions (§11, P4.1) : « la dernière fois, ton chantier était le
    // virage N » au 1ᵉʳ virage d'un combo connu (code `recall`).
    const offRecall = onCoachRecall((line) => {
      if (disposed) return;
      if (!useAppStore.getState().voiceAnnouncements) return;
      const text = tRef.current(`live.${line.suffix}`, line.vars);
      if (!text) return;
      speak(text, langRef.current, "coach");
      const ev: CoachCornerEvent = {
        text,
        corner: line.corner,
        code: "recall",
        magnitude: 0,
        unit: "",
        sign: 0,
        positive: false,
      };
      void emit("coach-corner", ev);
    });

    void startCoachService();

    return () => {
      disposed = true;
      off();
      offPredict();
      offTargets();
      offReport();
      offRecall();
      stopCoachService();
      clearSpeechCache(); // libère les callouts pré-synthétisés du combo
    };
  }, [enabled]);
}
