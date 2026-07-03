/**
 * Delta live « vs ton meilleur tour », aligné par DISTANCE.
 *
 * Bufferise le tour courant (distance + temps écoulé sur le tour) et calcule à
 * chaque trame l'écart de temps à la même position : `delta = temps_courant −
 * temps_réf(d)` (positif = plus lent). Détecte les virages de la référence
 * (réutilise `detectCorners`) pour figer un écart « par virage » au passage de
 * chaque apex.
 *
 * Référence = ton MEILLEUR tour sur le combo **circuit + catégorie** : persisté
 * (clé `liveref::<track>::<class>`, trace sous-échantillonnée) et rechargé au
 * début de session. Tu compares donc à ton meilleur tour sur ce circuit dans ta
 * catégorie — pas seulement au meilleur de la session courante. Il se met à jour
 * dès que tu fais mieux. Tout est dérivé des données live — rien d'inventé.
 */

import { useEffect, useRef, useState } from "react";
import { config, type LiveData } from "@/lib/api";
import { detectCorners } from "@/lib/telemetry/corners";

export interface CornerDelta {
  n: number;
  apexDist: number;
  delta: number;
}

export interface LiveDelta {
  /** Écart de temps vs réf. à la position courante (s) ; `null` sans référence. */
  delta: number | null;
  /** Une référence est-elle disponible ? */
  refReady: boolean;
  /** Temps du tour de référence (s) ; `null` sans référence. */
  refLapTime: number | null;
  /** Écarts figés par virage sur le tour en cours. */
  corners: CornerDelta[];
}

interface RefLap {
  dist: number[];
  time: number[];
  corners: { n: number; apexDist: number }[];
  lapTime: number;
}

const MIN_LAP_SAMPLES = 50;
const APEX_CAPTURE_M = 12;
const REF_PREFIX = "liveref::";
/** Points conservés pour la trace persistée (suffisant pour un delta par distance). */
const STORE_POINTS = 200;

/** Clé de persistance du combo (circuit + classe brute live). */
function comboKeyOf(track: string, rawClass: string): string {
  return `${REF_PREFIX}${track}::${rawClass}`;
}

/** Sous-échantillonne une trace (dist/time) à ~`STORE_POINTS` points, bornes incluses. */
function downsample(dist: number[], time: number[]): { dist: number[]; time: number[] } {
  const n = dist.length;
  if (n <= STORE_POINTS) return { dist: dist.slice(), time: time.slice() };
  const step = (n - 1) / (STORE_POINTS - 1);
  const od: number[] = [];
  const ot: number[] = [];
  for (let i = 0; i < STORE_POINTS; i++) {
    const idx = Math.round(i * step);
    od.push(dist[idx]);
    ot.push(time[idx]);
  }
  return { dist: od, time: ot };
}

async function persistRef(key: string, ref: RefLap): Promise<void> {
  try {
    const ds = downsample(ref.dist, ref.time);
    await config.set(
      key,
      JSON.stringify({
        v: 1,
        dist: ds.dist.map((x) => Math.round(x * 10) / 10),
        time: ds.time.map((x) => Math.round(x * 1000) / 1000),
        corners: ref.corners,
        lapTime: ref.lapTime,
      }),
    );
  } catch {
    /* persistance best-effort */
  }
}

async function loadPersistedRef(key: string): Promise<RefLap | null> {
  try {
    const raw = await config.get(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.dist) || !Array.isArray(p.time) || p.dist.length < 2) {
      return null;
    }
    return {
      dist: p.dist,
      time: p.time,
      corners: Array.isArray(p.corners) ? p.corners : [],
      lapTime: typeof p.lapTime === "number" ? p.lapTime : 0,
    };
  } catch {
    return null;
  }
}

/** Interpolation linéaire de la valeur de réf. à la distance `d` (dist trié ↑). */
function interpAt(
  d: number,
  dist: number[],
  val: number[],
  ptr: { i: number },
): number {
  let i = ptr.i;
  if (i > dist.length - 2) i = Math.max(0, dist.length - 2);
  while (i < dist.length - 2 && dist[i + 1] < d) i++;
  while (i > 0 && dist[i] > d) i--;
  ptr.i = i;
  const d0 = dist[i];
  const d1 = dist[i + 1] ?? d0;
  const v0 = val[i];
  const v1 = val[i + 1] ?? v0;
  if (d1 <= d0) return v0;
  // Borner le facteur à [0, 1] : ne PAS extrapoler au-delà du dernier point de
  // la réf (sous-échantillonnée à 200 pts, sa fin peut précéder la vraie ligne
  // d'arrivée) — sinon delta faussé sur le dernier dixième de seconde du tour.
  const f = Math.max(0, Math.min(1, (d - d0) / (d1 - d0)));
  return v0 + (v1 - v0) * f;
}

