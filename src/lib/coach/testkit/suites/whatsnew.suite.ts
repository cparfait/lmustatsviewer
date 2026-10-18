/**
 * Suite « nouveautés » : quelles versions du journal la fenêtre « Mise à jour
 * installée » montre, et comment elle résume une version. Pur (journal fictif).
 */

import { section, ok, eq } from "../assert";
import { digestEntry, isUpgrade, pendingEntries, MAX_ENTRIES } from "@/lib/whatsNew";
import { CHANGELOG, pickLang, type ChangelogEntry } from "@/lib/changelog";

const entry = (version: string, featured = 0, plain = 0, fixed = 0): ChangelogEntry => ({
  version,
  date: "2026-01-01",
  localized: true,
  sections: [
    {
      kind: "added",
      items: [
        ...Array.from({ length: featured }, (_, i) => ({ text: { en: `F${i}` }, featured: true })),
        ...Array.from({ length: plain }, (_, i) => ({ en: `A${i}` })),
      ],
    },
    { kind: "fixed", items: Array.from({ length: fixed }, (_, i) => `X${i}`) },
  ],
});

export function run(): void {
  section("Nouveautés : versions à montrer");
  const log = [entry("1.0.10"), entry("1.0.9"), entry("1.0.8"), entry("1.0.7"), entry("1.0.6"), entry("1.0.5")];
  eq(
    pendingEntries("1.0.8", "1.0.10", log).map((e) => e.version),
    ["1.0.10", "1.0.9"],
    "versions postérieures à la dernière vue, la plus récente d'abord",
  );
  eq(pendingEntries("1.0.9", "1.0.9", log).length, 0, "même version : rien");
  eq(
    pendingEntries("1.0.8", "1.0.9", log).map((e) => e.version),
    ["1.0.9"],
    "une version du journal plus récente que l'app (en développement) n'est pas montrée",
  );
  eq(
    pendingEntries("", "1.0.9", log).map((e) => e.version),
    ["1.0.9"],
    "dernière vue inconnue (mise à jour depuis une version sans suivi) : la version installée seule",
  );
  eq(pendingEntries("1.0.1", "1.0.10", log).length, MAX_ENTRIES, "beaucoup de versions sautées : bornées");
  ok(isUpgrade("1.0.9", "1.0.10"), "1.0.10 > 1.0.9 (comparaison numérique, pas alphabétique)");
  ok(!isUpgrade("1.0.10", "1.0.9"), "retour à une version antérieure : pas de fenêtre");
  ok(isUpgrade("", "1.0.9"), "dernière vue inconnue : mise à jour");

  section("Nouveautés : résumé d'une version");
  const d1 = digestEntry(entry("2.0.0", 2, 4, 3), 5);
  eq(d1.highlights.length, 2, "nouveautés mises en avant montrées");
  eq(d1.plain.length, 3, "complétées par les premiers ajouts jusqu'à 5 items");
  eq(d1.rest, { added: 1, fixed: 3 }, "le reste compté par type");
  const d3 = digestEntry(entry("2.0.2", 6, 2, 1), 5);
  eq([d3.highlights.length, d3.plain.length], [6, 0], "beaucoup de mises en avant : toutes, sans complément");
  const d2 = digestEntry(entry("2.0.1", 0, 3, 4), 5);
  eq(d2.plain.length, 5, "sans mise en avant : les 5 premiers items");
  eq(d2.rest, { fixed: 2 }, "le reste compté");

  section("Nouveautés : journal réel");
  for (const e of CHANGELOG.filter((x) => x.headline || x.intro)) {
    for (const lg of ["fr", "en", "es", "de", "it"]) {
      if (e.headline) ok(pickLang(e.headline, lg).length > 0, `titre ${e.version} en ${lg}`);
      if (e.intro) ok(pickLang(e.intro, lg).length > 0, `accroche ${e.version} en ${lg}`);
    }
    ok(
      typeof e.headline !== "string" && !!e.headline?.fr && !!e.headline?.de && !!e.headline?.it && !!e.headline?.es,
      `titre ${e.version} traduit dans les 5 langues`,
    );
  }
}
