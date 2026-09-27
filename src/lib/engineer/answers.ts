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
import { interp, nextRain, wetSession } from "./forecast";
import { normalize, type AnswerIntent, type Entities, type WatchSpec } from "./router";
import type { WatchCond } from "./watches";

/** Fenêtre de température « de travail » des pneus (°C, générique). */
export const TYRE_WINDOW: [number, number] = [75, 105];

export interface AnswerOpts {
  entities?: Entities;
  /** Question normalisée (résolution d'un nom de pilote cité). */
  norm?: string;
  pitLossSec: number;
  fuelReserveLaps: number;
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

/** Autonomie en énergie virtuelle (tours), si voiture WEC et mesurée. */
function energyLaps(d: LiveData): number | null {
  const ve = d.extended?.virtual_energy ?? 0;
  return ve > 0 ? engineer.energy.lapsRemaining(ve) : null;
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
  const f = engineer.forecast;
  const sc = d.session!;
  if (!f || !engineer.forecastValid || sc.end_et <= 0) return null;
  const key = wetSession(sc.session);
  const nodes = key ? f.data[key] : undefined;
  if (!nodes) return null;
  const frac = Math.min(1, Math.max(0, sc.session_time / sc.end_et));
  return { rain: nextRain(nodes, frac, sc.end_et) };
}

/** Température d'air annoncée par la prévision à l'instant présent (validation). */
export function forecastTempNow(d: LiveData): number | null {
  const f = engineer.forecast;
  const sc = d.session;
  if (!f || !sc || sc.end_et <= 0) return null;
  const key = wetSession(sc.session);
  const nodes = key ? f.data[key] : undefined;
  if (!nodes) return null;
  return interp(nodes, Math.min(1, Math.max(0, sc.session_time / sc.end_et))).Temperature;
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
      const tel = d.telemetry;
      const perStint =
        info.limitedBy === "energy"
          ? (() => {
              const per = engineer.energy.perLap();
              return per ? 1 / per : null;
            })()
          : tel && tel.fuel_consumption > 0 && tel.fuel_capacity > 0
            ? tel.fuel_capacity / tel.fuel_consumption
            : null;
      const n = stopsNeeded(strat.sessionLapsLeft, info.rangeLaps, perStint);
      if (n == null) return noData;
      return n === 0 ? t("live.spNoStopNeeded") : t("live.spStops", { count: n });
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

    default:
      return buildAnswer(intent, d, t, o.pitLossSec, o.fuelReserveLaps);
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
