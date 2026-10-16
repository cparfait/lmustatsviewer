/**
 * Réponses déterministes de l'ingénieur aux questions du pilote.
 *
 * Tous les chiffres sont calculés ici, en code ; aucune phrase n'invente une
 * donnée absente (repli explicite « donnée indisponible »). Les intentions
 * historiques du spotter sont déléguées à `buildAnswer` ; les nouvelles
 * (identité des voitures, fenêtre d'arrêt, trafic, prévision…) vivent ici.
 * Règles de forme : écarts à 1 décimale, autonomie à 1 décimale, classe dite
 * en clair, pseudo nettoyé.
 */

import type { LiveData, LiveStanding } from "@/lib/api";
import type { Tr } from "@/i18n";
import { buildAnswer, lapVoice } from "@/lib/spotter";
import { computeStrategy } from "@/lib/strategy";
import { engineer } from "./state";
import { carNumber, classRank, radioClass, radioName } from "./text";
import { pitWindow, stopsNeeded } from "./pitWindow";
import { nextSlowerAhead, onTrack, slowerPackAhead } from "./traffic";
import { fromGameNodes, interp, nextRain, pickForecast, wetSession, type WetNode } from "./forecast";
import { brakePads, gameForecast, guardPerLap, officialEnergyPerLap } from "@/lib/lmuRest";
import { normalize, type AnswerIntent, type Entities, type WatchSpec } from "./router";
import type { WatchCond } from "./watches";
import { coachCornerLosses } from "@/lib/coach/service";
import { isWetCompound, tyreChangePlan, wheelWear, type WheelId } from "./tyres";
import { sessionKind, type LapPref } from "./prefs";

/** Fenêtre de température « de travail » des pneus (°C, générique). */
export const TYRE_WINDOW: [number, number] = [75, 105];

export interface AnswerOpts {
  entities?: Entities;
  /** Question normalisée (résolution d'un nom de pilote cité). */
  norm?: string;
  pitLossSec: number;
  fuelReserveLaps: number;
  /** Multiclasse : position/écarts dans la classe (réglage, défaut oui). */
  classPositions?: boolean;
}

const inSession = (d: LiveData | null): d is LiveData =>
  !!d && d.connected && !d.paused && !!d.session && !!d.player;

const meOf = (d: LiveData) => d.standings.find((s) => s.is_player) ?? null;

/** Plusieurs classes en piste ? */
const multiclass = (d: LiveData) => new Set(d.standings.map((s) => s.vehicle_class)).size > 1;

/** Référence de tour du joueur (meilleur, sinon dernier), en s. */
function myRefLap(d: LiveData): number {
  const p = d.player!;
  return p.best_lap_time > 0 ? p.best_lap_time : p.last_lap_time > 0 ? p.last_lap_time : 0;
}

/**
 * Écart entre toi et une voiture : « à X secondes » / « à N tours », avec le
 * sens (« devant toi » / « derrière toi ») si `directional`.
 */
function relGap(t: Tr, me: LiveStanding, s: LiveStanding, directional = false): string {
  const dl = s.laps_behind_leader - me.laps_behind_leader;
  const dt = s.time_behind_leader - me.time_behind_leader;
  const ahead = dl < 0 || (dl === 0 && dt < 0);
  const side = directional ? (ahead ? "Ahead" : "Behind") : "";
  if (dl !== 0) return t(`live.spRelLaps${side}`, { count: Math.abs(dl) });
  return t(`live.spRelSec${side}`, { time: Math.abs(dt).toFixed(1) });
}

/** « en GT3 » / « au général ». */
const classLabel = (t: Tr, cls: string | null) => (cls ? t("live.spInClass", { cls }) : t("live.spOverall"));

/** Voisin de classe (devant = -1, derrière = +1). */
function classNeighbor(d: LiveData, me: LiveStanding, dir: -1 | 1): LiveStanding | null {
  return (
    d.standings.find((s) => s.vehicle_class === me.vehicle_class && s.class_position === me.class_position + dir) ??
    null
  );
}

/** Classe visée par la question (clé radio), ou null = général. */
function targetClass(d: LiveData, me: LiveStanding, e: Entities | undefined): string | null {
  if (e?.cls) return e.cls;
  if (e?.overall || !multiclass(d)) return null;
  return radioClass(me.vehicle_class);
}

