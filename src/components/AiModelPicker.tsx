/**
 * Sélecteur de modèle IA partagé (page Config + Config V2).
 *
 * **Liste d'abord, saisie en secours** (même logique que le sélecteur de modèle
 * de deepseek-harness) : les fournisseurs étant configurés avec leur clé, le
 * sondage `/models` renvoie la liste RÉELLE — on la présente en menu déroulant.
 * La saisie libre reste accessible (« Saisir manuellement… ») pour un modèle
 * tout juste sorti ou absent du sondage, et devient le mode unique quand aucun
 * modèle n'a pu être sondé (hors ligne, fournisseur muet).
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Loader2, ExternalLink, List, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Select } from "@/components/ui/select";
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
}: {
  provider: AIProvider | undefined;
  models: ModelInfo[];
  loading: boolean;
  value: string;
  onChange: (v: string) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  // Liste par défaut ; le passage en saisie est explicite et ne survit pas à un
  // changement de fournisseur (les ids d'un fournisseur n'ont aucun sens chez
  // un autre). `provider` a une référence stable (registre).
  const [manual, setManual] = useState(false);
  useEffect(() => {
    setManual(false);
  }, [provider]);

  const inList = models.some((m) => m.id === value);
  const showInput = manual || models.length === 0;

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

  const fieldCls =
    "h-8 w-[210px] rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {showInput ? (
          <Combobox
            value={value}
            onChange={onChange}
            options={models.map((m) => ({ value: m.id, label: m.label }))}
            placeholder={
              example
                ? t("config.aiModelPlaceholder", { id: example })
                : t("config.aiModelPlaceholderPlain")
            }
            ariaLabel={t("config.aiModelChoose")}
            className={fieldCls}
          />
        ) : (
          <Select
            value={value}
            onValueChange={(v) => {
              if (v === MANUAL) setManual(true);
              else onChange(v);
            }}
            ariaLabel={t("config.aiModelChoose")}
            className={fieldCls}
            // Rien de choisi (après changement de fournisseur) : le placeholder
            // tient lieu d'invite, sans option vide sélectionnable.
            placeholder={t("config.aiModelChoose")}
            options={[
              // Id saisi à la main absent du sondage : affiché, jamais écrasé.
              ...(value && !inList ? [{ value, label: value }] : []),
              ...models.map((m) => ({ value: m.id, label: m.label })),
              { value: MANUAL, label: t("config.aiModelManual") },
            ]}
          />
        )}
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

      {/* Mode saisie : note explicative + retour à la liste si elle existe. */}
      {showInput && (
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

      <div className="flex items-center gap-3">
        {manual && models.length > 0 && (
          <button
            type="button"
            onClick={() => setManual(false)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <List className="h-3 w-3" />
            {t("config.aiModelFromList")}
          </button>
        )}
        {/* En mode liste, le menu montre déjà les modèles : le lien vers la doc
            n'a d'intérêt qu'en saisie manuelle (trouver l'id exact d'un modèle
            trop récent pour être sondé). */}
        {showInput && provider?.docsUrl && (
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
    </div>
  );
}
