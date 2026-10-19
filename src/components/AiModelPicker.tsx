/**
 * Sélecteur de modèle IA partagé (page Config + Config V2).
 *
 * **Un seul champ** : la flèche ouvre la liste RÉELLE sondée chez le fournisseur
 * (`/models`, modèle actuel coché) ; cliquer sur le nom permet de le modifier ou
 * de chercher dans la liste à la frappe. Un id absent de la liste (modèle tout
 * juste sorti) reste saisissable : il est retenu à Entrée ou en quittant le
 * champ, Échap annule. Sans liste (hors ligne, fournisseur muet), le champ
 * reste en saisie libre avec un exemple d'id.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Tip } from "@/components/ui/tooltip";
import type { AIProvider, ModelInfo } from "@/lib/ai/types";

export function AiModelPicker({
  provider,
  models,
  loading,
  value,
  onChange,
  onRefresh,
}: {
  provider: AIProvider | undefined;
  models: ModelInfo[];
  loading: boolean;
  value: string;
  onChange: (v: string) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  // Texte en cours de frappe : ne devient le modèle qu'une fois validé. Écrire
  // directement dans la config enregistrait « deep » comme modèle pendant une
  // simple recherche.
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (v: string) => {
    const id = v.trim();
    if (!id) setDraft(value); // champ vidé : on garde le modèle actuel
    else if (id !== value) onChange(id);
  };

  const inList = models.some((m) => m.id === value);
  // Exemple d'id courant pour ce fournisseur (mode saisie) : 1er repli statique.
  const example = provider?.fallbackModels[0]?.id;
  // Le modèle enregistré peut dater de plusieurs versions : sans cet
  // avertissement, l'utilisateur ne découvre le retrait qu'au premier appel.
  const retired = Boolean(value && provider?.isRetiredModel?.(value));

  const openDocs = () => {
    const url = provider?.docsUrl;
    if (!url) return;
    void import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(url))
      .catch(() => window.open(url, "_blank"));
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Combobox
          toggle
          value={draft}
          selected={value}
          onChange={setDraft}
          onPick={(v) => {
            setDraft(v);
            commit(v);
          }}
          options={models.map((m) => ({ value: m.id, label: m.label }))}
          placeholder={
            example
              ? t("config.aiModelPlaceholder", { id: example })
              : t("config.aiModelPlaceholderPlain")
          }
          ariaLabel={t("config.aiModelChoose")}
          toggleLabel={t("config.aiModelFromList")}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Escape") {
              setDraft(value);
            }
          }}
          className="h-8 w-[210px] rounded-md border border-input bg-background pl-2.5 pr-7 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Tip content={t("config.aiRefreshModels")} side="top">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onRefresh}
            disabled={loading}
            aria-label={t("config.aiRefreshModels")}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </Tip>
      </div>

      {/* Aucune liste sondée : note explicative sur la saisie libre. */}
      {models.length === 0 && (
        <p className="max-w-[300px] text-right text-[11px] leading-snug text-muted-foreground/80">
          {example ? t("config.aiModelHint", { id: example }) : t("config.aiModelHintPlain")}
        </p>
      )}

      {retired && (
        <p className="max-w-[300px] text-right text-[11px] leading-snug text-amber-500">
          <AlertTriangle className="mr-1 inline h-3 w-3 align-[-2px]" />
          <span>
            {t("config.aiModelRetired")}{" "}
            {example && example !== value && (
              <button
                type="button"
                onClick={() => onChange(example)}
                className="font-medium underline underline-offset-2 hover:text-amber-400"
              >
                {t("config.aiModelUseExample", { id: example })}
              </button>
            )}
          </span>
        </p>
      )}

      {/* Lien vers la doc : utile seulement quand l'id vient d'ailleurs que de la
          liste (rien de sondé, ou modèle saisi à la main). */}
      {provider?.docsUrl && (models.length === 0 || (value && !inList)) && (
        <button
          type="button"
          onClick={openDocs}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          {t("config.aiModelsDocs")}
        </button>
      )}
    </div>
  );
}
