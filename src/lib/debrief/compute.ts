/**
 * Débrief **calculé** d'une session (module pur, sans IA).
 *
 * Tout vient du fichier de résultats déjà indexé (`SessionDetail`) : résultat en classe,
 * places gagnées (seulement si la grille est connue), arrêts comparés aux premiers de la
 * classe, bascules de position en classe tour par tour (avec ce qui s'est passé dans ce
 * tour), pertes par secteur sur les tours propres, usure du dernier relais, limites de
 * piste, pénalités, contacts, et les **familles de défaut** d'une liste fermée.
 *
 * Règles d'honnêteté : une valeur qu'on ne sait pas mesurer vaut `null` (jamais un 0
 * inventé) ; une famille n'est retenue que sur un fait mesuré ; ce qui n'est pas mesuré
 * n'est pas reproché. Le même débrief sert à la page Session, à l'analyse IA (seule
 * source de ces chiffres) et au défaut récurrent (`recurring.ts`).
 */

import type { LapRow, ResultRow, SessionDetail, StreamEventRow } from "@/lib/api";
import { computeRegularity } from "@/lib/regularity";

export type DebriefStatus = "finished" | "dnf" | "dq" | "unknown";

/** Familles de défaut (liste fermée : une famille n'existe que si un fait la fonde). */
export type DefectFamily =
  | "dnf"
  | "placesLost"
  | "weakSector"
  | "trackLimits"
  | "penalty"
  | "contacts"
  | "inconsistent";

export const DEFECT_FAMILIES: DefectFamily[] = [
  "dnf",
  "placesLost",
  "weakSector",
  "trackLimits",
  "penalty",
  "contacts",
  "inconsistent",
];

export interface DefectFact {
  family: DefectFamily;
  /** Chiffres qui fondent le constat (le pilote doit pouvoir le relire). */
  facts: Record<string, number | string | null>;
}

export interface PositionSwing {
  lap: number;
  from: number;
  to: number;
  /** > 0 = places gagnées. */
  delta: number;
  /** Ce qui s'est passé dans ce tour (arrêt, contact, limites), si connu. */
  cause: "pit" | "contact" | "trackLimits" | "penalty" | null;
}

export interface SectorLoss {
  sector: 1 | 2 | 3;
  /** Médiane des tours propres − meilleur secteur (s). */
  lossS: number;
}

export interface Debrief {
  isRace: boolean;
  status: DebriefStatus;
  driver: string;
  carClass: string;
  classPos: number | null;
  classCount: number | null;
  overallPos: number | null;
  /** Place de départ en classe, null si la grille n'est pas connue. */
  gridClassPos: number | null;
  /** > 0 = gagnées ; null sans grille fiable. */
  placesGained: number | null;
  bestLap: number | null;
  optimalLap: number | null;
  classBestLap: number | null;
  classBestDriver: string | null;
  laps: number;
  stops: number;
  /** Médiane des arrêts des 3 premiers de la classe à l'arrivée (course seulement). */
  topClassStops: number | null;
  topClassCount: number;
  cleanLaps: number;
  medianLap: number | null;
  stdDev: number | null;
  /** Part des tours propres à moins de 0,5 s du meilleur (0..1). */
  within05: number | null;
  sectorLosses: SectorLoss[];
  swings: PositionSwing[];
  /** Usure moyenne des 4 pneus par tour sur le dernier relais (% de gomme), ≥ 8 tours. */
  lastStintWearPct: number | null;
  lastStintLaps: number;
  /** Temps perdu par arrêt (s) : tours d'entrée + de sortie − 2 × tour propre médian. */
  pitLossS: number | null;
  trackLimits: number;
  penalties: number;
  contacts: number;
  families: DefectFact[];
}

// ── Seuils (documentés, bornés) ─────────────────────────────────────────────

