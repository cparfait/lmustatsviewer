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

/**
 * Élément décodé d'une ligne de flux (SSE / NDJSON).
 *
 * Les parseurs ne renvoyaient qu'un texte ou `null`, si bien que **tout le reste
 * était jeté en silence** : un événement d'erreur émis en cours de flux (un 529
 * « overloaded » d'Anthropic, un objet `{"error":…}` renvoyé dans un corps HTTP
 * 200 par certaines passerelles), ou une fin anticipée (`max_tokens` atteint,
 * réponse bloquée par un filtre de sécurité). L'utilisateur voyait alors une
 * réponse vide ou tronquée, sans la moindre explication — et en analyse
 * complète, le bloc d'objectifs, placé en fin de réponse, disparaissait.
 */
export type StreamChunk =
  /** Fragment de texte à concaténer. */
  | { kind: "text"; text: string }
  /** Erreur signalée **dans** le flux : la génération s'arrête là. */
  | { kind: "error"; message: string }
  /** Fin anticipée (`max_tokens`, filtre de sécurité…) : le texte est tronqué. */
  | { kind: "stop"; reason: string };

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

/**
 * Offre gratuite permanente d'un fournisseur (sans carte bancaire). Sert à
 * l'étiquette « Gratuit » du catalogue et aux précisions affichées à l'ajout :
 * limites, clé facultative, usage des requêtes. Les chiffres viennent des pages
 * publiques des fournisseurs et changent souvent : on les affiche comme des
 * ordres de grandeur, jamais comme une garantie.
 */
export interface FreeTierInfo {
  /** Limites indicatives, non traduites (« 30 req/min · 1 000 req/jour »). */
  limits: string;
  /** Utilisable sans compte ni clé ; une clé gratuite relève seulement les limites. */
  noKey?: boolean;
  /** Les requêtes gratuites peuvent servir à entraîner les modèles du fournisseur. */
  mayTrain?: boolean;
  /** Les requêtes gratuites peuvent être journalisées par le fournisseur ou l'hébergeur. */
  mayLog?: boolean;
  /** Hébergé dans l'Union européenne. */
  eu?: boolean;
  /** Offre gratuite réservée à un usage non commercial. */
  nonCommercial?: boolean;
  /**
   * Offre MIXTE : seuls certains modèles (ou un quota) sont gratuits, le reste
   * est facturé (OpenRouter, Google, Mistral…). Étiquette « Modèles gratuits »
   * au lieu de « Gratuit ».
   */
  partial?: boolean;
  /** Avec une clé, l'usage est facturé (OVHcloud) : la bascule n'envoie pas la clé. */
  keyBills?: boolean;
  /**
   * Modèle sûrement gratuit utilisé par la bascule automatique. Obligatoire pour
   * une offre mixte (sinon le fournisseur n'est jamais pris en bascule : on ne
   * risque pas de facturer le pilote) ; à défaut, 1er modèle de repli.
   */
  fallbackModel?: string;
  /**
   * Offre mixte : vrai si ce modèle est un des modèles gratuits. Une limite
   * atteinte n'est rattachée à l'offre gratuite (et ne déclenche la bascule)
   * que sur un modèle gratuit ; sur un modèle payant, c'est le forfait du
   * pilote. Absent = on ne sait pas distinguer → jamais de bascule depuis lui.
   */
  isFreeModel?: (modelId: string) => boolean;
}

export interface AIProvider {
  /** Identifiant interne stable (clé de config `ai_provider`). */
  id: string;
  /** Nom affichable. */
  name: string;
  /** Faux pour Ollama (local, aucune clé requise) et les offres gratuites sans clé. */
  needsKey: boolean;
  /** Offre gratuite permanente (étiquette « Gratuit » + précisions). Optionnel. */
  freeTier?: FreeTierInfo;
  /** Page de création de la clé API (lien « Obtenir une clé ») ; à défaut `docsUrl`. */
  keyUrl?: string;
  /**
   * Fournisseur personnalisé (défini par l'utilisateur). Sa clé API est propre
   * au fournisseur (`aiCustomKeys[id]`) au lieu du créneau global `aiApiKey`.
   */
  custom?: boolean;

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
  /**
   * Corps de repli quand `buildBody` a été refusé en HTTP 400 : le même sans les
   * options facultatives (ex. raisonnement coupé, refusé par un modèle dont le
   * raisonnement est obligatoire). `null` = pas de repli. Optionnel.
   */
  fallbackBody?(body: unknown): unknown | null;

  /** Extrait le texte de la réponse chat (non-streaming). */
  parseResponse(raw: unknown): string;
  /**
   * Décode une ligne de flux (SSE/NDJSON) : texte, erreur, ou fin anticipée.
   * `null` pour les lignes sans intérêt (`event:`, `[DONE]`, keep-alive…).
   */
  parseStreamChunk(line: string): StreamChunk | null;
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
   * Vrai si l'id correspond à une génération retirée par le fournisseur. Sert
   * à alerter dans la page Config : un modèle choisi il y a des mois reste
   * enregistré et n'échoue qu'au premier appel, sans indice sur la cause.
   * Optionnel : à n'implémenter que pour les fournisseurs qui retirent
   * franchement leurs anciens modèles (Google). Un motif incomplet ne fait
   * jamais de faux positif — au pire, pas d'avertissement.
   */
  isRetiredModel?(id: string): boolean;
}
