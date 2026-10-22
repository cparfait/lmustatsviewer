/**
 * Partage des setups (opt-in, Config › Atelier de l'app) :
 *
 *  - Tables de crans (S5) : pour chaque réglage d'une voiture, le texte que le garage
 *    affiche à chaque index (« 7.0 deg ») et le nombre de crans. Donnée du JEU, pas un
 *    réglage du pilote : elle permet à une voiture jamais conduite d'avoir ses bornes
 *    tout de suite. Consensus = l'affichage déclaré par le plus d'installations ; une
 *    égalité au sommet n'est pas tranchée (index laissé vide).
 *  - Setups publiés (S12) : jamais envoyés sans action du pilote (bouton « Publier »).
 *    Une ligne par version : republier le même nom crée la version suivante. Effacés
 *    avec l'installation (cascade) ; l'auteur est affiché selon ses règles d'anonymat.
 */
import { z } from "zod";
import type { Db } from "./db.js";
import type { Install } from "./ingest.js";
import { publicDriver } from "./stats.js";

// ── Validation ───────────────────────────────────────────────────────────────

/** `<dossier du véhicule>/<version>` lu dans le `//VEH=` du `.svm`. */
const CarKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.\- ]{0,79}\/[A-Za-z0-9][A-Za-z0-9_.\-]{0,19}$/);
const ParamId = z.string().regex(/^[A-Z0-9_]{1,40}\.[A-Za-z0-9_]{1,60}$/);
// eslint-disable-next-line no-control-regex
const Display = z.string().min(1).max(40).regex(/^[^\u0000-\u001f\u007f]+$/);

export const NotchReportSchema = z
  .object({
    car_key: CarKey,
    table: z
      .record(
        ParamId,
        z
          .object({
            displays: z.record(z.string().regex(/^\d{1,3}$/), Display),
            count: z.number().int().min(1).max(1000).optional(),
          })
          .strict(),
      )
      .refine((t) => Object.keys(t).length <= 300, "too_many_params")
      .refine((t) => Object.values(t).every((e) => Object.keys(e.displays).length <= 300), "too_many_notches"),
  })
  .strict();

/**
 * Ligne de `.svm` acceptée : vide, `[SECTION]`, commentaire `//…` ou `Clé=valeur`
 * (jusqu'à 1 100 caractères : la ligne `Notes="…"` porte les notes publiées).
 */
const SVM_LINE = /^(\s*|\[[A-Za-z0-9_ ]{1,40}\]\s*|\/\/.{0,300}|[A-Za-z0-9_][A-Za-z0-9_ .-]{0,59}=.{0,1100})$/;

export const MAX_SVM_BYTES = 64 * 1024;
/** Versions publiées au plus par installation (toutes confondues). */
export const MAX_SHARED_PER_INSTALL = 300;

