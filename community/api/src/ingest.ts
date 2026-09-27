/**
 * Installations et réception des sessions (COMMUNITY-SPEC.md §3-§5).
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  SessionSummarySchema,
  gameMinor,
  normalizeName,
  type SessionSummary,
} from "../../shared/src/session.js";
import type { Db } from "./db.js";
import { comboStats, type ComboKey } from "./stats.js";

export interface Install {
  id: string;
  tag: string;
  anonymous: boolean;
  display_name: string | null;
  homonym: boolean;
  hidden: boolean;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Crée une installation : identifiant + jeton (seul son hash est conservé). */
export async function registerInstall(db: Db): Promise<{ install_id: string; token: string; tag: string }> {
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  // Repère court (« #a3f9 ») pour l'anonymat et les homonymes ; unicité recherchée
  // mais non vitale (affichage seulement).
  let tag = "";
  for (let i = 0; i < 6; i++) {
    tag = "#" + randomBytes(2).toString("hex");
    const taken = await db.query("select 1 from installs where tag = $1", [tag]);
    if (taken.length === 0) break;
  }
  await db.query("insert into installs (id, token_hash, tag) values ($1, $2, $3)", [id, hashToken(token), tag]);
  return { install_id: id, token, tag };
}

export async function findInstallByToken(db: Db, token: string): Promise<Install | null> {
  const rows = await db.query<Install>(
    `update installs set last_seen_at = now() where token_hash = $1
     returning id, tag, anonymous, display_name, homonym, hidden`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

export type RejectReason =
  | "invalid"
  | "bad_date"
  | "daily_quota"
  | "too_fast";

export interface IngestResult {
  /**
   * Clés des sessions désormais présentes côté serveur (nouvelles + déjà reçues) :
   * l'app ne marque « envoyée » QUE ces sessions (accusé de réception explicite).
   */
  received: string[];
  accepted: number;
  duplicates: number;
  rejected: { index: number; session_key: string | null; reason: RejectReason; detail?: string }[];
}

export interface IngestOptions {
  /** Sessions acceptées par installation et par jour (UTC). */
  dailyQuota: number;
  /** Nombre de pilotes à partir duquel les bornes du combo s'appliquent. */
  boundsMinDrivers: number;
  /** Rejet si le temps est sous ce ratio du p1 du combo. */
  tooFastRatio: number;
  /** Hors percentiles (statut « slow ») au-delà de ce ratio de la médiane. */
  slowRatio: number;
  /** Date du jour (injectable pour les tests), AAAA-MM-JJ. */
  today?: () => string;
}

export const DEFAULT_INGEST: IngestOptions = {
  dailyQuota: 200,
  boundsMinDrivers: 20,
  tooFastRatio: 0.97,
  slowRatio: 1.3,
};

const isoToday = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Reçoit un lot : chaque session est validée et insérée indépendamment (un rejet
 * n'annule pas le lot). Idempotent grâce à `session_key`.
 */
export async function ingestSessions(
  db: Db,
  install: Install,
  items: unknown[],
  opts: IngestOptions = DEFAULT_INGEST,
): Promise<IngestResult> {
  const today = (opts.today ?? isoToday)();
  const result: IngestResult = { received: [], accepted: 0, duplicates: 0, rejected: [] };
  let latest: SessionSummary | null = null;

  await db.transaction(async (tx) => {
    const [{ n: receivedToday }] = await tx.query<{ n: number }>(
      "select count(*)::int as n from sessions where install_id = $1 and received_at >= $2::date",
      [install.id, today],
    );
    let quotaLeft = opts.dailyQuota - receivedToday;

    for (const [index, raw] of items.entries()) {
      const parsed = SessionSummarySchema.safeParse(raw);
      const key = typeof (raw as { session_key?: unknown })?.session_key === "string"
        ? ((raw as { session_key: string }).session_key)
        : null;
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        result.rejected.push({ index, session_key: key, reason: "invalid", detail: `${issue.path.join(".")}: ${issue.message}` });
        continue;
      }
      const s = parsed.data;
      if (s.played_on < "2023-01-01" || s.played_on > addDays(today, 1)) {
        result.rejected.push({ index, session_key: s.session_key, reason: "bad_date" });
        continue;
      }
      if (quotaLeft <= 0) {
        result.rejected.push({ index, session_key: s.session_key, reason: "daily_quota" });
        continue;
      }

      const combo: ComboKey = {
        track: s.track,
        course: s.track_course,
        carClass: s.car_class,
        version: [gameMinor(s.game_version)],
      };
      // Bornes du combo, seulement quand assez de pilotes pour qu'elles aient un sens.
      let status: "ok" | "slow" = "ok";
      const st = await comboStats(tx, combo, { aids: "all", conditions: "dry", excludeInstall: install.id });
      if (st.drivers >= opts.boundsMinDrivers && st.p01 != null && st.median != null) {
        if (s.best_lap.time < st.p01 * opts.tooFastRatio) {
          result.rejected.push({ index, session_key: s.session_key, reason: "too_fast" });
          continue;
        }
        if (s.best_lap.time > st.median * opts.slowRatio) status = "slow";
      }

      const inserted = await tx.query(
        `insert into sessions (
           install_id, session_key, app_version, game_version, game_minor, played_on,
           session_type, setting, track, track_course, car_class, car_model, driver_name,
           aids_raw, tc, brake_help, steer_help, auto_shift,
           best_time, s1, s2, s3, lap_num, top_speed, fuel, compound_f, compound_r,
           best_s1, best_s2, best_s3, valid_laps, median_lap, wet, has_telemetry, status
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
           $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35
         ) on conflict (session_key) do nothing returning id`,
        [
          install.id, s.session_key, s.app_version, s.game_version, gameMinor(s.game_version), s.played_on,
          s.session_type, s.setting, s.track, s.track_course, s.car_class, s.car_model, s.driver_name,
          s.aids.raw, s.aids.tc, s.aids.brake_help, s.aids.steer_help, s.aids.auto_shift,
          round3(s.best_lap.time), round3(s.best_lap.s1), round3(s.best_lap.s2), round3(s.best_lap.s3),
          s.best_lap.lap_num, s.best_lap.top_speed, s.best_lap.fuel, s.best_lap.compound_f, s.best_lap.compound_r,
          round3(s.best_sectors.s1), round3(s.best_sectors.s2), round3(s.best_sectors.s3),
          s.valid_laps, round3(s.median_lap), s.wet, s.has_telemetry, status,
        ],
      );
      if (inserted.length === 0) {
        // Déjà reçue (renvoi après une coupure) : on la confirme, sans doublon.
        const owned = await tx.query("select 1 from sessions where session_key = $1 and install_id = $2", [s.session_key, install.id]);
        if (owned.length > 0) {
          result.duplicates++;
          result.received.push(s.session_key);
        } else {
          // Clé appartenant à une autre installation : impossible en usage normal.
          result.rejected.push({ index, session_key: s.session_key, reason: "invalid", detail: "session_key: already used" });
        }
        continue;
      }
      result.accepted++;
      result.received.push(s.session_key);
      quotaLeft--;
      if (!latest || s.played_on >= latest.played_on) latest = s;
    }

    if (latest) await applyDriverName(tx, install.id, latest.driver_name, latest.played_on);
  });

  return result;
}

function round3(v: number): number;
function round3(v: number | null): number | null;
function round3(v: number | null): number | null {
  return v == null ? null : Math.round(v * 1000) / 1000;
}

/**
 * Le nom affiché suit le nom écrit par le jeu dans la session la plus récente
 * (renommage en jeu → suivi). Réservation : le premier arrivé garde le nom,
 * les suivants sont marqués homonymes (affichés avec leur repère).
 */
export async function applyDriverName(db: Db, installId: string, name: string, playedOn: string): Promise<void> {
  const [cur] = await db.query<{ npo: string | null }>(
    "select name_played_on::text as npo from installs where id = $1",
    [installId],
  );
  if (cur?.npo && cur.npo > playedOn) return;
  const norm = normalizeName(name);
  await db.query("update installs set display_name = $2, name_played_on = $3 where id = $1", [installId, name, playedOn]);
  await db.query("delete from name_claims where install_id = $1 and name_norm <> $2", [installId, norm]);
  await db.query(
    "insert into name_claims (name_norm, install_id) values ($1, $2) on conflict (name_norm) do nothing",
    [norm, installId],
  );
  const [claim] = await db.query<{ install_id: string }>("select install_id from name_claims where name_norm = $1", [norm]);
  await db.query("update installs set homonym = $2 where id = $1", [installId, claim.install_id !== installId]);
}

/** Export complet des données d'une installation (droit d'accès RGPD). */
export async function exportInstall(db: Db, install: Install) {
  const sessions = await db.query(
    `select session_key, received_at, app_version, game_version, played_on::text as played_on,
            session_type, setting, track, track_course, car_class, car_model, driver_name,
            aids_raw, tc, brake_help, steer_help, auto_shift, best_time, s1, s2, s3, lap_num,
            top_speed, fuel, compound_f, compound_r, best_s1, best_s2, best_s3, valid_laps,
            median_lap, wet, has_telemetry, status
     from sessions where install_id = $1 order by played_on desc, id desc`,
    [install.id],
  );
  return {
    install_id: install.id,
    tag: install.tag,
    anonymous: install.anonymous,
    display_name: install.display_name,
    homonym: install.homonym,
    sessions,
  };
}

/**
 * Effacement réel (pas un masquage) : cascade sur sessions et réservation de nom. Le
 * nom libéré revient au plus ancien homonyme restant (il perd son repère affiché).
 */
export async function deleteInstall(db: Db, installId: string): Promise<void> {
  const [gone] = await db.query<{ display_name: string | null }>(
    "delete from installs where id = $1 returning display_name",
    [installId],
  );
  if (gone?.display_name) await promoteHomonym(db, gone.display_name);
}

async function promoteHomonym(db: Db, name: string): Promise<void> {
  const norm = normalizeName(name);
  if ((await db.query("select 1 from name_claims where name_norm = $1", [norm])).length) return;
  const homonyms = await db.query<{ id: string; display_name: string | null }>(
    "select id, display_name from installs where homonym order by created_at",
  );
  const next = homonyms.find((h) => h.display_name != null && normalizeName(h.display_name) === norm);
  if (!next) return;
  await db.query("insert into name_claims (name_norm, install_id) values ($1, $2) on conflict do nothing", [norm, next.id]);
  await db.query("update installs set homonym = false where id = $1", [next.id]);
}

