/**
 * Construit le « contexte de données » post-race injecté dans le prompt IA.
 *
 * Source = `get_session_detail` (SQLite, toujours disponible). Étiquettes en
 * anglais (compact, neutre vis-à-vis de la langue du coach). Le texte est borné
 * en taille (cap sur le nombre de tours) pour maîtriser les tokens.
 *
 * Mode dégradé assumé (Phase 1) : ni setup `.svm` lié, ni features télémétrie
 * haute fréquence (pas de tour complet dans les fichiers de test) → ces sections
 * sont signalées comme « non disponibles » plutôt qu'inventées.
 */

import { formatTime, formatSectorSeconds } from "../../utils";
import type { SessionDetail, LapRow, ResultRow } from "../../api";

const MAX_LAPS_IN_TABLE = 40;

export interface PostRaceContext {
  /** Texte compact à injecter après la question. */
  text: string;
  carClass: string;
  carModel: string;
  track: string;
  /** true si on a bien trouvé la ligne du joueur. */
  hasPlayer: boolean;
}

function num(v: number | null | undefined, digits = 0, unit = ""): string {
  if (v == null || !isFinite(v)) return "N/A";
  return `${v.toFixed(digits)}${unit}`;
}

/** Usure restante % à partir de la valeur brute tw (V1 : (1 - tw) * 100 = usure consommée). */
function wearUsedPct(tw: number | null | undefined): string {
  if (tw == null || !isFinite(tw)) return "—";
  return `${((1 - tw) * 100).toFixed(0)}%`;
}

function classBest(results: ResultRow[], carClass: string): { lap: number; driver: string } | null {
  let best: { lap: number; driver: string } | null = null;
  for (const r of results) {
    if (r.car_class !== carClass) continue;
    if (r.best_lap == null || r.best_lap <= 0) continue;
    if (!best || r.best_lap < best.lap) best = { lap: r.best_lap, driver: r.driver_name };
  }
  return best;
}

function lapLine(l: LapRow): string {
  const t = l.lap_time != null && l.lap_time > 0 ? formatTime(l.lap_time) : "—";
  const s1 = formatSectorSeconds(l.s1);
  const s2 = formatSectorSeconds(l.s2);
  const s3 = formatSectorSeconds(l.s3);
  const fuel = l.fuel != null ? `${l.fuel.toFixed(1)}L` : "—";
  const flags = [l.is_pit ? "PIT" : "", l.is_valid ? "" : "invalid"].filter(Boolean).join(" ");
  return `L${l.lap_num}: ${t} | S1 ${s1} S2 ${s2} S3 ${s3} | fuel ${fuel}${flags ? ` | ${flags}` : ""}`;
}

