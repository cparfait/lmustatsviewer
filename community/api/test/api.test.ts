import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../src/app.js";
import { purgeDemo, seedDemo } from "../src/demo.js";
import type { Db } from "../src/db.js";
import { DEFAULT_INGEST } from "../src/ingest.js";
import { migrate } from "../src/migrations.js";
import { RateLimiter } from "../src/ratelimit.js";
import { digest, key, pgliteDb, populate, RA, register, send, session, setup } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof setup>>;
const count = async (db: Db, sql = "select count(*)::int as n from sessions") =>
  (await db.query<{ n: number }>(sql))[0].n;

describe("échanges sécurisés : réception complète, tout ou rien, idempotence", () => {
  let ctx: Ctx;
  before(async () => { ctx = await setup(); });
  after(() => ctx.close());

  test("sans jeton → 401, avec jeton → export", async () => {
    assert.equal((await ctx.app.request("/api/v1/me")).status, 401);
    const inst = await register(ctx.app);
    const res = await ctx.app.request("/api/v1/me", { headers: { authorization: `Bearer ${inst.token}` } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const me = await res.json();
    assert.equal(me.install_id, inst.install_id);
    assert.match(me.tag, /^#[0-9a-f]{4}$/);
  });

  test("empreinte absente → refusé, rien n'est enregistré", async () => {
    const inst = await register(ctx.app);
    const before = await count(ctx.db);
    const res = await send(ctx.app, inst.token, [session()], "");
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "integrity_mismatch");
    assert.equal(await count(ctx.db), before);
  });

  test("envoi tronqué (coupure) → refusé en entier, rien n'est enregistré", async () => {
    const inst = await register(ctx.app);
    const full = JSON.stringify({ sessions: [session(), session()] });
    const truncated = full.slice(0, Math.floor(full.length * 0.6));
    const before = await count(ctx.db);
    const res = await ctx.app.request("/api/v1/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${inst.token}`, "content-type": "application/json", "content-digest": digest(full) },
      body: truncated,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "integrity_mismatch");
    assert.equal(await count(ctx.db), before);
  });

  test("accusé de réception explicite + renvoi après coupure sans doublon", async () => {
    const inst = await register(ctx.app);
    const s = session();
    const r1 = await (await send(ctx.app, inst.token, [s])).json();
    assert.deepEqual(r1.received, [s.session_key]);
    assert.equal(r1.accepted, 1);
    // L'app n'a pas reçu l'accusé (coupure) : elle renvoie le même lot.
    const r2 = await (await send(ctx.app, inst.token, [s])).json();
    assert.deepEqual(r2.received, [s.session_key]);
    assert.equal(r2.accepted, 0);
    assert.equal(r2.duplicates, 1);
    const n = await ctx.db.query<{ n: number }>("select count(*)::int as n from sessions where session_key = $1", [s.session_key]);
    assert.equal(n[0].n, 1);
  });

  test("clé d'une autre installation → refusée, pas confirmée", async () => {
    const a = await register(ctx.app);
    const b = await register(ctx.app);
    const s = session();
    await send(ctx.app, a.token, [s]);
    const r = await (await send(ctx.app, b.token, [s])).json();
    assert.deepEqual(r.received, []);
    assert.equal(r.rejected[0].reason, "invalid");
  });
});

describe("tout ou rien : une erreur en cours d'écriture n'expose aucune session du lot", () => {
  test("échec de la 2ᵉ insertion → 500, lot entièrement annulé", async () => {
    const pg = new PGlite();
    const base = pgliteDb(pg);
    await migrate(base);
    let inserts = 0;
    const failing: Db = {
      query: base.query,
      transaction: (fn) =>
        base.transaction((tx) =>
          fn({
            ...tx,
            query: async (sql, params) => {
              if (sql.trimStart().startsWith("insert into sessions") && ++inserts === 2) throw new Error("coupure base");
              return tx.query(sql, params);
            },
          }),
        ),
    };
    const limiter = new RateLimiter();
    const app = createApp(failing, { log: () => {}, limiter, ingest: { ...DEFAULT_INGEST, today: () => "2026-09-26" } });
    const inst = await register(app);
    const res = await send(app, inst.token, [session(), session(), session()]);
    assert.equal(res.status, 500);
    assert.equal(await count(base), 0, "aucune session du lot ne doit être visible");
    limiter.stop();
    await pg.close();
  });
});

describe("validation des envois", () => {
  let ctx: Ctx;
  let token: string;
  before(async () => {
    ctx = await setup();
    token = (await register(ctx.app)).token;
  });
  after(() => ctx.close());

  test("secteurs incohérents, champ inconnu, date future → rejets détaillés ; le reste du lot passe", async () => {
    const ok = session();
    const badSectors = session({}, { s1: 10 });
    const extra = { ...session(), hacker: true };
    const future = session({ played_on: "2027-01-01" });
    const r = await (await send(ctx.app, token, [ok, badSectors, extra, future])).json();
    assert.deepEqual(r.received, [ok.session_key]);
    assert.deepEqual(r.rejected.map((x: { reason: string }) => x.reason), ["invalid", "invalid", "bad_date"]);
    assert.match(r.rejected[0].detail, /sectors_mismatch/);
  });

  test("lot vide ou trop gros → 400", async () => {
    assert.equal((await send(ctx.app, token, [])).status, 400);
    assert.equal((await send(ctx.app, token, Array.from({ length: 51 }, () => session()))).status, 400);
  });

  test("quota journalier", async () => {
    const c2 = await setup({ ingest: { ...DEFAULT_INGEST, dailyQuota: 2, today: () => "2026-09-26" } });
    const t = (await register(c2.app)).token;
    const r = await (await send(c2.app, t, [session(), session(), session()])).json();
    assert.equal(r.accepted, 2);
    assert.equal(r.rejected[0].reason, "daily_quota");
    await c2.close();
  });

  test("limite de débit à l'enregistrement → 429", async () => {
    const c3 = await setup({ limits: { register: { max: 2, windowMs: 60_000 }, writePerInstall: { max: 99, windowMs: 60_000 }, writePerIp: { max: 99, windowMs: 60_000 }, read: { max: 99, windowMs: 60_000 } } });
    await register(c3.app, "1.1.1.1");
    await register(c3.app, "1.1.1.1");
    const res = await c3.app.request("/api/v1/register", { method: "POST", headers: { "x-real-ip": "1.1.1.1" } });
    assert.equal(res.status, 429);
    assert.ok(res.headers.get("retry-after"));
    await c3.close();
  });
});

describe("noms : nom LMU du jeu, homonymes, anonymat", () => {
  let ctx: Ctx;
  before(async () => { ctx = await setup(); });
  after(() => ctx.close());

  test("le nom suit la session la plus récente ; un 2ᵉ « Cris Tof » est homonyme ; l'anonymat masque le nom", async () => {
    const a = await register(ctx.app);
    const b = await register(ctx.app);
    await send(ctx.app, a.token, [session({ driver_name: "Old Name", played_on: "2026-09-01" }, { time: 80 })]);
    await send(ctx.app, a.token, [session({ driver_name: "Cris Tof", played_on: "2026-09-20" }, { time: 80.5 })]);
    await send(ctx.app, b.token, [session({ driver_name: "cris  tof", played_on: "2026-09-21" }, { time: 81 })]);

    let lb = await (await ctx.app.request(`/api/v1/combos/leaderboard?${RA}`)).json();
    assert.equal(lb.rows[0].driver.name, "Cris Tof");
    assert.equal(lb.rows[0].driver.homonym, false);
    assert.equal(lb.rows[1].driver.name, "cris  tof");
    assert.equal(lb.rows[1].driver.homonym, true);

    const patch = await ctx.app.request("/api/v1/me", {
      method: "PATCH",
      headers: { authorization: `Bearer ${a.token}`, "content-type": "application/json" },
      body: JSON.stringify({ anonymous: true }),
    });
    assert.equal(patch.status, 200);
    lb = await (await ctx.app.request(`/api/v1/combos/leaderboard?${RA}`)).json();
    assert.equal(lb.rows[0].driver.name, null);
    assert.equal(lb.rows[0].driver.tag, a.tag);
  });

  test("PATCH n'accepte QUE l'anonymat (pas de changement de nom)", async () => {
    const a = await register(ctx.app);
    const res = await ctx.app.request("/api/v1/me", {
      method: "PATCH",
      headers: { authorization: `Bearer ${a.token}`, "content-type": "application/json" },
      body: JSON.stringify({ display_name: "Autre" }),
    });
    assert.equal(res.status, 400);
  });
});

describe("agrégats publics", () => {
  let ctx: Ctx;
  before(async () => {
    ctx = await setup();
    await populate(ctx.app, 25, 78, 0.25);
  });
  after(() => ctx.close());

  test("détail : pilotes, percentiles, histogramme, par voiture, versions", async () => {
    const res = await ctx.app.request(`/api/v1/combos/detail?${RA}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    const d = await res.json();
    assert.equal(d.drivers, 25);
    assert.equal(d.ranked, true);
    assert.equal(d.version, "1.42");
    assert.equal(d.best.time, 78);
    assert.equal(d.percentiles.p50, 81); // 78 + 12 × 0,25
    const binned = d.histogram.counts.reduce((a: number, b: number) => a + b, 0) + d.histogram.overflow;
    assert.equal(binned, 25);
    assert.equal(d.by_car[0].drivers, 25);
    assert.equal(d.valid_laps, 25 * 18);
  });

  test("classement et position d'un temps", async () => {
    const lb = await (await ctx.app.request(`/api/v1/combos/leaderboard?${RA}&limit=3&offset=1`)).json();
    assert.deepEqual(lb.rows.map((r: { rank: number }) => r.rank), [2, 3, 4]);
    assert.equal(lb.drivers, 25);
    const pos = await (await ctx.app.request(`/api/v1/combos/position?${RA}&time=80.1`)).json();
    assert.equal(pos.rank, 10); // 78 … 79,75 plus rapides (9 pilotes)
    assert.equal(pos.top_pct, 40);
  });

  test("liste des combos et chiffres globaux", async () => {
    const list = await (await ctx.app.request("/api/v1/combos")).json();
    assert.equal(list.combos.length, 1);
    assert.equal(list.combos[0].drivers, 25);
    assert.deepEqual(list.versions.map((v: { version: string }) => v.version), ["1.42"]);
    const all = await (await ctx.app.request("/api/v1/combos?version=all")).json();
    assert.equal(all.combos[0].drivers, 25);
    const none = await (await ctx.app.request("/api/v1/combos?version=1.30")).json();
    assert.equal(none.combos.length, 0);
    assert.equal((await ctx.app.request("/api/v1/combos?version=x")).status, 400);
    const stats = await (await ctx.app.request("/api/v1/stats")).json();
    assert.equal(stats.drivers, 25);
    assert.equal(stats.sessions, 25);
    assert.equal(stats.layouts, 1);
  });

  test("bornes anti-abus : trop rapide rejeté, trop lent conservé hors classement", async () => {
    const t = (await register(ctx.app)).token;
    const tooFast = await (await send(ctx.app, t, [session({}, { time: 70 })])).json();
    assert.equal(tooFast.rejected[0].reason, "too_fast");
    const slow = await (await send(ctx.app, t, [session({}, { time: 120 })])).json();
    assert.equal(slow.accepted, 1);
    const d = await (await ctx.app.request(`/api/v1/combos/detail?${RA}`)).json();
    assert.equal(d.drivers, 25, "le tour lent n'entre pas dans les percentiles");
  });

  test("pluie et aides exclues par défaut, visibles sur demande", async () => {
    const t = (await register(ctx.app)).token;
    await send(ctx.app, t, [session({ wet: true }, { time: 85 })]);
    const t2 = (await register(ctx.app)).token;
    await send(ctx.app, t2, [session({ aids: { raw: "BrakeHelp", tc: null, brake_help: true, steer_help: false, auto_shift: true } }, { time: 82 })]);
    assert.equal((await (await ctx.app.request(`/api/v1/combos/detail?${RA}`)).json()).drivers, 25);
    assert.equal((await (await ctx.app.request(`/api/v1/combos/detail?${RA}&aids=all`)).json()).drivers, 26);
    assert.equal((await (await ctx.app.request(`/api/v1/combos/detail?${RA}&conditions=wet`)).json()).drivers, 1);
  });

  test("version la plus récente par défaut, ancienne sur demande", async () => {
    const t = (await register(ctx.app)).token;
    await send(ctx.app, t, [session({ game_version: "1.4000" }, { time: 79.1 })]);
    const d = await (await ctx.app.request(`/api/v1/combos/detail?${RA}`)).json();
    assert.equal(d.version, "1.42");
    assert.deepEqual(d.versions.map((v: { version: string }) => v.version), ["1.42", "1.40"]);
    const old = await (await ctx.app.request(`/api/v1/combos/detail?${RA}&version=1.40`)).json();
    assert.equal(old.drivers, 1);
  });

  test("combo inconnu → 404 ; paramètres invalides → 400", async () => {
    assert.equal((await ctx.app.request("/api/v1/combos/detail?track=X&course=X&class=GT3")).status, 404);
    assert.equal((await ctx.app.request("/api/v1/combos/detail?track=X")).status, 400);
    assert.equal((await ctx.app.request(`/api/v1/combos/position?${RA}&time=abc`)).status, 400);
  });
});

describe("droits RGPD : effacement réel", () => {
  test("DELETE /me efface tout, le jeton devient invalide, le nom est libéré", async () => {
    const ctx = await setup();
    const a = await register(ctx.app);
    await send(ctx.app, a.token, [session(), session()]);
    const del = await ctx.app.request("/api/v1/me", { method: "DELETE", headers: { authorization: `Bearer ${a.token}` } });
    assert.equal(del.status, 204);
    assert.equal(await count(ctx.db), 0);
    assert.equal(await count(ctx.db, "select count(*)::int as n from name_claims"), 0);
    const me = await ctx.app.request("/api/v1/me", { headers: { authorization: `Bearer ${a.token}` } });
    assert.equal(me.status, 401);
    await ctx.close();
  });

  test("installation masquée par la modération : exclue des agrégats", async () => {
    const ctx = await setup();
    const [first] = await populate(ctx.app, 3);
    await ctx.db.query("update installs set hidden = true where id = $1", [first.install_id]);
    const d = await (await ctx.app.request(`/api/v1/combos/detail?${RA}`)).json();
    assert.equal(d.drivers, 2);
    await ctx.close();
  });
});

test("la clé de test est un sha256 hexadécimal", () => {
  assert.match(key(), /^[0-9a-f]{64}$/);
});

describe("site public servi par le même service", () => {
  test("pages, CSP stricte, visuels de l'app, sortie du dossier refusée", async () => {
    const { resolve } = await import("node:path");
    const ctx = await setup({ siteDir: resolve("../site"), publicDir: resolve("../../public") });
    const home = await ctx.app.request("/");
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-type") ?? "", /text\/html/);
    assert.match(home.headers.get("content-security-policy") ?? "", /script-src 'self'/);
    assert.equal(home.headers.get("cache-control"), "no-cache");
    assert.equal((await ctx.app.request("/combo.html")).status, 200);
    assert.equal((await ctx.app.request("/assets/site.js")).status, 200);
    assert.equal((await ctx.app.request("/data/cars.json")).status, 200);
    assert.equal((await ctx.app.request("/logos/ferrari.png")).status, 200);
    assert.equal((await ctx.app.request("/..%2f..%2fpackage.json")).status, 404);
    assert.equal((await ctx.app.request("/api/v1/inconnu")).status, 404);
    await ctx.close();
  });
});

describe("versions multiples et recherche de pilotes", () => {
  test("version=1.42,1.40 et version=all cumulent ; name= retrouve un pilote avec son vrai rang", async () => {
    const ctx = await setup();
    await populate(ctx.app, 5, 78, 0.5);
    const old = await register(ctx.app);
    await send(ctx.app, old.token, [session({ driver_name: "Ancien Pilote", game_version: "1.4000" }, { time: 77 })]);
    const latest = await (await ctx.app.request(`/api/v1/combos/detail?${RA}`)).json();
    assert.equal(latest.drivers, 5);
    const both = await (await ctx.app.request(`/api/v1/combos/detail?${RA}&version=1.42,1.40`)).json();
    assert.equal(both.drivers, 6);
    assert.deepEqual(both.selected, ["1.42", "1.40"]);
    const all = await (await ctx.app.request(`/api/v1/combos/detail?${RA}&version=all`)).json();
    assert.equal(all.drivers, 6);
    assert.equal((await ctx.app.request(`/api/v1/combos/detail?${RA}&version=1.42;drop`)).status, 400);
    const found = await (await ctx.app.request(`/api/v1/combos/leaderboard?${RA}&name=pilote%203`)).json();
    assert.equal(found.matches, 1);
    assert.equal(found.rows[0].rank, 4);
    // tag= : la ligne du pilote (« Ma position »), même hors de la page demandée.
    const tag = found.rows[0].driver.tag;
    const mine = await (await ctx.app.request(`/api/v1/combos/leaderboard?${RA}&limit=1&tag=${encodeURIComponent(tag)}`)).json();
    assert.equal(mine.rows.length, 1);
    assert.equal(mine.me.rank, 4);
    assert.equal(mine.me.driver.tag, tag);
    const nobody = await (await ctx.app.request(`/api/v1/combos/leaderboard?${RA}&tag=%230000`)).json();
    assert.equal(nobody.me, null);
    assert.equal((await ctx.app.request(`/api/v1/combos/leaderboard?${RA}&tag=abc`)).status, 400);
    await ctx.close();
  });

  test("recherche : nom partiel, anonymes introuvables ; fiche pilote avec rang par combo", async () => {
    const ctx = await setup();
    const [a, b] = await populate(ctx.app, 3);
    await ctx.app.request("/api/v1/me", {
      method: "PATCH",
      headers: { authorization: `Bearer ${b.token}`, "content-type": "application/json" },
      body: JSON.stringify({ anonymous: true }),
    });
    const res = await (await ctx.app.request("/api/v1/drivers?q=pilote")).json();
    assert.deepEqual(res.drivers.map((d: { name: string }) => d.name).sort(), ["Pilote 0", "Pilote 2"]);
    assert.equal((await ctx.app.request("/api/v1/drivers?q=x")).status, 400);
    const prof = await (await ctx.app.request(`/api/v1/drivers/profile?tag=${encodeURIComponent(a.tag)}`)).json();
    assert.equal(prof.name, "Pilote 0");
    assert.equal(prof.combos[0].rank, 1);
    assert.equal(prof.combos[0].drivers, 3);
    assert.equal((await ctx.app.request(`/api/v1/drivers/profile?tag=${encodeURIComponent(b.tag)}`)).status, 404);
    await ctx.close();
  });
});

describe("filtres voiture, session, mode", () => {
  test("car=, session=, mode= restreignent les agrégats", async () => {
    const ctx = await setup();
    await populate(ctx.app, 4, 78, 0.5);
    const b = await register(ctx.app);
    await send(ctx.app, b.token, [session({ driver_name: "Solo", car_model: "BMW M4 LMGT3", session_type: "Qualify", setting: "Race Weekend" }, { time: 79.9 })]);
    const d = async (qs: string) => (await (await ctx.app.request(`/api/v1/combos/detail?${RA}${qs}`)).json()).drivers;
    assert.equal(await d(""), 5);
    assert.equal(await d("&car=BMW%20M4%20LMGT3"), 1);
    assert.equal(await d("&session=qualify"), 1);
    assert.equal(await d("&session=race"), 4);
    assert.equal(await d("&mode=online"), 4);
    assert.equal(await d("&mode=offline"), 1);
    assert.equal((await ctx.app.request(`/api/v1/combos/detail?${RA}&mode=lan`)).status, 400);
    await ctx.close();
  });
});

describe("bandeau de maintenance", () => {
  test("/status : null sans fichier, message pendant une mise à jour, jamais en cache", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lmu-state-"));
    const ctx = await setup({ stateDir: dir });
    let res = await ctx.app.request("/api/v1/status");
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), { maintenance: null });
    writeFileSync(join(dir, "maintenance.json"), JSON.stringify({ since: "2026-09-26T21:00:00Z" }));
    res = await ctx.app.request("/api/v1/status");
    assert.deepEqual(await res.json(), { maintenance: { since: "2026-09-26T21:00:00Z", message: null } });
    writeFileSync(join(dir, "maintenance.json"), "pas du json");
    assert.deepEqual(await (await ctx.app.request("/api/v1/status")).json(), { maintenance: null });
    await ctx.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("données de démonstration", () => {
  test("seed-demo peuple, purge-demo n'efface QUE la démonstration", async () => {
    const ctx = await setup();
    const real = await register(ctx.app);
    await send(ctx.app, real.token, [session({ driver_name: "Vrai Pilote" })]);
    const seeded = await seedDemo(ctx.db, 25);
    assert.ok(seeded.drivers >= 20 && seeded.sessions > 200, JSON.stringify(seeded));
    const dry = await purgeDemo(ctx.db, false);
    assert.equal(dry.deleted, false);
    assert.equal(dry.installs, seeded.drivers);
    assert.equal(await count(ctx.db), seeded.sessions + 1); // rien n'a été effacé
    const done = await purgeDemo(ctx.db, true);
    assert.equal(done.deleted, true);
    assert.equal(await count(ctx.db), 1); // la vraie session reste
    assert.equal(await count(ctx.db, "select count(*)::int as n from installs"), 1);
    await ctx.close();
  });
});
