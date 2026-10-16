/**
 * Répondre à une question posée à l'ingénieur — logique **unique** partagée par
 * la touche « Parler à l'ingénieur », l'ancienne touche « Parler » du spotter, le
 * mot déclencheur et le bouton « Tester l'ingénieur » de la Config.
 *
 * Ordre de décision (le local d'abord : instantané, gratuit, chiffres exacts) :
 *  1. commandes (alerte « préviens-moi », répète, coupure, accusés, régimes radio) ;
 *  2. intention reconnue par le routeur (tournures naturelles) ;
 *  3. **liste des commandes** (phrases éditables de la Config) : sur la dictée
 *     libre, puis sur la reconnaissance stricte de la même prise de parole ;
 *  4. Coach IA pour une question ouverte, s'il est configuré ;
 *  5. sans IA : meilleure supposition locale, sinon le point de course.
 * La reconnaissance « stricte seule » reproduit l'ancienne touche du spotter.
 */

import { emit } from "@tauri-apps/api/event";
import type { TFunction } from "i18next";
import { useAppStore } from "@/stores/app";
import { live, type LiveData } from "@/lib/api";
import { effectivePitLoss } from "@/lib/lmuRest";
import { announce, announceAnswer, cancelSpeech, repeatLast } from "@/lib/voice";
import { getProvider } from "@/lib/ai/providers";
import { askCoachVoice, classifyIntent, friendlyError } from "@/lib/ai/coach";
import { buildStatus } from "@/lib/spotter";
import { route, INTENT_HELP, extractEntities, normalize, type AnswerIntent } from "@/lib/engineer/router";
import { answerIntent, registerWatch } from "@/lib/engineer/answers";
import { buildLiveCoachContext } from "@/lib/ai/context/records-context";
import { coachRecentDiagnostics, type RecentDiag } from "@/lib/coach";
import { commandFromPhrases, isAction } from "@/lib/engineer/commandPick";
import { toast, toastSuccess } from "@/stores/dialogs";

/**
 * Fournisseur / modèle / clé réellement utilisés par le coach **vocal**.
 *
 * Le vocal peut tourner sur un fournisseur DISTINCT de celui de l'analyse
 * (`aiVoiceProvider` non vide) : il faut alors sa propre clé et son propre
 * modèle, sans repli sur ceux de l'analyse. Sinon : même fournisseur, modèle
 * vocal (plus rapide) s'il est défini et le modèle d'analyse à défaut.
 */
export function resolveVoiceTarget(st: {
  aiProvider: string;
  aiModel: string;
  aiVoiceProvider: string;
  aiVoiceModel: string;
  aiProviderKeys: Record<string, string>;
}) {
  const separate = st.aiVoiceProvider !== "";
  const providerId = separate ? st.aiVoiceProvider : st.aiProvider;
  return {
    provider: getProvider(providerId),
    model: separate ? st.aiVoiceModel : st.aiVoiceModel || st.aiModel,
    apiKey: st.aiProviderKeys[providerId] ?? "",
  };
}

