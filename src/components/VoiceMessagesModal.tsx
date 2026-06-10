/**
 * VoiceMessagesModal — personnalisation des annonces vocales Live.
 *
 * Liste toutes les annonces par catégorie ; chaque ligne est éditable, testable
 * (bouton ▶, voix/vitesse de la config) et réinitialisable. L'édition porte sur
 * la **langue active** (décision 2026-06-02). Les `{{variables}}` obligatoires
 * sont signalées et un avertissement s'affiche si l'une est supprimée.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Play,
  RotateCcw,
  Flag,
  Fuel,
  CircleDot,
  ArrowUpDown,
  Swords,
  SplitSquareHorizontal,
  Timer,
  AlertTriangle,
  Cog,
  Wrench,
  Milestone,
  CloudRain,
  Trophy,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { previewVoice } from "@/lib/voice";
import {
  VOICE_MESSAGE_GROUPS,
  type VoiceMsgDef,
  type VoiceMsgGroup,
  getMessageText,
  defaultText,
  setMessageOverride,
  resetMessageOverride,
  resetAllOverrides,
  fillVars,
  missingVars,
} from "@/lib/voiceMessages";

const GROUP_ICON: Record<VoiceMsgGroup["id"], React.ComponentType<{ className?: string }>> = {
  flags: Flag,
  fuel: Fuel,
  tyres: CircleDot,
  positions: ArrowUpDown,
  rivals: Swords,
  sectors: SplitSquareHorizontal,
  laps: Timer,
  incidents: AlertTriangle,
  mech: Cog,
  pits: Wrench,
  race: Milestone,
  weather: CloudRain,
  fastest: Trophy,
};

const CAP = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function VoiceMessagesModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const overlayRef = useRef<HTMLDivElement>(null);

  // Brouillons locaux : suffixe → texte (initialisés depuis les overrides).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const g of VOICE_MESSAGE_GROUPS)
      for (const it of g.items) init[it.key] = getMessageText(lang, it.key);
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

  const commit = (key: string) => {
    void setMessageOverride(lang, key, drafts[key] ?? "");
  };

  const handleClose = () => {
    // Sécurité : on persiste tout brouillon non encore enregistré (sans blur).
    for (const g of VOICE_MESSAGE_GROUPS)
      for (const it of g.items) void setMessageOverride(lang, it.key, drafts[it.key] ?? "");
    onClose();
  };

  const handleReset = async (key: string) => {
    await resetMessageOverride(lang, key);
    setDrafts((d) => ({ ...d, [key]: defaultText(lang, key) }));
  };

  const handleResetAll = async () => {
    await resetAllOverrides(lang);
    const init: Record<string, string> = {};
    for (const g of VOICE_MESSAGE_GROUPS)
      for (const it of g.items) init[it.key] = defaultText(lang, it.key);
    setDrafts(init);
  };

  const handlePlay = (def: VoiceMsgDef) => {
    commit(def.key);
    let text = fillVars(drafts[def.key] ?? "", def.sample);
    if (def.appendTime) text = `${text} ${t("live.vLapTime", { min: 1, sec: "23.4" })}`;
    previewVoice(text, lang);
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
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">
                {t("live.vmTitle")}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t("live.vmSubtitle")}
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
              {t("live.vmResetAll")}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Corps ── */}
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {VOICE_MESSAGE_GROUPS.map((group) => {
            const Icon = GROUP_ICON[group.id];
            return (
              <div key={group.id}>
                <div className="flex items-center gap-2 mb-2 text-primary">
                  <Icon className="h-3.5 w-3.5" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide">
                    {t(`live.vmCat${CAP(group.id)}`)}
                  </h3>
                </div>
                <div className="space-y-2.5">
                  {group.items.map((def) => {
                    const value = drafts[def.key] ?? "";
                    const changed = value.trim() !== defaultText(lang, def.key);
                    const missing = missingVars(value, def);
                    return (
                      <div key={def.key} className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-muted-foreground">
                              {t(`live.vmWhen.${def.key}`)}
                            </span>
                            {def.vars.length > 0 && (
                              <span className="text-micro font-mono text-primary/70">
                                {def.vars.map((v) => `{{${v}}}`).join(" ")}
                              </span>
                            )}
                            {changed && (
                              <span className="text-micro text-amber-500">
                                ● {t("live.vmModified")}
                              </span>
                            )}
                          </div>
                          <Input
                            value={value}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [def.key]: e.target.value }))
                            }
                            onBlur={() => commit(def.key)}
                            className={cn(
                              "h-8 text-sm",
                              missing.length > 0 && "border-destructive focus-visible:ring-destructive",
                            )}
                          />
                          {missing.length > 0 && (
                            <div className="text-micro text-destructive mt-0.5">
                              {t("live.vmVarMissing", {
                                vars: missing.map((v) => `{{${v}}}`).join(", "),
                              })}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0 mt-[22px]"
                          title={t("live.vmTest")}
                          onClick={() => handlePlay(def)}
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 mt-[22px] text-muted-foreground"
                          title={t("live.vmReset")}
                          disabled={!changed}
                          onClick={() => handleReset(def.key)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
