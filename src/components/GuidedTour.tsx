/**
 * GuidedTour — visite guidée de l'application (onboarding « explication de tout »).
 *
 * 9 étapes : stats, références, garage, live, télémétrie, spotter, coach,
 * overlays, conclusion. Ouverte automatiquement après la première configuration
 * (Onboarding) et relançable depuis la modale d'aide « ? » du header.
 *
 * Contenu 100 % i18n (`tour.*`, 4 langues). Composant présentiel pur : l'état
 * d'ouverture vit dans `stores/tour.ts`.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  ChevronLeft,
  ChevronRight,
  BarChart2,
  Gauge,
  Warehouse,
  Radio,
  Activity,
  Mic,
  Brain,
  LayoutGrid,
  Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTourStore } from "@/stores/tour";

/** Étapes : clé i18n + icône + nombre de puces. */
const SLIDES: { key: string; icon: React.ReactNode; points: number }[] = [
  { key: "stats", icon: <BarChart2 className="h-6 w-6" />, points: 3 },
  { key: "refs", icon: <Gauge className="h-6 w-6" />, points: 2 },
  { key: "garage", icon: <Warehouse className="h-6 w-6" />, points: 3 },
  { key: "live", icon: <Radio className="h-6 w-6" />, points: 3 },
  { key: "tele", icon: <Activity className="h-6 w-6" />, points: 3 },
  { key: "spotter", icon: <Mic className="h-6 w-6" />, points: 3 },
  { key: "coach", icon: <Brain className="h-6 w-6" />, points: 3 },
  { key: "overlays", icon: <LayoutGrid className="h-6 w-6" />, points: 2 },
  { key: "finish", icon: <Flag className="h-6 w-6" />, points: 3 },
];

export function GuidedTour() {
  const { t } = useTranslation();
  const open = useTourStore((s) => s.open);
  const setOpen = useTourStore((s) => s.setOpen);
  const [step, setStep] = useState(0);

  // Repart de la première étape à chaque ouverture.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight")
        setStep((s) => Math.min(s + 1, SLIDES.length - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 p-5 pb-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              {slide.icon}
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">
                {t(`tour.${slide.key}Title`)}
              </h2>
              <p className="text-xs text-muted-foreground">
                {step + 1} / {SLIDES.length}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label={t("tour.skip")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenu */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t(`tour.${slide.key}Desc`)}
          </p>
          <ul className="space-y-2">
            {Array.from({ length: slide.points }, (_, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 rounded-md bg-muted/40 px-3 py-2 text-sm"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{t(`tour.${slide.key}P${i + 1}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pied : points d'étape + navigation */}
        <div className="flex items-center justify-between gap-3 border-t border-border/60 p-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setOpen(false)}
          >
            {t("tour.skip")}
          </Button>
          <div className="flex items-center gap-1.5">
            {SLIDES.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(i)}
                aria-label={t(`tour.${s.key}Title`)}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === step
                    ? "w-5 bg-primary"
                    : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => s - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                {t("tour.back")}
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={() => setOpen(false)}>
                {t("tour.start")}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                {t("tour.next")}
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
