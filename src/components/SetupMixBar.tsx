/**
 * Barre « setup mixte » de la page Comparaison : apparaît dès qu'un réglage est
 * pris de B ; crée une copie de A avec ces réglages de B (nom libre, circuit et
 * type au choix, lignée dans les notes), puis ouvre la nouvelle fiche.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Combine, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setups as setupsApi, type SetupDiffSection, type SetupEntry } from "@/lib/api";
import { mixPatches } from "@/lib/setupMix";
import { baseName, createSetupVersion, freeName } from "@/lib/setupVersion";
import { notesOf } from "@/lib/setupView";
import { toastError, toastSuccess } from "@/stores/dialogs";
import { cn } from "@/lib/utils";

const TYPES = [
  { id: "Course", key: "setupDetail.typeRace" },
  { id: "Qualif", key: "setupDetail.typeQualif" },
  { id: "Autres", key: "setupDetail.typeOther" },
] as const;

export function SetupMixBar({
  idA,
  idB,
  diffs,
  picked,
  sameCar,
  circuits,
}: {
  idA: number;
  idB: number;
  diffs: SetupDiffSection[];
  picked: ReadonlySet<string>;
  sameCar: boolean;
  /** Dossiers circuit connus (tous les setups) : cibles possibles du setup mixte. */
  circuits: string[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [entryA, setEntryA] = useState<SetupEntry | null>(null);
  const [entryB, setEntryB] = useState<SetupEntry | null>(null);
  const [carEntries, setCarEntries] = useState<SetupEntry[]>([]);
  const [name, setName] = useState("");
  const [edited, setEdited] = useState(false);
  const [circuit, setCircuit] = useState("");
  const [setupType, setSetupType] = useState("");
  const [busy, setBusy] = useState(false);

  // Par défaut : circuit et type de A.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [a, b] = await Promise.all([setupsApi.get(idA), setupsApi.get(idB)]);
      const list = await setupsApi.entries(a.car).catch(() => [] as SetupEntry[]);
      if (!alive) return;
      setEntryA(a);
      setEntryB(b);
      setCarEntries(list);
      setCircuit(a.circuit);
      setSetupType(TYPES.some((x) => x.id === a.setup_type) ? a.setup_type : "Autres");
      setEdited(false);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [idA, idB]);

  // Nom proposé : « A + B », libre dans le dossier du circuit choisi (tant qu'il n'est pas retouché).
  useEffect(() => {
    if (!entryA || !entryB || edited) return;
    const taken = carEntries.filter((e) => e.circuit.toLowerCase() === circuit.toLowerCase()).map((e) => e.name);
    setName(freeName(`${baseName(entryA)} + ${baseName(entryB)}`, taken));
  }, [entryA, entryB, carEntries, circuit, edited]);

  const circuitList = useMemo(
    () => [...new Set([entryA?.circuit, entryB?.circuit, ...circuits].filter((c): c is string => !!c))].sort((x, y) => x.localeCompare(y)),
    [circuits, entryA, entryB],
  );

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
        circuit,
        setupType,
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
        onChange={(e) => {
          setName(e.target.value);
          setEdited(true);
        }}
        aria-label={t("setupCompare.mixName")}
        title={t("setupCompare.mixName")}
        className="h-8 w-64 rounded-md border border-input bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <select
        value={circuit}
        onChange={(e) => setCircuit(e.target.value)}
        aria-label={t("setupCompare.mixCircuit")}
        title={t("setupCompare.mixCircuit")}
        className="h-8 max-w-48 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {circuitList.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <div role="radiogroup" aria-label={t("setupCompare.mixType")} className="flex overflow-hidden rounded-md border border-input text-xs">
        {TYPES.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={setupType === x.id}
            onClick={() => setSetupType(x.id)}
            className={cn("px-2 py-1.5", setupType === x.id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent/50")}
          >
            {t(x.key)}
          </button>
        ))}
      </div>
      <Button size="sm" disabled={busy || !sameCar || !entryA || !name.trim()} onClick={() => void create()}>
        {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
        {t("setupCompare.mixCreate")}
      </Button>
    </div>
  );
}
