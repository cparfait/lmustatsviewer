/**
 * Télémétrie d'une session de résultats, pour le Coach IA post-course.
 *
 * Le jeu enregistre la télémétrie (option du jeu) dans des fichiers `.duckdb` séparés
 * des résultats XML. On retrouve celui de la session (circuit, type de session, heure
 * d'enregistrement, voiture, meilleur tour) puis on en tire les mêmes textes que le
 * coach de la page Télémétrie : virages du tour le plus rapide, métriques par phase,
 * meilleur théorique « self », électronique, météo.
 *
 * Les chargeurs `load*Text` sont partagés avec `AICoachPanel` (page Télémétrie).
 */

import { telemetry } from "../../api";
import type { SessionDetail, TelemetryFileInfo, TelemetryMeta } from "../../api";
import { formatTime } from "../../utils";
import { buildElectronicsSummary, ELEC_CHANNELS } from "./telemetry-context";
import { detectCorners, summarizeCorners, type Corner } from "../../telemetry/corners";
import { computeLapMetrics, summarizeLapMetrics } from "../../telemetry/lapMetrics";
import { compareToBestApex, summarizeTheoreticalBest } from "../../telemetry/theoreticalBest";

/** Fenêtre de recherche autour du `timestamp` de la session (début de l'événement). */
const BEFORE_S = 10 * 60;
const AFTER_S = 8 * 3600;

/** Type de session du jeu → lettre du nom de fichier télémétrie (`…_R_2026-06-08T19_22_02Z`). */
export function sessionLetter(sessionType: string): string | null {
  const t = sessionType.toLowerCase();
  if (t.startsWith("race")) return "R";
  if (t.startsWith("qual")) return "Q";
  if (t.startsWith("prac")) return "P";
  if (t.startsWith("warm")) return "W";
  return null;
}

