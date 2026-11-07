/**
 * Accueil au circuit (sans IA) : à l'arrivée, l'ingénieur nomme le tracé. S'il est déjà
 * roulé avec cette classe, il ajoute la dernière course ici et le record (celui de cette
 * voiture si on le connaît), puis LA chose la plus utile (le secteur qui coûtait le plus,
 * sinon le chrono des premiers). Il donne enfin le meilleur temps de la communauté s'il
 * existe. Chaque chiffre est mesuré : ce qui n'est pas connu n'est pas dit.
 *
 * Rangé par **tracé** (`track_course` : Bahrain Outer ≠ Bahrain International) et par
 * classe. Les courses quittées en route (≥ 2 tours) comptent : le fichier de résultats du
 * jeu les garde. Les mêmes faits (temps perdu par arrêt mesuré, chrono des premiers,
 * record) sont joints au coach vocal (`trackHistoryBlock`).
 */

import { queries, type BestLapRow, type CareerRace } from "@/lib/api";
import { debriefOf } from "@/lib/debrief/load";
import { KNOWN_TRACK_NAMES } from "@/lib/ohne_speed";
import { loadCommunityBest } from "./paceTiers";
import { radioClass } from "./text";
import type { Pick } from "./debriefRadio";
import type { Tr } from "@/i18n";

/** Tours minimum pour qu'une course quittée compte. */
export const MIN_LAPS = 2;
/** Courses relues pour la perte au stand mesurée. */
const PIT_SAMPLES = 5;
/** Attente maximale du temps de la communauté : l'accueil ne dépend pas du réseau (ms). */
const COMMUNITY_TIMEOUT_MS = 1500;

