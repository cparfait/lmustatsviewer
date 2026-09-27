/**
 * « Se connecter avec Steam » : lier son installation à son compte Steam, puis la
 * RETROUVER sur un autre PC (ou après une réinstallation) — sans compte chez nous.
 *
 * Steam OpenID 2.0 : le navigateur du joueur passe par la page de connexion officielle
 * de Steam, qui revient sur `/api/v1/steam/return` avec une assertion signée ; le
 * serveur la fait confirmer par Steam (`check_authentication`). Aucun mot de passe ne
 * transite par l'app ni par ce serveur, aucune clé d'API Steam n'est nécessaire.
 *
 * Vie privée : seul un HMAC du SteamID64 est conservé (`installs.steam_hash`), avec un
 * secret propre à ce serveur (`server_secrets`) — ni le SteamID, ni le pseudo, ni la
 * liste d'amis.
 *
 * L'app ne voit jamais la redirection : elle ouvre l'URL renvoyée par `start`, puis
 * interroge `poll` avec un identifiant secret (distinct du `state` visible dans l'URL).
 * Retrouver une installation lui remet un NOUVEAU jeton (l'ancien est révoqué).
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Db } from "./db.js";
import { hashToken } from "./ingest.js";

export const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const SELECT_ID = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
/** Durée de validité d'une connexion commencée. */
const TTL_MS = 10 * 60_000;

export type SteamMode = "link" | "recover";
export type SteamOutcome = "ok" | "not_found" | "taken" | "invalid" | "expired";

/** Confirme une assertion auprès de Steam (remplaçable dans les tests). */
export type SteamVerifier = (params: Record<string, string>) => Promise<boolean>;

export const verifyWithSteam: SteamVerifier = async (params) => {
  const body = new URLSearchParams({ ...params, "openid.mode": "check_authentication" });
  const res = await fetch(STEAM_OPENID, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok && /(^|\n)is_valid:true(\r?\n|$)/.test(await res.text());
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const returnUrl = (publicUrl: string, state: string) => `${publicUrl}/api/v1/steam/return?state=${state}`;

/** Secret HMAC du serveur, créé au premier usage (aucune variable d'environnement à gérer). */
async function steamSecret(db: Db): Promise<string> {
  await db.query(
    "insert into server_secrets (name, value) values ('steam', $1) on conflict (name) do nothing",
    [randomBytes(32).toString("hex")],
  );
  const [row] = await db.query<{ value: string }>("select value from server_secrets where name = 'steam'");
  return row.value;
}

/** Commence une connexion : URL Steam à ouvrir + identifiant secret à interroger. */
export async function startSteam(db: Db, mode: SteamMode, installId: string | null, publicUrl: string) {
  await db.query("delete from steam_logins where created_at < now() - interval '1 hour'");
  const pollId = randomBytes(24).toString("base64url");
  const state = randomBytes(16).toString("hex");
  await db.query(
    "insert into steam_logins (poll_hash, state, mode, install_id) values ($1, $2, $3, $4)",
    [sha256(pollId), state, mode, installId],
  );
  const q = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": returnUrl(publicUrl, state),
    "openid.realm": publicUrl,
    "openid.identity": SELECT_ID,
    "openid.claimed_id": SELECT_ID,
  });
  return { url: `${STEAM_OPENID}?${q}`, poll_id: pollId, expires_in: TTL_MS / 1000 };
}

