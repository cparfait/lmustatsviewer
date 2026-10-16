/**
 * Verrou d'annonce pour les alertes de dégâts (crevaison, roue arrachée,
 * suspension, aéro, gros choc).
 *
 * Retour du mainteneur (2026-10-16) : voiture arrêtée sur le bas-côté, les
 * annonces « dégâts importants, suspension avant gauche, crevaison, roue
 * arrachée » se répétaient en boucle. Le front montant seul ne suffit pas :
 * une donnée qui clignote (une trame saine, une trame REST manquante) le
 * réarmait aussitôt.
 *
 * Règles : une alerte n'est annoncée qu'une fois ; elle ne se réarme qu'après
 * `clearMs` de retour à la normale **continu** ; une valeur inconnue (`null`)
 * ne change rien ; et deux annonces de la même alerte sont espacées d'au moins
 * `minGapMs`.
 */
export class AlertLatch {
  private said = false;
  private clearSince: number | null = null;
  private lastSaid = -Infinity;

  constructor(
    private readonly clearMs = 5_000,
    private readonly minGapMs = 60_000,
  ) {}

  /** `active` : condition présente, absente, ou inconnue (null). Vrai = annoncer. */
  update(active: boolean | null, now: number): boolean {
    if (active == null) return false;
    if (!active) {
      if (this.clearSince == null) this.clearSince = now;
      if (this.said && now - this.clearSince >= this.clearMs) this.said = false;
      return false;
    }
    this.clearSince = null;
    if (this.said || now - this.lastSaid < this.minGapMs) return false;
    this.said = true;
    this.lastSaid = now;
    return true;
  }

  /**
   * Réarme (nouvelle séance) sans oublier l'heure de la dernière annonce :
   * une remise à zéro intempestive ne doit pas relancer la rafale.
   */
  rearm(): void {
    this.said = false;
    this.clearSince = null;
  }
}
