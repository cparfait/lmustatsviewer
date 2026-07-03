/** Modale d'aide : comment configurer le Coach IA (fournisseur, clé, modèle). */

import { useTranslation } from "react-i18next";
import { X, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiscordIcon } from "@/components/DiscordIcon";
import { DISCORD_URL } from "@/lib/links";

export function AiCoachHelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const steps = [
    t("config.aiHelpStep1"),
    t("config.aiHelpStep2"),
    t("config.aiHelpStep3"),
    t("config.aiHelpStep4"),
  ];

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
            <Brain className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-sm font-semibold text-primary">
            {t("config.aiHelpTitle")}
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
          <p className="text-muted-foreground">{t("config.aiHelpIntro")}</p>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="leading-snug">{s}</span>
              </li>
            ))}
          </ol>
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs leading-snug text-muted-foreground">
            {t("config.aiHelpNote")}
          </p>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md border border-[#5865F2]/40 bg-[#5865F2]/10 px-3 py-2 text-sm text-[#5865F2] transition-colors hover:bg-[#5865F2]/20"
          >
            <DiscordIcon className="h-4 w-4" />
            {t("config.aiHelpDiscord")}
          </a>
        </div>

        <div className="flex justify-end border-t border-border/50 px-4 py-3">
          <Button size="sm" onClick={onClose}>
            {t("config.aiHelpClose")}
          </Button>
        </div>
      </div>
    </div>
  );
}
