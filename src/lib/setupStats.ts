/**
 * Ce que chaque setup a roulé (`setup_usage.rs` : setup chargé reconnu en piste,
 * tours retrouvés dans les sessions importées). Aides pures + hook de lecture.
 */

import { useEffect, useState } from "react";
import { isTauri, setups as setupsApi, type SetupStats } from "@/lib/api";

/** Type de setup déduit des tours : la séance la plus roulée entre course et qualif. */
export function majorityType(st: SetupStats | null | undefined): "Course" | "Qualif" | null {
  if (!st) return null;
  if (st.quali_laps > st.race_laps) return "Qualif";
  if (st.race_laps > st.quali_laps) return "Course";
  return null;
}

/** `updated_at` des setups (« AAAA-MM-JJ HH:MM:SS », heure locale) → epoch s, ou null. */
export function localStampToEpoch(s: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec((s ?? "").trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Le fichier a été réenregistré après le dernier tour roulé avec lui (marge d'une
 * minute : le jeu réécrit le fichier quand on sauvegarde au garage avant de partir).
 */
export function changedSinceDriven(updatedAt: string | null | undefined, st: SetupStats | null | undefined): boolean {
  const u = localStampToEpoch(updatedAt);
  return u != null && st?.last_driven != null && u > st.last_driven + 60;
}

/** Chiffres de tous les setups, relus quand `dep` change (après un scan). */
export function useSetupStats(dep: unknown): Map<number, SetupStats> {
  const [map, setMap] = useState<Map<number, SetupStats>>(new Map());
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void setupsApi
      .stats()
      .then((l) => alive && setMap(new Map(l.map((s) => [s.setup_id, s]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [dep]);
  return map;
}
