/**
 * Progression par virage inter-sessions (COACH-LIVE-SPEC.md §11, P4.1) — module
 * **pur** (aucune dépendance React/Tauri), rejouable (§14).
 *
 * Deux rôles :
 *  1. **Accumuler** les passages propres d'une session (`SessionHistoryState`) et
 *     en tirer, au débrief, un **résumé par virage** (`CornerSessionStat`) :
 *       - **pace** = Δt **médian** vs réf (robuste aux tours aberrants) ;
 *       - **constance** = **IQR** des Δt (dispersion) ;
 *       - **taux de réussite** = % de passages « sous le seuil » (aucun diagnostic
 *         de rythme retenu) ;
 *       - **meilleur** Δt de la session.
 *     Ces résumés sont persistés (`toHistoryRows` → `coach_history_upsert`).
 *  2. **Agréger** l'historique chargé d'un combo (`buildProgression`) : dernière
 *     valeur par virage + **tendance** (pente de régression du Δt médian sur les
 *     dernières sessions ; < 0 = progrès) — matière du rappel inter-sessions et
 *     des objectifs (§11).
 *
 * Le Δt vs réf n'a de sens que **référence présente** : les passages sans réf
 * (Découverte) ou muets (§6) sont exclus.
 */

import type { CornerHistoryRow } from "@/lib/api";
import type { CornerMeasurement } from "./engine";
import type { DiagResult } from "./diagnostics";

/** Un passage propre mesuré, retenu pour la progression (§11). */
export interface CornerPass {
  corner_uid: string;
  n: number;
  /** Δt vs réf sur la fenêtre (s, + = plus lent). */
  dt: number;
  /** Passage « sous le seuil » (aucun diagnostic de rythme retenu). */
  success: boolean;
}

/** Accumulateur d'un virage sur la session courante. */
interface CornerAcc {
  n: number;
  dts: number[];
  successes: number;
  total: number;
}

export interface SessionHistoryState {
  corners: Map<string, CornerAcc>;
}

export function createSessionHistory(): SessionHistoryState {
  return { corners: new Map() };
}

/** Nombre de passages sous lequel un virage est trop bruité pour compter (§7). */
const MIN_PASSES = 3;
/** Fenêtre de tendance : sessions récentes considérées pour la pente (§11). */
const TREND_WINDOW = 5;

/**
 * Décide si une clôture de virage alimente la progression, et son verdict de
 * réussite. `null` = ne compte pas (pas de réf temps, muet, ou tour taint).
 * Le « succès » (§11) = le diagnostic n'a **pas** retenu de faute (`none`) — un
 * verdict `muted` (trafic/jaune…) sort de la statistique, il ne juge pas le pilote.
 */
export function passFromResult(
  m: CornerMeasurement,
  result: DiagResult,
): CornerPass | null {
  if (m.tainted) return null;
  if (m.dtVsRef === null || !isFinite(m.dtVsRef)) return null;
  if (result.kind === "muted") return null;
  return {
    corner_uid: m.corner_uid,
    n: m.n,
    dt: m.dtVsRef,
    success: result.kind === "none",
  };
}

/** Enregistre un passage dans l'accumulateur de session. */
export function recordPass(st: SessionHistoryState, pass: CornerPass): void {
  let a = st.corners.get(pass.corner_uid);
  if (!a) {
    a = { n: pass.n, dts: [], successes: 0, total: 0 };
    st.corners.set(pass.corner_uid, a);
  }
  a.n = pass.n; // identité stable par uid ; on garde le dernier numéro vu
  a.dts.push(pass.dt);
  a.total++;
  if (pass.success) a.successes++;
}

/** Nombre total de passages accumulés (seuil de déclenchement du débrief). */
export function totalPasses(st: SessionHistoryState): number {
  let s = 0;
  for (const a of st.corners.values()) s += a.total;
  return s;
}

// ── Statistiques robustes ─────────────────────────────────────────────────────

