/**
 * Agrégats publics (COMMUNITY-SPEC.md §6). Règle de base : UN tour par pilote et par
 * combo — son meilleur tour éligible — puis statistiques sur ces meilleurs tours.
 * Les lectures publiques ne renvoient que des agrégats et le classement (noms
 * affichés au choix de chaque pilote), jamais de ligne brute.
 */
import type { Db } from "./db.js";

export interface ComboKey {
  track: string;
  course: string;
  /** Absent = toutes les classes : une ligne par pilote (son meilleur tour, quelle que soit la classe). */
  carClass?: string;
  /**
   * Versions « majeure.mineure » retenues : une ou plusieurs (["1.42", "1.41"]) ou
   * "all" (toutes). Absent = la plus récente du combo.
   */
  version?: string[] | "all" | "latest";
}

export interface Filters {
  /** clean : sans aide au freinage ni à la direction (défaut) ; all : tout. */
  aids: "clean" | "all";
  conditions: "dry" | "wet";
  /** Exclut une installation (bornes anti-abus : on ne se borne pas soi-même). */
  excludeInstall?: string;
  /** Une seule voiture (`car_model`). */
  car?: string;
  /** Type de session : course, qualification, essais. */
  session?: "race" | "qualify" | "practice";
  /** online = parties en ligne (« Multiplayer ») ; offline = hors ligne (week-end de course…). */
  mode?: "online" | "offline";
}

export const DEFAULT_FILTERS: Filters = { aids: "clean", conditions: "dry" };

/** Seuil de pilotes distincts à partir duquel un combo est « classé » (spec §9). */
export const RANKED_MIN_DRIVERS = 20;

const HIST_WIDTH = 0.5;
const HIST_MAX_BINS = 60;

/**
 * Conditions d'éligibilité + filtres. Les valeurs libres (voiture) passent par des
 * paramètres ajoutés à `params` ; les autres sont des énumérations validées en amont.
 */
/** Condition de classe (vide = toutes les classes). */
function classCond(key: ComboKey, params: unknown[]): string {
  if (!key.carClass) return "";
  params.push(key.carClass);
  return `and s.car_class = $${params.length}`;
}

function eligibility(f: Filters, params: unknown[]): string {
  const parts = [
    "s.status = 'ok'",
    "not i.hidden",
    f.conditions === "wet" ? "s.wet" : "not s.wet",
  ];
  if (f.aids === "clean") parts.push("not s.brake_help", "not s.steer_help");
  if (f.car) {
    params.push(f.car);
    parts.push(`s.car_model = $${params.length}`);
  }
  if (f.session === "race") parts.push("s.session_type = 'Race'");
  if (f.session === "qualify") parts.push("s.session_type ilike 'qual%'");
  if (f.session === "practice") parts.push("(s.session_type ilike 'practice%' or s.session_type ilike 'warmup%')");
  if (f.mode === "online") parts.push("s.setting = 'Multiplayer'");
  if (f.mode === "offline") parts.push("s.setting <> 'Multiplayer'");
  return parts.join(" and ");
}

/** Percentile continu (interpolation linéaire, comme `percentile_cont`). */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const r3 = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 1000);

interface BestRow {
  install_id: string;
  car_class: string;
  best_time: number;
  car_model: string;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  /** Meilleurs secteurs de la session du meilleur tour (leur somme = tour idéal). */
  best_s1: number | null;
  best_s2: number | null;
  best_s3: number | null;
  top_speed: number | null;
  median_lap: number | null;
  valid_laps: number;
  compound_f: string | null;
  compound_r: string | null;
  session_type: string;
  setting: string;
  game_version: string;
  played_on: string;
  tag: string;
  anonymous: boolean;
  display_name: string | null;
  homonym: boolean;
  nationality: string | null;
  avatar: string | null;
}

