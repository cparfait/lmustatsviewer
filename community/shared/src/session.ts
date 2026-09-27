/**
 * Contrat d'envoi app → serveur communautaire (COMMUNITY-SPEC.md §3).
 *
 * Partagé entre l'API (validation à la réception) et, au lot 2, l'app (construction
 * de l'envoi). Toute évolution incompatible = nouvelle valeur de `schema`.
 */
import { z } from "zod";

export const SESSION_SCHEMA_VERSION = 1;

/** Lot maximal par requête. */
export const MAX_BATCH = 50;

/** Temps au tour en secondes (bornes larges : du tracé court au Mans en LMP3). */
const lapTime = z.number().finite().gt(20).lt(1200);
const sector = z.number().finite().gt(0).lt(900).nullable();
const text = (max: number) => z.string().trim().min(1).max(max);

export const AidsSchema = z
  .object({
    /** Chaîne brute du XML (`control_aids`), ex. « PlayerControl,TC=2,Clutch,AutoBlip ». */
    raw: z.string().max(200),
    tc: z.number().int().min(0).max(20).nullable(),
    brake_help: z.boolean(),
    steer_help: z.boolean(),
    auto_shift: z.boolean(),
  })
  .strict();

export const BestLapSchema = z
  .object({
    time: lapTime,
    s1: sector,
    s2: sector,
    s3: sector,
    lap_num: z.number().int().min(0).max(10000),
    top_speed: z.number().finite().min(0).max(500).nullable(),
    fuel: z.number().finite().min(0).max(1000).nullable(),
    compound_f: z.string().max(40).nullable(),
    compound_r: z.string().max(40).nullable(),
  })
  .strict();

export const SessionSummarySchema = z
  .object({
    schema: z.literal(SESSION_SCHEMA_VERSION),
    /** sha256(install_id + nom du fichier XML), en hexadécimal : clé d'idempotence. */
    session_key: z.string().regex(/^[0-9a-f]{64}$/),
    app_version: z.string().max(32).regex(/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/),
    /** Version du jeu telle qu'écrite dans le XML, ex. « 1.4200 ». */
    game_version: z.string().regex(/^\d{1,2}\.\d{1,4}$/),
    /** Jour de la session (pas l'heure), AAAA-MM-JJ. */
    played_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    session_type: text(32),
    setting: text(32),
    track: text(120),
    track_course: text(120),
    car_class: text(32),
    car_model: text(120),
    /** Nom de pilote tel qu'écrit par le jeu dans le XML (jamais un champ libre). */
    driver_name: text(64),
    aids: AidsSchema,
    best_lap: BestLapSchema,
    best_sectors: z.object({ s1: sector, s2: sector, s3: sector }).strict(),
    valid_laps: z.number().int().min(1).max(10000),
    median_lap: lapTime.nullable(),
    wet: z.boolean(),
    has_telemetry: z.boolean(),
  })
  .strict()
  .superRefine((s, ctx) => {
    const { time, s1, s2, s3 } = s.best_lap;
    if (s1 != null && s2 != null && s3 != null && Math.abs(s1 + s2 + s3 - time) > 0.05) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sectors_mismatch", path: ["best_lap"] });
    }
    if (s.median_lap != null && s.median_lap + 0.0005 < time) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "median_faster_than_best", path: ["median_lap"] });
    }
  });

export type SessionSummary = z.infer<typeof SessionSummarySchema>;

/** Enveloppe d'un envoi : chaque élément est validé individuellement (rejets détaillés). */
export const SessionBatchSchema = z
  .object({ sessions: z.array(z.unknown()).min(1).max(MAX_BATCH) })
  .strict();

/** « 1.4200 » → « 1.42 » : la BoP change par version majeure.mineure. */
export function gameMinor(version: string): string {
  const [major, frac = ""] = version.split(".");
  return `${Number(major)}.${frac.padEnd(2, "0").slice(0, 2)}`;
}

/** Forme normalisée d'un nom de pilote (réservation de nom, homonymes). */
export function normalizeName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
