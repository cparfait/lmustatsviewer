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
import type { RecordOverviewRow, SessionDetail } from "../../api";
import { addLapLink, type LapLinks } from "../lapLinks";

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
  /** Rempli avec temps → session (temps cliquables dans la réponse). */
  links?: LapLinks;
}): Promise<string> {
  const { track, car, trackCourse, currentSessionId, currentBest, links } = args;
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
  if (links) {
    for (const p of pts) {
      if (p.session_id !== currentSessionId) addLapLink(links, p.best_lap, p.session_id, `${day(p.timestamp)} · ${p.session_type} · ${car}`);
    }
  }
  const hasHistory =
    currentSessionId != null
      ? pts.some((p) => p.session_id !== currentSessionId)
      : pts.length > 0;
  if (!hasHistory) return "";

  const st = prog.stats;
  // Dernier PB, daté par rapport à la session analysée (pas à aujourd'hui : on peut
  // relire une vieille session — « no PB for 88 days » alors qu'elle EST le PB).
  const lastPb = [...pts].reverse().find((p) => p.is_pb) ?? null;
  const current = currentSessionId != null ? pts.find((p) => p.session_id === currentSessionId) ?? null : null;
  const pbIsCurrent = !!lastPb && !!current && lastPb.session_id === current.session_id;
  const daysBetween = (a: number, b: number) => Math.round((b - a) / 86400);
  const lastPbText = !lastPb
    ? ""
    : pbIsCurrent
      ? "set in this session"
      : current
        ? `${day(lastPb.timestamp)} (${daysBetween(lastPb.timestamp, current.timestamp)} days before this session)`
        : st.days_since_pb != null
          ? `${day(lastPb.timestamp)} (${st.days_since_pb} days ago)`
          : day(lastPb.timestamp);
  const lines: string[] = [];
  lines.push("## Driver history on this combo (local database)");
  lines.push(
    `Combo: ${track}${trackCourse ? ` (${trackCourse})` : ""} — ${car} · ${st.sessions_count} sessions on record`,
  );
  lines.push(
    `All-time PB: ${formatTime(st.all_time_pb)} · PB improvements: ${st.nb_pb}` +
      (lastPbText ? ` · last PB: ${lastPbText}` : ""),
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
        ? p.is_pb
          ? "  ← this session (PB)"
          : "  ← this session"
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
        (pbIsCurrent ? " · this session set a PB" : lastPbText ? ` · last PB: ${lastPbText}` : "") +
        ".",
    );
  }

  return lines.join("\n");
}

/**
 * Records du pilote sur ce circuit, **toutes voitures** (une ligne par voiture).
 * Sans elle, le coach ne voyait que la voiture de la session : à « je fais mieux
 * en BMW qu'en Mercedes à Spa ? », il répondait n'avoir aucune donnée Mercedes
 * malgré des dizaines de sessions en base. "" si seule la voiture courante y a roulé.
 */
export function trackOtherCarsText(
  rows: RecordOverviewRow[],
  track: string,
  currentCar: string,
  links?: LapLinks,
  currentSessionId?: number,
): string {
  const here = rows
    .filter((r) => r.track === track && r.best_lap > 0)
    .sort((a, b) => a.best_lap - b.best_lap);
  if (!here.some((r) => r.car !== currentCar)) return "";
  const lines = [
    `## Your records on ${track} — every car you drove here (local database)`,
    "(all-time best lap per car; use this to compare cars on this track)",
  ];
  for (const r of here) {
    if (links && r.record_session_id !== currentSessionId) {
      addLapLink(links, r.best_lap, r.record_session_id, `${day(r.record_date)} · ${r.car}`);
    }
    const layout = r.track_course && r.track_course !== r.track ? ` (${r.track_course})` : "";
    lines.push(
      `${r.car} · ${r.car_class}${layout}: ${formatTime(r.best_lap)} · ${r.sessions_count} sessions` +
        (r.car === currentCar ? "  ← car of this session" : ""),
    );
  }
  return lines.join("\n");
}

/** Variante post-course : extrait la clé combo d'un `SessionDetail`. */
export async function buildDriverHistoryText(detail: SessionDetail, links?: LapLinks): Promise<string> {
  const player = detail.results.find((r) => r.is_player);
  const car = player?.unique_car_name || player?.car_type || "";
  if (!player || !car) return "";
  const [combo, others] = await Promise.all([
    buildComboHistoryText({
      track: detail.session.track,
      trackCourse: detail.session.track_course || undefined,
      car,
      currentSessionId: detail.session.id,
      currentBest: player.best_lap,
      links,
    }),
    records
      .getOverview()
      .then((rows) => trackOtherCarsText(rows, detail.session.track, car, links, detail.session.id))
      .catch(() => ""),
  ]);
  return [combo, others].filter(Boolean).join("\n\n");
}
