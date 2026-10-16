/**
 * Lever / coucher du soleil sur les circuits du jeu (module pur).
 *
 * Calcul astronomique classique (déclinaison + équation du temps, soleil à
 * −0,833° sous l'horizon), précis à quelques minutes : assez pour placer la nuit
 * sur une feuille de relais. Heure locale = UTC + fuseau du circuit, heure d'été
 * comprise (règles UE / États-Unis ; Brésil, Japon, Golfe : pas d'heure d'été).
 */

type DstRule = "eu" | "us" | "none";

interface TrackGeo {
  /** Sous-chaînes (minuscules) reconnues dans le nom du circuit. */
  match: string[];
  lat: number;
  lon: number;
  /** Décalage UTC hors heure d'été (h). */
  tz: number;
  dst: DstRule;
}

const TRACKS: TrackGeo[] = [
  { match: ["sarthe", "le mans"], lat: 47.95, lon: 0.21, tz: 1, dst: "eu" },
  { match: ["spa"], lat: 50.44, lon: 5.97, tz: 1, dst: "eu" },
  { match: ["monza"], lat: 45.62, lon: 9.28, tz: 1, dst: "eu" },
  { match: ["imola", "enzo e dino"], lat: 44.34, lon: 11.71, tz: 1, dst: "eu" },
  { match: ["portimao", "algarve"], lat: 37.23, lon: -8.63, tz: 0, dst: "eu" },
  { match: ["silverstone"], lat: 52.07, lon: -1.02, tz: 0, dst: "eu" },
  { match: ["paul ricard", "castellet"], lat: 43.25, lon: 5.79, tz: 1, dst: "eu" },
  { match: ["fuji"], lat: 35.37, lon: 138.93, tz: 9, dst: "none" },
  { match: ["bahrain", "sakhir"], lat: 26.03, lon: 50.51, tz: 3, dst: "none" },
  { match: ["lusail", "qatar", "losail"], lat: 25.49, lon: 51.45, tz: 3, dst: "none" },
  { match: ["interlagos", "sao paulo", "carlos pace"], lat: -23.7, lon: -46.7, tz: -3, dst: "none" },
  { match: ["sebring"], lat: 27.45, lon: -81.35, tz: -5, dst: "us" },
  { match: ["americas", "cota", "austin"], lat: 30.13, lon: -97.64, tz: -6, dst: "us" },
  { match: ["road atlanta", "atlanta"], lat: 34.15, lon: -83.81, tz: -5, dst: "us" },
  { match: ["long beach"], lat: 33.77, lon: -118.19, tz: -8, dst: "us" },
];

export function trackGeo(track: string): TrackGeo | null {
  const t = (track || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return TRACKS.find((g) => g.match.some((m) => t.includes(m))) ?? null;
}

/** N-ième dimanche (n < 0 : en partant de la fin) d'un mois (UTC, jour du mois). */
function nthSunday(year: number, month: number, n: number): number {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + 7 * (n - 1);
  }
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}

function isDst(rule: DstRule, d: Date): boolean {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (rule === "eu") {
    if (m < 2 || m > 9) return false;
    if (m > 2 && m < 9) return true;
    return m === 2 ? day >= nthSunday(y, 2, -1) : day < nthSunday(y, 9, -1);
  }
  if (rule === "us") {
    if (m < 2 || m > 10) return false;
    if (m > 2 && m < 10) return true;
    return m === 2 ? day >= nthSunday(y, 2, 2) : day < nthSunday(y, 10, 1);
  }
  return false;
}

const rad = Math.PI / 180;

/** Lever et coucher (heures locales décimales) ; null en nuit/jour polaire. */
export function sunTimes(lat: number, lon: number, date: Date, utcOffsetH: number): { rise: number; set: number } | null {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
  const g = ((2 * Math.PI) / 365) * (doy - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosH = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  if (cosH < -1 || cosH > 1) return null;
  const ha = Math.acos(cosH) / rad;
  const noonUtcMin = 720 - 4 * lon - eqTime;
  const wrap = (h: number) => ((h % 24) + 24) % 24;
  return { rise: wrap((noonUtcMin - 4 * ha) / 60 + utcOffsetH), set: wrap((noonUtcMin + 4 * ha) / 60 + utcOffsetH) };
}

/** Lever / coucher sur un circuit à une date, heure d'été comprise. */
export function trackSun(track: string, date: Date): { rise: number; set: number } | null {
  const g = trackGeo(track);
  if (!g) return null;
  return sunTimes(g.lat, g.lon, date, g.tz + (isDst(g.dst, date) ? 1 : 0));
}

/** Une heure locale (décimale, peut dépasser 24) tombe-t-elle de nuit ? */
export function isNight(hour: number, sun: { rise: number; set: number }): boolean {
  const h = ((hour % 24) + 24) % 24;
  return h < sun.rise || h >= sun.set;
}