/** Versions disponibles d'un combo, la plus récente d'abord. */
export async function comboVersions(db: Db, key: ComboKey, f: Filters) {
  const params: unknown[] = [key.track, key.course];
  const cls = classCond(key, params);
  const el = eligibility(f, params);
  return db.query<{ version: string; drivers: number }>(
    `select s.game_minor as version, count(distinct s.install_id)::int as drivers
     from sessions s join installs i on i.id = s.install_id
     where s.track = $1 and s.track_course = $2 ${cls} and ${el}
     group by 1 order by 1 desc`,
    params,
  );
}

/** Versions effectivement retenues (la plus récente par défaut). Vide = combo inconnu. */
async function resolveVersions(db: Db, key: ComboKey, f: Filters): Promise<string[]> {
  if (Array.isArray(key.version) && key.version.length) return key.version;
  const v = await comboVersions(db, key, f);
  // Par défaut : toutes les versions (comme le filtre « Toutes » de l'app et du site).
  if (key.version === "latest") return v[0] ? [v[0].version] : [];
  return v.map((x) => x.version);
}

/**
 * Meilleur tour éligible de chaque pilote sur le combo, du plus rapide au plus lent.
 * Toutes classes (`carClass` absent) : son meilleur tour toutes classes confondues — un
 * pilote reste UN pilote (compteurs, rang, médiane) ; la classe de ce tour est renvoyée.
 */
async function bestPerDriver(db: Db, key: ComboKey, versions: string[], f: Filters): Promise<BestRow[]> {
  const params: unknown[] = [key.track, key.course];
  const cls = classCond(key, params);
  params.push(versions);
  const vi = params.length;
  let exclude = "";
  if (f.excludeInstall) {
    params.push(f.excludeInstall);
    exclude = `and s.install_id <> $${params.length}`;
  }
  const el = eligibility(f, params);
  return db.query<BestRow>(
    `select * from (
       select distinct on (s.install_id)
         s.install_id, s.car_class, s.best_time, s.car_model, s.s1, s.s2, s.s3, s.game_version,
         s.best_s1, s.best_s2, s.best_s3, s.top_speed, s.median_lap, s.valid_laps,
         s.compound_f, s.compound_r, s.session_type, s.setting,
         s.played_on::text as played_on, s.received_at,
         i.tag, i.anonymous, i.display_name, i.homonym, i.nationality, i.avatar
       from sessions s join installs i on i.id = s.install_id
       where s.track = $1 and s.track_course = $2 ${cls} and s.game_minor = any($${vi}::text[])
         and ${el} ${exclude}
       order by s.install_id, s.best_time, s.received_at
     ) b
     order by best_time, received_at`,
    params,
  );
}

/** Statistiques minimales d'un combo (bornes anti-abus à la réception). */
export async function comboStats(db: Db, key: ComboKey, f: Filters) {
  const versions = await resolveVersions(db, key, f);
  if (!versions.length) return { drivers: 0, p01: null, median: null };
  const times = (await bestPerDriver(db, key, versions, f)).map((r) => r.best_time);
  return { drivers: times.length, p01: percentile(times, 0.01), median: percentile(times, 0.5) };
}

