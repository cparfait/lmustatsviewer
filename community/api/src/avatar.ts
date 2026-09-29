/**
 * Avatar Steam des pilotes qui l'ont demandé (mode « avatar » de la connexion Steam).
 *
 * Seule l'empreinte de l'image (40 caractères hexadécimaux, celle des adresses
 * `avatars.steamstatic.com`) est stockée. Le site ne charge jamais l'image chez Steam :
 * elle passe par `/api/v1/avatar/<empreinte>` (aucune requête des visiteurs vers un
 * tiers, CSP inchangée).
 *
 * Source : API Web Steam si `STEAM_API_KEY` est fourni (officiel, 100 comptes par
 * appel), sinon le profil public au format XML (sans clé, un compte par appel).
 */
import type { Db } from "./db.js";

/** SteamID64 → empreinte de l'avatar (null : pas d'avatar personnalisé ou profil introuvable). */
export type AvatarFetcher = (steamIds: string[]) => Promise<Map<string, string | null>>;

const HASH = /^[0-9a-f]{40}$/;
/** Avatar par défaut de Steam (point d'interrogation) : inutile de l'afficher. */
const DEFAULT_AVATAR = "fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb";
const clean = (h: string | undefined | null) => (h && HASH.test(h) && h !== DEFAULT_AVATAR ? h : null);

export function steamAvatarFetcher(apiKey = process.env.STEAM_API_KEY): AvatarFetcher {
  return async (ids) => {
    const out = new Map<string, string | null>();
    if (apiKey) {
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${chunk.join(",")}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`steam api: HTTP ${res.status}`);
        const body = (await res.json()) as { response?: { players?: { steamid: string; avatarhash?: string }[] } };
        for (const id of chunk) out.set(id, null);
        for (const p of body.response?.players ?? []) out.set(p.steamid, clean(p.avatarhash));
      }
      return out;
    }
    for (const id of ids) {
      const res = await fetch(`https://steamcommunity.com/profiles/${id}/?xml=1`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`steam profile: HTTP ${res.status}`);
      const m = /avatars\.[a-z.]+\/([0-9a-f]{40})_medium/.exec(await res.text());
      out.set(id, clean(m?.[1]));
    }
    return out;
  };
}

/**
 * Met à jour l'avatar des installations données (ou, sans liste, de celles vérifiées il y
 * a plus d'un jour, 100 au plus). Une erreur de Steam laisse l'avatar connu en place.
 */
export async function refreshAvatars(db: Db, fetcher: AvatarFetcher, installIds?: string[]): Promise<number> {
  const rows = installIds
    ? await db.query<{ id: string; steam_id: string }>(
        "select id, steam_id from installs where id = any($1::uuid[]) and steam_id is not null",
        [installIds],
      )
    : await db.query<{ id: string; steam_id: string }>(
        `select id, steam_id from installs where steam_id is not null
           and (avatar_checked_at is null or avatar_checked_at < now() - interval '1 day')
         order by avatar_checked_at nulls first limit 100`,
      );
  if (!rows.length) return 0;
  const found = await fetcher(rows.map((r) => r.steam_id));
  for (const r of rows) {
    if (!found.has(r.steam_id)) continue;
    await db.query("update installs set avatar = $2, avatar_checked_at = now() where id = $1", [r.id, found.get(r.steam_id)]);
  }
  return rows.length;
}

/** Image en mémoire (quelques Ko par pilote). */
const images = new Map<string, { body: Uint8Array; type: string }>();
const MAX_IMAGES = 1000;

/** Image 64 px d'un avatar connu de la base (jamais un relais ouvert vers Steam). */
export async function avatarImage(db: Db, hash: string): Promise<{ body: Uint8Array; type: string } | null> {
  if (!HASH.test(hash)) return null;
  const known = await db.query("select 1 from installs where avatar = $1 and not anonymous and not hidden limit 1", [hash]);
  if (!known.length) return null;
  const hit = images.get(hash);
  if (hit) return hit;
  const res = await fetch(`https://avatars.steamstatic.com/${hash}_medium.jpg`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  const img = { body: new Uint8Array(await res.arrayBuffer()), type: type.startsWith("image/") ? type : "image/jpeg" };
  if (images.size >= MAX_IMAGES) images.delete(images.keys().next().value as string);
  images.set(hash, img);
  return img;
}
