/**
 * Restitution vocale du coach par virage (COACH-LIVE-SPEC.md §1/§8/§9, P2.2→P2.4) —
 * module **pur** (aucune dépendance React/i18n/Tauri, uniquement des types) :
 *
 *  1. **Formateur** `voiceKeyForDiag` / `voiceKeyForPositive` : mappe un verdict sur
 *     une **clé i18n** (`live.vCorner*`, groupe `corners` de `voiceMessages`) + ses
 *     variables. Format radio §1.2 : « Virage — verbe — 1 chiffre ». Le texte final
 *     est produit par l'appelant via `t(key, vars)` (gabarits personnalisables).
 *
 *  2. **Pédagogie** `observeCorner` (§1.3-1.5 + §8) : à **chaque** clôture de virage
 *     (fautif, propre ou muet), pilote —
 *       - le **focus collant** (§1.3) : un seul virage-chantier à la fois, tenu
 *         3-5 tours, on ne zappe pas vers un autre virage ;
 *       - le **feedback dégressif** (§1.5) : systématique au début, puis 1 passage
 *         sur 2, sur 3, puis silence en attendant la validation ;
 *       - le **renforcement positif** (§1.4) : à la résolution confirmée du chantier
 *         (2 passages propres), « voilà, c'est ça » + dixièmes repris ;
 *       - les **modes** (§8) : Practice (nominal), Course (erreur répétée coûteuse
 *         seulement), Qualif (silence en roulage — débrief out-lap = P4).
 *
 *  3. **Ordonnanceur** `stepCoachVoice` : la **fenêtre de délivrance** (§1.1) — un
 *     conseil n'est prononcé que dans une fenêtre **calme** (gaz > 90 %, prochain
 *     freinage assez loin) et **fraîche** (≤ 8 s, sinon abandon → report débrief).
 *
 *  4. **Mode rigoureux** (`st.rigor`, réglage, défaut actif) : un conseil se
 *     **juge sur mesure**, pas sur deux passages propres (qui peuvent n'être qu'un
 *     retour à la moyenne). « Avant » = tous les passages mesurés du virage (≤ 12,
 *     bons et mauvais) ; « après » = au moins 3 passages suivant le conseil ; test
 *     de Welch sur le temps du virage. Seuls « mieux » (dixièmes repris) et « pire »
 *     (« oublie mon conseil ») sont dits ; un conseil sans effet ou nuisible **clôt
 *     le virage pour la séance** (on n'insiste plus). Le conseil est dit une fois,
 *     suivi de « je regarde les prochains passages ». En course, 12 tours au moins
 *     entre deux conseils.
 *
 * Déterministe (horloge = `elapsed` sim de la trame, pas `Date.now()`) → rejouable
 * hors Tauri (tests §14).
 */

import type { CoachDiagnostic, DiagCode, DiagResult } from "./diagnostics";
import type { CoachWindow } from "./windows";
import type { ModePolicy } from "./mode";

// ── 1. Formateur : verdict → clé i18n + variables ─────────────────────────────

/**
 * Type d'un message coach : 9 diagnostics (§5) + retours positifs §1.4 + prédictif
 * §8 + apprentissage §11 (rappel inter-sessions + rapport « 1+1+1 », P4.1).
 */
export type CoachMsgKind =
  | DiagCode
  | "resolved"
  | "clean"
  | "predict"
  | "recall"
  | "report"
  // Coaching de stint (§12 P2, P5.3) : dérive pneus, lift & coast, prudence out-lap.
  | "stint-drift"
  | "lift-coast"
  | "out-lap"
  // Risque + cible de classe (§12 P3, P5.4).
  | "risk-limits"
  | "class-target"
  // Mode rigoureux : le conseil a empiré le passage → « oublie mon conseil ».
  | "worse";

