/**
 * Import d'un tour « ghost » comme référence coach (COACH-LIVE-SPEC.md §2.2 / §3.4,
 * P5.5). Deux sources supportées, **même pipeline en aval** :
 *
 *  1. **`.duckdb`** (voie principale) — le format natif de l'app, lu partout via
 *     `telemetry.getChannels` : un bon tour à toi (autre session) ou un tour partagé.
 *  2. **`.ld` MoTeC** (voie secondaire) — pour les tours de référence exportés depuis
 *     MoTeC i2 ; le binaire est parsé côté Rust (`commands/motec.rs`).
 *
 * Dans les deux cas : les canaux sont ramenés au tampon 8-canaux (`LapBuffer`), puis
 * `detectAllCorners` + `buildRefPayload(kind:"ghost")` produisent la réf dense (helper
 * commun `saveGhostFromBuffer`). Un ghost est prioritaire sur le `best` du joueur au
 * chargement (§3.4, tri backend).
 */

import {
  coachRef,
  telemetry,
  type LdChannel,
  type TelemetryChannelData,
  type TelemetryMeta,
} from "@/lib/api";
import { buildRefPayload, type CaptureMeta } from "./capture";
import { detectAllCorners, type LapBuffer } from "./windows";
import type { CompletedLap, LapEligibility } from "./engine";

/** Combo cible d'un import ghost. */
export interface GhostCombo {
  track: string;
  carModel: string;
  carClass: string;
  gameBuild?: string;
}

/** Résultat d'un import de ghost (retour d'info pour l'UI). */
export interface GhostImportResult {
  refId: number;
  lapTime: number;
  corners: number;
  samples: number;
  /** Tour source (0 pour un `.ld` mono-tour). */
  lap: number;
}

/** Max de la valeur absolue d'un canal (détection d'échelle 0-1 vs 0-100). */
function maxAbs(v: number[]): number {
  let m = 0;
  for (const x of v) {
    const a = Math.abs(x);
    if (a > m) m = a;
  }
  return m;
}

/** Normalise un canal frein/gaz en pourcents (fraction [0,1] → ×100), borné. */
function toPct(v: number[]): number[] {
  const scale = maxAbs(v) <= 1.5 ? 100 : 1;
  return v.map((x) => Math.max(0, Math.min(100, x * scale)));
}

// ── Voie 1 : `.duckdb` (pipeline télémétrie natif) ───────────────────────────

/** Canaux `.duckdb` nécessaires à la construction d'une réf coach (§3.1). */
const GHOST_CHANNELS = [
  "Ground Speed",
  "Brake Pos",
  "Throttle Pos",
  "Steering Pos",
  "G Force Lat",
  "G Force Long",
  "Gear",
];

/** Série scalaire (`values[0]`) d'un canal, ou un tableau de zéros si absent. */
function series(data: TelemetryChannelData, name: string, n: number): number[] {
  const v = data.channels.find((c) => c.name === name)?.values[0];
  return v && v.length === n ? v.slice() : new Array<number>(n).fill(0);
}

/**
 * Construit le tampon 8-canaux du coach à partir des canaux d'un tour `.duckdb`.
 * `null` si le tour est trop court ou sans vitesse exploitable. La distance est
 * **rebasée à 0** (la grille de réf part de 0, §3.1).
 */
export function buildLapBufferFromChannels(
  data: TelemetryChannelData,
): { buf: LapBuffer; lapTime: number } | null {
  const n = data.dist.length;
  if (n < 2 || data.time.length !== n) return null;

  const speed = series(data, "Ground Speed", n);
  if (speed.every((v) => v <= 0)) return null;

  const d0 = data.dist[0] ?? 0;
  const steerRaw = series(data, "Steering Pos", n);
  const steerMax = maxAbs(steerRaw) || 1;

  const buf: LapBuffer = {
    dist: data.dist.map((v) => v - d0),
    time: data.time.slice(),
    speed, // km/h (canal `.duckdb`)
    brake: toPct(series(data, "Brake Pos", n)),
    throttle: toPct(series(data, "Throttle Pos", n)),
    // Volant → [-1,1] (normalisé par le max abs ; canal secondaire pour la détection).
    steer: steerRaw.map((x) => Math.max(-1, Math.min(1, x / steerMax))),
    gLat: series(data, "G Force Lat", n), // g
    gLong: series(data, "G Force Long", n), // g
    gear: series(data, "Gear", n).map((x) => Math.round(x)),
  };
  const lapTime = (data.time[n - 1] ?? 0) - (data.time[0] ?? 0);
  return { buf, lapTime };
}

