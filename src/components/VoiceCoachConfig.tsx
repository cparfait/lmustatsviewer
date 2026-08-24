/**
 * Configuration du coach VOCAL (partagée page Config + Config V2).
 *
 * Par défaut « = modèle d'analyse » : le coach vocal utilise le fournisseur, la
 * clé et le modèle de l'analyse. En désactivant l'interrupteur, on peut choisir :
 *  - un autre MODÈLE du même fournisseur (plus rapide) → réutilise la clé ;
 *  - un autre FOURNISSEUR → avec sa propre clé API (stockée séparément) et son
 *    propre modèle (utile pour un modèle gratuit type OpenRouter).
 * Les modèles du fournisseur vocal sont sondés indépendamment.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Cpu, Globe } from "lucide-react";
import { useAppStore } from "@/stores/app";
import { getProvider } from "@/lib/ai/providers";
import { fetchModels } from "@/lib/ai/models";
import type { ModelInfo } from "@/lib/ai/types";
import { Switch } from "@/components/ui/switch";
import { Tip } from "@/components/ui/tooltip";
import { AiModelPicker } from "@/components/AiModelPicker";

const SELECT_CLS =
  "h-8 max-w-[210px] rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer";

export function VoiceCoachConfig({
  listId = "voice-model-options",
}: {
  listId?: string;
}) {
  const { t } = useTranslation();
  const aiProvider = useAppStore((s) => s.aiProvider);
  const aiModel = useAppStore((s) => s.aiModel);
  const aiVoiceProvider = useAppStore((s) => s.aiVoiceProvider);
  const aiVoiceModel = useAppStore((s) => s.aiVoiceModel);
  const setAIVoiceProvider = useAppStore((s) => s.setAIVoiceProvider);
  const setAIVoiceModel = useAppStore((s) => s.setAIVoiceModel);
  const aiProviderList = useAppStore((s) => s.aiProviderList);
  const aiCustomProviders = useAppStore((s) => s.aiCustomProviders);

  // « = analyse » quand ni fournisseur ni modèle vocal spécifiques.
  const same = aiVoiceProvider === "" && aiVoiceModel === "";
  const voiceProviderId = aiVoiceProvider || aiProvider;
  const voiceProvider = getProvider(voiceProviderId);
  // La clé est PAR fournisseur (cartes de la section Fournisseurs) : plus de
  // clé vocale dédiée à saisir ici.
  const voiceKey = useAppStore((s) => s.aiProviderKeys[voiceProviderId] ?? "");

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const p = getProvider(voiceProviderId);
    if (!p) return;
    setLoading(true);
    try {
      setModels(await fetchModels(p, voiceKey));
    } finally {
      setLoading(false);
    }
  }, [voiceProviderId, voiceKey]);

  useEffect(() => {
    if (!same) void refresh();
  }, [same, refresh]);

  const toggleSame = (checked: boolean) => {
    if (checked) {
      void setAIVoiceProvider("");
      void setAIVoiceModel("");
    } else {
      // On révèle la config : par défaut même fournisseur, modèle = analyse.
      void setAIVoiceModel(aiModel);
    }
  };

  const onProviderChange = (id: string) => {
    if (id === aiProvider) {
      // Retour au fournisseur d'analyse → hérite de la clé, modèle = analyse.
      void setAIVoiceProvider("");
      void setAIVoiceModel(aiModel);
    } else {
      void setAIVoiceProvider(id);
      void setAIVoiceModel(""); // à choisir dans le nouveau fournisseur
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium">{t("config.aiVoiceModel")}</div>
            <div className="text-xs text-muted-foreground/70">
              {t("config.aiVoiceModelHint")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("config.aiVoiceModelSame")}
          </span>
          <Switch checked={same} onCheckedChange={toggleSame} />
        </div>
      </div>

      {!same && (
        <div className="ml-6 space-y-2.5 border-l border-primary/10 pl-3 pb-2">
          {/* Fournisseur vocal */}
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-sm">
              <Tip content={t("config.aiVoiceProviderTip")} side="right">
                <span className="cursor-help text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                </span>
              </Tip>
              {t("config.aiVoiceProvider")}
            </span>
            <select
              value={voiceProviderId}
              onChange={(e) => onProviderChange(e.target.value)}
              className={SELECT_CLS}
            >
              {/* Seuls les fournisseurs CONFIGURÉS (cartes) sont proposés — leur
                  clé est déjà saisie sur leur carte, rien à re-saisir ici. */}
              {aiProviderList.map((id) => (
                <option key={id} value={id}>
                  {getProvider(id)?.name ?? id}
                </option>
              ))}
              {aiCustomProviders.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || d.baseUrl}
                </option>
              ))}
            </select>
          </div>

          {/* Modèle vocal (sondé chez le fournisseur vocal) */}
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-sm">
              <Tip content={t("config.aiModelTip")} side="right">
                <span className="cursor-help text-muted-foreground">
                  <Cpu className="h-3.5 w-3.5" />
                </span>
              </Tip>
              {t("config.aiModel")}
            </span>
            <AiModelPicker
              provider={voiceProvider}
              models={models}
              loading={loading}
              value={aiVoiceModel}
              onChange={(v) => void setAIVoiceModel(v)}
              onRefresh={() => void refresh()}
              listId={listId}
            />
          </div>
        </div>
      )}
    </>
  );
}