function findAtPosition(d: LiveData, pos: number, cls: string | null): LiveStanding | null {
  if (!cls) return d.standings.find((s) => s.position === pos) ?? null;
  return d.standings.find((s) => radioClass(s.vehicle_class) === cls && s.class_position === pos) ?? null;
}

/** Voiture citée par son numéro ou par un nom de pilote (token ≥ 3 lettres). */
export function findCited(d: LiveData, e: Entities | undefined, norm: string | undefined): LiveStanding | null {
  if (e?.carNo) {
    const byNo = d.standings.find((s) => carNumber(s.vehicle_name) === e.carNo);
    if (byNo) return byNo;
  }
  if (norm) {
    const toks = new Set(norm.split(" ").filter((w) => w.length >= 3));
    for (const s of d.standings) {
      const parts = normalize(radioName(s.driver), "en").split(" ").filter((w) => w.length >= 3);
      if (parts.some((p) => toks.has(p))) return s;
    }
  }
  return null;
}

/**
 * Conso d'énergie virtuelle (fraction/tour) : mesure à la ligne, avec la table
 * du jeu comme garde-fou (avant 3 tours mesurés, après un ravitaillement, ou si
 * la mesure s'écarte de plus de 40 %).
 */
export function energyPerLap(d: LiveData): number | null {
  return guardPerLap(engineer.energy.perLap(), officialEnergyPerLap(d.rest))?.perLap ?? null;
}

/** Autonomie en énergie virtuelle (tours), si voiture WEC et mesurée. */
function energyLaps(d: LiveData): number | null {
  const ve = d.extended?.virtual_energy ?? 0;
  const per = energyPerLap(d);
  return ve > 0 && per ? ve / per : null;
}

/** Longueur d'un relais à plein (tours) : énergie virtuelle ou réservoir. */
function nextStintLaps(d: LiveData, energy: boolean): number | null {
  const tel = d.telemetry;
  if (energy) {
    const per = energyPerLap(d);
    return per ? 1 / per : null;
  }
  return tel && tel.fuel_consumption > 0 && tel.fuel_capacity > 0 ? tel.fuel_capacity / tel.fuel_consumption : null;
}

/** Fenêtre d'arrêt courante (carburant + énergie virtuelle). */
export function currentPitWindow(d: LiveData) {
  const p = d.player!;
  const tel = d.telemetry;
  const strat = computeStrategy(d.session, p, tel);
  return {
    strat,
    info: pitWindow(p.total_laps, tel?.fuel_laps_remaining ?? 0, energyLaps(d), strat?.sessionLapsLeft ?? null),
  };
}

/** Prévision validée pour la séance en cours : prochaine pluie, ou « sec », ou null. */
export function currentForecast(d: LiveData): { rain: { inS: number; chance: number } | null } | null {
  const sc = d.session!;
  if (sc.end_et <= 0) return null;
  const frac = Math.min(1, Math.max(0, sc.session_time / sc.end_et));
  const nodes = activeForecast(d, frac)?.nodes;
  if (!nodes) return null;
  return { rain: nextRain(nodes, frac, sc.end_et) };
}

/** Prévision retenue : celle du jeu si cohérente, sinon le `.wet` validé. */
export function activeForecast(d: LiveData, frac: number): { nodes: WetNode[]; source: "game" | "wet" } | null {
  const sc = d.session;
  if (!sc) return null;
  const game = gameForecast(d.rest, sc.session);
  const key = wetSession(sc.session);
  const wet = key ? (engineer.forecast?.data[key] ?? null) : null;
  return pickForecast(game ? fromGameNodes(game) : null, wet, engineer.forecastValid, frac, d.weather?.air_temp ?? NaN);
}

/** Température d'air annoncée par la prévision à l'instant présent (validation). */
export function forecastTempNow(d: LiveData): number | null {
  const sc = d.session;
  if (!sc || sc.end_et <= 0) return null;
  const frac = Math.min(1, Math.max(0, sc.session_time / sc.end_et));
  const game = gameForecast(d.rest, sc.session);
  if (game) return interp(fromGameNodes(game), frac).Temperature;
  const f = engineer.forecast;
  const key = wetSession(sc.session);
  const nodes = f && key ? f.data[key] : undefined;
  if (!nodes) return null;
  return interp(nodes, frac).Temperature;
}

