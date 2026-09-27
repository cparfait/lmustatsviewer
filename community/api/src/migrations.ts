/**
 * Migrations embarquées (pas de fichiers à copier dans l'image Docker). Chaque
 * migration s'applique une seule fois, dans l'ordre, tracée dans `schema_migrations`.
 * Ne JAMAIS modifier une migration publiée : en ajouter une nouvelle.
 */
import type { Db } from "./db.js";

const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "init",
    sql: `
      create table installs (
        id uuid primary key,
        token_hash text not null unique,
        tag text not null,
        anonymous boolean not null default false,
        display_name text,
        name_played_on date,
        homonym boolean not null default false,
        hidden boolean not null default false,
        created_at timestamptz not null default now(),
        last_seen_at timestamptz not null default now()
      );

      -- Un nom de pilote reste attaché à la première installation qui l'envoie ;
      -- une autre installation au même nom est affichée en homonyme (spec §1.4).
      create table name_claims (
        name_norm text primary key,
        install_id uuid not null references installs(id) on delete cascade,
        claimed_at timestamptz not null default now()
      );

      create table sessions (
        id bigserial primary key,
        install_id uuid not null references installs(id) on delete cascade,
        session_key text not null unique,
        received_at timestamptz not null default now(),
        app_version text not null,
        game_version text not null,
        game_minor text not null,
        played_on date not null,
        session_type text not null,
        setting text not null,
        track text not null,
        track_course text not null,
        car_class text not null,
        car_model text not null,
        driver_name text not null,
        aids_raw text not null,
        tc smallint,
        brake_help boolean not null,
        steer_help boolean not null,
        auto_shift boolean not null,
        best_time double precision not null,
        s1 double precision,
        s2 double precision,
        s3 double precision,
        lap_num integer not null,
        top_speed double precision,
        fuel double precision,
        compound_f text,
        compound_r text,
        best_s1 double precision,
        best_s2 double precision,
        best_s3 double precision,
        valid_laps integer not null,
        median_lap double precision,
        wet boolean not null,
        has_telemetry boolean not null,
        -- ok : compté ; slow : conservé hors percentiles (> 130 % de la médiane) ;
        -- hidden : masqué par la modération.
        status text not null default 'ok' check (status in ('ok', 'slow', 'hidden'))
      );

      create index sessions_combo_idx
        on sessions (track, track_course, car_class, game_minor, best_time);
      create index sessions_install_idx on sessions (install_id);
      create index sessions_received_idx on sessions (received_at);
    `,
  },
];

export async function migrate(db: Db): Promise<number[]> {
  await db.query(`
    create table if not exists schema_migrations (
      id integer primary key,
      name text not null,
      applied_at timestamptz not null default now()
    )`);
  const done = new Set(
    (await db.query<{ id: number }>("select id from schema_migrations")).map((r) => r.id),
  );
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await db.transaction(async (tx) => {
      await tx.query(m.sql);
      await tx.query("insert into schema_migrations (id, name) values ($1, $2)", [m.id, m.name]);
    });
    applied.push(m.id);
  }
  return applied;
}
