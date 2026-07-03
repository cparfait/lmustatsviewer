/**
 * Mémoire longitudinale du pilote pour le Coach IA (post-course + télémétrie).
 *
 * Source = historique du combo circuit/voiture en SQLite (réutilise
 * `records::get_record_progression`, le même backend que la page Records).
 * Donne au coach ce qu'aucune session isolée ne contient : PB de tous les
 * temps, évolution récente, et faiblesse de secteur **récurrente** détectée en
 * code (le coach peut dire « 3ᵉ session de suite que tu perds en S3 ici »).
 *
 * Étiquettes EN compactes (cohérent avec les autres contextes). Renvoie ""
 * si le combo n'a pas d'autre session que celle-ci (pas d'historique utile).
 */

import { records } from "../../api";
import { formatTime, formatSectorSeconds } from "../../utils";
import type { SessionDetail } from "../../api";

/** Sessions récentes listées dans le contexte (au-delà : résumé via stats). */
const MAX_SESSIONS = 10;

function day(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/**
 * Historique d'un combo par clé directe (track + unique_car_name).
 * `trackCourse` : à omettre quand la nomenclature de layout n'est pas fiable
 * (télémétrie : « Paul Ricard - ELMS » ≠ « Paul Ricard - 1A-V2 » des résultats).
 * `currentSessionId` : marque la session dans la liste (page Détail de session).
 * `currentBest` : meilleur tour de la cible courante (s) pour le Δ vs PB.
 */
export async function buildComboHistoryText(args: {
  track: string;
  car: string;
  trackCourse?: string;
  currentSessionId?: number;
  currentBest?: number | null;
}): Promise<string> {
  const { track, car, trackCourse, currentSessionId, currentBest } = args;
  if (!track || !car) return "";

  let prog;
  try {
    prog = await records.getProgression({
      track,
      car,
      track_course: trackCourse || undefined,
    });
  } catch {
    return ""; // historique indisponible → contexte sans cette section
  }
  const pts = prog.points.filter((p) => p.best_lap > 0);
  const hasHistory =
    currentSessionId != null
      ? pts.some((p) => p.session_id !== currentSessionId)
      : pts.length > 0;
  if (!hasHistory) return "";

  const st = prog.stats;
  const lines: string[] = [];
  lines.push("## Driver history on this combo (local database)");
  lines.push(
    `Combo: ${track}${trackCourse ? ` (${trackCourse})` : ""} — ${car} · ${st.sessions_count} sessions on record`,
  );
  lines.push(
    `All-time PB: ${formatTime(st.all_time_pb)} · PB improvements: ${st.nb_pb}` +
      (st.days_since_pb != null ? ` · last PB ${st.days_since_pb} days ago` : ""),
  );
  if (currentBest && currentBest > 0) {
    const gap = currentBest - st.all_time_pb;
    lines.push(`Current best vs all-time PB: ${gap >= 0 ? "+" : ""}${gap.toFixed(3)}s`);
  }

  const recent = pts.slice(-MAX_SESSIONS);
  lines.push("");
  lines.push(`Recent sessions (oldest → newest, last ${recent.length}):`);
  for (const p of recent) {
    const tag =
      currentSessionId != null && p.session_id === currentSessionId
        ? "  ← this session"
        : p.is_pb
          ? "  (PB)"
          : "";
    lines.push(
      `${day(p.timestamp)} ${p.session_type}: ${formatTime(p.best_lap)} | S1 ${formatSectorSeconds(p.s1)} S2 ${formatSectorSeconds(p.s2)} S3 ${formatSectorSeconds(p.s3)}${tag}`,
    );
  }

  // Faiblesse récurrente : écart moyen de chaque secteur au meilleur secteur
  // jamais réalisé sur le combo, sur les sessions récentes (déterministe).
  const sector = (p: (typeof pts)[number], i: number) =>
    i === 0 ? p.s1 : i === 1 ? p.s2 : p.s3;
  const bestS = [0, 1, 2].map((i) =>
    Math.min(...pts.map((p) => sector(p, i) ?? Infinity)),
  );
  if (bestS.every((b) => isFinite(b) && b > 0)) {
    const gaps = [0, 0, 0];
    let n = 0;
    for (const p of recent) {
      const ss = [0, 1, 2].map((i) => sector(p, i));
      if (ss.some((x) => x == null || x <= 0)) continue;
      n++;
      for (let i = 0; i < 3; i++) gaps[i] += (ss[i] as number) - bestS[i];
    }
    if (n >= 3) {
      const avg = gaps.map((g) => g / n);
      const worst = avg.indexOf(Math.max(...avg));
      lines.push("");
      lines.push(
        `Sector trend (avg gap to combo-best sectors over ${n} recent sessions): ` +
          avg.map((g, i) => `S${i + 1} +${g.toFixed(3)}s`).join(" · "),
      );
      lines.push(
        `Recurring weakness: S${worst + 1} (largest average loss — check whether it repeats here).`,
      );
    }
  }

  // Tendance de progression (déterministe) : 3 dernières sessions vs 3 précédentes.
  // Donne au coach une « mémoire » de la trajectoire du pilote sur ce combo.
  const series = pts.map((p) => p.best_lap).filter((x) => x > 0);
  if (series.length >= 6) {
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const recentAvg = mean(series.slice(-3));
    const prevAvg = mean(series.slice(-6, -3));
    const diff = recentAvg - prevAvg; // négatif = plus rapide récemment
    const trend =
      diff < -0.1 ? "improving" : diff > 0.1 ? "regressing" : "plateau";
    lines.push("");
    lines.push(
      `Progress trend: ${trend} — last 3 sessions avg ${formatTime(recentAvg)} vs previous 3 ${formatTime(prevAvg)}` +
        (st.days_since_pb != null ? ` · no PB for ${st.days_since_pb} days` : "") +
        ".",
    );
  }

  return lines.join("\n");
}

/** Variante post-course : extrait la clé combo d'un `SessionDetail`. */
export async function buildDriverHistoryText(detail: SessionDetail): Promise<string> {
  const player = detail.results.find((r) => r.is_player);
  const car = player?.unique_car_name || player?.car_type || "";
  if (!player || !car) return "";
  return buildComboHistoryText({
    track: detail.session.track,
    trackCourse: detail.session.track_course || undefined,
    car,
    currentSessionId: detail.session.id,
    currentBest: player.best_lap,
  });
}
