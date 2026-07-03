/**
 * Callouts prédictifs — mode Découverte (COACH-LIVE-SPEC.md §8, P3.3) — module
 * **pur** (types + arithmétique seuls, aucune dépendance React/i18n/Tauri).
 *
 * En **Découverte** (pas de réf joueur → le moteur mute tout diagnostic §5), le
 * coach guide le pilote *avant* chaque zone de freinage notable à partir du guide
 * **macro** ApexPoints (`apex.ts`) : « Chicane Dunlop : freinage au 150, 3ᵉ. »
 * C'est le remplaçant du « silence radio » de la v1 — le moment où le pilote a le
 * plus besoin d'aide.
 *
 * Deux briques :
 *  1. **Cibles** (`buildPredictiveTargets`) : chaque virage macro appariée à une
 *     fenêtre reçoit le `brakeDist` **absolu** de cette fenêtre + un texte fixe
 *     (clé i18n + variables). Sans coordonnée piste dans ApexPoints (§3.3), le
 *     `brakeDist` vient toujours d'une fenêtre **mesurée** — la réf dense (cas
 *     nominal) ou les virages **auto-détectés** au 1ᵉʳ tour de Découverte
 *     (`windowsFromDetected`), jamais du marqueur (position de panneau).
 *  2. **Ordonnanceur** (`stepPredictive`) : à chaque trame, déclenche le callout
 *     de la prochaine zone quand il reste **assez de temps** pour finir ≥ 2 s
 *     avant le point de freinage (`brakeDist − v × (durée_TTS + 2 s)`, §8). Un
 *     callout par virage et par tour ; **s'estompe** après quelques tours (fade).
 *
 * Déterministe (horloge = distance/vitesse de la trame, pas `Date.now()`) →
 * rejouable hors Tauri (tests §14).
 */

import type { MacroCorner, MappedMacro } from "./apex";
import {
  assignUid,
  type CoachWindow,
  type DetectedCorner,
  type KnownApex,
} from "./windows";

// ── Cibles prédictives ────────────────────────────────────────────────────────

/** Un callout prédictif ancré à une zone de freinage (texte fixe + position). */
export interface PredictiveTarget {
  /** UID stable de la fenêtre appariée (fade + anti-doublon). */
  corner_uid: string;
  /** Numéro de virage **ApexPoints** (badge widget), ex. `5` pour `T5`/`T2-T9`. */
  n: number;
  /** Point de freinage **absolu** de la fenêtre (m) — jamais le marqueur (§3.3). */
  brakeDist: number;
  /** Suffixe i18n sous `live.` (ex. « vPredictBrakeGear »). */
  suffix: string;
  /** Variables d'interpolation du gabarit (`{{name}}`, `{{marker}}`, `{{gear}}`). */
  vars: Record<string, string | number>;
}

/** Message prédictif prêt à prononcer (analogue à `CoachVoiceMsg`, plus léger). */
export interface PredictiveMsg {
  suffix: string;
  vars: Record<string, string | number>;
  /** Numéro de virage ApexPoints (badge widget). */
  corner: number;
  /** UID stable du virage. */
  corner_uid: string;
}

/**
 * Suffixe i18n + variables du callout fixe d'un virage macro (§8). Format
 * « repère parlé » : nom du virage + panneau de freinage (`markerM`, jamais une
 * coordonnée piste §3.3) + rapport. On sélectionne le gabarit selon ce qui est
 * réellement connu (marqueur et/ou rapport) pour ne jamais dire « au null ».
 */
export function voiceKeyForMacro(
  c: MacroCorner,
): { suffix: string; vars: Record<string, string | number> } {
  const name = c.name;
  const hasMarker = c.markerM != null && c.markerM > 0;
  const hasGear = c.gearN != null && c.gearN > 0;
  if (hasMarker && hasGear) {
    return { suffix: "vPredictBrakeGear", vars: { name, marker: c.markerM!, gear: c.gearN! } };
  }
  if (hasMarker) {
    return { suffix: "vPredictBrake", vars: { name, marker: c.markerM! } };
  }
  if (hasGear) {
    return { suffix: "vPredictGear", vars: { name, gear: c.gearN! } };
  }
  return { suffix: "vPredictName", vars: { name } };
}

/**
 * Construit les cibles prédictives : chaque virage macro **apparié** à une
 * fenêtre (`windowIndex != null`) reçoit le `brakeDist` de cette fenêtre + son
 * texte fixe. Trié par `brakeDist` (ordre de rencontre sur le tour). Les virages
 * macro sans ancre (plus de virages que de fenêtres) sont ignorés — pas de
 * callout sans point de freinage connu.
 */
export function buildPredictiveTargets(
  mapped: MappedMacro[],
  windows: CoachWindow[],
): PredictiveTarget[] {
  const out: PredictiveTarget[] = [];
  for (const m of mapped) {
    if (m.windowIndex == null) continue;
    const w = windows[m.windowIndex];
    if (!w) continue;
    const { suffix, vars } = voiceKeyForMacro(m.corner);
    out.push({
      corner_uid: w.corner_uid,
      n: m.corner.parsed.start,
      brakeDist: w.brakeDist,
      suffix,
      vars,
    });
  }
  return out.sort((a, b) => a.brakeDist - b.brakeDist);
}

