/**
 * Suite « ingénieur de course » : arbitre radio, ton, point de tour, secteurs,
 * rapprochement, trafic, fenêtre d'arrêt, arrêts des rivaux, batterie,
 * prévision `.wet`, vigie, alertes « préviens-moi » et routeur de questions.
 * Tout est pur (horloge passée en paramètre) → rejouable sans le jeu.
 */

import { section, ok, eq, approx } from "../assert";
import type { LiveData, LiveStanding, WetFile } from "@/lib/api";
import type { Tr } from "@/i18n";
import { RadioArbiter, type Candidate } from "@/lib/engineer/arbiter";
import { ToneArbiter, desiredTone, TONE_HOLD_S, type ToneInputs } from "@/lib/engineer/tone";
import { decideLapCallout, SectorTracker } from "@/lib/engineer/lapPolicy";
import { ClosingTracker, estimate } from "@/lib/engineer/closing";
import { onTrack, slowerPackAhead, fasterBehind } from "@/lib/engineer/traffic";
import { pitWindow, stopsNeeded, PitWindowTracker, EnergyTracker } from "@/lib/engineer/pitWindow";
import { RivalPitWatcher } from "@/lib/engineer/rivalPits";
import { BatteryWatcher } from "@/lib/engineer/battery";
import { parseWet, pickWetFile, interp, nextRain, consistentWithLive, folderMatchesTrack } from "@/lib/engineer/forecast";
import { VigieTracker } from "@/lib/engineer/vigie";
import { WatchList } from "@/lib/engineer/watches";
import { route, normalize, extractEntities } from "@/lib/engineer/router";
import { radioName, radioClass, carNumber, classRank } from "@/lib/engineer/text";
import { answerIntent, registerWatch } from "@/lib/engineer/answers";
import { engineer } from "@/lib/engineer/state";
import { classRelation } from "@/lib/rival";

const c = (key: string, prio: Candidate["prio"], o: Partial<Candidate> = {}): Candidate => ({
  key,
  text: key,
  prio,
  ...o,
});

const st = (o: Partial<LiveStanding>): LiveStanding =>
  ({
    position: 0,
    class_position: 0,
    driver: "",
    vehicle_name: "",
    vehicle_class: "GT3",
    last_lap_time: 0,
    best_lap_time: 0,
    time_behind_leader: 0,
    laps_behind_leader: 0,
    time_behind_next: 0,
    is_player: false,
    in_pits: false,
    current_sector: 1,
    last_s1: 0,
    last_s2: 0,
    last_s3: 0,
    num_pitstops: 0,
    total_laps: 0,
    lap_dist: 0,
    ...o,
  }) as LiveStanding;

const data = (standings: LiveStanding[], extra: Partial<LiveData> = {}): LiveData =>
  ({
    connected: true,
    paused: false,
    session: { track: "Spa", session: 10, session_time: 600, end_et: 3600, max_laps: 2147483647, num_vehicles: standings.length, track_length: 7000, game_phase: 5 },
    player: { driver: "Me", position: 2, total_laps: 10, best_lap_time: 140, last_lap_time: 141, last_sectors: [0, 0, 0], best_sectors: [0, 0, 0], lap_delta: 0, num_pitstops: 0, num_penalties: 0, pit_state: 0, flag: 0 },
    telemetry: null,
    weather: null,
    extended: null,
    flags: null,
    standings,
    ...extra,
  }) as unknown as LiveData;

/** Traduction factice : clé + variables (assez pour vérifier le routage). */
const t = ((k: string, v?: Record<string, unknown>) => (v ? `${k}${JSON.stringify(v)}` : k)) as unknown as Tr;