/** Un message vocal prêt à formater + à afficher (widget P2.3). */
export interface CoachVoiceMsg {
  /** Suffixe i18n sous `live.` (ex. « vCornerBrakeEarly »). */
  suffix: string;
  /** Variables d'interpolation (`{{n}}`, `{{d}}`). */
  vars: Record<string, string | number>;
  /** Type (icône/typage widget) — diagnostic ou retour positif. */
  kind: CoachMsgKind;
  /** Numéro de virage. */
  corner: number;
  /** UID stable du virage (anti-spam / mémoire chronique). */
  corner_uid: string;
  /** Écart mesuré **exact** (valeur absolue, non arrondie « radio ») ; 0 pour un positif. */
  magnitude: number;
  /** Unité de l'écart (`m` / `km/h` / `s` / `g` / ``). */
  unit: CoachDiagnostic["unit"];
  /** Sens : +1 trop tard/haut/fort, −1 trop tôt/bas, 0 neutre. */
  sign: number;
  /** true = renforcement positif §1.4 (le widget peut le styliser en « validé »). */
  positive: boolean;
  /** Mode rigoureux : 1ʳᵉ fois que ce conseil est dit → annoncer la vérification. */
  follow?: boolean;
}

/**
 * Charge de l'event Tauri `coach-corner` (widget overlay, P2.3) : le conseil
 * délivré **et le détail chiffré exact** que la voix n'énonce pas (§1.2 — la voix
 * arrondit « radio » à un seul chiffre ; le widget montre la valeur précise, avec
 * son unité et son sens). Type pur (partagé hook émetteur ↔ widget récepteur).
 */
export interface CoachCornerEvent {
  /** Texte du conseil, identique à la voix (déjà localisé par l'appelant). */
  text: string;
  /** Numéro de virage. */
  corner: number;
  /** Type du message (icône / typage côté widget). */
  code: CoachMsgKind;
  /** Écart mesuré **exact** (valeur absolue, non arrondie « radio »). */
  magnitude: number;
  /** Unité de l'écart (`m` / `km/h` / `s` / `g` / ``). */
  unit: CoachDiagnostic["unit"];
  /** Sens : +1 trop tard/haut/fort, −1 trop tôt/bas, 0 neutre. */
  sign: number;
  /** true = renforcement positif §1.4 (styling « validé » côté widget). */
  positive: boolean;
}

/** Construit la charge du widget depuis un message + son texte localisé (P2.3). */
export function coachCornerEvent(
  msg: CoachVoiceMsg,
  text: string,
): CoachCornerEvent {
  return {
    text,
    corner: msg.corner,
    code: msg.kind,
    magnitude: msg.magnitude,
    unit: msg.unit,
    sign: msg.sign,
    positive: msg.positive,
  };
}

/** Arrondi « radio » : un seul chiffre lisible (multiples de `step`). */
function roundTo(x: number, step: number): number {
  return Math.max(step, Math.round(x / step) * step);
}

/**
 * Suffixe i18n + variables pour un diagnostic. Une seule métrique chiffrée est
 * exposée à la voix (§1.2) ; le détail complet ira au widget (P2.3). `sign`
 * discrimine les deux sens du point de freinage (trop tôt / trop tard).
 */
export function voiceKeyForDiag(
  diag: CoachDiagnostic,
): { suffix: string; vars: Record<string, string | number> } {
  const n = diag.n;
  const mag = diag.magnitude;
  switch (diag.code) {
    case "lockup":
      return { suffix: "vCornerLockup", vars: { n } };
    case "wheelspin":
      return { suffix: "vCornerWheelspin", vars: { n } };
    case "consistency":
      return { suffix: "vCornerConsistency", vars: { n } };
    case "brake-timing": {
      // sign +1 = freiné trop tard → « freine plus tôt » ; -1 = trop tôt.
      // `relative` (réf dense périmée §3.3) → gabarit « que d'habitude ».
      const d = roundTo(mag, 5);
      if (diag.sign >= 0) {
        return diag.relative
          ? { suffix: "vCornerBrakeEarlyUsual", vars: { n, d } }
          : { suffix: "vCornerBrakeEarly", vars: { n, d } };
      }
      return diag.relative
        ? { suffix: "vCornerBrakeLateUsual", vars: { n, d } }
        : { suffix: "vCornerBrakeLate", vars: { n, d } };
    }
    case "over-slow": {
      const d = roundTo(mag, 1);
      return diag.relative
        ? { suffix: "vCornerOverSlowUsual", vars: { n, d } }
        : { suffix: "vCornerOverSlow", vars: { n, d } };
    }
    case "entry-too-fast":
      return { suffix: "vCornerEntryFast", vars: { n } };
    case "late-throttle":
      return { suffix: "vCornerLateThrottle", vars: { n } };
    case "grip-unused":
      return { suffix: "vCornerGripUnused", vars: { n } };
    case "no-trail":
      return { suffix: "vCornerNoTrail", vars: { n } };
  }
}

