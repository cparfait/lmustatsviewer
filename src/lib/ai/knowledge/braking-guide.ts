/**
 * Référence de freinage par circuit pour le Coach IA.
 *
 * S'appuie sur `braking-guide-data.ts` (guide ApexPoints, freinages idéaux par
 * circuit × classe). Fournit le matching circuit/classe et la construction
 * d'une section de contexte compacte injectée dans le prompt du coach — au même
 * titre que la référence « alien » ohne_speed et la mémoire longitudinale.
 *
 * C'est une référence *macro* (repères de freinage génériques), à confronter au
 * pilotage réel ; ce n'est pas une vérité absolue (voiture/setup/conditions).
 */

import { BRAKING_GUIDE } from "./braking-guide-data";

/** Mots-clés de reconnaissance circuit → id du guide (nom DB ou layout). */
const TRACK_KEYWORDS: Record<string, string[]> = {
  "le-mans": ["le mans", "sarthe"],
  monza: ["monza"],
  spa: ["spa", "francorchamps"],
  portimao: ["portimao", "algarve"],
  bahrain: ["bahrain", "sakhir"],
  imola: ["imola"],
  fuji: ["fuji"],
  sebring: ["sebring"],
  "paul-ricard": ["paul ricard", "castellet", "ricard"],
  interlagos: ["interlagos", "paulo"],
  "road-atlanta": ["road atlanta", "atlanta"],
  cota: ["cota", "americas", "austin"],
};

/** Classe DB → classe du guide (hypercar / lmp2 / gt3). Ordre = priorité. */
const CLASS_RULES: { test: RegExp; id: string; label: string }[] = [
  { test: /hyper|lmh|lmdh|lmp1/i, id: "hypercar", label: "Hypercar" },
  { test: /p2/i, id: "lmp2", label: "LMP2" },
  { test: /gt3|lmgt3|gte|gt/i, id: "gt3", label: "GT3" },
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** id du circuit dans le guide, ou null si non couvert. */
export function matchBrakingTrackId(track: string, trackCourse?: string): string | null {
  const hay = norm(`${track ?? ""} ${trackCourse ?? ""}`);
  for (const [id, kws] of Object.entries(TRACK_KEYWORDS)) {
    if (kws.some((k) => hay.includes(k))) return id;
  }
  return null;
}

/** Classe du guide correspondant à la classe DB, ou null. */
export function matchBrakingClass(carClass: string): { id: string; label: string } | null {
  for (const r of CLASS_RULES) if (r.test.test(carClass)) return { id: r.id, label: r.label };
  return null;
}

/**
 * Section de contexte « repères de freinage » pour le combo courant.
 * Renvoie "" si le circuit n'est pas couvert par le guide.
 */
export function buildBrakingGuideText(args: {
  track: string;
  trackCourse?: string;
  carClass: string;
  lang?: string;
}): string {
  const { track, trackCourse, carClass, lang } = args;
  const tid = matchBrakingTrackId(track, trackCourse);
  if (!tid) return "";
  const gt = BRAKING_GUIDE.find((x) => x.id === tid);
  if (!gt) return "";

  const cls = matchBrakingClass(carClass);
  const clsId = cls?.id ?? "hypercar";
  const fr = (lang ?? "").slice(0, 2).toLowerCase() === "fr";

  const lines: string[] = [];
  lines.push(
    `## Ideal braking reference — ${gt.name} (${cls?.label ?? clsId}) [source: ApexPoints]`,
  );
  lines.push(
    "Per-corner reference braking markers (community guide). Compare with the driver's data; this is a generic macro reference, not absolute truth (depends on car/setup/conditions).",
  );
  for (const c of gt.corners) {
    const b = c.braking[clsId] ?? c.braking.hypercar ?? Object.values(c.braking)[0];
    if (!b) continue;
    const tip = (fr ? b.tipFr || b.tip : b.tip) ?? "";
    lines.push(
      `- ${c.number} ${c.name}: ${b.marker}, ${b.speed}, ${b.gear}, ${b.pressure}. ${tip}`,
    );
  }
  return lines.join("\n");
}
