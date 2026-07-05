/**
 * HelpModal — aide in-app accessible via le « ? » du header.
 *
 * Trois blocs : raccourcis clavier globaux (valeurs réelles du store, pas les
 * défauts), prérequis des fonctions live/télémétrie/voix/coach IA, et actions
 * (revoir la visite guidée, notes de version). Contenu 100 % i18n (`help.*`).
 */

import { useEffect } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  X,
  Keyboard,
  ListChecks,
  ScrollText,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app";
import { useTourStore } from "@/stores/tour";
import { DiscordIcon } from "@/components/DiscordIcon";
import { DISCORD_URL } from "@/lib/links";

export function HelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const spotterKeyStatus = useAppStore((s) => s.spotterKeyStatus);
  const spotterKeyMute = useAppStore((s) => s.spotterKeyMute);
  const spotterKeyRepeat = useAppStore((s) => s.spotterKeyRepeat);
  const spotterKeyTalk = useAppStore((s) => s.spotterKeyTalk);
  const spotterKeyCoach = useAppStore((s) => s.spotterKeyCoach);
  const overlayToggleKey = useAppStore((s) => s.overlayToggleKey);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shortcuts: { label: string; value: string }[] = [
    { label: t("help.shortcutStatus"), value: spotterKeyStatus },
    { label: t("help.shortcutMute"), value: spotterKeyMute },
    { label: t("help.shortcutRepeat"), value: spotterKeyRepeat },
    { label: t("help.shortcutTalk"), value: spotterKeyTalk },
    { label: t("help.shortcutCoach"), value: spotterKeyCoach },
    { label: t("help.shortcutOverlay"), value: overlayToggleKey },
  ];

  const requirements: { title: string; desc: string }[] = [
    { title: t("help.reqPlugin"), desc: t("help.reqPluginDesc") },
    { title: t("help.reqTelemetry"), desc: t("help.reqTelemetryDesc") },
    { title: t("help.reqVoice"), desc: t("help.reqVoiceDesc") },
    { title: t("help.reqAi"), desc: t("help.reqAiDesc") },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-border/60 bg-background p-4">
          <div>
            <h2 className="text-lg font-bold leading-tight">
              {t("help.title")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("help.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Visite guidée */}
          <Button
            className="w-full"
            onClick={() => {
              onClose();
              useTourStore.getState().setOpen(true);
            }}
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            {t("help.replayTour")}
          </Button>

          {/* Raccourcis clavier */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Keyboard className="h-4 w-4 text-primary" />
              {t("help.shortcuts")}
            </h3>
            <div className="rounded-md border border-border/60 divide-y divide-border/60">
              {shortcuts.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">{s.label}</span>
                  {s.value ? (
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {s.value}
                    </kbd>
                  ) : (
                    <span className="text-xs text-muted-foreground/60">
                      {t("help.notSet")}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground/70">
              {t("help.shortcutsNote")}
            </p>
          </section>

          {/* Prérequis */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="h-4 w-4 text-primary" />
              {t("help.requirements")}
            </h3>
            <div className="space-y-2">
              {requirements.map((r) => (
                <div
                  key={r.title}
                  className="rounded-md bg-muted/40 px-3 py-2 text-sm"
                >
                  <div className="font-medium">{r.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.desc}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Liens */}
          <div className="flex items-center gap-2">
            <Link
              to="/changelog"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
            >
              <ScrollText className="h-3.5 w-3.5" />
              {t("changelog.title")}
            </Link>
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[#5865F2] hover:bg-[#5865F2]/10 transition-colors"
            >
              <DiscordIcon className="h-3.5 w-3.5" />
              Discord
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
