/**
 * Suite « fournisseurs IA gratuits » : enregistrement dans le catalogue, clé
 * facultative (pas d'en-tête Authorization vide), tri des catalogues mélangés
 * (voix, embeddings, modèles payants) et message d'erreur dédié à la limite
 * gratuite.
 */

import { section, ok, eq } from "../assert";
import { PROVIDERS, getProvider } from "@/lib/ai/providers";
import {
  FREE_LIST_URL,
  FREE_SECTION_PROVIDERS,
  cardInFreeSection,
  FREE_PROVIDERS,
  isFreeListProvider,
  kiloProvider,
  llm7Provider,
  ovhcloudProvider,
} from "@/lib/ai/providers/free";
import { openaiProvider, openrouterProvider } from "@/lib/ai/providers/openai-compat";
import { friendlyError } from "@/lib/ai/coach";
import { missingPermission, permissionLabel } from "@/lib/cloudVoiceProviders";
import {
  freeFallbackModel,
  freeFallbackTargets,
  freeRelayPossible,
  isFreeLimitError,
  setFreeFallbackSource,
  withFreeFallback,
} from "@/lib/ai/freeFallback";

const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key);

export async function run(): Promise<void> {
  section("ai.free.catalogue");
  for (const p of FREE_PROVIDERS) {
    ok(PROVIDERS.includes(p), `${p.id} est dans la liste des fournisseurs`);
    ok(!!p.freeTier?.limits, `${p.id} : limites renseignées`);
    ok(/^[a-z0-9-]+$/.test(p.id), `${p.id} : id accepté par le stockage chiffré des clés`);
    ok(p.fallbackModels.length > 0, `${p.id} : liste de repli hors-ligne`);
  }
  eq(new Set(PROVIDERS.map((p) => p.id)).size, PROVIDERS.length, "ids uniques");
  ok(getProvider("openai")?.freeTier === undefined, "OpenAI n'est pas marqué gratuit");
  ok(!!getProvider("google")?.freeTier && !!getProvider("mistral")?.freeTier, "Google et Mistral marqués gratuits");

  section("ai.free.cle");
  for (const p of [ovhcloudProvider, kiloProvider, llm7Provider]) {
    ok(!p.needsKey && !!p.freeTier?.noKey, `${p.id} : utilisable sans clé`);
    ok(!p.buildHeaders("").some(([k]) => k === "Authorization"), `${p.id} : pas d'Authorization sans clé`);
    ok(p.buildHeaders("abc").some(([k, v]) => k === "Authorization" && v === "Bearer abc"), `${p.id} : clé envoyée si saisie`);
  }
  ok(getProvider("groq")?.needsKey === true, "Groq : clé exigée");
  ok(openaiProvider.buildHeaders("").some(([k]) => k === "Authorization"), "OpenAI : en-tête inchangé");

  section("ai.free.modeles");
  const ovh = ovhcloudProvider
    .parseModels({
      data: [
        "stable-diffusion-xl-base-v10",
        "bge-m3",
        "Qwen3-Embedding-8B",
        "nvr-tts-de-de",
        "whisper-large-v3",
        "Qwen3Guard-Gen-8B",
        "gpt-oss-120b",
        "Mistral-Small-3.2-24B-Instruct-2506",
      ].map((id) => ({ id })),
    })
    .map((m) => m.id);
  eq(ovh, ["gpt-oss-120b", "Mistral-Small-3.2-24B-Instruct-2506"], "OVHcloud : seuls les modèles de chat");
  const kilo = kiloProvider
    .parseModels({ data: [{ id: "kilo-auto/free" }, { id: "x/y:free" }, { id: "anthropic/claude-x" }] })
    .map((m) => m.id);
  eq(kilo, ["kilo-auto/free", "x/y:free"], "Kilo : seuls les modèles gratuits");
  const llm7 = llm7Provider
    .parseModels({
      data: [
        { id: "gpt-oss:20b", tier: "turbo", model_type: "chat" },
        { id: "gpt-6-sol", tier: "pro", model_type: "chat" },
        { id: "whisper-x", tier: "turbo", model_type: "audio_to_text" },
      ],
    })
    .map((m) => m.id);
  eq(llm7, ["gpt-oss:20b"], "LLM7 : palier gratuit et chat seulement");
  ok(openrouterProvider.fallbackModels.some((m) => m.id === "openrouter/free"), "OpenRouter : routeur gratuit en repli");

  section("ai.free.erreur");
  const rate = friendlyError(new Error("HTTP 429: too many"), t, ovhcloudProvider);
  ok(rate.startsWith("coach.errRateFree") && rate.includes("OVHcloud"), "429 gratuit → limite rappelée");
  eq(friendlyError(new Error("HTTP 429: too many"), t, openaiProvider), "coach.errRate", "429 payant inchangé");
  eq(friendlyError(new Error("HTTP 429: too many"), t), "coach.errRate", "sans fournisseur : inchangé");
  eq(friendlyError(new Error("HTTP 401: bad"), t, ovhcloudProvider), "coach.errKey", "401 gratuit : clé");
  // Offre mixte (Z.ai) : limite gratuite seulement sur un modèle gratuit.
  const zai = getProvider("zai")!;
  ok(
    friendlyError(new Error("HTTP 429: x"), t, zai, "glm-4.7-flash").startsWith("coach.errRateFree"),
    "Z.ai, modèle Flash : limite gratuite",
  );
  eq(friendlyError(new Error("HTTP 429: x"), t, zai, "glm-5.3"), "coach.errRate", "Z.ai, modèle payant : message habituel");
  ok(
    friendlyError(new Error("HTTP 429: x"), t, zai).startsWith("coach.errRatePartial"),
    "Z.ai, modèle inconnu : message qui évoque les deux",
  );
  ok(
    friendlyError(new Error("HTTP 429: x"), t, getProvider("google")!, "gemini-x").startsWith("coach.errRatePartial"),
    "Google (modèles gratuits non distinguables) : message qui évoque les deux",
  );

  section("ai.free.offre-mixte");
  for (const id of ["openrouter", "google", "mistral", "huggingface", "zai"]) {
    ok(getProvider(id)?.freeTier?.partial === true, `${id} : offre mixte (« Modèles gratuits »)`);
  }
  for (const id of ["ovhcloud", "kilo", "llm7", "groq"]) {
    ok(!getProvider(id)?.freeTier?.partial, `${id} : entièrement gratuit`);
  }

  section("ai.free.bascule");
  eq(freeFallbackModel(openrouterProvider), "openrouter/free", "OpenRouter : bascule sur le routeur gratuit");
  eq(freeFallbackModel(getProvider("google")!), null, "Google : jamais en bascule (modèle gratuit non garanti)");
  eq(freeFallbackModel(getProvider("mistral")!), null, "Mistral : jamais en bascule");
  eq(freeFallbackModel(openaiProvider), null, "OpenAI : jamais en bascule");
  eq(freeFallbackModel(getProvider("groq")!), "openai/gpt-oss-120b", "Groq : 1er modèle de repli");
  const src = {
    enabled: true,
    configured: ["openai", "google", "openrouter", "ovhcloud", "kilo", "groq"],
    keys: { openai: "o", google: "g", openrouter: "r", ovhcloud: "paid" },
  };
  const fromLlm7 = freeFallbackTargets("llm7", src);
  eq(
    fromLlm7.map((x) => `${x.provider.id}|${x.model}|${x.apiKey}`),
    ["openrouter|openrouter/free|r", "ovhcloud|Mistral-Small-3.2-24B-Instruct-2506|", "kilo|kilo-auto/free|"],
    "cibles : gratuites, configurées, clé facturée retirée, Groq sans clé écarté",
  );
  ok(!freeFallbackTargets("kilo", src).some((x) => x.provider.id === "kilo"), "jamais le fournisseur d'origine");
  eq(freeFallbackTargets("llm7", { ...src, enabled: false }).length, 0, "réglage coupé : aucune bascule");
  ok(isFreeLimitError("HTTP 429: x", ovhcloudProvider, "m"), "429 gratuit = limite");
  ok(isFreeLimitError("HTTP 402: x", openrouterProvider, "openrouter/free"), "402 sur modèle :free = limite");
  ok(!isFreeLimitError("HTTP 429: x", openrouterProvider, "anthropic/claude-x"), "OpenRouter, modèle payant : pas de bascule");
  ok(isFreeLimitError("HTTP 429: x", zai, "glm-4.7-flash"), "Z.ai, modèle Flash = limite");
  ok(!isFreeLimitError("HTTP 429: x", zai, "glm-5.3"), "Z.ai, modèle payant : pas de bascule");
  ok(!isFreeLimitError("HTTP 429: x", getProvider("google")!, "gemini-x"), "Google : jamais de bascule depuis lui");
  ok(!isFreeLimitError("HTTP 429: x", openaiProvider, "m"), "429 payant : pas de bascule");
  ok(!isFreeLimitError("HTTP 500: x", ovhcloudProvider, "m"), "500 : pas de bascule");

  // Réglage affiché seulement si un relais existe vraiment (section gratuite).
  const relay = (configured: string[], keys: Record<string, string> = {}) =>
    freeRelayPossible({ configured, keys });
  ok(!relay(["ovhcloud"]), "un seul fournisseur gratuit : pas de relais");
  ok(!relay(["google", "mistral"], { google: "g", mistral: "m" }), "offres mixtes seules : pas de relais");
  ok(
    !relay(["huggingface", "ovhcloud"], { huggingface: "h" }),
    "Hugging Face (offre mixte indistinguable) → pas de départ de bascule",
  );
  ok(relay(["zai", "ovhcloud"], { zai: "z" }), "Z.ai (modèle Flash) → OVHcloud : relais possible");
  ok(!relay(["zai", "ovhcloud"]), "Z.ai sans clé : inutilisable, pas de relais");
  ok(!relay(["ovhcloud", "groq"]), "Groq sans clé : pas de relais");
  ok(relay(["ovhcloud", "kilo"]), "OVHcloud ↔ Kilo : relais possible");

  section("ai.free.section");
  ok(isFreeListProvider("ovhcloud") && isFreeListProvider("cohere"), "liste gratuite : OVHcloud, Cohere…");
  ok(
    !isFreeListProvider("openrouter") && !isFreeListProvider("google") && !isFreeListProvider("zai"),
    "OpenRouter, Google, Z.ai : section classique",
  );
  ok(PROVIDERS.some((p) => p.id === "zai"), "Z.ai reste disponible (liste classique)");
  // Z.ai, offre mixte, est proposé dans les deux menus ; sa carte suit la section d'ajout.
  ok(FREE_SECTION_PROVIDERS.some((p) => p.id === "zai"), "Z.ai aussi dans le menu gratuit");
  ok(!cardInFreeSection("zai", []), "Z.ai ajouté depuis la liste classique : carte classique");
  ok(cardInFreeSection("zai", ["zai"]), "Z.ai ajouté depuis la section gratuite : carte gratuite");
  ok(cardInFreeSection("ovhcloud", []), "OVHcloud : toujours dans la section gratuite");
  ok(!cardInFreeSection("openai", ["openai"]), "OpenAI : jamais dans la section gratuite");
  ok(FREE_LIST_URL.startsWith("https://github.com/"), "lien vers le projet GitHub");

  setFreeFallbackSource(() => ({ enabled: true, configured: ["ovhcloud", "kilo"], keys: {} }));
  const calls: string[] = [];
  const got = await withFreeFallback({ provider: ovhcloudProvider, model: "m", apiKey: "" }, async (tg) => {
    calls.push(tg.provider.id);
    if (tg.provider.id === "ovhcloud") throw new Error("HTTP 429: limit");
    return `ok:${tg.model}`;
  });
  eq(got, "ok:kilo-auto/free", "429 → réponse du fournisseur suivant");
  eq(calls, ["ovhcloud", "kilo"], "origine puis bascule");
  let thrown = "";
  try {
    await withFreeFallback({ provider: ovhcloudProvider, model: "m", apiKey: "" }, async () => {
      throw new Error("HTTP 401: bad key");
    });
  } catch (e) {
    thrown = (e as Error).message;
  }
  eq(thrown, "HTTP 401: bad key", "autre erreur : relancée telle quelle");
  setFreeFallbackSource(() => ({ enabled: false, configured: [], keys: {} }));

  // Voix en ligne : clé ElevenLabs à droits restreints (message réel du 2026-10-21).
  section("voix-en-ligne.permission");
  const raw =
    'Internal error: HTTP 401: {"detail":{"type":"authentication_error","code":"unauthorized",' +
    '"message":"The API key you used is missing the permission voices_read to execute this operation.",' +
    '"status":"missing_permissions","request_id":"81fdc4115b9106c210b5259f2317bcdf"}}';
  eq(missingPermission(raw), "voices_read", "permission manquante reconnue");
  eq(permissionLabel("voices_read"), "Voices → Read", "libellé de la page des clés ElevenLabs");
  eq(permissionLabel("speech_history_read"), "speech history read", "permission inconnue : lisible");
  eq(missingPermission('HTTP 401: {"detail":{"status":"missing_permissions"}}'), "", "refus sans nom de permission");
  eq(missingPermission('HTTP 401: {"detail":{"status":"invalid_api_key"}}'), null, "clé invalide : autre erreur");
  eq(missingPermission("error sending request"), null, "erreur réseau : autre erreur");
}
