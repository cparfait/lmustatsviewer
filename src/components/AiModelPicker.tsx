/**
 * Sélecteur de modèle IA partagé (page Config + Config V2).
 *
 * Deux modes, commutables :
 *  - SAISIE (défaut) : champ libre, avec suggestions issues de `/models`. C'est
 *    le mode par défaut pour TOUS les fournisseurs : les endpoints `/models`
 *    sont incomplets ou absents selon les cas (modèle tout juste sorti,
 *    passerelle à des centaines d'entrées, repli statique hors ligne, modèle
 *    Ollama local nommé librement). Un menu fermé empêcherait alors de saisir
 *    un id parfaitement valide.
 *  - LISTE : menu déroulant des modèles sondés, pour choisir sans rien taper.
 *    Un `<select>` affiche tout d'un coup — contrairement à un `<datalist>`
 *    qui filtre selon la saisie et n'en montrait qu'un.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Loader2, ExternalLink, Pencil, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import type { AIProvider, ModelInfo } from "@/lib/ai/types";

const MANUAL = "__manual__";

export function AiModelPicker({
  provider,
  models,
  loading,
  value,
  onChange,
  onRefresh,
  listId = "ai-model-options",
}: {
  provider: AIProvider | undefined;
  models: ModelInfo[];
  loading: boolean;
  value: string;
  onChange: (v: string) => void;
  onRefresh: () => void;
  listId?: string;
}) {
  const { t } = useTranslation();
  // Saisie libre par défaut ; le passage en liste est explicite et ne survit
  // pas à un changement de fournisseur (les ids d'un fournisseur n'ont aucun
  // sens chez un autre). `provider` a une référence stable — élément du
  // registre statique PROVIDERS.
  const [manual, setManual] = useState(true);
  useEffect(() => {
    setManual(true);
  }, [provider]);

  const inList = models.some((m) => m.id === value);
  const showInput = manual || models.length === 0;

  const openDocs = () => {
    const url = provider?.docsUrl;
    if (!url) return;
    void import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(url))
      .catch(() => window.open(url, "_blank"));
  };

  const fieldCls =
    "h-8 w-[210px] rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {showInput ? (
          <input
            list={listId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("config.aiModelPlaceholder")}
            spellCheck={false}
            autoComplete="off"
            className={fieldCls}
          />
        ) : (
          <select
            value={inList ? value : MANUAL}
            onChange={(e) => {
              if (e.target.value === MANUAL) setManual(true);
              else onChange(e.target.value);
            }}
            className={`${fieldCls} cursor-pointer`}
          >
            {value && !inList && <option value={value}>{value}</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value={MANUAL}>{t("config.aiModelManual")}</option>
          </select>
        )}
        <datalist id={listId}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </datalist>
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
      <div className="flex items-center gap-3">
        {models.length > 0 && (
          <button
            type="button"
            onClick={() => setManual((m) => !m)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showInput ? (
              <>
                <List className="h-3 w-3" />
                {t("config.aiModelFromList")}
              </>
            ) : (
              <>
                <Pencil className="h-3 w-3" />
                {t("config.aiModelManual")}
              </>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={openDocs}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          {t("config.aiModelsDocs")}
        </button>
      </div>
    </div>
  );
}
