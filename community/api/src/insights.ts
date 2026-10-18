/**
 * Vues communautaires dérivées (veille 2026-10-17) : paliers de rythme calculés sur la
 * base, index des voitures, effet d'un patch, briefing des adversaires, rival de la
 * semaine. Même règle que `stats.ts` : UN tour par pilote et par combo (son meilleur
 * tour éligible) ; les lectures publiques ne renvoient que des agrégats, et l'anonymat
 * est respecté partout (un anonyme n'est jamais retrouvé par son nom).
 */
import { normalizeName } from "../../shared/src/session.js";
import type { Db } from "./db.js";
import { DEFAULT_FILTERS, percentile, publicDriver, type Filters } from "./stats.js";

/** Nombre de meilleurs pilotes moyennés pour la référence d'un combo. */
export const TIER_TOP_N = 5;
/** Nombre de meilleurs pilotes moyennés pour le temps d'une voiture (index voitures). */
export const CAR_TOP_N = 3;

const r3 = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 1000);
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Conditions d'éligibilité (mêmes règles que les classements). */
function eligible(f: Filters): string {
  const parts = ["s.status = 'ok'", "not i.hidden", f.conditions === "wet" ? "s.wet" : "not s.wet"];
  if (f.aids === "clean") parts.push("not s.brake_help", "not s.steer_help");
  if (f.mode === "online") parts.push("s.setting = 'Multiplayer'");
  if (f.mode === "offline") parts.push("s.setting <> 'Multiplayer'");
  if (f.session === "race") parts.push("s.session_type = 'Race'");
  if (f.session === "qualify") parts.push("s.session_type ilike 'qual%'");
  if (f.session === "practice") parts.push("(s.session_type ilike 'practice%' or s.session_type ilike 'warmup%')");
  return parts.join(" and ");
}

interface ComboBest {
  track: string;
  track_course: string;
  car_class: string;
  game_minor: string;
  install_id: string;
  car_model: string;
  best_time: number;
}

/**
 * Meilleur tour de chaque pilote, par combo ET par version (`game_minor`), dans l'ordre
 * des temps. `classes` : limite à ces classes ; `minor` : à ces versions.
 */
async function bestsByVersion(db: Db, f: Filters, opts: { classes?: string[]; minor?: string[]; perCar?: boolean } = {}) {
  const params: unknown[] = [];
  const el = eligible(f);
  let extra = "";
  if (opts.classes?.length) {
    params.push(opts.classes);
    extra += ` and s.car_class = any($${params.length}::text[])`;
  }
  if (opts.minor?.length) {
    params.push(opts.minor);
    extra += ` and s.game_minor = any($${params.length}::text[])`;
  }
  const car = opts.perCar ? ", s.car_model" : "";
  return db.query<ComboBest>(
    `select distinct on (s.track, s.track_course, s.car_class, s.game_minor${car}, s.install_id)
       s.track, s.track_course, s.car_class, s.game_minor, s.install_id, s.car_model, s.best_time
     from sessions s join installs i on i.id = s.install_id
     where ${el}${extra}
     order by s.track, s.track_course, s.car_class, s.game_minor${car}, s.install_id, s.best_time, s.received_at`,
    params,
  );
}

const comboId = (r: { track: string; track_course: string; car_class: string }) =>
  `${r.track}\u0000${r.track_course}\u0000${r.car_class}`;

