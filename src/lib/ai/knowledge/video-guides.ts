/**
 * Référence vidéo (lap guides) par circuit pour le Coach IA.
 *
 * S'appuie sur `video-guides-data.ts` (playlist « Le Mans Ultimate Lap Guides »,
 * complétée par HYMO Academy / GO Setups). On n'injecte QUE le pointeur (titre +
 * URL) vers la vidéo du combo — pas son contenu — pour que le coach puisse
 * renvoyer le pilote vers le guide visuel. Le tracé du jeu choisit la variante ;
 * jamais la vidéo d'un autre tracé quand le combo n'a pas de guide principal.
 */

import { VIDEO_GUIDES, type VideoGuide } from "./video-guides-data";
import { VIDEO_TRANSCRIPTS } from "./video-transcripts-data";

/** Plafond de transcription injectée (chars). Volontairement large : on
 *  privilégie l'exhaustivité des données pour une analyse juste (les modèles
 *  visés ont une grande fenêtre de contexte). Sécurité contre un cas extrême. */
const TRANSCRIPT_CAP = 16000;

/** Mots-clés de reconnaissance circuit → trackId vidéo (nom DB + layout). */
const TRACK_KEYWORDS: Record<string, string[]> = {
  // En tête : « spa » (Spa) est contenu dans « spain » / « espana ».
  barcelona: ["barcelona", "catalunya"],
  "paul-ricard": ["paul ricard", "ricard", "castellet"],
  silverstone: ["silverstone"],
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

/** Classe DB → classe vidéo (gte/gt3/hypercar/lmp2/lmp3). Ordre = priorité. */
const CLASS_RULES: { test: RegExp; id: string }[] = [
  { test: /hyper|lmh|lmdh|lmp1/i, id: "hypercar" },
  { test: /p3/i, id: "lmp3" },
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
 * Mot du nom de tracé du jeu (`track_course`) par variante quand le `layout` de
 * la playlist ne s'y retrouve pas (« Short » = « Sebring School Circuit »…).
 */
const LAYOUT_COURSE_WORD: Record<string, string> = {
  "sebring:Short": "school",
  "bahrain:Short": "paddock",
};

/**
 * Vidéo retenue parmi celles du combo : la variante dont le nom figure dans le
 * tracé du jeu (« Paul Ricard - 1A-V2-Short » → « 1A-V2-Short », le plus long
 * l'emporte), sinon le layout principal, puis la variante de spec LMP2
 * (ELMS / WEC) qui correspond à la classe DB — Daytona a un guide par spec.
 * Sans layout principal (Paul Ricard ELMS), `null` : jamais un autre tracé.
 */
function pickGuide(matches: VideoGuide[], carClass: string, trackCourse?: string): VideoGuide | null {
  const course = norm(trackCourse ?? "");
  const variant = matches
    .filter((v) => v.layout && course.includes(norm(LAYOUT_COURSE_WORD[`${v.trackId}:${v.layout}`] ?? v.layout)))
    .sort((a, b) => (b.layout?.length ?? 0) - (a.layout?.length ?? 0))[0];
  if (variant) return variant;
  const main = matches.filter((v) => !v.layout);
  if (main.length === 0) return null;
  const elms = /elms/i.test(carClass);
  return main.find((v) => /elms/i.test(v.title) === elms) ?? main[0];
}

/**
 * Vidéo (titre + URL) correspondant au combo, pour affichage UI. Préfère le
 * variante du tracé du jeu, sinon le principal. `null` si aucune vidéo ne couvre le combo.
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
  const pick = pickGuide(matches, carClass, trackCourse);
  return pick ? { title: pick.title, url: pick.url } : null;
}

/**
 * Section de contexte « guide vidéo » pour le combo courant.
 * Renvoie "" si aucune vidéo ne correspond (variante du tracé, sinon principal).
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
  const pick = pickGuide(matches, args.carClass, args.trackCourse);
  if (!pick) return "";

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
