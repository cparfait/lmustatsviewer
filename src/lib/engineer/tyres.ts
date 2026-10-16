/**
 * Pneus côté stratégie (module pur) :
 *  - usure par roue et par tour (tours bouclés, réinitialisée quand la gomme
 *    remonte de 10 points = pneus changés) ;
 *  - combien de pneus changer au prochain arrêt : on projette chaque roue sur
 *    le relais suivant ; une roue qui passerait sous le seuil de falaise est à
 *    changer, la plus usée d'abord. Aucune si le reste de la course tient ;
 *  - pneus pluie ou slicks : humidité de la trajectoire et sa tendance, avec
 *    hystérésis (on ne bascule pas sur un frémissement) ;
 *  - coût de chauffe mesuré : après chaque arrêt de n'importe quelle voiture,
 *    on compare la fin de son tour de sortie (S2 + S3) et le tour suivant à
 *    ses meilleurs temps. Médiane par classe : c'est le temps que coûtent des
 *    pneus froids au-delà de la perte au stand.
 */

import type { LiveData, LiveWheel } from "@/lib/api";

/** Seuil de falaise : sous ce % de gomme, le rythme s'effondre. */
export const CLIFF_PCT = 25;
/** Remontée de gomme qui signe un changement de pneu (points de %). */
const FRESH_JUMP_PCT = 10;
/** Tours d'usure gardés pour la pente. */
const WEAR_WINDOW = 6;

/** Ordre des roues dans `telemetry.wheels` : AVG, AVD, ARG, ARD. */
export const WHEELS = ["fl", "fr", "rl", "rr"] as const;
export type WheelId = (typeof WHEELS)[number];

export class TyreWearTracker {
  private samples: number[][] = [[], [], [], []];

  reset(): void {
    this.samples = [[], [], [], []];
  }

  /** Tour bouclé : gomme restante (%) des 4 roues. */
  push(wear: number[]): void {
    wear.forEach((w, i) => {
      if (!(w >= 0 && w <= 100)) return;
      const s = this.samples[i];
      const last = s[s.length - 1];
      if (last != null && w > last + FRESH_JUMP_PCT) s.length = 0; // pneu changé
      s.push(w);
      if (s.length > WEAR_WINDOW + 1) s.shift();
    });
  }

  /** Usure par tour (% / tour) de chaque roue ; null tant que < 2 tours mesurés. */
  perLap(): (number | null)[] {
    return this.samples.map((s) => {
      if (s.length < 3) return null;
      const per = (s[0] - s[s.length - 1]) / (s.length - 1);
      return per > 0 ? per : null;
    });
  }
}

export interface TyreChangePlan {
  /** Roues à changer, la plus usée d'abord. */
  change: WheelId[];
  /** Le reste de la course tient sans changer (aucun relais après l'arrêt n'en a besoin). */
  toFinish: boolean;
}

/**
 * Roues à changer pour couvrir `stintLaps` tours après l'arrêt.
 * Une roue sans pente mesurée est jugée sur sa gomme actuelle seulement.
 */
export function tyreChangePlan(wear: number[], perLap: (number | null)[], stintLaps: number, lapsToFinish: number | null): TyreChangePlan {
  const laps = lapsToFinish != null ? Math.min(stintLaps, lapsToFinish) : stintLaps;
  const order = WHEELS.map((id, i) => ({ id, i, end: wear[i] - (perLap[i] ?? 0) * laps })).sort((a, b) => a.end - b.end);
  const change = order.filter((w) => w.end < CLIFF_PCT).map((w) => w.id);
  return { change, toFinish: lapsToFinish != null && lapsToFinish <= stintLaps };
}

// ── Pluie / slicks ───────────────────────────────────────────────────────────

/** Gomme pluie d'après le nom du composé (LMU : « Wet », « Rain »…). */
export function isWetCompound(name: string | undefined | null): boolean {
  return /wet|rain|pluie|intermed|inter\b/i.test(name ?? "");
}

/** Humidité (0-1) au-delà de laquelle des pneus pluie s'imposent. */
export const WET_ON = 0.4;
/** … en dessous de laquelle des slicks reprennent l'avantage (piste qui sèche). */
export const WET_OFF = 0.12;
/** Variation minimale sur la fenêtre pour parler de tendance. */
const TREND_EPS = 0.02;

export type Crossover = "toWets" | "toSlicks" | null;

/** Humidité de la trajectoire sur ~2 min : tendance + recommandation de gomme. */
export class WetnessTrend {
  private pts: { t: number; w: number }[] = [];

  reset(): void {
    this.pts = [];
  }

  push(nowS: number, wetness: number): void {
    if (!(wetness >= 0)) return;
    this.pts.push({ t: nowS, w: wetness });
    while (this.pts.length && nowS - this.pts[0].t > 120) this.pts.shift();
  }

