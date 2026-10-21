/**
 * Panneau des fournisseurs IA, façon deepseek-harness (Settings → Models) :
 * chaque fournisseur CONFIGURÉ est une carte nommée avec pastille d'état,
 * clé API propre (chiffrée côté Rust) et suppression. Deux boutons d'ajout :
 *  - « Ajouter un fournisseur » : catalogue des intégrés (OpenAI, Google…) et,
 *    en dernière option, « Fournisseur personnalisé » : nom + URL de base
 *    OpenAI-compatible (xAI, LM Studio, vLLM, passerelle…) ;
 *  - « Ajouter un fournisseur gratuit » : ouvre la section gratuite (bloc vert)
 *    avec son formulaire.
 *
 * Les fournisseurs à offre gratuite portent l'étiquette « Gratuit » ; à l'ajout,
 * leurs limites et l'usage fait des requêtes sont rappelés (`FreeTierNote`).
 * Ceux qui répondent sans clé gardent un champ de clé, facultatif.
 *
 * Deux sections : les fournisseurs « classiques » (clé payante, local, custom)
 * et une section dédiée aux **fournisseurs gratuits** (liste issue du projet
 * communautaire awesome-free-llm-apis, lien GitHub, mode d'emploi, réglage de
 * bascule — affiché seulement si un relais existe vraiment).
 *
 * La pastille sonde `GET /models` avec la clé de la carte : vert = répond,
 * rouge = échec (URL/clé), gris = sondage. Sondage au montage et quand la clé
 * change — pas de polling (page de config, pas un moniteur).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Eye, EyeOff, ExternalLink, Gift, ChevronDown } from "lucide-react";
import { useAppStore } from "@/stores/app";
import { PROVIDERS, getProvider } from "@/lib/ai/providers";
import type { AIProvider } from "@/lib/ai/types";
import { FREE_LIST_URL, isFreeListProvider } from "@/lib/ai/providers/free";
import { freeRelayPossible } from "@/lib/ai/freeFallback";
import { ai } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tip } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";

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

/** Libellé de l'offre : « Gratuit », ou « Modèles gratuits » pour une offre mixte. */
function freeLabelKey(p: AIProvider): string {
  return p.freeTier?.partial ? "config.aiFreePartialBadge" : "config.aiFreeBadge";
}

