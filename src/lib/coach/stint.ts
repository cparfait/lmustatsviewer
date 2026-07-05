/**
 * Coaching de stint (COACH-LIVE-SPEC.md §12 P2, P5.3) — module **pur** (types +
 * arithmétique seuls, aucune dépendance React/i18n/Tauri), rejouable (§14).
 *
 * Personne ne coache LMU **par virage au fil du relais**. Trois signaux, tous
 * calculables sans référence externe :
 *  1. **Dérive de la vitesse de passage** (`vmin` qui baisse tour après tour sur un
 *     virage = pneus qui fatiguent) — alerte **une fois par virage et par stint**,
 *     dès qu'une baisse confirmée dépasse le seuil (anti-nag).
 *  2. **Lift & coast** quand le calcul carburant dit FUEL SHORT (§12) — délivré sur
 *     une **fenêtre haute charge** (fin de ligne droite), avec cooldown en tours.
 *  3. **Prudence de tour de sortie** (pneus froids) — une fois à chaque sortie de
 *     stand.
 *
 * Un « stint » = la période entre deux passages aux stands. `resetStint` (sortie de
 * stand / changement de combo) repart des mesures à zéro : la fatigue se juge
 * **relativement au début du relais courant**, jamais entre relais.
 */

import type { CornerMeasurement } from "./engine";

/** Accumulateur de `vmin` d'un virage sur le relais courant. */
interface StintCornerAcc {
  n: number;
  /** `vmin` (km/h) de chaque passage propre, dans l'ordre du relais. */
  vmins: number[];
  /** Dérive déjà signalée sur ce virage pour ce stint (une alerte suffit). */
  alerted: boolean;
}

export interface StintState {
  /** `corner_uid` → historique de `vmin` du relais. */
  corners: Map<string, StintCornerAcc>;
  /** Dernier tour où un conseil lift & coast a été donné (−1 = jamais). */
  lastLiftLap: number;
  /** Un conseil de prudence out-lap est-il en attente (sortie de stand) ? */
  outLapPending: boolean;
}

/** Un conseil de stint prêt à formater (voix + widget). */
export interface StintAdvisory {
  kind: "stint-drift" | "lift-coast" | "out-lap";
  /** Suffixe i18n sous `live.`. */
  suffix: string;
  vars: Record<string, string | number>;
  /** Numéro de virage (0 si le conseil n'est pas lié à un virage). */
  corner: number;
  corner_uid: string;
  /** Écart chiffré exact (baisse de `vmin` en km/h pour la dérive ; 0 sinon). */
  magnitude: number;
  unit: "km/h" | "";
}

/** Passages minimaux avant de juger une dérive (assez d'échantillons). */
const MIN_SAMPLES = 4;
/** Fenêtre « début de relais » (médiane) — pneus chauds mais neufs. */
const BASELINE_N = 2;
/** Fenêtre « récente » (médiane) — état courant des pneus. */
const RECENT_N = 2;
/** Baisse minimale de `vmin` (km/h) pour parler de fatigue. */
const MIN_DROP_KMH = 2;
/** …ou 2 % de la vitesse de passage de base (seuil relatif §7). */
const DROP_PCT = 0.02;
/** Cooldown (tours) entre deux rappels lift & coast. */
const LIFT_COOLDOWN_LAPS = 3;

export function createStintState(): StintState {
  return { corners: new Map(), lastLiftLap: -1, outLapPending: false };
}

/**
 * Démarre un nouveau relais : oublie l'historique de `vmin` (la fatigue se juge par
 * rapport au **début du relais courant**) et réarme le cooldown lift & coast.
 * `outLap` = un conseil de prudence out-lap est attendu (sortie de stand).
 */
export function resetStint(st: StintState, opts?: { outLap?: boolean }): void {
  st.corners.clear();
  st.lastLiftLap = -1;
  st.outLapPending = opts?.outLap ?? false;
}

/** Médiane d'un tableau non vide (copie triée). */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Enregistre le `vmin` d'un passage et signale une **dérive** confirmée (baisse de
 * vitesse de passage entre le début du relais et les passages récents), une seule
 * fois par virage et par stint. `null` si passage douteux (`tainted`/`vmin`≤0),
 * échantillons insuffisants, déjà signalé, ou dérive sous le seuil.
 */
export function recordStintCorner(
  st: StintState,
  m: CornerMeasurement,
): StintAdvisory | null {
  if (m.tainted || m.vmin <= 0) return null;
  let acc = st.corners.get(m.corner_uid);
  if (!acc) {
    acc = { n: m.n, vmins: [], alerted: false };
    st.corners.set(m.corner_uid, acc);
  }
  acc.n = m.n;
  acc.vmins.push(m.vmin);
  if (acc.alerted || acc.vmins.length < MIN_SAMPLES) return null;

  const base = median(acc.vmins.slice(0, BASELINE_N));
  const recent = median(acc.vmins.slice(-RECENT_N));
  const drop = base - recent;
  if (drop >= Math.max(MIN_DROP_KMH, DROP_PCT * base)) {
    acc.alerted = true;
    return {
      kind: "stint-drift",
      suffix: "vStintTireFade",
      vars: { n: acc.n },
      corner: acc.n,
      corner_uid: m.corner_uid,
      magnitude: drop,
      unit: "km/h",
    };
  }
  return null;
}

/**
 * Conseil **lift & coast** (§12) quand le carburant est juste (`fuelShort`) et
 * qu'on est à haute charge (`onThrottle`, fin de ligne droite = fenêtre calme).
 * Rythmé par un cooldown en tours pour ne pas répéter à chaque ligne droite.
 */
export function fuelAdvice(
  st: StintState,
  o: { fuelShort: boolean; lapNum: number; onThrottle: boolean },
): StintAdvisory | null {
  if (!o.fuelShort || !o.onThrottle) return null;
  if (st.lastLiftLap >= 0 && o.lapNum - st.lastLiftLap < LIFT_COOLDOWN_LAPS) {
    return null;
  }
  st.lastLiftLap = o.lapNum;
  return {
    kind: "lift-coast",
    suffix: "vStintLiftCoast",
    vars: {},
    corner: 0,
    corner_uid: "",
    magnitude: 0,
    unit: "",
  };
}

/**
 * Récupère (et consomme) le conseil de **prudence out-lap** en attente : pneus
 * froids en sortie de stand. Renvoie `null` s'il a déjà été délivré.
 */
export function takeOutLapAdvice(st: StintState): StintAdvisory | null {
  if (!st.outLapPending) return null;
  st.outLapPending = false;
  return {
    kind: "out-lap",
    suffix: "vStintOutLap",
    vars: {},
    corner: 0,
    corner_uid: "",
    magnitude: 0,
    unit: "",
  };
}
