/**
 * Reconstruction de l'altitude (Z) du circuit — porté de LMU Telemetry Lab
 * (`elevation_service.compute_z` + `track_db.find_track_in_registry`).
 *
 * Les fichiers `.duckdb` de LMU ne contiennent PAS de canal d'altitude. Le Lab
 * (et nous) reconstruit un profil d'élévation plausible à partir :
 *  - d'une base de **profils de référence par circuit/tracé** (distance→altitude,
 *    écrits à la main → `trackElevation.json`),
 *  - de la distance au tour (`Lap Dist`), interpolée + correction de boucle +
 *    lissage.
 */
import elevationData from "./trackElevation.json";

type RefLayouts = Record<string, [number, number][]>; // layout → [[dist, alt], ...]
interface TrackEntry {
  aliases: string[];
  layouts: RefLayouts;
}
const REGISTRY = elevationData as unknown as Record<string, TrackEntry>;

function normalize(s: string): string {
  let r = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  r = r.toLowerCase().trim().replace(/[-_]/g, " ");
  r = r.replace(
    /\b(circuit de la|circuit de|autodromo nazionale|international|grand prix|circuit|gp|autodromo)\b/g,
    ""
  );
  return r.split(/\s+/).filter(Boolean).join(" ");
}

/** Trouve l'entrée circuit par nom (exact normalisé, alias, puis inclusion). */
function findTrack(name: string): TrackEntry | null {
  if (!name) return null;
  const ns = normalize(name);
  for (const [key, data] of Object.entries(REGISTRY)) {
    if (normalize(key) === ns) return data;
  }
  for (const data of Object.values(REGISTRY)) {
    if (data.aliases.some((a) => normalize(a) === ns)) return data;
  }
  // Repli : inclusion dans un sens ou l'autre.
  for (const [key, data] of Object.entries(REGISTRY)) {
    const nk = normalize(key);
    if (nk && (nk.includes(ns) || ns.includes(nk))) return data;
    if (data.aliases.some((a) => { const na = normalize(a); return na && (na.includes(ns) || ns.includes(na)); }))
      return data;
  }
  return null;
}

/** Interpolation linéaire (xp croissant). */
function interp(x: number, xp: number[], fp: number[]): number {
  const n = xp.length;
  if (n === 0) return 0;
  if (x <= xp[0]) return fp[0];
  if (x >= xp[n - 1]) return fp[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xp[mid] <= x) lo = mid;
    else hi = mid;
  }
  const t = (x - xp[lo]) / (xp[hi] - xp[lo] || 1);
  return fp[lo] + (fp[hi] - fp[lo]) * t;
}

/**
 * Calcule l'altitude (m, base zéro) pour chaque échantillon, à partir de la
 * distance au tour `dist`, du circuit et du tracé. Renvoie un tableau de la
 * même longueur que `dist`, ou des zéros si le circuit est inconnu.
 */
export function computeElevation(
  dist: number[],
  trackName: string,
  trackLayout?: string
): number[] {
  const n = dist.length;
  const track = findTrack(trackName);
  if (!track || n === 0) return new Array(n).fill(0);

  const layoutKey =
    trackLayout && track.layouts[trackLayout] ? trackLayout : "Default";
  const ref = track.layouts[layoutKey] ?? track.layouts["Default"];
  if (!ref || ref.length < 2) return new Array(n).fill(0);

  // Distances uniques croissantes (évite les artefacts d'interpolation).
  const seen = new Set<number>();
  const cd: number[] = [];
  for (const d of dist) {
    if (!seen.has(d)) {
      seen.add(d);
      cd.push(d);
    }
  }
  cd.sort((a, b) => a - b);
  if (cd.length < 2) return new Array(n).fill(0);

  const d0 = cd[0];
  const telD = cd.map((d) => d - d0);
  const maxTel = Math.max(...telD);
  if (maxTel <= 1) return new Array(n).fill(0);

  const xp = ref.map((p) => p[0]);
  const fp = ref.map((p) => p[1]);
  const refMaxD = xp[xp.length - 1];

  // Altitude brute interpolée sur la distance normalisée.
  const zRaw = telD.map((td) => {
    const dn = Math.min(Math.max((td / maxTel) * refMaxD, 0), refMaxD);
    return interp(dn, xp, fp);
  });

  // Correction de boucle (alignement début/fin sur le profil de référence).
  const err = fp[fp.length - 1] - zRaw[zRaw.length - 1];
  const startAdj = fp[0] - zRaw[0];
  const m = zRaw.length;
  const zCorr = zRaw.map((z, i) => z + (startAdj + (err - startAdj) * (i / (m - 1))));

  // Remappe sur les distances d'origine.
  const zFull = dist.map((d) => interp(d, cd, zCorr));

  // Filtre médian (anti-impulsion) AVANT lissage : supprime les pics isolés
  // (vers le haut comme vers le bas), **extrémités incluses**. Corrige la flèche
  // /le relief qui montaient sur un pic au départ (ligne d'arrivée).
  const r = 3;
  const zMed = new Array<number>(zFull.length);
  for (let i = 0; i < zFull.length; i++) {
    const lo = Math.max(0, i - r);
    const hi = Math.min(zFull.length - 1, i + r);
    const w = zFull.slice(lo, hi + 1).sort((a, b) => a - b);
    zMed[i] = w[w.length >> 1];
  }

  // Lissage (moyenne glissante, fenêtre 40, bords répliqués).
  const window = Math.min(40, zMed.length);
  let z = zMed;
  if (window > 1) {
    const pad = window >> 1;
    const padded: number[] = [];
    for (let i = 0; i < pad; i++) padded.push(zMed[0]);
    for (const v of zMed) padded.push(v);
    for (let i = 0; i < pad; i++) padded.push(zMed[zMed.length - 1]);
    z = [];
    for (let i = 0; i < zMed.length; i++) {
      let s = 0;
      for (let j = 0; j < window; j++) s += padded[i + j];
      z.push(s / window);
    }
  }

  // Base zéro.
  const minZ = Math.min(...z);
  return z.map((v) => v - minZ);
}
