/**
 * Suite « retours testeurs 1.0.9 » : positions annoncées dans la classe
 * (multiclasse), raisonnement des modèles « thinking » masqué, contexte live du
 * Coach IA sans fausses valeurs (S3 0.000, pneus à −273 °C).
 */

import { section, ok, eq } from "../assert";
import { scopedPosition } from "@/lib/livePosition";
import { brakeAvgLimits } from "@/lib/engineer/useRaceEngineer";
import { predictPitExit } from "@/lib/spotter";
import { stripThinking, ThinkingStreamFilter } from "@/lib/ai/thinking";
import { openaiProvider, openrouterProvider } from "@/lib/ai/providers/openai-compat";
import { buildLiveContext } from "@/lib/ai/context/live-context";
import { trackOtherCarsText } from "@/lib/ai/context/driver-history-context";
import { addLapLink, splitLapTimes, type LapLinks } from "@/lib/ai/lapLinks";
import { isHistoricalQuestion } from "@/lib/ai/context/records-context";
import type { LiveData, LiveStanding, RecordOverviewRow } from "@/lib/api";

const car = (o: Partial<LiveStanding>): LiveStanding =>
  ({
    is_player: false,
    in_pits: false,
    position: 0,
    class_position: 0,
    vehicle_class: "LMP3",
    time_behind_leader: 0,
    laps_behind_leader: 0,
    time_behind_next: 0,
    ...o,
  }) as LiveStanding;

