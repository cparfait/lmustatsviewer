/**
 * Persistance des notes radio (idée ④) : chargées depuis `config`
 * (`radio_feedback`) au démarrage, réécrites (différé 1 s) à chaque note.
 * Monté une fois dans `App`.
 */

import { useEffect } from "react";
import { config, isTauri } from "@/lib/api";
import { radioLog, type Stats } from "./radioFeedback";

export function useRadioFeedback(): void {
  useEffect(() => {
    if (!isTauri()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void config
      .get("radio_feedback")
      .then((raw) => {
        const parsed = raw ? (JSON.parse(raw) as Stats) : null;
        if (parsed && typeof parsed === "object") radioLog.stats = parsed;
      })
      .catch(() => {});
    radioLog.onStatsChanged = (s) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void config.set("radio_feedback", JSON.stringify(s)).catch(() => {}), 1000);
    };
    return () => {
      radioLog.onStatsChanged = null;
      if (timer) clearTimeout(timer);
    };
  }, []);
}