/** Sous 2 places, un recul depuis la grille est du bruit de premier tour. */
export const PLACES_LOST_MIN = 2;
/** Une bascule de position en classe d'un tour à l'autre (places). */
export const SWING_MIN = 2;
export const SWINGS_MAX = 4;
/** Secteur faible : perte médiane ≥ 0,3 s et ≥ la moitié des pertes cumulées. */
export const WEAK_SECTOR_MIN_S = 0.3;
export const WEAK_SECTOR_SHARE = 0.5;
export const TRACK_LIMITS_MIN = 3;
export const CONTACTS_MIN = 2;
/** Régularité : au moins 5 tours propres, moins de 40 % à 0,5 s du meilleur. */
export const INCONSISTENT_MIN_LAPS = 5;
export const INCONSISTENT_SHARE = 0.4;
/** Usure du dernier relais : rien sous 8 tours propres. */
export const WEAR_MIN_LAPS = 8;
/** Perte au stand plausible (s) : au-delà, un arrêt long (réparations) ou une donnée fausse. */
export const PIT_LOSS_BAND: [number, number] = [8, 120];

// ── Aides ───────────────────────────────────────────────────────────────────

export function isRaceType(sessionType: string): boolean {
  return /race|course/i.test(sessionType || "");
}

export function statusOf(raw: string): DebriefStatus {
  const s = (raw || "").toLowerCase();
  if (s.includes("finished")) return "finished";
  if (s === "dnf" || s.includes("dnf") || s.includes("retired")) return "dnf";
  if (s === "dq" || s.includes("disq")) return "dq";
  return "unknown";
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const pos = (n: number | null | undefined) => (n != null && n > 0 ? n : null);

/** Tours propres : valides, hors stands, hors 1er tour, ≤ 107 % du meilleur. */
export function cleanLaps(laps: LapRow[]): (LapRow & { lap_time: number })[] {
  const ok = laps.filter(
    (l): l is LapRow & { lap_time: number } => l.is_valid && !l.is_pit && l.lap_num > 1 && l.lap_time != null && l.lap_time > 0,
  );
  if (!ok.length) return [];
  const best = Math.min(...ok.map((l) => l.lap_time));
  return ok.filter((l) => l.lap_time <= best * 1.07);
}

/** Pertes par secteur (médiane des tours propres − meilleur secteur), la plus grosse d'abord. */
export function sectorLosses(laps: LapRow[]): SectorLoss[] {
  const clean = cleanLaps(laps);
  if (clean.length < 3) return [];
  const out: SectorLoss[] = [];
  for (const n of [1, 2, 3] as const) {
    const xs = clean.map((l) => l[`s${n}`]).filter((v): v is number => v != null && v > 0);
    if (xs.length < 3) continue;
    const m = median(xs)!;
    out.push({ sector: n, lossS: Math.max(0, m - Math.min(...xs)) });
  }
  return out.sort((a, b) => b.lossS - a.lossS);
}

/**
 * Position **en classe** à la fin de chaque tour, depuis l'heure de fin de tour de
 * chaque voiture de la classe (`et` + chrono). Un tour sans heure connue est sauté.
 */
export function classPositionsByLap(laps: LapRow[], classDrivers: Set<string>, me: string): Map<number, number> {
  const done = new Map<number, { driver: string; at: number }[]>();
  for (const l of laps) {
    if (!classDrivers.has(l.driver_name) || l.et == null || l.lap_time == null || l.lap_time <= 0) continue;
    const arr = done.get(l.lap_num) ?? [];
    arr.push({ driver: l.driver_name, at: l.et + l.lap_time });
    done.set(l.lap_num, arr);
  }
  const out = new Map<number, number>();
  // Une voiture qui a un tour d'avance a bouclé ce tour plus tôt : l'ordre de passage
  // sur un même numéro de tour suffit, les retardataires n'ont simplement pas ce tour.
  for (const [lap, arr] of done) {
    const order = arr.sort((a, b) => a.at - b.at);
    const i = order.findIndex((x) => x.driver === me);
    if (i >= 0) out.set(lap, i + 1);
  }
  return out;
}

function lapOfEt(laps: LapRow[], et: number): number | null {
  let lap: number | null = null;
  for (const l of laps) if (l.et != null && l.et <= et) lap = l.lap_num;
  return lap;
}

/** Événements du joueur dans le flux du fichier de résultats, avec leur tour. */
export function playerEvents(stream: StreamEventRow[], me: string, myLaps: LapRow[]) {
  const limits = stream.filter((e) => e.event_type === "TrackLimits" && (e.text.split("|")[3] ?? "").trim() === me);
  const penalties = stream.filter((e) => e.event_type === "Penalty" && e.text.includes(me));
  const contacts = stream.filter((e) => e.event_type === "Incident" && e.text.includes(`${me}(`));
  const lapsOf = (xs: StreamEventRow[]) => new Set(xs.map((e) => lapOfEt(myLaps, e.et)).filter((x): x is number => x != null));
  return {
    limits: limits.length,
    penalties: penalties.length,
    contacts: contacts.length,
    limitLaps: lapsOf(limits),
    penaltyLaps: lapsOf(penalties),
    contactLaps: lapsOf(contacts),
  };
}

/** Bascules de position en classe d'au moins `SWING_MIN` places, les plus grosses d'abord. */
export function positionSwings(
  byLap: Map<number, number>,
  myLaps: LapRow[],
  ev: ReturnType<typeof playerEvents>,
): PositionSwing[] {
  const laps = [...byLap.keys()].sort((a, b) => a - b);
  const pits = new Set(myLaps.filter((l) => l.is_pit).map((l) => l.lap_num));
  const out: PositionSwing[] = [];
  for (let i = 1; i < laps.length; i++) {
    const a = byLap.get(laps[i - 1])!;
    const b = byLap.get(laps[i])!;
    const delta = a - b;
    if (Math.abs(delta) < SWING_MIN) continue;
    const lap = laps[i];
    const near = (s: Set<number>) => s.has(lap) || s.has(lap - 1);
    const cause = pits.has(lap) || pits.has(lap - 1)
      ? "pit"
      : near(ev.contactLaps)
        ? "contact"
        : near(ev.penaltyLaps)
          ? "penalty"
          : near(ev.limitLaps)
            ? "trackLimits"
            : null;
    out.push({ lap, from: a, to: b, delta, cause });
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.lap - y.lap).slice(0, SWINGS_MAX);
}

/** Usure moyenne par tour (% de gomme) sur le dernier relais propre, ≥ `WEAR_MIN_LAPS`. */
export function lastStintWear(myLaps: LapRow[]): { pct: number | null; laps: number } {
  const sorted = [...myLaps].sort((a, b) => a.lap_num - b.lap_num);
  let start = 0;
  sorted.forEach((l, i) => {
    if (l.is_pit) start = i + 1;
  });
  const stint = sorted.slice(start).filter((l) => l.twfl != null && l.twfr != null && l.twrl != null && l.twrr != null);
  if (stint.length < WEAR_MIN_LAPS + 1) return { pct: null, laps: stint.length };
  const avg = (l: LapRow) => ((l.twfl ?? 0) + (l.twfr ?? 0) + (l.twrl ?? 0) + (l.twrr ?? 0)) / 4;
  const first = stint[0];
  const last = stint[stint.length - 1];
  const n = last.lap_num - first.lap_num;
  if (n <= 0) return { pct: null, laps: stint.length };
  const pct = ((avg(first) - avg(last)) / n) * 100;
  return { pct: pct >= 0 && pct < 20 ? pct : null, laps: stint.length };
}

/**
 * Temps perdu par arrêt (s) : pour chaque arrêt, tour d'entrée + tour de sortie −
 * 2 × tour propre médian ; médiane des arrêts dans la bande plausible, sinon null.
 */
export function pitLoss(myLaps: LapRow[]): number | null {
  const clean = cleanLaps(myLaps);
  const ref = median(clean.map((l) => l.lap_time));
  if (ref == null) return null;
  const byNum = new Map(myLaps.map((l) => [l.lap_num, l]));
  const losses: number[] = [];
  for (const l of myLaps) {
    if (!l.is_pit) continue;
    const next = byNum.get(l.lap_num + 1);
    if (l.lap_time == null || !next?.lap_time) continue;
    const loss = l.lap_time + next.lap_time - 2 * ref;
    if (loss >= PIT_LOSS_BAND[0] && loss <= PIT_LOSS_BAND[1]) losses.push(loss);
  }
  return median(losses);
}

/** Médiane des arrêts des 3 premiers de la classe arrivés (course seulement). */
export function topClassStops(results: ResultRow[], carClass: string): { stops: number | null; n: number } {
  const top = results
    .filter((r) => r.car_class === carClass && statusOf(r.finish_status) === "finished" && r.class_position > 0)
    .sort((a, b) => a.class_position - b.class_position)
    .slice(0, 3);
  return { stops: top.length >= 2 ? median(top.map((r) => r.pitstops)) : null, n: top.length };
}

// ── Débrief ─────────────────────────────────────────────────────────────────

export function computeDebrief(detail: SessionDetail): Debrief | null {
  const me = detail.results.find((r) => r.is_player);
  if (!me) return null;
  const isRace = isRaceType(detail.session.session_type);
  const cls = me.car_class;
  const classRows = detail.results.filter((r) => r.car_class === cls);
  const classDrivers = new Set(classRows.map((r) => r.driver_name));
  const myLaps = detail.laps.filter((l) => l.driver_name === me.driver_name).sort((a, b) => a.lap_num - b.lap_num);
  const status = statusOf(me.finish_status);

  const classPos = pos(me.class_position);
  const gridClassPos = isRace ? pos(me.class_grid_pos) : null;
  const placesGained = isRace && status === "finished" && classPos != null && gridClassPos != null ? gridClassPos - classPos : null;

  let classBest: ResultRow | null = null;
  for (const r of classRows) if (r.best_lap && r.best_lap > 0 && (!classBest || r.best_lap < classBest.best_lap!)) classBest = r;

  const reg = computeRegularity(myLaps);
  const losses = sectorLosses(myLaps);
  const ev = playerEvents(detail.stream ?? [], me.driver_name, myLaps);
  const swings = isRace ? positionSwings(classPositionsByLap(detail.laps, classDrivers, me.driver_name), myLaps, ev) : [];
  const wear = lastStintWear(myLaps);
  const top = isRace ? topClassStops(detail.results, cls) : { stops: null, n: 0 };

  const d: Debrief = {
    isRace,
    status,
    driver: me.driver_name,
    carClass: cls,
    classPos,
    classCount: classRows.length || null,
    overallPos: pos(me.position),
    gridClassPos,
    placesGained,
    bestLap: me.best_lap && me.best_lap > 0 ? me.best_lap : null,
    optimalLap: me.optimal_lap && me.optimal_lap > 0 ? me.optimal_lap : null,
    classBestLap: classBest?.best_lap ?? null,
    classBestDriver: classBest?.driver_name ?? null,
    laps: me.laps_count,
    stops: me.pitstops,
    topClassStops: top.stops,
    topClassCount: top.n,
    cleanLaps: reg?.laps ?? 0,
    medianLap: reg?.median ?? null,
    stdDev: reg?.stdDev ?? null,
    within05: reg ? reg.within["0.5"] : null,
    sectorLosses: losses,
    swings,
    lastStintWearPct: wear.pct,
    lastStintLaps: wear.laps,
    pitLossS: me.pitstops > 0 ? pitLoss(myLaps) : null,
    trackLimits: ev.limits,
    penalties: ev.penalties,
    contacts: ev.contacts,
    families: [],
  };
  d.families = defectFamilies(d);
  return d;
}

/** Familles de défaut réellement constatées ([] = regardé, rien vu). */
export function defectFamilies(d: Debrief): DefectFact[] {
  const out: DefectFact[] = [];
  if (d.isRace && d.status === "dnf") out.push({ family: "dnf", facts: { laps: d.laps } });
  if (d.placesGained != null && d.placesGained <= -PLACES_LOST_MIN)
    out.push({ family: "placesLost", facts: { from: d.gridClassPos, to: d.classPos, lost: -d.placesGained } });
  const total = d.sectorLosses.reduce((a, s) => a + s.lossS, 0);
  const worst = d.sectorLosses[0];
  if (worst && worst.lossS >= WEAK_SECTOR_MIN_S && total > 0 && worst.lossS / total >= WEAK_SECTOR_SHARE)
    out.push({ family: "weakSector", facts: { sector: worst.sector, lossS: Math.round(worst.lossS * 1000) / 1000 } });
  if (d.trackLimits >= TRACK_LIMITS_MIN) out.push({ family: "trackLimits", facts: { count: d.trackLimits } });
  if (d.penalties >= 1) out.push({ family: "penalty", facts: { count: d.penalties } });
  if (d.contacts >= CONTACTS_MIN) out.push({ family: "contacts", facts: { count: d.contacts } });
  if (d.cleanLaps >= INCONSISTENT_MIN_LAPS && d.within05 != null && d.within05 < INCONSISTENT_SHARE)
    out.push({ family: "inconsistent", facts: { within05Pct: Math.round(d.within05 * 100), cleanLaps: d.cleanLaps } });
  return out;
}

const t3 = (s: number | null) => (s == null ? "N/A" : s.toFixed(3));
function lapTime(s: number | null): string {
  if (s == null) return "N/A";
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(3).padStart(6, "0")}`;
}

/**
 * Le débrief en texte compact pour l'analyse IA : chiffres déjà calculés, à reprendre
 * tels quels (le modèle ne les recalcule pas et n'en invente pas d'autres).
 */
export function debriefContextText(d: Debrief): string {
  const L: string[] = ["## Computed debrief (authoritative: computed by the app from the results file — use these numbers, do not recompute them)"];
  const res =
    d.classPos != null
      ? `Result: ${d.status} — P${d.classPos}${d.classCount ? `/${d.classCount}` : ""} in class${d.overallPos ? ` (P${d.overallPos} overall)` : ""}`
      : `Result: ${d.status}`;
  L.push(res);
  if (d.placesGained != null) L.push(`Class places from the grid: ${d.placesGained > 0 ? "+" : ""}${d.placesGained} (started P${d.gridClassPos})`);
  if (d.isRace)
    L.push(
      `Pit stops: ${d.stops}` +
        (d.topClassStops != null ? ` · class front-runners (top ${d.topClassCount}) made a median of ${d.topClassStops}` : "") +
        (d.pitLossS != null ? ` · measured time lost per stop ≈ ${d.pitLossS.toFixed(1)} s` : ""),
    );
  if (d.bestLap != null)
    L.push(
      `Best lap ${lapTime(d.bestLap)}` +
        (d.classBestLap != null ? ` · class best ${lapTime(d.classBestLap)} (gap ${(d.bestLap - d.classBestLap >= 0 ? "+" : "") + (d.bestLap - d.classBestLap).toFixed(3)} s)` : "") +
        (d.optimalLap != null ? ` · optimal ${lapTime(d.optimalLap)}` : ""),
    );
  if (d.cleanLaps > 0)
    L.push(
      `Clean laps: ${d.cleanLaps} · median ${lapTime(d.medianLap)} · std dev ${t3(d.stdDev)} s` +
        (d.within05 != null ? ` · ${Math.round(d.within05 * 100)}% within 0.5 s of best` : ""),
    );
  if (d.sectorLosses.length)
    L.push(`Time left per sector (median clean lap − best sector): ${d.sectorLosses.map((s) => `S${s.sector} ${s.lossS.toFixed(3)} s`).join(" · ")}`);
  for (const s of d.swings)
    L.push(`Lap ${s.lap}: class position P${s.from} → P${s.to} (${s.delta > 0 ? "+" : ""}${s.delta})${s.cause ? ` — ${s.cause}` : ""}`);
  if (d.lastStintWearPct != null) L.push(`Last stint tyre wear: ${d.lastStintWearPct.toFixed(2)}% of rubber per lap (${d.lastStintLaps} laps)`);
  if (d.trackLimits || d.penalties || d.contacts)
    L.push(`Track-limit events: ${d.trackLimits} · penalties: ${d.penalties} · contacts: ${d.contacts}`);
  L.push(
    `Defect families found this session (closed list; only measured facts): ${
      d.families.length ? d.families.map((f) => `${f.family} ${JSON.stringify(f.facts)}`).join(" · ") : "none"
    }`,
  );
  return L.join("\n");
}
