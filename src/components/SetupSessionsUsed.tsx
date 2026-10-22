/**
 * Fiche setup : sessions roulées avec ce setup, reconnues en piste (le setup
 * chargé est noté à chaque tour). Tours roulés avec lui et meilleur tour par session.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { setups as setupsApi, type SetupSessionUse } from "@/lib/api";
import { formatDateTime, formatTime } from "@/lib/utils";
import { useSetupStats } from "@/lib/setupStats";
import { SetupUsageSummary } from "@/components/SetupUsageSummary";

export function SetupSessionsUsed({ setupId, linkedSessionId }: { setupId: number; linkedSessionId: number | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<SetupSessionUse[] | null>(null);
  const stats = useSetupStats(setupId);

  useEffect(() => {
    let alive = true;
    setupsApi
      .sessionsUsage(setupId)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [setupId]);

  if (rows == null) return null;
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-2">{t("lab.loaded.sessionsTitle")}</h3>
      <div className="mb-2">
        <SetupUsageSummary stats={stats.get(setupId)} />
      </div>
      {rows.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">{t("lab.loaded.sessionsEmpty")}</p>
      ) : (
        <div className="space-y-1">
          {rows.map((r) => (
            <button
              key={r.session_id}
              type="button"
              onClick={() => navigate(`/sessions/${r.session_id}`)}
              className="flex w-full items-center gap-3 rounded-md border border-border px-2.5 py-1.5 text-left text-xs hover:border-primary/40 hover:bg-accent/40"
            >
              <span className="text-muted-foreground tabular-nums">{formatDateTime(r.timestamp)}</span>
              <span className="font-medium">{r.session_type}</span>
              <span className="text-muted-foreground truncate flex-1">{r.track}</span>
              <span className="text-muted-foreground">{t("lab.loaded.laps", { count: r.laps })}</span>
              <span className="font-mono tabular-nums">{r.best_lap != null ? formatTime(r.best_lap) : "—"}</span>
              {r.unsaved && (
                <span title={t("lab.loaded.unsavedShort")}>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </span>
              )}
              {r.session_id === linkedSessionId && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-micro text-primary">{t("lab.loaded.reference")}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
