/**
 * Vues dérivées : paliers calculés sur la base, index des voitures, effet d'un patch,
 * briefing des adversaires (anonymat respecté), rival de la semaine.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { weekStart } from "../src/insights.js";
import { populate, register, send, session, setup, RA } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof setup>>;

const patchMe = (ctx: Ctx, token: string, body: unknown) =>
  ctx.app.request("/api/v1/me", {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-real-ip": "10.0.0.1" },
    body: JSON.stringify(body),
  });

describe("paliers calculés sur la base", () => {
  let ctx: Ctx;
  before(async () => {
    ctx = await setup();
    await populate(ctx.app, 6, 78, 0.25);
  });
  after(() => ctx.close());

  test("référence = moyenne des 5 meilleurs pilotes, version la plus récente", async () => {
    const res = await ctx.app.request("/api/v1/tiers");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { top_n: number; references: { car_class: string; version: string; reference: number; drivers: number; provisional: boolean }[] };
    assert.equal(body.top_n, 5);
    const ra = body.references.find((r) => r.car_class === "GT3");
    assert.ok(ra);
    assert.equal(ra.version, "1.42");
    assert.equal(ra.reference, 78.5);
    assert.equal(ra.drivers, 6);
    assert.equal(ra.provisional, false);
  });

  test("filtres invalides → 400", async () => {
    assert.equal((await ctx.app.request("/api/v1/tiers?aids=nope")).status, 400);
  });
});

describe("index des voitures", () => {
  let ctx: Ctx;
  before(async () => {
    ctx = await setup();
    await populate(ctx.app, 3, 78, 0.25, { car_model: "Voiture A" });
    await populate(ctx.app, 3, 79, 0.25, { car_model: "Voiture B" });
  });
  after(() => ctx.close());

  test("100 % = voiture la plus rapide ; moyenne des 3 meilleurs pilotes par voiture", async () => {
    const res = await ctx.app.request("/api/v1/cars?class=GT3");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { layouts: unknown[]; cars: { car_model: string; avg_pct: number; worst_pct: number; tracks: number; cells: ({ pct: number; drivers: number } | null)[] }[] };
    assert.equal(body.layouts.length, 1);
    assert.deepEqual(body.cars.map((c) => c.car_model), ["Voiture A", "Voiture B"]);
    assert.equal(body.cars[0].avg_pct, 100);
    assert.equal(body.cars[1].avg_pct, 101.28);
    assert.equal(body.cars[1].cells[0]?.drivers, 3);
  });

  test("classe absente → 400", async () => {
    assert.equal((await ctx.app.request("/api/v1/cars")).status, 400);
  });
});

describe("effet d'un patch", () => {
  let ctx: Ctx;
  before(async () => {
    ctx = await setup();
    const installs = await populate(ctx.app, 3, 78, 0.25);
    // Les mêmes pilotes, 0,5 s plus vite après la mise à jour.
    for (const [i, inst] of installs.entries()) {
      const res = await send(ctx.app, inst.token, [session({ driver_name: `Pilote ${i}`, game_version: "1.4300" }, { time: 77.5 + i * 0.25 })]);
      assert.equal(res.status, 200);
    }
    // Un pilote qui n'a roulé que sur la nouvelle version ne compte pas.
    await populate(ctx.app, 1, 76, 0.25, { game_version: "1.4300" });
  });
  after(() => ctx.close());

  test("écart médian par pilote entre les deux versions les plus récentes", async () => {
    const res = await ctx.app.request("/api/v1/patch");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { from: string; to: string; pairs: number; drivers: number; median_delta: number; combos: { drivers: number; median_delta: number }[] };
    assert.equal(body.from, "1.42");
    assert.equal(body.to, "1.43");
    assert.equal(body.pairs, 3);
    assert.equal(body.drivers, 3);
    assert.equal(body.median_delta, -0.5);
    assert.equal(body.combos[0].drivers, 3);
  });
});

describe("briefing des adversaires", () => {
  let ctx: Ctx;
  before(async () => {
    ctx = await setup();
    const installs = await populate(ctx.app, 6, 78, 0.25);
    // « Pilote 1 » partage anonymement : il ne doit jamais être retrouvé par son nom.
    assert.equal((await patchMe(ctx, installs[1].token, { anonymous: true })).status, 200);
  });
  after(() => ctx.close());

  const brief = (body: unknown) =>
    ctx.app.request("/api/v1/briefing", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "10.0.0.2" }, body: JSON.stringify(body) });

  test("pilotes partagés sous leur nom seulement ; inconnus et anonymes absents", async () => {
    const q = new URLSearchParams(RA);
    const res = await brief({ track: q.get("track"), course: q.get("course"), class: "GT3", names: ["Pilote 0", "PILOTE 2", "Pilote 1", "Inconnu"] });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { reference: number; found: { query: string; best: number; rank: number; pct: number; driver: { name: string } }[] };
    assert.equal(body.reference, 78.5);
    assert.deepEqual(body.found.map((f) => f.query), ["Pilote 0", "PILOTE 2"]);
    assert.equal(body.found[0].rank, 1);
    assert.equal(body.found[1].best, 78.5);
    assert.equal(body.found[1].pct, 100);
    assert.ok(!JSON.stringify(body).includes("Pilote 1"));
  });

  test("corps invalide ou trop de noms → 400", async () => {
    assert.equal((await brief({ track: "x", course: "y", names: [] })).status, 400);
    assert.equal((await brief({ track: "x", course: "y", names: Array(65).fill("a") })).status, 400);
  });
});

describe("rival de la semaine", () => {
  let ctx: Ctx;
  let installs: Awaited<ReturnType<typeof populate>>;
  before(async () => {
    ctx = await setup();
    installs = await populate(ctx.app, 3, 78, 0.25);
  });
  after(() => ctx.close());

  const rival = (token: string) =>
    ctx.app.request("/api/v1/rival", { headers: { authorization: `Bearer ${token}`, "x-real-ip": "10.0.0.1" } });

  test("semaine = lundi UTC", () => {
    assert.equal(weekStart("2026-09-26"), "2026-09-21");
    assert.equal(weekStart("2026-09-21"), "2026-09-21");
  });

  test("non inscrit : pas de rival ; sans jeton → 401", async () => {
    assert.equal((await ctx.app.request("/api/v1/rival")).status, 401);
    const body = (await (await rival(installs[0].token)).json()) as { opted_in: boolean; rival: unknown };
    assert.equal(body.opted_in, false);
    assert.equal(body.rival, null);
  });

  test("deux inscrits de rythme proche → duel sur les combos roulés cette semaine", async () => {
    for (const i of [0, 1]) {
      const res = await patchMe(ctx, installs[i].token, { rival: true });
      assert.equal(res.status, 200);
      assert.equal(((await res.json()) as { rival: boolean }).rival, true);
    }
    const me = (await (await rival(installs[0].token)).json()) as {
      opted_in: boolean;
      week: string;
      rival: { tag: string };
      current: { wins: number; losses: number; points: number; combos: unknown[] };
    };
    assert.equal(me.opted_in, true);
    assert.equal(me.week, "2026-09-21");
    assert.equal(me.rival.tag, installs[1].tag);
    assert.equal(me.current.combos.length, 1);
    assert.equal(me.current.wins, 1);
    assert.equal(me.current.points, 3);
    const them = (await (await rival(installs[1].token)).json()) as { rival: { tag: string }; current: { losses: number } };
    assert.equal(them.rival.tag, installs[0].tag);
    assert.equal(them.current.losses, 1);
  });

  test("inscrit en cours de semaine sans partenaire libre → en attente", async () => {
    await patchMe(ctx, installs[2].token, { rival: true });
    const body = (await (await rival(installs[2].token)).json()) as { opted_in: boolean; rival: unknown };
    assert.equal(body.opted_in, true);
    assert.equal(body.rival, null);
  });

  test("l'export RGPD contient l'inscription", async () => {
    const res = await ctx.app.request("/api/v1/me", { headers: { authorization: `Bearer ${installs[0].token}`, "x-real-ip": "10.0.0.1" } });
    const body = (await res.json()) as { rival_opt_in: boolean; rival_weeks: unknown[] };
    assert.equal(body.rival_opt_in, true);
    assert.equal(body.rival_weeks.length, 1);
  });

  test("register seul ne crée pas de duel", async () => {
    const lone = await register(ctx.app, "10.9.9.9");
    const body = (await (await rival(lone.token)).json()) as { opted_in: boolean };
    assert.equal(body.opted_in, false);
  });
});