/** Numéro du tour le plus rapide (durée mini > 0) d'un fichier, ou `null`. */
export function pickBestLap(meta: TelemetryMeta): number | null {
  let best: { lap: number; d: number } | null = null;
  for (const l of meta.laps) {
    if (l.duration > 0 && (!best || l.duration < best.d)) {
      best = { lap: l.lap, d: l.duration };
    }
  }
  return best?.lap ?? null;
}

// ── Voie 2 : `.ld` MoTeC (canaux bruts parsés côté Rust) ─────────────────────

/**
 * Candidats de noms de canaux (sous-chaînes **minuscules**, par priorité) pour
 * chacun des canaux du coach. Le premier canal dont le nom contient un candidat
 * (dans l'ordre) est retenu — les noms les plus spécifiques d'abord.
 */
const LD_CANDIDATES = {
  speed: ["ground speed", "vehicle speed", "gps speed", "wheel speed", "speed"],
  brake: ["brake pos", "brake pres", "brake"],
  throttle: ["throttle pos", "throttle", "accelerator"],
  steer: ["steered angle", "steering angle", "steering", "steer"],
  gLat: ["g force lat", "gps latacc", "lateral accel", "lat accel", "acc lat", "lat g", "glat"],
  gLong: ["g force long", "gps lonacc", "longitudinal accel", "long accel", "acc long", "long g", "glong"],
  gear: ["gear"],
  dist: ["lap distance", "corrected distance", "distance"],
} as const;

/** Résout un canal par liste de candidats (insensible à la casse), ou `null`. */
export function resolveChannel(
  channels: LdChannel[],
  candidates: readonly string[],
): LdChannel | null {
  const lc = channels.map((c) => ({ c, name: c.name.toLowerCase() }));
  for (const cand of candidates) {
    const hit = lc.find((x) => x.name.includes(cand));
    if (hit) return hit.c;
  }
  return null;
}

/** Un canal contient-il l'unité `u` (insensible à la casse) ? */
function unitHas(ch: LdChannel | null, u: string): boolean {
  return !!ch && ch.unit.toLowerCase().includes(u);
}

/** Interpolation linéaire d'un canal (fréquence `srcFreq` Hz) aux temps `targets` (s). */
function resampleByFreq(values: number[], srcFreq: number, targets: number[]): number[] {
  const n = values.length;
  if (n === 0) return targets.map(() => 0);
  const f = srcFreq > 0 ? srcFreq : (n - 1) / Math.max(1e-9, targets[targets.length - 1] ?? 1);
  return targets.map((t) => {
    const g = t * f;
    if (g <= 0) return values[0];
    if (g >= n - 1) return values[n - 1];
    const i = Math.floor(g);
    return values[i] + (values[i + 1] - values[i]) * (g - i);
  });
}

/**
 * Construit le tampon 8-canaux du coach à partir des canaux `.ld` bruts.
 * `null` si aucun canal de vitesse exploitable. Le canal de **vitesse** est maître
 * (sa cadence + sa longueur fixent la grille) ; les autres y sont ré-échantillonnés.
 */
