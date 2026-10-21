/**
 * Barre « setup mixte » de la page Comparaison : apparaît dès qu'un réglage est
 * pris de B ; crée une copie de A avec ces réglages de B (nom libre, lignée
 * dans les notes), puis ouvre la nouvelle fiche.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Combine, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setups as setupsApi, type SetupDiffSection, type SetupEntry } from "@/lib/api";
import { mixPatches } from "@/lib/setupMix";
import { baseName, createSetupVersion, freeName } from "@/lib/setupVersion";
import { notesOf } from "@/lib/setupView";
import { toastError, toastSuccess } from "@/stores/dialogs";

export function SetupMixBar({ idA, idB, diffs, picked, sameCar }: { idA: number; idB: number; diffs: SetupDiffSection[]; picked: ReadonlySet<string>; sameCar: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [entryA, setEntryA] = useState<SetupEntry | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // Nom proposé : « A + B », libre dans le dossier du circuit de A.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [a, b] = await Promise.all([setupsApi.get(idA), setupsApi.get(idB)]);
      const taken = (await setupsApi.entries(a.car).catch(() => [] as SetupEntry[])).filter((e) => e.circuit === a.circuit).map((e) => e.name);
      if (!alive) return;
      setEntryA(a);
      setName(freeName(`${baseName(a)} + ${baseName(b)}`, taken));
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [idA, idB]);

  if (picked.size === 0) return null;

  const create = async () => {
    if (!entryA || !sameCar) return;
    setBusy(true);
    try {
      const svmA = await setupsApi.getContent(idA).catch(() => null);
      const patches = mixPatches(diffs, picked);
      const copy = await createSetupVersion({
        entry: entryA,
        patches,
        name,
        label: t("setupCompare.mixTag", { id: idB }),
        notes: svmA ? notesOf(svmA) : null,
        lines: patches.flatMap((s) => s.params.map((p) => `· [${s.name}] ${p.key} = ${p.comment || p.value}`)),
      });
      toastSuccess(t("setupAssistant.created", { name: copy.name }));
      navigate(`/setups/${copy.id}`);
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky bottom-3 z-20 mr-16 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-card p-3 shadow-xl">
      <Combine className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("setupCompare.mixCount", { count: picked.size })}</p>
        <p className="text-xs text-muted-foreground">{sameCar ? t("setupCompare.mixHint") : t("setupCompare.mixCarsDiffer")}</p>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={t("setupCompare.mixName")}
        className="h-8 w-64 rounded-md border border-input bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <Button size="sm" disabled={busy || !sameCar || !entryA || !name.trim()} onClick={() => void create()}>
        {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
        {t("setupCompare.mixCreate")}
      </Button>
    </div>
  );
}
