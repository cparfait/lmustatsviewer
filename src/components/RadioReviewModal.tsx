/**
 * Radio de la séance (idée ④) : les annonces de l'ingénieur de la dernière
 * séance, à noter après coup (utile / inutile / trop tard / faux), et le cumul
 * des notes par type d'annonce. Une famille surtout jugée inutile ou fausse est
 * signalée « plus rare » (malus appliqué par `radioFeedback.adjust`).
 */

import { useEffect, useReducer, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Radio, RotateCcw, ThumbsUp, ThumbsDown, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { penalized, radioLog, RATINGS, type Rating } from "@/lib/engineer/radioFeedback";

const ICON: Record<Rating, React.ComponentType<{ className?: string }>> = {
  useful: ThumbsUp,
  useless: ThumbsDown,
  late: Clock,
  wrong: XCircle,
};

const TONE: Record<Rating, string> = {
  useful: "text-emerald-400 border-emerald-500/60 bg-emerald-500/10",
  useless: "text-amber-400 border-amber-500/60 bg-amber-500/10",
  late: "text-sky-400 border-sky-500/60 bg-sky-500/10",
  wrong: "text-red-400 border-red-500/60 bg-red-500/10",
};

export function RadioReviewModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [, refresh] = useReducer((n: number) => n + 1, 0);

  useEffect(() => radioLog.subscribe(refresh), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const entries = radioLog.lastSession().slice().reverse();
  const stats = Object.entries(radioLog.stats).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-2">
              <Radio className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">{t("live.rrTitle")}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t("live.rrSubtitle")}</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("live.rrEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
                  <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">
                    {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span className="flex-1 min-w-[12rem] text-sm">{e.text}</span>
                  <span className="flex gap-1">
                    {RATINGS.map((r) => {
                      const Icon = ICON[r];
                      return (
                        <button
                          key={r}
                          type="button"
                          title={t(`live.rate_${r}`)}
                          aria-label={t(`live.rate_${r}`)}
                          aria-pressed={e.rating === r}
                          onClick={() => radioLog.rate(e.id, r)}
                          className={cn(
                            "rounded border px-2 py-1 transition-colors",
                            e.rating === r ? TONE[r] : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("live.rrStats")}</h3>
              {stats.length > 0 && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => radioLog.resetStats()}>
                  <RotateCcw className="h-3 w-3" />
                  {t("live.rrReset")}
                </Button>
              )}
            </div>
            {stats.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("live.rrStatsEmpty")}</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium py-1">{t("live.rrFamily")}</th>
                    {RATINGS.map((r) => (
                      <th key={r} className="text-right font-medium py-1">{t(`live.rate_${r}`)}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {stats.map(([fam, c]) => (
                    <tr key={fam} className="border-t border-border">
                      <td className="py-1 font-mono">{fam}</td>
                      {RATINGS.map((r) => (
                        <td key={r} className="py-1 text-right font-mono">{c[r]}</td>
                      ))}
                      <td className="py-1 pl-3 text-amber-400">{penalized(c) ? t("live.rrRarer") : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-xs text-muted-foreground">{t("live.rrHowVoice")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