/** Groupe des lignes par clé, en gardant l'ordre d'arrivée. */
function groupBy<T>(rows: T[], keyOf: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = m.get(k);
    if (g) g.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** Version retenue pour un combo : la plus récente qui a des temps. */
function latestOf<T extends { game_minor: string }>(rows: T[]): string {
  return rows.reduce((v, r) => (r.game_minor > v ? r.game_minor : v), "");
}

export interface TierReference {
  track: string;
  track_course: string;
  car_class: string;
  version: string;
  /** Moyenne des meilleurs tours des `TIER_TOP_N` pilotes les plus rapides (s). */
  reference: number;
  drivers: number;
  /** Moins de `TIER_TOP_N` pilotes : référence encore instable. */
  provisional: boolean;
}

/**
 * Référence de rythme de chaque combo, sur la version la plus récente du combo :
 * moyenne des meilleurs tours des 5 pilotes les plus rapides. Elle se recale donc toute
 * seule après un patch, dès que des pilotes roulent sur la nouvelle version.
 */
export async function tierReferences(db: Db, f: Filters = DEFAULT_FILTERS): Promise<TierReference[]> {
  const rows = await bestsByVersion(db, f);
  const out: TierReference[] = [];
  for (const group of groupBy(rows, comboId).values()) {
    const version = latestOf(group);
    const times = group
      .filter((r) => r.game_minor === version)
      .map((r) => r.best_time)
      .sort((a, b) => a - b);
    if (!times.length) continue;
    const top = times.slice(0, TIER_TOP_N);
    out.push({
      track: group[0].track,
      track_course: group[0].track_course,
      car_class: group[0].car_class,
      version,
      reference: r3(mean(top)) as number,
      drivers: times.length,
      provisional: times.length < TIER_TOP_N,
    });
  }
  return out.sort((a, b) => a.track.localeCompare(b.track) || a.track_course.localeCompare(b.track_course) || a.car_class.localeCompare(b.car_class));
}

/**
 * Index des voitures d'une classe : sur chaque tracé, le temps d'une voiture est la
 * moyenne des meilleurs tours de ses `CAR_TOP_N` pilotes les plus rapides ; 100 % = la
 * voiture la plus rapide du tracé. Version la plus récente de chaque tracé.
 */
export async function carIndex(db: Db, carClass: string, f: Filters = DEFAULT_FILTERS) {
  const rows = await bestsByVersion(db, f, { classes: [carClass], perCar: true });
  const layouts: { track: string; track_course: string }[] = [];
  const perCar = new Map<string, ({ time: number; pct: number; drivers: number } | null)[]>();
  for (const group of groupBy(rows, comboId).values()) {
    const version = latestOf(group);
    const byCar = groupBy(group.filter((r) => r.game_minor === version), (r) => r.car_model);
    const carTimes = [...byCar.entries()].map(([car, rs]) => {
      const ts = rs.map((r) => r.best_time).sort((a, b) => a - b).slice(0, CAR_TOP_N);
      return { car, time: mean(ts), drivers: rs.length };
    });
    // Un seul modèle sur ce tracé : rien à comparer.
    if (carTimes.length < 2) continue;
    const fastest = Math.min(...carTimes.map((c) => c.time));
    const col = layouts.length;
    layouts.push({ track: group[0].track, track_course: group[0].track_course });
    for (const c of carTimes) {
      if (!perCar.has(c.car)) perCar.set(c.car, []);
      const cells = perCar.get(c.car)!;
      while (cells.length < col) cells.push(null);
      cells.push({ time: r3(c.time) as number, pct: r2((c.time / fastest) * 100) as number, drivers: c.drivers });
    }
  }
  const cars = [...perCar.entries()]
    .map(([car_model, cells]) => {
      while (cells.length < layouts.length) cells.push(null);
      const pcts = cells.filter((c): c is NonNullable<typeof c> => c != null).map((c) => c.pct);
      return {
        car_model,
        avg_pct: r2(mean(pcts)) as number,
        worst_pct: r2(Math.max(...pcts)) as number,
        tracks: pcts.length,
        cells,
      };
    })
    .sort((a, b) => a.avg_pct - b.avg_pct || b.tracks - a.tracks);
  return { car_class: carClass, top_n: CAR_TOP_N, layouts, cars };
}

/** Versions présentes (la plus récente d'abord). */
async function versionsDesc(db: Db, f: Filters): Promise<string[]> {
  const params: unknown[] = [];
  const el = eligible(f);
  const rows = await db.query<{ v: string }>(
    `select distinct s.game_minor as v from sessions s join installs i on i.id = s.install_id where ${el} order by 1 desc`,
    params,
  );
  return rows.map((r) => r.v);
}

/**
 * Effet d'un patch : pour chaque pilote qui a roulé le même combo sur les deux versions,
 * écart entre ses meilleurs tours (b − a ; négatif = plus rapide après le patch).
 * Médianes par combo et sur l'ensemble. Défaut : les deux versions les plus récentes.
 */
export async function patchEffect(db: Db, opts: { from?: string; to?: string; carClass?: string } = {}, f: Filters = DEFAULT_FILTERS) {
  const versions = await versionsDesc(db, f);
  const to = opts.to ?? versions[0];
  const from = opts.from ?? versions.find((v) => v < (to ?? ""));
  if (!to || !from || from === to) return { from: from ?? null, to: to ?? null, versions, pairs: 0, drivers: 0, median_delta: null, median_pct: null, combos: [] };
  const rows = await bestsByVersion(db, f, { minor: [from, to], classes: opts.carClass ? [opts.carClass] : undefined });
  const combos = [];
  const allPct: number[] = [];
  const allDelta: number[] = [];
  const drivers = new Set<string>();
  for (const group of groupBy(rows, comboId).values()) {
    const byInstall = groupBy(group, (r) => r.install_id);
    const deltas: number[] = [];
    const pcts: number[] = [];
    for (const [inst, rs] of byInstall) {
      const a = rs.find((r) => r.game_minor === from);
      const b = rs.find((r) => r.game_minor === to);
      if (!a || !b) continue;
      deltas.push(b.best_time - a.best_time);
      pcts.push((b.best_time / a.best_time - 1) * 100);
      drivers.add(inst);
    }
    if (!deltas.length) continue;
    deltas.sort((x, y) => x - y);
    pcts.sort((x, y) => x - y);
    allDelta.push(...deltas);
    allPct.push(...pcts);
    combos.push({
      track: group[0].track,
      track_course: group[0].track_course,
      car_class: group[0].car_class,
      drivers: deltas.length,
      median_delta: r3(percentile(deltas, 0.5)),
      median_pct: r2(percentile(pcts, 0.5)),
    });
  }
  allDelta.sort((x, y) => x - y);
  allPct.sort((x, y) => x - y);
  combos.sort((a, b) => b.drivers - a.drivers || a.track.localeCompare(b.track));
  return {
    from,
    to,
    versions,
    pairs: allDelta.length,
    drivers: drivers.size,
    median_delta: r3(percentile(allDelta, 0.5)),
    median_pct: r2(percentile(allPct, 0.5)),
    combos,
  };
}

/**
 * Briefing : les pilotes d'une liste de noms (vus dans une séance), avec leur meilleur
 * tour sur le combo et leur position face à la référence. Seuls les pilotes qui
 * partagent sous leur nom sont renvoyés : un anonyme ou un nom inconnu sont absents,
 * sans qu'on puisse les distinguer.
 */
export async function briefing(db: Db, names: string[], combo: { track: string; course: string; carClass?: string }, f: Filters = DEFAULT_FILTERS) {
  const wanted = new Map<string, string>();
  for (const n of names) {
    const norm = normalizeName(n);
    if (norm && !wanted.has(norm)) wanted.set(norm, n);
  }
  if (!wanted.size) return { reference: null, drivers: 0, found: [] };
  const found = await db.query<{ name_norm: string; install_id: string; tag: string; display_name: string | null; homonym: boolean; nationality: string | null; avatar: string | null }>(
    `select c.name_norm, i.id as install_id, i.tag, i.display_name, i.homonym, i.nationality, i.avatar
     from name_claims c join installs i on i.id = c.install_id
     where c.name_norm = any($1::text[]) and not i.anonymous and not i.hidden`,
    [[...wanted.keys()]],
  );
  // Classement du combo (toutes versions, comme le classement par défaut).
  const params: unknown[] = [combo.track, combo.course];
  let cls = "";
  if (combo.carClass) {
    params.push(combo.carClass);
    cls = `and s.car_class = $${params.length}`;
  }
  const el = eligible(f);
  const bests = await db.query<{ install_id: string; best_time: number; car_model: string }>(
    `select * from (
       select distinct on (s.install_id) s.install_id, s.best_time, s.car_model, s.received_at
       from sessions s join installs i on i.id = s.install_id
       where s.track = $1 and s.track_course = $2 ${cls} and ${el}
       order by s.install_id, s.best_time, s.received_at
     ) b order by best_time, received_at`,
    params,
  );
  const times = bests.map((b) => b.best_time);
  const reference = times.length ? mean(times.slice(0, TIER_TOP_N)) : null;
  const out = found.map((d) => {
    const i = bests.findIndex((b) => b.install_id === d.install_id);
    const me = i >= 0 ? bests[i] : null;
    const rank = me ? times.filter((t) => t < me.best_time).length + 1 : null;
    return {
      query: wanted.get(d.name_norm) as string,
      driver: publicDriver({ anonymous: false, display_name: d.display_name, tag: d.tag, homonym: d.homonym, nationality: d.nationality, avatar: d.avatar }),
      best: me ? r3(me.best_time) : null,
      car_model: me?.car_model ?? null,
      rank,
      top_pct: rank ? Math.max(1, Math.ceil((rank / times.length) * 100)) : null,
      pct: me && reference ? r2((me.best_time / reference) * 100) : null,
    };
  });
  out.sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity));
  return { reference: r3(reference), provisional: times.length < TIER_TOP_N, drivers: times.length, found: out };
}

