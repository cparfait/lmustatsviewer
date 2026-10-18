/**
 * Briefing des adversaires : correspondance entre ce que voit le live (nom de circuit
 * `mTrackName`, classe brute du sim) et les combos de la base communautaire (noms des
 * résultats : `TrackVenue`, `TrackCourse`, classe normalisée de l'app) — fonctions pures —
 * et interrupteur de l'option.
 */
import { useEffect, useState } from "react";
import { config, isTauri } from "@/lib/api";

/** Clé de config : briefing affiché dans la page Live (« 1 »), désactivé par défaut. */
export const BRIEFING_KEY = "live_briefing";

export interface ComboRef {
  track: string;
  track_course: string;
  car_class: string;
}

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Classes de la base possibles pour une classe brute du live (la 1ʳᵉ est préférée). */
export function liveClassToDb(raw: string): string[] {
  const c = raw.toLowerCase();
  if (c.includes("hyper") || c.includes("lmh") || c.includes("lmdh")) return ["Hyper"];
  if (c.includes("gt3")) return ["GT3"];
  if (c.includes("gte")) return ["GTE"];
  if (c.includes("p3")) return ["LMP3"];
  if (c.includes("p2")) {
    if (c.includes("elms")) return ["LMP2 ELMS", "LMP2"];
    return ["LMP2 WEC", "LMP2", "LMP2 ELMS"];
  }
  return [raw];
}

/**
 * Combo de la base qui correspond au circuit et à la classe du live. Le tracé exact est
 * préféré (nom identique au `TrackCourse`), puis le nom de circuit. `null` si aucun.
 */
export function matchCombo(combos: ComboRef[], liveTrack: string, liveClass: string): ComboRef | null {
  const lt = norm(liveTrack);
  if (!lt) return null;
  const classes = liveClassToDb(liveClass);
  const score = (c: ComboRef): number => {
    const course = norm(c.track_course);
    const venue = norm(c.track);
    if (course === lt) return 3;
    if (venue === lt) return 2;
    if (course.includes(lt) || lt.includes(course) || venue.includes(lt) || lt.includes(venue)) return 1;
    return 0;
  };
  for (const cls of classes) {
    const best = combos
      .filter((c) => c.car_class === cls)
      .map((c) => ({ c, s: score(c) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)[0];
    if (best) return best.c;
  }
  return null;
}

/** Palier d'un écart à la référence (même grille 100 → 107 % que les paliers de l'app). */
export function tierOfPct(pct: number): "Alien" | "Competitive" | "Good" | "Midpack" | "Tail-ender" | "Offline" {
  if (pct <= 100) return "Alien";
  if (pct <= 101) return "Competitive";
  if (pct <= 102) return "Good";
  if (pct <= 104) return "Midpack";
  if (pct <= 106) return "Tail-ender";
  return "Offline";
}

/** Interrupteur (Configuration › Communauté). */
export function useBriefingSetting(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    void config.get(BRIEFING_KEY).then((v) => setOn(v === "1")).catch(() => {});
  }, []);
  return [
    on,
    (v: boolean) => {
      setOn(v);
      void config.set(BRIEFING_KEY, v ? "1" : "0").catch(() => {});
    },
  ];
}
