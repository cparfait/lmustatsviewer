/**
 * Commandes d'administration / modération, à lancer dans le conteneur :
 *   docker compose exec api node dist/api/src/admin.js <commande> [argument]
 */
import pg from "pg";
import { pgDb } from "./db.js";
import { globalStats } from "./stats.js";

const HELP = `Commandes :
  stats                     chiffres globaux
  homonyms                  installations signalées comme homonymes
  hide-install <id>         masque une installation (bannissement silencieux)
  unhide-install <id>       annule le masquage
  hide-session <session_key>   masque une session
  delete-install <id>       efface une installation et toutes ses sessions`;

const [cmd, arg] = process.argv.slice(2);
if (!cmd || cmd === "help") {
  console.log(HELP);
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = pgDb(pool);

async function run(): Promise<unknown> {
  const need = () => {
    if (!arg) throw new Error("argument manquant");
    return arg;
  };
  switch (cmd) {
    case "stats":
      return globalStats(db);
    case "homonyms":
      return db.query(
        "select id, tag, display_name, created_at from installs where homonym order by created_at",
      );
    case "hide-install":
      return db.query("update installs set hidden = true where id = $1 returning id", [need()]);
    case "unhide-install":
      return db.query("update installs set hidden = false where id = $1 returning id", [need()]);
    case "hide-session":
      return db.query("update sessions set status = 'hidden' where session_key = $1 returning id", [need()]);
    case "delete-install":
      return db.query("delete from installs where id = $1 returning id", [need()]);
    default:
      throw new Error(`commande inconnue : ${cmd}\n${HELP}`);
  }
}

try {
  console.log(JSON.stringify(await run(), null, 2));
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
