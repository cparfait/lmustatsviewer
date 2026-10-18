/**
 * Références de la base communautaire pour le Coach IA post-course (lecture publique,
 * aucune donnée personnelle envoyée : circuit, tracé, classe et un temps au tour).
 *
 * Plutôt que le seul temps « alien », le coach reçoit une cible atteignable : le rang
 * du pilote sur le combo, puis les secteurs des pilotes JUSTE devant lui (le palier
 * au-dessus), les meilleurs secteurs de la communauté et la meilleure référence avec
 * la même voiture. Filtres du serveur par défaut (sec, aides « propres »).
 */

import { community } from "../../api";
import type { CommunityLeaderboard, CommunityPosition, SessionDetail } from "../../api";
import { formatTime, formatSectorSeconds } from "../../utils";

/** Pilotes « juste devant » moyennés pour la cible de palier. */
const NEXT_STEP_DRIVERS = 5;

type Row = CommunityLeaderboard["rows"][number];

const signed = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(3)}s`;
const hasSectors = (r: Row) => r.s1 != null && r.s2 != null && r.s3 != null && r.s1 > 0 && r.s2 > 0 && r.s3 > 0;

/**
 * Texte de la section à partir des réponses du serveur (pur, testable). `mine` = secteurs
 * du meilleur tour du pilote ; `ownTag` exclut sa propre ligne du classement.
 */
export function summarizeCommunityReference(args: {
  best: number;
  mine: [number | null, number | null, number | null];
  car: string;
  pos: CommunityPosition;
  rows: Row[];
  ownTag?: string | null;
}): string {
  const { best, mine, car, pos, ownTag } = args;
  const rows = args.rows.filter((r) => !ownTag || r.driver.tag !== ownTag);
  const lines: string[] = [];
  lines.push(
    `## Community reference (shared LMU Stats Viewer database — ${pos.drivers} drivers on this combo, dry & clean aids, game version ${pos.version})`,
  );
  lines.push(
    `Your best ${formatTime(best)} → rank ${pos.rank}/${pos.drivers} (top ${pos.top_pct}%) · gap to community best ${signed(pos.gap_best)} · to median ${signed(pos.gap_median)}`,
  );

  // Palier au-dessus : les pilotes les plus proches devant (secteurs connus).
  const ahead = rows
    .filter((r) => r.time < best && hasSectors(r))
    .sort((a, b) => b.time - a.time)
    .slice(0, NEXT_STEP_DRIVERS);
  const mineOk = mine.every((v) => v != null && v > 0);
  if (ahead.length > 0) {
    const avg = (k: "s1" | "s2" | "s3") => ahead.reduce((a, r) => a + (r[k] as number), 0) / ahead.length;
    const target = [avg("s1"), avg("s2"), avg("s3")];
    const lap = ahead.reduce((a, r) => a + r.time, 0) / ahead.length;
    let line =
      `Next step (avg of the ${ahead.length} driver(s) just ahead of you, ${formatTime(lap)}): ` +
      `S1 ${formatSectorSeconds(target[0])} · S2 ${formatSectorSeconds(target[1])} · S3 ${formatSectorSeconds(target[2])}`;
    if (mineOk) {
      const gaps = target.map((t, i) => (mine[i] as number) - t);
      const worst = gaps.indexOf(Math.max(...gaps));
      line += ` → your gaps ${gaps.map((g, i) => `S${i + 1} ${signed(g)}`).join(" · ")} (biggest: S${worst + 1})`;
    }
    lines.push(line);
  } else if (pos.rank === 1) {
    lines.push("You hold the community best on this combo: no driver ahead to compare with.");
  }

  // Meilleurs secteurs de la communauté (tous pilotes) : plafond, pas une cible immédiate.
  const withSec = rows.filter(hasSectors);
  if (withSec.length > 0) {
    const bestS = (["s1", "s2", "s3"] as const).map((k) => Math.min(...withSec.map((r) => r[k] as number)));
    lines.push(
      `Community best sectors (any driver, ceiling not a short-term target): S1 ${formatSectorSeconds(bestS[0])} · S2 ${formatSectorSeconds(bestS[1])} · S3 ${formatSectorSeconds(bestS[2])} · ideal ${formatTime(bestS[0] + bestS[1] + bestS[2])}`,
    );
  }

  // Même voiture : la référence la plus parlante (même BoP, mêmes points de freinage).
  const sameCar = rows.filter((r) => r.car_model === car).sort((a, b) => a.time - b.time)[0];
  if (sameCar && car) {
    lines.push(
      `Best with the same car (${car}): ${formatTime(sameCar.time)} (rank ${sameCar.rank})` +
        (hasSectors(sameCar)
          ? ` · S1 ${formatSectorSeconds(sameCar.s1)} · S2 ${formatSectorSeconds(sameCar.s2)} · S3 ${formatSectorSeconds(sameCar.s3)}`
          : ""),
    );
  }
  return lines.join("\n");
}

/** Section « référence communautaire » du contexte post-course ; "" si indisponible. */
export async function buildCommunityReferenceText(detail: SessionDetail): Promise<string> {
  const player = detail.results.find((r) => r.is_player);
  if (!player?.best_lap || player.best_lap <= 0 || !player.car_class) return "";
  const q = { track: detail.session.track, course: detail.session.track_course, class: player.car_class };
  const pos = await community.get<CommunityPosition>("combos/position", { ...q, time: player.best_lap });
  if (!pos || pos.drivers < 2) return "";
  const top = await community.get<CommunityLeaderboard>("combos/leaderboard", { ...q, limit: 100, offset: 0 });
  let rows = top?.rows ?? [];
  // Rang au-delà de la 1ʳᵉ page : on ajoute la fenêtre autour du pilote.
  if (pos.rank > 95) {
    const near = await community
      .get<CommunityLeaderboard>("combos/leaderboard", { ...q, limit: 12, offset: Math.max(0, pos.rank - 8) })
      .catch(() => null);
    const seen = new Set(rows.map((r) => r.driver.tag));
    rows = [...rows, ...(near?.rows ?? []).filter((r) => !seen.has(r.driver.tag))];
  }
  const ownTag = await community
    .status()
    .then((s) => s.tag)
    .catch(() => null);
  return summarizeCommunityReference({
    best: player.best_lap,
    mine: [player.best_lap_s1, player.best_lap_s2, player.best_lap_s3],
    car: player.unique_car_name || player.car_type,
    pos,
    rows,
    ownTag,
  });
}