export function run(): void {
  // Multiclasse : 2 Hypercars devant, le joueur 1er des LMP3 (P3 au général).
  const multi: LiveStanding[] = [
    car({ position: 1, class_position: 1, vehicle_class: "Hypercar", time_behind_leader: 0 }),
    car({ position: 2, class_position: 2, vehicle_class: "Hypercar", time_behind_leader: 4, time_behind_next: 4 }),
    car({ position: 3, class_position: 1, is_player: true, time_behind_leader: 30, time_behind_next: 26 }),
    car({ position: 4, class_position: 2, time_behind_leader: 30.8, time_behind_next: 0.8 }),
    car({ position: 5, class_position: 1, vehicle_class: "GT3", time_behind_leader: 40, time_behind_next: 9.2 }),
    car({ position: 6, class_position: 3, time_behind_leader: 50, time_behind_next: 10 }),
  ];

  section("livePosition.scopedPosition");
  {
    const c = scopedPosition(multi, true)!;
    eq(c.pos, 1, "classe : P1 LMP3 (et non P3 au général)");
    eq(c.cls, "LMP3", "classe renseignée");
    ok(c.ahead === null && c.gapLeader === null, "leader de classe : personne devant");
    ok(Math.abs((c.gapBehind ?? 0) - 0.8) < 1e-6, "poursuivant de classe à 0,8 s");
    const g = scopedPosition(multi, false)!;
    eq(g.pos, 3, "réglage désactivé : P3 au général (historique)");
    eq(g.cls, null, "pas de classe au général");
    eq(g.gapAhead, 26, "écart au précédent (général) fourni par le jeu");
    // Monoclasse : identique au général même avec le réglage.
    const mono = multi.filter((s) => s.vehicle_class === "LMP3").map((s, i) => ({ ...s, position: i + 1 }));
    eq(scopedPosition(mono, true)!.cls, null, "monoclasse : pas de suffixe de classe");
  }

  section("spotter.predictPitExit (classe)");
  {
    const d = { standings: multi } as unknown as LiveData;
    const p = predictPitExit(d, 15, true)!;
    eq(p.currentPos, 1, "position de classe");
    eq(p.lost, 1, "seule la LMP3 à 0,8 s passe devant (la GT3 à 10 s n'est pas un rival)");
    eq(p.newPos, 2, "ressort P2 de la classe");
    const g = predictPitExit(d, 15, false)!;
    eq(g.currentPos, 3, "général : comportement historique");
    eq(g.lost, 2, "général : la GT3 compte aussi");
  }

  section("engineer.brakeAvgLimits");
  eq(brakeAvgLimits("Hypercar").hot, 850, "Hypercar : carbone, 850 °C");
  eq(brakeAvgLimits("LMP2_ELMS").hot, 850, "LMP2 : carbone");
  eq(brakeAvgLimits("LMP3").hot, 750, "LMP3 : acier, 750 °C");
  eq(brakeAvgLimits("LMGT3").hot, 750, "LMGT3 : fonte, 750 °C");
  eq(brakeAvgLimits("").hot, 750, "classe inconnue : valeur d'origine");

  section("ai.thinking");
  eq(stripThinking("<think>brouillon</think>Réponse"), "Réponse", "bloc fermé retiré");
  eq(stripThinking("Réponse <think>suite non fermée"), "Réponse ", "bloc non fermé masque la suite");
  eq(stripThinking("raisonnement sans balise ouvrante</think>\nRéponse"), "Réponse", "fermante orpheline");
  eq(stripThinking("Écart < 1 s"), "Écart < 1 s", "un « < » ordinaire est conservé");
  {
    const f = new ThinkingStreamFilter();
    const out = ["<thi", "nk>abc</th", "ink>Bon", "jour"].map((c) => f.push(c)).join("");
    eq(out, "Bonjour", "flux : balises coupées entre fragments");
  }
  {
    const msgs = [{ role: "user" as const, content: "x" }];
    const quick = openrouterProvider.buildBody(msgs, "qwen/qwen3.5-35b-a3b", 300) as Record<string, unknown>;
    eq(JSON.stringify(quick.reasoning), '{"effort":"none"}', "OpenRouter : raisonnement coupé sur appel court");
    const stream = openrouterProvider.buildBody(msgs, "m", 4000, true) as Record<string, unknown>;
    ok(!("reasoning" in stream), "OpenRouter : raisonnement conservé en streaming (analyse)");
    const back = openrouterProvider.fallbackBody?.(quick) as Record<string, unknown> | null;
    eq(JSON.stringify(back?.reasoning), '{"effort":"low"}', "repli 400 sur « none » : raisonnement court (modèle à raisonnement obligatoire)");
    const back2 = openrouterProvider.fallbackBody?.(back) as Record<string, unknown> | null;
    ok(!!back2 && !("reasoning" in back2) && back2.model === "qwen/qwen3.5-35b-a3b", "« low » refusé aussi : même requête sans reasoning");
    ok(openaiProvider.fallbackBody?.(openaiProvider.buildBody(msgs, "m", 16)) === null, "OpenAI : pas de repli");
  }

  section("ai.history (autres voitures du circuit)");
  {
    const row = (car: string, best: number, n: number, track = "Spa"): RecordOverviewRow => ({
      track, track_course: track, car, car_type: car, car_class: "GT3", best_lap: best,
      best_lap_s1: null, best_lap_s2: null, best_lap_s3: null, optimal_lap: null, vmax: null,
      record_date: 0, game_version: "1.3", sessions_count: n,
    }) as RecordOverviewRow;
    const rows = [row("Mercedes-AMG LMGT3", 147.324, 28), row("BMW M4 LMGT3", 146.707, 10), row("Ferrari 296", 140, 3, "Monza")];
    const txt = trackOtherCarsText(rows, "Spa", "BMW M4 LMGT3");
    ok(txt.includes("Mercedes-AMG LMGT3") && txt.includes("28 sessions"), "Mercedes à Spa présente");
    ok(txt.includes("BMW M4 LMGT3 · GT3: 2:26.707") && txt.includes("← car of this session"), "voiture courante marquée");
    ok(!txt.includes("Ferrari"), "autre circuit exclu");
    eq(trackOtherCarsText([rows[1]], "Spa", "BMW M4 LMGT3"), "", "seule la voiture courante → rien");
    ok(isHistoricalQuestion("est ce que je fais mieux en bmw qu'en mercedes à SPA ?"), "« mieux » = question d'historique");
    ok(isHistoricalQuestion("Sono più veloce con la Ferrari?"), "italien couvert");
    ok(!isHistoricalQuestion("dois-je rentrer au stand ?"), "question courante : pas d'historique");

    const links: LapLinks = new Map();
    trackOtherCarsText(
      [{ ...rows[0], record_session_id: 41 }, { ...rows[1], record_session_id: 7 }],
      "Spa", "BMW M4 LMGT3", links, 7,
    );
    eq(links.get("2:27.324")?.sessionId, 41, "record Mercedes → sa session");
    ok(!links.has("2:26.707"), "session courante : pas de lien vers elle-même");
  }

  section("ai.lapLinks (temps cliquables)");
  {
    const links: LapLinks = new Map();
    addLapLink(links, 146.707, 12, "a");
    addLapLink(links, 150.5, 20, "b");
    addLapLink(links, 150.5, 21, "c");
    addLapLink(links, 146.707, 12, "a bis");
    const parts = splitLapTimes("PB 2:26.707 contre 2:30.500 et 2:31.000.", links);
    eq(parts.length, 3, "un seul temps relié");
    const link = parts[1];
    ok(typeof link !== "string" && link.time === "2:26.707" && link.link.sessionId === 12, "temps relié à sa session");
    ok(links.get("2:30.500") === null, "même temps, deux sessions → ambigu, pas de lien");
    eq(splitLapTimes("12:26.7071 et 22:26.707", links).length, 1, "morceau d'un nombre plus long ignoré");
    eq(splitLapTimes("2:26.707", undefined).length, 1, "sans table : texte intact");
  }

  section("ai.live-context (garage)");
  {
    const wheel = { wear: 100, temp: -273.15, pressure: 0, temp3: [0, 0, 0], brake_temp: -1 };
    const data = {
      connected: true,
      paused: false,
      session: { track: "Le Mans", session: 1, max_laps: 0, end_et: 0, session_time: 100, num_vehicles: 1 },
      player: {
        position: 1, total_laps: 5, num_pitstops: 0, num_penalties: 0,
        last_lap_time: 0, best_lap_time: 229.636, lap_delta: 0,
        last_sectors: [36.002, 90.254, 0], best_sectors: [36.002, 90.254, 0],
      },
      standings: [car({ is_player: true, position: 1, class_position: 1, in_pits: true })],
      telemetry: null,
      weather: null,
      extended: null,
    } as unknown as LiveData;
    const txt = buildLiveContext(data);
    ok(!txt.includes("S3 0.000"), "S3 inconnu jamais écrit 0.000");
    ok(txt.includes("S3 N/A"), "S3 inconnu écrit N/A");
    ok(txt.includes("IN THE PITS"), "état stands/garage signalé");
    const withTel = buildLiveContext({
      ...data,
      telemetry: {
        speed_kmh: 0, gear: 0, rpm: 0, water_temp: 0, oil_temp: 0, damage_total: 0,
        fuel: 100, fuel_capacity: 100, fuel_consumption: 0, fuel_laps_remaining: 0,
        wheels: [wheel, wheel, wheel, wheel],
      },
    } as unknown as LiveData);
    ok(!withTel.includes("-273"), "pneus à 0 K jamais transmis");
  }
}