export function useLiveDelta(data: LiveData | null): LiveDelta {
  const [out, setOut] = useState<LiveDelta>({
    delta: null,
    refReady: false,
    refLapTime: null,
    corners: [],
  });

  const curDist = useRef<number[]>([]);
  const curTime = useRef<number[]>([]);
  const curSpeed = useRef<number[]>([]);
  const curBrake = useRef<number[]>([]);
  const ref = useRef<RefLap | null>(null);
  const lastLapNum = useRef<number>(-1);
  const tainted = useRef<boolean>(false);
  const interpPtr = useRef({ i: 0 });
  const captured = useRef<CornerDelta[]>([]);
  const nextCorner = useRef<number>(0);
  const lastDist = useRef<number>(0);
  // Combo courant (circuit + classe). Changement → recharge la réf persistée.
  const comboKey = useRef<string>("");

  useEffect(() => {
    if (!data || !data.connected || data.paused) return;
    const tel = data.telemetry;
    const p = data.player;
    if (!tel || !p) return;
    const me = data.standings.find((s) => s.is_player) ?? null;
    const inPits = me?.in_pits ?? false;

    const lapNum = p.total_laps;
    const d = tel.lap_dist;
    const tCur = p.current_lap_time;

    const resetCurrentLap = () => {
      curDist.current = [];
      curTime.current = [];
      curSpeed.current = [];
      curBrake.current = [];
      tainted.current = inPits;
      captured.current = [];
      nextCorner.current = 0;
      interpPtr.current = { i: 0 };
    };

    // ── Changement de combo (circuit + catégorie) → recharge la réf persistée ──
    const rawClass = me?.vehicle_class ?? "";
    const track = data.session?.track ?? "";
    if (track && rawClass) {
      const key = comboKeyOf(track, rawClass);
      if (key !== comboKey.current) {
        comboKey.current = key;
        ref.current = null;
        resetCurrentLap();
        lastLapNum.current = lapNum;
        lastDist.current = 0;
        // Charge le meilleur tour persisté de ce combo (asynchrone).
        loadPersistedRef(key).then((r) => {
          if (comboKey.current !== key || !r) return;
          // N'écrase pas une réf de session déjà meilleure.
          if (!ref.current || r.lapTime < ref.current.lapTime) ref.current = r;
        });
      }
    }

    const finalizeLap = (lapTime: number) => {
      const valid =
        !tainted.current && lapTime > 0 && curDist.current.length >= MIN_LAP_SAMPLES;
      if (valid && (!ref.current || lapTime < ref.current.lapTime)) {
        const distArr = curDist.current.slice();
        const corners = detectCorners(
          curSpeed.current.slice(),
          curBrake.current.slice(),
          distArr,
        ).map((c) => ({ n: c.n, apexDist: distArr[c.apexIdx] ?? 0 }));
        const newRef: RefLap = {
          dist: distArr,
          time: curTime.current.slice(),
          corners,
          lapTime,
        };
        ref.current = newRef;
        if (comboKey.current) void persistRef(comboKey.current, newRef);
      }
      resetCurrentLap();
    };

    // ── Franchissement de ligne (nouveau tour) ──
    if (lastLapNum.current < 0) {
      lastLapNum.current = lapNum;
    } else if (lapNum > lastLapNum.current) {
      finalizeLap(p.last_lap_time);
      lastLapNum.current = lapNum;
    } else if (lastDist.current > 0 && d + 5 < lastDist.current) {
      resetCurrentLap();
    }
    lastDist.current = d;
    if (inPits) tainted.current = true;

    // ── Accumulation du tour courant (distance strictement croissante) ──
    const cd = curDist.current;
    if (d > 0 && tCur > 0 && (cd.length === 0 || d > cd[cd.length - 1])) {
      cd.push(d);
      curTime.current.push(tCur);
      curSpeed.current.push(tel.speed_kmh);
      // `tel.brake` est une fraction [0,1] ; `detectCorners` attend des % (0-100,
      // seuil d'appui à 5 %). Sans cette conversion, le point de freinage
      // retombait systématiquement dans le fallback « virage sans freinage ».
      curBrake.current.push(tel.brake * 100);
    }

    // ── Delta live vs référence + capture par virage ──
    let delta: number | null = null;
    const r = ref.current;
    if (r && d > 0 && tCur > 0) {
      delta = tCur - interpAt(d, r.dist, r.time, interpPtr.current);
      while (
        nextCorner.current < r.corners.length &&
        d >= r.corners[nextCorner.current].apexDist - APEX_CAPTURE_M
      ) {
        const c = r.corners[nextCorner.current];
        captured.current = [...captured.current, { n: c.n, apexDist: c.apexDist, delta }];
        nextCorner.current++;
      }
    }

    setOut({
      delta,
      refReady: !!r,
      refLapTime: r ? r.lapTime : null,
      corners: captured.current,
    });
  }, [data]);

  return out;
}
