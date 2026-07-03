import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCw, Search, Trophy, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  setups as setupsApi,
  type SetupEntry,
  type SetupGroup,
  type SetupSessionMatch,
} from "@/lib/api";
import { formatTime, formatDateTime, cn } from "@/lib/utils";
import { CarImage } from "@/components/CarImage";
import {
  getCachedLmuCars,
  getCachedLmuCircuits,
  LMU_CAR_CATEGORY_LABELS,
  vehicleClassForCar,
  type LmuCarCategory,
} from "@/lib/staticData";

/**
 * Modale « Nouveau setup ». Calquée sur la V1 (Meta : Nom * + Type +
 * Circuit + Notes + lien session). Émet `onCreated` à la création réussie ;
 * le parent décide de la navigation (redirection vers la fiche en mode
 * édition).
 */
export function NewSetupDialog({
  lmuPath,
  groups,
  onClose,
  onCreated,
}: {
  lmuPath: string | null;
  groups: SetupGroup[];
  onClose: () => void;
  onCreated: (entry: SetupEntry) => void;
}) {
  const { t } = useTranslation();

  const [name, setName] = useState("");
  const [circuit, setCircuit] = useState("");
  const [car, setCar] = useState("");
  const [type, setType] = useState<"Qualif" | "Course" | "Autres">("Autres");
  const [notes, setNotes] = useState("");
  const [linkedSessionId, setLinkedSessionId] = useState<number | null>(null);

  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [sessionSearchResults, setSessionSearchResults] = useState<
    SetupSessionMatch[]
  >([]);
  const [sessionSearching, setSessionSearching] = useState(false);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catalogue circuits : statique LMU + circuits déjà présents en garage.
  const LMU_CARS = getCachedLmuCars();
  const LMU_CIRCUITS = getCachedLmuCircuits();

  const circuitOptions = [
    ...new Set([
      ...LMU_CIRCUITS,
      ...groups.flatMap((g) => g.tracks.map((tr) => tr.name)),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  /** Cherche les sessions du joueur compatibles avec la voiture choisie. */
  async function searchLinkSessions() {
    if (!car) return;
    setSessionSearching(true);
    try {
      const lmuCar = LMU_CARS.find((c) => c.model === car);
      const carName = lmuCar ? lmuCar.model : car;
      // Filtre voiture ET circuit (si renseigné). Le matching circuit est
      // tolérant côté backend (normalisation lowercase sans espaces, LIKE
      // bidirectionnel sur track ET track_course) car le nom du dossier
      // (« Imola ») peut différer du nom XML officiel.
      const results = await setupsApi.searchSessionsForSetup(
        carName,
        circuit.trim() || null
      );
      setSessionSearchResults(results);
      setSessionSearchOpen(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSessionSearching(false);
    }
  }

  const linkedSummary = linkedSessionId
    ? sessionSearchResults.find((r) => r.session_id === linkedSessionId) ?? null
    : null;

  async function handleSubmit() {
    if (!name.trim() || !circuit.trim() || !car || !lmuPath) return;
    setCreating(true);
    setError(null);
    try {
      const lmuCar = LMU_CARS.find((c) => c.model === car);
      const vehicleClass = lmuCar ? vehicleClassForCar(lmuCar) : car;
      const entry = await setupsApi.create(
        lmuPath,
        circuit.trim(),
        name.trim(),
        vehicleClass,
        type,
        notes.trim() || undefined,
        linkedSessionId
      );
      onCreated(entry);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="w-full max-w-lg mx-4">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            {t("setups.newSetup")}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t("setups.newSetupDesc")}
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("setups.car")}
            </label>
            <select
              value={car}
              onChange={(e) => setCar(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">{t("setups.selectCar")}</option>
              {(["hyper", "lmp2", "lmp3", "gt3", "gte"] as LmuCarCategory[]).map(
                (cat) => (
                  <optgroup key={cat} label={LMU_CAR_CATEGORY_LABELS[cat]}>
                    {LMU_CARS.filter((c) => c.category === cat).map((c) => (
                      <option key={c.model} value={c.model}>
                        {c.model}
                      </option>
                    ))}
                  </optgroup>
                )
              )}
            </select>
            {car && (
              <CarImage
                carName={car}
                className="mt-1 h-10 w-auto max-w-[170px] self-end object-contain opacity-80 [mask-image:linear-gradient(to_right,transparent,black_18%)]"
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("setups.circuitFolder")}
            </label>
            <select
              value={circuit}
              onChange={(e) => setCircuit(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">{t("setups.selectCircuit")}</option>
              {circuitOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("setups.newName")}
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="MonSetup_Spa"
                className="font-mono text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("setups.newType")}
              </label>
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as "Qualif" | "Course" | "Autres")
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="Qualif">{t("setups.typeQualif")}</option>
                <option value="Course">{t("setups.typeRace")}</option>
                <option value="Autres">{t("setups.typeOther")}</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("setups.newNotes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t("setups.newNotesPlaceholder")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Lien vers une session (best lap) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("setups.linkedSession")}
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={searchLinkSessions}
                disabled={!car || sessionSearching}
              >
                {sessionSearching ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Search className="h-3 w-3" />
                )}
                {t("setups.searchLink")}
              </Button>
            </div>
            {linkedSummary ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Trophy className="h-3.5 w-3.5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-medium truncate">
                      {linkedSummary.track}
                      {linkedSummary.track_course &&
                        ` · ${linkedSummary.track_course}`}
                    </p>
                    <p className="text-muted-foreground font-mono">
                      {formatTime(linkedSummary.best_lap ?? 0)} ·{" "}
                      {formatDateTime(linkedSummary.timestamp)} ·{" "}
                      {linkedSummary.session_type}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setLinkedSessionId(null)}
                  title={t("setups.unlinkSession")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <p className="text-xs italic text-muted-foreground">
                {car
                  ? t("setups.noLinkedSession")
                  : t("setups.linkPickCarFirst")}
              </p>
            )}
            {sessionSearchOpen && sessionSearchResults.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-background/60">
                {sessionSearchResults.map((r) => {
                  const selected = r.session_id === linkedSessionId;
                  return (
                    <button
                      key={r.session_id}
                      type="button"
                      onClick={() => {
                        setLinkedSessionId(r.session_id);
                        setSessionSearchOpen(false);
                      }}
                      className={cn(
                        "w-full text-left text-xs px-3 py-2 border-b border-border/40 last:border-0 hover:bg-accent/60 transition-colors",
                        selected && "bg-primary/10"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">
                          {r.track}
                          {r.track_course && ` · ${r.track_course}`}
                        </span>
                        <span className="font-mono text-success shrink-0">
                          {formatTime(r.best_lap ?? 0)}
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-0.5 flex gap-2">
                        <span>{r.session_type}</span>
                        <span>·</span>
                        <span>{r.car_class}</span>
                        <span>·</span>
                        <span>{formatDateTime(r.timestamp)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {sessionSearchOpen &&
              sessionSearchResults.length === 0 &&
              !sessionSearching && (
                <p className="text-xs italic text-muted-foreground">
                  {t("setups.noSessionsFound")}
                </p>
              )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("config.cancel")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleSubmit}
              disabled={
                !name.trim() ||
                !circuit.trim() ||
                !car ||
                creating ||
                !lmuPath
              }
            >
              {creating ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {t("setups.createSetup")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