/** « dans environ N minutes » / « dans moins d'une minute ». */
export function whenMinutes(t: Tr, seconds: number): string {
  const min = Math.round(seconds / 60);
  return min < 1 ? t("live.inLessMinute") : t("live.inMinutes", { n: min });
}

/** « dans moins d'un tour » / « dans un tour » / « dans N tours ». */
export function whenLaps(t: Tr, laps: number): string {
  if (laps < 1) return t("live.inLessLap");
  const n = Math.round(laps);
  return n === 1 ? t("live.inOneLap") : t("live.inLaps", { n });
}

export function rankGap(myCls: string) {
  return (cls: string) => Math.max(1, classRank(cls) - classRank(myCls));
}

/** Cible « voiture devant / derrière » dans une question (texte normalisé). */
const AHEAD_RX = / (devant|ahead|in front|delante|vordermann|vorne|davanti) /;
const BEHIND_RX = / (derriere|behind|detras|hintermann|hinten|dietro) /;

/** Perte moyenne en deçà de laquelle un virage n'est pas cité (s). */
const LOSS_MIN_S = 0.05;

export function answerIntent(intent: AnswerIntent, data: LiveData | null, t: Tr, o: AnswerOpts): string {
  if (!inSession(data)) return t("live.spNoSession");
  const d = data;
  const p = d.player!;
  const me = meOf(d);
  const e = o.entities;
  const noData = t("live.spNoData");

  switch (intent) {
    case "ahead":
    case "behind": {
      if (!me) return noData;
      const cls = radioClass(me.vehicle_class);
      const car = classNeighbor(d, me, intent === "ahead" ? -1 : 1);
      if (!car) return t(intent === "ahead" ? "live.spNobodyAhead" : "live.spNobodyBehind", { cls });
      return t(intent === "ahead" ? "live.spWhoAhead" : "live.spWhoBehind", {
        name: radioName(car.driver),
        pos: car.class_position,
        cls,
        gap: relGap(t, me, car),
      });
    }

    case "classLeader": {
      if (!me) return noData;
      const cls = targetClass(d, me, e);
      const lead = findAtPosition(d, 1, cls);
      const label = classLabel(t, cls);
      if (!lead) return noData;
      if (lead.is_player) return t("live.spClassLeaderMe", { cls: label });
      return t("live.spClassLeader", { cls: label, name: radioName(lead.driver), gap: relGap(t, me, lead, true) });
    }

    case "positionOf": {
      if (!me || !e?.pos) return noData;
      const cls = targetClass(d, me, e);
      const label = classLabel(t, cls);
      const car = findAtPosition(d, e.pos, cls);
      if (!car) return t("live.spPositionNone", { pos: e.pos, cls: label });
      if (car.is_player) return t("live.spPositionMe", { pos: e.pos, cls: label });
      return t("live.spPositionOf", { pos: e.pos, cls: label, name: radioName(car.driver), gap: relGap(t, me, car, true) });
    }

    case "carInfo": {
      if (!me) return noData;
      const car = findCited(d, e, o.norm);
      if (!car) return e?.carNo ? t("live.spCarUnknown", { no: e.carNo }) : noData;
      if (car.is_player) return t("live.spCarIsYou");
      const no = carNumber(car.vehicle_name);
      const vars = {
        name: radioName(car.driver),
        pos: car.class_position,
        cls: radioClass(car.vehicle_class),
        gap: relGap(t, me, car, true),
      };
      return no ? t("live.spCarInfo", { ...vars, car: t("live.spCarNo", { no }) }) : t("live.spCarInfoNoNum", vars);
    }

    case "closing": {
      const c = engineer.closing.current("ahead");
      if (!c) return t("live.spClosingUnknown");
      const name = radioName(c.driver);
      const dd = Math.abs(c.rate).toFixed(1);
      if (c.trend === "closing")
        return c.lapsToCatch != null
          ? t("live.spClosingYes", { name, d: dd, n: c.lapsToCatch })
          : t("live.spClosingSlow", { name, d: dd });
      if (c.trend === "opening") return t("live.spClosingNo", { name, d: dd });
      if (c.trend === "stable") return t("live.spClosingStable", { name });
      return t("live.spClosingUnknown");
    }

    case "traffic": {
      if (!me) return noData;
      const ref = myRefLap(d);
      const cars = onTrack(d, ref);
      if (!cars.length) return noData;
      const pack = slowerPackAhead(cars, ref, rankGap(me.vehicle_class));
      if (pack)
        return t("live.spTrafficPack", { n: pack.count, cls: radioClass(pack.cls), when: whenLaps(t, pack.laps) });
      const next = nextSlowerAhead(cars);
      if (next && next.aheadS <= 60)
        return t("live.spTrafficNext", { cls: radioClass(next.standing.vehicle_class), s: Math.round(next.aheadS) });
      return t("live.spTrafficNone");
    }

    case "forecast": {
      const f = currentForecast(d);
      if (!f) return t("live.spForecastNone");
      return f.rain
        ? t("live.spForecastRain", { pct: f.rain.chance, when: whenMinutes(t, f.rain.inS) })
        : t("live.spForecastDry");
    }

    case "tyreTemp": {
      const temps = (d.telemetry?.wheels ?? []).map((w) => w.temp).filter((x) => x > 0 && x < 250);
      if (!temps.length) return noData;
      const [lo, hi] = TYRE_WINDOW;
      const min = Math.round(Math.min(...temps));
      const max = Math.round(Math.max(...temps));
      if (min < lo) return t("live.spTyreCold", { temp: min, lo, hi });
      if (max > hi) return t("live.spTyreHot", { temp: max, lo, hi });
      return t("live.spTyreOk", { temp: Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) });
    }

    case "brakeBias": {
      const rear = d.telemetry?.rear_brake_bias ?? 0;
      if (!(rear > 0 && rear < 1)) return noData;
      return t("live.spBrakeBias", { f: ((1 - rear) * 100).toFixed(1) });
    }

    case "brakeWear": {
      const pads = brakePads(d.rest);
      if (!pads) return t("live.spBrakePadsNone");
      const pct = (a: number, b: number) => Math.round(Math.min(a, b) * 100);
      let txt = t("live.spBrakePads", { f: pct(pads[0], pads[1]), r: pct(pads[2], pads[3]) });
      // Verdict : tiendront-elles jusqu'au bout (seuil 10 %) ?
      const left = computeStrategy(d.session, p, d.telemetry)?.sessionLapsLeft ?? null;
      const lapsTo = engineer.pads.lapsTo(Math.min(...pads));
      if (left != null && lapsTo != null) txt += ". " + t(lapsTo >= left ? "live.spBrakePadsOk" : "live.spBrakePadsChange");
      return txt;
    }

    case "battery": {
      const x = d.extended;
      if (!x || !(x.boost_state > 0)) return t("live.spNoHybrid");
      const soc = Math.round(x.state_of_charge);
      return x.virtual_energy > 0
        ? t("live.spBatteryVe", { soc, ve: Math.round(x.virtual_energy * 100) })
        : t("live.spBattery", { soc });
    }

    case "sessionBest": {
      let best: LiveStanding | null = null;
      for (const s of d.standings) if (s.best_lap_time > 0 && (!best || s.best_lap_time < best.best_lap_time)) best = s;
      if (!best) return noData;
      const time = lapVoice(best.best_lap_time, t);
      return best.is_player
        ? t("live.spSessionBestMe", { time })
        : t("live.spSessionBest", { time, name: radioName(best.driver), cls: radioClass(best.vehicle_class) });
    }

    case "pitWindow": {
      const { strat, info } = currentPitWindow(d);
      if (!info) return noData;
      if (info.required)
        return t(info.limitedBy === "energy" ? "live.spPitWindowEnergy" : "live.spPitWindow", { lap: info.lastLap });
      if (strat?.sessionLapsLeft != null) return t("live.spNoStopNeeded");
      return t("live.spPitRange", { lap: info.lastLap });
    }

    case "stops": {
      const { strat, info } = currentPitWindow(d);
      if (!info || strat?.sessionLapsLeft == null) return noData;
      const perStint = nextStintLaps(d, info.limitedBy === "energy");
      const n = stopsNeeded(strat.sessionLapsLeft, info.rangeLaps, perStint);
      if (n == null) return noData;
      return n === 0 ? t("live.spNoStopNeeded") : t("live.spStops", { count: n });
    }

    case "rivalStops": {
      if (!me) return noData;
      const n = ` ${o.norm ?? ""} `;
      const cls = me.vehicle_class;
      const car =
        e?.carNo || e?.pos
          ? (findCited(d, e, o.norm) ?? (e.pos ? findAtPosition(d, e.pos, targetClass(d, me, e)) : null))
          : AHEAD_RX.test(n)
            ? classNeighbor(d, me, -1)
            : BEHIND_RX.test(n)
              ? classNeighbor(d, me, 1)
              : me.class_position === 1
                ? classNeighbor(d, me, 1)
                : findAtPosition(d, 1, cls);
      if (!car || car.is_player) return noData;
      const name = radioName(car.driver);
      const est = engineer.stints.estimate(d, car);
      const parts = [car.num_pitstops > 0 ? t("live.spRStops", { name, count: car.num_pitstops }) : t("live.spRStopsNone", { name })];
      if (est.stintLaps == null) return `${parts[0]}, ${t("live.spRUnknown")}`;
      const stint = Math.round(est.stintLaps);
      parts.push(t(est.fromClass ? "live.spRStintClass" : "live.spRStint", { n: stint }));
      if (est.lapsToNext != null) parts.push(est.lapsToNext <= 0 ? t("live.spRDue") : t("live.spRNext", { when: whenLaps(t, est.lapsToNext) }));
      if (est.stopsLeft != null) parts.push(est.stopsLeft === 0 ? t("live.spRLeftNone") : t("live.spRLeft", { count: est.stopsLeft }));
      return parts.join(", ");
    }

    case "lapPrefEvery":
    case "lapPrefBest":
    case "lapPrefNone":
    case "lapPrefAuto": {
      const pref = intent.slice("lapPref".length).toLowerCase() as LapPref;
      const kind = sessionKind(d.session!.session);
      engineer.setLapPref(kind, pref);
      const what = t(`live.lapPref${intent.slice("lapPref".length)}`);
      const k = t(`live.spKind${kind[0].toUpperCase()}${kind.slice(1)}`);
      return t("live.spLapPrefSet", { what, kind: k });
    }

    case "tyreChange": {
      const tel = d.telemetry;
      const wear = wheelWear(tel?.wheels);
      if (!tel || !wear) return noData;
      const parts: string[] = [];
      const onWets = isWetCompound(tel.front_compound) || isWetCompound(tel.rear_compound);
      const call = engineer.wetness.call(onWets, d.weather?.rain ?? 0);
      if (call) parts.push(t(call === "toWets" ? "live.spTyresToWets" : "live.spTyresToSlicks"));
      else {
        const per = engineer.tyreWear.perLap();
        if (per.every((x) => x == null)) parts.push(t("live.spTyreChangeUnknown"));
        else {
          const { strat, info } = currentPitWindow(d);
          const stint = nextStintLaps(d, info?.limitedBy === "energy") ?? info?.rangeLaps ?? null;
          if (stint == null) return noData;
          const plan = tyreChangePlan(wear, per, stint, strat?.sessionLapsLeft ?? null);
          const wheel = (id: WheelId) => t(`live.spWheel${id[0].toUpperCase()}${id[1]}`);
          if (!plan.change.length) parts.push(t(plan.toFinish ? "live.spTyreChangeFinish" : "live.spTyreChangeNone"));
          else if (plan.change.length === 4) parts.push(t("live.spTyreChangeAll"));
          else parts.push(t("live.spTyreChangeSome", { list: plan.change.map(wheel).join(t("live.spAnd")) }));
          if (!plan.change.length) return parts.join(". ");
        }
      }
      const me2 = meOf(d);
      const cls = me2?.vehicle_class ?? "";
      const warm = engineer.warmup.median(cls) ?? engineer.warmupPrior[`${d.session!.track}::${cls}`] ?? null;
      if (warm != null && warm >= 1) parts.push(t("live.spTyreWarmup", { s: Math.round(warm) }));
      return parts.join(", ");
    }

    case "ackBox":
      engineer.pit.ack(p.total_laps);
      return t("live.spAck");

    case "stayOut":
      engineer.pit.stayOut(p.total_laps);
      return t("live.spStayOut");

    case "watchCancel": {
      const n = engineer.watches.clear();
      return n > 0 ? t("live.spWatchCancel", { count: n }) : t("live.spWatchNone");
    }

    case "watch":
      return t("live.spWatchUnknown");

    // ── Régimes radio (« on se bat », « juste l'essentiel »…) ────────────────
    case "radioBattle":
      engineer.policy.setRegime("battle", p.total_laps, p.num_pitstops);
      return t("live.aRadioBattle");
    case "radioHome":
      engineer.policy.setRegime("home", p.total_laps, p.num_pitstops);
      return t("live.aRadioHome");
    case "radioEssential":
      engineer.policy.setRegime("essential", p.total_laps, p.num_pitstops);
      return t("live.aRadioEssential");
    case "radioQuiet": {
      const until = e?.lap && e.lap > p.total_laps ? e.lap : undefined;
      engineer.policy.setRegime("quiet", p.total_laps, p.num_pitstops, until);
      return until ? t("live.aRadioQuietUntil", { n: until }) : t("live.aRadioQuiet");
    }
    case "radioNormal":
      engineer.policy.setRegime("normal", p.total_laps, p.num_pitstops);
      return t("live.aRadioNormal");

    // ── Coaching de pilotage (mesures du coach par virage) ───────────────────
    case "coachMe":
    case "whereLose": {
      const losses = coachCornerLosses().filter((l) => l.meanDt >= LOSS_MIN_S);
      if (!losses.length) return t("live.aCoachNone");
      const tenths = (s: number) => Math.max(1, Math.round(s * 10));
      if (intent === "whereLose") {
        return t("live.aWhereLose", { n: losses[0].n, d: tenths(losses[0].meanDt) });
      }
      const items = losses.slice(0, 2).map((l) =>
        l.tip
          ? t("live.aCoachMeTip", { tip: t(`live.${l.tip.suffix}`, l.tip.vars), d: tenths(l.meanDt) })
          : t("live.aCoachMeItem", { n: l.n, d: tenths(l.meanDt) }),
      );
      return t("live.aCoachMe", { list: items.join(". ") });
    }

    default:
      return buildAnswer(intent, d, t, o.pitLossSec, o.fuelReserveLaps, o.classPositions ?? true);
  }
}