/** Étiquette des fournisseurs à offre gratuite permanente (verte si tout est gratuit). */
function FreeBadge({ provider }: { provider: AIProvider }) {
  const { t } = useTranslation();
  const cls = provider.freeTier?.partial
    ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${cls}`}>
      {t(freeLabelKey(provider))}
    </span>
  );
}

/** Précisions sur l'offre gratuite : limites, clé facultative, usage des requêtes. */
function FreeTierNote({ provider }: { provider: AIProvider }) {
  const { t } = useTranslation();
  const ft = provider.freeTier;
  if (!ft) return null;
  const lines = [
    t("config.aiFreeLimits", { limits: ft.limits }),
    ft.partial ? t("config.aiFreePartial") : null,
    ft.noKey ? t("config.aiFreeNoKey") : t("config.aiFreeKeyNeeded"),
    ft.keyBills ? t("config.aiFreeKeyBills") : null,
    ft.eu ? t("config.aiFreeEu") : null,
    ft.mayTrain ? t("config.aiFreeMayTrain") : null,
    ft.mayLog ? t("config.aiFreeMayLog") : null,
    ft.nonCommercial ? t("config.aiFreeNonCommercial") : null,
  ].filter((l): l is string => !!l);
  return (
    <div className="space-y-0.5 rounded-md bg-emerald-500/5 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <FreeBadge provider={provider} />
        <span>{lines[0]}</span>
      </div>
      {lines.slice(1).map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
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
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{provider.name}</span>
            {provider.freeTier && <FreeBadge provider={provider} />}
          </div>
          {def && (
            <div className="truncate text-[11px] text-muted-foreground">{def.baseUrl}</div>
          )}
          {provider.freeTier && (
            <div className="truncate text-[11px] text-muted-foreground">
              {provider.freeTier.limits}
              {provider.freeTier.noKey && !apiKey ? ` · ${t("config.aiFreeNoKeyShort")}` : ""}
            </div>
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

/** Ouvre un lien externe dans le navigateur du système. */
function openExternal(url: string) {
  void import("@tauri-apps/plugin-opener")
    .then(({ openUrl }) => openUrl(url))
    .catch(() => window.open(url, "_blank"));
}

/** Valeur du menu d'ajout qui ouvre la saisie d'un fournisseur personnalisé. */
const CUSTOM_CHOICE = "__custom__";

/**
 * Formulaire ajout/édition. `mode` : catalogue intégré ou custom (URL). En
 * ajout dans la section classique, le menu propose aussi « Fournisseur
 * personnalisé » (dernière option) : le choisir affiche les champs nom + URL.
 */
function ProviderForm({
  mode,
  editId,
  onClose,
  catalog = PROVIDERS,
  inFreeSection = false,
}: {
  mode: "builtin" | "custom";
  /** null = ajout ; sinon id de la carte en cours d'édition. */
  editId: string | null;
  onClose: () => void;
  /** Fournisseurs proposés à l'ajout (section classique ou gratuite). */
  catalog?: AIProvider[];
  /**
   * Formulaire de la section gratuite : « · Gratuit » serait redondant dans le
   * menu ; seul « · Modèles gratuits » (offre mixte) reste, car il distingue.
   */
  inFreeSection?: boolean;
}) {
  const { t } = useTranslation();
  const list = useAppStore((s) => s.aiProviderList);
  const customs = useAppStore((s) => s.aiCustomProviders);
  const editDef = customs.find((d) => d.id === editId);
  const available = catalog.filter((p) => !list.includes(p.id));

  // Le personnalisé n'est proposé qu'en ajout dans la section classique.
  const offerCustom = mode === "builtin" && !editId && !inFreeSection;
  const [builtinId, setBuiltinId] = useState(
    editId ?? available[0]?.id ?? (offerCustom ? CUSTOM_CHOICE : ""),
  );
  const [name, setName] = useState(editDef?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(editDef?.baseUrl ?? "");
  const [key, setKey] = useState(
    editId ? (useAppStore.getState().aiProviderKeys[editId] ?? "") : "",
  );
  const [showKey, setShowKey] = useState(false);

  /** Saisie d'un fournisseur personnalisé (édition d'un custom, ou choix du menu). */
  const isCustom = mode === "custom" || builtinId === CUSTOM_CHOICE;
  const provider = isCustom ? undefined : getProvider(builtinId);
  /** Clé facultative : personnalisé, ou offre gratuite utilisable sans compte. */
  const keyOptional = isCustom || !!provider?.freeTier?.noKey;
  const helpUrl = provider?.keyUrl ?? provider?.docsUrl ?? "";
  const canSave = isCustom ? !!baseUrl.trim() : !!builtinId;

  const save = useCallback(async () => {
    const st = useAppStore.getState();
    if (isCustom) {
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
  }, [isCustom, editId, builtinId, name, baseUrl, key, onClose]);

  return (
    <div className="space-y-2 rounded-md border border-input p-3">
      {mode === "builtin" && (
        <>
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("config.aiProvider")}
            {editId ? (
              <span className="text-sm font-medium">{getProvider(editId)?.name}</span>
            ) : (
              <Select
                value={builtinId}
                onValueChange={setBuiltinId}
                ariaLabel={t("config.aiProvider")}
                className="h-8 w-[240px] px-2.5"
                options={[
                  ...available.map((p) => ({
                    value: p.id,
                    label:
                      p.freeTier && (!inFreeSection || p.freeTier.partial)
                        ? `${p.name} · ${t(freeLabelKey(p))}`
                        : p.name,
                  })),
                  ...(offerCustom
                    ? [{ value: CUSTOM_CHOICE, label: t("config.aiCustomOption") }]
                    : []),
                ]}
              />
            )}
          </label>
          {provider?.freeTier && <FreeTierNote provider={provider} />}
        </>
      )}
      {isCustom && (
        <>
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("config.aiCustomName")}
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="xAI, LM Studio…"
              className="h-8 w-[240px] text-sm"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("config.aiCustomUrl")}
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.x.ai/v1"
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

      {/* Clé API — inutile pour Ollama (local, sans clé) ; facultative pour les
          offres gratuites sans compte (elle ne fait que relever les limites). */}
      {(keyOptional || provider?.needsKey || getProvider(editId ?? "")?.needsKey) && (
        <label className="flex items-center justify-between gap-3 text-sm">
          {t("config.aiApiKey")}
          <span className="relative flex items-center">
            <Input
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={keyOptional ? t("config.aiCustomKeyOptional") : "••••••••"}
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
        {!isCustom && helpUrl ? (
          <button
            type="button"
            onClick={() => openExternal(helpUrl)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            {t(provider?.keyUrl || provider?.needsKey ? "config.aiProviderKeyHelp" : "config.aiModelsDocs")}
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

/** Catalogue de la section classique : tout sauf la liste gratuite. */
const MAIN_CATALOG = PROVIDERS.filter((p) => !isFreeListProvider(p.id));
/** Catalogue de la section gratuite. */
const FREE_CATALOG = PROVIDERS.filter((p) => isFreeListProvider(p.id));

type FormState = { mode: "builtin" | "custom"; editId: string | null; section: "main" | "free" };

/** Cartes + formulaire d'édition en place pour une liste d'ids intégrés. */
function BuiltinCards({
  ids,
  form,
  setForm,
  section,
}: {
  ids: string[];
  form: FormState | null;
  setForm: (f: FormState | null) => void;
  section: "main" | "free";
}) {
  return (
    <>
      {ids.map((id) =>
        form?.editId === id ? (
          <ProviderForm key={id} mode="builtin" editId={id} onClose={() => setForm(null)} />
        ) : (
          <ProviderCard
            key={id}
            id={id}
            onEdit={() => setForm({ mode: "builtin", editId: id, section })}
          />
        ),
      )}
    </>
  );
}

/** Points du mode d'emploi de la section gratuite (clés i18n). */
const FREE_HOW_KEYS = [
  "config.aiFreeHowLabels",
  "config.aiFreeHowKeys",
  "config.aiFreeHowLimits",
  "config.aiFreeHowFallback",
  "config.aiFreeHowPrivacy",
];

/**
 * Section dédiée aux fournisseurs gratuits : présentation, lien vers le projet
 * GitHub d'où vient la liste, mode d'emploi repliable, cartes, formulaire
 * d'ajout et réglage de bascule. Affichée dès qu'un fournisseur gratuit est
 * configuré, ou à la demande (bouton « Ajouter un fournisseur gratuit » de la
 * section classique, qui ouvre directement le formulaire ici).
 */
function FreeProvidersSection({
  form,
  setForm,
  onCancelAdd,
}: {
  form: FormState | null;
  setForm: (f: FormState | null) => void;
  /** Ajout annulé : la section se referme si elle n'a aucune carte. */
  onCancelAdd: () => void;
}) {
  const { t } = useTranslation();
  const list = useAppStore((s) => s.aiProviderList);
  const keys = useAppStore((s) => s.aiProviderKeys);
  const freeFallback = useAppStore((s) => s.aiFreeFallback);
  const [howOpen, setHowOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const freeIds = list.filter(isFreeListProvider);
  const adding = form?.section === "free" && form.editId === null;
  // Réglage de bascule affiché seulement s'il peut agir (cf. `freeRelayPossible`) ;
  // sinon, une ligne explique quoi ajouter dès qu'un fournisseur gratuit est là.
  const configuredFree = list.filter((id) => getProvider(id)?.freeTier);
  const relayPossible = freeRelayPossible({ configured: list, keys });

  // Ouverte depuis le bouton du haut : on l'amène à l'écran.
  useEffect(() => {
    if (adding) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [adding]);

  return (
    <div
      ref={ref}
      className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Gift className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="text-sm font-medium">{t("config.aiFreeSectionTitle")}</div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-xs"
          onClick={() => openExternal(FREE_LIST_URL)}
        >
          <ExternalLink className="h-3 w-3" />
          {t("config.aiFreeSectionGithub")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground/80">{t("config.aiFreeSectionDesc")}</p>

      <button
        type="button"
        onClick={() => setHowOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        aria-expanded={howOpen}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${howOpen ? "" : "-rotate-90"}`} />
        {t("config.aiFreeHowTitle")}
      </button>
      {howOpen && (
        <ul className="list-disc space-y-1 pl-5 text-xs leading-snug text-muted-foreground">
          {FREE_HOW_KEYS.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      )}

      <BuiltinCards ids={freeIds} form={form} setForm={setForm} section="free" />

      {adding && (
        <ProviderForm
          mode="builtin"
          editId={null}
          catalog={FREE_CATALOG}
          inFreeSection
          onClose={onCancelAdd}
        />
      )}

      {relayPossible ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2">
          <div className="min-w-0">
            <div className="text-sm font-medium leading-tight">{t("config.aiFreeFallback")}</div>
            <div className="mt-0.5 text-xs text-muted-foreground/80">
              {t("config.aiFreeFallbackDesc")}
            </div>
          </div>
          <Switch
            checked={freeFallback}
            onCheckedChange={(v) => void useAppStore.getState().setAiFreeFallback(v)}
            className="shrink-0"
          />
        </div>
      ) : (
        configuredFree.length > 0 && (
          <p className="text-[11px] leading-snug text-muted-foreground/80">
            {t("config.aiFreeFallbackNone")}
          </p>
        )
      )}
    </div>
  );
}

