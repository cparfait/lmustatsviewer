import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { STEAM_OPENID, pickLang, steamReturnPage } from "../src/steam.js";
import { RA, register, send, session, setup } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof setup>>;
const PUBLIC = "https://lmu.test";

/** Steam simulé : n'accepte que les assertions marquées valides. */
const fakeSteam = async (p: Record<string, string>) => p["openid.sig"] === "ok";

async function start(ctx: Ctx, mode: "link" | "recover" | "register" | "avatar", token?: string) {
  const res = await ctx.app.request("/api/v1/steam/start", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ mode }),
  });
  return { status: res.status, body: (await res.json()) as { url: string; poll_id: string } };
}

/** Retour du navigateur depuis Steam, pour le SteamID donné. */
async function steamReturn(ctx: Ctx, url: string, steamId: string, over: Record<string, string> = {}) {
  const returnTo = new URL(url).searchParams.get("openid.return_to")!;
  const state = new URL(returnTo).searchParams.get("state")!;
  const q = new URLSearchParams({
    state,
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "id_res",
    "openid.op_endpoint": STEAM_OPENID,
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${steamId}`,
    "openid.identity": `https://steamcommunity.com/openid/id/${steamId}`,
    "openid.return_to": returnTo,
    "openid.sig": "ok",
    ...over,
  });
  return ctx.app.request(`/api/v1/steam/return?${q}`);
}

const poll = async (ctx: Ctx, id: string) => (await (await ctx.app.request(`/api/v1/steam/poll?id=${id}`)).json()) as Record<string, unknown>;