/** Détail d'un combo : percentiles, histogramme, répartition par voiture, versions. */
export async function comboDetail(db: Db, key: ComboKey, f: Filters) {
  const versions = await comboVersions(db, key, f);
  const selected = await resolveVersions(db, key, f);
  if (!selected.length) return null;
  const rows = await bestPerDriver(db, key, selected, f);
  if (rows.length === 0) return null;
  const times = rows.map((r) => r.best_time);

  const start = Math.floor(times[0] / HIST_WIDTH) * HIST_WIDTH;
  const upper = percentile(times, 0.99) ?? times[times.length - 1];
  const bins = Math.min(HIST_MAX_BINS, Math.max(1, Math.floor((upper - start) / HIST_WIDTH) + 1));
  const counts = new Array<number>(bins).fill(0);
  let overflow = 0;
  for (const t of times) {
    const b = Math.floor((t - start) / HIST_WIDTH);
    if (b < bins) counts[b]++;
    else overflow++;
  }

  const byCar = new Map<string, number[]>();
  for (const r of rows) byCar.set(r.car_model, [...(byCar.get(r.car_model) ?? []), r.best_time]);

  const lapParams: unknown[] = [key.track, key.course];
  const lapCls = classCond(key, lapParams);
  lapParams.push(selected);
  const lapVi = lapParams.length;
  const lapEl = eligibility(f, lapParams);
  const [{ laps }] = await db.query<{ laps: number }>(
    `select coalesce(sum(s.valid_laps), 0)::int as laps
     from sessions s join installs i on i.id = s.install_id
     where s.track = $1 and s.track_course = $2 ${lapCls} and s.game_minor = any($${lapVi}::text[])
       and ${lapEl}`,
    lapParams,
  );

  return {
    track: key.track,
    course: key.course,
    car_class: key.carClass ?? null,
    /** Versions retenues, séparées par des virgules (« 1.42 » ou « 1.41,1.42 »). */
    version: selected.join(","),
    selected,
    versions,
    drivers: rows.length,
    ranked: rows.length >= RANKED_MIN_DRIVERS,
    valid_laps: laps,
    best: { time: rows[0].best_time, car_model: rows[0].car_model },
    percentiles: Object.fromEntries(
      [1, 5, 10, 25, 50, 75, 90].map((p) => [`p${p}`, r3(percentile(times, p / 100))]),
    ),
    histogram: { start: r3(start), width: HIST_WIDTH, counts, overflow },
    by_car: [...byCar.entries()]
      .map(([car_model, ts]) => ({ car_model, drivers: ts.length, best: ts[0], median: r3(percentile(ts, 0.5)) }))
      .sort((a, b) => a.best - b.best),
  };
}

/**
 * Pilote tel qu'affiché publiquement. Anonyme : aucun nom, pays ni avatar, seulement le
 * repère (« Pilote #a3f9 » côté client, localisé).
 */
export const publicDriver = (r: { anonymous: boolean; display_name: string | null; tag: string; homonym: boolean; nationality: string | null; avatar: string | null }) => ({
  name: r.anonymous ? null : r.display_name,
  tag: r.tag,
  homonym: !r.anonymous && r.homonym,
  country: r.anonymous ? null : r.nationality,
  avatar: r.anonymous ? null : r.avatar,
});
const driverOf = (r: BestRow) => publicDriver(r);

/** Rang « compétition » (ex-æquo au même rang) de lignes triées par temps. */
function ranks(rows: BestRow[]): number[] {
  let rank = 0;
  return rows.map((r, i) => (i === 0 || r.best_time > rows[i - 1].best_time ? (rank = i + 1) : rank));
}

/**
 * Classement d'un combo (rang « compétition » : ex-æquo au même rang). `name` : ne
 * garde que les pilotes dont le nom contient ce texte (rang réel conservé) — pour
 * retrouver vite son temps. Les anonymes ne sont jamais trouvés par nom.
 * `tag` : renvoie en plus la ligne de ce pilote (`me`, `null` s'il n'a pas de temps ici) —
 * « Ma position » épinglée au-dessus du tableau. Le repère est déjà public sur chaque ligne.
 */
export async function leaderboard(
  db: Db,
  key: ComboKey,
  f: Filters,
  limit: number,
  offset: number,
  name?: string,
  tag?: string,
) {
  const versions = await resolveVersions(db, key, f);
  if (!versions.length) return null;
  const rows = await bestPerDriver(db, key, versions, f);
  const rk = ranks(rows);
  const ranked = rows.map((r, i) => ({
    rank: rk[i],
    driver: driverOf(r),
    car_class: r.car_class,
    car_model: r.car_model,
    time: r.best_time,
    s1: r.s1,
    s2: r.s2,
    s3: r.s3,
    game_version: r.game_version,
    played_on: r.played_on,
  }));
  const needle = name?.trim().toLowerCase();
  const list = needle
    ? ranked.filter((r) => r.driver.name != null && r.driver.name.toLowerCase().includes(needle))
    : ranked;
  const me = tag ? (ranked.find((r) => r.driver.tag === tag) ?? null) : undefined;
  return { version: versions.join(","), drivers: rows.length, matches: list.length, rows: list.slice(offset, offset + limit), me };
}

