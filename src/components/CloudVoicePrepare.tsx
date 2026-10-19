/**
 * « Préparer la voix » (voix en ligne) : devis puis génération des phrases fixes
 * et des morceaux d'annonces chiffrées — partagé par le bloc « Voix IA en ligne »
 * et le banc d'écoute (seul endroit du banc qui envoie quelque chose).
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cancelCloudPrep,
  cloudVoiceSnapshot,
  effectiveModel,
  effectiveVoice,
  planCloudPrep,
  runCloudPrep,
  subscribeCloudVoice,
  type CloudPrepPlan,
} from "@/lib/cloudVoice";
import {
  CLOUD_PREP_ANSWER_KEYS,
  CLOUD_PREP_WHEEL_KEYS,
  WHEEL_VOICE_KEYS,
  cloudPrepKeys,
  estimateCostUsd,
  wheelTemplates,
} from "@/lib/cloudVoicePrep";
import { getMessageText } from "@/lib/voiceMessages";
import { isTauri } from "@/lib/api";
import { cloudPrepTexts, cloudSegmentPrepTexts } from "@/lib/voice";
import { useAppStore } from "@/stores/app";
import { toastError, toastSuccess } from "@/stores/dialogs";

export function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight">{label}</div>
        {desc && <div className="text-xs text-muted-foreground/80 mt-0.5">{desc}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

/**
 * « Préparer la voix » : devis (phrases, caractères, coût) calculé localement,
 * puis génération des phrases fixes absentes du cache — seulement sur clic.
 */
export function PrepareVoice() {
  const { t, i18n: i18nInst } = useTranslation();
  const snap = useSyncExternalStore(subscribeCloudVoice, cloudVoiceSnapshot);
  const { settings, hasKey, prep, lastError } = snap;
  const lang = i18nInst.language;
  const rate = useAppStore((s) => s.voiceRate);
  const running = prep?.running === true;
  const [plan, setPlan] = useState<CloudPrepPlan | null>(null);
  const [segmentCount, setSegmentCount] = useState(0);

  // Devis recalculé quand la voix (fournisseur, modèle, voix), la langue ou la
  // vitesse change, et après chaque préparation : un devis périmé n'est jamais affiché.
  useEffect(() => {
    if (!isTauri() || !hasKey || running) return;
    let alive = true;
    const { code, rate: r, texts } = cloudPrepTexts(
      [
        ...cloudPrepKeys().map((k) => getMessageText(lang, k)),
        // Crevaison / roue arrachée nommées : une version par roue.
        ...CLOUD_PREP_WHEEL_KEYS.flatMap((k) =>
          wheelTemplates(
            getMessageText(lang, k),
            WHEEL_VOICE_KEYS.map((w) => t(`live.wheelVoice.${w}`, { lng: lang })),
          ),
        ),
        // Réponses de l'ingénieur quand on lui parle (accusé, « pas compris »…).
        ...CLOUD_PREP_ANSWER_KEYS.map((k) => t(k, { lng: lang })),
      ],
      lang,
    );
    // Annonces chiffrées : leurs morceaux (nombres, parties fixes) sont toujours préparés.
    const segments = cloudSegmentPrepTexts(lang);
    setSegmentCount(segments.length);
    planCloudPrep([...new Set([...texts, ...segments])], code, r)
      .then((p) => alive && setPlan(p))
      .catch(() => alive && setPlan(null));
    return () => {
      alive = false;
      setPlan(null);
    };
  }, [settings, hasKey, lang, rate, running, prep?.outcome, t]);

  const start = async () => {
    if (!plan) return;
    const outcome = await runCloudPrep(plan);
    const st = cloudVoiceSnapshot().prep;
    const made = st ? st.done - st.failed : 0;
    if (outcome === "done" && st?.failed) toastError(t("config.cloudVoicePrepFailed", { n: st.failed }));
    else if (outcome === "done") toastSuccess(t("config.cloudVoicePrepDone", { n: made }));
    else if (outcome === "paused")
      toastError(t("config.cloudVoicePrepPaused", { error: cloudVoiceSnapshot().lastError || "—" }));
    else if (outcome === "changed") toastError(t("config.cloudVoicePrepChanged"));
    else toastSuccess(t("config.cloudVoicePrepCancelled", { n: made }));
  };

  const money = (usd: number) =>
    new Intl.NumberFormat(lang, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: usd < 0.1 ? 3 : 2,
    }).format(usd);

  let desc = t("config.cloudVoicePrepDesc");
  if (running && prep)
    desc = prep.ready
      ? t("config.cloudVoicePrepProgressResume", { done: prep.done, total: prep.total, ready: prep.ready })
      : t("config.cloudVoicePrepProgress", { done: prep.done, total: prep.total });
  else if (plan && plan.missing.length === 0) desc = t("config.cloudVoicePrepReady", { total: plan.total });
  else if (plan)
    desc = t("config.cloudVoicePrepPlan", {
      n: plan.missing.length,
      total: plan.total,
      chars: plan.chars.toLocaleString(lang),
      cost: money(estimateCostUsd(settings.provider, effectiveModel(), plan.chars)),
    });

  // Tout est déjà dans le cache : un repère vert « Voix prête » à la place d'un
  // bouton grisé (qui laissait croire à un blocage).
  const allReady = !running && !!plan && plan.missing.length === 0;

  return (
    <div className="space-y-1.5">
      <Row label={t("config.cloudVoicePrep")} desc={desc}>
        {allReady ? (
          <span
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            title={t("config.cloudVoicePrepReadyHint")}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("config.cloudVoicePrepReadyBadge")}
          </span>
        ) : running ? (
          <Button variant="outline" size="sm" className="h-8" onClick={cancelCloudPrep}>
            {t("config.cloudVoicePrepCancel")}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={!plan || plan.missing.length === 0 || !effectiveVoice()}
            title={t(settings.alertsLocal ? "config.cloudVoicePrepHintLocal" : "config.cloudVoicePrepHint")}
            onClick={() => void start()}
          >
            {t("config.cloudVoicePrep")}
          </Button>
        )}
      </Row>
      {segmentCount > 0 && !running && (
        <div className="text-xs text-muted-foreground/70">{t("config.cloudVoicePrepSegments", { n: segmentCount })}</div>
      )}
      {running && prep && prep.total > 0 && (
        <div
          className="h-1.5 w-full overflow-hidden rounded bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={prep.total}
          aria-valuenow={prep.done}
          aria-label={t("config.cloudVoicePrep")}
        >
          <div className="h-full bg-primary transition-all" style={{ width: `${(100 * prep.done) / prep.total}%` }} />
        </div>
      )}
      {running && lastError && <div className="text-xs text-amber-500 break-words">{lastError}</div>}
    </div>
  );
}
