/**
 * Métriques de pilotage par virage (P1 — analyse assistée enrichie).
 *
 * À partir d'**un tour à pleine résolution** (canaux demandés avec `maxPoints`
 * élevé ≈ natif) et des virages détectés (`detectCorners`), on calcule des
 * indicateurs métier par **phase** : freinage, entrée, milieu, sortie, + ABS/TC,
 * blocages, hybride. Tout est dérivé des données — aucune valeur inventée.
 *
 * La grille est uniforme en temps (dt constant) → les durées = nb d'échantillons
 * × dt. Les comparaisons vs référence (temps perdu, Δ apex) restent fournies par
 * `analyzeLap`/`summarizeLapAnalysis` ; ici on couvre l'**absolu par phase**.
 */

import type { Corner } from "./corners";

export interface LapChannels {
  time: number[]; // s (grille uniforme)
  dist: number[]; // m (Lap Dist)
  speed: number[]; // km/h (Ground Speed)
  brake: number[]; // %
  throttle: number[]; // %
  steering: number[]; // % (négatif = gauche)
  wheelSpeed?: number[]; // m/s (canal unique)
  soc?: number[]; // %
  regen?: number[]; // kW
  virtualEnergy?: number[]; // % (énergie virtuelle endurance)
  abs?: number[]; // série événementielle (escalier)
  tc?: number[]; // série événementielle (escalier)
}

export interface CornerMetrics {
  n: number;
  apexDist: number; // m
  minSpeed: number; // km/h
  brakePointDist: number; // m
  maxBrake: number; // %
  timeAtMaxBrakeMs: number;
  brakeReleaseMs: number; // durée pic → relâché (<5%)
  trail: boolean; // frein encore appliqué après le turn-in
  entrySpeed: number; // km/h au point de freinage
  steerRateMax: number; // %/s (vitesse de rotation au volant, entrée)
  steerCorrections: number; // nb de corrections dans le virage
  throttleReopenDist: number | null; // m (1re remise de gaz > 10 %)
  throttle0to100Ms: number | null; // durée 20 % → 95 %
  absEvents: number;
  tcEvents: number;
}

export interface HybridAnalysis {
  socStart: number;
  socEnd: number;
  socMin: number;
  socMax: number;
  /** % du tour avec SoC > 90 % (sous-utilisation potentielle de l'hybride). */
  highSoCPct: number;
  /** % du tour en déploiement (SoC qui baisse nettement). */
  deployPct: number;
  /** % du tour en régénération (Regen > 1 kW). */
  regenPct: number;
  /** Régénération cumulée (kWh, approx.). */
  regenKWh: number;
  /** Zones de gros freinage abordées batterie quasi pleine (regen perdue). */
  fullIntoBraking: number;
  /** Énergie virtuelle départ→fin (%), si dispo. */
  virtualEnergy: { start: number; end: number } | null;
}

export interface StyleProfile {
  /** Phrase courte de synthèse (pour adapter le ton des conseils). */
  summary: string;
  /** Traits détectés (archétypes). */
  traits: string[];
}

export interface LapMetrics {
  corners: CornerMetrics[];
  lockups: number; // blocages détectés (wheel speed ≪ vitesse sous frein)
  hybrid: HybridAnalysis | null;
  style: StyleProfile;
}

const BRAKE_ON = 5; // % seuil « frein appliqué »
const THR_ON = 10;

function dtOf(time: number[]): number {
  return time.length > 1 ? time[1] - time[0] : 0.02;
}

/** Compte les fronts montants d'une série événementielle (0/faible → > 0). */
function risingEdges(series: number[] | undefined, a: number, b: number): number {
  if (!series) return 0;
  let count = 0;
  let prevOn = false;
  for (let k = a; k <= b && k < series.length; k++) {
    const on = (series[k] ?? 0) > 0.5;
    if (on && !prevOn) count++;
    prevOn = on;
  }
  return count;
}

