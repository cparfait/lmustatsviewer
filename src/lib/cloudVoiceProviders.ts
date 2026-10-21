/**
 * Fournisseurs de **voix en ligne** (clé de l'utilisateur), sur le modèle des
 * fournisseurs d'IA (`lib/ai/providers`) : chaque fournisseur construit sa
 * requête (URL + en-têtes + corps), Rust la relaie (`tts_cloud_synthesize`) et
 * renvoie l'audio. Ajouter un fournisseur = une entrée ici + son hôte dans la
 * liste blanche de `tts_cloud.rs`.
 *
 * Les voix se choisissent dans la liste du fournisseur (`listVoices`, lue par
 * `tts_cloud_get_json`, ou `staticVoices` quand il n'a pas d'API de liste) ; un
 * identifiant saisi à la main reste accepté : les catalogues évoluent plus vite
 * que l'app.
 */

export type CloudVoiceProviderId = "openai" | "elevenlabs" | "cartesia" | "google";

export interface CloudVoiceRequest {
  url: string;
  headers: [string, string][];
  body: unknown;
}

/** Une voix proposée dans la liste de la Config. */
export interface CloudVoiceOption {
  id: string;
  label: string;
  /** Voix annoncée pour la langue demandée : seules celles-ci sont proposées s'il y en a. */
  match?: boolean;
  /** Locale de la voix (« fr-FR », « fr-CA »…) : filtre par pays dans la Config. */
  locale?: string;
}

export interface CloudVoiceProvider {
  id: CloudVoiceProviderId;
  name: string;
  /** Page où l'utilisateur crée sa clé. */
  keyUrl: string;
  defaultModel: string;
  /** Pas de choix de modèle (la voix le porte, ex. Google) : la ligne est masquée. */
  noModel?: boolean;
  /** Voix par défaut ; vide = l'utilisateur doit en choisir une. */
  defaultVoice: string;
  /** Voix par défaut propre à une langue (prioritaire sur `defaultVoice`). */
  defaultVoiceByLang?: Record<string, string>;
  /** Noms de voix d'exemple (vide = la voix est un identifiant, indice i18n `cloudVoiceVoiceId`). */
  voiceExamples: string;
  /** Catalogue fixe (fournisseur sans API de liste). */
  staticVoices?: CloudVoiceOption[];
  /** Liste paginée des voix via l'API du fournisseur. */
  listVoices?: {
    /** Requête d'une page ; `cursor` = jeton de la page suivante (absent pour la 1ʳᵉ). */
    page(o: { key: string; lang: string; cursor?: string }): { url: string; headers: [string, string][] };
    /** Voix de la page + jeton de la suivante (absent = fin). */
    parse(raw: unknown, lang: string): { voices: CloudVoiceOption[]; next?: string };
  };
  build(o: { text: string; lang: string; model: string; voice: string; rate: number; key: string }): CloudVoiceRequest;
  /** Réponse non audio (JSON avec l'audio en base64, ex. Google) → fichier audio. */
  decodeAudio?(bytes: ArrayBuffer): ArrayBuffer;
}

/** Ton demandé aux modèles qui acceptent une consigne de diction. */
const ENGINEER_STYLE =
  "Race engineer on team radio: calm, concise, confident, slightly fast. Speak in the language of the text.";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Lecture tolérante d'un champ texte d'une réponse JSON. */
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];

