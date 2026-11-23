/**
 * Libellés des statuts de fin du jeu (`<FinishStatus>` des XML de résultats).
 *
 * Le jeu écrit des valeurs anglaises brutes : « Finished Normally », « DNF »,
 * « DQ », et « None » pour un pilote non classé (essais, qualification, ou
 * course quittée avant le départ). Elles ne doivent pas traverser l'interface
 * telles quelles : on les traduit, et un statut non renseigné devient un tiret
 * neutre. Une valeur inconnue (future version du jeu) reste affichée brute.
 */

type TFn = (key: string) => string;

export function finishStatusLabel(status: string | null | undefined, t: TFn): string {
  switch ((status ?? "").trim()) {
    case "Finished Normally":
      return t("sessions.statusFinished");
    case "DNF":
      return t("sessions.statusDnf");
    case "DQ":
      return t("sessions.statusDq");
    case "Driver Swap":
      return t("sessions.statusDriverSwap");
    case "":
    case "None":
      return "—";
    default:
      return status!.trim();
  }
}

/** Type de séance (`<Setting>`) : « Multiplayer » → En ligne, sinon Week-end. */
export function settingLabel(setting: string, t: TFn): string {
  return setting === "Multiplayer" ? t("sessions.online") : t("sessions.offline");
}