/**
 * Fenêtres exploitables à partir des virages **auto-détectés** d'un tour bouclé
 * (Découverte pure : pas de réf → pas de fenêtre projetée). `assignUid` réutilise
 * la mémoire d'apex du moteur pour garder des UID stables entre tours. Seules les
 * bornes/`brakeDist` importent ici (les cibles de vitesse restent 0 — inutilisées
 * par les callouts prédictifs).
 */
export function windowsFromDetected(
  corners: DetectedCorner[],
  known: KnownApex[],
): CoachWindow[] {
  return corners
    .map((c) => ({
      corner_uid: assignUid(c.apexDist, known),
      n: c.n,
      startDist: c.entryDist,
      endDist: c.exitDist,
      brakeDist: c.brakeDist,
      apexDist: c.apexDist,
      exitDist: c.exitDist,
      refVmin: c.minSpeed,
      refVentry: 0,
      refVexit: 0,
      refFullThrottleDist: 0,
    }))
    .sort((a, b) => a.startDist - b.startDist);
}

// ── Ordonnanceur ──────────────────────────────────────────────────────────────

/** Contexte de trame minimal pour le déclenchement prédictif. */
export interface PredictiveFrame {
  /** Distance curviligne courante (m). */
  dist: number;
  /** Vitesse courante (km/h). */
  speed: number;
  /** Numéro de tour (bascule → nouveau budget de fade). */
  lapNum: number;
  /** En stand / pit-lane → pas de callout. */
  inPits: boolean;
}

export interface PredictiveState {
  /** Cibles du combo courant, triées par `brakeDist`. */
  targets: PredictiveTarget[];
  /** Nb de virages détectés ayant servi à bâtir les cibles (rebuild si mieux). */
  builtFromCount: number;
  /** Tour courant (reset de `firedThisLap`). */
  lapNum: number;
  /** Callouts déjà émis sur le tour courant (un par virage/tour). */
  firedThisLap: Set<string>;
  /** Nb total d'émissions par virage sur la session (fade §8). */
  calledCount: Map<string, number>;
}

export function createPredictiveState(): PredictiveState {
  return {
    targets: [],
    builtFromCount: 0,
    lapNum: -1,
    firedThisLap: new Set(),
    calledCount: new Map(),
  };
}

/** Durée TTS estimée d'un callout court (s) — aligné sur `voice.ts` (§1.1). */
const TTS_EST_S = 2.2;
/** Marge : le callout doit finir **≥ 2 s** avant le point de freinage (§8). */
const LEAD_PREDICT_S = 2.0;
/** Fade : au-delà de N émissions du même virage, on se tait (§8 « s'estompe »). */
const FADE_MAX = 3;
/** Vitesse (km/h) sous laquelle on ne déclenche pas (pit/arrêt). */
const MIN_SPEED_KMH = 30;

/**
 * (Re)pose les cibles prédictives. Conserve `calledCount` (le fade suit le virage
 * sur toute la session, à travers les rebuilds), remet à zéro le budget du tour.
 * `fromCount` = nb de virages détectés source (permet au service de ne remplacer
 * que par une géométrie **plus complète**).
 */
export function setPredictiveTargets(
  st: PredictiveState,
  targets: PredictiveTarget[],
  fromCount: number,
): void {
  st.targets = targets;
  st.builtFromCount = fromCount;
  st.firedThisLap = new Set();
}

/**
 * Évalue le déclenchement prédictif pour la trame courante. Renvoie le callout à
 * **prononcer maintenant** (et le marque émis), ou `null`. Déclenche le callout de
 * la **prochaine** zone de freinage devant soi dès qu'il reste juste assez de
 * distance pour finir ≥ 2 s avant le freinage (`brakeDist − v·(TTS+2 s)`).
 */
export function stepPredictive(
  st: PredictiveState,
  frame: PredictiveFrame,
): PredictiveMsg | null {
  // Bascule de tour → nouveau budget (un callout par virage et par tour).
  if (frame.lapNum !== st.lapNum) {
    st.lapNum = frame.lapNum;
    st.firedThisLap = new Set();
  }
  if (st.targets.length === 0) return null;
  if (frame.inPits || frame.speed < MIN_SPEED_KMH) return null;

  const speedMs = frame.speed / 3.6;
  const lead = speedMs * (TTS_EST_S + LEAD_PREDICT_S);

  // Prochaine zone devant soi (le plus petit `brakeDist` encore à venir).
  for (const tgt of st.targets) {
    if (tgt.brakeDist <= frame.dist) continue; // déjà passée sur ce tour
    // On ne considère que la première zone à venir : si elle n'est pas encore
    // dans sa fenêtre de déclenchement, aucune plus lointaine ne l'est non plus.
    if (frame.dist < tgt.brakeDist - lead) return null;
    if (st.firedThisLap.has(tgt.corner_uid)) return null;
    if ((st.calledCount.get(tgt.corner_uid) ?? 0) >= FADE_MAX) return null; // fade
    st.firedThisLap.add(tgt.corner_uid);
    st.calledCount.set(tgt.corner_uid, (st.calledCount.get(tgt.corner_uid) ?? 0) + 1);
    return {
      suffix: tgt.suffix,
      vars: tgt.vars,
      corner: tgt.n,
      corner_uid: tgt.corner_uid,
    };
  }
  return null;
}
