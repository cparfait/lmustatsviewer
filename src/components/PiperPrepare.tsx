/**
 * Génération d'avance des phrases fixes de Piper pour la voix choisie (Config → Audio /
 * Voix). Aussi proposée à l'installation d'une voix (`VoiceDownloads.tsx`).
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Row } from "@/components/CloudVoicePrepare";
import {
  cancelPiperPrep,
  piperPhrases,
  piperPrepSnapshot,
  planPiperPrep,
  preparePiperPhrases,
  subscribePiperPrep,
  type PiperPrepPlan,
} from "@/lib/piperPrep";

export function PiperPrepare({
  voiceLabel,
  refreshKey,
}: {
  /** Nom de la voix choisie, vide si c'est celle par défaut de la langue. */
  voiceLabel: string;
  /** Change avec la voix, le locuteur, la vitesse ou les voix installées : devis à refaire. */
  refreshKey: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { running, done, total, outcome } = useSyncExternalStore(subscribePiperPrep, piperPrepSnapshot);
  const [plan, setPlan] = useState<PiperPrepPlan | null>(null);

  useEffect(() => {
    if (running) return;
    let alive = true;
    const texts = piperPhrases(
      lang,
      (k, o) => t(k, o),
      i18n.getResourceBundle(lang.slice(0, 2), "translation")?.live,
    );
    planPiperPrep(texts, lang)
      .then((p) => {
        if (alive) setPlan(p);
      })
      .catch(() => {
        if (alive) setPlan(null);
      });
    return () => {
      alive = false;
    };
  }, [lang, t, i18n, running, outcome, refreshKey]);

  const voice = voiceLabel || t("config.piperPrepVoiceDefault");
  const allReady = !running && !!plan && plan.missing.length === 0;
  const desc = running
    ? t("config.piperPrepProgress", { done, total })
    : !plan
      ? t("config.piperPrepHint")
      : allReady
        ? t("config.piperPrepReady", { total: plan.total, voice })
        : t("config.piperPrepPlan", { n: plan.missing.length, total: plan.total, voice });

  return (
    <div className="space-y-1.5">
      <Row label={t("config.piperPrep")} desc={desc}>
        {allReady ? (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("config.cloudVoicePrepReadyBadge")}
          </span>
        ) : running ? (
          <Button variant="outline" size="sm" className="h-8" onClick={cancelPiperPrep}>
            {t("config.cloudVoicePrepCancel")}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={!plan}
            title={t("config.piperPrepHint")}
            onClick={() => plan && void preparePiperPhrases(plan, (k, o) => t(k, o))}
          >
            {t("config.piperPrepBtn")}
          </Button>
        )}
      </Row>
      {running && total > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={done} aria-valuemax={total}>
          <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
