/**
 * Panneau des fournisseurs IA, façon deepseek-harness (Settings → Models) :
 * chaque fournisseur CONFIGURÉ est une carte nommée avec pastille d'état,
 * clé API propre (chiffrée côté Rust) et suppression. Deux boutons d'ajout :
 *  - « Ajouter un fournisseur » : catalogue des intégrés (OpenAI, Google…) ;
 *  - « Ajouter un fournisseur personnalisé » : nom + URL de base
 *    OpenAI-compatible (Groq, xAI, LM Studio, vLLM, passerelle…).
 *
 * La pastille sonde `GET /models` avec la clé de la carte : vert = répond,
 * rouge = échec (URL/clé), gris = sondage. Sondage au montage et quand la clé
 * change — pas de polling (page de config, pas un moniteur).
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Eye, EyeOff, ExternalLink } from "lucide-react";
import { useAppStore } from "@/stores/app";
import { PROVIDERS, getProvider } from "@/lib/ai/providers";
import { ai } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tip } from "@/components/ui/tooltip";

type Probe = "probing" | "ok" | "fail";

function StatusDot({ state }: { state: Probe }) {
  const cls =
    state === "ok"
      ? "bg-emerald-500"
      : state === "fail"
        ? "bg-red-500"
        : "bg-muted-foreground/40 animate-pulse";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

/** Carte d'un fournisseur configuré (intégré ou custom). */
function ProviderCard({ id, onEdit }: { id: string; onEdit: () => void }) {
  const { t } = useTranslation();
  const apiKey = useAppStore((s) => s.aiProviderKeys[id] ?? "");
  const def = useAppStore((s) => s.aiCustomProviders.find((d) => d.id === id));
  const provider = getProvider(id);
  const [probe, setProbe] = useState<Probe>("probing");

  useEffect(() => {
    let alive = true;
    setProbe("probing");
    const p = getProvider(id);
    if (!p) {
      setProbe("fail");
      return;
    }
    ai.listModels(p.modelsUrl(apiKey), p.buildHeaders(apiKey))
      .then(() => alive && setProbe("ok"))
      .catch(() => alive && setProbe("fail"));
    return () => {
      alive = false;
    };
  }, [id, apiKey, def?.baseUrl]);

  if (!provider) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-input px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Tip
          content={t(
            probe === "ok"
              ? "config.aiProviderProbeOk"
              : probe === "fail"
                ? "config.aiProviderProbeFail"
                : "config.aiProviderProbing",
          )}
          side="top"
        >
          <span className="flex items-center">
            <StatusDot state={probe} />
          </span>
        </Tip>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{provider.name}</div>
          {def && (
            <div className="truncate text-[11px] text-muted-foreground">{def.baseUrl}</div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onEdit}
          aria-label={t("config.aiProviderEdit")}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-red-500 hover:text-red-600"
          onClick={() =>
            void (def
              ? useAppStore.getState().removeCustomProvider(id)
              : useAppStore.getState().removeProvider(id))
          }
          aria-label={t("config.aiProviderDelete")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Formulaire ajout/édition. `mode` : catalogue intégré ou custom (URL). */
function ProviderForm({
  mode,
  editId,
  onClose,
}: {
  mode: "builtin" | "custom";
  /** null = ajout ; sinon id de la carte en cours d'édition. */
  editId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const list = useAppStore((s) => s.aiProviderList);
  const customs = useAppStore((s) => s.aiCustomProviders);
  const editDef = customs.find((d) => d.id === editId);
  const available = PROVIDERS.filter((p) => !list.includes(p.id));

  const [builtinId, setBuiltinId] = useState(editId ?? available[0]?.id ?? "");
  const [name, setName] = useState(editDef?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(editDef?.baseUrl ?? "");
  const [key, setKey] = useState(
    editId ? (useAppStore.getState().aiProviderKeys[editId] ?? "") : "",
  );
  const [showKey, setShowKey] = useState(false);

  const provider = mode === "builtin" ? getProvider(builtinId) : undefined;
  const canSave = mode === "custom" ? !!baseUrl.trim() : !!builtinId;

  const openDocs = (url: string) =>
    void import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(url))
      .catch(() => window.open(url, "_blank"));

  const save = useCallback(async () => {
    const st = useAppStore.getState();
    if (mode === "custom") {
      const url = baseUrl.trim();
      if (!url) return;
      if (editId) {
        await st.updateCustomProvider(editId, name.trim() || url, url);
        await st.setProviderKey(editId, key);
      } else {
        const id = await st.addCustomProvider(name.trim() || url, url, key);
        // Sélection immédiate : on n'ajoute pas un fournisseur pour ne pas s'en servir.
        await st.setAIProvider(id);
      }
    } else {
      if (editId) {
        await st.setProviderKey(editId, key);
      } else {
        await st.addProvider(builtinId, key);
        await st.setAIProvider(builtinId);
      }
    }
    onClose();
  }, [mode, editId, builtinId, name, baseUrl, key, onClose]);

  return (
    <div className="space-y-2 rounded-md border border-input p-3">
      {mode === "builtin" ? (
        <label className="flex items-center justify-between gap-3 text-sm">
          {t("config.aiProvider")}
          {editId ? (
            <span className="text-sm font-medium">{getProvider(editId)?.name}</span>
          ) : (
            <select
              value={builtinId}
              onChange={(e) => setBuiltinId(e.target.value)}
              className="h-8 w-[240px] cursor-pointer rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </label>
      ) : (
        <>
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("config.aiCustomName")}
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Groq, LM Studio…"
              className="h-8 w-[240px] text-sm"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("config.aiCustomUrl")}
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.groq.com/openai/v1"
              spellCheck={false}
              autoComplete="off"
              className="h-8 w-[240px] text-sm"
            />
          </label>
          <p className="text-right text-[11px] leading-snug text-muted-foreground/70">
            {t("config.aiCustomUrlTip")}
          </p>
        </>
      )}

      {/* Clé API — inutile pour Ollama (local, sans clé). */}
      {(mode === "custom" || provider?.needsKey || getProvider(editId ?? "")?.needsKey) && (
        <label className="flex items-center justify-between gap-3 text-sm">
          {t("config.aiApiKey")}
          <span className="relative flex items-center">
            <Input
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={mode === "custom" ? t("config.aiCustomKeyOptional") : "••••••••"}
              className="h-8 w-[240px] pr-8 text-sm"
            />
            <button
              type="button"
              onMouseDown={() => setShowKey(true)}
              onMouseUp={() => setShowKey(false)}
              onMouseLeave={() => setShowKey(false)}
              aria-label={t("config.aiRevealKey")}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </span>
        </label>
      )}

      <div className="flex items-center justify-between gap-2">
        {mode === "builtin" && provider?.docsUrl ? (
          <button
            type="button"
            onClick={() => openDocs(provider.docsUrl)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            {t("config.aiProviderKeyHelp")}
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("config.cancel")}
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!canSave}>
            {t("config.aiCustomSave")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AiProvidersPanel() {
  const { t } = useTranslation();
  const list = useAppStore((s) => s.aiProviderList);
  const customs = useAppStore((s) => s.aiCustomProviders);
  // null = fermé ; sinon { mode, editId } (editId null = ajout).
  const [form, setForm] = useState<{ mode: "builtin" | "custom"; editId: string | null } | null>(
    null,
  );

  const hasAvailableBuiltin = PROVIDERS.some((p) => !list.includes(p.id));

  return (
    <div className="space-y-2 py-2">
      <div className="text-sm font-medium">{t("config.aiProvidersTitle")}</div>
      <p className="text-xs text-muted-foreground/70">{t("config.aiProvidersDesc")}</p>

      {list.length === 0 && customs.length === 0 && !form && (
        <p className="rounded-md border border-dashed border-input px-3 py-2 text-xs text-muted-foreground">
          {t("config.aiProvidersEmpty")}
        </p>
      )}

      {list.map((id) =>
        form?.editId === id ? (
          <ProviderForm key={id} mode="builtin" editId={id} onClose={() => setForm(null)} />
        ) : (
          <ProviderCard key={id} id={id} onEdit={() => setForm({ mode: "builtin", editId: id })} />
        ),
      )}
      {customs.map((d) =>
        form?.editId === d.id ? (
          <ProviderForm key={d.id} mode="custom" editId={d.id} onClose={() => setForm(null)} />
        ) : (
          <ProviderCard
            key={d.id}
            id={d.id}
            onEdit={() => setForm({ mode: "custom", editId: d.id })}
          />
        ),
      )}

      {form && form.editId === null ? (
        <ProviderForm mode={form.mode} editId={null} onClose={() => setForm(null)} />
      ) : (
        <div className="flex gap-2">
          {hasAvailableBuiltin && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setForm({ mode: "builtin", editId: null })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("config.aiProviderAdd")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setForm({ mode: "custom", editId: null })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("config.aiCustomAdd")}
          </Button>
        </div>
      )}
    </div>
  );
}