/** Lettre de session + début d'enregistrement (epoch s, UTC) lus dans le nom du fichier. */
export function parseTelemetryFilename(filename: string): { letter: string; start: number } | null {
  const m = filename.match(/_([PQRW])_(\d{4})-(\d{2})-(\d{2})T(\d{2})_(\d{2})_(\d{2})Z\.duckdb$/i);
  if (!m) return null;
  const [, letter, y, mo, d, h, mi, s] = m;
  return { letter: letter.toUpperCase(), start: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) / 1000 };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function sameTrack(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

/**
 * Enregistrement de la session parmi les fichiers télémétrie, ou `null`. Critères :
 * même circuit, même type de session, début dans la fenêtre de la session, même
 * voiture quand le modèle est connu. Plusieurs candidats (redémarrages) : celui dont
 * le meilleur tour est le plus proche de celui des résultats, puis le plus gros.
 */
export function pickSessionTelemetry(
  files: TelemetryFileInfo[],
  s: { track: string; session_type: string; timestamp: number; car: string; best_lap: number | null },
): TelemetryFileInfo | null {
  const letter = sessionLetter(s.session_type);
  if (!letter || !s.timestamp) return null;
  const candidates = files.filter((f) => {
    const p = parseTelemetryFilename(f.filename);
    if (!p || p.letter !== letter) return false;
    if (p.start < s.timestamp - BEFORE_S || p.start > s.timestamp + AFTER_S) return false;
    if (!sameTrack(f.track, s.track)) return false;
    if (f.car_model && s.car && f.car_model !== s.car) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  const gap = (f: TelemetryFileInfo) =>
    f.best_lap != null && s.best_lap ? Math.abs(f.best_lap - s.best_lap) : Infinity;
  return [...candidates].sort((a, b) => gap(a) - gap(b) || b.size_bytes - a.size_bytes)[0];
}

const fastestLap = (meta: TelemetryMeta) => {
  const laps = meta.laps.filter((l) => l.duration > 0);
  return laps.length ? laps.reduce((a, b) => (b.duration < a.duration ? b : a)) : null;
};

/** Électronique enregistrée (ABS / TC / map / répartition) ; "" si absente. */
export async function loadElectronicsText(meta: TelemetryMeta): Promise<string> {
  const names = ELEC_CHANNELS.filter((n) => meta.channels.some((c) => c.name === n));
  if (names.length === 0) return "";
  const d = await telemetry.getChannels(meta.info.path, names, null, 3000);
  return buildElectronicsSummary(d);
}

/** Virages + métriques par phase du tour le plus rapide (≈ pleine résolution). */
export async function loadFastestLapTexts(meta: TelemetryMeta): Promise<{ corners: string; metrics: string }> {
  const fastest = fastestLap(meta);
  if (!fastest) return { corners: "", metrics: "" };
  const channels = [
    "Ground Speed",
    "Brake Pos",
    "Throttle Pos",
    "Steering Pos",
    "Wheel Speed",
    "SoC",
    "Regen Rate",
    "Virtual Energy",
    "ABS",
    "TC",
  ].filter((c) => meta.channels.some((m) => m.name === c));
  const d = await telemetry.getChannels(meta.info.path, channels, fastest.lap, 20000);
  const get = (n: string) => d.channels.find((c) => c.name === n)?.values[0] ?? [];
  const speed = get("Ground Speed");
  const brake = get("Brake Pos");
  const corners = detectCorners(speed, brake, d.dist);
  const metrics = summarizeLapMetrics(
    computeLapMetrics(
      corners,
      {
        time: d.time,
        dist: d.dist,
        speed,
        brake,
        throttle: get("Throttle Pos"),
        steering: get("Steering Pos"),
        wheelSpeed: get("Wheel Speed"),
        soc: get("SoC"),
        regen: get("Regen Rate"),
        virtualEnergy: get("Virtual Energy"),
        abs: get("ABS"),
        tc: get("TC"),
      },
      { carClass: meta.info.car_class },
    ),
  );
  return { corners: summarizeCorners(corners), metrics };
}

/** Meilleure vitesse d'apex par virage sur les tours propres (meilleur théorique « self »). */
export async function loadTheoreticalBestText(meta: TelemetryMeta): Promise<string> {
  const laps = meta.laps.filter((l) => l.duration > 0);
  if (laps.length < 2 || !meta.channels.some((c) => c.name === "Ground Speed")) return "";
  const fastest = laps.reduce((a, b) => (b.duration < a.duration ? b : a));
  const clean = laps.filter((l) => l.duration <= fastest.duration * 1.08).slice(0, 10);
  const results = await Promise.all(
    clean.map((l) =>
      telemetry
        .getChannels(meta.info.path, ["Ground Speed", "Brake Pos"], l.lap, 4000)
        .then((d) => {
          const sp = d.channels.find((c) => c.name === "Ground Speed")?.values[0] ?? [];
          const br = d.channels.find((c) => c.name === "Brake Pos")?.values[0] ?? [];
          return { lap: l.lap, corners: detectCorners(sp, br, d.dist) };
        })
        .catch(() => null),
    ),
  );
  const valid = results.filter((r): r is { lap: number; corners: Corner[] } => r != null);
  const fast = valid.find((r) => r.lap === fastest.lap);
  if (!fast || fast.corners.length === 0) return "";
  return summarizeTheoreticalBest(compareToBestApex(fast.corners, valid.map((v) => v.corners)));
}

/** Enregistrement télémétrie de la session (voiture du joueur), ou null. */
export async function findSessionTelemetryFile(detail: SessionDetail): Promise<TelemetryFileInfo | null> {
  const player = detail.results.find((r) => r.is_player);
  if (!player) return null;
  const files = await telemetry.listFiles();
  return pickSessionTelemetry(files, {
    track: detail.session.track,
    session_type: detail.session.session_type,
    timestamp: detail.session.timestamp,
    car: player.unique_car_name || player.car_type,
    best_lap: player.best_lap,
  });
}

/** Profil temps → distance du tour le plus rapide enregistré (situer un événement dans le tour). */
export async function loadSessionLapProfile(detail: SessionDetail): Promise<{ time: number[]; dist: number[] } | null> {
  const file = await findSessionTelemetryFile(detail);
  if (!file) return null;
  const meta = await telemetry.getMeta(file.path);
  const fastest = fastestLap(meta);
  if (!fastest) return null;
  const d = await telemetry.getChannels(meta.info.path, ["Ground Speed"], fastest.lap, 4000);
  return d.time.length > 0 ? { time: d.time, dist: d.dist } : null;
}

/**
 * Section « télémétrie de la session » du contexte post-course ; "" si aucun
 * enregistrement ne correspond (ou lecture impossible).
 */
export async function buildSessionTelemetryText(detail: SessionDetail): Promise<string> {
  const file = await findSessionTelemetryFile(detail);
  if (!file) return "";
  const meta = await telemetry.getMeta(file.path);
  const [elec, lap, theo] = await Promise.all([
    loadElectronicsText(meta).catch(() => ""),
    loadFastestLapTexts(meta).catch(() => ({ corners: "", metrics: "" })),
    loadTheoreticalBestText(meta).catch(() => ""),
  ]);

  const fastest = fastestLap(meta);
  const lines: string[] = [];
  lines.push("## Telemetry of this session (in-game recording matched to these results)");
  lines.push(
    `Recording: ${file.filename} · Weather: ${meta.info.weather || "?"} · Laps recorded: ${meta.laps.length}` +
      (fastest ? ` · fastest recorded lap ${formatTime(fastest.duration)}` : ""),
  );
  lines.push(
    "Recorded lap numbers may differ from the results table; match laps by time. The corner list below is the FASTEST recorded lap — compare its braking points with the braking reference (track knowledge section).",
  );
  if (lap.metrics.trim()) lines.push("", lap.metrics);
  if (theo.trim()) lines.push("", theo);
  if (lap.corners.trim()) {
    lines.push("", "### Corners (fastest lap — braking point + apex speed)", lap.corners);
  }
  if (elec.trim()) {
    lines.push("", "### Electronics (recorded — adjustable: ABS / TC / engine map / brake bias)", elec);
  }
  if (!lap.corners.trim() && !lap.metrics.trim()) {
    lines.push("", "No full lap in the recording: per-corner analysis not possible.");
  }
  return lines.join("\n");
}
