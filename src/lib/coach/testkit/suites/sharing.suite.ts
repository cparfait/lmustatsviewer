/**
 * Suite « partage des setups » : clé de voiture partageable, nettoyage d'une table
 * de crans (reçue ou envoyée), empreinte stable, priorité à notre table sur celle de
 * la communauté, nom du fichier téléchargé. Pur.
 */

import { section, ok, eq } from "../assert";
import { carFolderOf, cleanTable, importName, isShareableCarKey, tableFingerprint, withCommunity } from "@/lib/setupSharing";
import type { NotchTable } from "@/lib/setupNotches";

export function run(): void {
  section("partage.cle-voiture");
  ok(isShareableCarKey("Mercedes_AMGGT3Evo_2025/1.11"), "dossier/version accepté");
  ok(!isShareableCarKey("Mercedes-AMG LMGT3"), "classe brute (pas de //VEH=) refusée");
  ok(!isShareableCarKey("../x"), "remontée refusée");
  eq(carFolderOf("Mercedes_AMGGT3Evo_2025/1.11"), "Mercedes_AMGGT3Evo_2025", "dossier sans la version");

  section("partage.nettoyage");
  const dirty = {
    "REARWING.RWSetting": { displays: { "7": " 7.0 deg ", "x": "nope", "8": "a\u0007b" }, count: 12 },
    "bad id": { displays: { "1": "1" } },
    "FRONTLEFT.CamberSetting": { displays: {}, count: 0 },
  } as unknown as NotchTable;
  const clean = cleanTable(dirty);
  eq(Object.keys(clean), ["REARWING.RWSetting"], "réglage invalide et entrée vide retirés");
  eq(clean["REARWING.RWSetting"].displays, { "7": "7.0 deg" }, "index non numérique et caractère de contrôle retirés");
  eq(clean["REARWING.RWSetting"].count, 12, "nombre de crans gardé");
  eq(cleanTable(null), {}, "rien → table vide");

  section("partage.empreinte");
  const a: NotchTable = { "A.X": { displays: { "1": "a", "10": "b" } }, "B.Y": { displays: { "2": "c" }, count: 3 } };
  const b: NotchTable = { "B.Y": { count: 3, displays: { "2": "c" } }, "A.X": { displays: { "10": "b", "1": "a" } } };
  eq(tableFingerprint(a), tableFingerprint(b), "ordre des clés indifférent");
  ok(tableFingerprint(a) !== tableFingerprint({ ...a, "A.X": { displays: { "1": "a", "10": "B" } } }), "un texte change → empreinte change");

  section("partage.fusion");
  const local: NotchTable = { "REARWING.RWSetting": { displays: { "7": "7.0 deg" } } };
  const shared: NotchTable = {
    "REARWING.RWSetting": { displays: { "7": "9.9 deg", "8": "8.0 deg" }, count: 12 },
    "FRONTWING.FWSetting": { displays: { "1": "1" } },
  };
  const m = withCommunity(local, shared);
  eq(m["REARWING.RWSetting"].displays["7"], "7.0 deg", "notre table l'emporte");
  eq(m["REARWING.RWSetting"].displays["8"], "8.0 deg", "la communauté complète");
  eq(m["REARWING.RWSetting"].count, 12, "nombre de crans repris");
  ok(!!m["FRONTWING.FWSetting"], "réglage inconnu chez nous ajouté");
  eq(local["REARWING.RWSetting"].displays["8"], undefined, "notre table n'est pas modifiée");
  eq(withCommunity(local, null), local, "hors ligne : notre table telle quelle");

  section("partage.nom-telecharge");
  const author = { name: "Jean Dupont", tag: "#a1b2", homonym: false, country: null, avatar: null };
  eq(importName({ name: "Spa course", author }, []), "Spa course (Jean Dupont)", "nom + auteur");
  eq(importName({ name: "Spa course", author }, ["Spa course (Jean Dupont).svm"]), "Spa course (Jean Dupont) V2", "nom pris → V2");
  eq(importName({ name: "Q", author: { ...author, name: null } }, []), "Q (a1b2)", "anonyme : repère");
}