export const PublishSchema = z
  .object({
    car_key: CarKey,
    car_class: z.string().min(1).max(32),
    car_model: z.string().min(1).max(120),
    /** Dossier circuit du jeu (`Settings/<track>`). */
    track: z.string().min(1).max(120).regex(/^[^\\/:*?"<>|]+$/),
    name: z.string().trim().min(1).max(60).regex(/^[^\\/:*?"<>|]+$/),
    setup_type: z.string().min(1).max(20),
    notes: z.string().max(1000).default(""),
    svm: z
      .string()
      .min(10)
      .refine((s) => Buffer.byteLength(s, "utf8") <= MAX_SVM_BYTES, "too_large")
      .refine((s) => /^\[GENERAL\]/m.test(s), "not_svm")
      .refine((s) => s.split(/\r?\n/).every((l) => SVM_LINE.test(l)), "bad_line"),
    best_lap: z.number().min(20).max(1200).nullable().default(null),
    game_version: z.string().max(20).nullable().default(null),
  })
  .strict();

export type Publish = z.infer<typeof PublishSchema>;

const carFolder = (key: string) => key.slice(0, key.lastIndexOf("/"));

// ── Tables de crans ──────────────────────────────────────────────────────────

/** Remplace la déclaration de cette installation pour cette voiture. */
export async function reportNotches(db: Db, installId: string, report: z.infer<typeof NotchReportSchema>): Promise<number> {
  let rows = 0;
  await db.transaction(async (tx) => {
    await tx.query("delete from notch_reports where install_id = $1 and car_key = $2", [installId, report.car_key]);
    await tx.query("delete from notch_counts where install_id = $1 and car_key = $2", [installId, report.car_key]);
    for (const [param, e] of Object.entries(report.table)) {
      for (const [idx, display] of Object.entries(e.displays)) {
        await tx.query(
          "insert into notch_reports (install_id, car_key, param_id, idx, display) values ($1, $2, $3, $4, $5)",
          [installId, report.car_key, param, Number(idx), display.trim()],
        );
        rows++;
      }
      if (e.count != null)
        await tx.query("insert into notch_counts (install_id, car_key, param_id, count) values ($1, $2, $3, $4)", [
          installId,
          report.car_key,
          param,
          e.count,
        ]);
    }
  });
  return rows;
}

type NotchTable = Record<string, { displays: Record<string, string>; count?: number }>;

/** Table de consensus d'une voiture (`null` si personne ne l'a déclarée). */
export async function notchConsensus(db: Db, carKey: string): Promise<{ car_key: string; reporters: number; table: NotchTable } | null> {
  const votes = await db.query<{ param_id: string; idx: number; display: string; n: number }>(
    `select r.param_id, r.idx, r.display, count(distinct r.install_id)::int as n
       from notch_reports r join installs i on i.id = r.install_id
      where r.car_key = $1 and not i.hidden
      group by r.param_id, r.idx, r.display`,
    [carKey],
  );
  if (!votes.length) return null;
  const counts = await db.query<{ param_id: string; count: number; n: number }>(
    `select c.param_id, c.count, count(distinct c.install_id)::int as n
       from notch_counts c join installs i on i.id = c.install_id
      where c.car_key = $1 and not i.hidden
      group by c.param_id, c.count`,
    [carKey],
  );
  const [{ reporters }] = await db.query<{ reporters: number }>(
    `select count(distinct r.install_id)::int as reporters
       from notch_reports r join installs i on i.id = r.install_id
      where r.car_key = $1 and not i.hidden`,
    [carKey],
  );
  const table: NotchTable = {};
  // Majorité stricte : en cas d'égalité au sommet, l'index reste inconnu.
  const best = new Map<string, { v: string | number; n: number; tie: boolean }>();
  const vote = (k: string, v: string | number, n: number) => {
    const b = best.get(k);
    if (!b || n > b.n) best.set(k, { v, n, tie: false });
    else if (n === b.n && b.v !== v) b.tie = true;
  };
  for (const r of votes) vote(`d|${r.param_id}|${r.idx}`, r.display, r.n);
  for (const r of counts) vote(`c|${r.param_id}`, r.count, r.n);
  for (const [k, b] of best) {
    if (b.tie) continue;
    const [kind, param, idx] = k.split("|");
    const e = (table[param] ??= { displays: {} });
    if (kind === "d") e.displays[idx] = String(b.v);
    else e.count = Number(b.v);
  }
  return { car_key: carKey, reporters, table };
}

// ── Setups publiés ───────────────────────────────────────────────────────────

export async function publishSetup(db: Db, install: Install, p: Publish): Promise<{ id: number; version: number } | "quota"> {
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.query<{ n: number }>("select count(*)::int as n from shared_setups where install_id = $1", [install.id]);
    if (n >= MAX_SHARED_PER_INSTALL) return "quota" as const;
    const [{ v }] = await tx.query<{ v: number }>(
      `select coalesce(max(version), 0)::int as v from shared_setups
        where install_id = $1 and car_key = $2 and track = $3 and lower(name) = lower($4)`,
      [install.id, p.car_key, p.track, p.name],
    );
    const [row] = await tx.query<{ id: string }>(
      `insert into shared_setups (install_id, car_key, car_folder, car_class, car_model, track, name, version,
                                  setup_type, notes, svm, best_lap, game_version)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
      [install.id, p.car_key, carFolder(p.car_key), p.car_class, p.car_model, p.track, p.name, v + 1, p.setup_type, p.notes, p.svm, p.best_lap, p.game_version],
    );
    return { id: Number(row.id), version: v + 1 };
  });
}

const AUTHOR_COLS = "i.tag, i.anonymous, i.display_name, i.homonym, i.nationality, i.avatar";
type AuthorRow = { tag: string; anonymous: boolean; display_name: string | null; homonym: boolean; nationality: string | null; avatar: string | null };
const author = (r: AuthorRow) => publicDriver(r);

export const ListQuery = z.object({
  /** Dossier du véhicule (toutes versions de la voiture). */
  car: z.string().min(1).max(80),
  track: z.string().min(1).max(120).optional(),
});

/** Dernière version de chaque setup publié pour une voiture (et un circuit). */
export async function listSetups(db: Db, q: z.infer<typeof ListQuery>) {
  const rows = await db.query<
    AuthorRow & {
      id: string;
      car_key: string;
      car_class: string;
      car_model: string;
      track: string;
      name: string;
      version: number;
      versions: number;
      setup_type: string;
      notes: string;
      best_lap: number | null;
      game_version: string | null;
      downloads: number;
      created_at: string;
    }
  >(
    `select * from (
       select distinct on (s.install_id, s.car_key, s.track, lower(s.name))
              s.id, s.car_key, s.car_class, s.car_model, s.track, s.name, s.version,
              count(*) over (partition by s.install_id, s.car_key, s.track, lower(s.name))::int as versions,
              s.setup_type, s.notes, s.best_lap, s.game_version,
              sum(s.downloads) over (partition by s.install_id, s.car_key, s.track, lower(s.name))::int as downloads,
              s.created_at::text as created_at, ${AUTHOR_COLS}
         from shared_setups s join installs i on i.id = s.install_id
        where s.car_folder = $1 and ($2::text is null or s.track = $2) and not i.hidden
        order by s.install_id, s.car_key, s.track, lower(s.name), s.version desc
     ) t
     order by best_lap asc nulls last, created_at desc
     limit 100`,
    [q.car, q.track ?? null],
  );
  return {
    setups: rows.map(({ tag, anonymous, display_name, homonym, nationality, avatar, id, ...r }) => ({
      id: Number(id),
      ...r,
      author: author({ tag, anonymous, display_name, homonym, nationality, avatar }),
    })),
  };
}

/** Un setup publié avec son contenu et la liste de ses versions ; `download` compte un téléchargement. */
export async function getSetup(db: Db, id: number, download: boolean) {
  const [row] = await db.query<
    AuthorRow & {
      install_id: string;
      car_key: string;
      car_class: string;
      car_model: string;
      track: string;
      name: string;
      version: number;
      setup_type: string;
      notes: string;
      svm: string;
      best_lap: number | null;
      game_version: string | null;
      downloads: number;
      created_at: string;
    }
  >(
    `select s.install_id, s.car_key, s.car_class, s.car_model, s.track, s.name, s.version, s.setup_type, s.notes,
            s.svm, s.best_lap, s.game_version, s.downloads, s.created_at::text as created_at, ${AUTHOR_COLS}
       from shared_setups s join installs i on i.id = s.install_id
      where s.id = $1 and not i.hidden`,
    [id],
  );
  if (!row) return null;
  if (download) await db.query("update shared_setups set downloads = downloads + 1 where id = $1", [id]);
  const versions = await db.query<{ id: string; version: number; best_lap: number | null; created_at: string }>(
    `select id, version, best_lap, created_at::text as created_at from shared_setups
      where install_id = $1 and car_key = $2 and track = $3 and lower(name) = lower($4)
      order by version desc`,
    [row.install_id, row.car_key, row.track, row.name],
  );
  const { install_id: _owner, tag, anonymous, display_name, homonym, nationality, avatar, ...r } = row;
  return {
    id,
    ...r,
    downloads: r.downloads + (download ? 1 : 0),
    author: author({ tag, anonymous, display_name, homonym, nationality, avatar }),
    versions: versions.map((v) => ({ ...v, id: Number(v.id) })),
  };
}

/** Mes setups publiés (toutes versions), sans le contenu. */
export async function mySetups(db: Db, installId: string) {
  const rows = await db.query<{ id: string; car_key: string; track: string; name: string; version: number; setup_type: string; best_lap: number | null; downloads: number; created_at: string }>(
    `select id, car_key, track, name, version, setup_type, best_lap, downloads, created_at::text as created_at
       from shared_setups where install_id = $1 order by created_at desc, id desc`,
    [installId],
  );
  return { setups: rows.map((r) => ({ ...r, id: Number(r.id) })) };
}

/** Retire une version (ou toutes les versions de ce setup avec `all`) ; seulement les siennes. */
export async function deleteSetup(db: Db, installId: string, id: number, all: boolean): Promise<number> {
  if (!all) {
    const gone = await db.query("delete from shared_setups where id = $1 and install_id = $2 returning id", [id, installId]);
    return gone.length;
  }
  const gone = await db.query(
    `delete from shared_setups s using shared_setups r
      where r.id = $1 and r.install_id = $2
        and s.install_id = r.install_id and s.car_key = r.car_key and s.track = r.track and lower(s.name) = lower(r.name)
      returning s.id`,
    [id, installId],
  );
  return gone.length;
}

/** Pour l'export « mes données » : setups publiés (contenu compris) et voitures dont la table a été déclarée. */
export async function exportShared(db: Db, installId: string) {
  const shared_setups = await db.query(
    `select id, car_key, car_class, car_model, track, name, version, setup_type, notes, svm, best_lap,
            game_version, downloads, created_at from shared_setups where install_id = $1 order by id`,
    [installId],
  );
  const notch_cars = (
    await db.query<{ car_key: string }>("select distinct car_key from notch_reports where install_id = $1 order by car_key", [installId])
  ).map((r) => r.car_key);
  return { shared_setups, notch_cars };
}
