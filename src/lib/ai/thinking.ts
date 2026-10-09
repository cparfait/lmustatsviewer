/**
 * Retrait du « raisonnement » que certains modèles écrivent DANS le texte de
 * réponse, entre balises `<think>…</think>` (DeepSeek R1 et dérivés, Qwen,
 * passerelles locales type LM Studio / vLLM…). Le rendu markdown masque les
 * balises mais pas leur contenu : le pilote voyait tout le brouillon interne du
 * modèle (en anglais), suivi d'une réponse souvent tronquée.
 *
 * Les fournisseurs qui séparent proprement le raisonnement (champ `thinking`
 * d'Ollama, `reasoning_content` OpenAI-compat, parties `thought` de Gemini) sont
 * déjà filtrés à la source ; ce module couvre le cas « tout dans le texte ».
 */

const OPEN = /<(think|thinking|reasoning)>/i;
const CLOSE = /<\/(think|thinking|reasoning)>/i;

/**
 * Texte visible : blocs de raisonnement retirés. Un bloc non fermé masque tout
 * ce qui suit (réponse encore en cours de raisonnement, ou coupée pendant).
 * Une balise fermante orpheline (balise ouvrante non émise par le modèle)
 * masque tout ce qui la précède.
 */
export function stripThinking(text: string): string {
  let out = text;
  // Fermante orpheline en tête : le raisonnement a commencé sans balise.
  const firstClose = CLOSE.exec(out);
  const firstOpen = OPEN.exec(out);
  if (firstClose && (!firstOpen || firstClose.index < firstOpen.index)) {
    out = out.slice(firstClose.index + firstClose[0].length);
  }
  for (;;) {
    const o = OPEN.exec(out);
    if (!o) break;
    const rest = out.slice(o.index + o[0].length);
    const c = CLOSE.exec(rest);
    out = c ? out.slice(0, o.index) + rest.slice(c.index + c[0].length) : out.slice(0, o.index);
  }
  return out.replace(/^\s+/, "");
}

/** Longueur max d'une balise (`</reasoning>`) : taille de la queue retenue en flux. */
const MAX_TAG = 12;

/**
 * Filtre incrémental pour le streaming : renvoie la portion **nouvellement
 * visible** à chaque fragment reçu. Une queue pouvant être le début d'une
 * balise (`<thi`) est retenue jusqu'au fragment suivant.
 */
export class ThinkingStreamFilter {
  private raw = "";
  private emitted = "";

  push(chunk: string): string {
    this.raw += chunk;
    // Retient une éventuelle balise coupée en fin de fragment.
    const lt = this.raw.lastIndexOf("<");
    const held = lt >= 0 && this.raw.length - lt < MAX_TAG && !this.raw.slice(lt).includes(">");
    const visible = stripThinking(held ? this.raw.slice(0, lt) : this.raw);
    // Un texte déjà émis ne peut pas être repris (fermante orpheline tardive) :
    // on n'émet alors plus rien en flux, le texte final filtré le remplacera.
    if (!visible.startsWith(this.emitted)) return "";
    const delta = visible.slice(this.emitted.length);
    this.emitted = visible;
    return delta;
  }
}
