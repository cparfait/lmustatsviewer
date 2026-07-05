/**
 * Micro-bibliothèque d'assertions pour les tests du coach (COACH-LIVE-SPEC.md §14).
 *
 * Sans dépendance (pas de framework) : compteurs partagés au niveau module, un
 * `report()` final qui imprime le bilan et fixe le code de sortie. Les suites
 * appellent `section`/`ok`/`eq`/`approx` ; l'entrée `run.ts` appelle `report()`.
 */

let pass = 0;
let fail = 0;
const failures: string[] = [];
let current = "";

/** Ouvre une section (regroupe les assertions dans le bilan). */
export function section(name: string): void {
  current = name;
}

/** Assertion booléenne. */
export function ok(cond: boolean, msg: string): void {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`[${current}] ${msg}`);
  }
}

/** Égalité stricte (ou structurelle via JSON pour les objets/tableaux). */
export function eq<T>(actual: T, expected: T, msg: string): void {
  const same =
    Object.is(actual, expected) ||
    JSON.stringify(actual) === JSON.stringify(expected);
  ok(same, `${msg} — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

/** Égalité à une tolérance près (nombres). */
export function approx(actual: number, expected: number, tol: number, msg: string): void {
  ok(Math.abs(actual - expected) <= tol, `${msg} — got ${actual}, want ${expected}±${tol}`);
}

/** Imprime le bilan et sort en erreur si au moins une assertion a échoué. */
export function report(): void {
  if (failures.length) {
    console.error("\nÉchecs :");
    for (const f of failures) console.error("  ✗ " + f);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0 && typeof process !== "undefined") process.exit(1);
}
