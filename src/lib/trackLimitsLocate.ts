/**
 * Où, dans le tour, a eu lieu un événement du fichier de résultats (limite de piste) ?
 *
 * Le jeu ne donne que l'heure de session de l'événement. Avec l'heure de début de
 * chaque tour (`laps.et`), on obtient le temps écoulé dans le tour, puis le secteur
 * (temps de secteur du tour, sinon ceux du meilleur tour mis à l'échelle). La distance
 * se déduit ensuite, du plus précis au plus grossier :
 *  1. bornes de secteurs du tracé + profil temps → distance d'un tour de télémétrie ;
 *  2. bornes de secteurs du tracé, interpolation linéaire dans le secteur ;
 *  3. profil de télémétrie seul, au prorata du tour ;
 *  4. longueur du circuit, au prorata du tour.
 * Le virage = repère officiel le plus proche (seulement si la numérotation officielle
 * colle au tracé détecté — sinon la distance seule). Toujours une estimation.
 *
 * Attention : l'attribut `Lap` des `<TrackLimits>` compte les tours BOUCLÉS (0 pendant
 * le 1er tour) ; ici le tour vient de l'heure, sinon de `Lap + 1`.
 */

export interface LapTiming {
  lap_num: number;
  /** Heure de session au début du tour (s). */
  et: number | null;
  lap_time: number | null;
  s1: number | null;
  s2: number | null;
}

export interface LocateRef {
  /** Longueur du tour (m). */
  length: number;
  /** Bornes de fin de S1 / S2 (distance-tour, m), apprises en roulant. */
  s1?: number | null;
  s2?: number | null;
  /** Repères officiels du tracé, triés par distance. */
  corners?: { dist: number; label: string }[];
  /** Tour de référence (télémétrie) : temps depuis la ligne (s) → distance-tour (m). */
  profile?: { time: number[]; dist: number[] } | null;
  /** Secteurs du meilleur tour, pour un tour sans temps de secteurs. */
  bestSectors?: [number, number, number] | null;
}

export interface EventLocation {
  lap: number;
  /** Temps écoulé dans le tour (s). */
  intoLap: number;
  sector: 1 | 2 | 3 | null;
  /** Distance-tour estimée (m). */
  dist: number | null;
  /** Repère officiel le plus proche (« T10 Pouhon »), si connu. */
  corner: string | null;
  /** Méthode : `telemetry` / `sectors` (précise) ou `lap` (grossière). */
  method: "telemetry" | "sectors" | "lap" | null;
}

