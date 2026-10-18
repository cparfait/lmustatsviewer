/**
 * Overlay « Radio » : sous-titres des annonces de l'ingénieur et du spotter —
 * pour rouler son coupé, en streaming, ou relire une info manquée. Les trois
 * dernières phrases, la plus récente en haut ; effacées après 20 s de silence.
 */

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import { onAppEvent } from "@/lib/widgetLink";
import type { RadioSubtitle } from "@/lib/useRadioAudio";
import type { WidgetProps } from "./types";

const KEEP = 3;
const HIDE_AFTER_MS = 20000;

/** Couleur par priorité : sécurité en rouge, spotter en jaune. */
function tone(priority: string, accent: string): string {
  if (priority === "critical") return "#f87171";
  if (priority === "spotter") return "#facc15";
  return accent;
}

export function RadioWidget({ accent, t }: WidgetProps) {
  const [lines, setLines] = useState<RadioSubtitle[]>([]);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    onAppEvent<RadioSubtitle>("radio-subtitle", (sub) => {
      setLines((prev) => [sub, ...prev.filter((l) => l.text !== sub.text)].slice(0, KEEP));
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setLines([]), HIDE_AFTER_MS);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  return (
    <Panel accent={accent} style={{ width: 420 }}>
      <PanelHeader accent={accent} icon={Radio} title={t("overlays.items.radio.title")} />
      <div className="space-y-1 p-3 text-[13px] leading-snug">
        {lines.length ? (
          lines.map((l, i) => (
            <div key={`${l.at}-${i}`} className={i === 0 ? "font-medium" : "text-white/50"} style={i === 0 ? { color: tone(l.priority, accent) } : undefined}>
              {l.text}
            </div>
          ))
        ) : (
          <div className="text-center text-white/40">{t("overlays.elements.radioIdle")}</div>
        )}
      </div>
    </Panel>
  );
}
