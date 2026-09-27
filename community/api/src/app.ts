/**
 * API v1 du service communautaire (COMMUNITY-SPEC.md §6).
 *
 * Sécurité des échanges :
 *  - HTTPS assuré par le reverse proxy (NPM) ; ce service n'est jamais exposé directement.
 *  - Écritures authentifiées par jeton (seul son hash SHA-256 est stocké).
 *  - Envois : empreinte `Content-Digest` (RFC 9530) OBLIGATOIRE et vérifiée sur le corps
 *    brut → un envoi coupé ou tronqué est refusé en entier, rien n'est enregistré.
 *  - Lot enregistré dans UNE transaction : rien n'est visible tant que tout n'est pas écrit.
 *  - Accusé de réception explicite (`received`) : l'app ne marque « envoyé » que ces sessions.
 *  - Renvois idempotents (`session_key`) : une coupure après enregistrement ne crée pas de doublon.
 *  - Aucune IP ni jeton dans la base ou les journaux.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "@hono/node-server/serve-static";
import { z } from "zod";
import { SessionBatchSchema } from "../../shared/src/session.js";
import type { Db } from "./db.js";
import {
  DEFAULT_INGEST,
  deleteInstall,
  exportInstall,
  findInstallByToken,
  ingestSessions,
  registerInstall,
  type IngestOptions,
  type Install,
} from "./ingest.js";
import { RateLimiter, type Limit } from "./ratelimit.js";
import { finishSteam, pollSteam, startSteam, steamReturnPage, verifyWithSteam, type SteamVerifier } from "./steam.js";
import {
  comboDetail,
  comboList,
  listVersions,
  DEFAULT_FILTERS,
  driverProfile,
  searchDrivers,
  globalStats,
  leaderboard,
  position,
  type ComboKey,
  type Filters,
} from "./stats.js";

export interface Limits {
  register: Limit;
  writePerInstall: Limit;
  writePerIp: Limit;
  read: Limit;
}

export const DEFAULT_LIMITS: Limits = {
  register: { max: 10, windowMs: 3_600_000 },
  writePerInstall: { max: 60, windowMs: 3_600_000 },
  writePerIp: { max: 240, windowMs: 3_600_000 },
  read: { max: 300, windowMs: 60_000 },
};

export interface AppOptions {
  ingest?: IngestOptions;
  limits?: Limits;
  limiter?: RateLimiter;
  /** Dossier du site public (`community/site`). Absent = API seule. */
  siteDir?: string;
  /** Dossier `public/` de l'app (visuels des voitures, drapeaux, données circuits/voitures). */
  publicDir?: string;
  /**
   * Dossier d'état monté en lecture seule (`./state` sur le VPS). S'il contient
   * `maintenance.json`, le site affiche le bandeau « mise à jour en cours ».
   */
  stateDir?: string;
  /** Adresse publique du site (retour de Steam). Défaut : https://lmu.cparfait.ovh. */
  publicUrl?: string;
  /** Vérification des connexions Steam (remplacée dans les tests). */
  steamVerify?: SteamVerifier;
  /** Journal d'une ligne par requête (JSON). Par défaut : stdout. */
  log?: (line: Record<string, unknown>) => void;
}

type Env = { Variables: { install: Install } };

