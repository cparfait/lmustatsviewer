/**
 * Carnet des questions de l'ingénieur en attente de réponse (module pur).
 *
 * Avant ce carnet, aucune réponse n'était rattachée à une question : un « ok » dit
 * pour autre chose accusait toujours réception de la fenêtre d'arrêt (et taisait ses
 * rappels deux tours), un « oui » ou un « non » seul ne voulait rien dire.
 *
 * Règles :
 *  - une question est **ouverte** quand elle est réellement **dite** à la radio
 *    (pas quand elle est seulement proposée à l'arbitre), pour `ttlS` secondes ;
 *  - une réponse courte (« ok », « oui », « non ») va à la **dernière** question
 *    ouverte ; elle la ferme ;
 *  - une réponse explicite (« box », « je rentre », « à chaque tour ») garde son
 *    propre chemin, quelle que soit la dernière question.
 */

export type QuestionKind = "pitCall" | "lapPref";

export interface OpenQuestion {
  kind: QuestionKind;
  /** Instant où la question a été dite (s, horloge de la boucle). */
  at: number;
  ttlS: number;
}

/** Durée de validité par défaut d'une question (s). */
export const QUESTION_TTL_S: Record<QuestionKind, number> = {
  // Une fenêtre d'arrêt s'acquitte encore une à deux minutes après l'annonce.
  pitCall: 120,
  lapPref: 45,
};

export class QuestionBook {
  private list: OpenQuestion[] = [];

  reset(): void {
    this.list = [];
  }

  /** La question vient d'être dite : elle (re)devient la plus récente. */
  open(kind: QuestionKind, nowS: number, ttlS = QUESTION_TTL_S[kind]): void {
    this.list = this.list.filter((q) => q.kind !== kind);
    this.list.push({ kind, at: nowS, ttlS });
  }

  close(kind: QuestionKind): void {
    this.list = this.list.filter((q) => q.kind !== kind);
  }

  private alive(nowS: number): OpenQuestion[] {
    this.list = this.list.filter((q) => nowS - q.at <= q.ttlS && nowS >= q.at - 1);
    return this.list;
  }

  /** La dernière question encore ouverte, ou null. */
  latest(nowS: number): OpenQuestion | null {
    const l = this.alive(nowS);
    return l.length ? l[l.length - 1] : null;
  }

  isOpen(kind: QuestionKind, nowS: number): boolean {
    return this.alive(nowS).some((q) => q.kind === kind);
  }
}

/** Question ouverte par une annonce dite (clé de l'arbitre), ou null. */
export function questionOfKey(key: string): QuestionKind | null {
  if (key === "pit:open" || key === "pit:closing" || key === "pit:box") return "pitCall";
  if (key === "prefs:ask") return "lapPref";
  return null;
}

/**
 * Réponse courte du pilote → ce qu'elle veut dire, selon la dernière question.
 *  - `ackPit` / `stayOut` : la fenêtre d'arrêt (comportement d'avant) ;
 *  - `askAgain` : la réponse ne choisit pas (« ok » à « chaque tour, les meilleurs ou
 *    aucun ? ») : l'ingénieur nomme la question et la repose ;
 *  - `received` : aucune question ouverte, simple « reçu ».
 * `ack` = « ok / compris / reçu » ; `explicitBox` = « box », « je rentre ».
 */
export type ShortAnswer = "ackPit" | "stayOut" | "askAgain" | "received";

/**
 * Bouton du volant « accuser réception du box » : même règle que le « ok » à la voix (sans
 * fenêtre annoncée ni question ouverte, il ne coupe aucun rappel). Le bouton nomme le box :
 * une question sur les chronos restée ouverte ne le détourne pas.
 */
export function wheelAckApplies(latest: QuestionKind | null, pitWindowSaid: boolean): boolean {
  return resolveShortAnswer("ack", latest === "lapPref" ? null : latest, pitWindowSaid) === "ackPit";
}

export function resolveShortAnswer(
  word: "ack" | "yes" | "no",
  latest: QuestionKind | null,
  pitWindowSaid: boolean,
): ShortAnswer {
  if (latest === "lapPref") return "askAgain";
  if (latest === "pitCall") return word === "no" ? "stayOut" : "ackPit";
  // Aucune question ouverte : « ok » garde l'ancien sens si une fenêtre d'arrêt a été
  // annoncée dans ce relais ; « oui » / « non » seuls ne décident rien.
  if (word === "ack" && pitWindowSaid) return "ackPit";
  return "received";
}
