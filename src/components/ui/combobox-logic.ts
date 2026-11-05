/**
 * Choix d'une saisie libre avec suggestions (`Combobox`, sélecteur de modèle IA).
 * Module pur : testé sans DOM.
 */

type Option = { value: string };

/** L'option dont l'identifiant est exactement ce texte (casse ignorée), sinon `null`. */
export function exactOption(text: string, options: Option[]): string | null {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  return options.find((o) => o.value.toLowerCase() === q)?.value ?? null;
}

/**
 * Ce que valide Entrée, liste ouverte : la suggestion active, ou `null` pour garder
 * le texte tapé. Avec `freeEnter`, la suggestion active n'est retenue que si le pilote
 * a navigué aux flèches : `x` ne doit pas devenir `x:free` parce qu'il y est contenu.
 * Un texte identique à une suggestion reste cette suggestion (avec sa casse).
 */
export function enterChoice(args: {
  freeEnter: boolean;
  navigated: boolean;
  typed: string;
  active: string;
  options: Option[];
}): string | null {
  if (!args.freeEnter || args.navigated) return args.active;
  return exactOption(args.typed, args.options);
}
