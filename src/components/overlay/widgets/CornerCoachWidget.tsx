/**
 * Overlay Coach virage (COACH-LIVE-SPEC.md §1.2, P2.3) : le conseil par virage
 * délivré par le coach vocal, avec le **détail chiffré exact** que la voix
 * n'énonce pas (elle arrondit « radio » à un seul chiffre).
 *
 * Écoute l'event `coach-corner` diffusé par `useCornerCoach` (fenêtre principale).
 * Efface le conseil 15 s après réception, pour ne pas encombrer le HUD (calqué sur
 * `CoachWidget`). N'affiche donc que ce qui a été **prononcé** (même timing §1).
 */

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Waypoints } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import type { CoachCornerEvent } from "@/lib/coach";
import type { WidgetProps } from "./types";

/** Vert « validé » pour un renforcement positif §1.4 (distinct de l'accent thème). */
const POSITIVE_COLOR = "#34d399";
/** Bleu « repère à venir » pour un callout prédictif Découverte (§8, P3.3). */
const PREDICT_COLOR = "#38bdf8";
/** Violet « mémoire » pour le rappel inter-sessions (§11, P4.1). */
const RECALL_COLOR = "#a855f7";
/** Ambre « débrief » pour le rapport de fin de session « 1+1+1 » (§11, P4.1). */
const REPORT_COLOR = "#fbbf24";

/** Détail chiffré exact (« 14.3 m ») — `null` si le diagnostic n'a pas de métrique. */
function detail(ev: CoachCornerEvent): string | null {
  if (!ev.unit || ev.magnitude <= 0) return null;
  const val = ev.unit === "m" ? ev.magnitude.toFixed(1) : ev.magnitude.toFixed(2);
  return `${val} ${ev.unit}`;
}

export function CornerCoachWidget({ accent, t }: WidgetProps) {
  const [ev, setEv] = useState<CoachCornerEvent | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    listen<CoachCornerEvent>("coach-corner", (e) => {
      setEv(e.payload);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setEv(null), 15000);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  const num = ev ? detail(ev) : null;
  // Couleur : vert « validé » (renforcement §1.4), bleu « repère à venir » (callout
  // prédictif §8), violet « mémoire » (rappel §11), ambre « débrief » (rapport §11),
  // sinon l'accent du thème (diagnostic réactif).
  const color = ev?.positive
    ? POSITIVE_COLOR
    : ev?.code === "predict"
      ? PREDICT_COLOR
      : ev?.code === "recall"
        ? RECALL_COLOR
        : ev?.code === "report"
          ? REPORT_COLOR
          : accent;
  // Le cap chiffré (rapport) n'a pas de virage → pas de pastille « T{n} ».
  const showBadge = !!ev && ev.corner > 0;

  return (
    <Panel accent={accent} style={{ width: 340 }}>
      <PanelHeader
        accent={accent}
        icon={Waypoints}
        title={t("overlays.items.cornercoach.title")}
      />
      <div className="p-3 text-[13px] leading-snug">
        {ev ? (
          <div className="flex items-start gap-2.5">
            {showBadge && (
              <span
                className="shrink-0 rounded-md px-2 py-0.5 font-mono text-sm font-bold tabular-nums"
                style={{ background: `${color}22`, color }}
              >
                T{ev.corner}
              </span>
            )}
            <div className="min-w-0">
              <div className="font-medium text-white/90">{ev.text}</div>
              {num && (
                <div
                  className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums"
                  style={{ color }}
                >
                  {num}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center text-white/40">
            {t("overlays.elements.cornerCoachIdle")}
          </div>
        )}
      </div>
    </Panel>
  );
}