/**
 * Comparaison de pilotes sur un combo (fenêtre ouverte d'un clic sur un pseudo, app et
 * site) : pour chaque repère, sa ligne du classement complétée par le détail de son
 * meilleur tour (meilleurs secteurs de la session, vitesse de pointe, rythme médian,
 * pneus, type de session) et son expérience du combo (sessions et tours valides, mêmes
 * filtres). Les aides de pilotage ne sont pas publiées. Repère sans temps ici : absent.
 */
export async function compare(db: Db, key: ComboKey, f: Filters, tags: string[]) {
  const versions = await resolveVersions(db, key, f);
  if (!versions.length) return null;
  const rows = await bestPerDriver(db, key, versions, f);
  const rk = ranks(rows);
  const params: unknown[] = [key.track, key.course];
  const cls = classCond(key, params);
  params.push(versions);
  const vi = params.length;
  const el = eligibility(f, params);
  params.push(tags);
  const ti = params.length;
  const exp = await db.query<{ tag: string; sessions: number; laps: number }>(
    `select i.tag, count(*)::int as sessions, coalesce(sum(s.valid_laps), 0)::int as laps
     from sessions s join installs i on i.id = s.install_id
     where s.track = $1 and s.track_course = $2 ${cls} and s.game_minor = any($${vi}::text[])
       and ${el} and i.tag = any($${ti}::text[])
     group by i.tag`,
    params,
  );
  const expOf = new Map(exp.map((e) => [e.tag, e]));
  const out = [];
  for (const tag of tags) {
    const i = rows.findIndex((r) => r.tag === tag);
    if (i < 0) continue;
    const r = rows[i];
    out.push({
      rank: rk[i],
      driver: driverOf(r),
      car_class: r.car_class,
      car_model: r.car_model,
      time: r.best_time,
      s1: r.s1,
      s2: r.s2,
      s3: r.s3,
      best_s1: r.best_s1,
      best_s2: r.best_s2,
      best_s3: r.best_s3,
      top_speed: r.top_speed,
      median_lap: r.median_lap,
      valid_laps: r.valid_laps,
      compound_f: r.compound_f,
      compound_r: r.compound_r,
      session_type: r.session_type,
      setting: r.setting,
      game_version: r.game_version,
      played_on: r.played_on,
      combo_sessions: expOf.get(tag)?.sessions ?? 0,
      combo_laps: expOf.get(tag)?.laps ?? 0,
    });
  }
  return { version: versions.join(","), drivers: rows.length, rows: out };
}

/** Position d'un temps dans un combo (l'app place le joueur sans tout télécharger). */
export async function position(db: Db, key: ComboKey, f: Filters, time: number) {
  const versions = await resolveVersions(db, key, f);
  if (!versions.length) return null;
  const times = (await bestPerDriver(db, key, versions, f)).map((r) => r.best_time);
  if (times.length === 0) return null;
  const faster = times.filter((t) => t < time).length;
  const rank = faster + 1;
  return {
    version: versions.join(","),
    drivers: times.length,
    rank,
    top_pct: Math.max(1, Math.ceil((rank / times.length) * 100)),
    gap_best: r3(time - times[0]),
    gap_median: r3(time - (percentile(times, 0.5) as number)),
  };
}

/** Liste des combos (version la plus récente de chacun), les plus roulés d'abord. */
/**
 * Liste des combos (accueil du site). `version` : absent ou "all" = toutes (défaut),
 * "latest" = la plus récente de CHAQUE combo, liste = ces versions seulement.
 */
