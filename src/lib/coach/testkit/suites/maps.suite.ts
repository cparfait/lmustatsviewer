/**
 * Suite « cartes » : orientation commune, heatmap live, duel par mini-secteurs,
 * virages détectés + numérotation officielle, notes radio.
 */

import { section, ok, eq, approx } from "../assert";
import { fitTransform, heatSegments, principalAngle, type Pt } from "@/lib/trackMapGeom";
import { LiveHeat, miniDuel, deltaColor } from "@/lib/liveHeat";
import { detectTrackCorners, officialCornerLabels, cornerTableFor } from "@/lib/trackCorners";
import { CORNER_TABLE } from "@/data/cornerNames";
import { adjust, addRating, familyOf, penalized, RadioLog } from "@/lib/engineer/radioFeedback";
import { classSolidColor } from "@/lib/staticData";
import { route } from "@/lib/engineer/router";
import atlanta from "../../../../../src-tauri/src/data/tracks/michelin_raceway_road_atlanta.json";

/** Tracé embarqué (bucket → point) → points + distances, dans l'ordre. */
function bundled(map: Record<string, [number, number]>): { pts: Pt[]; dists: number[] } {
  const keys = Object.keys(map)
    .filter((k) => /^\d+$/.test(k))
    .map(Number)
    .sort((a, b) => a - b);
  return { pts: keys.map((k) => map[String(k)]), dists: keys.map((k) => k * 20 + 10) };
}