// ── 2. Pédagogie : focus collant, dégressif, renforcement positif ─────────────

/** Un conseil en attente de sa fenêtre de délivrance (diagnostic ou positif). */
type Pending =
  | {
      kind: "diag";
      diag: CoachDiagnostic;
      queuedAt: number;
      /** Mode rigoureux : base « avant » à figer quand le conseil est réellement dit. */
      before?: number[];
    }
  | { kind: "worse"; corner: number; corner_uid: string; queuedAt: number }
  | {
      kind: "positive";
      corner: number;
      corner_uid: string;
      /** Dixièmes de seconde repris (0 → message générique « propre »). */
      tenths: number;
      queuedAt: number;
    };

/** Virage-chantier collant (§1.3) : élu et tenu jusqu'à résolution/péremption. */
interface Focus {
  uid: string;
  n: number;
  /** Cause dominante travaillée (peut changer → reformulation §1.3). */
  code: DiagCode;
  /** Tour d'adoption (péremption à 3-5 tours §1.3). */
  sinceLap: number;
  /** Nombre de fois où ce chantier a été prononcé (cadence dégressive §1.5). */
  spokenCount: number;
  /** Passages depuis la dernière parole (cadence dégressive §1.5). */
  passesSinceSpoken: number;
  /** Δt vs réf le plus mauvais observé sur le chantier (gain positif §1.4). */
  worstDt: number;
  /** Passages propres consécutifs (résolution §1.3/§1.4). */
  cleanStreak: number;
  /** A-t-on déjà parlé de ce chantier ? (rien à valider sinon). */
  spokenAtLeastOnce: boolean;
  /** Mode rigoureux : temps du virage avant le conseil (figé à la 1ʳᵉ parole). */
  before?: number[];
  /** Mode rigoureux : temps du virage depuis le conseil. */
  after?: number[];
}

/** Historique de délivrance d'une clé `uid×code` (anti-spam backstop §9). */
interface SpokenMark {
  lapNum: number;
  magnitude: number;
}

export interface CoachVoiceState {
  /** Un seul conseil en vol à la fois (focus §1.3 : pas de zapping). */
  pending: Pending | null;
  /** Virage-chantier courant (§1.3), ou `null` si aucun n'est élu. */
  focus: Focus | null;
  /** Tour courant pour le budget (§9). */
  lapNum: number;
  /** Messages prononcés sur le tour courant (budget §9). */
  spokenThisLap: number;
  /** Dernière délivrance par clé `uid|code` (anti-répétition inter-tours §9). */
  lastByKey: Map<string, SpokenMark>;
  /** Occurrences cumulées d'un `uid|code` sur la session (escalade Course §8). */
  occurrences: Map<string, number>;
  /** Mode rigoureux (réglage) : verdict mesuré, virages clos, écart en course. */
  rigor: boolean;
  /** Temps des derniers passages mesurés par virage (≤ `SAMPLES_MAX`). */
  samples: Map<string, number[]>;
  /** Virages clos pour la séance (conseil sans effet ou nuisible). */
  closed: Set<string>;
  /** Tour du dernier conseil en course (écart minimal entre deux conseils). */
  lastRaceTipLap: number;
}

export function createCoachVoiceState(): CoachVoiceState {
  return {
    pending: null,
    focus: null,
    lapNum: -1,
    spokenThisLap: 0,
    lastByKey: new Map(),
    occurrences: new Map(),
    rigor: false,
    samples: new Map(),
    closed: new Set(),
    lastRaceTipLap: -Infinity,
  };
}

