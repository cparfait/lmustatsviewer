/**
 * SpotterCommandsModal — liste / édition des commandes de reconnaissance vocale
 * (spotter Couche 2).
 *
 * Chaque commande (intention) affiche les **phrases reconnues** (une par ligne),
 * éditables, réinitialisables. L'édition porte sur la **langue active** (les
 * phrases d'une langue ne valent que pour la reco de cette langue). Les overrides
 * sont persistés via `spotterCommands.ts` (`spotter_commands` JSON).
 *
 * Pas de bouton « Tester » : la reconnaissance exige le micro + le moteur Vosk ;
 * le test se fait en jeu. La modale sert à adapter le vocabulaire si une commande
 * passe mal.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, RotateCcw, Mic, Square, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isTauri } from "@/lib/api";
import { startCapture, stopCapture, pcmToBase64 } from "@/lib/mic";
import {
  INTENTS,
  type Intent,
  getPhrases,
  defaultPhrases,
  setCommandOverride,
  resetCommandOverride,
  resetAllCommandOverrides,
  isCommandOverridden,
  buildGrammar,
  matchIntent,
} from "@/lib/spotterCommands";

const CAP = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const toText = (phrases: string[]) => phrases.join("\n");
const toList = (text: string) =>
  text
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);

export function SpotterCommandsModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const overlayRef = useRef<HTMLDivElement>(null);

  // Brouillons locaux : intention → texte (une phrase par ligne).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const intent of INTENTS) init[intent] = toText(getPhrases(lang, intent));
    setDrafts(init);
  }, [lang]);

  // Échap pour fermer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const commit = (intent: Intent) => {
    void setCommandOverride(lang, intent, toList(drafts[intent] ?? ""));
  };

  // ── Test de reconnaissance (micro → Vosk → intention) ──
  type TestState = "idle" | "listening" | "working";
  const [testState, setTestState] = useState<TestState>("idle");
  // null = pas encore testé ; sinon résultat (texte entendu + intention ou erreur).
  // error: "web" = hors desktop ; "unavailable" = feature/assets absents ; "runtime" = échec reco.
  const [testResult, setTestResult] = useState<
    | { text: string; intent: Intent | null }
    | { error: "web" | "unavailable" | "runtime" }
    | null
  >(null);

  // Persiste tous les brouillons (pour que la grammaire testée reflète les éditions).
  const commitAll = async () => {
    for (const intent of INTENTS)
      await setCommandOverride(lang, intent, toList(drafts[intent] ?? ""));
  };

  const startTest = async () => {
    if (!isTauri()) {
      setTestResult({ error: "web" }); // reco dispo uniquement en app desktop
      return;
    }
    await commitAll();
    setTestResult(null);
    try {
      await startCapture();
      setTestState("listening");
    } catch (e) {
      console.error("[spotter] mic capture failed", e);
      setTestState("idle");
      setTestResult({ error: "runtime" });
    }
  };

  const stopTest = async () => {
    setTestState("working");
    const pcm = stopCapture();
    if (pcm.length === 0) {
      setTestState("idle");
      setTestResult({ text: "", intent: null });
      return;
    }
    try {
      const text = await invoke<string>("stt_recognize", {
        pcmBase64: pcmToBase64(pcm),
        lang,
        grammar: buildGrammar(lang),
      });
      setTestResult({ text, intent: matchIntent(text, lang) });
    } catch (e) {
      // Distingue « modèle absent » d'une vraie erreur reco : si stt_available
      // échoue ou renvoie false → modèle de la langue non téléchargé (Config).
      console.error("[spotter] stt_recognize failed", e);
      let available = false;
      try {
        available = await invoke<boolean>("stt_available", { lang });
      } catch {
        available = false;
      }
      setTestResult({ error: available ? "runtime" : "unavailable" });
    }
    setTestState("idle");
  };

  const toggleTest = () => {
    if (testState === "listening") void stopTest();
    else if (testState === "idle") void startTest();
  };

  // Libère le micro si la modale se ferme pendant l'écoute.
  useEffect(() => {
    return () => {
      if (testState === "listening") stopCapture();
    };
  }, [testState]);

  const handleClose = () => {
    // Sécurité : persiste tout brouillon non encore enregistré (sans blur).
    for (const intent of INTENTS)
      void setCommandOverride(lang, intent, toList(drafts[intent] ?? ""));
    onClose();
  };

  const handleReset = async (intent: Intent) => {
    await resetCommandOverride(lang, intent);
    setDrafts((d) => ({ ...d, [intent]: toText(defaultPhrases(lang, intent)) }));
  };

  const handleResetAll = async () => {
    await resetAllCommandOverrides(lang);
    const init: Record<string, string> = {};
    for (const intent of INTENTS) init[intent] = toText(defaultPhrases(lang, intent));
    setDrafts(init);
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) handleClose();
      }}
    >
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-2">
              <Mic className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">
                {t("config.spotterCmdTitle")}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t("config.spotterCmdSubtitle")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleResetAll}
            >
              <RotateCcw className="h-3 w-3" />
              {t("config.spotterCmdResetAll")}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Corps ── */}
        <div className="overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-xs text-muted-foreground/80">
            {t("config.spotterCmdHint")}
          </p>

          {/* ── Test de reconnaissance ── */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <Button
              variant={testState === "listening" ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1.5 shrink-0"
              disabled={testState === "working"}
              onClick={toggleTest}
            >
              {testState === "listening" ? (
                <Square className="h-3.5 w-3.5" />
              ) : testState === "working" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
              {testState === "listening"
                ? t("config.spotterCmdTestListening")
                : t("config.spotterCmdTest")}
            </Button>
            <div className="min-w-0 text-xs">
              {testResult === null ? (
                <span className="text-muted-foreground/70">
                  {t("config.spotterCmdTestIdle")}
                </span>
              ) : "error" in testResult ? (
                <span className="text-amber-500">
                  {testResult.error === "web"
                    ? t("config.spotterCmdTestWeb")
                    : testResult.error === "runtime"
                      ? t("config.spotterCmdTestRuntime")
                      : t("config.spotterCmdTestUnavailable")}
                </span>
              ) : testResult.text === "" ? (
                <span className="text-muted-foreground">
                  {t("config.spotterCmdTestNothing")}
                </span>
              ) : (
                <span>
                  <span className="text-muted-foreground">
                    {t("config.spotterCmdTestHeard", { text: testResult.text })}
                  </span>{" "}
                  {testResult.intent ? (
                    <span className="text-success font-medium">
                      → {t(`config.spotterCmd${CAP(testResult.intent)}`)}
                    </span>
                  ) : (
                    <span className="text-amber-500">
                      {t("config.spotterCmdTestNoMatch")}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          {INTENTS.map((intent) => {
            const value = drafts[intent] ?? "";
            const changed = isCommandOverridden(lang, intent);
            return (
              <div key={intent} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">
                      {t(`config.spotterCmd${CAP(intent)}`)}
                    </span>
                    {changed && (
                      <span className="text-micro text-amber-500">
                        ● {t("config.spotterCmdModified")}
                      </span>
                    )}
                  </div>
                  <textarea
                    value={value}
                    rows={Math.max(2, value.split("\n").length)}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [intent]: e.target.value }))
                    }
                    onBlur={() => commit(intent)}
                    className={cn(
                      "w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm",
                      "resize-y leading-snug shadow-sm",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    )}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 mt-[22px] text-muted-foreground"
                  title={t("config.spotterCmdReset")}
                  disabled={!changed}
                  onClick={() => handleReset(intent)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
