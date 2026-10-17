/**
 * Centre de messages du jeu → évènements de l'ingénieur (module pur).
 *
 * Le plugin publie le dernier message affiché par LMU (`history_message`, textes
 * anglais du jeu) avec son horodatage. C'est la seule source **exacte** du type
 * et de la cause d'une pénalité (le compteur `num_penalties` dit seulement
 * « une de plus »), de l'avertissement « Wrong Way », des phares obligatoires ou
 * de l'avertissement drapeau bleu avant pénalité.
 *
 * Les textes reconnus sont ceux du jeu en anglais ; un texte inconnu est ignoré
 * (jamais d'annonce inventée). À vérifier en jeu : le jeu traduit-il ces messages
 * quand son interface est dans une autre langue ? (VALIDATION-EN-JEU.md).
 */

export type PenaltyType = "stopGo" | "driveThrough" | "time";

export type PenaltyCause =
  | "cutTrack"
  | "pitSpeeding"
  | "falseStart"
  | "exitRed"
  | "passBeforeGreen"
  | "blueIgnored"
  | "stintTime"
  | "other";

export type GameWarning =
  | "oneLapDriveThrough"
  | "oneLapStopGo"
  | "enterPitsToServe"
  | "enterPitsLapAllowance"
  | "drivingTooSlow"
  | "unsportsmanlike"
  | "wrongWay"
  | "headlights"
  | "blueWarning"
  | "crewReady";

export type DisqualifyCause = "laps" | "headlights" | "ignoredStopGo" | "ignoredDriveThrough" | "other";

export type GameMsg =
  | { kind: "penalty"; type: PenaltyType; cause: PenaltyCause }
  | { kind: "warning"; warning: GameWarning }
  | { kind: "dq"; cause: DisqualifyCause };

const has = (s: string, ...parts: string[]) => parts.some((p) => s.includes(p));

/** Cause d'une pénalité d'après la fin du message. */
function causeOf(rest: string): PenaltyCause {
  if (has(rest, "cut track", "track limits", "cutting")) return "cutTrack";
  if (has(rest, "speeding")) return "pitSpeeding";
  if (has(rest, "false start")) return "falseStart";
  if (has(rest, "exiting pits under red", "pit exit")) return "exitRed";
  if (has(rest, "passed before", "illegally passed", "illegal pass")) return "passBeforeGreen";
  if (has(rest, "blue flag")) return "blueIgnored";
  if (has(rest, "stint")) return "stintTime";
  return "other";
}

/**
 * Lit un message du jeu. `null` = message sans intérêt pour la radio (ou inconnu).
 */
export function parseGameMessage(raw: string): GameMsg | null {
  const s = (raw || "").trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("stop/go penalty") || s.startsWith("stop-go penalty") || s.startsWith("stop and go penalty")) {
    return { kind: "penalty", type: "stopGo", cause: causeOf(s) };
  }
  if (s.startsWith("drive-thru penalty") || s.startsWith("drive-through penalty") || s.startsWith("drive thru penalty")) {
    return { kind: "penalty", type: "driveThrough", cause: causeOf(s) };
  }
  if (/^\d+(\.\d+)? ?(second|sec|s)\b.*penalty/.test(s) || s.startsWith("time penalty")) {
    return { kind: "penalty", type: "time", cause: causeOf(s) };
  }
  if (s.startsWith("disqualified")) {
    if (has(s, " laps")) return { kind: "dq", cause: "laps" };
    if (has(s, "headlights")) return { kind: "dq", cause: "headlights" };
    if (has(s, "stop/go", "stop-go")) return { kind: "dq", cause: "ignoredStopGo" };
    if (has(s, "drive-thru", "drive-through", "drive thru")) return { kind: "dq", cause: "ignoredDriveThrough" };
    return { kind: "dq", cause: "other" };
  }
  if (s.startsWith("warning")) {
    if (has(s, "one lap to serve drive-thru", "one lap to serve drive-through")) return { kind: "warning", warning: "oneLapDriveThrough" };
    if (has(s, "one lap to serve stop/go", "one lap to serve stop-go")) return { kind: "warning", warning: "oneLapStopGo" };
    if (has(s, "driving too slow")) return { kind: "warning", warning: "drivingTooSlow" };
    if (has(s, "unsportsmanlike")) return { kind: "warning", warning: "unsportsmanlike" };
    return null;
  }
  if (s === "wrong way" || s.startsWith("wrong way")) return { kind: "warning", warning: "wrongWay" };
  if (has(s, "headlights are now required", "headlights required")) return { kind: "warning", warning: "headlights" };
  if (has(s, "blue flag warning")) return { kind: "warning", warning: "blueWarning" };
  if (has(s, "enter pits this lap to serve penalty", "enter pits to serve")) return { kind: "warning", warning: "enterPitsToServe" };
  if (has(s, "enter pits to avoid exceeding lap allowance")) return { kind: "warning", warning: "enterPitsLapAllowance" };
  if (has(s, "crew is ready for pitstop", "crew is ready")) return { kind: "warning", warning: "crewReady" };
  return null;
}

/**
 * Suivi du message courant : un évènement par **nouveau** message (texte ou
 * horodatage changé). Le premier message vu après un (re)démarrage est ignoré :
 * c'est souvent celui de la séance précédente, resté affiché dans la zone.
 */
export class GameMessageTracker {
  private lastText = "";
  private lastTicks = 0;
  private primed = false;

  reset() {
    this.lastText = "";
    this.lastTicks = 0;
    this.primed = false;
  }

  push(text: string | undefined, ticks: number | undefined): GameMsg | null {
    const tx = (text ?? "").trim();
    const tk = ticks ?? 0;
    if (!this.primed) {
      this.primed = true;
      this.lastText = tx;
      this.lastTicks = tk;
      return null;
    }
    if (tx === this.lastText && tk === this.lastTicks) return null;
    this.lastText = tx;
    this.lastTicks = tk;
    return tx ? parseGameMessage(tx) : null;
  }
}
