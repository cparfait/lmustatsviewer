/**
 * Couche d'abstraction des fournisseurs d'IA (AI Coach).
 *
 * Chaque fournisseur (Google, Ollama, …) implémente `AIProvider`. Le backend
 * Rust ne connaît pas les fournisseurs : il relaie une requête générique
 * (URL + en-têtes + corps) que le provider construit ici. Ajouter un
 * fournisseur = un fichier dans `providers/`, aucun changement Rust.
 */

export type AIRole = "system" | "user" | "assistant";

export interface AIMessage {
  role: AIRole;
  content: string;
}

/** Un modèle proposé dans le sélecteur de la page Config. */
export interface ModelInfo {
  id: string;
  /** Libellé affichable (display_name si fourni, sinon = id). */
  label: string;
  /** Date de création (epoch s) si l'API la fournit — sert au tri par récence. */
  createdAt?: number;
  /** Fenêtre de contexte en tokens si connue (Google la donne). */
  contextTokens?: number;
}

export interface AIProvider {
  /** Identifiant interne stable (clé de config `ai_provider`). */
  id: string;
  /** Nom affichable. */
  name: string;
  /** Faux pour Ollama (local, aucune clé requise). */
  needsKey: boolean;

  /** URL complète de l'appel chat (Google y intègre le modèle + la clé). */
  chatUrl(model: string, apiKey: string): string;
  /** URL de l'appel chat en streaming (Google utilise `streamGenerateContent`). */
  streamChatUrl(model: string, apiKey: string): string;
  /** URL de la liste des modèles (la clé peut être en query, ex. Google). */
  modelsUrl(apiKey: string): string;
  /** En-têtes HTTP (Authorization, Content-Type, etc.). */
  buildHeaders(apiKey: string): [string, string][];
  /** Corps JSON de la requête chat. `stream` active le streaming côté fournisseur. */
  buildBody(messages: AIMessage[], model: string, maxTokens: number, stream?: boolean): unknown;

  /** Extrait le texte de la réponse chat (non-streaming). */
  parseResponse(raw: unknown): string;
  /** Extrait le texte d'une ligne de flux (SSE/NDJSON). null si pas de texte. */
  parseStreamChunk(line: string): string | null;
  /** Normalise la réponse de la liste des modèles. */
  parseModels(raw: unknown): ModelInfo[];

  /** Liste statique de repli si l'appel `listModels` échoue (hors-ligne, 401…). */
  fallbackModels: ModelInfo[];
  /**
   * Lien vers la doc/liste officielle des modèles du fournisseur. Les modèles
   * évoluent vite chez tous les fournisseurs : plutôt qu'une liste figée à
   * maintenir, l'UI renvoie l'utilisateur à la source à jour (il saisit l'id).
   */
  docsUrl: string;
  /**
   * Certains fournisseurs (OpenRouter…) exposent des centaines de modèles :
   * on privilégie alors la saisie manuelle (avec suggestions) plutôt qu'un
   * menu déroulant géant. `true` = champ de saisie par défaut.
   */
  preferManualModel?: boolean;
}
