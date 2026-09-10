/**
 * Suite « modules purs » (COACH-LIVE-SPEC.md §14) — consolide les tests
 * déterministes des extensions P5 (heatmap des pertes, stint, risque, ghost) en
 * régression permanente. Aucune I/O, aucun aléa.
 */

import { section, ok, approx, eq } from "../assert";
import { analyzeLap, lossColor, lapLossHeatColors } from "@/lib/telemetry/analysis";
import type { Corner } from "@/lib/telemetry/corners";
import {
  createStintState,
  resetStint,
  recordStintCorner,
  fuelAdvice,
  liftCoastShortfall,
  takeOutLapAdvice,
} from "../../stint";
import {
  createRiskState,
  resetRisk,
  noteCorner,
  recordTrackLimit,
  classTargetAdvice,
} from "../../risk";
import {
  buildLapBufferFromChannels,
  buildLapBufferFromLd,
  resolveChannel,
  pickBestLap,
} from "../../ghost";
import type { CornerMeasurement } from "../../engine";
import type { LdChannel, TelemetryChannelData, TelemetryMeta } from "@/lib/api";

/**
 * Mesure de virage synthétique. Le `ctx` reçoit des valeurs « piste libre » par
 * défaut : sans elles, les modules qui filtrent le trafic verraient un écart
 * indéfini et le test ne prouverait rien.
 */
const cm = (o: Partial<CornerMeasurement>) =>
  ({
    ...o,
    ctx: { gapAheadEntry: 999, gapBehindMin: 999, ...(o.ctx ?? {}) },
  }) as unknown as CornerMeasurement;

