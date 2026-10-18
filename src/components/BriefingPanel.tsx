/**
 * Briefing adversaires de la communauté (affiché sous Live › Classement), désactivé par défaut
 * (Configuration › Communauté). Pour les pilotes de la séance qui partagent leurs tours
 * sous leur nom : meilleur tour sur ce circuit et cette classe, rang et palier face à
 * la référence de la base communautaire. Les noms partent dans le corps de la requête ;
 * le serveur ne renvoie jamais un pilote anonyme.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { community, config, isTauri, type CommunityBriefing, type LiveData } from "@/lib/api";
import { BRIEFING_KEY, matchCombo, tierOfPct, type ComboRef } from "@/lib/briefing";
import { TIER_COLORS, TIER_LABELS } from "@/lib/ohne_speed";
import { cn, formatTime } from "@/lib/utils";

export function BriefingPanel({ data }: { data: LiveData }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [combo, setCombo] = useState<ComboRef | null>(null);
  const [res, setRes] = useState<CommunityBriefing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadedFor = useRef("");

  useEffect(() => {
    if (!isTauri()) return;
    void config.get(BRIEFING_KEY).then((v) => setEnabled(v === "1")).catch(() => {});
  }, []);

  const me = data.standings.find((s) => s.is_player);
  const liveTrack = data.session?.track ?? "";
  const liveClass = me?.vehicle_class ?? "";
  const names = data.standings.filter((s) => !s.is_player && s.driver).map((s) => s.driver);
  const sessionKey = `${liveTrack}|${liveClass}|${data.session?.session ?? ""}|${names.length > 0}`;

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const list = await community.get<{ combos: ComboRef[] }>("combos");
      const c = matchCombo(list?.combos ?? [], liveTrack, liveClass);
      setCombo(c);
      if (!c) {
        setRes(null);
        return;
      }
      setRes(await community.briefing(c.track, c.track_course, c.car_class, names));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  // Chargement automatique une fois par séance (circuit, classe, type de séance).
  useEffect(() => {
    if (!enabled || !liveTrack || !liveClass || names.length === 0) return;
    if (loadedFor.current === sessionKey) return;
    loadedFor.current = sessionKey;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionKey]);

  if (!enabled) return null;

  return (
    <div className="rounded-lg border border-border bg-card/40">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-mini font-bold uppercase tracking-widest text-muted-foreground">
          <Users className="h-3 w-3" />
          {t("briefing.title")}
          {combo && (
            <span className="normal-case tracking-normal text-muted-foreground/70">
              · {combo.track_course} · {combo.car_class}
            </span>
          )}
        </span>
        <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" disabled={busy} onClick={() => void load()}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {t("briefing.refresh")}
        </Button>
      </div>
      <div className="p-3 text-sm">
        {error ? (
          <p className="text-destructive">{error}</p>
        ) : !combo && !busy ? (
          <p className="text-muted-foreground">{t("briefing.noCombo")}</p>
        ) : !res || res.found.length === 0 ? (
          <p className="text-muted-foreground">{busy ? "…" : t("briefing.nobody")}</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium">{t("briefing.driver")}</th>
                <th className="py-1 text-right font-medium">{t("briefing.best")}</th>
                <th className="py-1 text-right font-medium">{t("briefing.rank")}</th>
                <th className="py-1 text-right font-medium">{t("briefing.level")}</th>
              </tr>
            </thead>
            <tbody>
              {res.found.map((f) => {
                const tier = f.pct != null ? tierOfPct(f.pct) : null;
                return (
                  <tr key={f.driver.tag} className="border-t border-border/40">
                    <td className="py-1">{f.driver.name ?? f.query}</td>
                    <td className="py-1 text-right tabular-nums">{f.best != null ? formatTime(f.best) : "—"}</td>
                    <td className="py-1 text-right tabular-nums text-muted-foreground">
                      {f.rank != null ? `${f.rank} / ${res.drivers} · top ${f.top_pct} %` : "—"}
                    </td>
                    <td className="py-1 text-right">
                      {tier ? (
                        <span className={cn("rounded border px-1.5 py-0.5 text-[10px]", TIER_COLORS[tier])} title={`${f.pct?.toFixed(2)} %`}>
                          {TIER_LABELS[tier]}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("briefing.note", { shared: res?.found.length ?? 0, total: names.length })}
        </p>
      </div>
    </div>
  );
}