export function buildLapBufferFromLd(
  channels: LdChannel[],
): { buf: LapBuffer; lapTime: number } | null {
  const speedCh = resolveChannel([...channels], LD_CANDIDATES.speed);
  if (!speedCh || speedCh.data.length < 2) return null;

  const N = speedCh.data.length;
  const Fmaster = speedCh.freq > 0 ? speedCh.freq : 50;
  const dt = 1 / Fmaster;
  const time = Array.from({ length: N }, (_, i) => i * dt);

  let speed = resampleByFreq(speedCh.data, speedCh.freq, time);
  if (unitHas(speedCh, "m/s")) speed = speed.map((v) => v * 3.6);
  speed = speed.map((v) => (v < 0 ? 0 : v));

  const brakeCh = resolveChannel([...channels], LD_CANDIDATES.brake);
  const throttleCh = resolveChannel([...channels], LD_CANDIDATES.throttle);
  const steerCh = resolveChannel([...channels], LD_CANDIDATES.steer);
  const gLatCh = resolveChannel([...channels], LD_CANDIDATES.gLat);
  const gLongCh = resolveChannel([...channels], LD_CANDIDATES.gLong);
  const gearCh = resolveChannel([...channels], LD_CANDIDATES.gear);
  const distCh = resolveChannel([...channels], LD_CANDIDATES.dist);

  const resample = (ch: LdChannel | null): number[] =>
    ch ? resampleByFreq(ch.data, ch.freq, time) : new Array<number>(N).fill(0);

  const brake = toPct(resample(brakeCh));
  const throttle = toPct(resample(throttleCh));

  const steerRaw = resample(steerCh);
  const steerMax = maxAbs(steerRaw) || 1;
  const steer = steerRaw.map((x) => Math.max(-1, Math.min(1, x / steerMax)));

  const toG = (ch: LdChannel | null): number[] => {
    const v = resample(ch);
    return unitHas(ch, "m/s") ? v.map((x) => x / 9.81) : v;
  };
  const gLat = toG(gLatCh);
  const gLong = toG(gLongCh);
  const gear = resample(gearCh).map((x) => Math.round(x));

  // Distance (m) : canal dédié monotone, sinon intégration de la vitesse.
  let dist: number[];
  const distCand = distCh ? resampleByFreq(distCh.data, distCh.freq, time) : null;
  const monotone =
    distCand != null &&
    distCand[N - 1] > distCand[0] &&
    distCand.every((v, i) => i === 0 || v >= distCand[i - 1] - 1e-6);
  if (monotone && distCand) {
    const base = distCand[0];
    dist = distCand.map((v) => v - base);
  } else {
    dist = new Array<number>(N);
    dist[0] = 0;
    for (let i = 1; i < N; i++) dist[i] = dist[i - 1] + (speed[i] / 3.6) * dt;
  }

  const lapTime = (N - 1) * dt;
  return { buf: { dist, time, speed, brake, throttle, steer, gLat, gLong, gear }, lapTime };
}

// ── Pipeline commun : tampon → réf ghost persistée ───────────────────────────

/**
 * Détecte les virages du tampon, bâtit la réf dense `kind: "ghost"` et la persiste.
 * Cœur partagé des deux voies d'import.
 */
async function saveGhostFromBuffer(
  built: { buf: LapBuffer; lapTime: number },
  lapNum: number,
  lapTime: number,
  combo: GhostCombo,
): Promise<GhostImportResult> {
  const corners = detectAllCorners(built.buf);
  const eligibility: LapEligibility = {
    eligible: true,
    clean: true,
    gapOk: true,
    noYellow: true,
    tiresOk: true,
    minGapAhead: 999,
  };
  const lap: CompletedLap = {
    lapNum,
    lapTime,
    tainted: false,
    buf: built.buf,
    corners,
    eligibility,
  };
  const meta: CaptureMeta = {
    track: combo.track,
    carModel: combo.carModel,
    carClass: combo.carClass,
    gameBuild: combo.gameBuild ?? "",
    trackTemp: 0,
    airTemp: 0,
    wetness: 0,
    rain: 0,
    compoundF: "",
    compoundR: "",
    fuelAtStart: 0,
    tcMap: 0,
    absMap: 0,
    lapsSincePit: 0,
  };
  const payload = buildRefPayload(lap, meta, "ghost");
  if (!payload) throw new Error("ref-build-failed");
  const refId = await coachRef.save(payload);
  return { refId, lapTime, corners: corners.length, samples: built.buf.dist.length, lap: lapNum };
}

/** Importe un ghost depuis un tour `.duckdb` (voie principale). */
export async function importGhostFromDuckdb(
  path: string,
  combo: GhostCombo,
): Promise<GhostImportResult> {
  const meta = await telemetry.getMeta(path);
  const lap = pickBestLap(meta);
  const data = await telemetry.getChannels(path, GHOST_CHANNELS, lap, 4000);
  const built = buildLapBufferFromChannels(data);
  if (!built) throw new Error("no-usable-lap");
  const lapDuration =
    (lap != null ? meta.laps.find((l) => l.lap === lap)?.duration : undefined) ??
    built.lapTime;
  return saveGhostFromBuffer(built, lap ?? 0, lapDuration, combo);
}

/** Importe un ghost depuis un fichier MoTeC `.ld` (voie secondaire). */
export async function importGhostFromLd(
  path: string,
  combo: GhostCombo,
): Promise<GhostImportResult> {
  const channels = await coachRef.parseLd(path);
  const built = buildLapBufferFromLd(channels);
  if (!built) throw new Error("no-speed-channel");
  return saveGhostFromBuffer(built, 0, built.lapTime, combo);
}

/** Importe un ghost, en choisissant la voie selon l'extension du fichier. */
export async function importGhost(
  path: string,
  combo: GhostCombo,
): Promise<GhostImportResult> {
  return path.toLowerCase().endsWith(".ld")
    ? importGhostFromLd(path, combo)
    : importGhostFromDuckdb(path, combo);
}
