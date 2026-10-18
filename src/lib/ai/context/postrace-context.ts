/**
 * Construit le « contexte de données » post-race injecté dans le prompt IA.
 *
 * Source = `get_session_detail` (SQLite, toujours disponible). Étiquettes en
 * anglais (compact, neutre vis-à-vis de la langue du coach). Le texte est borné
 * en taille (cap sur le nombre de tours) pour maîtriser les tokens.
 *
 * Unités : le jeu écrit le carburant en FRACTION du réservoir (pas en litres) et
 * la longueur de piste en mètres — le texte les convertit explicitement, sinon le
 * modèle lit « 0.7L » par tour. Les statistiques de régularité ne portent que sur
 * les tours propres (`computeRegularity` : valides, hors stands, ≤ 107 % du meilleur).
 *
 * Sections facultatives (setup lié, télémétrie de la session, références de la
 * communauté) : absentes → signalées « non disponibles » plutôt qu'inventées.
 */

import { formatTime, formatSectorSeconds } from "../../utils";
import type { SessionDetail, LapRow, ResultRow, StreamEventRow } from "../../api";
import { computeRegularity } from "../../regularity";
import { describeLocation } from "../../trackLimitsLocate";
import { trackLimitLap, type EventLocator } from "../../eventLocator";

const MAX_LAPS_IN_TABLE = 40;
/** Événements de piste listés au plus (incidents les plus forts, limites de piste). */
const MAX_EVENTS = 12;
/** Au-delà, le jeu écrit INT_MAX : pas de limite de tours. */
const NO_LAP_LIMIT = 1_000_000;

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

/** Conso d'un tour (fraction) exploitable : ni ravitaillement (< 0) ni tour de sortie aberrant. */
function usableFuelUse(v: number | null): number | null {
  return v != null && v >= 0 && v <= 0.15 ? v : null;
}

/** « 0,Medium » → « Medium ». */
function compound(raw: string): string {
  return (raw || "").replace(/^\d+,/, "").trim();
}

function lapLine(l: LapRow): string {
  const t = l.lap_time != null && l.lap_time > 0 ? formatTime(l.lap_time) : "—";
  const s1 = formatSectorSeconds(l.s1);
  const s2 = formatSectorSeconds(l.s2);
  const s3 = formatSectorSeconds(l.s3);
  let fuel = l.fuel != null ? `${(l.fuel * 100).toFixed(1)}%` : "—";
  if (l.fuel_used != null && l.fuel_used < -0.001) fuel += " (refuelled)";
  else if (usableFuelUse(l.fuel_used) != null) fuel += ` (used ${(l.fuel_used! * 100).toFixed(1)}%)`;
  const flags = [l.is_pit ? "PIT" : "", l.is_valid ? "" : "invalid"].filter(Boolean).join(" ");
  return `L${l.lap_num}: ${t} | S1 ${s1} S2 ${s2} S3 ${s3} | fuel ${fuel}${flags ? ` | ${flags}` : ""}`;
}

/** « 10 min », « 12 laps », « 10 min or 12 laps » (INT_MAX = pas de limite de tours). */
function formatOf(minutes: number, laps: number): string {
  const hasLaps = laps > 0 && laps < NO_LAP_LIMIT;
  const hasMin = minutes > 0;
  if (hasMin && hasLaps) return `${num(minutes)} min or ${laps} laps`;
  if (hasMin) return `${num(minutes)} min (no lap limit)`;
  if (hasLaps) return `${laps} laps`;
  return "N/A";
}