function plain(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Le tracé du direct est-il celui de la ligne de la base ? (tracé, sinon lieu) */
export function sameCourse(live: string, row: { track: string; track_course: string }): boolean {
  const l = plain(live);
  if (!l) return false;
  return l === plain(row.track_course) || (!row.track_course && l === plain(row.track));
}

/**
 * Modèle de la voiture du direct. Le jeu ne donne que la livrée (« Team WRT 2026 #32:LM ») :
 * on la cherche dans les livrées déjà roulées, sinon on cherche un modèle dans son nom. Un
 * doute (deux modèles possibles) rend null : le record reste alors celui de la classe.
 */
export function carModelOf(vehicleName: string, bests: { car: string; livery: string }[]): string | null {
  const bare = (s: string) => plain((s || "").replace(/:[a-z0-9]+\s*$/i, ""));
  const live = bare(vehicleName);
  if (!live) return null;
  const only = (cars: string[]) => {
    const set = new Set(cars.filter(Boolean));
    return set.size === 1 ? [...set][0] : null;
  };
  const byLivery = bests.filter((b) => bare(b.livery) === live).map((b) => b.car);
  if (byLivery.length) return only(byLivery);
  return only(bests.filter((b) => plain(b.car) && ` ${live} `.includes(` ${plain(b.car)} `)).map((b) => b.car));
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface TrackHistory {
  track: string;
  carClass: string;
  lastRace: { classPos: number | null; classCount: number | null; laps: number; finished: boolean; timestamp: number } | null;
  /** Record perso sur ce tracé, toutes voitures de la classe. */
  record: number | null;
  /** Record perso sur ce tracé avec cette voiture (null si inconnu ou jamais roulée ici). */
  carRecord: number | null;
  /** Meilleur tour de la classe lors de la dernière course ici. */
  frontLap: number | null;
  /** Secteur qui coûtait le plus lors de la dernière course ici (famille `weakSector`). */
  weakSector: number | null;
  /** Temps perdu par arrêt, médiane mesurée sur les dernières courses ici (s). */
  pitLossS: number | null;
  /** Usure des pneus par tour au dernier relais, médiane des dernières courses ici (%). */
  wearPctPerLap: number | null;
}

let last: TrackHistory | null = null;

/**
 * Historique du tracé pour cette classe (null si rien n'est connu).
 * `readable` : la base a répondu, donc un historique vide veut bien dire « jamais roulé ici ».
 */
async function readHistory(
  track: string,
  carClass: string,
  vehicleName: string,
): Promise<{ history: TrackHistory | null; readable: boolean }> {
  const cls = radioClass(carClass);
  let readable = true;
  const unreadable = <T,>(fallback: T) => {
    readable = false;
    return fallback;
  };
  const [races, bests] = await Promise.all([
    queries.getCareerRaces().catch(() => unreadable([] as CareerRace[])),
    queries.getBestLaps().catch(() => unreadable([] as BestLapRow[])),
  ]);
  const here = races
    .filter((r) => sameCourse(track, r) && radioClass(r.car_class) === cls && r.laps >= MIN_LAPS)
    .sort((a, b) => a.timestamp - b.timestamp);
  const recs = bests.filter((b) => sameCourse(track, b) && radioClass(b.car_class) === cls && b.best_lap > 0);
  const record = recs.length ? Math.min(...recs.map((b) => b.best_lap)) : null;
  const model = carModelOf(vehicleName, bests);
  const carRecs = model ? recs.filter((b) => b.car === model) : [];
  const carRecord = carRecs.length ? Math.min(...carRecs.map((b) => b.best_lap)) : null;
  const lastRow = here[here.length - 1] ?? null;
  const d = lastRow ? await debriefOf(lastRow.session_id) : null;
  const losses: number[] = [];
  const wears: number[] = [];
  for (const r of here.slice(-PIT_SAMPLES)) {
    const x = r.session_id === lastRow?.session_id ? d : await debriefOf(r.session_id);
    if (x?.pitLossS != null) losses.push(x.pitLossS);
    if (x?.lastStintWearPct != null) wears.push(x.lastStintWearPct);
  }
  const weak = d?.families.find((f) => f.family === "weakSector");
  const h: TrackHistory = {
    track,
    carClass: cls,
    lastRace: lastRow
      ? {
          classPos: lastRow.class_position > 0 ? lastRow.class_position : null,
          classCount: lastRow.class_size > 0 ? lastRow.class_size : null,
          laps: lastRow.laps,
          finished: /finished/i.test(lastRow.finish_status),
          timestamp: lastRow.timestamp,
        }
      : null,
    record,
    carRecord,
    frontLap: d?.classBestLap ?? null,
    weakSector: weak ? Number(weak.facts.sector) : null,
    pitLossS: median(losses),
    wearPctPerLap: median(wears),
  };
  if (!h.lastRace && h.record == null) return { history: null, readable };
  last = h;
  return { history: h, readable };
}

/** Ce que l'accueil au circuit peut dire. */
export interface TrackArrival {
  track: string;
  history: TrackHistory | null;
  /** Jamais roulé ici avec cette classe, d'après une base lisible. */
  firstVisit: boolean;
  /** Meilleur temps de la communauté, piste sèche (null si inconnu ou indisponible). */
  communityBest: number | null;
}

/** Résultat de `work`, ou `fallback` s'il tarde : la suite n'attend pas au-delà de `ms`. */
export async function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((res) => {
    timer = setTimeout(() => res(fallback), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Temps de la communauté déjà reçus : une réponse arrivée trop tard sert à l'accueil suivant. */
const communityBests = new Map<string, number>();

/** Temps de la communauté, borné : un réseau lent ou absent n'empêche pas l'accueil. */
async function communityBestBounded(track: string, carClass: string): Promise<number | null> {
  const key = `${track}|${radioClass(carClass)}`;
  const known = communityBests.get(key);
  const fresh = loadCommunityBest(track, carClass)
    .then((v) => {
      if (v != null) communityBests.set(key, v);
      return v;
    })
    .catch(() => null);
  return known ?? within(fresh, COMMUNITY_TIMEOUT_MS, null);
}

/** Charge l'accueil. `withCommunity` : faux quand rien ne sera dit (en course, réglage coupé). */
export async function loadTrackArrival(
  track: string,
  carClass: string,
  vehicleName: string,
  withCommunity: boolean,
): Promise<TrackArrival> {
  const [{ history, readable }, communityBest] = await Promise.all([
    // Une course illisible ne doit pas priver le pilote de l'accueil : le circuit seul.
    readHistory(track, carClass, vehicleName).catch(() => ({ history: null, readable: false })),
    withCommunity ? communityBestBounded(track, carClass) : Promise.resolve(null),
  ]);
  return { track, history, firstVisit: readable && !history, communityBest };
}

/**
 * Faut-il redire l'accueil à ce (re)démarrage de séance ? Non en avançant dans un même
 * week-end (essais → qualif → course). Oui en revenant à une séance égale ou antérieure :
 * c'est une nouvelle épreuve, ou un redémarrage, même si le combo n'a pas changé.
 */
export function arrivalRearms(prevSession: number | null, session: number): boolean {
  return prevSession != null && session <= prevSession;
}

/** Nom du tracé pour la voix : sans le suffixe de championnat du jeu. */
export function spokenTrack(track: string): string {
  return (track || "")
    .replace(/_/g, " ")
    .replace(/[\s-]+(WEC|ELMS|IMSA)\s*$/i, "")
    .trim();
}

/** Noms que l'accueil peut dire : les circuits connus de l'app et ceux déjà roulés. */
export function arrivalTrackNames(rows: { track: string; track_course: string }[]): string[] {
  const all = [...KNOWN_TRACK_NAMES, ...rows.flatMap((r) => [r.track, r.track_course])];
  return [...new Set(all.map(spokenTrack).filter(Boolean))];
}

/** Dernier historique chargé (pour le contexte du coach vocal). */
export function lastTrackHistory(): TrackHistory | null {
  return last;
}

/** La mémoire du tracé (une à deux phrases), ou null si rien de connu. `skipFront` : pas le chrono des premiers. */
export function recallPhrase(
  h: TrackHistory,
  t: Tr,
  lapVoice: (s: number) => string,
  pick: Pick,
  skipFront = false,
): string | null {
  const say = (key: string, vars?: Record<string, unknown>) => pick(key, t(key, vars));
  const first: string[] = [];
  const lr = h.lastRace;
  if (lr && !lr.finished) first.push(say("live.vRecallQuit", { lap: lr.laps }));
  else if (lr && lr.classPos != null && lr.classCount != null)
    first.push(say("live.vRecallLast", { p: lr.classPos, n: lr.classCount }));
  if (h.carRecord != null) first.push(say("live.vRecallRecordCar", { time: lapVoice(h.carRecord) }));
  else if (h.record != null) first.push(say("live.vRecallRecord", { time: lapVoice(h.record) }));
  if (!first.length) return null;
  const out = [`${say("live.vRecallIntro")} ${first.join(", ")}.`];
  if (h.weakSector != null) out.push(say("live.vRecallSector", { s: h.weakSector }));
  else if (!skipFront && h.frontLap != null && (h.record == null || h.frontLap < h.record - 0.05))
    out.push(say("live.vRecallFront", { time: lapVoice(h.frontLap) }));
  return out.join(" ");
}

/** L'accueil complet : le circuit, la mémoire du tracé, le meilleur temps de la communauté. */
export function arrivalPhrase(a: TrackArrival, t: Tr, lapVoice: (s: number) => string, pick: Pick): string | null {
  const track = spokenTrack(a.track);
  if (!track) return null;
  const say = (key: string, vars?: Record<string, unknown>) => pick(key, t(key, vars));
  const best = a.communityBest;
  const out = [say(a.firstVisit ? "live.vArrivalFirst" : "live.vArrival", { track })];
  const recall = a.history ? recallPhrase(a.history, t, lapVoice, pick, best != null) : null;
  if (recall) out.push(recall);
  if (best != null) {
    const mine = a.history?.record ?? null;
    out.push(
      mine != null && mine <= best
        ? say("live.vArrivalCommunityTop")
        : say("live.vArrivalCommunity", { time: lapVoice(best) }),
    );
  }
  return out.join(" ");
}

/** Bloc joint au coach vocal : ce que l'app sait de ce tracé (chiffres mesurés). */
export function trackHistoryBlock(h: TrackHistory | null, track: string): string {
  if (!h || plain(h.track) !== plain(track)) return "";
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}`;
  const L = [`## History on this track (${h.carClass}, measured by the app)`];
  if (h.record != null) L.push(`Personal record here: ${fmt(h.record)}`);
  if (h.carRecord != null) L.push(`Personal record here with this car: ${fmt(h.carRecord)}`);
  if (h.lastRace)
    L.push(
      `Last race here: ${h.lastRace.finished ? `P${h.lastRace.classPos ?? "?"}/${h.lastRace.classCount ?? "?"} in class` : `left after ${h.lastRace.laps} laps`}`,
    );
  if (h.frontLap != null) L.push(`Class best lap in that race: ${fmt(h.frontLap)}`);
  if (h.weakSector != null) L.push(`Sector that cost the most then: S${h.weakSector}`);
  if (h.pitLossS != null) L.push(`Measured time lost per pit stop here: about ${h.pitLossS.toFixed(1)} s`);
  if (h.wearPctPerLap != null) L.push(`Measured tyre wear per lap here (last stints): about ${h.wearPctPerLap.toFixed(2)}% of rubber`);
  return L.length > 1 ? L.join("\n") : "";
}