/** Gaz (%) au-delà duquel la sortie est jugée finie (fenêtre calme §1.1). */
const THROTTLE_CALM_PCT = 90;
/** Durée TTS estimée d'un message radio court (s) — gabarit ≤ 8 mots. */
const TTS_EST_S = 2.2;
/** Marge de sécurité avant le prochain freinage (s, §1.1). */
const LEAD_S = 1.5;
/** Fraîcheur : au-delà, on abandonne (report débrief §1.1). */
const FRESH_MAX_S = 8;
/** Écart de tours en-deçà duquel on ne répète pas un virage sans aggravation (§9). */
const REPEAT_LAP_GAP = 2;
/** Facteur d'aggravation qui autorise à re-parler d'un virage plus tôt (§9). */
const WORSEN_FACTOR = 1.25;
/** Passages propres consécutifs pour acter la résolution d'un chantier (§1.3/§1.4). */
const RESOLVE_PASSES = 2;
/** Tours max qu'un chantier est tenu sans résolution avant d'en libérer un autre (§1.3). */
const MAX_FOCUS_LAPS = 5;
/** Occurrences d'une même erreur avant de parler en mode Course (§8). */
const ESCALATION_MIN = 3;

// ── Mode rigoureux : verdict mesuré ───────────────────────────────────────────
/** Passages mémorisés par virage (la base « avant » du verdict). */
export const SAMPLES_MAX = 12;
/** Passages « après » minimaux avant de juger. */
export const VERDICT_MIN_AFTER = 3;
/** Passages « après » au-delà desquels un conseil sans effet est déclaré inchangé. */
export const VERDICT_MAX_AFTER = 6;
/** Tours max d'attente d'un verdict (au-delà : non concluant, on libère). */
export const VERDICT_MAX_LAPS = 8;
/** |t| de Welch au-delà duquel l'écart est jugé réel. */
export const VERDICT_T = 2;
/** Écart moyen minimal pour parler de progrès / recul (s). */
export const VERDICT_MIN_DIFF_S = 0.05;
/** Plancher d'erreur-type (s) : deux passages identiques ne prouvent rien. */
const VERDICT_SE_FLOOR_S = 0.02;
/** Course, mode rigoureux : tours minimaux entre deux conseils. */
export const RACE_TIP_GAP_LAPS = 12;

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const variance = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1);
};

/**
 * Test de Welch : renvoie `(diff, t)` avec `diff = moyenne(après) − moyenne(avant)`
 * (négatif = plus rapide après le conseil).
 */
export function welch(before: number[], after: number[]): { diff: number; t: number } {
  const diff = mean(after) - mean(before);
  const se = Math.max(VERDICT_SE_FLOOR_S, Math.sqrt(variance(before) / before.length + variance(after) / after.length));
  return { diff, t: diff / se };
}

export type Verdict = "better" | "worse" | "unchanged" | null;

/** Verdict d'un conseil (null = pas encore assez de passages). */
export function judgeTip(before: number[], after: number[]): Verdict {
  if (before.length < VERDICT_MIN_AFTER || after.length < VERDICT_MIN_AFTER) return null;
  const { diff, t } = welch(before, after);
  if (Math.abs(t) >= VERDICT_T && Math.abs(diff) >= VERDICT_MIN_DIFF_S) return diff < 0 ? "better" : "worse";
  return after.length >= VERDICT_MAX_AFTER ? "unchanged" : null;
}

/** Mémorise le temps d'un passage mesuré (base « avant » des verdicts). */
function recordSample(st: CoachVoiceState, uid: string, dt: number | null): void {
  if (dt === null || !isFinite(dt)) return;
  const list = st.samples.get(uid) ?? [];
  list.push(dt);
  if (list.length > SAMPLES_MAX) list.shift();
  st.samples.set(uid, list);
}

/**
 * Mode rigoureux : un passage sur le chantier après le conseil. Alimente
 * « après » et rend le verdict quand il y a de quoi juger. Renvoie `true` si le
 * passage a été absorbé par le suivi (la pédagogie historique ne s'applique pas).
 */