// ── Rival de la semaine ─────────────────────────────────────────────────────

/** Lundi (UTC) de la semaine d'une date « AAAA-MM-JJ ». */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Indice de rythme de chaque installation : médiane, sur ses combos, de son meilleur
 * tour rapporté à la référence du combo (100 = au niveau des 5 plus rapides).
 */
export async function driverIndexes(db: Db, f: Filters = DEFAULT_FILTERS): Promise<Map<string, number>> {
  const rows = await bestsByVersion(db, f);
  const pcts = new Map<string, number[]>();
  for (const group of groupBy(rows, comboId).values()) {
    const version = latestOf(group);
    const g = group.filter((r) => r.game_minor === version).sort((a, b) => a.best_time - b.best_time);
    const ref = mean(g.slice(0, TIER_TOP_N).map((r) => r.best_time));
    for (const r of g) {
      if (!pcts.has(r.install_id)) pcts.set(r.install_id, []);
      pcts.get(r.install_id)!.push((r.best_time / ref) * 100);
    }
  }
  const out = new Map<string, number>();
  for (const [id, xs] of pcts) out.set(id, percentile(xs.sort((a, b) => a - b), 0.5) as number);
  return out;
}

/**
 * Crée les duels de la semaine s'ils n'existent pas : pilotes inscrits, rangés par
 * indice de rythme, appariés deux à deux (le dernier, si impair, attend un partenaire).
 * Un inscrit arrivé en cours de semaine est apparié avec un autre pilote encore seul.
 */