// ── Alertes « préviens-moi » : résolution de cible + textes ─────────────────

/** Résout la cible d'une alerte de rival (nom du pilote) ; null si introuvable. */
function resolveWatchTarget(
  d: LiveData,
  spec: Extract<WatchSpec, { kind: "rivalPit" }>,
  e: Entities,
  norm: string,
): string | null {
  const me = meOf(d);
  if (!me) return null;
  if (spec.target === "entity") {
    const cited = findCited(d, e, norm);
    if (cited) return cited.driver;
    if (e.pos) return findAtPosition(d, e.pos, targetClass(d, me, e))?.driver ?? null;
    return null;
  }
  if (spec.target === "leader") return findAtPosition(d, 1, targetClass(d, me, e))?.driver ?? null;
  return classNeighbor(d, me, spec.target === "ahead" ? -1 : 1)?.driver ?? null;
}

/** Libellé d'une condition, forme « pose » (après « quand ») ou « déclenchement ». */
export function watchText(t: Tr, c: WatchCond, form: "set" | "fire"): string {
  const k = `live.w${form === "set" ? "Set" : "Fire"}`;
  switch (c.kind) {
    case "timeLeft":
      return t(`${k}TimeLeft`, { count: c.minutes });
    case "lapsLeft":
      return t(`${k}LapsLeft`, { count: c.laps });
    case "fuelLaps":
      return t(`${k}FuelLaps`, { count: c.laps });
    case "rivalPit":
      return t(`${k}RivalPit`, { name: radioName(c.driver) });
    case "gapAhead":
      return t(`${k}GapAhead`, { count: c.seconds });
    case "gapBehind":
      return t(`${k}GapBehind`, { count: c.seconds });
    case "rain":
      return t(`${k}Rain`);
  }
}

/** Pose une alerte lue par le routeur ; renvoie la confirmation à dire. */
export function registerWatch(
  spec: WatchSpec | null,
  entities: Entities,
  norm: string,
  data: LiveData | null,
  t: Tr,
): string {
  if (!spec) return t("live.spWatchUnknown");
  let cond: WatchCond;
  if (spec.kind === "rivalPit") {
    if (!inSession(data)) return t("live.spNoSession");
    const driver = resolveWatchTarget(data, spec, entities, norm);
    if (!driver) return t("live.spWatchNoCar");
    cond = { kind: "rivalPit", driver };
  } else cond = spec;
  engineer.watches.add(cond);
  return t("live.spWatchSet", { what: watchText(t, cond, "set") });
}