function followTip(
  st: CoachVoiceState,
  m: CornerOutcome,
  elapsed: number,
  policy: ModePolicy,
): boolean {
  const f = st.focus;
  if (!st.rigor || !f || f.uid !== m.corner_uid || !f.before || !f.after) return false;
  if (m.dtVsRef !== null && isFinite(m.dtVsRef)) f.after.push(m.dtVsRef);
  const verdict = judgeTip(f.before, f.after);
  if (verdict === "better") {
    // « Mieux » : dixièmes repris (moyenne après vs avant), puis on libère.
    if (policy.positive && !st.pending) {
      const tenths = Math.max(1, Math.round(-welch(f.before, f.after).diff * 10));
      st.pending = { kind: "positive", corner: f.n, corner_uid: f.uid, tenths, queuedAt: elapsed };
    }
    st.focus = null;
  } else if (verdict === "worse") {
    // « Pire » : on retire le conseil et on n'y revient plus de la séance.
    if (!st.pending) st.pending = { kind: "worse", corner: f.n, corner_uid: f.uid, queuedAt: elapsed };
    st.closed.add(f.uid);
    st.focus = null;
  } else if (verdict === "unchanged") {
    // Sans effet : silence (pas de « bravo » ni de reproche), virage clos.
    st.closed.add(f.uid);
    st.focus = null;
  } else if (m.lapNum - f.sinceLap > VERDICT_MAX_LAPS) {
    st.focus = null; // non concluant : on libère sans juger
  }
  return true;
}

const keyOf = (uid: string, code: DiagCode) => `${uid}|${code}`;

/** Cadence dégressive §1.5 : passages requis depuis la dernière parole. */
function degressiveGap(spokenCount: number, degressive: boolean): number {
  if (!degressive) return 0; // pas de dégressivité → toujours éligible
  if (spokenCount <= 1) return 0; // passages 1-2 : systématique
  if (spokenCount === 2) return 1; // puis 1 sur 2
  if (spokenCount === 3) return 2; // puis 1 sur 3
  return Infinity; // au-delà : silence, on attend la validation
}

function newFocus(diag: CoachDiagnostic): Focus {
  return {
    uid: diag.corner_uid,
    n: diag.n,
    code: diag.code,
    sinceLap: diag.lapNum,
    spokenCount: 0,
    passesSinceSpoken: 0,
    worstDt: 0,
    cleanStreak: 0,
    spokenAtLeastOnce: false,
  };
}

/**
 * Met un diagnostic en attente de délivrance, sous réserve du focus unique en vol
 * et du budget (§9). Renvoie `true` si accepté. N'applique **pas** la pédagogie
 * (focus/dégressif) : c'est le rôle de `observeCorner`.
 *
 * `bypassRepeat` : sur le virage-chantier, la **cadence dégressive** (§1.5) fait
 * autorité — le budget est « modulé par le focus collant et le dégressif » (§9) —,
 * donc on n'applique **pas** le filet anti-répétition inter-tours (qui étoufferait
 * les « passages 1-2 systématiques »). Il reste actif pour les binaires/Course.
 */
function queueDiag(
  st: CoachVoiceState,
  diag: CoachDiagnostic,
  elapsed: number,
  policy: ModePolicy,
  bypassRepeat: boolean,
): boolean {
  if (st.pending) return false; // un seul conseil en vol (§1.3)
  if (st.spokenThisLap >= policy.budgetPerLap) return false; // budget §9
  // Course, mode rigoureux : un conseil au plus tous les 12 tours.
  if (st.rigor && policy.escalationOnly && diag.lapNum - st.lastRaceTipLap < RACE_TIP_GAP_LAPS) return false;
  // Anti-répétition backstop : même virage×diagnostic dans les 2 derniers tours,
  // sauf aggravation nette (filet pour les binaires/Course, hors chantier collant).
  if (!bypassRepeat) {
    const prev = st.lastByKey.get(keyOf(diag.corner_uid, diag.code));
    if (
      prev &&
      diag.lapNum - prev.lapNum < REPEAT_LAP_GAP &&
      diag.magnitude <= prev.magnitude * WORSEN_FACTOR
    ) {
      return false;
    }
  }
  st.pending = { kind: "diag", diag, queuedAt: elapsed };
  if (st.rigor && policy.escalationOnly) st.lastRaceTipLap = diag.lapNum;
  return true;
}

