/**
 * Modale affichée à l'activation des « Annonces vocales » quand la voix
 * neuronale de la langue active n'est pas installée : explique ce qui va
 * parler (alertes, coach, spotter), pourquoi la voix se télécharge (plus
 * bundlée dans l'installeur) et propose le téléchargement immédiat via
 * `VoiceDownloads`. Fermable sans télécharger : repli voix système.
 */

import { useTranslation } from "react-i18next";
import { Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceDownloads } from "@/components/VoiceDownloads";

export function VoiceIntroModal({
  onClose,
  onInstalled,
}: {
  onClose: () => void;
  /** Relayé à VoiceDownloads (rafraîchit tts_available côté parent). */
  onInstalled?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-border/60 bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/[0.08] px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Volume2 className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-sm font-semibold text-primary">
            {t("config.voiceIntroTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("config.cancel")}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4 text-sm">
          <p className="leading-snug text-muted-foreground">
            {t("config.voiceIntroP1")}
          </p>
          <p className="leading-snug text-muted-foreground">
            {t("config.voiceIntroP2")}
          </p>
          <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2.5">
            <VoiceDownloads kind="tts" onInstalled={onInstalled} />
          </div>
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs leading-snug text-muted-foreground">
            {t("config.voiceIntroNote")}
          </p>
        </div>

        <div className="flex justify-end border-t border-border/50 px-4 py-3">
          <Button size="sm" variant="outline" onClick={onClose}>
            {t("config.voiceIntroClose")}
          </Button>
        </div>
      </div>
    </div>
  );
}