export function AiProvidersPanel() {
  const { t } = useTranslation();
  const list = useAppStore((s) => s.aiProviderList);
  const customs = useAppStore((s) => s.aiCustomProviders);
  // null = fermé ; sinon { mode, editId, section } (editId null = ajout).
  const [form, setForm] = useState<FormState | null>(null);
  // Bloc vert ouvert à la demande (avant tout fournisseur gratuit configuré).
  const [freeOpen, setFreeOpen] = useState(false);

  const mainIds = list.filter((id) => !isFreeListProvider(id));
  const freeIds = list.filter(isFreeListProvider);
  const hasAvailableFree = FREE_CATALOG.some((p) => !list.includes(p.id));
  const addingMain = form?.section === "main" && form.editId === null;
  const showFree = freeIds.length > 0 || freeOpen;

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <div className="text-sm font-medium">{t("config.aiProvidersTitle")}</div>
        <p className="text-xs text-muted-foreground/70">{t("config.aiProvidersDesc")}</p>

        {list.length === 0 && customs.length === 0 && !form && (
          <p className="rounded-md border border-dashed border-input px-3 py-2 text-xs text-muted-foreground">
            {t("config.aiProvidersEmpty")}
          </p>
        )}

        <BuiltinCards ids={mainIds} form={form} setForm={setForm} section="main" />
        {customs.map((d) =>
          form?.editId === d.id ? (
            <ProviderForm key={d.id} mode="custom" editId={d.id} onClose={() => setForm(null)} />
          ) : (
            <ProviderCard
              key={d.id}
              id={d.id}
              onEdit={() => setForm({ mode: "custom", editId: d.id, section: "main" })}
            />
          ),
        )}

        {addingMain ? (
          <ProviderForm
            mode="builtin"
            editId={null}
            catalog={MAIN_CATALOG}
            onClose={() => setForm(null)}
          />
        ) : (
          <div className="flex gap-2">
            {/* Toujours proposé : le menu se termine par « Fournisseur personnalisé ». */}
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setForm({ mode: "builtin", editId: null, section: "main" })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("config.aiProviderAdd")}
            </Button>
            {hasAvailableFree && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                onClick={() => {
                  setFreeOpen(true);
                  setForm({ mode: "builtin", editId: null, section: "free" });
                }}
              >
                <Gift className="mr-1 h-3.5 w-3.5" />
                {t("config.aiFreeAdd")}
              </Button>
            )}
          </div>
        )}
      </div>

      {showFree && (
        <FreeProvidersSection
          form={form}
          setForm={setForm}
          onCancelAdd={() => {
            setForm(null);
            // Rien d'ajouté : le bloc se referme, comme avant le clic.
            if (freeIds.length === 0) setFreeOpen(false);
          }}
        />
      )}
    </div>
  );
}
