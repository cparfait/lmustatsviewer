/** Overlay Coach IA : dernière question vocale reconnue + réponse, dans le HUD. */

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { MessageSquare } from "lucide-react";
import { Panel, PanelHeader } from "@/components/overlay/ui";
import { config } from "@/lib/api";
import type { WidgetProps } from "./types";

interface CoachExchange {
  question: string;
  answer: string | null;
}

export function CoachWidget({ accent, t }: WidgetProps) {
  const [ex, setEx] = useState<CoachExchange | null>(null);
  // Touche push-to-talk configurée → affichée dans le message au repos.
  const [key, setKey] = useState("Alt+C");
  useEffect(() => {
    config
      .get("spotter_key_coach")
      .then((k) => k && setKey(k))
      .catch(() => {});
  }, []);

  // Écoute l'event diffusé par le coach vocal (`useCoachVoice`, fenêtre
  // principale). Affiche la question dès la transcription, puis la réponse ;
  // efface l'échange 15 s après la réponse pour ne pas encombrer le HUD.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    listen<CoachExchange>("coach-voice", (e) => {
      setEx(e.payload);
      if (hideTimer) clearTimeout(hideTimer);
      if (e.payload.answer) hideTimer = setTimeout(() => setEx(null), 15000);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  return (
    <Panel accent={accent} style={{ width: 380 }}>
      <PanelHeader
        accent={accent}
        icon={MessageSquare}
        title={t("overlays.items.coach.title")}
      />
      <div className="p-3 text-[13px] leading-snug">
        {ex ? (
          <>
            <div className="text-white/55">🎤 {ex.question}</div>
            <div className="mt-1.5 font-medium" style={{ color: accent }}>
              {ex.answer ?? "…"}
            </div>
          </>
        ) : (
          <div className="text-center text-white/40">
            {t("overlays.elements.coachIdle", { key })}
          </div>
        )}
      </div>
    </Panel>
  );
}