function base64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Voix OpenAI (pas d'API de liste) ; marin et cedar annoncées comme les plus naturelles. */
const OPENAI_VOICES = [
  "marin", "cedar", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse", "alloy",
];

/** Locale Google par défaut pour une langue de l'app. */
const GOOGLE_LOCALE: Record<string, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES", de: "de-DE", it: "it-IT" };

export const CLOUD_VOICE_PROVIDERS: CloudVoiceProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4o-mini-tts",
    defaultVoice: "ash",
    voiceExamples: "ash, onyx, echo, coral, sage, verse",
    staticVoices: OPENAI_VOICES.map((v) => ({ id: v, label: v[0].toUpperCase() + v.slice(1) })),
    build: ({ text, model, voice, rate, key }) => ({
      url: "https://api.openai.com/v1/audio/speech",
      headers: [
        ["Authorization", `Bearer ${key}`],
        ["Content-Type", "application/json"],
      ],
      body: {
        model,
        voice,
        input: text,
        response_format: "wav",
        speed: clamp(rate, 0.25, 4),
        // Ignoré par tts-1 / tts-1-hd, suivi par gpt-4o-mini-tts.
        ...(model.startsWith("tts-1") ? {} : { instructions: ENGINEER_STYLE }),
      },
    }),
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    keyUrl: "https://elevenlabs.io/app/settings/api-keys",
    defaultModel: "eleven_flash_v2_5",
    // Voix prédéfinie « George » (multilingue avec les modèles v2.5).
    defaultVoice: "JBFqnCBsd6RMkjVDRZzb",
    voiceExamples: "",
    // Voix du compte (prédéfinies + enregistrées dans la bibliothèque) : toutes
    // parlent les langues des modèles v2.5 ; celles vérifiées pour la langue d'abord.
    listVoices: {
      page: ({ key, cursor }) => ({
        url:
          "https://api.elevenlabs.io/v2/voices?page_size=100&sort=name" +
          (cursor ? `&next_page_token=${encodeURIComponent(cursor)}` : ""),
        headers: [["xi-api-key", key]],
      }),
      parse: (raw, lang) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        const voices = arr(r.voices).map((v) => {
          const labels = (v.labels ?? {}) as Record<string, unknown>;
          const verified = arr(v.verified_languages).find((l) => str(l.language).slice(0, 2) === lang);
          const extra = [str(labels.accent), str(labels.gender), str(v.category)].filter(Boolean).join(", ");
          return {
            id: str(v.voice_id),
            label: extra ? `${str(v.name)} (${extra})` : str(v.name),
            match: !!verified || str(labels.language).slice(0, 2) === lang,
            locale: verified ? str(verified.locale) || undefined : undefined,
          };
        });
        return { voices: voices.filter((v) => v.id), next: r.has_more ? str(r.next_page_token) || undefined : undefined };
      },
    },
    build: ({ text, lang, model, voice, rate, key }) => ({
      url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      headers: [
        ["xi-api-key", key],
        ["Content-Type", "application/json"],
        ["Accept", "audio/mpeg"],
      ],
      body: {
        text,
        model_id: model,
        language_code: lang,
        voice_settings: { speed: clamp(rate, 0.7, 1.2) },
      },
    }),
  },
  {
    id: "cartesia",
    name: "Cartesia",
    keyUrl: "https://play.cartesia.ai/keys",
    // Doc API relue le 2026-10-15 : `sonic-3.6` = modèle recommandé (suit la dernière
    // version stable), 44 langues dont FR/DE/ES/IT ; seule version d'API acceptée :
    // 2026-08-14 ; vitesse dans `generation_config` (0,6-1,5, Sonic 3 et plus).
    defaultModel: "sonic-3.6",
    // Voix choisies par le mainteneur (2026-10-15), une par langue de l'app. `defaultVoice`
    // (voix FR) ne sert que de filet pour une langue absente de la table.
    defaultVoice: "8f1e9d27-96ff-405e-9213-7432a784ac0b",
    defaultVoiceByLang: {
      fr: "8f1e9d27-96ff-405e-9213-7432a784ac0b",
      en: "5ee9feff-1265-424a-9d7f-8e4d431a12c7",
      es: "21c2f7ab-dacb-4847-a593-3cd20668c4b3",
      it: "c8403b5c-6465-4396-9065-a440d376528a",
      de: "b7187e84-fe22-4344-ba4a-bc013fcb533e",
    },
    voiceExamples: "",
    listVoices: {
      page: ({ key, lang, cursor }) => ({
        url:
          `https://api.cartesia.ai/voices?limit=100&language=${encodeURIComponent(lang)}` +
          (cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ""),
        headers: [
          ["Authorization", `Bearer ${key}`],
          ["Cartesia-Version", "2026-08-14"],
        ],
      }),
      // Le filtre `language` de l'API laisse passer des voix d'autres langues
      // (multilingues) : la locale de la voix (`accents[].locale`, à défaut
      // `language`) décide de ce qui est proposé.
      parse: (raw, lang) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        const voices = arr(r.data).map((v) => {
          const accents = arr(v.accents);
          const own = accents.find((a) => str(a.locale).slice(0, 2) === lang) ?? accents[0];
          const locale = str(own?.locale) || str(v.language);
          const tag = str(v.tagline);
          const extra = [locale, str(v.gender)].filter(Boolean).join(", ");
          return {
            id: str(v.id),
            label: `${str(v.name)}${tag ? ` — ${tag}` : ""}${extra ? ` (${extra})` : ""}`,
            match: locale.slice(0, 2).toLowerCase() === lang,
            locale: locale || undefined,
          };
        });
        return { voices: voices.filter((v) => v.id), next: r.has_more ? str(r.next_page) || undefined : undefined };
      },
    },
    build: ({ text, lang, model, voice, rate, key }) => ({
      url: "https://api.cartesia.ai/tts/bytes",
      headers: [
        ["Authorization", `Bearer ${key}`],
        ["Cartesia-Version", "2026-08-14"],
        ["Content-Type", "application/json"],
      ],
      body: {
        model_id: model,
        transcript: text,
        voice: { id: voice },
        output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
        language: lang,
        generation_config: { speed: clamp(rate, 0.6, 1.5) },
      },
    }),
  },
  {
    id: "google",
    name: "Google Cloud",
    // Clé d'API d'un projet Google Cloud où l'API « Cloud Text-to-Speech » est activée.
    keyUrl: "https://console.cloud.google.com/apis/credentials",
    defaultModel: "",
    noModel: true,
    // Voix « Chirp 3 HD » (les plus naturelles de Google) ; le nom porte la langue.
    defaultVoice: "en-GB-Chirp3-HD-Charon",
    defaultVoiceByLang: Object.fromEntries(
      Object.entries(GOOGLE_LOCALE).map(([lang, loc]) => [lang, `${loc}-Chirp3-HD-Charon`]),
    ),
    voiceExamples: "",
    listVoices: {
      page: ({ key, lang }) => ({
        url: `https://texttospeech.googleapis.com/v1/voices?languageCode=${encodeURIComponent(lang)}`,
        headers: [["X-Goog-Api-Key", key]],
      }),
      parse: (raw, lang) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        const voices = arr(r.voices)
          .filter((v) => arr(v.languageCodes).length === 0 || (v.languageCodes as string[]).some((c) => c.startsWith(lang)))
          .map((v) => {
            const name = str(v.name);
            const gender = str(v.ssmlGender).toLowerCase();
            const locale = str(arr(v.languageCodes)[0]) || name.split("-").slice(0, 2).join("-");
            return {
              id: name,
              label: gender ? `${name} (${gender})` : name,
              match: locale.slice(0, 2) === lang,
              locale,
            };
          });
        // Chirp 3 HD (les plus naturelles) en tête, puis les autres.
        const hd = (v: CloudVoiceOption) => (v.id.includes("Chirp3-HD") ? 0 : 1);
        return { voices: voices.filter((v) => v.id).sort((a, b) => hd(a) - hd(b)) };
      },
    },
    build: ({ text, lang, voice, rate, key }) => ({
      url: "https://texttospeech.googleapis.com/v1/text:synthesize",
      headers: [
        ["X-Goog-Api-Key", key],
        ["Content-Type", "application/json"],
      ],
      body: {
        input: { text },
        // « fr-FR-Chirp3-HD-Charon » → locale « fr-FR ».
        voice: { languageCode: voice.split("-").slice(0, 2).join("-") || GOOGLE_LOCALE[lang] || lang, name: voice },
        audioConfig: { audioEncoding: "MP3", speakingRate: clamp(rate, 0.25, 2) },
      },
    }),
    decodeAudio: (bytes) => {
      const json = JSON.parse(new TextDecoder().decode(bytes)) as { audioContent?: string };
      if (!json.audioContent) throw new Error("réponse sans audio");
      return base64ToBytes(json.audioContent);
    },
  },
];