export async function comboList(db: Db, f: Filters, version?: string[] | "all" | "latest") {
  const params: unknown[] = [];
  const el = eligibility(f, params);
  let pick = "";
  if (version === "latest") {
    pick = `join latest l
         on l.track = e.track and l.track_course = e.track_course
        and l.car_class = e.car_class and l.version = e.game_minor`;
  } else if (Array.isArray(version) && version.length) {
    params.push(version);
    pick = `where e.game_minor = any($${params.length}::text[])`;
  }
  const rows = await db.query<{
    track: string;
    track_course: string;
    car_class: string;
    version: string;
    drivers: number;
    best: number;
    best_car: string;
    rec_tag: string;
    rec_anonymous: boolean;
    rec_name: string | null;
    rec_homonym: boolean;
    rec_nationality: string | null;
    rec_avatar: string | null;
    track_drivers: number;
    /** Secteurs du tour record (null si le jeu ne les a pas écrits). */
    s1: number | null;
    s2: number | null;
    s3: number | null;
    /** Meilleur secteur parmi les meilleurs tours des pilotes (violet sur le site). */
    best_s1: number | null;
    best_s2: number | null;
    best_s3: number | null;
  }>(
    `with e as (
       select s.track, s.track_course, s.car_class, s.game_minor, s.install_id, s.best_time, s.car_model,
              s.s1, s.s2, s.s3, s.received_at,
              i.tag, i.anonymous, i.display_name, i.homonym, i.nationality, i.avatar
       from sessions s join installs i on i.id = s.install_id
       where ${el}
     ), latest as (
       select track, track_course, car_class, max(game_minor) as version from e group by 1, 2, 3
     ), b as (
       select distinct on (e.track, e.track_course, e.car_class, e.install_id) e.*
       from e ${pick}
       order by e.track, e.track_course, e.car_class, e.install_id, e.best_time, e.received_at
     )
     , td as (
       select track, count(distinct install_id)::int as track_drivers from b group by 1
     )
     select b.track, track_course, car_class, max(game_minor) as version, min(td.track_drivers) as track_drivers,
            count(*)::int as drivers, min(best_time) as best,
            -- Tour record : même départage que le classement (temps, puis premier reçu).
            (array_agg(car_model order by best_time, received_at))[1] as best_car,
            (array_agg(s1 order by best_time, received_at))[1] as s1,
            (array_agg(s2 order by best_time, received_at))[1] as s2,
            (array_agg(s3 order by best_time, received_at))[1] as s3,
            (array_agg(tag order by best_time, received_at))[1] as rec_tag,
            (array_agg(anonymous order by best_time, received_at))[1] as rec_anonymous,
            (array_agg(display_name order by best_time, received_at))[1] as rec_name,
            (array_agg(homonym order by best_time, received_at))[1] as rec_homonym,
            (array_agg(nationality order by best_time, received_at))[1] as rec_nationality,
            (array_agg(avatar order by best_time, received_at))[1] as rec_avatar,
            min(s1) as best_s1, min(s2) as best_s2, min(s3) as best_s3
     from b join td on td.track = b.track group by 1, 2, 3
     order by drivers desc, b.track, track_course, car_class`,
    params,
  );
  // Pilote du record, au même format que les lignes du classement (anonymat respecté).
  return rows.map(({ rec_tag, rec_anonymous, rec_name, rec_homonym, rec_nationality, rec_avatar, ...c }) => ({
    ...c,
    best_driver: publicDriver({ anonymous: rec_anonymous, display_name: rec_name, tag: rec_tag, homonym: rec_homonym, nationality: rec_nationality, avatar: rec_avatar }),
  }));
}

