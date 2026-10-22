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
  {
    id: 2,
    name: "steam",
    sql: `
      -- « Se connecter avec Steam » : HMAC du SteamID64 (jamais l'identifiant lui-même).
      alter table installs add column steam_hash text unique;
      -- Secrets propres au serveur, créés au premier usage.
      create table server_secrets (
        name text primary key,
        value text not null
      );
      -- Connexions Steam en cours (10 min) : l'app interroge avec un identifiant secret
      -- dont seul le hash est gardé ; \`state\` voyage dans l'URL de retour de Steam.
      create table steam_logins (
        poll_hash text primary key,
        state text not null unique,
        mode text not null check (mode in ('link', 'recover')),
        install_id uuid references installs(id) on delete cascade,
        status text not null default 'pending',
        created_at timestamptz not null default now()
      );
    `,
  },
  {
    id: 3,
    name: "steam_register",
    sql: `
      -- Connexion Steam obligatoire pour partager : « register » retrouve l'installation
      -- liée au compte Steam, ou la crée.
      alter table steam_logins drop constraint steam_logins_mode_check;
      alter table steam_logins add constraint steam_logins_mode_check
        check (mode in ('link', 'recover', 'register'));
      alter table steam_logins add column existing boolean not null default false;
    `,
  },
  {
    id: 4,
    name: "driver_profile",
    sql: `
      -- Pays du profil du jeu (\`Settings.JSON\` → Nationality), envoyé par l'app.
      alter table installs add column nationality text;
      -- Avatar Steam, sur demande du joueur uniquement (mode « avatar ») : le SteamID64
      -- n'est conservé que pour rafraîchir l'avatar, et effacé quand il le retire.
      alter table installs add column steam_id text unique;
      alter table installs add column avatar text;
      alter table installs add column avatar_checked_at timestamptz;
      alter table steam_logins drop constraint steam_logins_mode_check;
      alter table steam_logins add constraint steam_logins_mode_check
        check (mode in ('link', 'recover', 'register', 'avatar'));
    `,
  },
  {
    id: 5,
    name: "avatar_default",
    sql: `
      -- Avatar Steam affiché par défaut (décision 2026-09-29) : le SteamID64 est gardé à
      -- chaque connexion Steam, sauf si le joueur a retiré son avatar.
      alter table installs add column avatar_off boolean not null default false;
    `,
  },
  {
    id: 6,
    name: "rival_week",
    sql: `
      -- Rival de la semaine (opt-in, désactivé par défaut) : un duel par semaine entre
      -- pilotes de rythme proche. Une ligne par pilote et par semaine (lundi UTC) ;
      -- rival_id null = en attente d'un partenaire.
      alter table installs add column rival_opt_in boolean not null default false;
      create table rival_pairs (
        week date not null,
        install_id uuid not null references installs(id) on delete cascade,
        rival_id uuid references installs(id) on delete set null,
        created_at timestamptz not null default now(),
        primary key (week, install_id)
      );
    `,
  },
  {
    id: 7,
    name: "setup_sharing",
    sql: `
      -- Tables de crans (opt-in) : texte affiché par le garage pour chaque index d'un
      -- réglage, par voiture (<dossier>/<version> du jeu). Donnée du jeu, pas un setup.
      create table notch_reports (
        install_id uuid not null references installs(id) on delete cascade,
        car_key text not null,
        param_id text not null,
        idx integer not null,
        display text not null,
        updated_at timestamptz not null default now(),
        primary key (install_id, car_key, param_id, idx)
      );
      create index notch_reports_car on notch_reports (car_key);
      create table notch_counts (
        install_id uuid not null references installs(id) on delete cascade,
        car_key text not null,
        param_id text not null,
        count integer not null,
        updated_at timestamptz not null default now(),
        primary key (install_id, car_key, param_id)
      );
      -- Setups publiés par le pilote (bouton « Publier », jamais automatique) : une
      -- ligne par version ; republier le même nom crée la version suivante.
      create table shared_setups (
        id bigserial primary key,
        install_id uuid not null references installs(id) on delete cascade,
        car_key text not null,
        car_folder text not null,
        car_class text not null,
        car_model text not null,
        track text not null,
        name text not null,
        version integer not null,
        setup_type text not null,
        notes text not null default '',
        svm text not null,
        best_lap double precision,
        game_version text,
        downloads integer not null default 0,
        created_at timestamptz not null default now(),
        unique (install_id, car_key, track, name, version)
      );
      create index shared_setups_combo on shared_setups (car_folder, track);
    `,
  },
  {
    id: 8,
    name: "shared_setups_test",
    sql: `
      -- Publication d'essai (app de développement ou bêta) : jamais montrée sur le site
      -- ni dans les versions publiées de l'app.
      alter table shared_setups add column test boolean not null default false;
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