/** Met un renforcement positif (§1.4) en attente de délivrance. */
function queuePositive(
  st: CoachVoiceState,
  f: Focus,
  currentDt: number,
  elapsed: number,
  policy: ModePolicy,
): void {
  if (st.pending) return;
  if (st.spokenThisLap >= policy.budgetPerLap) return;
  const tenths = Math.round((f.worstDt - currentDt) * 10);
  st.pending = {
    kind: "positive",
    corner: f.n,
    corner_uid: f.uid,
    tenths: Math.max(0, tenths),
    queuedAt: elapsed,
  };
}

/** Un passage propre du chantier (§1.3/§1.4) : résolution → validation positive. */
function onCleanPass(
  st: CoachVoiceState,
  m: CornerOutcome,
  elapsed: number,
  policy: ModePolicy,
): void {
  if (followTip(st, m, elapsed, policy)) return;
  const f = st.focus;
  if (!f || f.uid !== m.corner_uid) return; // seul le chantier nous intéresse
  f.passesSinceSpoken++;
  if (!f.spokenAtLeastOnce) return; // rien à valider si on n'a jamais parlé
  f.cleanStreak++;
  if (f.cleanStreak < RESOLVE_PASSES) return;
  // Résolution confirmée → renforcement positif (§1.4) puis libère le chantier.
  if (policy.positive) queuePositive(st, f, m.dtVsRef ?? 0, elapsed, policy);
  st.focus = null;
}

/** Practice (§1) : focus collant + dégressif ; binaires (sécurité) hors focus. */
function onDiagPractice(
  st: CoachVoiceState,
  diag: CoachDiagnostic,
  dtVsRef: number | null,
  elapsed: number,
  policy: ModePolicy,
): void {
  // Événement binaire (blocage/patinage) = sécurité ponctuelle : prononcé hors
  // focus (ne casse pas le chantier en cours), soumis au budget + anti-répétition.
  if (diag.code === "lockup" || diag.code === "wheelspin") {
    queueDiag(st, diag, elapsed, policy, false);
    return;
  }
  // Mode rigoureux : un virage clos ne reçoit plus de conseil ; un conseil en
  // cours de vérification n'est pas répété (le passage nourrit le verdict).
  if (st.rigor && st.closed.has(diag.corner_uid)) return;
  if (
    followTip(
      st,
      { corner_uid: diag.corner_uid, n: diag.n, lapNum: diag.lapNum, dtVsRef },
      elapsed,
      policy,
    )
  )
    return;

  if (!st.focus) {
    // Adopte ce virage comme chantier (§1.3). Le moteur l'a déjà confirmé (2 passages).
    st.focus = newFocus(diag);
  } else if (st.focus.uid !== diag.corner_uid) {
    return; // focus collant : on ne zappe pas vers un autre virage
  } else if (st.focus.code !== diag.code) {
    // Même virage, nouvelle cause dominante → reformulation : on repart à zéro.
    st.focus.code = diag.code;
    st.focus.spokenCount = 0;
    st.focus.passesSinceSpoken = 0;
  }

  const f = st.focus;
  f.cleanStreak = 0; // un passage fautif casse la série propre
  if (dtVsRef !== null) f.worstDt = Math.max(f.worstDt, dtVsRef);

  // Cadence dégressive §1.5.
  const gap = degressiveGap(f.spokenCount, policy.degressive);
  if (!isFinite(gap)) return; // phase silence → on attend la validation
  if (f.passesSinceSpoken < gap) {
    f.passesSinceSpoken++;
    return;
  }
  if (queueDiag(st, diag, elapsed, policy, true)) {
    // Mode rigoureux : 1ʳᵉ parole → on fige « avant » (tous les passages mesurés
    // du virage, bons et mauvais) et on annonce la vérification. Sans assez de
    // mesures, on retombe sur la pédagogie historique (série propre).
    const base = st.samples.get(f.uid) ?? [];
    if (st.rigor && !f.spokenAtLeastOnce && base.length >= VERDICT_MIN_AFTER && st.pending?.kind === "diag") {
      st.pending.before = [...base];
    }
    f.spokenCount++;
    f.passesSinceSpoken = 0;
    f.spokenAtLeastOnce = true;
  } else {
    f.passesSinceSpoken++; // pas pu parler (budget/vol) → le passage compte quand même
  }
}