function sortedCopy(xs: number[]): number[] {
  return [...xs].sort((a, b) => a - b);
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = sortedCopy(xs);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Quantile à interpolation linéaire sur un tableau **déjà trié**. */
function quantileSorted(s: number[], q: number): number {
  if (!s.length) return 0;
  if (s.length === 1) return s[0];
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Écart interquartile (Q3 − Q1) — mesure de constance robuste. */
export function iqr(xs: number[]): number {
  if (xs.length < 2) return 0;
  const s = sortedCopy(xs);
  return quantileSorted(s, 0.75) - quantileSorted(s, 0.25);
}

// ── Résumé d'une session ──────────────────────────────────────────────────────

/** Résumé d'un virage sur une session. */
export interface CornerSessionStat {
  corner_uid: string;
  n: number;
  passes: number;
  medianDt: number;
  iqrDt: number;
  /** [0,1]. */
  successRate: number;
  bestDt: number;
}

/**
 * Résume la session : une entrée par virage suffisamment échantillonné
 * (≥ `MIN_PASSES`). Trié par n° de virage pour une écriture/lecture stable.
 */
export function summarizeSession(
  st: SessionHistoryState,
): CornerSessionStat[] {
  const out: CornerSessionStat[] = [];
  for (const [uid, a] of st.corners) {
    if (a.total < MIN_PASSES) continue;
    out.push({
      corner_uid: uid,
      n: a.n,
      passes: a.total,
      medianDt: median(a.dts),
      iqrDt: iqr(a.dts),
      successRate: a.successes / a.total,
      bestDt: Math.min(...a.dts),
    });
  }
  out.sort((x, y) => x.n - y.n);
  return out;
}

/** Convertit les résumés en lignes persistables (`session_at` fixé au backend). */
export function toHistoryRows(stats: CornerSessionStat[]): CornerHistoryRow[] {
  return stats.map((s) => ({
    corner_uid: s.corner_uid,
    n: s.n,
    session_at: 0,
    passes: s.passes,
    median_dt: s.medianDt,
    iqr_dt: s.iqrDt,
    success_rate: s.successRate,
    best_dt: s.bestDt,
  }));
}

// ── Progression inter-sessions ────────────────────────────────────────────────

/** Progression agrégée d'un virage sur son historique. */
export interface CornerProgress {
  corner_uid: string;
  n: number;
  /** Nombre de sessions enregistrées pour ce virage. */
  sessions: number;
  /** Δt médian de la dernière session (s). */
  latestMedianDt: number;
  /** IQR de la dernière session (constance). */
  latestIqrDt: number;
  /** Taux de réussite de la dernière session [0,1]. */
  latestSuccessRate: number;
  /** Pente du Δt médian sur les dernières sessions (s/session ; < 0 = progrès). */
  trend: number;
  /** Δt médian de la session précédente (gain session-à-session) ; `null` si < 2. */
  prevMedianDt: number | null;
}

/** Pente OLS de `ys` sur l'indice 0..n-1. 0 si < 2 points. */
export function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += ys[i];
    sxx += i * i;
    sxy += i * ys[i];
  }
  const d = n * sxx - sx * sx;
  if (d === 0) return 0;
  return (n * sxy - sx * sy) / d;
}

/**
 * Agrège l'historique chargé d'un combo en une progression par virage. Une ligne
 * par (virage × session) → on regroupe par `corner_uid`, trie par `session_at`
 * (on ne suppose pas l'ordre de la requête) et calcule la dernière valeur + la
 * tendance sur la fenêtre récente.
 */
export function buildProgression(rows: CornerHistoryRow[]): CornerProgress[] {
  const byUid = new Map<string, CornerHistoryRow[]>();
  for (const r of rows) {
    const g = byUid.get(r.corner_uid);
    if (g) g.push(r);
    else byUid.set(r.corner_uid, [r]);
  }
  const out: CornerProgress[] = [];
  for (const [uid, g] of byUid) {
    g.sort((a, b) => a.session_at - b.session_at);
    const last = g[g.length - 1];
    const prev = g.length >= 2 ? g[g.length - 2] : null;
    const window = g.slice(-TREND_WINDOW).map((r) => r.median_dt);
    out.push({
      corner_uid: uid,
      n: last.n,
      sessions: g.length,
      latestMedianDt: last.median_dt,
      latestIqrDt: last.iqr_dt,
      latestSuccessRate: last.success_rate,
      trend: slope(window),
      prevMedianDt: prev ? prev.median_dt : null,
    });
  }
  out.sort((x, y) => x.n - y.n);
  return out;
}
