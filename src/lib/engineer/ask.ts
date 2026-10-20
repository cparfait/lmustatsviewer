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
 *  5. sans IA : meilleure supposition locale, sinon « pas compris » (ou « vérifie
 *     que le coach IA est bien branché » s'il est activé mais incomplet).
 * La reconnaissance « stricte seule » reproduit l'ancienne touche du spotter.
 */

import { emit } from "@tauri-apps/api/event";
import type { TFunction } from "i18next";
import { useAppStore } from "@/stores/app";
import { live, type LiveData } from "@/lib/api";
import { effectivePitLoss } from "@/lib/lmuRest";
import { announceAnswer, cancelSpeech, repeatLast } from "@/lib/voice";
import { getProvider } from "@/lib/ai/providers";
import { askCoachVoice, classifyIntent, errorMessage, friendlyError } from "@/lib/ai/coach";
import { sampleLiveData } from "@/components/overlay/sampleData";
import { aiErrorKind, type AiErrorKind } from "@/lib/ai/errorKind";
import { VariantPicker } from "@/lib/engineer/variants";
import { noAnswerKey, radioErrorKey } from "@/lib/engineer/radioErrors";
import { buildStatus } from "@/lib/spotter";
import { route, INTENT_HELP, extractEntities, normalize, type AnswerIntent } from "@/lib/engineer/router";
import { radioLog, type Rating } from "@/lib/engineer/radioFeedback";

const RATING_OF: Record<string, Rating> = {
  rateUseful: "useful",
  rateUseless: "useless",
  rateLate: "late",
  rateWrong: "wrong",
};
import { answerIntent, registerWatch } from "@/lib/engineer/answers";
import { buildLiveCoachContext } from "@/lib/ai/context/records-context";
import { coachRecentDiagnostics, type RecentDiag } from "@/lib/coach";
import { commandFromPhrases, isAction } from "@/lib/engineer/commandPick";
import { toast, toastError, toastSuccess } from "@/stores/dialogs";
import { factsBlock } from "@/lib/ai/facts";
import { radioCard } from "@/lib/ai/knowledge/engineering-cards";
import { PIT_CMDS, runPitCommand, type PitCmd } from "@/lib/engineer/pitVoice";
import { parseAlarm } from "@/lib/engineer/alarm";
import { engineer } from "@/lib/engineer/state";
import { saveNoteHere } from "@/lib/useVoiceNotes";
import { cornerNamesBlock } from "@/lib/ai/knowledge/corner-names";
import { usesRadioPrompt } from "@/lib/ai/prompts/radio";
import { checkVoiceAnswer, repairVoiceAnswer, type GuardReason } from "@/lib/ai/voiceGuard";
import { lastTrackHistory, trackHistoryBlock } from "@/lib/engineer/trackRecall";
import { CLARIFY_MAX, THREAD_MS, clarifyStreak, isClarification, sttUnsure, type Exchange } from "@/lib/engineer/askRules";

// Phrases radio d'échec (« pas compris », coach indisponible) : variantes
// « A | B | C » en rotation ; rappels de cause déjà dits (cf. `radioErrorKey`).
const radioPicker = new VariantPicker();
const hintedErrors = new Set<AiErrorKind>();

/** Une formulation de la phrase radio `key` (gabarit à variantes). */
export function radioLine(t: TFunction, key: string): string {
  return radioPicker.pick(key, t(key));
}

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

// ── Fil radio joint au coach vocal ──────────────────────────────────────────

const exchanges: Exchange[] = [];

function rememberExchange(q: string, a: string): void {
  exchanges.push({ q, a, at: Date.now(), clarify: isClarification(a) });
  if (exchanges.length > 6) exchanges.splice(0, exchanges.length - 6);
}

/**
 * Ce que l'ingénieur a déjà dit (annonces retenues par l'arbitre) et les derniers
 * échanges avec le pilote : l'IA ne contredit pas une annonce qu'elle ignorait, et
 * comprend « et derrière ? » ou une réponse d'un mot à sa propre question.
 */
function radioThreadBlock(now = Date.now()): string {
  const said = radioLog.entries.filter((e) => now - e.at <= THREAD_MS).slice(-6);
  const ex = exchanges.filter((e) => now - e.at <= THREAD_MS).slice(-3);
  if (!said.length && !ex.length) return "";
  const ago = (at: number) => `${Math.max(1, Math.round((now - at) / 1000))} s ago`;
  const lines = ["## Radio thread (what you already said; stay consistent with it, most recent last)"];
  for (const e of said) lines.push(`- ${ago(e.at)}, announcement: ${e.text}`);
  for (const e of ex) lines.push(`- ${ago(e.at)}, driver asked: "${e.q}" → you answered: "${e.a}"`);
  const streak = clarifyStreak(exchanges, now);
  if (streak >= CLARIFY_MAX)
    lines.push(
      "You have already asked the driver to repeat or clarify twice in a row: do NOT ask again. Give your best reading of what they want, say which reading you took, and answer it; if nothing is plausible, say in one sentence that you leave it for now.",
    );
  else if (streak === 1)
    lines.push(
      "You have just asked the driver to repeat. Do not simply ask again: offer the two most likely readings in the simplest words and let them pick with one word.",
    );
  return lines.join("\n");
}

/** Repli honnête quand la réponse de l'IA est écartée (clé i18n à variantes). */
function guardFallbackKey(reason: GuardReason, askWhere: boolean): string {
  if (reason === "emptyAck") return askWhere ? "coach.guardAckWhere" : "coach.guardAckEmpty";
  if (reason === "number") return "coach.guardNoData";
  if (reason === "promise" || reason === "done") return "coach.guardNoAction";
  return "coach.guardUnsure";
}

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
  /** Confiance moyenne de la dictée libre (0..1, Vosk), si connue. */
  confidence?: number | null;
}