export function buildPostRaceContext(
  detail: SessionDetail,
  /** Résumé du setup `.svm` lié (via `buildSetupSummary`), si disponible. */
  setupSummary?: string,
  /** Référence « alien » ohne_speed (temps au tour communautaire), si disponible. */
  alienText?: string,
  /** Mémoire longitudinale (via `buildDriverHistoryText`), si disponible. */
  historyText?: string,
  /** Connaissance circuit couplée (freinages + vidéo, via `buildTrackKnowledgeText`). */
  trackKnowledgeText?: string,
): PostRaceContext {
  const s = detail.session;
  const player = detail.results.find((r) => r.is_player) ?? null;
  const carClass = player?.car_class ?? "";
  const carModel = player?.unique_car_name || player?.car_type || "";
  const lines: string[] = [];

  lines.push("## Session");
  lines.push(`Track: ${s.track} (${s.track_course}) — ${s.session_type}`);
  if (carModel) lines.push(`Car: ${carModel} (${carClass})`);
  lines.push(
    `Participants: ${s.participants} · Format: ${num(s.session_minutes)} min / ${s.session_laps} laps · Track length: ${num(s.track_length, 3)} km`,
  );
  lines.push(
    `Multipliers — damage x${num(s.damage_mult)}, fuel x${num(s.fuel_mult)}, tyre x${num(s.tire_mult)} (weather not stored in result files)`,
  );

  if (!player) {
    lines.push("");
    lines.push("## Player data");
    lines.push("Player row not found in this session — limited analysis possible.");
    return { text: lines.join("\n"), carClass, carModel, track: s.track, hasPlayer: false };
  }

  lines.push("");
  lines.push("## Your result");
  lines.push(
    `Start P${player.class_grid_pos || player.grid_pos} → Finish P${player.class_position} (class) / P${player.position} overall — ${player.finish_status}`,
  );
  if (player.progression != null) lines.push(`Progression: ${player.progression > 0 ? "+" : ""}${player.progression}`);
  lines.push(`Pit stops: ${player.pitstops} · Laps led: ${player.laps_led} · Valid laps: ${player.total_laps_valid}`);
  lines.push(
    `Best lap: ${formatTime(player.best_lap)} (S1 ${formatSectorSeconds(player.best_lap_s1)} · S2 ${formatSectorSeconds(player.best_lap_s2)} · S3 ${formatSectorSeconds(player.best_lap_s3)})`,
  );
  lines.push(
    `Theoretical optimal (best sectors S1 ${formatSectorSeconds(player.abs_best_s1)} + S2 ${formatSectorSeconds(player.abs_best_s2)} + S3 ${formatSectorSeconds(player.abs_best_s3)}): ${formatTime(player.optimal_lap)}`,
  );
  if (player.best_lap && player.optimal_lap && player.optimal_lap > 0) {
    lines.push(`Gap best→optimal: ${(player.best_lap - player.optimal_lap).toFixed(3)}s left on the table`);
  }
  lines.push(
    `Top speed: ${num(player.vmax, 1, " km/h")} · Median lap: ${formatTime(player.median_lap)} · Consistency (std dev): ${num(player.std_dev, 3, "s")} · Avg of best 5: ${formatTime(player.avg_best_5)}`,
  );
  if (player.start_fuel != null || player.finish_fuel != null) {
    lines.push(`Fuel: start ${num(player.start_fuel, 1, "L")} → finish ${num(player.finish_fuel, 1, "L")}`);
  }

  // Référence de classe
  const ref = classBest(detail.results, carClass);
  if (ref) {
    lines.push("");
    lines.push("## Class reference");
    lines.push(`Class best lap: ${formatTime(ref.lap)} by ${ref.driver}`);
    if (player.best_lap && player.best_lap > 0) {
      const gap = player.best_lap - ref.lap;
      lines.push(`Your gap to class best: ${gap > 0 ? "+" : ""}${gap.toFixed(3)}s`);
    }
  }

  // Tours du joueur (bornés)
  const myLaps = detail.laps.filter((l) => l.driver_name === player.driver_name);
  if (myLaps.length > 0) {
    lines.push("");
    lines.push("## Lap-by-lap (yours)");
    const shown = myLaps.slice(0, MAX_LAPS_IN_TABLE);
    for (const l of shown) lines.push(lapLine(l));
    if (myLaps.length > MAX_LAPS_IN_TABLE) {
      lines.push(`… (${myLaps.length - MAX_LAPS_IN_TABLE} more laps omitted)`);
    }
    // Usure pneus du dernier tour (si dispo)
    const last = myLaps[myLaps.length - 1];
    if (last && (last.twfl != null || last.twfr != null)) {
      lines.push(
        `Tyre wear used (last lap) FL/FR/RL/RR: ${wearUsedPct(last.twfl)}/${wearUsedPct(last.twfr)}/${wearUsedPct(last.twrl)}/${wearUsedPct(last.twrr)}`,
      );
    }
  }

  // Référence « alien » communautaire (ohne_speed) — base macro externe.
  if (alienText && alienText.trim()) {
    lines.push("");
    lines.push(alienText);
  }

  // Mémoire longitudinale : historique du combo (PB, tendance secteurs).
  if (historyText && historyText.trim()) {
    lines.push("");
    lines.push(historyText);
  }

  // Connaissance circuit couplée (freinages ApexPoints + guide vidéo) — référence macro.
  if (trackKnowledgeText && trackKnowledgeText.trim()) {
    lines.push("");
    lines.push(trackKnowledgeText);
  }

  // Setup réel lié (si disponible) → conseils de réglage ancrés.
  if (setupSummary && setupSummary.trim()) {
    lines.push("");
    lines.push(setupSummary);
  }

  // Données absentes (mode dégradé) — explicite pour éviter l'invention.
  lines.push("");
  lines.push("## Not available");
  if (!setupSummary || !setupSummary.trim()) {
    lines.push("- Car setup (.svm): not linked to this session (link one in the Garage for setup advice).");
  }
  lines.push("- High-frequency telemetry (per-corner braking/apex/inputs): not available.");

  return { text: lines.join("\n"), carClass, carModel, track: s.track, hasPlayer: true };
}