/** Verdict d'un virage réduit à ce dont la pédagogie a besoin (§1.3-1.5). */
export interface CornerOutcome {
  corner_uid: string;
  n: number;
  lapNum: number;
  /** Δt vs réf sur la fenêtre (s, + = plus lent) ; `null` sans réf temps. */
  dtVsRef: number | null;
}

/**
 * Traite la clôture d'un virage (§1.3-1.5 + §8) : met à jour le focus collant, la
 * cadence dégressive et, à la résolution, prépare le renforcement positif. Le
 * message éventuellement retenu part en attente de sa fenêtre de délivrance
 * (`stepCoachVoice`). Remplace `pushCoachVoice` (P2.2) qui ne gérait que les
 * diagnostics, sans pédagogie ni modes.
 */
export function observeCorner(
  st: CoachVoiceState,
  m: CornerOutcome,
  result: DiagResult,
  elapsed: number,
  policy: ModePolicy,
): void {
  // Bascule de tour → réinitialise le budget.
  if (m.lapNum !== st.lapNum) {
    st.lapNum = m.lapNum;
    st.spokenThisLap = 0;
  }
  // Péremption du chantier : tenu trop longtemps sans résolution → on en libère un.
  // (Mode rigoureux : un chantier en vérification a son propre délai, `followTip`.)
  const verifying = st.rigor && !!st.focus?.before;
  if (st.focus && !verifying && m.lapNum - st.focus.sinceLap > MAX_FOCUS_LAPS) st.focus = null;

  if (result.kind === "muted") return; // mesure douteuse : n'influence pas la pédagogie
  if (result.kind === "none") {
    onCleanPass(st, m, elapsed, policy);
    recordSample(st, m.corner_uid, m.dtVsRef);
    return;
  }
  recordSample(st, m.corner_uid, m.dtVsRef);

  // result.kind === "diagnostic"
  const diag = result.diag;
  // (le passage fautif est mémorisé après la pédagogie : la base « avant » d'un
  // conseil inclut le passage qui l'a déclenché, pas l'inverse.)
  const occKey = keyOf(diag.corner_uid, diag.code);
  st.occurrences.set(occKey, (st.occurrences.get(occKey) ?? 0) + 1);

  if (!policy.live) return; // Qualif : pas de coaching en roulage (débrief out-lap = P4)

  if (policy.escalationOnly) {
    // Course : seulement une erreur répétée coûteuse (≥ 3×), sans focus/positif (§8).
    if ((st.occurrences.get(occKey) ?? 0) < ESCALATION_MIN) return;
    queueDiag(st, diag, elapsed, policy, false);
    return;
  }

  onDiagPractice(st, diag, m.dtVsRef, elapsed, policy);
}

// ── 3. Ordonnanceur : fenêtre de délivrance ───────────────────────────────────

/** Contexte de trame minimal pour l'évaluation de la fenêtre de délivrance. */
export interface DeliveryFrame {
  /** Gaz courant (%). */
  throttle: number;
  /** Vitesse courante (km/h). */
  speed: number;
  /** Distance curviligne courante (m). */
  dist: number;
  /** Horloge sim (s) — monotone, pas `Date.now()`. */
  elapsed: number;
}

/**
 * La trame est-elle dans une **fenêtre calme** (§1.1) : sortie de virage finie
 * (gaz au plancher) **et** prochain freinage assez loin pour qu'un message court
 * se termine avant l'appui frein.
 *
 * `trackLengthM` : longueur du tour (m). Indispensable une fois la **dernière**
 * fenêtre du tour franchie : le prochain freinage est alors le **premier virage
 * du tour suivant**, de l'autre côté de la ligne. Sans lui, la fin de la ligne
 * droite des stands était considérée « calme à l'infini » et un conseil pouvait
 * démarrer juste avant la ligne pour se terminer dans le freinage du virage 1
 * (La Source à Spa, Turn 1 à Sebring ou Bahreïn).
 *
 * Exporté pour que les canaux secondaires (relais, risque, drill, rappel) soient
 * soumis à la **même** contrainte que le coach par virage : §1.1 vaut pour toute
 * parole du coach, pas seulement pour les diagnostics.
 */
