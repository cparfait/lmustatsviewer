/**
 * Config → Audio / Voix : **voix en ligne avec ta propre clé** (bêta, désactivée
 * par défaut). Piper reste le repli. Portée au choix : toute la radio dans une
 * seule voix (défaut) ou les infos seulement, alertes en voix locale
 * (cf. `lib/voiceRoute.ts`).
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import i18n from "@/i18n";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  CLOUD_VOICE_PROVIDERS,
  getCloudVoiceProvider,
  type CloudVoiceOption,
  type CloudVoiceProviderId,
} from "@/lib/cloudVoiceProviders";
import {
  cancelCloudPrep,
  clearCloudVoiceCache,
  cloudVoiceSnapshot,
  effectiveModel,
  effectiveVoice,
  listCloudVoices,
  planCloudPrep,
  runCloudPrep,
  setCloudVoiceFor,
  setCloudVoiceKey,
  subscribeCloudVoice,
  updateCloudVoice,
  type CloudPrepPlan,
} from "@/lib/cloudVoice";
import { CLOUD_PREP_KEYS, CLOUD_PREP_SAFETY_KEYS, estimateCostUsd } from "@/lib/cloudVoicePrep";
import type { CloudScope } from "@/lib/voiceRoute";
import { getMessageText } from "@/lib/voiceMessages";
import { isTauri } from "@/lib/api";
import { cloudPrepTexts, previewCloudVoice } from "@/lib/voice";
import { useAppStore } from "@/stores/app";
import { toastError, toastSuccess } from "@/stores/dialogs";

/** Champ texte enregistré à la sortie (ou sur Entrée). */
function CommitInput(props: {
  value: string;
  placeholder?: string;
  type?: string;
  onCommit: (v: string) => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  const commit = () => {
    if (draft.trim() !== props.value) props.onCommit(draft.trim());
  };
  return (
    <Input
      type={props.type ?? "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      autoComplete="off"
      spellCheck={false}
      className="h-8 w-56 text-sm shrink-0"
    />
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight">{label}</div>
        {desc && <div className="text-xs text-muted-foreground/80 mt-0.5">{desc}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

/**
 * Choix de la voix pour la langue de l'app : liste du fournisseur (recherche par
 * nom), ou identifiant saisi à la main. Mémorisé par langue.
 */
function VoicePicker() {
  const { t, i18n: i18nInst } = useTranslation();
  const snap = useSyncExternalStore(subscribeCloudVoice, cloudVoiceSnapshot);
  const { settings, hasKey } = snap;
  const lang = i18nInst.language.slice(0, 2).toLowerCase();
  const provider = getCloudVoiceProvider(settings.provider);
  const current = settings.voiceByLang[lang] ?? "";
  // Texte tapé dans le champ = **recherche** (vide au repos : le nom de la voix
  // utilisée s'affiche en indice). Seul un choix dans la liste, ou un identifiant
  // inconnu de la liste saisi en entier, change la voix.
  const [draft, setDraft] = useState("");
  const [voices, setVoices] = useState<CloudVoiceOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  /** Filtre par pays (locale « fr-FR », « fr-CA »…) ; vide = tous. */
  const [country, setCountry] = useState("");
  useEffect(() => setDraft(""), [current, lang, settings.provider]);

  // Liste rechargée au changement de fournisseur, de clé ou de langue (gratuit
  // chez tous les fournisseurs : aucune synthèse).
  useEffect(() => {
    if (!isTauri() || (!provider.staticVoices && !hasKey)) {
      setVoices(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    listCloudVoices(lang)
      .then((v) => alive && setVoices(v))
      .catch((e) => {
        if (!alive) return;
        setVoices(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [provider, hasKey, lang, reload]);

  const commit = (v: string) => {
    if (v.trim() !== current) void setCloudVoiceFor(lang, v);
  };
  // Sortie du champ / Entrée sans choix dans la liste : une recherche en cours
  // (qui trouve des voix) est abandonnée ; un texte sans espace qui ne trouve rien
  // est pris comme identifiant saisi à la main (voix absente de la liste).
  const finishTyping = () => {
    const q = draft.trim();
    setDraft("");
    if (!q) return;
    const ql = q.toLowerCase();
    const found = (voices ?? []).some((o) => o.id.toLowerCase().includes(ql) || o.label.toLowerCase().includes(ql));
    if (!found && !/\s/.test(q) && q.length >= 3) commit(q);
  };
  const active = effectiveVoice(lang);
  const activeName = voices?.find((v) => v.id === active)?.label ?? active;

  // Pays présents dans la liste ; à son chargement, le filtre se cale sur le pays
  // de la voix utilisée (le changer reste libre, « Tous les pays » compris).
  const locales = [...new Set((voices ?? []).map((v) => v.locale).filter((l): l is string => !!l))].sort();
  useEffect(() => {
    const own = voices?.find((v) => v.id === active)?.locale;
    setCountry(own && voices && voices.filter((v) => v.locale === own).length > 1 ? own : "");
    // Recalé seulement quand la liste change, pas à chaque choix de voix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voices]);
  const regionName = (loc: string) => {
    const region = loc.split("-")[1];
    try {
      const name = region ? new Intl.DisplayNames([i18nInst.language], { type: "region" }).of(region) : "";
      return name ? `${name} (${loc})` : loc;
    } catch {
      return loc;
    }
  };
  const shown = country ? (voices ?? []).filter((v) => v.locale === country) : (voices ?? []);

  let desc = provider.voiceExamples || t("config.cloudVoiceVoiceId");
  if (loading) desc = t("config.cloudVoiceVoicesLoading");
  else if (error) desc = t("config.cloudVoiceVoicesError", { error });
  else if (voices) desc = t("config.cloudVoiceVoicesCount", { n: shown.length });

  return (
    <div className="space-y-1.5">
      {/* Titre + actions, puis pays et recherche sur toute la largeur. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight">{`${t("config.cloudVoiceVoice")} · ${lang.toUpperCase()}`}</div>
          <div className="text-xs text-muted-foreground/80 mt-0.5">{desc}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {current && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => commit("")}>
              {t("config.cloudVoiceVoiceReset")}
            </Button>
          )}
          {provider.listVoices && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              disabled={loading || !hasKey}
              onClick={() => setReload((n) => n + 1)}
            >
              {t("config.cloudVoiceReload")}
            </Button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {locales.length > 1 && (
          <Select
            value={country}
            onValueChange={setCountry}
            ariaLabel={t("config.cloudVoiceCountry")}
            className="h-8 shrink-0 px-2.5"
            options={[
              { value: "", label: t("config.cloudVoiceAllCountries") },
              ...locales.map((l) => ({ value: l, label: regionName(l) })),
            ]}
          />
        )}
        <div
          className="relative min-w-0 flex-1"
          onBlur={finishTyping}
          onKeyDown={(e) => {
            if (e.key === "Enter") finishTyping();
          }}
        >
          <Combobox
            value={draft}
            onChange={(v) => {
              // Voix choisie dans la liste : retenue tout de suite, champ vidé.
              if (voices?.some((o) => o.id === v)) {
                setDraft("");
                commit(v);
              } else setDraft(v);
            }}
            options={shown.map((v) => ({ value: v.id, label: v.label }))}
            placeholder={voices?.length ? t("config.cloudVoiceSearch") : active || t("config.cloudVoiceVoiceRequired")}
            ariaLabel={t("config.cloudVoiceVoice")}
            className="h-8 w-full rounded-md border border-input bg-background pl-2.5 pr-7 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
      {active && (
        <div className="text-xs text-muted-foreground/80 text-right break-words">
          {t("config.cloudVoiceVoiceActive", { name: activeName })}
        </div>
      )}
    </div>
  );
}

/**
 * « Préparer la voix » : devis (phrases, caractères, coût) calculé localement,
 * puis génération des phrases fixes absentes du cache — seulement sur clic.
 */
function PrepareVoice() {
  const { t, i18n: i18nInst } = useTranslation();
  const snap = useSyncExternalStore(subscribeCloudVoice, cloudVoiceSnapshot);
  const { settings, hasKey, prep, lastError } = snap;
  const lang = i18nInst.language;
  const rate = useAppStore((s) => s.voiceRate);
  const running = prep?.running === true;
  const [plan, setPlan] = useState<CloudPrepPlan | null>(null);

  // Devis recalculé quand la voix (fournisseur, modèle, voix), la langue ou la
  // vitesse change, et après chaque préparation : un devis périmé n'est jamais affiché.
  useEffect(() => {
    if (!isTauri() || !hasKey || running) return;
    let alive = true;
    const keys = settings.scope === "all" ? [...CLOUD_PREP_KEYS, ...CLOUD_PREP_SAFETY_KEYS] : CLOUD_PREP_KEYS;
    const { code, rate: r, texts } = cloudPrepTexts(
      keys.map((k) => getMessageText(lang, k)),
      lang,
    );
    planCloudPrep(texts, code, r)
      .then((p) => alive && setPlan(p))
      .catch(() => alive && setPlan(null));
    return () => {
      alive = false;
      setPlan(null);
    };
  }, [settings, hasKey, lang, rate, running, prep?.outcome]);

  const start = async () => {
    if (!plan) return;
    const outcome = await runCloudPrep(plan);
    const st = cloudVoiceSnapshot().prep;
    const made = st ? st.done - st.failed : 0;
    if (outcome === "done" && st?.failed) toastError(t("config.cloudVoicePrepFailed", { n: st.failed }));
    else if (outcome === "done") toastSuccess(t("config.cloudVoicePrepDone", { n: made }));
    else if (outcome === "paused")
      toastError(t("config.cloudVoicePrepPaused", { error: cloudVoiceSnapshot().lastError || "—" }));
    else if (outcome === "changed") toastError(t("config.cloudVoicePrepChanged"));
    else toastSuccess(t("config.cloudVoicePrepCancelled", { n: made }));
  };

  const money = (usd: number) =>
    new Intl.NumberFormat(lang, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: usd < 0.1 ? 3 : 2,
    }).format(usd);

  let desc = t("config.cloudVoicePrepDesc");
  if (running && prep) desc = t("config.cloudVoicePrepProgress", { done: prep.done, total: prep.total });
  else if (plan && plan.missing.length === 0) desc = t("config.cloudVoicePrepReady", { total: plan.total });
  else if (plan)
    desc = t("config.cloudVoicePrepPlan", {
      n: plan.missing.length,
      total: plan.total,
      chars: plan.chars.toLocaleString(lang),
      cost: money(estimateCostUsd(settings.provider, effectiveModel(), plan.chars)),
    });

  return (
    <div className="space-y-1.5">
      <Row label={t("config.cloudVoicePrep")} desc={desc}>
        {running ? (
          <Button variant="outline" size="sm" className="h-8" onClick={cancelCloudPrep}>
            {t("config.cloudVoicePrepCancel")}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={!plan || plan.missing.length === 0 || !effectiveVoice()}
            title={t(settings.scope === "all" ? "config.cloudVoicePrepHintAll" : "config.cloudVoicePrepHint")}
            onClick={() => void start()}
          >
            {t("config.cloudVoicePrep")}
          </Button>
        )}
      </Row>
      {running && prep && prep.total > 0 && (
        <div
          className="h-1.5 w-full overflow-hidden rounded bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={prep.total}
          aria-valuenow={prep.done}
          aria-label={t("config.cloudVoicePrep")}
        >
          <div className="h-full bg-primary transition-all" style={{ width: `${(100 * prep.done) / prep.total}%` }} />
        </div>
      )}
      {running && lastError && <div className="text-xs text-amber-500 break-words">{lastError}</div>}
    </div>
  );
}

export function CloudVoiceSettings() {
  const { t } = useTranslation();
  const snap = useSyncExternalStore(subscribeCloudVoice, cloudVoiceSnapshot);
  const { settings, hasKey, usage, lastError } = snap;
  const provider = getCloudVoiceProvider(settings.provider);
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      const ms = await previewCloudVoice(t("config.voiceTestPhrase"), i18n.language);
      toastSuccess(t("config.cloudVoiceTestOk", { ms }));
    } catch (e) {
      toastError(t("config.cloudVoiceTestFail", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setTesting(false);
    }
  };

  const openKeyPage = () => {
    void import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(provider.keyUrl))
      .catch(() => {});
  };

  return (
    <div className="space-y-3 rounded-md border border-dashed border-input p-2.5">
      <Row label={t("config.cloudVoice")} desc={t("config.cloudVoiceDesc")}>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(v) => void updateCloudVoice({ enabled: v })}
          className="shrink-0"
        />
      </Row>
      {settings.enabled && (
        <>
          <Row label={t("config.cloudVoiceProvider")}>
            <Select
              value={settings.provider}
              onValueChange={(v) => void updateCloudVoice({ provider: v as CloudVoiceProviderId })}
              ariaLabel={t("config.cloudVoiceProvider")}
              className="h-8 px-2.5"
              options={CLOUD_VOICE_PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Row>
          <Row
            label={t("config.cloudVoiceKey")}
            desc={
              provider.id === "google"
                ? t("config.cloudVoiceGoogleHint")
                : hasKey
                  ? undefined
                  : t("config.cloudVoiceKeyMissing")
            }
          >
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={openKeyPage}>
              {t("config.cloudVoiceGetKey")}
            </Button>
            <CommitInput
              type="password"
              value={hasKey ? "••••••••" : ""}
              placeholder={t("config.cloudVoiceKeyPlaceholder")}
              ariaLabel={t("config.cloudVoiceKey")}
              onCommit={(v) => {
                if (v !== "••••••••") void setCloudVoiceKey(v);
              }}
            />
          </Row>
          {!provider.noModel && (
            <Row label={t("config.cloudVoiceModel")}>
              <CommitInput
                value={settings.model}
                placeholder={provider.defaultModel}
                ariaLabel={t("config.cloudVoiceModel")}
                onCommit={(v) => void updateCloudVoice({ model: v })}
              />
            </Row>
          )}
          <VoicePicker />
          <Row label={t("config.cloudVoiceScope")} desc={t("config.cloudVoiceScopeDesc")}>
            <Select
              value={settings.scope}
              onValueChange={(v) => void updateCloudVoice({ scope: v as CloudScope })}
              ariaLabel={t("config.cloudVoiceScope")}
              className="h-8 px-2.5"
              options={[
                { value: "all", label: t("config.cloudVoiceScopeAll") },
                { value: "info", label: t("config.cloudVoiceScopeInfo") },
              ]}
            />
          </Row>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground/80">
              {t("config.cloudVoiceUsage", {
                chars: usage.chars.toLocaleString(i18n.language),
                hits: usage.cacheHits,
                fallbacks: usage.fallbacks,
              })}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() =>
                  void clearCloudVoiceCache()
                    .then((n) => toastSuccess(t("config.cloudVoiceCacheCleared", { n })))
                    .catch(() => {})
                }
              >
                {t("config.cloudVoiceClearCache")}
              </Button>
              <Button variant="outline" size="sm" className="h-8" disabled={testing || !hasKey} onClick={test}>
                {t("config.voiceTest")}
              </Button>
            </div>
          </div>
          <PrepareVoice />
          {lastError && !snap.prep?.running && (
            <div className="text-xs text-amber-500 break-words">
              {t("config.cloudVoiceLastError", { error: lastError })}
            </div>
          )}
          <div className="text-xs text-muted-foreground/70">
            {t(settings.scope === "all" ? "config.cloudVoiceSafetyAll" : "config.cloudVoiceSafety")}
          </div>
        </>
      )}
    </div>
  );
}
