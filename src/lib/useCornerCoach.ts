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
import { speak } from "@/lib/voice";
import {
  startCoachService,
  stopCoachService,
  onCoachSpeak,
  coachCornerEvent,
} from "@/lib/coach";

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

    void startCoachService();

    return () => {
      disposed = true;
      off();
      stopCoachService();
    };
  }, [enabled]);
}