export function run(): void {
  // ── Arbitre ──
  section("engineer.arbiter");
  {
    const a = new RadioArbiter();
    const d = a.decide([c("flag", "critical"), c("pen", "critical"), c("pos", "chatty", { score: 5 }), c("tyres", "normal", { score: 40 })], 0, 1);
    eq(d.spoken.map((x) => x.key), ["flag", "pen", "tyres"], "sécurité toujours + un seul dominant");
    ok(d.rejected.some((r) => r.c.key === "pos" && r.reason === "dominated"), "le chatty dominé est rejeté");

    const f = a.decide(
      [
        c("lap:time", "chatty", { group: "lap", order: 0, text: "Meilleur tour" }),
        c("lap:purple", "chatty", { group: "lap", order: 1, text: "secteur violet" }),
        c("sector", "chatty", { group: "lap", order: 2, text: "secteur 2" }),
      ],
      20,
      2,
    );
    eq(f.spoken.length, 1, "point de tour = une seule phrase");
    eq(f.spoken[0].text, "Meilleur tour, secteur violet", "fusion : 2 fragments collés dans l'ordre");
    ok(f.rejected.some((r) => r.reason === "too-long"), "le 3e fragment est écarté");

    const a2 = new RadioArbiter();
    a2.decide([c("gap", "chatty", { cooldownLaps: 5 })], 0, 1);
    eq(a2.decide([c("gap", "chatty", { cooldownLaps: 5 })], 30, 3).spoken.length, 0, "anti-radotage en tours");
    eq(a2.decide([c("gap", "chatty", { cooldownLaps: 5 })], 60, 6).spoken.length, 1, "redit après 5 tours");

    const a3 = new RadioArbiter();
    for (let i = 0; i < 3; i++) a3.decide([c(`k${i}`, "normal")], i, 1);
    eq(a3.decide([c("k3", "normal")], 4, 1).spoken.length, 0, "débit : 3 non critiques / 12 s max");
    eq(a3.decide([c("crit", "critical")], 5, 1).spoken.length, 1, "la sécurité ignore le débit");

    const a4 = new RadioArbiter();
    a4.decide([c("big", "normal", { score: 90 }), c("retry", "normal", { score: 10, retryS: 10 })], 0, 1);
    eq(a4.decide([], 5, 1).spoken.map((x) => x.key), ["retry"], "le candidat « retry » est retenté");
    const a5 = new RadioArbiter();
    a5.decide([c("big", "normal", { score: 90 }), c("retry", "normal", { score: 10, retryS: 3 })], 0, 1);
    const late = a5.decide([], 5, 1);
    ok(late.spoken.length === 0 && late.rejected.some((r) => r.reason === "expired"), "…puis périmé");

    const p = new RadioArbiter();
    const all = p.decide([c("a", "chatty"), c("b", "chatty"), c("c", "normal")], 0, 1, true);
    eq(all.spoken.length, 3, "débit complet : tout est dit");
  }

  // ── Ton ──
  section("engineer.tone");
  {
    const base: ToneInputs = { mech: false, fuelCritical: false, batteryCritical: false, tyreOverheat: false, pathWetness: 0, minWear: 80, battle: false, raceFraction: 0.5, isRace: true };
    eq(desiredTone(base), "normal", "rien ne contraint → normal");
    eq(desiredTone({ ...base, battle: true }), "attaque", "bagarre → attaque");
    eq(desiredTone({ ...base, battle: true, fuelCritical: true }), "prudent", "la contrainte physique gagne");
    eq(desiredTone({ ...base, minWear: 20 }), "prudent", "pneus usés → prudent");
    eq(desiredTone({ ...base, raceFraction: 0.85 }), "attaque", "dernier cinquième → attaque");
    const tone = new ToneArbiter();
    eq(tone.update({ ...base, mech: true }, 0), "prudent", "passage à prudent immédiat");
    eq(tone.update(base, 5), "prudent", "on n'en sort pas tout de suite");
    eq(tone.update(base, 5 + TONE_HOLD_S), "normal", "sortie après la tenue");
  }

  // ── Point de tour + secteurs ──
  section("engineer.lapPolicy");
  {
    const lap = (o: Partial<Parameters<typeof decideLapCallout>[0]>) =>
      decideLapCallout({ isRace: true, lapTime: 100, prevBest: 100, isPb: false, lastAnnouncedPb: 99, lapsSinceLapCallout: 0, ...o });
    eq(lap({ isRace: false }), "last", "essais : chaque tour lancé");
    eq(lap({ lapTime: 120 }), null, "tour non lancé (out-lap) : silence");
    eq(lap({ lapsSinceLapCallout: 3 }), "last", "course : un tour sur 3");
    eq(lap({}), null, "course : pas à chaque tour");
    eq(lap({ isPb: true, lapTime: 98, lastAnnouncedPb: 99 }), "pb", "PB qui bat de 1 s → dit");
    eq(lap({ isPb: true, lapTime: 98.8, lastAnnouncedPb: 99 }), null, "PB grappillé d'un dixième → pas redit");
    eq(lap({ isPb: true, lastAnnouncedPb: 0 }), "pb", "premier PB toujours dit");

    const s = new SectorTracker();
    let v = s.push([30.5, 40, 30], [30, 40, 30]);
    eq(v.worst, { s: 1, d: 0.5 }, "pire secteur ≥ 0,3 s");
    for (let i = 0; i < 3; i++) v = s.push([30.2, 40, 30], [30, 40, 30]);
    ok(v.weak !== null && v.weak.s === 1, "secteur 1 chroniquement faible après 4 tours");
    eq(s.push([36, 40, 30], [30, 40, 30]).worst, null, "perte aberrante (trafic) écartée");
    eq(s.push([36, 40.5, 30], [30, 40, 30]).worst, { s: 2, d: 0.5 }, "tête-à-queue en S1 : le S2 est quand même débriefé");
  }

  // ── Rapprochement ──
  section("engineer.closing");
  {
    const e = estimate("ahead", "X", [3.0, 2.6, 2.2, 1.8]);
    eq(e.trend, "closing", "écart qui se referme de 0,4 s/tour");
    approx(e.rate, 0.4, 1e-9, "taux 0,4");
    eq(e.lapsToCatch, 5, "jonction dans ~5 tours (1,8 / 0,4)");
    eq(estimate("ahead", "X", [3.0, 2.6]).trend, "unknown", "pas assez de tours");
    eq(estimate("ahead", "X", [2, 2.3, 1.8, 2.2, 1.9]).trend, "stable", "bruit ±0,3 → pas de tendance affirmée");
    const tr = new ClosingTracker();
    tr.push("ahead", "X", 3);
    tr.push("ahead", "X", 2.6);
    tr.push("ahead", "Y", 2.2);
    eq(tr.current("ahead")?.driver, "Y", "changement de voiture → repart de zéro");
  }

  // ── Trafic ──
  section("engineer.traffic");
  {
    eq(classRelation("Hypercar", "LMGT3"), "slower", "noms bruts du live : GT3 plus lente qu'une Hypercar");
    eq(classRelation("LMGT3", "Hypercar"), "faster", "…et l'Hypercar plus rapide");
    eq(classRank("LMP2_ELMS"), 2, "LMP2 ELMS → rang LMP2");
    const me = st({ is_player: true, driver: "Me", vehicle_class: "Hypercar", lap_dist: 1000, best_lap_time: 210 });
    const gt = (d: string, dist: number) => st({ driver: d, vehicle_class: "LMGT3", lap_dist: dist, best_lap_time: 230 });
    const dd = data([me, gt("a", 1300), gt("b", 1400), gt("c", 1450), st({ driver: "h", vehicle_class: "Hypercar", lap_dist: 700, best_lap_time: 209 })]);
    const cars = onTrack(dd, 210);
    const pack = slowerPackAhead(cars, 210, () => 4);
    ok(pack !== null && pack.count === 3 && pack.cls === "LMGT3", "paquet de 3 GT3 détecté devant");
    ok(pack !== null && pack.laps < 1, "rattrapé en moins d'un tour (gain 20 s/tour)");
    eq(fasterBehind(cars), null, "Hypercar derrière = même classe, pas de préavis");
    const dg = data([st({ is_player: true, driver: "Me", vehicle_class: "LMGT3", lap_dist: 1000, best_lap_time: 230 }), st({ driver: "hy", vehicle_class: "Hypercar", lap_dist: 800 })]);
    const fb = fasterBehind(onTrack(dg, 230));
    ok(fb !== null && fb.standing.driver === "hy", "Hypercar à ~6,6 s derrière → préavis");
  }

  // ── Fenêtre d'arrêt + énergie ──
  section("engineer.pitWindow");
  {
    const w = pitWindow(20, 6.5, null, 15);
    ok(w !== null && w.required && w.lastLap === 26 && w.limitedBy === "fuel", "arrêt requis, dernier tour 26");
    eq(pitWindow(20, 6.5, 4.2, 15)?.limitedBy, "energy", "l'énergie virtuelle limite");
    eq(pitWindow(20, 20, null, 15)?.required, false, "autonomie suffisante → pas d'arrêt");
    eq(stopsNeeded(30, 6, 12), 2, "24 tours manquants, relais de 12 → 2 arrêts");
    eq(stopsNeeded(10, 12, 12), 0, "de quoi finir → 0");
    const tr = new PitWindowTracker();
    eq(tr.update(pitWindow(20, 4.5, null, 15), 20, 0, false), ["open"], "fenêtre ouverte à 4 tours");
    eq(tr.update(pitWindow(22, 2.5, null, 13), 22, 0, false), ["closing"], "se ferme à 2 tours");
    eq(tr.update(pitWindow(23, 1.4, null, 12), 23, 0, false), ["box"], "box box à 1,4 tour");
    eq(tr.update(pitWindow(23, 1.2, null, 12), 23, 0, false), [], "box dit une seule fois par relais");
    const tr2 = new PitWindowTracker();
    tr2.stayOut(20);
    eq(tr2.update(pitWindow(20, 2.5, null, 15), 20, 0, false), [], "« je reste dehors » tait les rappels");
    eq(tr2.update(pitWindow(21, 1.2, null, 14), 21, 0, false), ["box"], "…mais pas le box de sécurité");
    const en = new EnergyTracker();
    for (const ve of [0.9, 0.8, 0.7]) en.push(ve);
    approx(en.lapsRemaining(0.7) ?? 0, 7, 1e-6, "énergie : 0,7 / 0,1 par tour = 7 tours");
    en.push(1.0);
    eq(en.perLap(), null, "ravitaillement → mesure repart de zéro");
  }

  // ── Arrêts des rivaux ──
  section("engineer.rivalPits");
  {
    const w = new RivalPitWatcher();
    const mk = (inPits: boolean) =>
      data([
        st({ is_player: true, driver: "Me", class_position: 2, time_behind_leader: 20 }),
        st({ driver: "Ahead", class_position: 1, time_behind_leader: 10, in_pits: inPits }),
        st({ driver: "Behind", class_position: 3, time_behind_leader: 25 }),
      ]);
    eq(w.push(mk(false), 25).length, 0, "pas d'arrêt");
    const ev = w.push(mk(true), 25);
    ok(ev.length === 1 && ev[0].side === "ahead" && ev[0].outcome === "behind", "devant s'arrête, 10 s d'avance < 25 s de perte → ressort derrière");
  }

  // ── Batterie ──
  section("engineer.battery");
  {
    const b = new BatteryWatcher();
    b.lap(60);
    b.lap(50);
    const ev = b.lap(40);
    ok(ev.some((e) => e.kind === "deficit"), "déficit de 10 %/tour détecté");
    eq(b.lap(10).filter((e) => e.kind === "critical").length, 1, "critique sous 15 %");
    eq(b.lap(12).filter((e) => e.kind === "critical").length, 0, "pas redit avant réarmement");
  }

  // ── Prévision .wet ──
  section("engineer.forecast");
  {
    const json = JSON.stringify({
      Race: { Weather: [0, 10, 70, 80, 20].map((r, i) => ({ Humidity: 50, RainChance: r, Sky: 2, Temperature: 20 + i })) },
    });
    const w = parseWet(json)!;
    ok(!!w.Race && w.Race.length === 5, "5 nœuds lus");
    approx(interp(w.Race!, 0.125).RainChance, 5, 1e-9, "interpolation linéaire");
    const nr = nextRain(w.Race!, 0, 3600)!;
    ok(nr !== null && nr.inS > 900 && nr.inS < 1800, "pluie probable entre 15 et 30 min");
    ok(consistentWithLive(w.Race!, 0, 21), "température cohérente avec la mesure (20 ±2,5)");
    ok(!consistentWithLive(w.Race!, 0, 30), "incohérente → la prévision n'est pas utilisée");
    ok(folderMatchesTrack("Spa", "Circuit de Spa-Francorchamps"), "dossier Spa ↔ circuit live");
    ok(folderMatchesTrack("Qatar", "Lusail International Circuit"), "alias Qatar ↔ Lusail");
    const files = [
      { folder: "Monza", file_name: "a.wet", mtime: 9, content: "{}" },
      { folder: "Spa", file_name: "old.wet", mtime: 1, content: json },
      { folder: "Spa", file_name: "new.wet", mtime: 5, content: json },
    ] as WetFile[];
    eq(pickWetFile(files, "Circuit de Spa-Francorchamps")?.file_name, "new.wet", "le plus récent du circuit");
  }

  // ── Vigie ──
  section("engineer.vigie");
  {
    const v = new VigieTracker();
    const lane = { inPits: true, pitState: 2, limiter: false, speedKmh: 90, brake: 0, throttle: 0.5, pitLimitKmh: 60 };
    eq(v.update(lane, 0), [], "pas avant la tenue");
    eq(v.update(lane, 3.5), ["pitLaneNoLimiter"], "voie des stands sans limiteur");
    eq(v.update(lane, 5), [], "une fois par passage");
    const v2 = new VigieTracker();
    const out = { inPits: false, pitState: 0, limiter: true, speedKmh: 80, brake: 0, throttle: 1, pitLimitKmh: 60 };
    v2.update(out, 0);
    eq(v2.update(out, 3.2), ["limiterForgotten"], "limiteur oublié en piste");
  }

  // ── Alertes « préviens-moi » ──
  section("engineer.watches");
  {
    const wl = new WatchList();
    wl.add({ kind: "timeLeft", minutes: 10 });
    wl.add({ kind: "rivalPit", driver: "Rival" });
    const base = [st({ is_player: true, driver: "Me" }), st({ driver: "Rival" })];
    eq(wl.evaluate(data(base), null).length, 0, "rien encore");
    const late = data([st({ is_player: true, driver: "Me" }), st({ driver: "Rival", in_pits: true })], {
      session: { track: "Spa", session: 10, session_time: 3100, end_et: 3600, max_laps: 2147483647, num_vehicles: 2, track_length: 7000, game_phase: 5 },
    } as Partial<LiveData>);
    const fired = wl.evaluate(late, null);
    eq(fired.length, 2, "10 min restantes + rival au stand");
    eq(wl.size, 0, "alertes retirées une fois dites");
  }

  // ── Routeur ──
  section("engineer.router");
  {
    eq(normalize("Il reste dix minutes ?", "fr"), "il reste 10 minutes", "nombres en lettres → chiffres");
    eq(normalize("vingt-deux tours", "fr"), "22 tours", "dizaine + unité");
    eq(route("il me reste combien d'essence ?", "fr").intent, "fuel", "carburant");
    eq(route("quand est-ce que je dois m'arrêter", "fr").intent, "pitWindow", "fenêtre d'arrêt");
    eq(route("qui est devant moi", "fr").intent, "ahead", "qui est devant");
    eq(route("est-ce que je reviens sur lui", "fr").intent, "closing", "rapprochement");
    eq(route("meilleur tour de la session", "fr").intent, "sessionBest", "la locution longue bat « meilleur tour »");
    eq(route("combien de tours d'essence", "fr").intent, "fuel", "« tours d'essence » = carburant, pas tours restants");
    eq(route("compris", "fr").intent, "ackBox", "accusé (énoncé entier)");
    eq(route("je reste dehors", "fr").intent, "stayOut", "rester dehors");
    const p6 = route("qui est P6 en LMP2", "fr");
    ok(p6.intent === "positionOf" && p6.entities.pos === 6 && p6.entities.cls === "LMP2", "qui est P6 en LMP2");
    const car = route("où est la 14", "fr");
    ok(car.intent === "carInfo" && car.entities.carNo === "14", "où est la 14");
    eq(extractEntities(normalize("qui est premier en gt3", "fr"), "fr").cls, "GT3", "classe GT3");
    const w = route("préviens-moi quand il reste dix minutes", "fr");
    ok(w.intent === "watch" && w.watch?.kind === "timeLeft" && w.watch.minutes === 10, "alerte temps restant");
    const wp = route("préviens-moi quand la voiture devant s'arrête", "fr");
    ok(wp.watch?.kind === "rivalPit" && wp.watch.target === "ahead", "alerte arrêt du rival devant");
    eq(route("tell me when there are 5 laps left", "en").watch?.kind, "lapsLeft", "EN : alerte tours restants");
    eq(route("how much fuel do I have", "en").intent, "fuel", "EN : carburant");
    eq(route("who is ahead", "en").intent, "ahead", "EN : qui est devant");
    eq(route("cuándo paro", "es").intent, "pitWindow", "ES : fenêtre d'arrêt");
    eq(route("wann muss ich rein", "de").intent, "pitWindow", "DE : fenêtre d'arrêt");
    eq(route("comment je peux aller plus vite dans le virage 3", "fr").intent, null, "question ouverte → l'IA");
    eq(route("est-ce que mes pneus vont tenir jusqu'à la fin", "fr").intent, null, "jugement sur les pneus → l'IA");
    eq(route("will my tyres last until the end", "en").intent, null, "EN : jugement → l'IA");
    eq(route("when should i pit", "en").intent, "pitWindow", "EN : locution précise reste locale");
  }

  // ── Textes radio + réponses ──
  section("engineer.answers");
  {
    eq(radioName("jean dupont#1234"), "Jean Dupont", "pseudo nettoyé et capitalisé");
    eq(radioName("RacerX 20251"), "RacerX", "suffixe de 4+ chiffres retiré, casse mixte conservée");
    eq(radioClass("LMP2_ELMS"), "LMP2", "classe dite en clair");
    eq(carNumber("Team WRT 2026 #32:WEC"), "32", "numéro de course");
    const d = data([
      st({ is_player: true, driver: "Me", position: 2, class_position: 2, time_behind_leader: 5 }),
      st({ driver: "leo martin", position: 1, class_position: 1, time_behind_leader: 0, vehicle_name: "Car #7" }),
    ]);
    const opts = { pitLossSec: 25, fuelReserveLaps: 1 };
    ok(answerIntent("ahead", d, t, opts).startsWith("live.spWhoAhead"), "qui est devant → voisin de classe");
    ok(answerIntent("ahead", d, t, opts).includes("Leo Martin"), "nom dit à la radio");
    ok(answerIntent("carInfo", d, t, { ...opts, entities: { carNo: "7" } }).startsWith("live.spCarInfo"), "la 7 trouvée");
    ok(answerIntent("forecast", d, t, opts) === "live.spForecastNone", "pas de prévision → le dit");
    engineer.resetSession();
    ok(registerWatch({ kind: "rivalPit", target: "ahead" }, {}, "", d, t).startsWith("live.spWatchSet"), "alerte posée sur la voiture devant");
    eq(engineer.watches.size, 1, "une alerte en cours");
    engineer.resetSession();
  }
}
