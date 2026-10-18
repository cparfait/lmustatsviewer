/**
 * GuidedTour — visite guidée de l'application, sur l'app réelle.
 *
 * Chaque étape ouvre sa page, entoure l'élément dont elle parle (entrée du menu,
 * bouton…) — le reste de l'écran est assombri — et pose la bulle d'explication à
 * côté, avec une flèche. Élément introuvable (module masqué, fenêtre trop étroite) :
 * bulle au centre, comme avant. Les éléments visés portent un attribut `data-tour`.
 *
 * Ouverte automatiquement après la première configuration (Onboarding) et
 * relançable depuis la modale d'aide « ? » du header. Contenu 100 % i18n
 * (`tour.*`). L'état d'ouverture vit dans `stores/tour.ts`.
 */

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Activity,
  BarChart2,
  Brain,
  ChevronLeft,
  ChevronRight,
  Flag,
  Gauge,
  LayoutGrid,
  Mic,
  Radio,
  Rocket,
  Warehouse,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTourStore } from "@/stores/tour";

interface Slide {
  /** Préfixe des clés i18n (`tour.<key>Title`, `<key>Desc`, `<key>P1…`). */
  key: string;
  icon: React.ReactNode;
  points: number;
  /** Page à ouvrir pour l'étape (rien = on reste où l'on est). */
  route?: string;
  /** Valeur `data-tour` de l'élément à entourer. */
  target?: string;
}

const SLIDES: Slide[] = [
  { key: "stats", icon: <BarChart2 className="h-5 w-5" />, points: 3, route: "/", target: "nav-records" },
  { key: "refs", icon: <Gauge className="h-5 w-5" />, points: 2, route: "/classement", target: "nav-community" },
  { key: "garage", icon: <Warehouse className="h-5 w-5" />, points: 3, route: "/setups", target: "nav-setups" },
  { key: "live", icon: <Radio className="h-5 w-5" />, points: 3, target: "nav-live" },
  { key: "tele", icon: <Activity className="h-5 w-5" />, points: 3, route: "/telemetry", target: "nav-telemetry" },
  { key: "spotter", icon: <Mic className="h-5 w-5" />, points: 3, route: "/config?cat=voice", target: "nav-config" },
  { key: "coach", icon: <Brain className="h-5 w-5" />, points: 3, route: "/config?cat=coach", target: "nav-config" },
  { key: "overlays", icon: <LayoutGrid className="h-5 w-5" />, points: 3, route: "/overlays", target: "nav-overlays" },
  { key: "play", icon: <Rocket className="h-5 w-5" />, points: 1, target: "play" },
  { key: "finish", icon: <Flag className="h-5 w-5" />, points: 3, route: "/", target: "help" },
];

/** Marge autour de l'élément entouré (px). */
const PAD = 6;
const CARD_W = 380;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Position de l'élément visé, suivie au redimensionnement et au défilement. */
function useTargetBox(target: string | undefined, key: string): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    if (!target) {
      setBox(null);
      return;
    }
    let raf = 0;
    let tries = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      const r = el?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else if (tries++ < 30) {
        // La page vient peut-être d'être ouverte : on réessaie quelques images.
        raf = requestAnimationFrame(measure);
      } else {
        setBox(null);
      }
    };
    measure();
    const onChange = () => {
      tries = 0;
      measure();
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [target, key]);
  return box;
}

export function GuidedTour() {
  const { t } = useTranslation();
  const open = useTourStore((s) => s.open);
  const setOpen = useTourStore((s) => s.setOpen);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  // Repart de la première étape à chaque ouverture.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, SLIDES.length - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const slide = SLIDES[step];

  // Ouvre la page de l'étape (le décor change avec l'explication).
  useEffect(() => {
    if (!open || !slide.route) return;
    if (location.pathname + location.search !== slide.route) navigate(slide.route);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seulement au changement d'étape
  }, [open, step]);

  const box = useTargetBox(open ? slide.target : undefined, `${step}:${location.pathname}`);

  if (!open) return null;

  const isLast = step === SLIDES.length - 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Bulle sous l'élément s'il y a la place, sinon au-dessus ; centrée sur lui,
  // gardée dans l'écran. Sans élément : au centre.
  let cardStyle: React.CSSProperties;
  let arrowLeft = 0;
  let below = true;
  if (box) {
    const w = Math.min(CARD_W, vw - 24);
    const left = Math.max(12, Math.min(vw - w - 12, box.left + box.width / 2 - w / 2));
    below = box.top + box.height + 260 < vh;
    cardStyle = below
      ? { position: "fixed", top: box.top + box.height + PAD + 12, left, width: w }
      : { position: "fixed", bottom: vh - box.top + PAD + 12, left, width: w };
    arrowLeft = Math.max(16, Math.min(w - 16, box.left + box.width / 2 - left));
  } else {
    cardStyle = { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: Math.min(520, vw - 24) };
  }

  return createPortal(
    <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)}>
      {box ? (
        // Découpe : tout est assombri sauf l'élément, entouré d'un anneau qui pulse.
        <div
          className="pointer-events-none fixed rounded-lg ring-2 ring-primary transition-all duration-300"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
          }}
        >
          <span className="absolute inset-0 animate-ping rounded-lg ring-2 ring-primary/60" />
        </div>
      ) : (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      )}

      <div
        className="rounded-xl border border-border bg-background shadow-2xl"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {box && (
          <span
            className={cn(
              "absolute h-3 w-3 rotate-45 border-border bg-background",
              below ? "-top-1.5 border-l border-t" : "-bottom-1.5 border-b border-r",
            )}
            style={{ left: arrowLeft - 6 }}
          />
        )}
        <div className="flex items-start gap-3 p-4 pb-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            {slide.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-tight">{t(`tour.${slide.key}Title`)}</h2>
            <p className="text-[11px] text-muted-foreground">
              {step + 1} / {SLIDES.length}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("tour.skip")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 px-4 pb-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{t(`tour.${slide.key}Desc`)}</p>
          <ul className="space-y-1.5">
            {Array.from({ length: slide.points }, (_, i) => (
              <li key={i} className="flex gap-2 text-[13px]">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{t(`tour.${slide.key}P${i + 1}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-muted-foreground">
            {t("tour.skip")}
          </Button>
          <div className="flex items-center gap-1">
            {SLIDES.map((s, i) => (
              <button
                key={s.key}
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
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => (isLast ? setOpen(false) : setStep((s) => s + 1))}
              className="gap-1"
            >
              {isLast ? t("tour.start") : t("tour.next")}
              {!isLast && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