export function isCalmWindow(
  frame: DeliveryFrame,
  windows: CoachWindow[],
  nextWin: number,
  trackLengthM = 0,
): boolean {
  let distToBrake: number;
  if (nextWin < windows.length) {
    distToBrake = windows[nextWin].brakeDist - frame.dist;
  } else if (windows.length > 0 && trackLengthM > 0) {
    // Bouclage : premier virage du tour suivant.
    distToBrake = windows[0].brakeDist + trackLengthM - frame.dist;
  } else {
    // Aucune fenêtre connue (mode Découverte) → pas de contrainte de freinage.
    distToBrake = Infinity;
  }

  const speedMs = frame.speed / 3.6;
  const timeToBrake =
    distToBrake <= 0 ? 0 : speedMs > 1 ? distToBrake / speedMs : Infinity;

  return frame.throttle >= THROTTLE_CALM_PCT && timeToBrake >= TTS_EST_S + LEAD_S;
}

/** Suffixe i18n + variables d'un renforcement positif §1.4. */
function voiceKeyForPositive(
  tenths: number,
  corner: number,
): { suffix: string; vars: Record<string, string | number>; kind: CoachMsgKind } {
  return tenths > 0
    ? { suffix: "vCornerResolved", vars: { n: corner, d: tenths }, kind: "resolved" }
    : { suffix: "vCornerClean", vars: { n: corner }, kind: "clean" };
}

/**
 * Évalue la fenêtre de délivrance pour le message en attente. À appeler à chaque
 * trame. Renvoie le message à **prononcer maintenant** (et vide `pending`), ou
 * `null` (rien à dire / fenêtre pas encore ouverte / abandon pour péremption).
 *
 * `windows`/`nextWin` viennent du moteur : `windows[nextWin]` est le **prochain**
 * virage (sa distance de freinage borne la fenêtre calme).
 */
export function stepCoachVoice(
  st: CoachVoiceState,
  frame: DeliveryFrame,
  windows: CoachWindow[],
  nextWin: number,
  trackLengthM = 0,
): CoachVoiceMsg | null {
  const p = st.pending;
  if (!p) return null;

  // Fraîcheur : au-delà de la fenêtre, le conseil est périmé → on abandonne.
  if (frame.elapsed - p.queuedAt > FRESH_MAX_S) {
    st.pending = null;
    return null;
  }

  if (!isCalmWindow(frame, windows, nextWin, trackLengthM)) return null;

  // Fenêtre ouverte → on délivre.
  st.pending = null;
  st.spokenThisLap++;

  if (p.kind === "worse") {
    return {
      suffix: "vCornerWorse",
      vars: { n: p.corner },
      kind: "worse",
      corner: p.corner,
      corner_uid: p.corner_uid,
      magnitude: 0,
      unit: "",
      sign: 0,
      positive: false,
    };
  }

  if (p.kind === "positive") {
    const { suffix, vars, kind } = voiceKeyForPositive(p.tenths, p.corner);
    return {
      suffix,
      vars,
      kind,
      corner: p.corner,
      corner_uid: p.corner_uid,
      magnitude: p.tenths / 10,
      unit: p.tenths > 0 ? "s" : "",
      sign: -1,
      positive: true,
    };
  }

  const diag = p.diag;
  // Mode rigoureux : le conseil est réellement dit → la vérification commence.
  const follow = !!p.before && st.focus?.uid === diag.corner_uid;
  if (follow && st.focus) {
    st.focus.before = p.before;
    st.focus.after = [];
    st.focus.sinceLap = diag.lapNum;
  }
  st.lastByKey.set(keyOf(diag.corner_uid, diag.code), {
    lapNum: diag.lapNum,
    magnitude: diag.magnitude,
  });
  const { suffix, vars } = voiceKeyForDiag(diag);
  return {
    suffix,
    vars,
    kind: diag.code,
    corner: diag.n,
    corner_uid: diag.corner_uid,
    magnitude: diag.magnitude,
    unit: diag.unit,
    sign: diag.sign,
    positive: false,
    follow,
  };
}
