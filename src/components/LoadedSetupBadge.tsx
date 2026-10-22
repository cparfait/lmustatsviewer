/**
 * Bandeau « setup chargé » de la page Live : le setup que le jeu dit chargé dans
 * la voiture (lu en piste), un clic ouvre sa fiche. Prévient quand la voiture
 * porte des réglages non enregistrés (le fichier n'est pas tout à fait ce qui roule).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Wrench } from "lucide-react";
import { setups as setupsApi, type LmuRestLive, type SetupEntry } from "@/lib/api";
import { findLoadedEntry, loadedSetup } from "@/lib/loadedSetup";

export function LoadedSetupBadge({ rest }: { rest: LmuRestLive | null | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loaded = loadedSetup(rest);
  const name = loaded?.setup.name ?? "";
  const folder = loaded?.setup.folder ?? null;
  const [entry, setEntry] = useState<SetupEntry | null>(null);

  useEffect(() => {
    if (!name || !folder) {
      setEntry(null);
      return;
    }
    let alive = true;
    const setup = loaded?.setup;
    setupsApi
      .entries(null, folder)
      .then((all) => alive && setEntry(findLoadedEntry(all, setup)))
      .catch(() => alive && setEntry(null));
    return () => {
      alive = false;
    };
    // Relu seulement quand le setup chargé change (pas à chaque trame).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, folder]);

  if (!loaded) return null;
  const { setup, fresh } = loaded;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-muted/30 px-6 py-1.5 text-xs">
      <span className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-micro">
        <Wrench className="h-3.5 w-3.5 text-primary" />
        {t("lab.loaded.label")}
      </span>
      {entry ? (
        <button
          type="button"
          onClick={() => navigate(`/setups/${entry.id}`)}
          className="font-medium text-foreground hover:text-primary underline-offset-2 hover:underline"
          title={t("lab.loaded.open")}
        >
          {setup.file}
        </button>
      ) : (
        <span className="font-medium text-foreground">{setup.file}</span>
      )}
      <span className="text-muted-foreground">
        {setup.folder ?? t("lab.loaded.builtIn")}
        {!fresh && ` · ${t("lab.loaded.seen")}`}
      </span>
      {setup.unsaved === true && (
        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          {t("lab.loaded.unsaved")}
        </span>
      )}
    </div>
  );
}
