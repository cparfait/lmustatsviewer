/**
 * Banque de phrases LLM à slots (COACH-LIVE-SPEC.md §10, P4.3) — module **pur**
 * (types + arithmétique/chaînes seuls, aucune dépendance React/i18n/Tauri),
 * rejouable (§14).
 *
 * Idée §10 : l'espace des messages coach est **petit** (9 diagnostics × ~15 virages
 * × 2 sens). Plutôt qu'un appel LLM au franchissement (1-3 s de latence, §10 « la
 * latence est LE problème »), on **pré-génère** une banque de variantes de
 * formulation par (virage, diagnostic) en **un seul appel batch** par combo × langue
 * (`ai/phrasebank-gen.ts`), et on la stocke (SQLite). Les phrases contiennent des
 * **slots** (`{{d}}` = mètres/km·h⁻¹, `{{n}}` = virage) remplis **en code** au moment
 * du virage → garantie mécanique que *les chiffres ne transitent jamais par le
 * modèle en live* (§10), zéro latence, zéro coût marginal, marche hors-ligne.
 *
 * Ce module ne fait **que** : le catalogue des situations à générer, l'indexation
 * d'une banque, la résolution d'un message vers une variante (avec rotation), et le
 * remplissage des slots. La génération (appel LLM) et l'I/O (SQLite) vivent ailleurs.
 */

import type { DiagCode } from "./diagnostics";

// ── Catalogue des situations (matière de génération) ──────────────────────────

/**
 * Une **situation** de coaching = un (diagnostic, sens) à formuler. Le générateur
 * demande au LLM 2-3 variantes courtes par situation et par virage couvert. Le
 * runtime résout un `CoachVoiceMsg` (code + sign) vers la situation correspondante.
 */
export interface DiagSituation {
  code: DiagCode;
  /** Sens du diagnostic (cf. `CoachDiagnostic.sign`) : distingue les 2 brake-timing. */
  sign: number;
  /** Placeholder chiffré attendu dans la phrase (`d`), ou `null` (phrase sans chiffre). */
  slot: "d" | null;
  /** Unité de la valeur du slot (pour la consigne de génération). */
  unit: string;
  /** Glose (anglais) de ce que le pilote fait / doit corriger — matière du prompt. */
  meaning: string;
}

/**
 * Les 10 situations couvertes (§5 : 9 diagnostics, dont `brake-timing` dédoublé par
 * sens). L'ordre est stable (clé de sérialisation / tests).
 */
export const DIAG_SITUATIONS: readonly DiagSituation[] = [
  { code: "lockup", sign: 0, slot: null, unit: "", meaning: "locked the brakes on entry — ease off the pedal" },
  { code: "wheelspin", sign: 0, slot: null, unit: "", meaning: "wheelspin on exit — feed the throttle more gently" },
  { code: "consistency", sign: 0, slot: null, unit: "", meaning: "inconsistent lap to lap — fix one braking reference" },
  { code: "brake-timing", sign: 1, slot: "d", unit: "m", meaning: "braking too late — brake earlier by the given metres" },
  { code: "brake-timing", sign: -1, slot: "d", unit: "m", meaning: "braking too early — brake later by the given metres" },
  { code: "over-slow", sign: -1, slot: "d", unit: "km/h", meaning: "too slow at apex — carry the given km/h more minimum speed" },
  { code: "entry-too-fast", sign: 1, slot: null, unit: "", meaning: "entering too fast and sacrificing the exit — slow the entry" },
  { code: "late-throttle", sign: 1, slot: null, unit: "", meaning: "back to full throttle too late — get on power earlier" },
  { code: "grip-unused", sign: -1, slot: null, unit: "", meaning: "not using the available grip — commit more through the corner" },
  { code: "no-trail", sign: 1, slot: null, unit: "", meaning: "releasing the brake too early — trail brake to the apex" },
] as const;

/** Ensemble des `DiagCode` couverts par la banque (les 9 diagnostics §5). */
const DIAG_CODE_SET: ReadonlySet<string> = new Set(DIAG_SITUATIONS.map((s) => s.code));

/** `kind` est-il un des 9 diagnostics (vs positif/prédictif/rapport…) ? */
export function isDiagCode(kind: string): kind is DiagCode {
  return DIAG_CODE_SET.has(kind);
}

// ── Entrées de banque + indexation ────────────────────────────────────────────

/**
 * Une entrée de banque = les variantes d'UNE situation, pour UN virage (ou
 * générique). `n = null` : variante **générique** (fallback tous virages, `{{n}}`
 * dans le texte). `n = 3` : variante **spécifique** au virage 3 (nom du virage
 * baké par le LLM ; `{{n}}` optionnel).
 */
export interface PhraseEntry {
  code: DiagCode;
  sign: number;
  /** Numéro de virage **macro** (ApexPoints) ciblé, ou `null` = générique. */
  n: number | null;
  /** 1-3 variantes de formulation (avec slots `{{d}}` / `{{n}}`). */
  texts: string[];
}

