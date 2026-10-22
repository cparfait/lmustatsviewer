/**
 * Suite « analyse et suivi » (veille 2026-10-21) : tours officiels et tours de pause,
 * pastilles de constance, cartes du débrief, preuves de zone de freinage, objectifs de
 * la semaine, type de session lu dans le nom du fichier, et garde-fou contre les
 * secteurs inventés (aucune constante « un tiers » dans le code de production).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { section, eq, approx, ok } from "../assert";
import type { LapRow, SessionDetail, TelemetryLapInfo } from "@/lib/api";
import { fastestOfficialLap, lapStatuses, pauseLaps } from "@/lib/telemetry/officialLaps";
import { consistencyDots, progression } from "@/lib/consistency";
import { computeDebrief } from "@/lib/debrief/compute";
import { confidenceFromLaps, debriefCards } from "@/lib/debrief/cards";
import { brakeZoneEvidence } from "@/lib/telemetry/brakeZone";
import { detectCorners } from "@/lib/telemetry/corners";
import { CHANNELS } from "@/lib/coach/windows";
import { rebuildRefCorners } from "@/lib/coach/capture";
import type { CoachRef } from "@/lib/api";
import { goalRatio, parseGoal, weekStart } from "@/lib/weeklyGoals";
import { sessionTypeFromFile } from "@/lib/ai/context/session-telemetry";

const tl = (lap: number, game: number | null, valid: boolean | null, duration = game ?? 100): TelemetryLapInfo => ({
  lap,
  start_time: 0,
  end_time: duration,
  duration,
  game_time: game,
  valid,
  s1: null,
  s2: null,
  s3: null,
});

const lr = (n: number, t: number | null, o: Partial<LapRow> = {}): LapRow => ({
  driver_name: "Me",
  lap_num: n,
  position: 1,
  lap_time: t,
  s1: t != null ? 30 : null,
  s2: t != null ? 30 : null,
  s3: t != null ? t - 60 : null,
  top_speed: null,
  fuel: null,
  fuel_used: null,
  twfl: null,
  twfr: null,
  twrl: null,
  twrr: null,
  fcompound: "",
  rcompound: "",
  is_pit: false,
  is_valid: true,
  et: null,
  ...o,
});

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "testkit" && name !== "target") walk(p, out);
    } else if (/\.(ts|tsx|rs)$/.test(name)) out.push(p);
  }
}

export function run(): void {
  section("analyse — tours officiels de la télémétrie");
  // Course de Spa : tour de sortie, tour annulé, dernier segment non bouclé.
  const spa = [tl(0, 180.159, true, 246.8), tl(1, 151.36, true), tl(2, null, false, 167.5), tl(3, 162.377, true), tl(4, 148.886, true), tl(5, null, null, 21)];
  eq(fastestOfficialLap(spa)?.lap, 4, "tour le plus rapide = chrono officiel, pas une durée de segment");
  const withSectors = spa.map((l) => (l.lap === 1 || l.lap === 3 ? { ...l, s1: 40, s2: 60, s3: 50 } : l));
  eq(fastestOfficialLap(withSectors)?.lap, 1, "tours aux 3 secteurs d'abord (règle des résultats)");
  const st = lapStatuses(spa);
  eq([st.get(2), st.get(5), st.get(4)], ["invalid", "partial", "valid"], "statuts annulé / non bouclé / valide");
  const paused = [tl(0, 95, true), tl(1, 90, true), tl(2, 91, true), tl(3, 600, true), tl(4, 90.5, true)];
  eq([...pauseLaps(paused)], [3], "tour de 600 s parmi des tours de 90 s = pause");
  eq(fastestOfficialLap([tl(0, 900, true), tl(1, 950, true), tl(2, 70, true)])?.lap, 2, "peu de tours : pas de pause");
  eq(pauseLaps([tl(0, 90, true), tl(1, 91, true)]).size, 0, "moins de 3 tours : rien");

  section("analyse — pastilles de constance");
  const laps = [lr(1, 99), lr(2, 91), lr(3, 90), lr(4, 90.7), lr(5, 91.4), lr(6, 93), lr(7, 89, { is_pit: true }), lr(8, null, { is_valid: false })];
  const d = consistencyDots(laps);
  ok(d != null, "pastilles calculées");
  if (d) {
    eq(d.total, 5, "tour 1, stands et tour annulé exclus");
    eq(d.dots.map((x) => x.color), ["yellow", "green", "green", "yellow", "red"], "vert ≤ 0,8 s, jaune ≤ 1,6 s, rouge au-delà");
    eq(d.green, 2, "2 tours verts");
  }
  const p = progression(laps);
  eq(p?.bestLap, 3, "meilleur tour = tour 3");
  eq(p?.firstLap, 2, "premier tour lancé = tour 2");
  approx(p?.gain ?? 0, 1, 1e-9, "1 s gagnée depuis le premier tour lancé");
  eq(progression([lr(1, 95), lr(2, 90), lr(3, 91)])?.gain, null, "meilleur dès le premier tour lancé : pas de gain");
  eq(consistencyDots([lr(1, 90), lr(2, 90)]), null, "un seul tour lancé : rien");
  // Spa : le tour 5 est plus rapide mais sans S2 → le meilleur reste le tour 2 (règle §3).
  const spaLaps = [lr(1, 180.159), lr(2, 151.36), lr(3, null, { is_valid: false }), lr(4, 162.377), lr(5, 148.886, { s2: null, s3: null })];
  eq(progression(spaLaps)?.bestLap, 2, "meilleur tour = tour 2 (3 secteurs connus), comme le reste de l'appli");
  eq(consistencyDots(spaLaps)?.dots.map((x) => x.color), ["green", "red", "green"], "tour plus rapide sans secteurs : vert");

  section("analyse — cartes du débrief");
  eq([confidenceFromLaps(9, 8, 5), confidenceFromLaps(5, 8, 5), confidenceFromLaps(2, 8, 5)], ["high", "medium", "low"], "confiance selon le nombre de tours");
  const myLaps = [1, 2, 3, 4, 5, 6].map((n) => lr(n, 90 + (n === 4 ? 0.9 : 0), { s2: n === 4 ? 30.9 : 30, s3: 30, s1: 30 }));
  myLaps.forEach((l) => (l.lap_time = (l.s1 ?? 0) + (l.s2 ?? 0) + (l.s3 ?? 0)));
  const detail = {
    session: { id: 1, session_type: "Practice1", track: "X", track_course: "X", timestamp: 0 },
    results: [{ driver_name: "Me", is_player: true, car_class: "GT3", class_position: 1, position: 1, class_grid_pos: 0, finish_status: "", best_lap: 90, optimal_lap: 90, laps_count: 6, pitstops: 0 }],
    laps: myLaps,
    stream: [
      { event_type: "TrackLimits", et: 10, text: "1|0|1|Me|Invalid" },
      { event_type: "TrackLimits", et: 200, text: "1|0|1|Me|Invalid" },
      { event_type: "TrackLimits", et: 400, text: "1|0|1|Me|Invalid" },
    ],
  } as unknown as SessionDetail;
  myLaps.forEach((l, i) => (l.et = i * 90));
  const deb = computeDebrief(detail);
  ok(deb != null, "débrief calculé");
  if (deb) {
    const cards = debriefCards(detail, deb);
    eq(cards.map((c) => c.family), deb.families.map((f) => f.family), "une carte par famille retenue, rien de plus");
    const tlc = cards.find((c) => c.family === "trackLimits");
    eq(tlc?.focusLap, 1, "limites : premier tour concerné");
    eq(tlc?.confidence, "high", "événements comptés = confiance élevée");
  }

  section("analyse — zone de freinage");
  const dist = Array.from({ length: 101 }, (_, i) => i * 10);
  const cur = { dist, speed: dist.map((x) => (x < 500 ? 250 : x < 600 ? 120 : 200)), brake: dist.map((x) => (x >= 430 && x < 500 ? 90 : 0)) };
  const ref = { dist, speed: dist.map((x) => (x < 500 ? 250 : x < 600 ? 125 : 210)), brake: dist.map((x) => (x >= 450 && x < 500 ? 90 : 0)) };
  const bz = brakeZoneEvidence({ brakeDist: 430, apexDist: 550, minSpeed: 120, refMinSpeed: 125, timeLost: 0.2 }, cur, ref);
  eq(bz.refBrakeDist, 450, "la référence freine 20 m plus tard");
  eq([bz.exitSpeed, bz.refExitSpeed], [200, 210], "vitesse de sortie lue 100 m après l'apex");
  eq(brakeZoneEvidence({ brakeDist: 430, apexDist: 550, minSpeed: 120, refMinSpeed: null, timeLost: null }, cur, null).refBrakeDist, null, "sans référence : rien d'inventé");

  section("analyse — virages détectés quelle que soit la résolution");
  // Tour synthétique de 6 km : 5 virages (creux de 250 à 100 km/h sur 300 m).
  const lapAt = (n: number) => {
    const dist = Array.from({ length: n }, (_, i) => (i * 6000) / (n - 1));
    const apexes = [800, 1900, 3000, 4100, 5200];
    const speed = dist.map((x) => {
      const dd = Math.min(...apexes.map((a) => Math.abs(x - a)));
      return dd < 300 ? 100 + (150 * dd) / 300 : 250;
    });
    const brake = dist.map((x) => (apexes.some((a) => x > a - 250 && x < a - 50) ? 80 : 0));
    return detectCorners(speed, brake, dist).length;
  };
  eq([lapAt(1000), lapAt(4000), lapAt(15000)], [5, 5, 5], "même nombre de virages à 1 000, 4 000 et 15 000 points");

  section("analyse — détection fine des virages");
  // Virage lent à réaccélération progressive (+6 km/h tous les 100 m) : la vitesse ne
  // remonte que de ~4 km/h dans ±72 m, mais de 9 km/h dans ±150 m.
  const slowExit = (n: number, fine: boolean) => {
    const dist = Array.from({ length: n }, (_, i) => (i * 3000) / (n - 1));
    const speed = dist.map((x) => (x < 1400 ? 240 - Math.max(0, x - 1000) * 0.35 : 100 + (x - 1400) * 0.06));
    const brake = dist.map((x) => (x > 1000 && x < 1300 ? 80 : 0));
    return detectCorners(speed, brake, dist, { fine }).length;
  };
  eq([slowExit(1000, false), slowExit(4000, false)], [0, 0], "standard : virage à sortie lente ignoré (comportement d'origine)");
  eq([slowExit(1000, true), slowExit(4000, true)], [1, 1], "fine : virage trouvé, quelle que soit la résolution");
  eq([lapAt(1000), lapAt(4000)].map((x) => x), [5, 5], "virages nets : inchangés");

  section("analyse — détection fine dans le coach en direct (réf convertie)");
  // Réf dense (grille 4 m) : 3 virages nets + 1 virage lent à sortie progressive.
  const nPts = 1501;
  const g = Array.from({ length: nPts }, (_, i) => i * 4);
  const sharp = [700, 2600, 4300];
  const speedR = g.map((x) => {
    if (x >= 1000 && x < 1400) return 240 - (x - 1000) * 0.35;
    if (x >= 1400 && x < 2000) return Math.min(240, 100 + (x - 1400) * 0.06);
    const dd = Math.min(...sharp.map((a) => Math.abs(x - a)));
    return dd < 300 ? 100 + (140 * dd) / 300 : 240;
  });
  const series: Record<string, number[]> = {
    time: g.map((x) => x / 50),
    speed: speedR,
    brake: g.map((x) => (sharp.some((a) => x > a - 250 && x < a - 50) || (x > 1000 && x < 1300) ? 80 : 0)),
    throttle: g.map(() => 100),
    steer: g.map(() => 0),
    gLat: g.map(() => 0),
    gLong: g.map(() => 0),
    gear: g.map(() => 4),
  };
  const ref0: CoachRef = {
    id: 1, track: "T", car_model: "C", car_class: "GT3", kind: "best", created_at: 0, game_build: "", lap_time: 120,
    step_m: 4, n_points: nPts, meta_json: "{}", channels: CHANNELS.flatMap((c) => series[c]), corners: [],
  };
  const stored = rebuildRefCorners(ref0, {});
  const ref1: CoachRef = { ...ref0, corners: stored };
  const fineRows = rebuildRefCorners(ref1, { fine: true });
  eq([stored.length, fineRows.length], [3, 4], "réf convertie : le virage lent s'ajoute aux 3 virages enregistrés");
  ok(stored.every((s) => fineRows.some((f) => f.corner_uid === s.corner_uid)), "virages connus : même identité (historique conservé)");
  eq(new Set(fineRows.map((r) => r.corner_uid)).size, fineRows.length, "identités uniques");
  eq(rebuildRefCorners({ ...ref1, n_points: 5, channels: [] }, { fine: true }), stored, "réf illisible : fenêtres d'origine");

  section("analyse — objectifs de la semaine");
  const ws = new Date(weekStart(new Date(2026, 9, 21, 15, 30)) * 1000);
  eq([ws.getDay(), ws.getDate(), ws.getHours()], [1, 19, 0], "mercredi 21 → lundi 19, 0 h");
  eq(new Date(weekStart(new Date(2026, 9, 25, 23, 0)) * 1000).getDate(), 19, "dimanche → lundi de la même semaine");
  eq([parseGoal("races", "5"), parseGoal("races", ""), parseGoal("laps", "-4"), parseGoal("laps", "99999")], [5, 3, 0, 5000], "cibles bornées, défaut si vide");
  eq([goalRatio(2, 4), goalRatio(9, 4), goalRatio(1, 0)], [0.5, 1, 1], "avancement borné");

  section("analyse — type de session du nom de fichier");
  const f = (session_type: string, filename: string) => sessionTypeFromFile({ session_type, filename });
  eq(f("", "Spa_R_2026-06-08T20_30_01Z.duckdb"), "Race", "métadonnée vide → nom du fichier");
  eq(f("Practice", "Spa_Q_2026-06-08T20_30_01Z.duckdb"), "Qualify", "« Practice » par défaut → nom du fichier");
  eq(f("Race", "Spa_Q_2026-06-08T20_30_01Z.duckdb"), "Race", "métadonnée explicite conservée");
  eq(f("Practice", "Spa_P_2026-06-08T20_30_01Z.duckdb"), "Practice", "essais confirmés");
  eq(f("", "x.duckdb"), "", "nom sans repère : rien d'inventé");

  section("analyse — aucun secteur inventé");
  const files: string[] = [];
  for (const dir of ["src", "src-tauri/src"]) {
    try {
      walk(dir, files);
    } catch {
      /* dossier absent (exécution hors racine) */
    }
  }
  ok(files.length > 50, "sources parcourues");
  const thirds = files.filter((p) => /(^|[^\d.])0\.(33\d*|66\d*|67)(?!\d)/.test(readFileSync(p, "utf8")));
  eq(thirds, [], "aucune constante « un tiers » (découpage en secteurs inventé) dans le code de production");
}
