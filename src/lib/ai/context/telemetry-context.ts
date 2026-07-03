/**
 * Contexte de données pour le Coach IA sur une session de **télémétrie**
 * (fichier `.duckdb`). Source = `TelemetryMeta` (déjà chargé par la page).
 *
 * Étiquettes en anglais (compact). Mode dégradé assumé : sans tour complet, on
 * exploite les durées de tours + la liste des canaux enregistrés, et on signale
 * ce qui manque pour une analyse fine par virage.
 */

import { formatTime } from "../../utils";
import type { TelemetryMeta, TelemetryChannelData } from "../../api";

const MAX_LAPS = 30;

/** Canaux de réglages électroniques enregistrés (mêmes noms que la page Télémétrie). */
export const ELEC_CHANNELS = [
  "ABSLevel",
  "TCLevel",
  "TCCut",
  "TCSlipAngle",
  "FuelMixtureMap",
  "Brake Bias Rear",
];

const ELEC_LABEL: Record<string, string> = {
  ABSLevel: "ABS",
  TCLevel: "TC",
  TCCut: "TC Cut",
  TCSlipAngle: "TC Slip angle",
  FuelMixtureMap: "Engine map",
  "Brake Bias Rear": "Brake bias",
};

function fmtElec(name: string, v: number): string {
  // Brake Bias Rear = fraction (0.54 → 54.0% à l'arrière). Le reste = niveaux entiers.
  return name === "Brake Bias Rear" ? `${(v * 100).toFixed(1)}%` : String(Math.round(v));
}

/**
 * Résumé des réglages électroniques enregistrés : valeur courante (dernier
 * échantillon) + plage si elle a varié pendant la session. Sert au coach pour
 * proposer des ajustements ABS/TC/map/brake bias ancrés sur les données.
 */
export function buildElectronicsSummary(data: TelemetryChannelData): string {
  const lines: string[] = [];
  for (const name of ELEC_CHANNELS) {
    const series = data.channels.find((c) => c.name === name);
    if (!series) continue;
    const vals = (series.values[0] ?? []).filter((x) => Number.isFinite(x));
    if (vals.length === 0) continue;
    const last = vals[vals.length - 1];
    let min = vals[0];
    let max = vals[0];
    for (const x of vals) {
      if (x < min) min = x;
      if (x > max) max = x;
    }
    const label = ELEC_LABEL[name] ?? name;
    lines.push(
      min === max
        ? `${label}: ${fmtElec(name, last)}`
        : `${label}: ${fmtElec(name, last)} (varied ${fmtElec(name, min)}–${fmtElec(name, max)})`,
    );
  }
  return lines.join("\n");
}

export interface TelemetryContext {
  text: string;
  carClass: string;
  hasLaps: boolean;
}

export function buildTelemetryContext(
  meta: TelemetryMeta,
  electronicsText?: string,
  cornersText?: string,
  comparisonText?: string,
  metricsText?: string,
  theoreticalBestText?: string,
  /** Mémoire longitudinale du combo (via `buildComboHistoryText`), si disponible. */
  historyText?: string,
  /** Connaissance circuit couplée (freinages + vidéo, via `buildTrackKnowledgeText`). */
  trackKnowledgeText?: string,
): TelemetryContext {
  const info = meta.info;
  const car = info.car_model || info.car_name || "";
  const lines: string[] = [];

  lines.push("## Telemetry recording");
  lines.push(`Track: ${info.track} (${info.track_layout}) — ${info.session_type}`);
  if (car) lines.push(`Car: ${car} (${info.car_class})`);
  lines.push(
    `Driver: ${info.driver || "?"} · Weather: ${info.weather || "?"} · Recorded: ${info.recording_time || "?"}`,
  );
  lines.push(`Recording duration: ${meta.duration.toFixed(0)}s · Laps recorded: ${meta.laps.length}`);

  // Tours + meilleur
  const laps = meta.laps.filter((l) => l.duration > 0);
  if (laps.length > 0) {
    const best = laps.reduce((a, b) => (b.duration < a.duration ? b : a));
    lines.push("");
    lines.push("## Laps (duration)");
    for (const l of laps.slice(0, MAX_LAPS)) {
      const tag = l.lap === best.lap ? "  ← fastest" : "";
      lines.push(`L${l.lap}: ${formatTime(l.duration)}${tag}`);
    }
    if (laps.length > MAX_LAPS) lines.push(`… (${laps.length - MAX_LAPS} more)`);
    lines.push(`Fastest lap: ${formatTime(best.duration)} (L${best.lap})`);
  }

  // Métriques de pilotage par phase (freinage/entrée/milieu/sortie, hybride…).
  if (metricsText && metricsText.trim()) {
    lines.push("");
    lines.push(metricsText);
  }

  // Référence « meilleur théorique self » (best apex par virage sur tous les tours).
  if (theoreticalBestText && theoreticalBestText.trim()) {
    lines.push("");
    lines.push(theoreticalBestText);
  }

  // Comparaison par virage vs tour de référence (si l'utilisateur en a choisi un).
  if (comparisonText && comparisonText.trim()) {
    lines.push("");
    lines.push(comparisonText);
  }

  // Virages du tour le plus rapide (point de freinage + vitesse mini).
  if (cornersText && cornersText.trim()) {
    lines.push("");
    lines.push("## Corners (fastest lap — braking point + apex speed)");
    lines.push(cornersText);
  }

  // Connaissance circuit couplée (freinages ApexPoints + guide vidéo) — à
  // confronter aux points de freinage réels ci-dessus.
  if (trackKnowledgeText && trackKnowledgeText.trim()) {
    lines.push("");
    lines.push(trackKnowledgeText);
  }

  // Réglages électroniques enregistrés (ajustables) → le coach peut les commenter.
  if (electronicsText && electronicsText.trim()) {
    lines.push("");
    lines.push("## Electronics (recorded — adjustable: ABS / TC / engine map / brake bias)");
    lines.push(electronicsText);
  }

  // Mémoire longitudinale : historique du combo (PB, tendance secteurs).
  if (historyText && historyText.trim()) {
    lines.push("");
    lines.push(historyText);
  }

  // Canaux disponibles (le modèle sait sur quoi il PEUT raisonner)
  if (meta.channels.length > 0) {
    lines.push("");
    lines.push(`## Channels recorded (${meta.channels.length})`);
    lines.push(meta.channels.map((c) => c.name).join(", "));
  }

  lines.push("");
  lines.push("## Not available");
  if (!cornersText || !cornersText.trim()) {
    lines.push("- Per-corner braking/apex analysis: no full lap available in this recording.");
  }
  lines.push("- Car setup (.svm): not linked.");

  return { text: lines.join("\n"), carClass: info.car_class, hasLaps: laps.length > 0 };
}
