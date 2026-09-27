/**
 * Hôte de l'ingénieur de course — monté UNE fois au niveau de l'app (App.tsx).
 *
 * Les annonces vocales live ne dépendent plus de la page Live : tant que les
 * annonces sont activées, ce composant s'abonne au flux `live-data` et compte
 * pour un consommateur du polling Rust (même mécanisme de compteur que la page
 * Live et la fenêtre des overlays). On peut donc rouler avec l'app sur n'importe
 * quelle page, réduite ou cachée dans la barre des tâches. Le réglage
 * « annonces partout » désactivé revient au comportement historique : annonces
 * seulement quand la page Live est affichée.
 *
 * Rend `null` ; seul ce petit composant se re-rend au rythme des trames.
 */

import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { isTauri, live as liveApi, type LiveData } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { useVoiceCallouts } from "@/lib/engineer/useRaceEngineer";

export function RaceEngineerHost() {
  const { t, i18n } = useTranslation();
  const voiceAnnouncements = useAppStore((s) => s.voiceAnnouncements);
  const everywhere = useAppStore((s) => s.announceEverywhere);
  const onLive = useLocation().pathname.startsWith("/live");
  const active = voiceAnnouncements && (everywhere || onLive);
  const [data, setData] = useState<LiveData | null>(null);

  useEffect(() => {
    if (!active || !isTauri()) {
      setData(null);
      return;
    }
    let cancelled = false;
    let polling = false;
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const fn = await liveApi.onData((d) => {
          if (!cancelled) setData(d);
        });
        if (cancelled) fn();
        else unlisten = fn;
        await liveApi.startPolling();
        polling = true;
        // Démonté pendant l'attente : on rend le consommateur tout de suite
        // (sinon compteur fantôme côté Rust et polling qui ne s'arrête jamais).
        if (cancelled) {
          polling = false;
          liveApi.stopPolling().catch(() => {});
        }
      } catch {
        /* hors Tauri / jeu absent : rien à annoncer */
      }
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      if (polling) liveApi.stopPolling().catch(() => {});
      setData(null);
    };
  }, [active]);

  useVoiceCallouts(data, active, i18n.language, t);
  return null;
}