/** Retire un markdown léger pour la lecture vocale. */
function stripMd(s: string): string {
  return s
    .replace(/[*_`#>]/g, "")
    .replace(/\n{2,}/g, ". ")
    .trim();
}

/** Formule un diagnostic récent en une ligne neutre (matière du « pourquoi ? »). */
function diagLine(d: RecentDiag): string {
  const m = Math.round(d.magnitude);
  const t = `T${d.n}`;
  switch (d.code) {
    case "lockup":
      return `${t}: brake lockup on entry`;
    case "wheelspin":
      return `${t}: wheelspin on exit`;
    case "consistency":
      return `${t}: inconsistent braking point`;
    case "brake-timing":
      return d.sign >= 0 ? `${t}: braking ${m} m too late` : `${t}: braking ${m} m too early`;
    case "over-slow":
      return `${t}: ${m} km/h too slow at apex`;
    case "entry-too-fast":
      return `${t}: entering too fast, exit compromised`;
    case "late-throttle":
      return `${t}: ${m} m late back to full throttle`;
    case "grip-unused":
      return `${t}: available grip not fully used`;
    case "no-trail":
      return `${t}: brake released too early (no trail braking)`;
    default:
      return `${t}: ${d.code}`;
  }
}

/** Bloc « coaching récent par virage » joint au contexte de l'IA (« pourquoi ? »). */
function recentDiagnosticsBlock(): string {
  const diags = coachRecentDiagnostics();
  if (diags.length === 0) return "";
  const lines = diags.map((d) => `- ${diagLine(d)} (lap ${d.lapNum})`).join("\n");
  return `--- Recent per-corner coaching (oldest first; use it to answer "why?") ---\n${lines}`;
}

export { isAction };

export interface AskOptions {
  lang: string;
  t: TFunction;
  /** `auto` = comportement réel ; `local` = comme sans IA ; `ai` = force le Coach IA. */
  mode?: "auto" | "local" | "ai";
  /** Reconnaissance stricte de la même prise de parole (liste des commandes). */
  strict?: string;
  /** Test depuis la Config : les commandes sont reconnues mais **pas exécutées**. */
  dryRun?: boolean;
  /** Arrêt demandé (démontage) : rien n'est dit après coup. */
  disposed?: () => boolean;
}

export interface AskResult {
  /** Ce que l'ingénieur a dit (ou aurait dit). */
  text: string;
  /** Qui a répondu. */
  via: "command" | "local" | "phrases" | "ai" | "fallback" | "none";
}

/** Libellé d'une commande pour le test (« Commande reconnue : … »). */
function commandLabel(t: TFunction, id: string): string {
  const key = `config.spotterCmd${id[0].toUpperCase()}${id.slice(1)}`;
  const label = t(key);
  return label === key ? id : label.split(" (")[0];
}

/** La question peut porter sur les plaquettes (intention, supposition ou candidate). */
function aboutPads(r: ReturnType<typeof route>): boolean {
  return r.intent === "brakeWear" || r.guess === "brakeWear" || r.candidates.includes("brakeWear");
}

/**
 * Au garage, le pont REST ne lit plus l'état de la voiture en continu (LMU peut
 * planter sur ses écrans) : pour « plaquettes ? », lecture ponctuelle (côté Rust :
 * joueur dans son box, au plus une toutes les 30 s). Sinon, `data` inchangé.
 */
async function withGamePads(data: LiveData | null): Promise<LiveData | null> {
  if (!data?.rest || data.rest.vehicle.state === "fresh") return data;
  const vehicle = await live.vehicleCondition().catch(() => null);
  return vehicle ? { ...data, rest: { ...data.rest, vehicle } } : data;
}

/**
 * Répond à `question` (dictée libre) : parle, affiche, et renvoie la réponse.
 * Mode « stricte seule » (réglage) : seule la reconnaissance stricte compte,
 * comme l'ancienne touche du spotter (non reconnu → le point de course).
 */
export async function askEngineer(question: string, o: AskOptions): Promise<AskResult> {
  const { lang, t } = o;
  const mode = o.mode ?? "auto";
  const st0 = useAppStore.getState();
  const strictOnly = st0.pttRecognition === "strict" && mode === "auto" && o.strict !== undefined;
  const free = strictOnly ? "" : question.trim();
  const strict = (o.strict ?? "").trim();
  const heard = free || strict;
  const gone = () => o.disposed?.() ?? false;

  const say = (text: string, via: AskResult["via"]): AskResult => {
    if (!gone() && text) {
      announceAnswer(text, lang);
      toastSuccess(text);
      void emit("coach-voice", { question: heard, answer: text });
    }
    return { text, via };
  };

  if (!heard) {
    const text = t("coach.voiceUnclear");
    if (!gone()) announce(text, lang);
    return { text, via: "none" };
  }
  // La question reconnue s'affiche (l'utilisateur voit si la dictée a mal compris).
  toast(`🎤 ${heard}`);
  void emit("coach-voice", { question: heard, answer: null });
  const r = route(free, lang);
  let data = await live.getData().catch(() => null);
  if (aboutPads(r)) data = await withGamePads(data);

  const norm = r.norm || normalize(strict, lang);
  const opts = {
    pitLossSec: effectivePitLoss(data, st0.pitLossSeconds, st0.pitLaneLoss),
    fuelReserveLaps: st0.fuelReserveLaps,
    classPositions: st0.classPositions,
    entities: r.norm ? r.entities : extractEntities(norm, lang),
    norm,
  };

  // Exécute (ou, en test, annonce seulement) une intention locale.
  const runIntent = (id: AnswerIntent, via: AskResult["via"]): AskResult => {
    if (o.dryRun && isAction(id)) return say(t("config.engineerTestCommand", { name: commandLabel(t, id) }), "command");
    if (id === "repeat") {
      if (!repeatLast()) return say(buildStatus(data, t, st0.classPositions), via);
      return { text: "", via: "command" };
    }
    if (id === "mute") {
      const next = !useAppStore.getState().voiceAnnouncements;
      void useAppStore.getState().setVoiceAnnouncements(next);
      if (next) announce(t("live.spUnmuted"), lang);
      else cancelSpeech();
      return { text: next ? t("live.spUnmuted") : "", via: "command" };
    }
    if (id === "watch") return say(registerWatch(r.watch, r.entities, r.norm, data, t), "command");
    return say(answerIntent(id, data, t, opts), via);
  };

  // ── 1. Commandes et réponses locales ────────────────────────────────────────
  if (r.intent === "watch" || r.intent === "repeat" || r.intent === "mute") return runIntent(r.intent, "command");

  const { provider: p, model, apiKey } = resolveVoiceTarget(st0);
  const configured = !!p && !!model && (!p.needsKey || !!apiKey);
  const aiReady = mode !== "local" && st0.aiCoachEnabled && configured;
  const control = !!r.intent && isAction(r.intent);

  if (mode === "ai" && !aiReady) {
    return say(t(st0.aiCoachEnabled && !configured ? "coach.voiceNotConfigured" : "coach.voiceNoAi"), "none");
  }
  if (r.intent && (control || (mode !== "ai" && (st0.localAnswers || !aiReady)))) {
    return runIntent(r.intent, control ? "command" : "local");
  }
  // ── 2. Liste des commandes (phrases de la Config), libre puis stricte ──────
  if (mode !== "ai" && !r.ambiguous) {
    const cmd = commandFromPhrases(strictOnly ? "" : free, strict, lang, aiReady);
    if (cmd) return runIntent(cmd, "phrases");
  }
  if (strictOnly) return say(buildStatus(data, t, st0.classPositions), "fallback");

  // ── 3. Sans IA : toujours une réponse locale ───────────────────────────────
  if (!aiReady || !p) {
    toast(t(st0.aiCoachEnabled && !configured ? "coach.voiceNotConfigured" : "coach.voiceNoAi"));
    const guess = r.ambiguous && r.candidates.length ? r.candidates[0] : r.guess;
    if (guess && !isAction(guess)) return runIntent(guess, "local");
    return say(`${t("coach.voiceLocalFallback")} ${buildStatus(data, t, st0.classPositions)}`, "fallback");
  }

  // ── 4. Coach IA ─────────────────────────────────────────────────────────────
  try {
    // Accusé immédiat : l'appel IA prend 1 à 3 s, le pilote sait qu'on a entendu.
    if (!gone()) announce(t(`coach.voiceAck${1 + Math.floor(Math.random() * 3)}`), lang);
    if (mode !== "ai" && st0.localAnswers && r.ambiguous && r.candidates.length) {
      const help: Record<string, string> = {};
      for (const id of r.candidates) if (INTENT_HELP[id]) help[id] = INTENT_HELP[id]!;
      const picked = await classifyIntent({ provider: p, model, apiKey, question: free, intents: help }).catch(
        () => null,
      );
      if (picked) return runIntent(picked as AnswerIntent, "local");
    }
    // Sans données live, l'appel échoue comme avant (message d'erreur lisible).
    const baseCtx = await buildLiveCoachContext(data ?? (await live.getData()), free);
    const recent = recentDiagnosticsBlock();
    const ctx = recent ? `${baseCtx}\n\n${recent}` : baseCtx;
    const answer = await askCoachVoice({
      provider: p,
      model,
      apiKey,
      lang,
      question: free,
      contextText: ctx,
      systemOverride: useAppStore.getState().aiSystemPromptByLang[lang.slice(0, 2).toLowerCase()] ?? "",
    });
    return say(stripMd(answer), "ai");
  } catch (e) {
    const text = friendlyError(e, t);
    if (!gone()) announce(text, lang);
    return { text, via: "none" };
  }
}