/** Retour de Steam : vérifie l'assertion, puis lie ou retrouve l'installation. */
export async function finishSteam(
  db: Db,
  query: Record<string, string>,
  publicUrl: string,
  verify: SteamVerifier,
): Promise<SteamOutcome> {
  const state = query.state ?? "";
  const [row] = await db.query<{ poll_hash: string; mode: SteamMode; install_id: string | null; age_ms: number }>(
    `select poll_hash, mode, install_id, extract(epoch from now() - created_at) * 1000 as age_ms
     from steam_logins where state = $1 and status = 'pending'`,
    [state],
  );
  if (!row) return "expired";
  const done = async (status: SteamOutcome, installId: string | null = row.install_id) => {
    await db.query("update steam_logins set status = $2, install_id = $3 where poll_hash = $1", [row.poll_hash, status, installId]);
    return status;
  };
  if (Number(row.age_ms) > TTL_MS) return done("expired");

  const params = Object.fromEntries(Object.entries(query).filter(([k]) => k.startsWith("openid.")));
  const m = CLAIMED_ID.exec(params["openid.claimed_id"] ?? "");
  const shapeOk =
    m != null &&
    params["openid.mode"] === "id_res" &&
    params["openid.op_endpoint"] === STEAM_OPENID &&
    params["openid.return_to"] === returnUrl(publicUrl, state);
  if (!m || !shapeOk || !(await verify(params).catch(() => false))) return done("invalid");

  const steamHash = createHmac("sha256", await steamSecret(db)).update(m[1]).digest("hex");
  if (row.mode === "link") {
    if (!row.install_id) return done("invalid");
    const other = await db.query("select 1 from installs where steam_hash = $1 and id <> $2", [steamHash, row.install_id]);
    if (other.length) return done("taken");
    await db.query("update installs set steam_hash = $2 where id = $1", [row.install_id, steamHash]);
    return done("ok");
  }
  const [inst] = await db.query<{ id: string }>("select id from installs where steam_hash = $1 and not hidden", [steamHash]);
  return inst ? done("ok", inst.id) : done("not_found");
}

/**
 * Interrogation par l'app. Une réponse finale n'est remise qu'UNE fois (la ligne est
 * effacée). Retrouver une installation : nouveau jeton, l'ancien ne vaut plus rien.
 */
export async function pollSteam(db: Db, pollId: string) {
  const [row] = await db.query<{ poll_hash: string; mode: SteamMode; install_id: string | null; status: string; age_ms: number }>(
    `select poll_hash, mode, install_id, status, extract(epoch from now() - created_at) * 1000 as age_ms
     from steam_logins where poll_hash = $1`,
    [sha256(pollId)],
  );
  if (!row) return { status: "expired" as const };
  if (row.status === "pending" && Number(row.age_ms) <= TTL_MS) return { status: "pending" as const };
  await db.query("delete from steam_logins where poll_hash = $1", [row.poll_hash]);
  if (row.status === "pending") return { status: "expired" as const };
  if (row.status !== "ok" || !row.install_id) return { status: row.status as SteamOutcome };
  if (row.mode === "link") return { status: "ok" as const, mode: "link" as const };
  const token = randomBytes(32).toString("base64url");
  const [inst] = await db.query<{ id: string; tag: string; anonymous: boolean }>(
    "update installs set token_hash = $2 where id = $1 returning id, tag, anonymous",
    [row.install_id, hashToken(token)],
  );
  if (!inst) return { status: "not_found" as const };
  return { status: "ok" as const, mode: "recover" as const, install_id: inst.id, tag: inst.tag, token, anonymous: inst.anonymous };
}

/** Page affichée dans le navigateur au retour de Steam (sans script, CSP stricte). */
export function steamReturnPage(outcome: SteamOutcome): string {
  const msg: Record<SteamOutcome, [string, string]> = {
    ok: ["C'est fait. Vous pouvez fermer cette page et revenir dans LMU Stats Viewer.", "Done. You can close this page and go back to LMU Stats Viewer."],
    not_found: ["Aucun partage n'est lié à ce compte Steam. Revenez dans l'app.", "No shared laps are linked to this Steam account. Go back to the app."],
    taken: ["Ce compte Steam est déjà lié à une autre installation. Dans l'app, utilisez « Retrouver mes tours avec Steam ».", "This Steam account is already linked to another installation. In the app, use “Recover my laps with Steam”."],
    invalid: ["Steam n'a pas confirmé la connexion. Réessayez depuis l'app.", "Steam did not confirm the sign-in. Try again from the app."],
    expired: ["Cette demande a expiré. Recommencez depuis l'app.", "This request has expired. Start again from the app."],
  };
  const [fr, en] = msg[outcome];
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LMU Stats Viewer — Steam</title></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 20px;line-height:1.5;color:#0b0f1e">
<h1 style="font-size:1.3rem">LMU Stats Viewer</h1><p>${fr}</p><p style="color:#5a6070">${en}</p></body></html>`;
}