/** Interpolation linéaire y(x) sur une série croissante en x. */
function interp(xs: number[], ys: number[], x: number): number {
  if (xs.length === 0) return NaN;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

/** Profil rendu monotone (distance croissante) et ramené à t = 0 sur la ligne. */
function cleanProfile(p: { time: number[]; dist: number[] }): { time: number[]; dist: number[] } | null {
  const time: number[] = [];
  const dist: number[] = [];
  const t0 = p.time[0] ?? 0;
  for (let i = 0; i < p.time.length; i++) {
    const d = p.dist[i];
    if (!Number.isFinite(d) || !Number.isFinite(p.time[i])) continue;
    if (dist.length && d <= dist[dist.length - 1]) continue;
    time.push(p.time[i] - t0);
    dist.push(d);
  }
  return time.length >= 10 ? { time, dist } : null;
}

/** Repère le plus proche d'une distance (tour fermé). */
export function nearestCorner(corners: { dist: number; label: string }[], d: number, length: number): string | null {
  let best: { label: string; gap: number } | null = null;
  for (const c of corners) {
    const raw = Math.abs(c.dist - d);
    const gap = Math.min(raw, length - raw);
    if (!best || gap < best.gap) best = { label: c.label, gap };
  }
  return best ? best.label : null;
}

/**
 * Situe un événement (heure de session `et`) dans les tours d'UN pilote. `finishTime` =
 * heure de fin de son dernier tour (sinon la durée du dernier tour vient de son temps).
 * `lapHint` = tour indiqué par le fichier (déjà +1), utilisé sans heure de tour.
 */
export function locateInLap(
  et: number,
  laps: LapTiming[],
  ref: LocateRef | null,
  finishTime: number | null = null,
  lapHint: number | null = null,
): EventLocation | null {
  const timed = laps.filter((l) => l.et != null).sort((a, b) => (a.et as number) - (b.et as number));
  let idx = -1;
  for (let i = 0; i < timed.length; i++) if ((timed[i].et as number) <= et) idx = i;
  if (idx < 0) {
    return lapHint != null ? { lap: lapHint, intoLap: NaN, sector: null, dist: null, corner: null, method: null } : null;
  }
  const lap = timed[idx];
  const start = lap.et as number;
  const next = timed[idx + 1]?.et ?? (finishTime && finishTime > start ? finishTime : null);
  const duration = next != null ? next - start : lap.lap_time && lap.lap_time > 0 ? lap.lap_time : null;
  const intoLap = et - start;
  const out: EventLocation = { lap: lap.lap_num, intoLap, sector: null, dist: null, corner: null, method: null };
  if (duration != null && intoLap > duration + 1) return out; // hors du tour (fin de session…)

  // Temps de secteurs du tour, sinon ceux du meilleur tour ramenés à la durée du tour.
  let a = lap.s1;
  let b = lap.s2;
  if ((a == null || b == null) && ref?.bestSectors) {
    const [x, y, z] = ref.bestSectors;
    const k = duration != null ? duration / (x + y + z) : 1;
    a = x * k;
    b = y * k;
  }
  const c = duration != null && a != null && b != null ? duration - a - b : null;
  if (a != null && b != null) {
    out.sector = intoLap < a ? 1 : intoLap < a + b ? 2 : 3;
  }

  const length = ref?.length ?? 0;
  const profile = ref?.profile ? cleanProfile(ref.profile) : null;
  const bounds =
    ref?.s1 && ref?.s2 && length > 0 && ref.s1 < ref.s2 && ref.s2 < length ? [0, ref.s1, ref.s2, length] : null;

  if (out.sector && bounds && a != null && b != null) {
    const k = out.sector;
    const secStart = k === 1 ? 0 : k === 2 ? a : a + b;
    const secLen = k === 1 ? a : k === 2 ? b : c;
    const f = secLen && secLen > 0 ? Math.min(1, Math.max(0, (intoLap - secStart) / secLen)) : 0.5;
    if (profile) {
      const tStart = interp(profile.dist, profile.time, bounds[k - 1]);
      const tEnd = interp(profile.dist, profile.time, bounds[k]);
      out.dist = interp(profile.time, profile.dist, tStart + f * (tEnd - tStart));
      out.method = "telemetry";
    } else {
      out.dist = bounds[k - 1] + f * (bounds[k] - bounds[k - 1]);
      out.method = "sectors";
    }
  } else if (duration != null && profile) {
    const total = profile.time[profile.time.length - 1];
    out.dist = interp(profile.time, profile.dist, (intoLap / duration) * total);
    out.method = "telemetry";
  } else if (duration != null && length > 0) {
    out.dist = Math.min(1, Math.max(0, intoLap / duration)) * length;
    out.method = "lap";
  }
  if (out.dist != null && length > 0) out.dist = Math.min(length, Math.max(0, out.dist));
  if (out.dist != null && ref?.corners?.length && out.method !== "lap") {
    out.corner = nearestCorner(ref.corners, out.dist, length);
  }
  return out;
}

/** « T10 Pouhon (S2, ≈ 3.4 km) », « S2, ≈ 3.4 km (rough) », « S2 », « ». */
export function describeLocation(loc: EventLocation | null): string {
  if (!loc) return "";
  const parts: string[] = [];
  if (loc.sector) parts.push(`S${loc.sector}`);
  if (loc.dist != null) parts.push(`≈ ${(loc.dist / 1000).toFixed(2)} km${loc.method === "lap" ? ", rough" : ""}`);
  if (loc.corner) return `near ${loc.corner}${parts.length ? ` (${parts.join(", ")})` : ""}`;
  return parts.join(", ");
}
