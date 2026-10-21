/**
 * Audit du setup par le Coach IA (opt-in).
 *
 * L'IA lit le setup (réglages présents, index, butées connues), le ressenti du
 * pilote et son style, puis répond **seulement** en JSON : trois changements au
 * plus, chacun = un réglage de la liste fermée, un sens, un ou deux crans et une
 * raison courte. Le moteur valide tout (réglage présent et réglable, crans
 * bornés), puis écrit une NOUVELLE version : l'IA ne pose jamais un chiffre
 * elle-même et l'original n'est jamais modifié.
 */

import type { RestSettingBound, SvmFile } from "@/lib/api";
import type { AIMessage } from "@/lib/ai/types";
import { LEVERS, leverState, type LeverId, type LeverValue } from "@/lib/setupAssistant";
import type { NotchTable } from "@/lib/setupNotches";

/** Ce que veut dire « +1 » pour chaque réglage (convention des index du jeu). */
export const LEVER_SEMANTICS: Record<LeverId, string> = {
  frontArb: "front anti-roll bar, +1 = stiffer",
  rearArb: "rear anti-roll bar, +1 = stiffer",
  frontWing: "front wing, +1 = more angle/downforce",
  rearWing: "rear wing, +1 = more angle/downforce (more drag)",
  rearBrake: "brake balance, +1 = more REARWARD",
  diffPower: "differential on power, +1 = more locking",
  diffCoast: "differential on coast/lift, +1 = more locking",
  diffPreload: "differential preload, +1 = more preload",
  tc: "traction control map, +1 = more intervention",
  frontSprings: "front springs (both wheels), +1 = stiffer",
  rearSprings: "rear springs (both wheels), +1 = stiffer",
  frontRide: "front ride height (both wheels), +1 = higher",
  rearRide: "rear ride height (both wheels), +1 = higher",
};

export interface AuditLever {
  lever: LeverId;
  values: LeverValue[];
  top: number | null;
  inferred: boolean;
}

/** Réglages de la liste fermée présents et réglables sur ce fichier. */
export function auditLevers(svm: SvmFile, bounds?: RestSettingBound[] | null, table?: NotchTable): AuditLever[] {
  const out: AuditLever[] = [];
  for (const lever of Object.keys(LEVERS) as LeverId[]) {
    const { values, inferred, top } = leverState(svm, lever, bounds, table);
    if (!values.length || values.every((v) => /^(n\/a|non-adjustable|fixed)$/i.test(v.display))) continue;
    out.push({ lever, values, top, inferred });
  }
  return out;
}

export interface AuditChange {
  lever: LeverId;
  dir: 1 | -1;
  steps: 1 | 2;
  reason: string;
}

export interface AuditResult {
  summary: string;
  changes: AuditChange[];
}

const LANG_NAME: Record<string, string> = { fr: "French", en: "English", es: "Spanish", de: "German", it: "Italian" };

/** Messages de l'audit (système + utilisateur). */
export function buildAuditMessages(args: {
  levers: AuditLever[];
  setupSummary: string;
  car: string;
  track: string;
  complaint: string;
  style: string;
  lang: string;
  extra?: string;
}): AIMessage[] {
  const { levers, setupSummary, car, track, complaint, style, lang, extra } = args;
  const lng = LANG_NAME[lang.slice(0, 2)] ?? "English";
  const list = levers
    .map((l) => {
      const v = l.values[0];
      const cur = `index ${v.index}${v.display ? ` (${v.display})` : ""}`;
      const top = l.top != null ? `, max index ${l.top}` : ", max index unknown";
      return `- ${l.lever}: ${LEVER_SEMANTICS[l.lever]}; now ${cur}${top}`;
    })
    .join("\n");
  const system =
    "You are a race engineer for Le Mans Ultimate. You audit a car setup and propose AT MOST 3 changes, " +
    "the most effective first. Use ONLY the adjustable settings listed (ids exactly as given). " +
    "Each change moves one setting by 1 or 2 notches. Never touch a setting already at index 0 to go down, " +
    "or at its max index to go up. Prefer small, safe changes; if the setup looks consistent with the driver's " +
    "feedback, propose nothing. Reply with JSON ONLY, no text around it, exactly this shape: " +
    '{"summary":"one sentence","changes":[{"lever":"<id>","dir":1 or -1,"steps":1 or 2,"reason":"short reason"}]}. ' +
    `Write summary and reasons in ${lng}.`;
  const user = [
    `Car: ${car || "unknown"} — Track: ${track || "unknown"}`,
    style ? `Driver style preference: ${style}` : "",
    complaint.trim() ? `Driver feedback: ${complaint.trim()}` : "Driver feedback: none given (general check).",
    `Adjustable settings:\n${list}`,
    setupSummary,
    extra ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Premier objet JSON équilibré du texte (les modèles l'entourent parfois de ```json). */
export function firstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return raw.slice(start, i + 1);
  }
  return null;
}

/**
 * Lit et VALIDE la réponse : réglage de la liste fermée et présent, sens ±1,
 * 1 ou 2 crans, pas de butée franchie, un réglage une seule fois, 3 au plus.
 * `null` si la réponse n'est pas exploitable (le pilote voit une erreur, rien
 * n'est écrit).
 */
export function parseAuditReply(raw: string, levers: AuditLever[]): AuditResult | null {
  const json = firstJsonObject(raw);
  if (!json) return null;
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as { summary?: unknown; changes?: unknown };
  const byId = new Map(levers.map((l) => [l.lever, l]));
  const seen = new Set<string>();
  const changes: AuditChange[] = [];
  for (const c of Array.isArray(o.changes) ? o.changes : []) {
    if (!c || typeof c !== "object") continue;
    const x = c as { lever?: unknown; dir?: unknown; steps?: unknown; reason?: unknown };
    const id = String(x.lever ?? "") as LeverId;
    const l = byId.get(id);
    const dir = Number(x.dir);
    const steps = Math.round(Number(x.steps ?? 1));
    if (!l || seen.has(id) || (dir !== 1 && dir !== -1) || !(steps === 1 || steps === 2)) continue;
    const idx = l.values.map((val) => val.index);
    if (dir < 0 && idx.every((i) => i <= 0)) continue;
    if (dir > 0 && l.top != null && idx.every((i) => i >= l.top!)) continue;
    seen.add(id);
    changes.push({ lever: id, dir, steps: steps as 1 | 2, reason: String(x.reason ?? "").trim().slice(0, 240) });
    if (changes.length >= 3) break;
  }
  return { summary: String(o.summary ?? "").trim().slice(0, 400), changes };
}