/** Banque indexée + curseurs de rotation (état runtime, mutable). */
export interface PhraseBank {
  byKey: Map<string, PhraseEntry>;
  /** Curseur de rotation par clé (variante suivante à servir). */
  cursor: Map<string, number>;
}

const keyOf = (code: DiagCode, sign: number, n: number | null): string =>
  `${code}|${sign}|${n ?? "*"}`;

/** Indexe des entrées (les vides / mal formées sont ignorées) en banque prête. */
export function buildPhraseBank(entries: PhraseEntry[]): PhraseBank {
  const byKey = new Map<string, PhraseEntry>();
  for (const e of entries) {
    const texts = (e.texts ?? []).map((t) => t.trim()).filter(Boolean);
    if (texts.length === 0) continue;
    byKey.set(keyOf(e.code, e.sign, e.n ?? null), { ...e, n: e.n ?? null, texts });
  }
  return { byKey, cursor: new Map() };
}

// ── Remplissage de slots ──────────────────────────────────────────────────────

/**
 * Remplit les `{{var}}` d'un gabarit avec `vars` (mêmes délimiteurs que les
 * annonces i18n, `voiceMessages.fillVars`). Un slot sans valeur est laissé tel
 * quel — l'appelant détecte alors l'échec et retombe sur le gabarit déterministe.
 */
export function fillSlots(template: string, vars: Record<string, string | number>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, "g"), String(v));
  }
  return out;
}

/** Reste-t-il un slot `{{…}}` non substitué ? (garde-fou avant de prononcer). */
export function hasUnfilledSlot(text: string): boolean {
  return /{{\s*[^}]+\s*}}/.test(text);
}

// ── Résolution runtime ────────────────────────────────────────────────────────

/** Ce dont la résolution a besoin d'un message coach (sous-ensemble de `CoachVoiceMsg`). */
export interface PhraseQuery {
  code: DiagCode;
  sign: number;
  /** Virage **macro** apparié (via mappedMacro), ou `null` si non couvert → générique. */
  macroN: number | null;
  /** Variables de slots (`{{n}}`, `{{d}}`) — typiquement `msg.vars`. */
  vars: Record<string, string | number>;
}

/**
 * Résout un message vers une variante de la banque. Préfère la variante
 * **spécifique** au virage (`macroN`), à défaut la **générique**. Fait tourner les
 * variantes (rotation §10 « rotation des variantes »), remplit les slots, et
 * renvoie `null` s'il n'y a pas d'entrée ou si un slot reste vide (repli i18n).
 */
export function resolvePhrase(bank: PhraseBank | null, q: PhraseQuery): string | null {
  if (!bank || bank.byKey.size === 0) return null;
  const specificKey = q.macroN != null ? keyOf(q.code, q.sign, q.macroN) : null;
  const genericKey = keyOf(q.code, q.sign, null);
  const key = (specificKey && bank.byKey.has(specificKey) ? specificKey : null) ??
    (bank.byKey.has(genericKey) ? genericKey : null);
  if (!key) return null;
  const entry = bank.byKey.get(key)!;
  const idx = (bank.cursor.get(key) ?? 0) % entry.texts.length;
  bank.cursor.set(key, idx + 1);
  const text = fillSlots(entry.texts[idx], q.vars);
  return hasUnfilledSlot(text) ? null : text;
}

// ── Invalidation ──────────────────────────────────────────────────────────────

/**
 * Clé d'invalidation d'une banque (§10 « invalidation quand la réf change »).
 * Deux banques du même combo sont compatibles si elles partagent cette clé. On la
 * fait dépendre du **jeu de virages macro** (ce sur quoi le LLM a formulé) et de la
 * **classe** : la réf dense change les *chiffres* (remplis en code), pas la
 * formulation → on n'invalide pas au moindre nouveau best.
 */
export function phrasebankRefKey(classId: string, macroNumbers: (number | null)[]): string {
  const ns = macroNumbers
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b)
    .join(",");
  return `${classId}#${ns}`;
}

// ── Sérialisation (I/O SQLite : blob JSON opaque au backend) ───────────────────

/** Parse le JSON `variants` stocké → entrées valides (silencieux si corrompu). */
export function parsePhraseEntries(json: string): PhraseEntry[] {
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    const out: PhraseEntry[] = [];
    for (const r of raw) {
      if (!r || typeof r.code !== "string" || !Array.isArray(r.texts)) continue;
      const texts = r.texts.filter((t: unknown): t is string => typeof t === "string");
      if (texts.length === 0) continue;
      // Le LLM émet parfois `sign`/`n` en chaîne ("1", "-1", "3") → coercition
      // tolérante (sinon la clé (code,sign,n) manque et on perdrait ces variantes).
      const sign = Number(r.sign);
      const nNum = Number(r.n);
      out.push({
        code: r.code as DiagCode,
        sign: Number.isFinite(sign) ? Math.sign(sign) : 0,
        n: r.n != null && Number.isFinite(nNum) ? nNum : null,
        texts,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Sérialise des entrées pour le stockage SQLite. */
export function serializePhraseEntries(entries: PhraseEntry[]): string {
  return JSON.stringify(entries);
}