function cornerMetrics(c: Corner, endIdx: number, ch: LapChannels, dt: number): CornerMetrics {
  const a = c.brakeIdx;
  const b = Math.min(endIdx, ch.speed.length - 1);
  const apex = c.apexIdx;

  // ── Freinage ──
  let maxBrake = 0;
  for (let k = a; k <= apex; k++) maxBrake = Math.max(maxBrake, ch.brake[k] ?? 0);
  let timeAtMax = 0;
  if (maxBrake > 40) {
    for (let k = a; k <= apex; k++) if ((ch.brake[k] ?? 0) >= maxBrake * 0.95) timeAtMax += dt;
  }
  // Relâchement : du pic de frein jusqu'à < BRAKE_ON.
  let peakIdx = a;
  for (let k = a; k <= apex; k++) if ((ch.brake[k] ?? 0) > (ch.brake[peakIdx] ?? 0)) peakIdx = k;
  let releaseEnd = peakIdx;
  for (let k = peakIdx; k <= b; k++) {
    releaseEnd = k;
    if ((ch.brake[k] ?? 0) < BRAKE_ON) break;
  }
  const brakeReleaseMs = (releaseEnd - peakIdx) * dt * 1000;
  // Trail braking : frein > 15 % encore présent après le turn-in (entre peak et apex).
  let trail = false;
  for (let k = peakIdx; k <= apex; k++) {
    if ((ch.brake[k] ?? 0) > 15 && Math.abs(ch.steering[k] ?? 0) > 8) {
      trail = true;
      break;
    }
  }

  // ── Entrée : vitesse + vitesse de rotation volant max (turn-in) ──
  const entrySpeed = ch.speed[a] ?? 0;
  let steerRateMax = 0;
  for (let k = a; k < apex && k + 1 < ch.steering.length; k++) {
    const rate = Math.abs((ch.steering[k + 1] - ch.steering[k]) / dt);
    if (rate > steerRateMax) steerRateMax = rate;
  }

  // ── Milieu : corrections de volant (changements de signe de la dérivée, anti-bruit) ──
  let corrections = 0;
  let prevSign = 0;
  for (let k = a; k < b && k + 1 < ch.steering.length; k++) {
    const d = ch.steering[k + 1] - ch.steering[k];
    if (Math.abs(d) < 0.3) continue; // bruit
    const s = Math.sign(d);
    if (prevSign !== 0 && s !== prevSign) corrections++;
    prevSign = s;
  }

  // ── Sortie : 1re remise de gaz après l'apex + temps 20 % → 95 % ──
  let throttleReopenDist: number | null = null;
  let throttle0to100Ms: number | null = null;
  for (let k = apex; k <= b; k++) {
    if ((ch.throttle[k] ?? 0) > THR_ON) {
      throttleReopenDist = ch.dist[k] ?? null;
      // temps de 20 % à 95 %
      let i20 = -1;
      let i95 = -1;
      for (let j = k; j <= b; j++) {
        if (i20 < 0 && (ch.throttle[j] ?? 0) >= 20) i20 = j;
        if (i20 >= 0 && (ch.throttle[j] ?? 0) >= 95) {
          i95 = j;
          break;
        }
      }
      if (i20 >= 0 && i95 > i20) throttle0to100Ms = (i95 - i20) * dt * 1000;
      break;
    }
  }

  return {
    n: c.n,
    apexDist: ch.dist[apex] ?? 0,
    minSpeed: c.minSpeed,
    brakePointDist: c.brakeDist,
    maxBrake: Math.round(maxBrake),
    timeAtMaxBrakeMs: Math.round(timeAtMax * 1000),
    brakeReleaseMs: Math.round(brakeReleaseMs),
    trail,
    entrySpeed: Math.round(entrySpeed),
    steerRateMax: Math.round(steerRateMax),
    steerCorrections: corrections,
    throttleReopenDist,
    throttle0to100Ms: throttle0to100Ms != null ? Math.round(throttle0to100Ms) : null,
    absEvents: risingEdges(ch.abs, a, b),
    tcEvents: risingEdges(ch.tc, apex, b),
  };
}