export interface AskResult {
  /** Ce que l'ingénieur a dit (ou aurait dit). */
  text: string;
  /** Qui a répondu. */
  via: "command" | "local" | "phrases" | "ai" | "fallback" | "none";
  /** Test sans session en cours : la réponse repose sur la course d'exemple. */
  sample?: boolean;
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

  // Test sans rouler : sans session en cours, la course d'exemple prend le relais.
  let sample = false;
  const say = (text: string, via: AskResult["via"]): AskResult => {
    if (!gone() && text) {
      announceAnswer(text, lang);
      toastSuccess(text);
      void emit("coach-voice", { question: heard, answer: text });
    }
    return sample ? { text, via, sample } : { text, via };
  };

  if (!heard) {
    const text = radioLine(t, "coach.voiceUnclear");
    if (!gone()) announceAnswer(text, lang);
    return { text, via: "none" };
  }
  // La question reconnue s'affiche (l'utilisateur voit si la dictée a mal compris).
  toast(`🎤 ${heard}`);
  void emit("coach-voice", { question: heard, answer: null });
  const r = route(free, lang);
  let data = await live.getData().catch(() => null);
  // Configuration › Tester l'ingénieur : sans session en cours, une course d'exemple
  // (celle des aperçus d'overlays) donne des réponses réalistes au lieu de « pas de session ».
  if (o.dryRun && (!data || !data.connected || !data.session)) {
    data = sampleLiveData(300);
    sample = true;
  }
  if (aboutPads(r)) data = await withGamePads(data);

  const norm = r.norm || normalize(strict, lang);
  const opts = {
    // Perte au stand : temps de voie mesuré + durée de l'arrêt lue dans le jeu (pont REST).
    pitLossSec: effectivePitLoss(data, st0.pitLossSeconds, st0.pitLaneLoss),
    fuelReserveLaps: st0.fuelReserveLaps,
    classPositions: st0.classPositions,
    pressureUnit: st0.pressureUnit,
    entities: r.norm ? r.entities : extractEntities(norm, lang),
    norm,
  };

