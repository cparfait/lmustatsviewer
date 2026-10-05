import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Mémoire des filtres / tris / vues de chaque page, le temps que l'app tourne :
 * quitter un onglet puis y revenir retrouve exactement le même affichage (retour
 * utilisateur : « les filtres se remettaient à zéro à chaque affichage »).
 *
 * En mémoire seulement (pas de `localStorage`) : un redémarrage de l'app repart
 * des valeurs par défaut, ce qui évite un filtre oublié qui masquerait des
 * données au lancement suivant. Les `Set` y sont conservés tels quels.
 */
const memory = new Map<string, unknown>();

/**
 * `useState` dont la valeur survit au démontage de la page. `key` doit être
 * unique dans l'app (convention `page.champ`). `fresh = true` ignore la valeur
 * mémorisée (ex. lien profond qui impose ses propres filtres).
 */
export function usePageState<T>(
  key: string,
  initial: T | (() => T),
  fresh = false,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (!fresh && memory.has(key)) return memory.get(key) as T;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    memory.set(key, value);
  }, [key, value]);
  return [value, setValue];
}

/**
 * `useEffect` qui ne s'exécute que quand une dépendance **change** — jamais au
 * montage. Sert aux remises à zéro en cascade (circuit → tracé, filtre → page 1)
 * qui, lancées au montage, effaceraient les valeurs restaurées par
 * `usePageState`. Comparaison aux dépendances précédentes (et non un simple
 * drapeau « premier rendu ») pour rester correct sous `StrictMode`, qui rejoue
 * les effets au montage.
 */
export function useChangeEffect(effect: () => void, deps: readonly unknown[]) {
  const prev = useRef(deps);
  useEffect(() => {
    const changed = deps.some((d, i) => !Object.is(d, prev.current[i]));
    prev.current = deps;
    if (changed) effect();
    // `effect` est volontairement hors dépendances : seules `deps` déclenchent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
