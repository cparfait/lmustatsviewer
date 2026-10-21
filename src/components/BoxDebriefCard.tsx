/**
 * Carte « Bilan au box » (Atelier, opt-in) : affichée par-dessus l'app quand le
 * bilan d'un relais est prêt. Le défaut, où et sur combien de tours, puis la
 * correction proposée ; « Créer la nouvelle version » l'écrit à côté du setup
 * (l'original n'est jamais modifié).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyStep } from "@/lib/setupAssistant";
import { createSetupVersion, baseName } from "@/lib/setupVersion";
import { notesOf } from "@/lib/setupView";
import { useBoxDebriefStore } from "@/lib/useBoxDebrief";
import { toastError, toastSuccess } from "@/stores/dialogs";

export function BoxDebriefCard() {
  const { t } = useTranslation();
  const p = useBoxDebriefStore((s) => s.proposal);
  const clear = useBoxDebriefStore((s) => s.clear);
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const w = p.report.worst;

  const apply = async () => {
    if (!p.entry || !p.svm || !p.rec || !w) return;
    setBusy(true);
    try {
      const sign = p.rec.dir > 0 ? "+1" : "−1";
      const what = `${t(`setupAssistant.symptom.${w.symptom}`)} · ${t(`setupAssistant.phase.${w.phase}`)} · ${t(`setupAssistant.regime.${w.regime}`)}`;
      const copy = await createSetupVersion({
        entry: p.entry,
        patches: applyStep(p.svm, p.rec),
        label: `${t("lab.debrief.noteTag")} — ${t(`setupAssistant.lever.${p.rec.lever}`)} ${sign} (${what})`,
        notes: notesOf(p.svm),
        lines: [t("lab.debrief.where", { dist: w.dist, speed: w.apexSpeed, laps: w.laps, dev: Math.abs(w.deviation) })],
      });
      toastSuccess(t("setupAssistant.created", { name: copy.name }));
      clear();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border border-primary/40 bg-card p-3 text-sm shadow-2xl">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Wrench className="h-4 w-4 text-primary" />
          {t("lab.debrief.title")}
        </span>
        <button type="button" onClick={clear} aria-label={t("lab.debrief.dismiss")} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      {!w ? (
        <p className="text-muted-foreground">{t("lab.debrief.balanced", { laps: p.report.laps })}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="font-medium">
            {t(`setupAssistant.symptom.${w.symptom}`)} · {t(`setupAssistant.phase.${w.phase}`)} · {t(`setupAssistant.regime.${w.regime}`)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("lab.debrief.where", { dist: w.dist, speed: w.apexSpeed, laps: w.laps, dev: Math.abs(w.deviation) })}
          </p>
          {p.rec && p.entry ? (
            <p className="text-xs">
              {t("lab.debrief.proposal", {
                lever: t(`setupAssistant.lever.${p.rec.lever}`),
                dir: t(p.rec.dir > 0 ? "setupAssistant.up" : "setupAssistant.down"),
                setup: baseName(p.entry),
              })}
            </p>
          ) : (
            <p className="text-xs text-amber-600">
              {p.entry && p.allAtLimit ? t("lab.debrief.atLimit", { setup: baseName(p.entry) }) : t("lab.debrief.noSetup")}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2">
            {p.rec && p.entry && (
              <Button size="sm" disabled={busy} onClick={() => void apply()}>
                {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                {t("lab.debrief.apply")}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={clear}>
              {t("lab.debrief.dismiss")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
