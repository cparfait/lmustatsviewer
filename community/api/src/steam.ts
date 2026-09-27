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
import { hashToken, registerInstall } from "./ingest.js";

export const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const SELECT_ID = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
/** Durée de validité d'une connexion commencée. */
const TTL_MS = 10 * 60_000;

/**
 * `register` : activer le partage — retrouve l'installation liée à ce compte Steam, ou
 * la crée (un compte Steam = une installation : aucun doublon possible).
 * `recover` : retrouver sans rien créer (supprimer ses données depuis un autre PC).
 * `link` : lier une installation existante (créée avant la connexion obligatoire).
 */
export type SteamMode = "link" | "recover" | "register";
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

/** Empreinte stockée pour un SteamID64 (aussi utilisée par l'administration). */
export async function steamHashOf(db: Db, steamId64: string): Promise<string> {
  return createHmac("sha256", await steamSecret(db)).update(steamId64).digest("hex");
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
): Promise<{ outcome: SteamOutcome; mode: SteamMode | null }> {
  const [row] = await db.query<{ mode: SteamMode }>("select mode from steam_logins where state = $1", [query.state ?? ""]);
  return { outcome: await finishOutcome(db, query, publicUrl, verify), mode: row?.mode ?? null };
}

async function finishOutcome(
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
  const done = async (status: SteamOutcome, installId: string | null = row.install_id, existing = false) => {
    await db.query(
      "update steam_logins set status = $2, install_id = $3, existing = $4 where poll_hash = $1",
      [row.poll_hash, status, installId, existing],
    );
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

  const steamHash = await steamHashOf(db, m[1]);
  if (row.mode === "link") {
    if (!row.install_id) return done("invalid");
    const other = await db.query("select 1 from installs where steam_hash = $1 and id <> $2", [steamHash, row.install_id]);
    if (other.length) return done("taken");
    await db.query("update installs set steam_hash = $2 where id = $1", [row.install_id, steamHash]);
    return done("ok");
  }
  // Installation masquée (bannie) comprise : pas de nouvelle installation pour la contourner.
  const [inst] = await db.query<{ id: string }>("select id from installs where steam_hash = $1", [steamHash]);
  if (inst) return done("ok", inst.id, true);
  if (row.mode === "recover") return done("not_found");
  const created = await registerInstall(db, steamHash);
  return done("ok", created.install_id, false);
}

/**
 * Interrogation par l'app. Une réponse finale n'est remise qu'UNE fois (la ligne est
 * effacée). Retrouver une installation : nouveau jeton, l'ancien ne vaut plus rien.
 */
export async function pollSteam(db: Db, pollId: string) {
  const [row] = await db.query<{ poll_hash: string; mode: SteamMode; install_id: string | null; status: string; existing: boolean; age_ms: number }>(
    `select poll_hash, mode, install_id, status, existing, extract(epoch from now() - created_at) * 1000 as age_ms
     from steam_logins where poll_hash = $1`,
    [sha256(pollId)],
  );
  if (!row) return { status: "expired" as const };
  if (row.status === "pending" && Number(row.age_ms) <= TTL_MS) return { status: "pending" as const };
  await db.query("delete from steam_logins where poll_hash = $1", [row.poll_hash]);
  if (row.status === "pending") return { status: "expired" as const };
  if (row.status !== "ok" || !row.install_id) return { status: row.status as SteamOutcome };
  if (row.mode === "link") return { status: "ok" as const, mode: "link" as const };
  // register / recover : l'app reçoit un jeton neuf (l'ancien, s'il existe, est révoqué).
  const token = randomBytes(32).toString("base64url");
  const [inst] = await db.query<{ id: string; tag: string; anonymous: boolean }>(
    "update installs set token_hash = $2 where id = $1 returning id, tag, anonymous",
    [row.install_id, hashToken(token)],
  );
  if (!inst) return { status: "not_found" as const };
  return {
    status: "ok" as const,
    mode: row.mode,
    install_id: inst.id,
    tag: inst.tag,
    token,
    anonymous: inst.anonymous,
    /** Installation déjà existante (tours retrouvés) plutôt que créée à l'instant. */
    existing: row.existing,
  };
}

export type PageLang = "fr" | "en" | "es" | "de";

/** Langue de la page : première langue connue du navigateur, sinon anglais. */
export function pickLang(acceptLanguage: string | undefined): PageLang {
  for (const part of (acceptLanguage ?? "").split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (code === "fr" || code === "en" || code === "es" || code === "de") return code;
  }
  return "en";
}

type PageCase = "linked" | "recovered" | "registered" | Exclude<SteamOutcome, "ok">;
const PAGE: Record<PageLang, { band: string; crumbs: string; cta: string } & Record<PageCase, [string, string]>> = {
  fr: {
    band: "Se connecter avec Steam",
    crumbs: "Classements",
    cta: "Voir les classements",
    linked: ["Compte Steam lié", "Vous pourrez retrouver vos tours sur un autre PC. Revenez dans LMU Stats Viewer : cet onglet peut être fermé."],
    recovered: ["Tours retrouvés", "Revenez dans LMU Stats Viewer : cet onglet peut être fermé."],
    registered: ["Connexion Steam réussie", "Revenez dans LMU Stats Viewer : le partage s'active. Cet onglet peut être fermé."],
    not_found: ["Aucun partage lié à ce compte", "Ce compte Steam n'a aucun tour partagé : il n'y a rien à supprimer."],
    taken: ["Compte Steam déjà utilisé", "Ce compte Steam a déjà des tours partagés depuis une autre installation. Dans l'app, supprimez les données de cette installation-ci, puis réactivez le partage : vos tours seront repris."],
    invalid: ["Connexion non confirmée", "Steam n'a pas confirmé la connexion. Recommencez depuis l'app."],
    expired: ["Demande expirée", "Cette demande a expiré (10 minutes). Recommencez depuis l'app."],
  },
  en: {
    band: "Sign in with Steam",
    crumbs: "Leaderboards",
    cta: "See the leaderboards",
    linked: ["Steam account linked", "You will be able to recover your laps on another PC. Go back to LMU Stats Viewer: you can close this tab."],
    recovered: ["Laps recovered", "Go back to LMU Stats Viewer: you can close this tab."],
    registered: ["Signed in with Steam", "Go back to LMU Stats Viewer: sharing is being enabled. You can close this tab."],
    not_found: ["No shared laps linked to this account", "This Steam account has no shared laps: there is nothing to delete."],
    taken: ["Steam account already in use", "This Steam account already has laps shared from another installation. In the app, delete this installation's data, then enable sharing again: your laps will be taken back."],
    invalid: ["Sign-in not confirmed", "Steam did not confirm the sign-in. Start again from the app."],
    expired: ["Request expired", "This request has expired (10 minutes). Start again from the app."],
  },
  es: {
    band: "Iniciar sesión con Steam",
    crumbs: "Clasificaciones",
    cta: "Ver las clasificaciones",
    linked: ["Cuenta de Steam vinculada", "Podrás recuperar tus vueltas en otro PC. Vuelve a LMU Stats Viewer: puedes cerrar esta pestaña."],
    recovered: ["Vueltas recuperadas", "Vuelve a LMU Stats Viewer: puedes cerrar esta pestaña."],
    registered: ["Sesión de Steam iniciada", "Vuelve a LMU Stats Viewer: el uso compartido se está activando. Puedes cerrar esta pestaña."],
    not_found: ["Ninguna vuelta vinculada a esta cuenta", "Esta cuenta de Steam no tiene vueltas compartidas: no hay nada que borrar."],
    taken: ["Cuenta de Steam ya en uso", "Esta cuenta de Steam ya tiene vueltas compartidas desde otra instalación. En la app, borra los datos de esta instalación y vuelve a activar el uso compartido: se recuperarán tus vueltas."],
    invalid: ["Inicio de sesión no confirmado", "Steam no confirmó el inicio de sesión. Vuelve a empezar desde la app."],
    expired: ["Solicitud caducada", "Esta solicitud ha caducado (10 minutos). Vuelve a empezar desde la app."],
  },
  de: {
    band: "Mit Steam anmelden",
    crumbs: "Ranglisten",
    cta: "Ranglisten ansehen",
    linked: ["Steam-Konto verknüpft", "Du kannst deine Runden auf einem anderen PC wiederfinden. Kehre zu LMU Stats Viewer zurück: Dieser Tab kann geschlossen werden."],
    recovered: ["Runden wiedergefunden", "Kehre zu LMU Stats Viewer zurück: Dieser Tab kann geschlossen werden."],
    registered: ["Mit Steam angemeldet", "Kehre zu LMU Stats Viewer zurück: Das Teilen wird aktiviert. Dieser Tab kann geschlossen werden."],
    not_found: ["Keine geteilten Runden mit diesem Konto", "Dieses Steam-Konto hat keine geteilten Runden: Es gibt nichts zu löschen."],
    taken: ["Steam-Konto bereits verwendet", "Dieses Steam-Konto hat bereits Runden von einer anderen Installation geteilt. Lösche in der App die Daten dieser Installation und aktiviere das Teilen erneut: Deine Runden werden übernommen."],
    invalid: ["Anmeldung nicht bestätigt", "Steam hat die Anmeldung nicht bestätigt. Starte erneut in der App."],
    expired: ["Anfrage abgelaufen", "Diese Anfrage ist abgelaufen (10 Minuten). Starte erneut in der App."],
  },
};

const ICON_OK = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_ERR = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5M12 16.5h.01"/><circle cx="12" cy="12" r="9"/></svg>';

/**
 * Page affichée dans le navigateur au retour de Steam : aux couleurs du site (même feuille
 * de style, même `?v=` que les pages du site), sans script (CSP stricte). Textes fixes.
 */
export function steamReturnPage(outcome: SteamOutcome, mode: SteamMode | null, lang: PageLang): string {
  const L = PAGE[lang];
  const key: PageCase = outcome === "ok" ? (mode === "recover" ? "recovered" : mode === "register" ? "registered" : "linked") : outcome;
  const [title, body] = L[key];
  const ok = outcome === "ok";
  return `<!DOCTYPE html>
<html lang="${lang}" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} — LMU Stats Viewer</title>
<link rel="icon" href="/favicon.ico?v=38">
<link rel="stylesheet" href="/assets/site.css?v=38">
</head>
<body>
<header class="site-header"><div class="wrap header-inner"><a class="brand" href="/"><img class="brand-logo" src="/assets/icon-32.png?v=1" alt=""><span>LMU Stats Viewer <span class="brand-sub">${L.crumbs}</span></span></a></div></header>
<main class="wrap steam-page">
  <section class="cgroup steam-card">
    <div class="cg-head cg-static"><span class="cg-name">${L.band}</span></div>
    <div class="steam-body">
      <span class="steam-ico ${ok ? "is-ok" : "is-err"}">${ok ? ICON_OK : ICON_ERR}</span>
      <h1>${title}</h1>
      <p class="muted">${body}</p>
      <a class="btn btn-primary" href="/">${L.cta}</a>
    </div>
  </section>
</main>
</body>
</html>`;
}