/** « 1:05.3 » depuis un temps de session (s). */
function sessionClock(et: number): string {
  const m = Math.floor(et / 60);
  const s = et - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/**
 * Limites de piste, pénalités et contacts du joueur, depuis le flux d'événements du
 * fichier de résultats. TrackLimits : texte « ToursBouclés|PointsAvert.|PointsCourants|Pilote|Résolution »
 * (le 1er champ vaut 0 pendant le 1er tour). Contact : « Nom(id) reported contact (force) with Cible ».
 * `locate` situe l'événement dans le tour (virage estimé) ; sans lui, tour seul. Vide si rien.
 */
export function buildPlayerEventsText(stream: StreamEventRow[], player: string, locate?: EventLocator): string {
  if (!player) return "";
  const lines: string[] = [];
  let located = false;
  const where = (et: number, hint: number | null) => {
    const loc = locate ? locate(player, et, hint) : null;
    const txt = describeLocation(loc);
    if (txt) located = true;
    return { lap: loc?.lap ?? hint, txt };
  };

  const limits = stream
    .filter((e) => e.event_type === "TrackLimits")
    .map((e) => {
      const [lap, warn, cur, driver, ...rest] = e.text.split("|");
      return { et: e.et, lap: trackLimitLap(lap), warn, cur, driver: (driver ?? "").trim(), what: rest.join("|").trim() };
    })
    .filter((e) => e.driver === player);
  if (limits.length > 0) {
    lines.push(`Track-limit events: ${limits.length}`);
    for (const e of limits.slice(0, MAX_EVENTS)) {
      const pts = e.cur ? ` · points ${e.cur}${e.warn && e.warn !== "0" ? ` (warning at ${e.warn})` : ""}` : "";
      const w = where(e.et, e.lap);
      lines.push(`- L${w.lap ?? "?"} at ${sessionClock(e.et)}${w.txt ? ` — ${w.txt}` : ""}: ${e.what || "track limits"}${pts}`);
    }
    if (limits.length > MAX_EVENTS) lines.push(`… (${limits.length - MAX_EVENTS} more)`);
  }

  const penalties = stream.filter((e) => e.event_type === "Penalty" && e.text.includes(player));
  if (penalties.length > 0) {
    lines.push(`Penalties: ${penalties.length}`);
    for (const e of penalties.slice(0, MAX_EVENTS)) lines.push(`- ${sessionClock(e.et)}: ${e.text.trim()}`);
  }

  const contacts = stream
    .filter((e) => e.event_type === "Incident" && e.text.includes(`${player}(`))
    .map((e) => {
      const force = Number(e.text.match(/contact \(([\d.]+)\)/)?.[1] ?? NaN);
      const target = e.text.match(/ with (.+)$/)?.[1]?.replace(/\(\d+\)/g, "").trim() ?? "";
      const other = !e.text.startsWith(`${player}(`) ? e.text.match(/^(.+?)\(\d+\)/)?.[1]?.trim() : null;
      return { et: e.et, force, target: other ?? target };
    });
  if (contacts.length > 0) {
    const walls = contacts.filter((c) => /^immovable$/i.test(c.target)).length;
    lines.push(
      `Contacts: ${contacts.length} (${walls} with walls/barriers, ${contacts.length - walls} with cars or car parts)`,
    );
    const hardest = [...contacts]
      .filter((c) => isFinite(c.force))
      .sort((a, b) => b.force - a.force)
      .slice(0, 5)
      .sort((a, b) => a.et - b.et);
    for (const c of hardest) {
      const w = where(c.et, null);
      lines.push(
        `- ${w.lap ? `L${w.lap} ` : ""}${sessionClock(c.et)}${w.txt ? ` — ${w.txt}` : ""}: force ${c.force.toFixed(0)} with ${/^immovable$/i.test(c.target) ? "wall/barrier" : c.target}`,
      );
    }
  }

  if (lines.length === 0) return "";
  return [
    "## Track limits, penalties & contacts (yours, from the results file)",
    located
      ? "Times are session clock (m:ss). Location (sector, distance into the lap, nearest official corner) is ESTIMATED from lap/sector timing on the known track layout — about ±150 m; \"rough\" = proportional to the lap only. Use it to name the likely corner, not as certainty."
      : "Times are session clock (m:ss); the file does not give the corner and no track layout is known here.",
    ...lines,
  ].join("\n");
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
  /** Télémétrie de la session retrouvée (via `buildSessionTelemetryText`), si disponible. */
  telemetryText?: string,
  /** Références de la communauté sur le combo (via `buildCommunityReferenceText`). */
  communityText?: string,
  /** Situe les événements dans le tour (via `loadEventLocator`), si chargé. */
  locate?: EventLocator,
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
    `Participants: ${s.participants} · Format: ${formatOf(s.session_minutes, s.session_laps)} · Track length: ${s.track_length > 0 ? `${(s.track_length / 1000).toFixed(3)} km` : "N/A"}`,
  );
  lines.push(
    `Multipliers — damage x${num(s.damage_mult)}, fuel x${num(s.fuel_mult)}, tyre x${num(s.tire_mult)}` +
      (telemetryText ? "" : " (weather not stored in result files)"),
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
  lines.push(`Top speed: ${num(player.vmax, 1, " km/h")}`);

  const myLaps = detail.laps.filter((l) => l.driver_name === player.driver_name);
  // Régularité sur les tours propres seulement : le tour de départ, les tours aux
  // stands, invalides ou ralentis (> 107 %) fausseraient médiane et écart-type.
  const reg = computeRegularity(myLaps);
  if (reg) {
    lines.push(
      `Clean-lap pace (${reg.laps} valid laps within 107% of best; start, pit and invalid laps excluded): ` +
        `median ${formatTime(reg.median)} · std dev ${reg.stdDev.toFixed(3)}s · within 0.5s of best ${Math.round(reg.within["0.5"] * 100)}%` +
        (reg.unstableSector ? ` · most variable sector S${reg.unstableSector}` : ""),
    );
  } else {
    lines.push(
      `Clean-lap pace: only ${player.total_laps_valid} valid lap(s) — too few for consistency stats; do not judge consistency from this session.`,
    );
  }

  // Carburant : le jeu stocke des fractions du réservoir (start/finish déjà en %).
  if (player.start_fuel != null || player.finish_fuel != null) {
    const uses = myLaps.map((l) => usableFuelUse(l.fuel_used)).filter((v): v is number => v != null);
    const avg = uses.length > 0 ? uses.reduce((a, b) => a + b, 0) / uses.length : null;
    lines.push(
      `Fuel (% of tank — the game stores tank fractions, not litres): start ${num(player.start_fuel, 1, "%")} → finish ${num(player.finish_fuel, 1, "%")}` +
        (avg != null && avg > 0
          ? ` · avg use ${(avg * 100).toFixed(1)}% per lap over ${uses.length} laps (≈ ${Math.floor(1 / avg)} laps per full tank)`
          : ""),
    );
  }
  const compounds = [...new Set(myLaps.flatMap((l) => [compound(l.fcompound), compound(l.rcompound)]).filter(Boolean))];
  if (compounds.length > 0) lines.push(`Tyre compound(s) used: ${compounds.join(", ")}`);

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

  // Limites de piste, pénalités, contacts : explique les tours invalides.
  const events = buildPlayerEventsText(detail.stream ?? [], player.driver_name, locate);
  if (events) {
    lines.push("");
    lines.push(events);
  }

  // Télémétrie de la session (fichier .duckdb retrouvé) : virages, entrées, électronique.
  if (telemetryText && telemetryText.trim()) {
    lines.push("");
    lines.push(telemetryText);
  }

  // Références de la communauté (base partagée) : rang, palier au-dessus, secteurs.
  if (communityText && communityText.trim()) {
    lines.push("");
    lines.push(communityText);
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
  if (!telemetryText || !telemetryText.trim()) {
    lines.push(
      "- High-frequency telemetry (per-corner braking/apex/inputs): no recording found for this session (enable telemetry in the game to get it).",
    );
  }

  return { text: lines.join("\n"), carClass, carModel, track: s.track, hasPlayer: true };
}