export function run(): void {
  // ── P5.1 heatmap des pertes ──
  section("analysis.lossColor");
  eq(lossColor(null), "#94a3b8", "null → grey");
  eq(lossColor(0), "#22c55e", "0 → green");
  eq(lossColor(-0.5), "#22c55e", "negative → green");
  eq(lossColor(0.25), "#ef4444", "0.25 → red");
  eq(lossColor(0.125), "#eab308", "0.125 → yellow");
  eq(lossColor(1), lossColor(0.25), "clamped at 0.25");

  section("analysis.lapLossHeatColors");
  {
    const n = 20;
    const speed = Array.from({ length: n }, (_, i) => (i === 5 ? 100 : i === 14 ? 120 : 200));
    const dist = Array.from({ length: n }, (_, i) => i * 10);
    const corners: Corner[] = [
      { n: 1, brakeIdx: 3, brakeDist: 30, apexIdx: 5, minSpeed: 100 },
      { n: 2, brakeIdx: 12, brakeDist: 120, apexIdx: 14, minSpeed: 120 },
    ];
    const delta = Array.from({ length: n }, (_, i) => (i <= 3 ? 0 : i <= 12 ? (i - 3) * 0.03 : 0.27 - (i - 12) * 0.05));
    const refSpeed = speed.map((s) => s + 5);
    const withRef = analyzeLap(corners, speed, dist, delta, refSpeed, null, null);
    const heat = lapLossHeatColors(withRef, n);
    ok(heat !== null && heat.length === n, "heat length n");
    ok(heat![5] !== null && heat![5] !== "#94a3b8" && heat![5] !== "#22c55e", "corner1 is a loss");
    eq(heat![15], "#22c55e", "corner2 gain → green");
    eq(heat![0], null, "pre-corner null");
    const noRef = analyzeLap(corners, speed, dist, null, null, null, null);
    eq(lapLossHeatColors(noRef, n), null, "no ref → null");
  }

  // ── P5.3 coaching de stint ──
  section("stint.recordStintCorner");
  {
    const pass = (st: ReturnType<typeof createStintState>, vmin: number, gap = 999) =>
      recordStintCorner(
        st,
        cm({ corner_uid: "b", n: 7, vmin, tainted: false, ctx: { gapAheadEntry: gap } as never }),
      );

    let st = createStintState();
    ok(recordStintCorner(st, cm({ corner_uid: "a", n: 3, vmin: 100, tainted: true })) === null, "tainted → null");

    // Relais type : 2 tours de chauffe (pneus froids, donc lents), puis 3 passages
    // de référence à 120, puis 3 passages dégradés à 110.
    st = createStintState();
    const seq = [115, 118, 120, 120, 120, 110, 110];
    for (const v of seq) ok(pass(st, v) === null, `pré-alerte null (${v})`);
    const adv = pass(st, 110);
    ok(adv != null && adv.kind === "stint-drift" && adv.corner === 7, "8ᵉ passage → dérive T7");
    approx(adv!.magnitude, 10, 1e-6, "dérive 10 km/h");
    ok(pass(st, 108) === null, "une seule alerte par virage");

    // Les tours de chauffe ne servent PAS de base : sinon la « dérive » mesurée
    // serait l'échauffement des pneus, pas leur fatigue.
    st = createStintState();
    for (const v of [100, 105, 120, 120, 120, 119, 119, 119]) pass(st, v);
    ok(st.corners.get("b")!.alerted === false, "montée en température → pas de dérive");

    // Trafic : un passage ralenti derrière une voiture n'est pas comptabilisé.
    st = createStintState();
    for (let i = 0; i < 8; i++) ok(pass(st, 80, 0.5) === null, "trafic → passage ignoré");
    eq(st.corners.has("b"), false, "aucun échantillon retenu sous trafic");
  }
  section("stint.liftCoastShortfall");
  {
    eq(liftCoastShortfall(null, 10), null, "tours restants inconnus → null");
    eq(liftCoastShortfall(12, 0), null, "autonomie inconnue → null");
    eq(liftCoastShortfall(10, 12), null, "carburant suffisant → null");
    // Le cas corrigé : course d'endurance à ravitaillement, manque énorme dès le
    // 1ᵉʳ tour. Lever le pied n'y changera rien, il faut s'arrêter.
    eq(liftCoastShortfall(120, 14), null, "manque hors de portée → null");
    eq(liftCoastShortfall(12, 10), 2, "manque de 2 tours → rattrapable");
    eq(liftCoastShortfall(12, 11.5), 0.5, "manque d'un demi-tour → rattrapable");
  }
  section("stint.fuel/outlap");
  {
    const st = createStintState();
    ok(fuelAdvice(st, { shortfallLaps: null, lapNum: 5, onThrottle: true }) === null, "pas de manque → null");
    ok(fuelAdvice(st, { shortfallLaps: 2, lapNum: 5, onThrottle: false }) === null, "hors haute charge → null");
    ok(fuelAdvice(st, { shortfallLaps: 2, lapNum: 5, onThrottle: true })?.kind === "lift-coast", "manque → lift-coast");
    ok(fuelAdvice(st, { shortfallLaps: 2, lapNum: 6, onThrottle: true }) === null, "cooldown blocks");
    ok(fuelAdvice(st, { shortfallLaps: 2, lapNum: 8, onThrottle: true })?.kind === "lift-coast", "after cooldown");
    resetStint(st, { outLap: true });
    ok(takeOutLapAdvice(st)?.kind === "out-lap", "out-lap once");
    ok(takeOutLapAdvice(st) === null, "out-lap consumed");
  }

  // ── P5.4 risque + cible classe ──
  section("risk.trackLimits");
  {
    const st = createRiskState();
    ok(recordTrackLimit(st, 6) === null, "prime counter");
    noteCorner(st, cm({ corner_uid: "t7", n: 7, tainted: false }));
    ok(recordTrackLimit(st, 7) === null, "hit1");
    ok(recordTrackLimit(st, 8) === null, "hit2");
    const r = recordTrackLimit(st, 9);
    ok(r != null && r.kind === "risk-limits" && r.corner === 7, "hit3 → risk-limits T7");
    ok(recordTrackLimit(st, 10) === null, "one alert per corner");
    ok(recordTrackLimit(st, 0) === null, "counter reset ignored");
  }
  section("risk.trackLimits.attribution");
  {
    // Le cas corrigé : la coupure a lieu sur le vibreur de sortie, AVANT que la
    // fenêtre du virage ne se ferme. `lastCorner` pointe alors le virage
    // précédent ; le virage réellement négocié doit primer.
    const st = createRiskState();
    ok(recordTrackLimit(st, 0) === null, "amorce du compteur");
    noteCorner(st, cm({ corner_uid: "t8", n: 8, tainted: false })); // dernier clôturé
    const driving = { uid: "t9", n: 9 }; // virage réellement en cours
    ok(recordTrackLimit(st, 1, driving) === null, "hit1 sur T9");
    ok(recordTrackLimit(st, 2, driving) === null, "hit2 sur T9");
    const r = recordTrackLimit(st, 3, driving);
    ok(r != null && r.corner === 9, "coupures attribuées à T9, pas à T8");
    eq(st.corners.has("t8"), false, "T8 n'a rien accumulé");
  }
  section("risk.classTarget");
  {
    const st = createRiskState();
    const a = classTargetAdvice(st, { playerBest: [30.0, 40.3, 25.0], classBest: [29.95, 40.0, 25.05], lapNum: 3 });
    ok(a != null && a.kind === "class-target" && a.vars.s === 2, "worst sector S2");
    approx(a!.magnitude, 0.3, 1e-6, "gap 0.30s");
    ok(classTargetAdvice(st, { playerBest: [30, 41, 25], classBest: [29, 40, 24], lapNum: 5 }) === null, "cooldown blocks");
    resetRisk(st);
    ok(classTargetAdvice(st, { playerBest: [30, 40, 25], classBest: [29.95, 39.95, 24.98], lapNum: 3 }) === null, "small gaps → null");
  }

  // ── P5.5 ghost mapping (duckdb + ld) ──
  section("ghost.duckdb");
  {
    const N = 100;
    const chan = (name: string, vals: number[]) => ({ name, unit: "", dims: 1, values: [vals] });
    const data: TelemetryChannelData = {
      time: Array.from({ length: N }, (_, i) => 50 + i * 0.02),
      dist: Array.from({ length: N }, (_, i) => 1000 + i * 2),
      channels: [
        chan("Ground Speed", new Array(N).fill(100)),
        chan("Brake Pos", Array.from({ length: N }, (_, i) => (i >= 40 && i < 50 ? 80 : 0))),
        chan("Throttle Pos", Array.from({ length: N }, (_, i) => (i >= 40 && i < 50 ? 0 : 1))),
        chan("Steering Pos", Array.from({ length: N }, (_, i) => Math.sin(i / 5) * 80)),
        chan("G Force Lat", new Array(N).fill(0.5)),
        chan("Gear", new Array(N).fill(4)),
      ],
    };
    const dk = buildLapBufferFromChannels(data);
    ok(dk != null, "duckdb build ok");
    eq(dk!.buf.dist[0], 0, "dist rebased");
    approx(dk!.buf.brake[45], 80, 1e-6, "brake % passthrough");
    approx(dk!.buf.throttle[10], 100, 1e-6, "throttle fraction→%");
    ok(dk!.buf.steer.every((v) => v >= -1.0001 && v <= 1.0001), "steer [-1,1]");
    ok(dk!.buf.gLong.every((v) => v === 0), "missing gLong → 0");
    ok(buildLapBufferFromChannels({ time: [0], dist: [0], channels: [] }) === null, "short → null");
    const meta = (ds: number[]): TelemetryMeta => ({
      info: {} as never, metadata: {}, channels: [],
      laps: ds.map((d, i) => ({ lap: i + 1, start_time: 0, end_time: d, duration: d })),
      t0: 0, duration: 0,
    });
    eq(pickBestLap(meta([95, 92, 99])), 2, "pick fastest lap");
    eq(pickBestLap(meta([])), null, "no laps → null");
  }
  section("ghost.ld");
  {
    const N = 100;
    const ch = (name: string, unit: string, freq: number, d: number[]): LdChannel => ({ name, unit, freq, data: d });
    const lchans: LdChannel[] = [
      ch("Ground Speed", "km/h", 50, new Array(N).fill(100)),
      ch("Brake Pos", "", 50, Array.from({ length: N }, (_, i) => (i >= 40 && i < 50 ? 0.8 : 0))),
      ch("G Force Lat", "m/s^2", 50, new Array(N).fill(9.81)),
    ];
    ok(resolveChannel(lchans, ["ground speed", "speed"])?.name === "Ground Speed", "resolve speed");
    ok(resolveChannel(lchans, ["nope"]) === null, "resolve miss");
    const ld = buildLapBufferFromLd(lchans);
    ok(ld != null, "ld build ok");
    approx(ld!.buf.brake[45], 80, 1, "ld brake fraction→80%");
    approx(ld!.buf.gLat[10], 1, 0.01, "ld gLat m/s²→g");
    ok(buildLapBufferFromLd([ch("Brake", "%", 50, [1, 2, 3])]) === null, "ld no-speed → null");
    const ld2 = buildLapBufferFromLd([ch("Ground Speed", "m/s", 50, new Array(N).fill(30))]);
    approx(ld2!.buf.speed[10], 108, 1, "ld m/s→km/h");
  }
}
