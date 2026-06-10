/** Overlay Damage : dégâts carrosserie, impacts, usure pneus, crevaisons, moteur. */

import { AlertTriangle } from "lucide-react";
import { Panel, PanelHeader, HBar, Stat } from "@/components/overlay/ui";
import { wheelLabels } from "@/components/overlay/format";
import type { WidgetProps } from "./types";

/** Traduit une magnitude d'impact en niveau (null = aucun). */
function severity(
  mag: number,
  t1: number,
  t2: number,
): { key: string; color: string } | null {
  if (mag <= 0) return null;
  if (mag < t1) return { key: "impactLight", color: "#4ade80" };
  if (mag < t2) return { key: "impactMedium", color: "#f59e0b" };
  return { key: "impactHeavy", color: "#ef4444" };
}

export function DamageWidget({ data, content, accent, t }: WidgetProps) {
  const tel = data.telemetry;
  const wheelL = wheelLabels(t);
  const dmg = tel?.damage_total ?? 0; // 0 = intact
  const wheels = tel?.wheels;
  const avgWear = wheels
    ? wheels.reduce((s, w) => s + w.wear, 0) / wheels.length
    : 0;
  const overheating = tel?.overheating ?? false;

  // Les nombres bruts rF2 (impacts) ne sont pas parlants → on les traduit en niveau
  // Aucun / Léger / Moyen / Fort (seuils ajustables ; plus élevés pour le cumul).
  const impactMag = tel?.last_impact_magnitude ?? 0;
  const accumImpact = data.extended?.damage_accum_impact ?? 0;
  const impactSev = severity(impactMag, 2000, 20000);
  const totalSev = severity(accumImpact, 10000, 100000);

  return (
    <Panel accent={accent} style={{ width: 320 }}>
      <PanelHeader accent={accent} icon={AlertTriangle} title={t("overlays.items.damage.title")} />
      <div className="space-y-2.5 p-3">
        {content.bodywork !== false && (
          <div>
            <div className="mb-1 flex justify-between text-[10px] text-white/50">
              <span>{t("overlays.elements.bodywork")}</span>
              <span className="font-mono">{Math.round(dmg * 100)}%</span>
            </div>
            <HBar value={dmg} color={dmg > 0.3 ? "#ef4444" : "#f59e0b"} />
          </div>
        )}
        {content.tyreWear !== false && (
          <div>
            <div className="mb-1 flex justify-between text-[10px] text-white/50">
              <span>{t("overlays.elements.tyreWear")}</span>
              <span className="font-mono">{Math.round(avgWear)}%</span>
            </div>
            <HBar value={avgWear / 100} color="#22c55e" />
          </div>
        )}

        {/* Crevaisons / roues détachées : pastille rouge par roue concernée. */}
        {content.punctures !== false && wheels && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/50">
              {t("overlays.elements.punctures")}
            </span>
            <div className="flex gap-1.5">
              {wheels.map((w, i) => {
                const bad = w.flat || w.detached;
                return (
                  <span
                    key={i}
                    title={wheelL[i]}
                    className="grid h-5 w-9 place-items-center rounded text-[9px] font-bold"
                    style={{
                      background: bad ? "#ef4444" : "rgba(255,255,255,0.08)",
                      color: bad ? "#000" : "rgba(255,255,255,0.45)",
                    }}
                  >
                    {w.detached ? "✕" : wheelL[i]}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Moteur : surchauffe (signal le plus proche d'un souci moteur) + temps. */}
        {content.engine !== false && (
          <div className="flex items-center justify-between border-t border-white/10 pt-2">
            <Stat
              label={t("overlays.elements.engine")}
              value={
                overheating
                  ? t("overlays.damage.overheating")
                  : t("overlays.damage.ok")
              }
              color={overheating ? "#ef4444" : "#4ade80"}
            />
            <div className="flex gap-3 text-right">
              <Stat
                label={t("overlays.damage.water")}
                value={tel ? `${Math.round(tel.water_temp)}°` : "—"}
                color={tel && tel.water_temp > 110 ? "#f87171" : undefined}
              />
              <Stat
                label={t("overlays.damage.oil")}
                value={tel ? `${Math.round(tel.oil_temp)}°` : "—"}
                color={tel && tel.oil_temp > 130 ? "#f87171" : undefined}
              />
            </div>
          </div>
        )}

        {content.impact !== false && (
          <div className="space-y-1.5 border-t border-white/10 pt-2">
            {/* Dernier impact (sévérité) */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-white/45">
                {t("overlays.elements.impact")}
              </span>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="font-mono text-sm font-semibold"
                  style={{ color: impactSev?.color ?? "rgba(255,255,255,0.45)" }}
                >
                  {impactSev
                    ? t(`overlays.damage.${impactSev.key}`)
                    : t("overlays.damage.impactNone")}
                </span>
                {impactMag > 0 && (
                  <span className="font-mono text-[9px] text-white/30">
                    {Math.round(impactMag)}
                  </span>
                )}
              </div>
            </div>
            {/* Total cumulé des impacts de la course (niveau texte) */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-white/45">
                {t("overlays.elements.totalImpact")}
              </span>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="font-mono text-sm font-semibold"
                  style={{ color: totalSev?.color ?? "rgba(255,255,255,0.45)" }}
                >
                  {totalSev
                    ? t(`overlays.damage.${totalSev.key}`)
                    : t("overlays.damage.impactNone")}
                </span>
                {accumImpact > 0 && (
                  <span className="font-mono text-[9px] text-white/30">
                    {Math.round(accumImpact)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
