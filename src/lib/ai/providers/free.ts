/**
 * Fournisseurs à offre gratuite permanente (sans carte bancaire), tous
 * compatibles OpenAI (`/chat/completions` + `/models`).
 *
 * Sélection faite d'après la liste publique « awesome-free-llm-apis »
 * (github.com/mnfst/awesome-free-llm-apis, état d'octobre 2026). Écartés :
 * Cloudflare Workers AI (l'URL contient l'identifiant de compte → à ajouter en
 * fournisseur personnalisé), ModelScope et SiliconFlow (vérification d'identité
 * réservée aux pièces chinoises), Aion Labs (20 000 tokens/jour, spécialisé jeu
 * de rôle : une seule analyse post-course les épuise).
 *
 * Trois services répondent **sans compte ni clé** (vérifié par un appel réel
 * le 2026-10-21) : OVHcloud AI Endpoints, Kilo Gateway et LLM7. Une clé y reste
 * facultative (elle relève les limites). Les listes de repli ne servent que
 * hors-ligne : la vraie liste vient de `/models`.
 */

import { makeOpenAICompatProvider } from "./openai-compat";

/** Inférence très rapide (puces LPU) : idéale pour le coach vocal. */
export const groqProvider = makeOpenAICompatProvider({
  id: "groq",
  name: "Groq",
  chatEndpoint: "https://api.groq.com/openai/v1/chat/completions",
  modelsEndpoint: "https://api.groq.com/openai/v1/models",
  freeTier: { limits: "30 req/min · 1 000 req/jour" },
  keyUrl: "https://console.groq.com/keys",
  fallbackModels: [
    { id: "openai/gpt-oss-120b", label: "gpt-oss-120b" },
    { id: "openai/gpt-oss-20b", label: "gpt-oss-20b" },
    { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B" },
  ],
  docsUrl: "https://console.groq.com/docs/models",
});

/** Plus de 100 modèles ; gratuit avec le programme développeur NVIDIA. */
export const nvidiaProvider = makeOpenAICompatProvider({
  id: "nvidia",
  name: "NVIDIA NIM",
  chatEndpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
  modelsEndpoint: "https://integrate.api.nvidia.com/v1/models",
  freeTier: { limits: "40 req/min par modèle", mayLog: true },
  keyUrl: "https://build.nvidia.com/settings/api-keys",
  fallbackModels: [
    { id: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super 120B" },
    { id: "google/gemma-4-31b-it", label: "Gemma 4 31B" },
    { id: "openai/gpt-oss-20b", label: "gpt-oss-20b" },
  ],
  docsUrl: "https://build.nvidia.com/models",
});

/** Routeur vers des milliers de modèles ouverts ; petit crédit mensuel offert. */
export const huggingfaceProvider = makeOpenAICompatProvider({
  id: "huggingface",
  name: "Hugging Face",
  chatEndpoint: "https://router.huggingface.co/v1/chat/completions",
  modelsEndpoint: "https://router.huggingface.co/v1/models",
  freeTier: { limits: "petit crédit mensuel offert", partial: true },
  keyUrl: "https://huggingface.co/settings/tokens",
  fallbackModels: [
    { id: "meta-llama/Llama-3.1-8B-Instruct", label: "Llama 3.1 8B" },
    { id: "Qwen/Qwen2.5-7B-Instruct", label: "Qwen 2.5 7B" },
  ],
  docsUrl: "https://huggingface.co/inference/models",
});

/**
 * Modèles GLM « Flash » gratuits (plateforme internationale z.ai), les autres
 * payants : offre mixte, proposée dans les DEUX listes (classique et gratuite,
 * cf. `DUAL_SECTION_IDS`). Enregistrée avec les classiques (`index.ts`).
 */
export const zaiProvider = makeOpenAICompatProvider({
  id: "zai",
  name: "Z.ai (GLM)",
  chatEndpoint: "https://api.z.ai/api/paas/v4/chat/completions",
  modelsEndpoint: "https://api.z.ai/api/paas/v4/models",
  // Seuls les modèles « Flash » sont gratuits.
  freeTier: {
    limits: "1 requête à la fois (modèles Flash)",
    partial: true,
    fallbackModel: "glm-4.7-flash",
    isFreeModel: (id) => /flash/i.test(id),
  },
  keyUrl: "https://z.ai/manage-apikey/apikey-list",
  fallbackModels: [
    { id: "glm-4.7-flash", label: "GLM-4.7-Flash" },
    { id: "glm-4.6v-flash", label: "GLM-4.6V-Flash" },
  ],
  docsUrl: "https://docs.z.ai/guides/overview/pricing",
});

/** Clé d'essai gratuite, usage non commercial (point d'accès compatible OpenAI). */
export const cohereProvider = makeOpenAICompatProvider({
  id: "cohere",
  name: "Cohere",
  chatEndpoint: "https://api.cohere.ai/compatibility/v1/chat/completions",
  modelsEndpoint: "https://api.cohere.ai/compatibility/v1/models",
  freeTier: { limits: "20 req/min · 1 000 appels/mois", nonCommercial: true },
  keyUrl: "https://dashboard.cohere.com/api-keys",
  fallbackModels: [
    { id: "command-a-03-2025", label: "Command A" },
    { id: "command-r7b-12-2024", label: "Command R7B" },
  ],
  docsUrl: "https://docs.cohere.com/docs/models",
});

/** Grands modèles ouverts hébergés par Ollama (distinct d'Ollama en local). */
export const ollamaCloudProvider = makeOpenAICompatProvider({
  id: "ollama-cloud",
  name: "Ollama Cloud",
  chatEndpoint: "https://ollama.com/v1/chat/completions",
  modelsEndpoint: "https://ollama.com/v1/models",
  freeTier: { limits: "quotas par session (5 h) et par semaine" },
  keyUrl: "https://ollama.com/settings/keys",
  fallbackModels: [
    { id: "gpt-oss:120b", label: "gpt-oss 120B" },
    { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    { id: "qwen3.5:397b", label: "Qwen 3.5 397B" },
  ],
  docsUrl: "https://ollama.com/search?c=cloud",
});

/**
 * Sans compte ni clé, hébergé en France (UE). 2 requêtes/min par modèle et par
 * adresse IP : suffisant pour l'analyse post-course, juste pour le vocal.
 */
export const ovhcloudProvider = makeOpenAICompatProvider({
  id: "ovhcloud",
  name: "OVHcloud AI Endpoints",
  chatEndpoint: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions",
  modelsEndpoint: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models",
  keyOptional: true,
  // Avec une clé, l'usage est facturé au token : la bascule appelle sans clé.
  freeTier: {
    limits: "2 req/min par modèle (sans clé)",
    noKey: true,
    eu: true,
    keyBills: true,
    fallbackModel: "Mistral-Small-3.2-24B-Instruct-2506",
  },
  fallbackModels: [
    { id: "Mistral-Small-3.2-24B-Instruct-2506", label: "Mistral Small 3.2 24B" },
    { id: "gpt-oss-120b", label: "gpt-oss-120b" },
    { id: "Meta-Llama-3_3-70B-Instruct", label: "Llama 3.3 70B" },
    { id: "Qwen3.5-397B-A17B", label: "Qwen 3.5 397B" },
  ],
  docsUrl: "https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/",
});

/**
 * Passerelle sans clé vers un lot de modèles gratuits qui change souvent ;
 * `kilo-auto/free` choisit lui-même un modèle disponible. Seuls les modèles
 * gratuits sont listés (le reste du catalogue est payant).
 */
export const kiloProvider = makeOpenAICompatProvider({
  id: "kilo",
  name: "Kilo Gateway",
  chatEndpoint: "https://api.kilo.ai/api/gateway/chat/completions",
  modelsEndpoint: "https://api.kilo.ai/api/gateway/models",
  keyOptional: true,
  freeTier: {
    limits: "200 req/heure (sans clé)",
    noKey: true,
    mayLog: true,
    fallbackModel: "kilo-auto/free",
  },
  keyUrl: "https://app.kilo.ai/profile",
  modelFilter: (id) => id.endsWith(":free") || id.endsWith("/free"),
  fallbackModels: [
    { id: "kilo-auto/free", label: "kilo-auto/free (routeur gratuit)" },
    { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B" },
  ],
  docsUrl: "https://kilo.ai/docs/gateway/models-and-providers",
});

/**
 * Passerelle sans clé ; un jeton gratuit relève les limites mais donne accès
 * aux mêmes modèles (palier `turbo`). Les modèles `pro` (payants) sont masqués.
 */
export const llm7Provider = makeOpenAICompatProvider({
  id: "llm7",
  name: "LLM7.io",
  chatEndpoint: "https://api.llm7.io/v1/chat/completions",
  modelsEndpoint: "https://api.llm7.io/v1/models",
  keyOptional: true,
  freeTier: {
    limits: "60 req/min · 250 req/heure (jeton gratuit)",
    noKey: true,
    fallbackModel: "gpt-oss:20b",
  },
  keyUrl: "https://token.llm7.io",
  rawModelFilter: (m) =>
    (m.tier === undefined || m.tier === "turbo") &&
    (m.model_type === undefined || m.model_type === "chat"),
  fallbackModels: [
    { id: "gpt-oss:20b", label: "gpt-oss 20B" },
    { id: "mistral-Nemo-Instruct-2407", label: "Mistral Nemo" },
    { id: "DeepSeek-V4-Flash-0731", label: "DeepSeek V4 Flash" },
  ],
  docsUrl: "https://docs.llm7.io/guides/models-api",
});

/** Projet communautaire d'où vient la sélection (mis en avant dans la page Config). */
export const FREE_LIST_URL = "https://github.com/mnfst/awesome-free-llm-apis";

/**
 * Fournisseurs de la section gratuite, dans l'ordre d'affichage. Z.ai (offre
 * mixte) n'y figure pas : il est dans la liste classique.
 */
export const FREE_PROVIDERS = [
  ovhcloudProvider,
  kiloProvider,
  llm7Provider,
  groqProvider,
  nvidiaProvider,
  ollamaCloudProvider,
  huggingfaceProvider,
  cohereProvider,
];

/** Vrai pour un fournisseur de la liste gratuite (section dédiée de la page Config). */
export function isFreeListProvider(id: string): boolean {
  return FREE_PROVIDERS.some((p) => p.id === id);
}

/**
 * Offres mixtes proposées dans les deux listes d'ajout (classique et gratuite).
 * Un fournisseur ne s'ajoute qu'une fois : sa carte s'affiche dans la section
 * d'où il a été ajouté (`ai_free_section_ids`, cf. `cardInFreeSection`).
 */
export const DUAL_SECTION_IDS = ["zai"];

/** Menu d'ajout de la section gratuite : la liste gratuite + Z.ai (après Ollama Cloud). */
export const FREE_SECTION_PROVIDERS = [
  ovhcloudProvider,
  kiloProvider,
  llm7Provider,
  groqProvider,
  nvidiaProvider,
  ollamaCloudProvider,
  zaiProvider,
  huggingfaceProvider,
  cohereProvider,
];

/** Vrai si la carte de `id` va dans la section gratuite (`addedFromFree` : ids ajoutés depuis elle). */
export function cardInFreeSection(id: string, addedFromFree: string[]): boolean {
  if (isFreeListProvider(id)) return true;
  return DUAL_SECTION_IDS.includes(id) && addedFromFree.includes(id);
}
