/**
 * Banc d'écoute de la voix IA en ligne (Config → Audio / Voix → « Banc d'écoute ») :
 * les phrases de l'ingénieur par famille, avec **ce qui jouerait en course sans
 * réseau** (voix IA du cache, assemblée, Piper) et pourquoi, et des boutons pour
 * les entendre par chaque chemin. Aucune requête au fournisseur, sauf le bouton
 * « Préparer la voix » (devis affiché avant).
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Headphones, Play, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PrepareVoice } from "@/components/CloudVoicePrepare";
import { cn } from "@/lib/utils";
import { isTauri } from "@/lib/api";
import { cloudVoiceSnapshot, subscribeCloudVoice } from "@/lib/cloudVoice";
import {
  BENCH_NUMBER_PHRASES,
  benchFamilies,
  benchRoute,
  benchText,
  type BenchEngine,
  type BenchFacts,
  type BenchPhrase,
} from "@/lib/cloudVoiceBench";
import { getMessageText } from "@/lib/voiceMessages";
import { playBench, probeCloudPlayback, type VoicePriority } from "@/lib/voice";
import { toastError } from "@/stores/dialogs";

const ENGINE_STYLE: Record<BenchEngine, string> = {
  cloud: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  assembled: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  piper: "bg-muted text-muted-foreground",
};

/** Une phrase : verdict (sondé sans réseau) et boutons d'écoute. */
function BenchRow(props: {
  text: string;
  priority: VoicePriority;
  cloudOk?: boolean;
  lang: string;
  refresh: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { text, priority, cloudOk, lang, refresh } = props;
  const [facts, setFacts] = useState<BenchFacts | null>(null);

  useEffect(() => {
    let alive = true;
    // Petit délai : la phrase libre et les valeurs se tapent au clavier.
    const id = setTimeout(() => {
      if (!text.trim()) {
        setFacts(null);
        return;
      }
      probeCloudPlayback(text, lang, priority, cloudOk)
        .then((f) => alive && setFacts(f))
        .catch(() => alive && setFacts(null));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [text, lang, priority, cloudOk, refresh]);

  // « Alertes en voix locale » : Piper parle en course, mais la phrase est préparée
  // quand même. Même présentation que les autres (état de la voix IA), plus une note.
  const localInRace = !!facts?.cloudOn && facts.mode === "off";
  const route = facts ? benchRoute(localInRace ? { ...facts, mode: "cached" } : facts) : null;
  const play = (how: BenchEngine) => {
    void playBench(text, lang, how).then((ok) => {
      if (!ok) toastError(t(how === "piper" ? "config.cloudBenchNothingPiper" : "config.cloudBenchNothingCloud"));
    });
  };
  const missing = facts?.missing ?? [];
  const why = route
    ? t(`config.cloudBenchWhy_${route.reason}`, {
        n: route.reason === "assembled" ? (facts?.segments?.length ?? 0) : missing.length,
        list: missing.slice(0, 4).join(", ") + (missing.length > 4 ? "…" : ""),
      })
    : "";

  return (
    <div className="rounded-md border border-border/60 px-3 py-2 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-sm leading-snug break-words">{text || "—"}</div>
        <div className="flex items-center gap-1 shrink-0">
          {!facts?.segments && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              // Grisé tant que la phrase n'est pas dans le cache : rien à lire.
              disabled={!facts?.wholeCached || !facts.cloudOn}
              title={t(facts?.wholeCached ? "config.cloudBenchPlayCloudHint" : "config.cloudBenchPlayCloudMissing")}
              onClick={() => play("cloud")}
            >
              <Play className="h-3 w-3" />
              {t("config.cloudBenchPlayCloud")}
            </Button>
          )}
          {facts?.segments && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              disabled={!facts.cloudOn}
              title={t("config.cloudBenchPlayAssembledHint")}
              onClick={() => play("assembled")}
            >
              <Play className="h-3 w-3" />
              {t("config.cloudBenchPlayAssembled")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            disabled={!text.trim()}
            onClick={() => play("piper")}
          >
            <Play className="h-3 w-3" />
            Piper
          </Button>
        </div>
      </div>
      {props.children}
      {route && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cn("rounded px-1.5 py-0.5 font-medium", ENGINE_STYLE[route.engine])}>
            {t(`config.cloudBenchEngine_${route.engine}`)}
          </span>
          <span className="text-muted-foreground">{why}</span>
          {localInRace && <span className="text-muted-foreground/70">· {t("config.cloudBenchLocalInRace")}</span>}
        </div>
      )}
    </div>
  );
}

export function CloudVoiceBench({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const overlayRef = useRef<HTMLDivElement>(null);
  const { settings, prep } = useSyncExternalStore(subscribeCloudVoice, cloudVoiceSnapshot);
  const [families] = useState(benchFamilies);
  const [vars, setVars] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(BENCH_NUMBER_PHRASES.map((p) => [p.key, { ...p.vars }])),
  );
  const [free, setFree] = useState("");
  const [freePrio, setFreePrio] = useState<VoicePriority>("critical");
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Verdicts resondés quand un réglage change, après une préparation, ou sur demande.
  const refresh = `${JSON.stringify(settings)}|${prep?.running ?? ""}|${prep?.outcome ?? ""}|${stamp}`;
  const textOf = (p: BenchPhrase) => benchText(getMessageText(lang, p.key), vars[p.key] ?? p.vars);
  const example = benchText(getMessageText(lang, "vFuelLaps"), { n: "2" });

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-2">
              <Headphones className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">{t("config.cloudBenchTitle")}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t("config.cloudBenchSubtitle")}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setStamp((n) => n + 1)}>
              <RefreshCw className="h-3 w-3" />
              {t("config.cloudBenchRefresh")}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label={t("config.cloudBenchClose")}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {!isTauri() && <div className="text-xs text-amber-500">{t("config.cloudBenchDesktopOnly")}</div>}

          {/* En tête : sans préparation, l'urgent reste en Piper. */}
          <section className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="text-xs text-muted-foreground">{t("config.cloudBenchPrepNote")}</div>
            <PrepareVoice />
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
              {t("config.cloudBenchFamily_free")}
            </h3>
            <BenchRow text={free} priority={freePrio} lang={lang} refresh={refresh}>
              <div className="flex items-center gap-2">
                <Input
                  value={free}
                  onChange={(e) => setFree(e.target.value)}
                  placeholder={t("config.cloudBenchFreePlaceholder", { example })}
                  aria-label={t("config.cloudBenchFamily_free")}
                  className="h-8 text-sm"
                />
                <Select
                  value={freePrio}
                  onValueChange={(v) => setFreePrio(v as VoicePriority)}
                  ariaLabel={t("config.cloudBenchPriority")}
                  className="h-8 px-2.5"
                  options={(["critical", "normal", "spotter", "coach"] as const).map((p) => ({
                    value: p,
                    label: t(`config.cloudBenchPrio_${p}`),
                  }))}
                />
              </div>
            </BenchRow>
          </section>

          {families.map(({ family, phrases }) => (
            <section key={family} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
                {t(`config.cloudBenchFamily_${family}`)}
              </h3>
              {phrases.map((p) => (
                <BenchRow
                  key={p.key}
                  text={textOf(p)}
                  priority={p.priority}
                  cloudOk={p.cloudOk}
                  lang={lang}
                  refresh={refresh}
                >
                  {p.vars && (
                    <div className="flex flex-wrap items-center gap-2">
                      {Object.keys(p.vars).map((v) => (
                        <label key={v} className="flex items-center gap-1 text-xs text-muted-foreground">
                          {v}
                          <Input
                            value={vars[p.key]?.[v] ?? ""}
                            onChange={(e) =>
                              setVars((all) => ({ ...all, [p.key]: { ...all[p.key], [v]: e.target.value } }))
                            }
                            className="h-7 w-20 text-xs"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </BenchRow>
              ))}
            </section>
          ))}

        </div>
      </div>
    </div>
  );
}