describe("Se connecter avec Steam", () => {
  let ctx: Ctx;
  before(async () => { ctx = await setup({ publicUrl: PUBLIC, steamVerify: fakeSteam, requireSteam: true }); });
  after(() => ctx.close());

  test("activer = se connecter avec Steam : une installation par compte, reprise sur un autre PC", async () => {
    // Sans Steam, l'envoi est refusé (mais la suppression reste possible).
    const bare = await register(ctx.app);
    const refused = await send(ctx.app, bare.token, [session({}, { time: 90 })]);
    assert.equal(refused.status, 403);
    assert.deepEqual(await refused.json(), { error: "steam_required" });
    const del = await ctx.app.request("/api/v1/me", { method: "DELETE", headers: { authorization: `Bearer ${bare.token}` } });
    assert.equal(del.status, 204);

    // 1er PC : création liée à Steam, l'envoi passe.
    const r1 = await start(ctx, "register");
    await steamReturn(ctx, r1.body.url, "76561198000000009");
    const p1 = await poll(ctx, r1.body.poll_id);
    assert.equal(p1.status, "ok");
    assert.equal(p1.existing, false);
    assert.equal((await send(ctx.app, String(p1.token), [session({}, { time: 88 })])).status, 200);

    // 2e PC (ou réinstallation sans coffre) : la même installation, pas de doublon.
    const r2 = await start(ctx, "register");
    await steamReturn(ctx, r2.body.url, "76561198000000009");
    const p2 = await poll(ctx, r2.body.poll_id);
    assert.equal(p2.install_id, p1.install_id);
    assert.equal(p2.existing, true);
    const auth = (tok: unknown) => ({ headers: { authorization: `Bearer ${tok}` } });
    assert.equal((await ctx.app.request("/api/v1/me", auth(p1.token))).status, 401, "ancien jeton révoqué");
    const me = (await (await ctx.app.request("/api/v1/me", auth(p2.token))).json()) as { sessions: unknown[] };
    assert.equal(me.sessions.length, 1);
  });

  test("lier, puis retrouver l'installation sur un autre PC (nouveau jeton, l'ancien révoqué)", async () => {
    const a = await register(ctx.app);

    // Lier exige le jeton.
    assert.equal((await start(ctx, "link")).status, 401);
    const link = await start(ctx, "link", a.token);
    assert.equal(link.status, 200);
    assert.ok(link.body.url.startsWith(`${STEAM_OPENID}?`));
    assert.equal(new URL(link.body.url).searchParams.get("openid.realm"), PUBLIC);
    assert.deepEqual(await poll(ctx, link.body.poll_id), { status: "pending" });
    assert.equal((await steamReturn(ctx, link.body.url, "76561198000000001")).status, 200);
    assert.deepEqual(await poll(ctx, link.body.poll_id), { status: "ok", mode: "link" });
    // Liée : l'envoi est accepté.
    assert.equal((await send(ctx.app, a.token, [session({}, { time: 80 })])).status, 200);
    // Réponse finale remise une seule fois.
    assert.deepEqual(await poll(ctx, link.body.poll_id), { status: "expired" });

    // Autre PC : retrouver avec le même compte Steam.
    const rec = await start(ctx, "recover");
    await steamReturn(ctx, rec.body.url, "76561198000000001");
    const got = await poll(ctx, rec.body.poll_id);
    assert.equal(got.status, "ok");
    assert.equal(got.mode, "recover");
    assert.equal(got.install_id, a.install_id);
    assert.equal(got.tag, a.tag);
    const auth = (tok: unknown) => ({ headers: { authorization: `Bearer ${tok}` } });
    assert.equal((await ctx.app.request("/api/v1/me", auth(got.token))).status, 200);
    assert.equal((await ctx.app.request("/api/v1/me", auth(a.token))).status, 401);
    const me = (await (await ctx.app.request("/api/v1/me", auth(got.token))).json()) as { sessions: unknown[] };
    assert.equal(me.sessions.length, 1);
  });

  test("compte Steam inconnu, déjà lié ailleurs, assertion refusée ou détournée", async () => {
    const rec = await start(ctx, "recover");
    await steamReturn(ctx, rec.body.url, "76561198000000002");
    assert.deepEqual(await poll(ctx, rec.body.poll_id), { status: "not_found" });

    // Déjà lié à une autre installation (1er test) → « taken ».
    const b = await register(ctx.app);
    const link = await start(ctx, "link", b.token);
    await steamReturn(ctx, link.body.url, "76561198000000001");
    assert.deepEqual(await poll(ctx, link.body.poll_id), { status: "taken" });

    // Steam ne confirme pas.
    const bad = await start(ctx, "link", b.token);
    assert.equal((await steamReturn(ctx, bad.body.url, "76561198000000003", { "openid.sig": "forged" })).status, 400);
    assert.deepEqual(await poll(ctx, bad.body.poll_id), { status: "invalid" });

    // Adresse de retour détournée vers un autre site.
    const hij = await start(ctx, "link", b.token);
    const state = new URL(new URL(hij.body.url).searchParams.get("openid.return_to")!).searchParams.get("state")!;
    await steamReturn(ctx, hij.body.url, "76561198000000003", {
      "openid.return_to": `https://evil.example/api/v1/steam/return?state=${state}`,
    });
    assert.deepEqual(await poll(ctx, hij.body.poll_id), { status: "invalid" });

    // Supprimer ses données : un « retrouver » ne trouve plus rien.
    const c = await register(ctx.app);
    const l2 = await start(ctx, "link", c.token);
    await steamReturn(ctx, l2.body.url, "76561198000000004");
    await poll(ctx, l2.body.poll_id);
    const del = await ctx.app.request("/api/v1/me", { method: "DELETE", headers: { authorization: `Bearer ${c.token}` } });
    assert.equal(del.status, 204);
    const r2 = await start(ctx, "recover");
    await steamReturn(ctx, r2.body.url, "76561198000000004");
    assert.deepEqual(await poll(ctx, r2.body.poll_id), { status: "not_found" });
  });
});

describe("suppression : le nom revient à l'homonyme suivant", () => {
  let ctx: Ctx;
  before(async () => { ctx = await setup(); });
  after(() => ctx.close());

  test("deux « Cris Tof », le premier supprime ses données → le second n'est plus homonyme", async () => {
    const a = await register(ctx.app);
    const b = await register(ctx.app);
    await send(ctx.app, a.token, [session({ driver_name: "Cris Tof" }, { time: 80 })]);
    await send(ctx.app, b.token, [session({ driver_name: "Cris Tof" }, { time: 81 })]);
    const search = async () =>
      ((await (await ctx.app.request("/api/v1/drivers?q=Cris")).json()) as { drivers: { tag: string; homonym: boolean }[] }).drivers;
    assert.equal((await search()).find((d) => d.tag === b.tag)?.homonym, true);
    const del = await ctx.app.request("/api/v1/me", { method: "DELETE", headers: { authorization: `Bearer ${a.token}` } });
    assert.equal(del.status, 204);
    assert.deepEqual(await search(), [{ ...(await search())[0], tag: b.tag, homonym: false }]);
  });
});