export function computeLapMetrics(
  corners: Corner[],
  ch: LapChannels,
  opts?: { carClass?: string },
): LapMetrics {
  const dt = dtOf(ch.time);
  const n = ch.speed.length;
  const cm = corners.map((c, i) =>
    cornerMetrics(c, i + 1 < corners.length ? corners[i + 1].brakeIdx : n - 1, ch, dt),
  );

  // Blocages : wheel speed (m/s → km/h) nettement < vitesse sol pendant un freinage.
  let lockups = 0;
  if (ch.wheelSpeed) {
    let inLock = false;
    for (let k = 0; k < n; k++) {
      const ws = (ch.wheelSpeed[k] ?? 0) * 3.6;
      const v = ch.speed[k] ?? 0;
      const lock = (ch.brake[k] ?? 0) > 30 && v > 40 && ws < v * 0.6;
      if (lock && !inLock) lockups++;
      inLock = lock;
    }
  }

  // ── Hybride (P3) — Hypercar uniquement (SoC présent) ──
  let hybrid: HybridAnalysis | null = null;
  const isHyper = /hyper|lmh|lmdh/i.test(opts?.carClass ?? "");
  if (ch.soc && ch.soc.length && isHyper) {
    const soc = ch.soc.map((x) => (isFinite(x) ? x : 0));
    let high = 0;
    let deploy = 0;
    let regenT = 0;
    let regenKWh = 0;
    for (let k = 0; k < soc.length; k++) {
      if (soc[k] > 90) high++;
      if (k > 0 && soc[k] - soc[k - 1] < -0.02) deploy++;
      const r = ch.regen?.[k] ?? 0;
      if (r > 1) regenT++;
      regenKWh += Math.max(0, r) * dt;
    }
    regenKWh /= 3600;
    // Zones de gros freinage abordées batterie quasi pleine.
    let fullIntoBraking = 0;
    for (const c of corners) {
      if ((ch.brake[c.apexIdx] ?? 0) >= 0 && (soc[c.brakeIdx] ?? 0) > 90) {
        let maxB = 0;
        for (let k = c.brakeIdx; k <= c.apexIdx; k++) maxB = Math.max(maxB, ch.brake[k] ?? 0);
        if (maxB > 60) fullIntoBraking++;
      }
    }
    const L = soc.length;
    const ve = ch.virtualEnergy?.filter((x) => isFinite(x)) ?? [];
    hybrid = {
      socStart: Math.round(soc[0]),
      socEnd: Math.round(soc[L - 1]),
      socMin: Math.round(Math.min(...soc)),
      socMax: Math.round(Math.max(...soc)),
      highSoCPct: Math.round((high / L) * 100),
      deployPct: Math.round((deploy / L) * 100),
      regenPct: Math.round((regenT / L) * 100),
      regenKWh: Math.round(regenKWh * 100) / 100,
      fullIntoBraking,
      virtualEnergy: ve.length ? { start: Math.round(ve[0]), end: Math.round(ve[ve.length - 1]) } : null,
    };
  }

  // ── Classification de style (P4) — heuristiques prudentes ──
  const avgCorr = cm.reduce((s, c) => s + c.steerCorrections, 0) / Math.max(1, cm.length);
  const avgSteerRate = cm.reduce((s, c) => s + c.steerRateMax, 0) / Math.max(1, cm.length);
  const trailRatio = cm.filter((c) => c.trail).length / Math.max(1, cm.length);
  const braking = cm.filter((c) => c.maxBrake > 30);
  const avgMaxBrake = braking.reduce((s, c) => s + c.maxBrake, 0) / Math.max(1, braking.length);
  const fastThrottle = cm.filter((c) => c.throttle0to100Ms != null && c.throttle0to100Ms < 250).length;
  const totalTc = cm.reduce((s, c) => s + c.tcEvents, 0);

  const traits: string[] = [];
  // Freinage
  if (avgMaxBrake > 88) traits.push("freineur agressif (forte pression)");
  else if (avgMaxBrake > 0 && avgMaxBrake < 70) traits.push("freineur prudent (pression modérée)");
  // Rotation
  if (trailRatio > 0.4) traits.push("rotation sur frein (trail braking)");
  else if (avgSteerRate > 400) traits.push("rotation sur volant (turn-in rapide)");
  // Stabilité
  if (avgCorr > 2) traits.push("plateforme instable (corrections fréquentes)");
  // Accélération
  if (fastThrottle > cm.length * 0.4 || totalTc > cm.length)
    traits.push("remise de gaz agressive (TC sollicité)");
  else if (cm.some((c) => c.throttle0to100Ms != null))
    traits.push("remise de gaz progressive");
  // Catégorie
  const cat = isHyper ? "prototype (Hypercar)" : /gt3|lmgt3|gte/i.test(opts?.carClass ?? "") ? "GT" : "";
  if (cat) traits.push(cat);

  const summary =
    traits.length > 0
      ? `Profil : ${traits.slice(0, 3).join(", ")}.`
      : "Profil : style équilibré (pas de trait marqué).";

  return { corners: cm, lockups, hybrid, style: { summary, traits } };
}

