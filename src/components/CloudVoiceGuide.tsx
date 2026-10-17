/**
 * Aide pas à pas de la voix IA en ligne (Configuration › Audio / Voix, bouton
 * « Comment ça marche ? ») : voix locale ou en ligne, phrases dites en direct ou
 * préparées, « Préparer la voix », alertes urgentes, annonces chiffrées, coût.
 * Même présentation que la visite guidée : une étape par écran, flèches et points.
 * Contenu 100 % i18n (`cloudGuide.*`).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { BadgeEuro, ChevronLeft, ChevronRight, Hash, Radio, Siren, Sparkles, Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS: { key: string; icon: React.ReactNode; points: number }[] = [
  { key: "s1", icon: <Sparkles className="h-6 w-6" />, points: 3 },
  { key: "s2", icon: <Radio className="h-6 w-6" />, points: 2 },
  { key: "s3", icon: <Zap className="h-6 w-6" />, points: 3 },
  { key: "s4", icon: <Siren className="h-6 w-6" />, points: 3 },
  { key: "s5", icon: <Hash className="h-6 w-6" />, points: 2 },
  { key: "s6", icon: <BadgeEuro className="h-6 w-6" />, points: 3 },
];

export function CloudVoiceGuide({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setStep((n) => Math.min(n + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setStep((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 p-5 pb-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">{s.icon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("cloudGuide.title")}</p>
            <h2 className="text-lg font-bold leading-tight">{t(`cloudGuide.${s.key}Title`)}</h2>
            <p className="text-xs text-muted-foreground">
              {step + 1} / {STEPS.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("tour.skip")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 pb-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{t(`cloudGuide.${s.key}Desc`)}</p>
          <ul className="space-y-2">
            {Array.from({ length: s.points }, (_, i) => (
              <li key={i} className="flex gap-2.5 rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{t(`cloudGuide.${s.key}P${i + 1}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
            {t("tour.skip")}
          </Button>
          <div className="flex items-center gap-1">
            {STEPS.map((x, i) => (
              <button
                key={x.key}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((n) => n - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" className="gap-1" onClick={() => (last ? onClose() : setStep((n) => n + 1))}>
              {last ? t("cloudGuide.done") : t("tour.next")}
              {!last && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
