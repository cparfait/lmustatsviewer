/**
 * Attente de la page Télémétrie : la liste ouvre chaque fichier `.duckdb` pour en
 * lire le circuit, la voiture et le meilleur tour, ce qui prend du temps quand le
 * joueur a beaucoup d'enregistrements. Message tout de suite, puis une explication
 * et le temps écoulé au-delà de quelques secondes (on voit que ça avance).
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

/** Au-delà, l'attente est expliquée (s). */
const SLOW_AFTER_S = 3;

export function TelemetryLoading({ what }: { what: "list" | "view" }) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const slow = elapsed >= SLOW_AFTER_S;
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center" role="status" aria-live="polite">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <div className="text-sm font-medium">
        {t(what === "list" ? "telemetry.loadingList" : "telemetry.loadingView")}
      </div>
      {slow && (
        <div className="max-w-md text-xs text-muted-foreground">
          {t(what === "list" ? "telemetry.loadingListSlow" : "telemetry.loadingViewSlow")}
          <span className="ml-1 tabular-nums">({t("telemetry.loadingElapsed", { s: elapsed })})</span>
        </div>
      )}
    </div>
  );
}
