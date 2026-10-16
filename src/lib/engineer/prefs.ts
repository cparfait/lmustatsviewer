/**
 * Préférences radio apprises du pilote (module pur + persistance légère).
 *
 * Premier sujet : les chronos au passage de la ligne. Le pilote choisit à la
 * voix, par type de séance (essais / qualif / course) :
 *  - `auto`  : la politique habituelle (`lapPolicy.ts`) ;
 *  - `every` : chaque tour lancé ;
 *  - `best`  : seulement les nouveaux meilleurs tours ;
 *  - `none`  : aucun chrono.
 * Le choix est retenu d'une séance à l'autre. Si rien n'est choisi, l'ingénieur
 * pose la question une seule fois par type de séance, à un moment calme.
 */

export type LapPref = "auto" | "every" | "best" | "none";
export type SessionKind = "practice" | "quali" | "race";

export interface LapPrefs {
  prefs: Partial<Record<SessionKind, LapPref>>;
  /** Types de séance pour lesquels la question a déjà été posée. */
  asked: SessionKind[];
}

/** Type de séance rF2 (`mSession`) : 1-4 essais, 5-8 qualif, 9 warm-up, ≥ 10 course. */
export function sessionKind(session: number): SessionKind {
  if (session >= 10) return "race";
  if (session >= 5 && session <= 8) return "quali";
  return "practice";
}

/**
 * Décision finale du chrono de ligne selon la préférence. `auto` garde la
 * décision de la politique habituelle ; `every` annonce tout tour lancé.
 */
export function applyLapPref(
  pref: LapPref | undefined,
  auto: "pb" | "last" | null,
  isPb: boolean,
  flying: boolean,
): "pb" | "last" | null {
  switch (pref) {
    case "none":
      return null;
    case "best":
      return isPb ? "pb" : null;
    case "every":
      return isPb ? "pb" : flying ? "last" : null;
    default:
      return auto;
  }
}

export function parseLapPrefs(raw: string | null | undefined): LapPrefs {
  try {
    const v = JSON.parse(raw || "{}") as Partial<LapPrefs>;
    return { prefs: v.prefs ?? {}, asked: Array.isArray(v.asked) ? v.asked : [] };
  } catch {
    return { prefs: {}, asked: [] };
  }
}

/** La question est due : pas de préférence, jamais posée pour ce type de séance. */
export function questionDue(p: LapPrefs, kind: SessionKind): boolean {
  return p.prefs[kind] == null && !p.asked.includes(kind);
}
