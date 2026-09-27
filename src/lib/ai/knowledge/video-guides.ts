/**
 * Référence vidéo (lap guides) par circuit pour le Coach IA.
 *
 * S'appuie sur `video-guides-data.ts` (playlist « Le Mans Ultimate Lap Guides »).
 * On n'injecte QUE le pointeur (titre + URL) vers la vidéo du combo — pas son
 * contenu — pour que le coach puisse renvoyer le pilote vers le guide visuel.
 */

import { VIDEO_GUIDES, type VideoGuide } from "./video-guides-data";
import { VIDEO_TRANSCRIPTS } from "./video-transcripts-data";

/** Plafond de transcription injectée (chars). Volontairement large : on
 *  privilégie l'exhaustivité des données pour une analyse juste (les modèles
 *  visés ont une grande fenêtre de contexte). Sécurité contre un cas extrême. */
const TRANSCRIPT_CAP = 16000;

/** Mots-clés de reconnaissance circuit → trackId vidéo (nom DB + layout). */
const TRACK_KEYWORDS: Record<string, string[]> = {
  "le-mans": ["le mans", "sarthe"],
  monza: ["monza"],
  spa: ["spa", "francorchamps"],
  portimao: ["portimao", "algarve"],
  bahrain: ["bahrain", "sakhir"],
  // Nom écrit par le jeu : « Autodromo Enzo e Dino Ferrari » (sans « Imola »).
  imola: ["imola", "dino ferrari"],
  fuji: ["fuji"],
  sebring: ["sebring"],
  // Nom écrit par le jeu : « Autodromo Jose Carlos Pace » (sans « Interlagos »).
  interlagos: ["interlagos", "paulo", "carlos pace"],
  "road-atlanta": ["road atlanta", "atlanta"],
  cota: ["cota", "americas", "austin"],
  lusail: ["lusail", "qatar"],
  // US Track Pass (pack 3 pré-câblé : Watkins Glen / Indianapolis pressentis).
  daytona: ["daytona"],
  "laguna-seca": ["laguna", "seca"],
  "long-beach": ["long beach", "longbeach"],
  "watkins-glen": ["watkins", "glen"],
  indianapolis: ["indianapolis", "indy"],
};

/** Classe DB → classe vidéo (gte/gt3/hypercar/lmp2). Ordre = priorité. */
const CLASS_RULES: { test: RegExp; id: string }[] = [
  { test: /hyper|lmh|lmdh|lmp1/i, id: "hypercar" },
  { test: /p2/i, id: "lmp2" },
  { test: /gte/i, id: "gte" },
  { test: /gt3|lmgt3|gt/i, id: "gt3" },
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function matchTrackId(track: string, trackCourse?: string): string | null {
  const hay = norm(`${track ?? ""} ${trackCourse ?? ""}`);
  for (const [id, kws] of Object.entries(TRACK_KEYWORDS)) {
    if (kws.some((k) => hay.includes(k))) return id;
  }
  return null;
}

function matchClassId(carClass: string): string | null {
  for (const r of CLASS_RULES) if (r.test.test(carClass)) return r.id;
  return null;
}

/**
 * Vidéo retenue parmi celles du combo : layout principal d'abord, puis la
 * variante de spec LMP2 (ELMS / WEC) qui correspond à la classe DB — Daytona a
 * un guide par spec. Sans variante ELMS, retombe sur la première entrée.
 */
function pickGuide(matches: VideoGuide[], carClass: string): VideoGuide {
  const main = matches.filter((v) => !v.layout);
  const pool = main.length > 0 ? main : matches;
  const elms = /elms/i.test(carClass);
  return pool.find((v) => /elms/i.test(v.title) === elms) ?? pool[0];
}

/**
 * Vidéo (titre + URL) correspondant au combo, pour affichage UI. Préfère le
 * layout principal. `null` si aucune vidéo ne couvre le combo.
 */
export function getVideoGuide(
  track: string,
  trackCourse: string | undefined,
  carClass: string,
): { title: string; url: string } | null {
  const tid = matchTrackId(track, trackCourse);
  const cid = matchClassId(carClass);
  if (!tid || !cid) return null;
  const matches = VIDEO_GUIDES.filter((v) => v.trackId === tid && v.classId === cid);
  if (matches.length === 0) return null;
  const pick = pickGuide(matches, carClass);
  return { title: pick.title, url: pick.url };
}

/**
 * Section de contexte « guide vidéo » pour le combo courant.
 * Renvoie "" si aucune vidéo ne correspond. Préfère le layout principal.
 */
export function buildVideoGuideText(args: {
  track: string;
  trackCourse?: string;
  carClass: string;
}): string {
  const tid = matchTrackId(args.track, args.trackCourse);
  const cid = matchClassId(args.carClass);
  if (!tid || !cid) return "";

  const matches = VIDEO_GUIDES.filter((v) => v.trackId === tid && v.classId === cid);
  if (matches.length === 0) return "";
  const pick = pickGuide(matches, args.carClass);

  const lines: string[] = [
    "## Video lap guide reference",
    `Source: "${pick.title}" by ${pick.channel ?? "Unleashed Drivers"} (YouTube) — ${pick.url}`,
  ];

  // Transcription (sous-titres auto) du combo : conseils de pilotage virage par
  // virage. Plafonnée pour borner les tokens ; peut contenir des erreurs ASR.
  const videoId = pick.url.split("/").pop() ?? "";
  const raw = VIDEO_TRANSCRIPTS[videoId];
  if (raw && raw.trim()) {
    const capped =
      raw.length > TRANSCRIPT_CAP ? raw.slice(0, TRANSCRIPT_CAP) + " […]" : raw;
    lines.push(
      "Auto-caption transcript (may contain ASR errors; use the corner-by-corner braking/line advice, ignore obvious mistakes):",
      capped,
    );
  } else {
    lines.push(
      "If the driver would benefit from a visual reference, you may point them to it (do not invent its content).",
    );
  }
  return lines.join("\n");
}