/** IP du client, fournie par le reverse proxy (jamais stockée, sert au limiteur). */
function clientIp(c: Context): string {
  return (
    c.req.header("x-real-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "direct"
  );
}

const comboQuery = z.object({
  track: z.string().min(1).max(120),
  course: z.string().min(1).max(120),
  // Absent ou « all » = toutes les classes (classement général du circuit).
  class: z.string().min(1).max(32).optional(),
  // Une version (« 1.42 »), une liste (« 1.42,1.41 ») ou « all ».
  version: z
    .string()
    .regex(/^(all|latest|\d{1,2}\.\d{2}(,\d{1,2}\.\d{2}){0,19})$/)
    .optional(),
  aids: z.enum(["clean", "all"]).optional(),
  conditions: z.enum(["dry", "wet"]).optional(),
  car: z.string().min(1).max(120).optional(),
  session: z.enum(["race", "qualify", "practice"]).optional(),
  mode: z.enum(["online", "offline"]).optional(),
});

function parseCombo(c: Context): { key: ComboKey; f: Filters } | null {
  const q = comboQuery.safeParse(c.req.query());
  if (!q.success) return null;
  return {
    key: {
      track: q.data.track,
      course: q.data.course,
      carClass: q.data.class && q.data.class !== "all" ? q.data.class : undefined,
      version: q.data.version === "all" || q.data.version === "latest" ? q.data.version : q.data.version?.split(","),
    },
    f: {
      aids: q.data.aids ?? DEFAULT_FILTERS.aids,
      conditions: q.data.conditions ?? DEFAULT_FILTERS.conditions,
      car: q.data.car,
      session: q.data.session,
      mode: q.data.mode,
    },
  };
}

/** Vérifie `Content-Digest: sha-256=:<base64>:` contre le corps brut reçu. */
export function digestMatches(header: string | undefined, body: Uint8Array): boolean {
  const m = header && /sha-256=:([A-Za-z0-9+/]+={0,2}):/.exec(header);
  if (!m) return false;
  const actual = createHash("sha256").update(body).digest("base64");
  return actual === m[1];
}

export function createApp(db: Db, opts: AppOptions = {}) {
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const limiter = opts.limiter ?? new RateLimiter();
  const ingestOpts = opts.ingest ?? DEFAULT_INGEST;
  const log = opts.log ?? ((line) => console.log(JSON.stringify(line)));

  const app = new Hono<Env>();

  app.use(
    "*",
    secureHeaders({
      // Site : uniquement nos propres scripts (aucun script en ligne ni tiers).
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    }),
  );
  app.use("*", async (c, next) => {
    const t0 = performance.now();
    await next();
    log({ t: new Date().toISOString(), m: c.req.method, p: c.req.path, s: c.res.status, ms: Math.round(performance.now() - t0) });
  });

  const limit = (bucket: keyof Limits, keyOf: (c: Context<Env>) => string): MiddlewareHandler<Env> =>
    async (c, next) => {
      const retry = limiter.hit(`${bucket}:${keyOf(c)}`, limits[bucket]);
      if (retry != null) {
        c.header("Retry-After", String(retry));
        return c.json({ error: "rate_limited" }, 429);
      }
      await next();
    };

  const auth: MiddlewareHandler<Env> = async (c, next) => {
    const m = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(c.req.header("authorization") ?? "");
    const install = m ? await findInstallByToken(db, m[1]) : null;
    if (!install) return c.json({ error: "unauthorized" }, 401);
    c.set("install", install);
    c.header("Cache-Control", "no-store");
    await next();
  };

  const publicRead: MiddlewareHandler<Env> = async (c, next) => {
    const retry = limiter.hit(`read:${clientIp(c)}`, limits.read);
    if (retry != null) {
      c.header("Retry-After", String(retry));
      return c.json({ error: "rate_limited" }, 429);
    }
    await next();
    c.header("Access-Control-Allow-Origin", "*");
    // Jamais de réponse périmée : après « Supprimer mes données », le classement doit
    // changer tout de suite (promesse faite au joueur). Le limiteur protège la charge.
    if (c.res.status === 200) c.header("Cache-Control", "no-cache");
  };

  const v1 = new Hono<Env>();

  v1.get("/health", async (c) => {
    await db.query("select 1");
    return c.json({ ok: true });
  });

  // Maintenance : `maintenance.json` posé par scripts/update.sh le temps d'une mise à
  // jour. Aucun accès base (répond même si Postgres est indisponible), jamais en cache.
  v1.get("/status", async (c) => {
    c.header("Cache-Control", "no-store");
    c.header("Access-Control-Allow-Origin", "*");
    if (!opts.stateDir) return c.json({ maintenance: null });
    try {
      const raw = JSON.parse(await readFile(join(opts.stateDir, "maintenance.json"), "utf8")) as Record<string, unknown>;
      const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
      return c.json({ maintenance: { since: text(raw.since, 40), message: text(raw.message, 280) } });
    } catch {
      return c.json({ maintenance: null });
    }
  });

  // ── Écritures (authentifiées) ─────────────────────────────────────────────

  v1.post("/register", limit("register", clientIp), async (c) => {
    const created = await registerInstall(db);
    c.header("Cache-Control", "no-store");
    return c.json(created, 201);
  });

  v1.post(
    "/sessions",
    bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: "payload_too_large" }, 413) }),
    auth,
    limit("writePerInstall", (c) => c.get("install").id),
    limit("writePerIp", clientIp),
    async (c) => {
      const raw = new Uint8Array(await c.req.arrayBuffer());
      // Réception complète : l'empreinte doit correspondre au corps effectivement reçu.
      if (!digestMatches(c.req.header("content-digest"), raw)) {
        return c.json({ error: "integrity_mismatch" }, 400);
      }
      let body: unknown;
      try {
        body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
      } catch {
        return c.json({ error: "bad_json" }, 400);
      }
      const batch = SessionBatchSchema.safeParse(body);
      if (!batch.success) return c.json({ error: "bad_batch" }, 400);
      const result = await ingestSessions(db, c.get("install"), batch.data.sessions, ingestOpts);
      return c.json(result, 200);
    },
  );

  v1.get("/me", auth, limit("writePerInstall", (c) => c.get("install").id), async (c) =>
    c.json(await exportInstall(db, c.get("install"))),
  );

  v1.patch(
    "/me",
    bodyLimit({ maxSize: 4 * 1024 }),
    auth,
    limit("writePerInstall", (c) => c.get("install").id),
    async (c) => {
      const body = z.object({ anonymous: z.boolean() }).strict().safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ error: "bad_request" }, 400);
      await db.query("update installs set anonymous = $2 where id = $1", [c.get("install").id, body.data.anonymous]);
      return c.json({ anonymous: body.data.anonymous });
    },
  );

  v1.delete("/me", auth, async (c) => {
    await deleteInstall(db, c.get("install").id);
    return c.body(null, 204);
  });

  // ── Se connecter avec Steam (lier / retrouver son installation) ─────────────
  const publicUrl = (opts.publicUrl ?? "https://lmu.cparfait.ovh").replace(/\/$/, "");
  const steamVerify = opts.steamVerify ?? verifyWithSteam;

  v1.post("/steam/start", bodyLimit({ maxSize: 1024 }), limit("register", clientIp), async (c) => {
    c.header("Cache-Control", "no-store");
    const body = z.object({ mode: z.enum(["link", "recover"]) }).strict().safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad_request" }, 400);
    let installId: string | null = null;
    if (body.data.mode === "link") {
      // Lier : seul le détenteur du jeton peut rattacher son installation à Steam.
      const m = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(c.req.header("authorization") ?? "");
      const install = m ? await findInstallByToken(db, m[1]) : null;
      if (!install) return c.json({ error: "unauthorized" }, 401);
      installId = install.id;
    }
    return c.json(await startSteam(db, body.data.mode, installId, publicUrl));
  });

  v1.get("/steam/return", async (c) => {
    c.header("Cache-Control", "no-store");
    const outcome = await finishSteam(db, c.req.query(), publicUrl, steamVerify);
    return c.html(steamReturnPage(outcome), outcome === "ok" ? 200 : 400);
  });

  v1.get("/steam/poll", publicRead, async (c) => {
    const id = z.string().min(20).max(64).safeParse(c.req.query("id"));
    if (!id.success) return c.json({ error: "bad_request" }, 400);
    const r = await pollSteam(db, id.data);
    c.header("Cache-Control", "no-store");
    return c.json(r);
  });

  v1.delete("/steam/link", auth, async (c) => {
    await db.query("update installs set steam_hash = null where id = $1", [c.get("install").id]);
    return c.body(null, 204);
  });

  // ── Lectures publiques (agrégats uniquement) ─────────────────────────────

  v1.get("/stats", publicRead, async (c) => c.json(await globalStats(db)));

  v1.get("/combos", publicRead, async (c) => {
    const q = z
      .object({
        aids: z.enum(["clean", "all"]).optional(),
        conditions: z.enum(["dry", "wet"]).optional(),
        car: z.string().min(1).max(120).optional(),
        session: z.enum(["race", "qualify", "practice"]).optional(),
        mode: z.enum(["online", "offline"]).optional(),
        version: comboQuery.shape.version,
      })
      .safeParse(c.req.query());
    if (!q.success) return c.json({ error: "bad_request" }, 400);
    const { aids, conditions, version, ...rest } = q.data;
    const f = { aids: aids ?? "clean", conditions: conditions ?? "dry", ...rest } as const;
    const [combos, versions] = await Promise.all([
      comboList(db, f, version === "all" || version === "latest" ? version : version?.split(",")),
      listVersions(db, f),
    ]);
    return c.json({ combos, versions });
  });

  v1.get("/combos/detail", publicRead, async (c) => {
    const p = parseCombo(c);
    if (!p) return c.json({ error: "bad_request" }, 400);
    const d = await comboDetail(db, p.key, p.f);
    return d ? c.json(d) : c.json({ error: "not_found" }, 404);
  });

  v1.get("/combos/leaderboard", publicRead, async (c) => {
    const p = parseCombo(c);
    const page = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).max(100_000).default(0),
        name: z.string().trim().min(2).max(64).optional(),
        tag: z.string().regex(/^#[0-9a-f]{4}$/).optional(),
      })
      .safeParse({
        limit: c.req.query("limit"),
        offset: c.req.query("offset"),
        name: c.req.query("name") || undefined,
        tag: c.req.query("tag") || undefined,
      });
    if (!p || !page.success) return c.json({ error: "bad_request" }, 400);
    const lb = await leaderboard(db, p.key, p.f, page.data.limit, page.data.offset, page.data.name, page.data.tag);
    return lb ? c.json(lb) : c.json({ error: "not_found" }, 404);
  });

  v1.get("/combos/position", publicRead, async (c) => {
    const p = parseCombo(c);
    const t = z.coerce.number().gt(20).lt(1200).safeParse(c.req.query("time"));
    if (!p || !t.success) return c.json({ error: "bad_request" }, 400);
    const pos = await position(db, p.key, p.f, t.data);
    return pos ? c.json(pos) : c.json({ error: "not_found" }, 404);
  });

  v1.get("/drivers", publicRead, async (c) => {
    const q = z.string().trim().min(2).max(64).safeParse(c.req.query("q"));
    if (!q.success) return c.json({ error: "bad_request" }, 400);
    return c.json({ drivers: await searchDrivers(db, q.data) });
  });

  v1.get("/drivers/profile", publicRead, async (c) => {
    const tag = z.string().regex(/^#[0-9a-f]{4}$/).safeParse(c.req.query("tag"));
    if (!tag.success) return c.json({ error: "bad_request" }, 400);
    const p = await driverProfile(db, tag.data);
    return p ? c.json(p) : c.json({ error: "not_found" }, 404);
  });

  app.route("/api/v1", v1);

  // Site public (lot 3) : fichiers statiques servis par le même service.
  if (opts.siteDir) {
    const cache: MiddlewareHandler<Env> = async (c, next) => {
      await next();
      if (c.res.status === 200) c.header("Cache-Control", "public, max-age=3600");
    };
    if (opts.publicDir) {
      for (const p of ["/logos/*", "/flags/*", "/data/*"]) app.use(p, cache, serveStatic({ root: opts.publicDir }));
    }
    app.use("/assets/*", cache);
    // Pages HTML : toujours revalidées (une mise à jour du site est visible tout de suite).
    app.use("/*", async (c, next) => {
      await next();
      if ((c.res.headers.get("content-type") ?? "").startsWith("text/html")) c.header("Cache-Control", "no-cache");
    });
    app.use("/*", serveStatic({ root: opts.siteDir }));
  }

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    log({ t: new Date().toISOString(), m: c.req.method, p: c.req.path, error: err.message });
    return c.json({ error: "internal" }, 500);
  });

  return app;
}
