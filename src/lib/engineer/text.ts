/**
 * Mise en forme « radio » des entités de course (module pur).
 *
 * Un ingénieur ne lit pas un pseudo brut ni un code de classe interne : il dit
 * « Martin » et « une Hypercar ». Ces helpers normalisent ce que le plugin
 * expose (noms de pilotes avec suffixes de gamertag, classes `LMP2_ELMS`…) avant
 * que le texte parte vers la synthèse vocale.
 */

/**
 * Nom de pilote tel qu'on le dit à la radio : sans suffixe de gamertag
 * (`#1234`, bloc de 4 chiffres ou plus en fin de nom), capitalisé s'il était
 * tout en minuscules ou tout en majuscules. Repli sur le brut si le nettoyage
 * ne laisse rien.
 */
export function radioName(raw: string): string {
  const src = (raw || "").trim();
  let s = src.replace(/\s*#\d+$/, "").replace(/[\s_.-]*\d{4,}$/, "").trim();
  if (!s) return src;
  if (s === s.toLowerCase() || s === s.toUpperCase()) {
    s = s
      .toLowerCase()
      .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  return s;
}

/** Classe dite en clair : « Hyper » / « LMH » → « Hypercar », « LMP2_ELMS » → « LMP2 »… */
export function radioClass(raw: string): string {
  const c = (raw || "").toLowerCase();
  if (c.includes("hyper") || c.includes("lmh") || c.includes("lmdh")) return "Hypercar";
  if (c.includes("gt3")) return "GT3";
  if (c.includes("gte")) return "GTE";
  if (c.includes("p3")) return "LMP3";
  if (c.includes("p2")) return "LMP2";
  return (raw || "").trim();
}

const RADIO_RANK: Record<string, number> = { Hypercar: 1, LMP2: 2, LMP3: 4, GT3: 5, GTE: 6 };

/**
 * Rang de vitesse d'une classe (plus petit = plus rapide), à partir du nom brut
 * du live (« Hypercar », « LMGT3 », « LMP2_ELMS »…) ; 99 si inconnue.
 */
export function classRank(raw: string): number {
  return RADIO_RANK[radioClass(raw)] ?? 99;
}

/** Numéro de course extrait du nom de voiture LMU (« Team WRT 2026 #32:WEC » → « 32 »). */
export function carNumber(vehicleName: string): string | null {
  const m = /#(\d{1,3})\b/.exec(vehicleName || "");
  return m ? m[1] : null;
}
