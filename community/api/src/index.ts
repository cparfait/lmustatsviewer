/**
 * Point d'entrée du service : connexion Postgres, migrations, serveur HTTP.
 */
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import pg from "pg";
import { createApp } from "./app.js";
import { pgDb } from "./db.js";
import { migrate } from "./migrations.js";

const DATABASE_URL = process.env.DATABASE_URL;
const PORT = Number(process.env.PORT ?? 3000);

if (!DATABASE_URL) {
  console.error("DATABASE_URL manquant");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5, idleTimeoutMillis: 30_000 });
const db = pgDb(pool);

// Postgres peut démarrer après nous (redémarrage du VPS) : on attend qu'il réponde.
for (let attempt = 1; ; attempt++) {
  try {
    await db.query("select 1");
    break;
  } catch (e) {
    if (attempt >= 30) throw e;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const applied = await migrate(db);
if (applied.length) console.log(JSON.stringify({ t: new Date().toISOString(), migrations: applied }));

// Site public : en Docker via SITE_DIR / APP_PUBLIC_DIR ; en dev, relatif au dossier api/.
const siteDir = process.env.SITE_DIR ?? resolve(process.cwd(), "../site");
const publicDir = process.env.APP_PUBLIC_DIR ?? resolve(process.cwd(), "../../public");

// Dossier d'état (bandeau de maintenance), monté en lecture seule par le compose.
const stateDir = process.env.STATE_DIR;

const server = serve({ fetch: createApp(db, { siteDir, publicDir, stateDir }).fetch, port: PORT, hostname: "0.0.0.0" }, (info) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), listening: info.port })),
);

const shutdown = () => {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
