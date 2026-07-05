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
  onCoachDrillVerdict,
  onCoachStint,
  onCoachRisk,
  onCoachEvent,
  setDrillMode,
  setStintMode,
  setRiskMode,
  resolveCoachPhrase,
  setCoachPhraseBank,
  coachCornerEvent,
  type CoachCornerEvent,
} from "@/lib/coach";
import {
  applyOrGeneratePhrasebank,
  resetPhrasebankApplied,
} from "@/lib/coachPhrasebank";

/** TTL vocal étendu du débrief (§11) : plusieurs phrases → ne pas couper trop tôt. */
const REPORT_TTL_MS = 15000;

export function useCornerCoach() {
  const { t, i18n } = useTranslation();
  const enabled = useAppStore((s) => s.voiceAnnouncements);
  const drillMode = useAppStore((s) => s.coachDrill);
  const stintMode = useAppStore((s) => s.coachStint);
  const riskMode = useAppStore((s) => s.coachRisk);
  const phrasebankMode = useAppStore((s) => s.coachPhrasebank);
  const lang = i18n.language;

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
      // Banque de phrases LLM à slots (§10, P4.3) : variante pré-générée (slots
      // remplis en code) si le mode est actif et couvre ce (virage, diagnostic) ;
      // sinon repli sur le gabarit déterministe i18n.
      const text = resolveCoachPhrase(msg) ?? tRef.current(`live.${msg.suffix}`, msg.vars);
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

    // Verdict de drill (§8, P4.2) : retour à chaque passage sur un virage travaillé
    // (propre / série verte, ou le diagnostic chiffré). Réactif (TTL nominal).
    const offDrill = onCoachDrillVerdict((msg) => {
      if (disposed) return;
      if (!useAppStore.getState().voiceAnnouncements) return;
      // Verdict fautif = un diagnostic chiffré → éligible à la banque de phrases
      // (§10) ; verdict propre (`clean`) → gabarit i18n dédié (« validé »).
      const text =
        resolveCoachPhrase({ kind: msg.code, corner_uid: msg.corner_uid, sign: msg.sign, vars: msg.vars }) ??
        tRef.current(`live.${msg.suffix}`, msg.vars);
      if (!text) return;
      speak(text, langRef.current, "coach");
      const ev: CoachCornerEvent = {
        text,
        corner: msg.corner,
        code: msg.code,
        magnitude: msg.magnitude,
        unit: msg.unit,
        sign: msg.sign,
        positive: msg.clean, // passage propre → styling « validé » (vert)
      };
      void emit("coach-corner", ev);
    });

    // Conseils de stint (§12, P5.3) : dérive de la vitesse de passage (pneus qui
    // fatiguent), lift & coast (carburant juste), prudence out-lap. Canal `coach`,
    // gabarits i18n éditables (groupe `corners`) ; miroir widget (code dédié).
    const offStint = onCoachStint((adv) => {
      if (disposed) return;
      if (!useAppStore.getState().voiceAnnouncements) return;
      const text = tRef.current(`live.${adv.suffix}`, adv.vars);
      if (!text) return;
      speak(text, langRef.current, "coach");
      const ev: CoachCornerEvent = {
        text,
        corner: adv.corner,
        code: adv.kind,
        magnitude: adv.magnitude,
        unit: adv.unit,
        sign: 0,
        positive: false,
      };
      void emit("coach-corner", ev);
    });

    // Coaching du risque + cible de classe (§12, P5.4) : coupures de piste répétées
    // (« pas rentable ») et écart de secteur vs le meilleur de ta classe. Canal `coach`.
    const offRisk = onCoachRisk((adv) => {
      if (disposed) return;
      if (!useAppStore.getState().voiceAnnouncements) return;
      const text = tRef.current(`live.${adv.suffix}`, adv.vars);
      if (!text) return;
      speak(text, langRef.current, "coach");
      const ev: CoachCornerEvent = {
        text,
        corner: adv.corner,
        code: adv.kind,
        magnitude: adv.magnitude,
        unit: adv.unit,
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
      offDrill();
      offStint();
      offRisk();
      stopCoachService();
      clearSpeechCache(); // libère les callouts pré-synthétisés du combo
    };
  }, [enabled]);

  // Mode Drill (§8/§11, P4.2) : reflète l'interrupteur Config dans le service. Actif
  // seulement quand la voix l'est ; le service reprend son nominal à la coupure.
  useEffect(() => {
    setDrillMode(enabled && isTauri() ? drillMode : false);
  }, [enabled, drillMode]);

  // Coaching de stint (§12, P5.3) : reflète l'interrupteur Config dans le service.
  // Actif seulement quand la voix l'est ; à la coupure, le relais courant est oublié.
  useEffect(() => {
    setStintMode(enabled && isTauri() ? stintMode : false);
  }, [enabled, stintMode]);

  // Coaching du risque + cible de classe (§12, P5.4) : reflète l'interrupteur Config.
  useEffect(() => {
    setRiskMode(enabled && isTauri() ? riskMode : false);
  }, [enabled, riskMode]);

  // Banque de phrases LLM à slots (§10, P4.3) : hors chemin critique. À chaque
  // changement de combo (ou à l'activation du mode en roulage), charge la banque
  // persistée si compatible, sinon la génère (un appel batch) et la persiste. Le
  // service reste sur ses gabarits déterministes tant qu'aucune banque n'est posée.
  useEffect(() => {
    if (!enabled || !isTauri()) return;
    if (!phrasebankMode) {
      setCoachPhraseBank(null);
      resetPhrasebankApplied();
      return;
    }
    let disposed = false;
    const tryApply = () => {
      if (disposed) return;
      void applyOrGeneratePhrasebank(langRef.current);
    };
    tryApply(); // combo courant (mode activé en cours de session)
    const off = onCoachEvent((ev) => {
      if (ev.type === "combo-changed") tryApply();
    });
    return () => {
      disposed = true;
      off();
      setCoachPhraseBank(null);
      resetPhrasebankApplied();
    };
  }, [enabled, phrasebankMode, lang]);
}