/** Voix par défaut du fournisseur pour une langue (code 2 lettres). */
export function providerDefaultVoice(p: CloudVoiceProvider, lang?: string): string {
  const code = (lang ?? "").slice(0, 2).toLowerCase();
  return p.defaultVoiceByLang?.[code] ?? p.defaultVoice;
}

export function getCloudVoiceProvider(id: string): CloudVoiceProvider {
  return CLOUD_VOICE_PROVIDERS.find((p) => p.id === id) ?? CLOUD_VOICE_PROVIDERS[0];
}

/**
 * Clé API à droits restreints : permission manquante signalée par le fournisseur
 * (ElevenLabs : `"status":"missing_permissions"`, « The API key you used is
 * missing the permission voices_read… »). Renvoie l'identifiant de la permission,
 * `""` si le refus ne la nomme pas, `null` si ce n'est pas ce type d'erreur.
 */
export function missingPermission(raw: string): string | null {
  if (!/missing_permissions|missing the permission/i.test(raw)) return null;
  return /missing the permission ([a-z_]+)/i.exec(raw)?.[1] ?? "";
}

/** Libellés des permissions tels qu'affichés sur la page des clés API d'ElevenLabs. */
const PERMISSION_LABELS: Record<string, string> = {
  voices_read: "Voices → Read",
  voices_write: "Voices → Write",
  text_to_speech: "Text to Speech",
  models_read: "Models → Read",
  user_read: "User → Read",
};

/** Libellé lisible d'une permission (`voices_read` → « Voices → Read »). */
export function permissionLabel(perm: string): string {
  return PERMISSION_LABELS[perm] ?? perm.replace(/_/g, " ");
}