describe("Pays et avatar Steam", () => {
  let ctx: Ctx;
  const AVATAR = "0123456789abcdef0123456789abcdef01234567";
  const asked: string[][] = [];
  before(async () => {
    ctx = await setup({
      publicUrl: PUBLIC,
      steamVerify: fakeSteam,
      requireSteam: true,
      steamAvatars: async (ids) => {
        asked.push(ids);
        return new Map(ids.map((id) => [id, AVATAR]));
      },
    });
  });
  after(() => ctx.close());

  const patch = (token: string, body: unknown) =>
    ctx.app.request("/api/v1/me", {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const driver = async () => {
    const lb = (await (await ctx.app.request(`/api/v1/combos/leaderboard?${RA}`)).json()) as { rows: { driver: Record<string, unknown> }[] };
    return lb.rows[0].driver;
  };

  test("pays du jeu ; avatar affiché dès la connexion Steam, retiré puis rétabli sur demande, masqué en anonyme", async () => {
    const r = await start(ctx, "register");
    await steamReturn(ctx, r.body.url, "76561198000000042");
    const p = await poll(ctx, r.body.poll_id);
    assert.equal(p.avatar, true);
    assert.equal(p.avatar_ready, true);
    const token = String(p.token);
    assert.equal((await send(ctx.app, token, [session({}, { time: 85 })])).status, 200);
    // Avatar par défaut : lu dès la connexion Steam.
    assert.deepEqual(asked.at(-1), ["76561198000000042"]);
    assert.deepEqual(await driver(), { name: "Cris Tof", tag: p.tag, homonym: false, country: null, avatar: AVATAR });

    // Pays : envoyé par l'app, sans toucher au reste.
    assert.equal((await patch(token, { nationality: "fr" })).status, 200);
    assert.equal((await driver()).country, "FR");
    assert.equal((await patch(token, { nationality: "France" })).status, 400);
    assert.equal((await patch(token, {})).status, 400);

    // Retirer l'avatar efface aussi le SteamID64 ; une nouvelle connexion Steam le respecte.
    const off = (await (await patch(token, { avatar: false })).json()) as Record<string, unknown>;
    assert.equal(off.avatar, false);
    assert.equal(off.avatar_ready, false);
    assert.equal((await driver()).avatar, null);
    const again = await start(ctx, "register");
    await steamReturn(ctx, again.body.url, "76561198000000042");
    const p2 = await poll(ctx, again.body.poll_id);
    assert.equal(p2.avatar, false);
    const tok2 = String(p2.token);
    const [row] = await ctx.db.query<{ steam_id: string | null }>("select steam_id from installs where tag = $1", [p.tag]);
    assert.equal(row.steam_id, null);

    // Le rétablir : voulu tout de suite, disponible après la connexion Steam (même compte).
    const on = (await (await patch(tok2, { avatar: true })).json()) as Record<string, unknown>;
    assert.deepEqual([on.avatar, on.avatar_ready], [true, false]);
    assert.equal((await start(ctx, "avatar")).status, 401);
    const other = await start(ctx, "avatar", tok2);
    assert.equal((await steamReturn(ctx, other.body.url, "76561198000000043")).status, 400);
    assert.deepEqual(await poll(ctx, other.body.poll_id), { status: "other_account" });
    const mine = await start(ctx, "avatar", tok2);
    assert.equal((await steamReturn(ctx, mine.body.url, "76561198000000042")).status, 200);
    assert.deepEqual(await poll(ctx, mine.body.poll_id), { status: "ok", mode: "avatar" });
    assert.equal((await driver()).avatar, AVATAR);
    const me = (await (await ctx.app.request("/api/v1/me", { headers: { authorization: `Bearer ${tok2}` } })).json()) as Record<string, unknown>;
    assert.equal(me.steam_id, "76561198000000042");
    assert.equal(me.nationality, "FR");

    // Anonyme : ni pays ni avatar publiés, ni relayés.
    await patch(tok2, { anonymous: true });
    assert.deepEqual(await driver(), { name: null, tag: p.tag, homonym: false, country: null, avatar: null });
    assert.equal((await ctx.app.request(`/api/v1/avatar/${AVATAR}`)).status, 404);
    assert.equal((await ctx.app.request("/api/v1/avatar/not-a-hash")).status, 404);
  });
});

// Langue de la page de retour Steam : première langue connue du navigateur, sinon anglais.
describe("steam return page language", () => {
  test("picks the first supported language, including Italian", () => {
    assert.equal(pickLang("it-IT,it;q=0.9,en;q=0.8"), "it");
    assert.equal(pickLang("pt-BR,de;q=0.7"), "de");
    assert.equal(pickLang("ja"), "en");
    assert.equal(pickLang(undefined), "en");
  });
  test("renders the Italian page", () => {
    const html = steamReturnPage("ok", "link", "it");
    assert.match(html, /<html lang="it"/);
    assert.match(html, /Account Steam collegato/);
  });
});