const MAX = 14;

/** Résumé structuré (EN, compact) pour le LLM — par virage + global. */
export function summarizeLapMetrics(m: LapMetrics): string {
  if (m.corners.length === 0) return "";
  const lines: string[] = [];
  lines.push("## Driving metrics (analysed lap, per phase)");
  for (const c of m.corners.slice(0, MAX)) {
    const parts = [
      `brake max ${c.maxBrake}%`,
      c.timeAtMaxBrakeMs > 0 ? `${c.timeAtMaxBrakeMs}ms at peak` : "",
      `release ${c.brakeReleaseMs}ms${c.trail ? " (trail)" : ""}`,
      `entry ${c.entrySpeed}→apex ${c.minSpeed.toFixed(0)} km/h`,
      c.steerCorrections > 1 ? `${c.steerCorrections} steer corrections` : "",
      c.throttle0to100Ms != null ? `throttle 20→100% in ${c.throttle0to100Ms}ms` : "",
      c.tcEvents > 0 ? `${c.tcEvents} TC` : "",
      c.absEvents > 0 ? `${c.absEvents} ABS` : "",
    ].filter(Boolean);
    lines.push(`T${c.n} @ ${(c.apexDist / 1000).toFixed(2)}km: ${parts.join(", ")}`);
  }
  if (m.lockups > 0) lines.push(`Lock-ups detected: ${m.lockups} (single wheel-speed channel — corner not localised)`);
  if (m.hybrid) {
    const h = m.hybrid;
    lines.push("## Hybrid management (Hypercar)");
    lines.push(
      `SoC ${h.socStart}%→${h.socEnd}% (min ${h.socMin}%, max ${h.socMax}%) · deploy ${h.deployPct}% of lap · regen ${h.regenPct}% (${h.regenKWh} kWh) · high SoC (>90%) ${h.highSoCPct}% of lap`,
    );
    if (h.virtualEnergy) lines.push(`Virtual energy: ${h.virtualEnergy.start}%→${h.virtualEnergy.end}%`);
    if (h.highSoCPct > 50) lines.push("Note: battery stays high most of the lap — hybrid likely under-deployed.");
    if (h.fullIntoBraking > 0) lines.push(`Note: ${h.fullIntoBraking} heavy braking zone(s) entered with near-full battery — regen wasted / brake stability affected.`);
  }
  lines.push(`## Driving style (heuristic)\n${m.style.summary}`);
  return lines.join("\n");
}