export async function ensureRivalPairs(db: Db, week: string, installId?: string): Promise<void> {
  const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from rival_pairs where week = $1", [week]);
  if (n === 0) {
    const opted = await db.query<{ id: string }>("select id from installs where rival_opt_in and not hidden");
    if (opted.length) {
      const idx = await driverIndexes(db);
      const sorted = opted
        .map((o) => ({ id: o.id, idx: idx.get(o.id) }))
        .filter((o) => o.idx != null)
        .sort((a, b) => (a.idx as number) - (b.idx as number) || a.id.localeCompare(b.id));
      await db.transaction(async (tx) => {
        for (let i = 0; i < sorted.length; i += 2) {
          const a = sorted[i].id;
          const b = sorted[i + 1]?.id ?? null;
          await tx.query("insert into rival_pairs (week, install_id, rival_id) values ($1, $2, $3) on conflict do nothing", [week, a, b]);
          if (b) await tx.query("insert into rival_pairs (week, install_id, rival_id) values ($1, $2, $3) on conflict do nothing", [week, b, a]);
        }
      });
    }
  }
  if (!installId) return;
  const [mine] = await db.query<{ rival_id: string | null }>("select rival_id from rival_pairs where week = $1 and install_id = $2", [week, installId]);
  if (mine?.rival_id) return;
  const [me] = await db.query<{ rival_opt_in: boolean }>("select rival_opt_in from installs where id = $1", [installId]);
  if (!me?.rival_opt_in) return;
  // Pas encore apparié cette semaine : un autre inscrit encore seul, s'il y en a un.
  await db.transaction(async (tx) => {
    const [other] = await tx.query<{ install_id: string }>(
      `select p.install_id from rival_pairs p join installs i on i.id = p.install_id
       where p.week = $1 and p.rival_id is null and p.install_id <> $2 and i.rival_opt_in and not i.hidden
       order by p.created_at limit 1`,
      [week, installId],
    );
    await tx.query(
      `insert into rival_pairs (week, install_id, rival_id) values ($1, $2, $3)
       on conflict (week, install_id) do update set rival_id = excluded.rival_id`,
      [week, installId, other?.install_id ?? null],
    );
    if (other) await tx.query("update rival_pairs set rival_id = $3 where week = $1 and install_id = $2", [week, other.install_id, installId]);
  });
}

