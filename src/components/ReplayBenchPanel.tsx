import { useTranslation } from "react-i18next";
import { Circle, Download, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTauri } from "@/lib/api";
import { saveRecording, startRecording, stopRecording, useRecorderStore } from "@/lib/replay/recorder";
import { toastError, toastSuccess } from "@/stores/dialogs";

/** Config › Maintenance : enregistrer une séance pour le banc de rejeu (⑱). */
export function ReplayBenchPanel() {
  const { t } = useTranslation();
  const recording = useRecorderStore((s) => s.recording);
  const frames = useRecorderStore((s) => s.frames);
  const save = async () => {
    try {
      if (await saveRecording()) toastSuccess(t("config.benchSaved"));
    } catch (e) {
      toastError(String(e));
    }
  };
  return (
    <div className="py-3 flex flex-col gap-2">
      <div className="text-sm font-medium">{t("config.bench")}</div>
      <p className="text-xs text-muted-foreground">{t("config.benchDesc")}</p>
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <Button size="sm" variant="outline" onClick={stopRecording}>
            <Square className="h-3.5 w-3.5 mr-1" />
            {t("config.benchStop")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={!isTauri()} onClick={() => void startRecording()}>
            <Circle className="h-3.5 w-3.5 mr-1 text-red-500" />
            {t("config.benchStart")}
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={recording || frames === 0} onClick={() => void save()}>
          <Download className="h-3.5 w-3.5 mr-1" />
          {t("config.benchSave")}
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">{t("config.benchFrames", { count: frames })}</span>
      </div>
    </div>
  );
}