  trend(): "rising" | "falling" | "stable" {
    if (this.pts.length < 2) return "stable";
    const d = this.pts[this.pts.length - 1].w - this.pts[0].w;
    return d > TREND_EPS ? "rising" : d < -TREND_EPS ? "falling" : "stable";
  }

  /** Recommandation pour la gomme montée, ou null si elle convient. */
  call(onWets: boolean, rain: number): Crossover {
    const w = this.pts.length ? this.pts[this.pts.length - 1].w : 0;
    const tr = this.trend();
    if (!onWets && (w >= WET_ON || (w >= WET_OFF && tr === "rising" && rain > 0.1))) return "toWets";
    if (onWets && (w <= WET_OFF / 2 || (w <= WET_OFF && tr === "falling" && rain < 0.05))) return "toSlicks";
    return null;
  }
}

// ── Coût de chauffe mesuré (toutes les voitures) ─────────────────────────────

/** Plage plausible du coût de chauffe (s) : au-delà, incident ou trafic. */
const WARMUP_MIN_S = 0.2;
const WARMUP_MAX_S = 25;

interface CarWarm {
  stops: number;
  laps: number;
  /** Meilleurs S2 / S3 vus (s) : la référence d'un tour chaud. */
  bestS2: number;
  bestS3: number;
  /** Tour (compté en tours bouclés) qui sera le tour de sortie ; 0 = aucun. */
  outLap: number;
  /** Coût mesuré sur le tour de sortie, en attente du tour suivant. */
  partial: number | null;
}

export class WarmupTracker {
  private cars = new Map<string, CarWarm>();
  private samples = new Map<string, number[]>();

  reset(): void {
    this.cars.clear();
    this.samples.clear();
  }

  /** Mesures de la séance par classe (s). */
  measured(cls: string): number[] {
    return this.samples.get(cls) ?? [];
  }

  /** Coût de chauffe médian de la classe (s), ou null (moins de 2 mesures). */
  median(cls: string): number | null {
    const xs = [...this.measured(cls)].sort((a, b) => a - b);
    if (xs.length < 2) return null;
    const m = xs.length >> 1;
    return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
  }

  /** À chaque trame ; renvoie les mesures nouvellement bouclées (piste verte seulement). */
  push(d: LiveData, green: boolean): { cls: string; seconds: number }[] {
    const out: { cls: string; seconds: number }[] = [];
    for (const s of d.standings) {
      let c = this.cars.get(s.driver);
      if (!c) {
        c = { stops: s.num_pitstops, laps: s.total_laps, bestS2: 0, bestS3: 0, outLap: 0, partial: null };
        this.cars.set(s.driver, c);
      }
      if (s.num_pitstops > c.stops) {
        // Arrêt compté : le prochain tour bouclé est le tour de sortie.
        c.outLap = green ? s.total_laps + 1 : 0;
        c.partial = null;
      }
      c.stops = s.num_pitstops;
      if (s.total_laps > c.laps) {
        const lap = s.total_laps;
        if (c.outLap > 0 && lap === c.outLap) {
          // Fin du tour de sortie : surcoût S2 + S3 (le S1 est déjà dans la perte au stand).
          c.partial =
            c.bestS2 > 0 && c.bestS3 > 0 && s.last_s2 > 0 && s.last_s3 > 0
              ? Math.max(0, s.last_s2 - c.bestS2) + Math.max(0, s.last_s3 - c.bestS3)
              : null;
          if (c.partial == null) c.outLap = 0;
        } else if (c.outLap > 0 && c.partial != null && lap === c.outLap + 1) {
          const next = s.best_lap_time > 0 && s.last_lap_time > 0 ? Math.max(0, s.last_lap_time - s.best_lap_time) : null;
          const total = next != null ? c.partial + next : null;
          if (green && total != null && total >= WARMUP_MIN_S && total <= WARMUP_MAX_S) {
            const arr = this.samples.get(s.vehicle_class) ?? [];
            arr.push(total);
            this.samples.set(s.vehicle_class, arr);
            out.push({ cls: s.vehicle_class, seconds: total });
          }
          c.outLap = 0;
          c.partial = null;
        } else if (c.outLap > 0 && lap > c.outLap + 1) {
          c.outLap = 0;
          c.partial = null;
        }
        // Référence : meilleurs secteurs (un tour lent ne change pas un minimum).
        if (s.last_s2 > 0 && (c.bestS2 === 0 || s.last_s2 < c.bestS2)) c.bestS2 = s.last_s2;
        if (s.last_s3 > 0 && (c.bestS3 === 0 || s.last_s3 < c.bestS3)) c.bestS3 = s.last_s3;
        c.laps = lap;
      }
    }
    return out;
  }
}

/** Gomme restante des 4 roues (télémétrie), ou null. */
export function wheelWear(wheels: LiveWheel[] | undefined | null): number[] | null {
  if (!wheels || wheels.length !== 4) return null;
  const w = wheels.map((x) => x.wear);
  return w.every((x) => x >= 0 && x <= 100) ? w : null;
}