/** Points d'une semaine : victoire 3, nul 1 (au moins un combo commun), défaite 0. */
function weekPoints(wins: number, losses: number, ties: number): number | null {
  if (wins + losses + ties === 0) return null;
  return wins > losses ? 3 : wins === losses ? 1 : 0;
}

/** Duel d'une semaine : combos roulés par les deux pilotes cette semaine-là. */
async function duel(db: Db, week: string, me: string, rival: string, f: Filters = DEFAULT_FILTERS) {
  const params: unknown[] = [week, addDays(week, 6), [me, rival]];
  const el = eligible(f);
  const rows = await db.query<ComboBest>(
    `select distinct on (s.track, s.track_course, s.car_class, s.install_id)
       s.track, s.track_course, s.car_class, s.game_minor, s.install_id, s.car_model, s.best_time
     from sessions s join installs i on i.id = s.install_id
     where s.played_on between $1::date and $2::date and s.install_id = any($3::uuid[]) and ${el}
     order by s.track, s.track_course, s.car_class, s.install_id, s.best_time, s.received_at`,
    params,
  );
  const combos = [];
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const g of groupBy(rows, comboId).values()) {
    const mine = g.find((r) => r.install_id === me);
    const theirs = g.find((r) => r.install_id === rival);
    if (!mine || !theirs) continue;
    if (mine.best_time < theirs.best_time) wins++;
    else if (mine.best_time > theirs.best_time) losses++;
    else ties++;
    combos.push({ track: g[0].track, track_course: g[0].track_course, car_class: g[0].car_class, mine: r3(mine.best_time), theirs: r3(theirs.best_time) });
  }
  return { combos, wins, losses, ties, points: weekPoints(wins, losses, ties) };
}

async function driverOf(db: Db, id: string) {
  const [r] = await db.query<{ anonymous: boolean; display_name: string | null; tag: string; homonym: boolean; nationality: string | null; avatar: string | null }>(
    "select anonymous, display_name, tag, homonym, nationality, avatar from installs where id = $1",
    [id],
  );
  return r ? publicDriver(r) : null;
}

/** Nombre de semaines comptées dans le classement des duels. */
export const RIVAL_WEEKS = 12;

/**
 * État « rival de la semaine » d'une installation : inscription, duel en cours (combos
 * roulés par les deux depuis lundi), et bilan des semaines passées.
 */
export async function rivalStatus(db: Db, installId: string, today: string) {
  const [me] = await db.query<{ rival_opt_in: boolean }>("select rival_opt_in from installs where id = $1", [installId]);
  const week = weekStart(today);
  const base = { opted_in: !!me?.rival_opt_in, week, week_end: addDays(week, 6) };
  if (!me?.rival_opt_in) return { ...base, rival: null, current: null, history: [], points: 0 };
  await ensureRivalPairs(db, week, installId);
  const pairs = await db.query<{ week: string; rival_id: string | null }>(
    "select week::text as week, rival_id from rival_pairs where install_id = $1 and week > $2::date - 7 * $3::int order by week desc",
    [installId, week, RIVAL_WEEKS],
  );
  const cur = pairs.find((p) => p.week === week);
  const current = cur?.rival_id ? { rival: await driverOf(db, cur.rival_id), ...(await duel(db, week, installId, cur.rival_id)) } : null;
  const history = [];
  let points = 0;
  for (const p of pairs) {
    if (p.week === week || !p.rival_id) continue;
    const d = await duel(db, p.week, installId, p.rival_id);
    points += d.points ?? 0;
    history.push({ week: p.week, rival: await driverOf(db, p.rival_id), wins: d.wins, losses: d.losses, ties: d.ties, points: d.points });
  }
  return { ...base, rival: current?.rival ?? null, current, history, points };
}