/** Versions présentes dans les combos (filtre Version de l'accueil), la plus récente d'abord. */
export async function listVersions(db: Db, f: Filters) {
  const params: unknown[] = [];
  const el = eligibility(f, params);
  return db.query<{ version: string; drivers: number }>(
    `select s.game_minor as version, count(distinct s.install_id)::int as drivers
     from sessions s join installs i on i.id = s.install_id
     where ${el}
     group by 1 order by 1 desc`,
    params,
  );
}

/** Chiffres globaux (bandeau d'accueil du site). */
export async function globalStats(db: Db) {
  const [row] = await db.query<Record<string, number>>(
    `with vis as (
       select s.* from sessions s join installs i on i.id = s.install_id
       where not i.hidden and s.status <> 'hidden'
     ), first_seen as (
       select install_id, min(received_at) as first_at from vis group by 1
     )
     select
       (select count(*)::int from first_seen) as drivers,
       (select count(*)::int from first_seen where first_at >= now() - interval '7 days') as drivers_7d,
       (select count(*)::int from vis) as sessions,
       (select count(*)::int from vis where received_at >= now() - interval '7 days') as sessions_7d,
       (select count(*)::int from (select distinct track, track_course from vis) t) as layouts`,
  );
  return row;
}

// ── Recherche de pilotes ──────────────────────────────────────────────────────
// Seuls les pilotes affichés sous leur nom sont trouvables : un pilote anonyme ou
// masqué par la modération n'apparaît jamais dans la recherche.

/** Pilotes dont le nom contient `q` (insensible à la casse), 20 au plus. */
export async function searchDrivers(db: Db, q: string) {
  const like = "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  return db.query<{ name: string; tag: string; homonym: boolean; country: string | null; avatar: string | null; combos: number }>(
    `select i.display_name as name, i.tag, i.homonym, i.nationality as country, i.avatar,
            count(distinct (s.track, s.track_course, s.car_class))::int as combos
     from installs i join sessions s on s.install_id = i.id and s.status = 'ok'
     where not i.anonymous and not i.hidden and i.display_name ilike $1
     group by i.id, i.display_name, i.tag, i.homonym, i.nationality, i.avatar
     order by lower(i.display_name), i.tag
     limit 20`,
    [like],
  );
}

/** Fiche d'un pilote (par son repère) : son rang sur chaque combo, version la plus récente. */
export async function driverProfile(db: Db, tag: string) {
  const [inst] = await db.query<{ id: string; name: string; tag: string; homonym: boolean; country: string | null; avatar: string | null }>(
    "select id, display_name as name, tag, homonym, nationality as country, avatar from installs where tag = $1 and not anonymous and not hidden",
    [tag],
  );
  if (!inst) return null;
  const combos = await db.query<{ track: string; track_course: string; car_class: string }>(
    `select distinct track, track_course, car_class from sessions
     where install_id = $1 and status = 'ok' and not wet and not brake_help and not steer_help`,
    [inst.id],
  );
  const out = [];
  for (const c of combos) {
    const key: ComboKey = { track: c.track, course: c.track_course, carClass: c.car_class };
    // Toutes les versions (défaut du site et de l'app).
    const versions = await resolveVersions(db, key, DEFAULT_FILTERS);
    if (!versions.length) continue;
    const rows = await bestPerDriver(db, key, versions, DEFAULT_FILTERS);
    const me = rows.find((r) => r.install_id === inst.id);
    if (!me) continue;
    const rank = rows.filter((r) => r.best_time < me.best_time).length + 1;
    out.push({
      track: c.track,
      track_course: c.track_course,
      car_class: c.car_class,
      version: "all",
      car_model: me.car_model,
      time: me.best_time,
      rank,
      drivers: rows.length,
      top_pct: Math.max(1, Math.ceil((rank / rows.length) * 100)),
      gap_best: r3(me.best_time - rows[0].best_time),
    });
  }
  out.sort((a, b) => a.top_pct - b.top_pct);
  return { name: inst.name, tag: inst.tag, homonym: inst.homonym, country: inst.country, avatar: inst.avatar, combos: out };
}
