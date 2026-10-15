/**
 * Variantes de formulation et prénom du pilote (module pur).
 *
 * Un gabarit d'annonce peut contenir plusieurs formulations séparées par `|`
 * (« Tu prends la tête | Te voilà en tête | Tu passes devant »). À chaque
 * annonce, on tourne dans la liste **sans jamais redire deux fois de suite la
 * même** ; le point de départ est tiré une fois par session (sinon chaque
 * session recommencerait par la même variante). Un gabarit sans `|` — dont
 * tous ceux que l'utilisateur a personnalisés avant — reste dit tel quel.
 *
 * Le **prénom** est dosé : seulement sur certains moments (départ, prise de
 * tête, record…), jamais deux phrases de suite, au plus une fois toutes les
 * 210 s, jamais dans une alerte.
 */

export const VARIANT_SEP = "|";

/** Découpe un gabarit en variantes (vide → []). */
export function splitVariants(text: string): string[] {
  return text
    .split(VARIANT_SEP)
    .map((s) => s.trim())
    .filter(Boolean);
}

export class VariantPicker {
  private next = new Map<string, number>();
  private seed: number;

  constructor(seed = Math.floor(Math.random() * 1000)) {
    this.seed = seed;
  }

  /** Nouvelle session : nouveau point de départ des rotations. */
  reset(seed = Math.floor(Math.random() * 1000)): void {
    this.next.clear();
    this.seed = seed;
  }

  /** Choisit la formulation à dire pour `key`. */
  pick(key: string, text: string): string {
    const v = splitVariants(text);
    if (v.length <= 1) return v[0] ?? text.trim();
    const i = this.next.get(key) ?? this.seed % v.length;
    this.next.set(key, (i + 1) % v.length);
    return v[i % v.length];
  }
}

/** Écart minimal entre deux usages du prénom (s). */
export const NAME_GAP_S = 210;

/** Moments où le prénom peut être dit, avec leur probabilité. */
export const NAME_MOMENTS: Record<string, number> = {
  formation: 1,
  "race:final": 1,
  "pos:lead": 0.5,
  "pos:podium": 0.5,
  "lap:pb": 0.5,
};

export class NameDoser {
  private lastAt = -Infinity;
  private lastWasNamed = false;

  reset(): void {
    this.lastAt = -Infinity;
    this.lastWasNamed = false;
  }

  /**
   * Préfixe le prénom si le moment s'y prête. `rnd` injectable (tests). À
   * appeler pour **chaque** annonce dite (la règle « jamais deux de suite » en
   * dépend).
   */
  apply(name: string, moment: string | null, text: string, nowS: number, rnd = Math.random): string {
    const p = moment ? NAME_MOMENTS[moment] ?? 0 : 0;
    const ok = !!name.trim() && p > 0 && !this.lastWasNamed && nowS - this.lastAt >= NAME_GAP_S && rnd() < p;
    this.lastWasNamed = ok;
    if (!ok) return text;
    this.lastAt = nowS;
    return `${name.trim()}, ${text}`;
  }
}
