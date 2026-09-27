/**
 * Outillage de test : Postgres embarqué (PGlite, vrai moteur Postgres en WASM),
 * application montée en mémoire, fabrique de sessions valides.
 */
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createApp, type AppOptions } from "../src/app.js";
import type { Db, Row } from "../src/db.js";
import { DEFAULT_INGEST } from "../src/ingest.js";
import { migrate } from "../src/migrations.js";
import { RateLimiter } from "../src/ratelimit.js";

export function pgliteDb(pg: PGlite): Db {
  const db: Db = {
    async query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
      // Sans paramètre : protocole simple (plusieurs instructions possibles, cf. migrations).
      if (params.length === 0) {
        const results = await pg.exec(sql);
        return (results.at(-1)?.rows ?? []) as T[];
      }
      return (await pg.query<T>(sql, params)).rows;
    },
    async transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R> {
      return pg.transaction(async (t) => {
        const tx: Db = {
          query: async <T = Row>(sql: string, params: unknown[] = []) =>
            params.length === 0
              ? (((await t.exec(sql)).at(-1)?.rows ?? []) as T[])
              : (await t.query<T>(sql, params)).rows,
          transaction: (inner) => inner(tx),
        };
        return fn(tx);
      }) as Promise<R>;
    },
  };
  return db;
}

export async function setup(opts: AppOptions = {}) {
  const pg = new PGlite();
  const db = pgliteDb(pg);
  await migrate(db);
  const limiter = new RateLimiter();
  const app = createApp(db, {
    log: () => {},
    limiter,
    ingest: { ...DEFAULT_INGEST, today: () => "2026-09-26" },
    ...opts,
  });
  return {
    db,
    app,
    async close() {
      limiter.stop();
      await pg.close();
    },
  };
}

type App = Awaited<ReturnType<typeof setup>>["app"];

export const digest = (body: string) =>
  `sha-256=:${createHash("sha256").update(body).digest("base64")}:`;

export async function register(app: App, ip = "10.0.0.1") {
  const res = await app.request("/api/v1/register", { method: "POST", headers: { "x-real-ip": ip } });
  return (await res.json()) as { install_id: string; token: string; tag: string };
}

/** Envoi d'un lot, avec l'empreinte `Content-Digest` correcte (sauf si fournie). */
export async function send(app: App, token: string, sessions: unknown[], digestOverride?: string) {
  const body = JSON.stringify({ sessions });
  return app.request("/api/v1/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "content-digest": digestOverride ?? digest(body),
      "x-real-ip": "10.0.0.1",
    },
    body,
  });
}

let seq = 0;
export const key = (s = String(++seq)) => createHash("sha256").update("k" + s).digest("hex");

/** Session valide (Road Atlanta GT3 par défaut), modifiable via `over`. */
export function session(over: Record<string, unknown> = {}, lap: Record<string, unknown> = {}) {
  const time = (lap.time as number | undefined) ?? 81.48;
  const s1 = Math.round(time * 0.3165 * 1000) / 1000;
  const s2 = Math.round(time * 0.396 * 1000) / 1000;
  const s3 = Math.round((time - s1 - s2) * 1000) / 1000;
  return {
    schema: 1,
    session_key: key(),
    app_version: "1.0.8",
    game_version: "1.4200",
    played_on: "2026-09-24",
    session_type: "Race",
    setting: "Multiplayer",
    track: "Michelin Raceway Road Atlanta",
    track_course: "Michelin Raceway Road Atlanta",
    car_class: "GT3",
    car_model: "Lamborghini Huracan LMGT3 Evo2",
    driver_name: "Cris Tof",
    aids: { raw: "PlayerControl,TC=2,Clutch,AutoBlip", tc: 2, brake_help: false, steer_help: false, auto_shift: false },
    best_lap: {
      time, s1, s2, s3,
      lap_num: 7, top_speed: 262.1, fuel: 0.41, compound_f: "Medium", compound_r: "Medium",
      ...lap,
    },
    best_sectors: { s1, s2, s3 },
    valid_laps: 18,
    median_lap: Math.round((time + 1.2) * 1000) / 1000,
    wet: false,
    has_telemetry: true,
    ...over,
  };
}

export const RA = "track=Michelin%20Raceway%20Road%20Atlanta&course=Michelin%20Raceway%20Road%20Atlanta&class=GT3";

/** Peuple un combo avec `n` pilotes distincts (temps croissants à partir de `start`). */
export async function populate(app: App, n: number, start = 78, step = 0.25, over: Record<string, unknown> = {}) {
  const installs = [];
  for (let i = 0; i < n; i++) {
    const inst = await register(app, `10.1.${Math.floor(i / 200)}.${i % 200}`);
    const res = await send(app, inst.token, [session({ driver_name: `Pilote ${i}`, ...over }, { time: start + i * step })]);
    if (res.status !== 200) throw new Error(`populate ${i}: ${res.status}`);
    installs.push(inst);
  }
  return installs;
}
