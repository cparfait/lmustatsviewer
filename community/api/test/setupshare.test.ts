/**
 * Partage des setups : tables de crans (consensus) et setups publiés (versions,
 * anonymat de l'auteur, droits, export et effacement).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { digest, register, setup } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof setup>>;

const CAR = "Mercedes_AMGGT3Evo_2025/1.11";

const post = (ctx: Ctx, path: string, token: string, body: unknown, digestOverride?: string) => {
  const raw = JSON.stringify(body);
  return ctx.app.request(`/api/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "content-digest": digestOverride ?? digest(raw),
      "x-real-ip": "10.0.0.1",
    },
    body: raw,
  });
};
const authed = (ctx: Ctx, method: string, path: string, token: string) =>
  ctx.app.request(`/api/v1${path}`, { method, headers: { authorization: `Bearer ${token}`, "x-real-ip": "10.0.0.1" } });

const SVM = ["[GENERAL]", "Notes=", "//VEH=C:\\x\\Vehicles\\Mercedes_AMGGT3Evo_2025\\1.11\\car.veh", "[REARWING]", "RWSetting=7//7.0 deg", ""].join("\n");

const setupBody = (over: Record<string, unknown> = {}) => ({
  car_key: CAR,
  car_class: "GT3",
  car_model: "Mercedes-AMG LMGT3",
  track: "Spa",
  name: "Spa course",
  setup_type: "Course",
  notes: "stable en sortie",
  svm: SVM,
  best_lap: 137.4,
  game_version: "1.42",
  ...over,
});

describe("tables de crans", () => {
  let ctx: Ctx;
  const tokens: string[] = [];
  before(async () => {
    ctx = await setup();
    for (let i = 0; i < 3; i++) tokens.push((await register(ctx.app, `10.0.1.${i}`)).token);
  });
  after(() => ctx.close());

  const report = (rw7: string, count?: number) => ({
    car_key: CAR,
    table: { "REARWING.RWSetting": { displays: { "7": rw7, "8": "8.0 deg" }, ...(count ? { count } : {}) } },
  });

  test("sans jeton → 401 ; empreinte fausse → 400", async () => {
    assert.equal((await post(ctx, "/notches", "x".repeat(30), report("7.0 deg"))).status, 401);
    assert.equal((await post(ctx, "/notches", tokens[0], report("7.0 deg"), "sha-256=:AAAA:")).status, 400);
  });

  test("voiture inconnue → 404", async () => {
    assert.equal((await ctx.app.request(`/api/v1/notches?car=${encodeURIComponent(CAR)}`)).status, 404);
  });

  test("majorité retenue, égalité non tranchée, nombre de crans", async () => {
    assert.equal((await post(ctx, "/notches", tokens[0], report("7.0 deg", 12))).status, 200);
    assert.equal((await post(ctx, "/notches", tokens[1], report("7.0 deg", 12))).status, 200);
    assert.equal((await post(ctx, "/notches", tokens[2], report("7.5 deg", 13))).status, 200);
    const t = (await (await ctx.app.request(`/api/v1/notches?car=${encodeURIComponent(CAR)}`)).json()) as {
      reporters: number;
      table: Record<string, { displays: Record<string, string>; count?: number }>;
    };
    assert.equal(t.reporters, 3);
    assert.equal(t.table["REARWING.RWSetting"].displays["7"], "7.0 deg");
    assert.equal(t.table["REARWING.RWSetting"].displays["8"], "8.0 deg");
    assert.equal(t.table["REARWING.RWSetting"].count, 12);
    // Le 2ᵉ pilote se ravise : 1 contre 1 contre 1 → égalité, index laissé vide.
    await post(ctx, "/notches", tokens[1], report("6.5 deg"));
    const t2 = (await (await ctx.app.request(`/api/v1/notches?car=${encodeURIComponent(CAR)}`)).json()) as {
      table: Record<string, { displays: Record<string, string> }>;
    };
    assert.equal(t2.table["REARWING.RWSetting"].displays["7"], undefined);
    assert.equal(t2.table["REARWING.RWSetting"].displays["8"], "8.0 deg");
  });

  test("clé de voiture ou réglage invalides → 400", async () => {
    assert.equal((await post(ctx, "/notches", tokens[0], { car_key: "../x", table: {} })).status, 400);
    assert.equal((await post(ctx, "/notches", tokens[0], { car_key: CAR, table: { "bad id": { displays: {} } } })).status, 400);
  });
});

describe("setups publiés", () => {
  let ctx: Ctx;
  let alice: string;
  let bob: string;
  before(async () => {
    ctx = await setup();
    alice = (await register(ctx.app, "10.0.2.1")).token;
    bob = (await register(ctx.app, "10.0.2.2")).token;
  });
  after(() => ctx.close());

  test("publier deux fois le même nom = version 2 ; la liste montre la dernière", async () => {
    const r1 = await post(ctx, "/setups", alice, setupBody());
    assert.equal(r1.status, 201);
    assert.equal(((await r1.json()) as { version: number }).version, 1);
    const r2 = await post(ctx, "/setups", alice, setupBody({ best_lap: 137.1, name: "SPA COURSE" }));
    assert.equal(((await r2.json()) as { version: number }).version, 2);
    await post(ctx, "/setups", bob, setupBody({ name: "Qualif", best_lap: 136.9, setup_type: "Qualif" }));

    const list = (await (await ctx.app.request("/api/v1/setups?car=Mercedes_AMGGT3Evo_2025&track=Spa")).json()) as {
      setups: { id: number; name: string; version: number; versions: number; best_lap: number; author: { name: string | null; tag: string } }[];
    };
    assert.equal(list.setups.length, 2);
    assert.equal(list.setups[0].name, "Qualif"); // meilleur tour d'abord
    const a = list.setups[1];
    assert.equal(a.version, 2);
    assert.equal(a.versions, 2);
    assert.equal(a.best_lap, 137.1);
    assert.equal(a.author.name, null); // pas de nom de pilote connu (aucune session) → rien d'affiché
    assert.match(a.author.tag, /^#[0-9a-f]{4}$/);
  });

  test("contenu, versions et compteur de téléchargements", async () => {
    const list = (await (await ctx.app.request("/api/v1/setups?car=Mercedes_AMGGT3Evo_2025")).json()) as { setups: { id: number; name: string }[] };
    const id = list.setups.find((s) => s.name !== "Qualif")!.id;
    const item = (await (await ctx.app.request(`/api/v1/setups/item?id=${id}&download=1`)).json()) as {
      svm: string;
      downloads: number;
      versions: { version: number }[];
    };
    assert.equal(item.svm, SVM);
    assert.equal(item.downloads, 1);
    assert.deepEqual(item.versions.map((v) => v.version), [2, 1]);
    assert.equal((await ctx.app.request("/api/v1/setups/item?id=999999")).status, 404);
  });

  test("contenu qui n'est pas un .svm, nom de fichier dangereux → 400", async () => {
    assert.equal((await post(ctx, "/setups", alice, setupBody({ svm: "<script>alert(1)</script>\n[GENERAL]" }))).status, 400);
    assert.equal((await post(ctx, "/setups", alice, setupBody({ svm: "Notes=x" }))).status, 400);
    assert.equal((await post(ctx, "/setups", alice, setupBody({ name: "..\\..\\x" }))).status, 400);
    assert.equal((await post(ctx, "/setups", alice, setupBody({ track: "a/b" }))).status, 400);
    // Notes publiées longues : la ligne Notes="…" passe (1000 caractères de notes).
    const long = SVM.replace("Notes=", `Notes="${"x".repeat(1000)}"`);
    assert.equal((await post(ctx, "/setups", alice, setupBody({ svm: long, name: "Longues notes" }))).status, 201);
  });

  test("on ne retire que les siens ; « all » retire toutes les versions", async () => {
    const mine = (await (await authed(ctx, "GET", "/setups/mine", alice)).json()) as { setups: { id: number; name: string }[] };
    assert.equal(mine.setups.length, 3); // « Spa course » v1 et v2, « Longues notes »
    const spa = mine.setups.find((s) => s.name.toLowerCase() === "spa course")!;
    assert.equal((await authed(ctx, "DELETE", `/setups/item?id=${spa.id}`, bob)).status, 404);
    const del = await authed(ctx, "DELETE", `/setups/item?id=${spa.id}&all=1`, alice);
    assert.equal(((await del.json()) as { deleted: number }).deleted, 2);
    const after = (await (await authed(ctx, "GET", "/setups/mine", alice)).json()) as { setups: { name: string }[] };
    assert.deepEqual(after.setups.map((s) => s.name), ["Longues notes"]);
  });

  test("export « mes données » puis effacement en cascade", async () => {
    await post(ctx, "/setups", bob, setupBody({ name: "Course" }));
    const me = (await (await authed(ctx, "GET", "/me", bob)).json()) as { shared_setups: { name: string }[]; notch_cars: string[] };
    assert.deepEqual(me.shared_setups.map((s) => s.name).sort(), ["Course", "Qualif"]);
    assert.equal((await authed(ctx, "DELETE", "/me", bob)).status, 204);
    const list = (await (await ctx.app.request("/api/v1/setups?car=Mercedes_AMGGT3Evo_2025")).json()) as { setups: { name: string }[] };
    assert.deepEqual(list.setups.map((s) => s.name), ["Longues notes"]); // il ne reste que ceux d'Alice
  });

  test("Steam exigé en production", async () => {
    const strict = await setup({ requireSteam: true });
    try {
      const tok = (await register(strict.app)).token;
      assert.equal((await post(strict as Ctx, "/setups", tok, setupBody())).status, 403);
      assert.equal((await post(strict as Ctx, "/notches", tok, { car_key: CAR, table: {} })).status, 403);
    } finally {
      await strict.close();
    }
  });
});