  // Actions asynchrones : menu des stands (écritures dans le jeu), réveil, note vocale.
  if (r.intent && (PIT_CMDS.has(r.intent) || r.intent === "alarm" || r.intent === "voiceNote")) {
    if (o.dryRun) return say(t("config.engineerTestCommand", { name: commandLabel(t, r.intent) }), "command");
    if (r.intent === "alarm") {
      const a = parseAlarm(norm, Date.now());
      if (!a) return say(t("live.spAlarmUnknown"), "command");
      engineer.alarms.add(a);
      return say(t("live.spAlarmSet", { label: a.label }), "command");
    }
    if (r.intent === "voiceNote") return say(await saveNoteHere(t), "command");
    const text = await runPitCommand(r.intent as PitCmd, data, norm, t, {
      allowed: st0.gameWrites,
      reserveLaps: st0.fuelReserveLaps,
    });
    return say(text, "command");
  }

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
      if (next) announceAnswer(t("live.spUnmuted"), lang);
      else cancelSpeech();
      return { text: next ? t("live.spUnmuted") : "", via: "command" };
    }
    if (id === "watch") return say(registerWatch(r.watch, r.entities, r.norm, data, t), "command");
    if (id.startsWith("rate")) {
      // Note la dernière annonce radio (≤ 2 min) ; accusé bref, jamais d'IA.
      const rating = RATING_OF[id];
      const e = rating ? radioLog.rateLast(rating) : null;
      return say(e ? t("live.spRated", { what: t(`live.rate_${rating}`) }) : t("live.spRateNothing"), "command");
    }
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
    // Question de pilotage ouverte : une fiche de savoir sûre (sous-virage, pluie,
    // pneus froids…) ; les fiches incertaines ne sont jamais dites.
    const card = r.intent ? null : radioCard(norm, lang);
    if (card) return say(card, "local");
    const guess = r.ambiguous && r.candidates.length ? r.candidates[0] : r.guess;
    if (guess && !isAction(guess)) return runIntent(guess, "local");
    // Rien de local : l'ingénieur dit qu'il ne comprend pas (ou que le coach IA
    // n'est pas branché) ; l'explication reste dans le toast ci-dessus. Le point de
    // course reste à la demande (« le point », touche Statut).
    const text = radioLine(t, noAnswerKey(st0.aiCoachEnabled, mode));
    if (!gone()) announceAnswer(text, lang);
    return { text, via: "fallback" };
  }

  // ── 4. Coach IA ─────────────────────────────────────────────────────────────
  // Dictée incertaine : on fait répéter plutôt que d'envoyer à l'IA une phrase
  // peut-être fausse (elle répondrait à côté avec aplomb). Réglage désactivable.
  if (mode !== "ai" && st0.sttConfirmUnsure && sttUnsure(free, o.confidence)) {
    const text = radioLine(t, "coach.voiceUnsure");
    if (!gone()) {
      announceAnswer(text, lang);
      toast(t("coach.voiceUnsureToast", { pct: Math.round((o.confidence ?? 0) * 100) }));
    }
    return { text, via: "fallback" };
  }
  try {
    // Accusé immédiat : l'appel IA prend 1 à 3 s, le pilote sait qu'on a entendu.
    if (!gone()) announceAnswer(t(`coach.voiceAck${1 + Math.floor(Math.random() * 3)}`), lang);
    if (mode !== "ai" && st0.localAnswers && r.ambiguous && r.candidates.length) {
      const help: Record<string, string> = {};
      for (const id of r.candidates) if (INTENT_HELP[id]) help[id] = INTENT_HELP[id]!;
      const picked = await classifyIntent({ provider: p, model, apiKey, question: free, intents: help }).catch(
        () => null,
      );
      if (picked) return runIntent(picked as AnswerIntent, "local");
    }
    // Sans données live, l'appel échoue comme avant (message d'erreur lisible).
    const liveData = data ?? (await live.getData());
    const baseCtx = await buildLiveCoachContext(liveData, free);
    const recent = recentDiagnosticsBlock();
    // Faits calculés par l'app : ils priment sur tout autre chiffre (les fiches de
    // savoir sont déjà jointes par `buildLiveCoachContext`).
    const facts = factsBlock(r.candidates, data, t, opts);
    // Liste fermée des noms de virage du circuit (+ ce que désignent les mots du pilote).
    const track = liveData?.session?.track ?? "";
    const corners = track ? cornerNamesBlock(track, track, free) : "";
    const thread = radioThreadBlock();
    // Ce que l'app sait de ce tracé (record, dernière course, perte au stand mesurée).
    const history = trackHistoryBlock(lastTrackHistory(), track);
    const systemOverride = useAppStore.getState().aiSystemPromptByLang[lang.slice(0, 2).toLowerCase()] ?? "";
    // Prompt radio : les faits calculés en dernier, juste avant la question (ce qu'un
    // petit modèle lit en dernier pèse le plus). Sinon, l'ancien ordre à l'identique.
    const blocks = usesRadioPrompt(systemOverride, st0.aiVoiceRadioPrompt)
      ? [baseCtx, history, recent, corners, thread, facts]
      : [baseCtx, facts, corners, history, recent, thread];
    const ctx = blocks.filter(Boolean).join("\n\n");
    const answer = stripMd(
      await askCoachVoice({
        provider: p,
        model,
        apiKey,
        lang,
        question: free,
        contextText: ctx,
        systemOverride,
        radioPrompt: st0.aiVoiceRadioPrompt,
      }),
    );
    // Le coach répond de nouveau : un futur échec de modèle / clé sera rappelé.
    hintedErrors.clear();
    // Contrôle avant la radio : on ne dit pas un chiffre que l'IA n'a pas reçu, une
    // promesse qu'elle ne tiendra pas, ni un « Reçu. » à une vraie question.
    let spoken = answer;
    if (st0.aiVoiceGuard && answer) {
      const input = { answer, sources: ctx, question: free, lang };
      const verdict = checkVoiceAnswer(input);
      if (verdict) {
        const repaired = repairVoiceAnswer(input);
        spoken = repaired ?? radioLine(t, guardFallbackKey(verdict.reason, !!verdict.askWhere));
        if (!gone()) toast(t("coach.guardToast", { why: t(`coach.guardWhy_${verdict.reason}`), text: answer }));
      }
    }
    rememberExchange(free, spoken);
    return say(spoken, "ai");
  } catch (e) {
    // Écran : le message détaillé (quoi corriger). Radio : une phrase courte,
    // jamais le texte technique.
    const text = friendlyError(e, t);
    if (!gone()) {
      toastError(text);
      announceAnswer(radioLine(t, radioErrorKey(aiErrorKind(errorMessage(e)).kind, hintedErrors)), lang);
    }
    return { text, via: "none" };
  }
}
