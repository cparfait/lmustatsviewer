/**
 * Cause d'une erreur d'appel IA (module pur) : `friendlyError` en tire le
 * message détaillé de l'écran, l'ingénieur une phrase radio courte.
 */

export type AiErrorKind = "model" | "key" | "quota" | "rate" | "server" | "network" | "other";

/** Classe le message brut du proxy (`HTTP 404: …`, erreur réseau…). */
export function aiErrorKind(msg: string): { kind: AiErrorKind; code?: string } {
  // Modèle inconnu, retiré ou hors périmètre de la clé : 404 chez Google comme
  // chez OpenAI, parfois 400 avec un libellé explicite (« no longer available
  // to new users » pour les Gemini 2.5). Sans ce cas, l'utilisateur voyait le
  // JSON brut du fournisseur sans comprendre qu'il doit changer de modèle.
  if (/no longer available|not found for API version|model.*(not found|does not exist)/i.test(msg)) {
    return { kind: "model" };
  }
  const m = /HTTP (\d{3})/.exec(msg);
  if (m) {
    const code = m[1];
    if (code === "401" || code === "403") return { kind: "key", code };
    if (code === "402") return { kind: "quota", code };
    if (code === "404") return { kind: "model", code };
    if (code === "429") return { kind: "rate", code };
    if (code.startsWith("5")) return { kind: "server", code };
  }
  if (/error sending request|connect|dns|timed out|timeout/i.test(msg)) return { kind: "network" };
  return { kind: "other" };
}