export function run(): void {
  section("trackMapGeom.fitTransform");
  {
    // Rectangle allongé en diagonale : en « auto », il doit finir plus large que haut.
    const diag: Pt[] = [];
    for (let i = 0; i < 40; i++) diag.push([i * 10, i * 10 + (i % 2) * 3]);
    for (let i = 39; i >= 0; i--) diag.push([i * 10 + 20, i * 10 - 20]);
    const auto = fitTransform(diag, diag, { mode: "auto", width: 1000 });
    const ys = diag.map((p) => auto.project(p)[1]);
    const xs = diag.map((p) => auto.project(p)[0]);
    ok(Math.max(...xs) - Math.min(...xs) > 2 * (Math.max(...ys) - Math.min(...ys)), "auto : plus large que haut");
    ok(auto.height < auto.width, "hauteur déduite des proportions");
    // Ligne de départ (1er point) dans la moitié basse de l'écran.
    ok(auto.project(diag[0])[1] >= auto.height / 2 - 1, "départ en bas");
    // Nord en haut : +z vers le haut (y écran plus petit), échelle identique.
    const north = fitTransform([[0, 0], [100, 0], [100, 50], [0, 50]], [[0, 0], [100, 0], [100, 50], [0, 50]], { mode: "north", width: 1000, height: 1000 });
    ok(north.project([0, 50])[1] < north.project([0, 0])[1], "nord : +z en haut");
    const a = north.project([0, 0]);
    const b = north.project([100, 0]);
    const c = north.project([0, 50]);
    approx(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.hypot(c[0] - a[0], c[1] - a[1]), 2, 1e-9, "échelle identique sur les deux axes");
    approx(principalAngle([[0, 0], [1, 1], [2, 2], [3, 3]]), Math.PI / 4, 1e-9, "axe principal à 45°");
  }

  section("trackMapGeom.heatSegments");
  eq(heatSegments([10, 30, 50, 120], 0), [[0, 1], [1, 2]], "segments jointifs seulement");
  eq(heatSegments([10, 30, 3990], 4000).length, 2, "fermeture par la ligne");

  section("liveHeat");
  {
    const h = new LiveHeat();
    h.reset("a");
    // Tour 1 (référence) puis tour 2 plus lent sur la 2e moitié.
    const lap = (base: number, slow: number) => {
      for (let d = 0; d < 1000; d += 20) h.push(d, 200, base + d / 50 + (d >= 500 ? (d - 500) * slow : 0), h["lap"] < 0 ? 0 : h["lap"], 0, false);
    };
    lap(1, 0);
    h.push(5, 200, 0.1, 1, 21, false);
    lap(1, 0.002);
    h.push(5, 200, 0.1, 2, 22, false);
    ok(h.speedMap() !== null, "vitesse du dernier tour");
    const dm = h.deltaMap();
    ok(!!dm && dm[10] === 0 && dm[40] > 0, "écart : nul au début, perdu en fin de tour");
    eq(deltaColor(-0.1, 0.05).color, "#22c55e", "gagné = vert");
    const d = miniDuel([10, 11, 0], [10.5, 10.8, 12]);
    approx(d[0], -0.5, 1e-9, "duel : joueur plus rapide");
    ok(Number.isNaN(d[2]), "zone inconnue = NaN");
  }

  section("trackCorners (tracé réel de Road Atlanta)");
  {
    const { pts, dists } = bundled(atlanta as unknown as Record<string, [number, number]>);
    const found = detectTrackCorners(pts, dists);
    // Diagnostic : nombre détecté vs carte officielle (13 points avec 10A/10B).
    console.log(`  · Road Atlanta : ${found.length} virages détectés (carte officielle : 13 repères)`);
    eq(found.length, 13, "13 virages détectés = 13 repères officiels");
    ok(found.every((c, i) => i === 0 || c.dist > found[i - 1].dist), "dans l'ordre du tour");
    const fiche = cornerTableFor("Michelin Raceway Road Atlanta");
    eq(fiche?.corners.length, 13, "fiche Road Atlanta : 13 repères");
    const labels = officialCornerLabels("Michelin Raceway Road Atlanta", pts, dists);
    eq(labels.map((l) => l.n).join(" "), "1 2 3 4 5 6 7 8 9 10A 10B 11 12", "numéros officiels posés");
    eq(officialCornerLabels("Circuit inconnu", pts, dists), [], "circuit sans fiche : rien");
    eq(cornerTableFor("Autodromo Nazionale Monza")?.corners.length, 11, "Monza : 11");
    eq(cornerTableFor("Circuit de la Sarthe"), null, "Le Mans écarté (pas de numérotation officielle)");
    ok(CORNER_TABLE.every((c) => c.sources.length > 0), "chaque fiche cite ses sources");
  }

  section("radioFeedback");
  {
    eq(familyOf("tyres:wear"), "tyres:wear", "famille fixe");
    eq(familyOf("rivalpit:Jean Dupont:2"), "rivalpit", "donnée retirée");
    let s = addRating({}, "pos:gain", "useless");
    s = addRating(s, "pos:gain", "useless");
    s = addRating(s, "pos:gain", "wrong");
    ok(penalized(s["pos:gain"]), "3 négatives → plus rare");
    const out = adjust(
      [
        { key: "pos:gain", text: "x", prio: "normal", score: 50 },
        { key: "flag:yellow", text: "y", prio: "normal", score: 50 },
      ],
      s,
    );
    eq(out[0].cooldownLaps, 3, "malus : redite espacée");
    eq(out[1].cooldownLaps, undefined, "sécurité intacte");
    const log = new RadioLog();
    log.record([{ key: "pit:open", text: "Fenêtre ouverte" }], "spa|10", 1000);
    eq(log.rateLast("late", 2000)?.rating, "late", "note vocale sur la dernière annonce");
    eq(log.rateLast("useful", 1000 + 200_000), null, "trop ancienne : rien");
    eq(log.stats["pit:open"].late, 1, "cumul");
    log.rate(1, "useful");
    eq(log.stats["pit:open"], { useful: 1, useless: 0, late: 0, wrong: 0 }, "note remplacée");
    eq(route("inutile", "fr").intent, "rateUseless", "« inutile » reconnu");
    eq(route("too late", "en").intent, "rateLate", "« too late » reconnu");
    eq(route("zu spät", "de").intent, "rateLate", "« zu spät » reconnu");
  }

  section("couleurs de classe");
  eq(classSolidColor("Hypercar"), "#ef4444", "classe connue : palette");
  ok(classSolidColor("LMGT2") === classSolidColor("LMGT2") && classSolidColor("LMGT2").startsWith("hsl("), "classe inconnue : teinte stable");
}
