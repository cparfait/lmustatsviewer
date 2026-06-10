import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Brain,
  Loader2,
  Sparkles,
  FileText,
  ChevronRight,
  Volume2,
  Square,
  Copy,
  Check,
  Send,
  X,
  Headphones,
  CircleStop,
  Mic,
  Pin,
  Target,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startCapture, stopCapture, pcmToBase64 } from "@/lib/mic";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app";
import { telemetry, setups, live, ai } from "@/lib/api";
import type { SessionDetail, TelemetryMeta, CoachNote } from "@/lib/api";
import { fetchBenchmarks, findBenchmark, computeTier } from "@/lib/ohne_speed";
import { formatTime } from "@/lib/utils";
import { getProvider } from "@/lib/ai/providers";
import { converseStream, friendlyError } from "@/lib/ai/coach";
import { buildPostRaceContext } from "@/lib/ai/context/postrace-context";
import {
  buildDriverHistoryText,
  buildComboHistoryText,
} from "@/lib/ai/context/driver-history-context";
import { buildLiveContext } from "@/lib/ai/context/live-context";
import { buildSetupSummary } from "@/lib/ai/context/setup-context";
import {
  buildTelemetryContext,
  buildElectronicsSummary,
  ELEC_CHANNELS,
} from "@/lib/ai/context/telemetry-context";
import { detectCorners, summarizeCorners, type Corner } from "@/lib/telemetry/corners";
import { summarizeLapAnalysis, type LapAnalysis } from "@/lib/telemetry/analysis";
import { computeLapMetrics, summarizeLapMetrics } from "@/lib/telemetry/lapMetrics";
import { compareToBestApex, summarizeTheoreticalBest } from "@/lib/telemetry/theoreticalBest";
import {
  postRacePrompt,
  POST_RACE_MAX_TOKENS,
  type PostRaceMode,
} from "@/lib/ai/prompts/postrace";
import { announce, cancelSpeech, speak } from "@/lib/voice";
import { estimateTokens, estimateCost, formatCost } from "@/lib/ai/cost";

/** Nombre de tours d'historique envoyés (en plus du 1er message qui porte le contexte). */
const HISTORY_TAIL = 8;
/** Budget de tokens pour une question libre de suivi. */
const ASK_MAX_TOKENS = 600;

type Turn = { role: "user" | "assistant"; content: string; display?: string };

/** Retire le markdown pour la synthèse vocale (gras, titres, listes, code).
 *  Un bloc ``` non refermé (stream en cours) est aussi retiré : le JSON
 *  d'objectifs ne doit jamais être lu à voix haute. */
function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, "")
    .replace(/```[\s\S]*$/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Objectif structuré proposé par le coach (bloc JSON de l'analyse complète). */
export interface CoachObjective {
  title: string;
  metric?: string;
  current?: string;
  target?: string;
}

/**
 * Sépare la réponse du coach en corps markdown + objectifs structurés.
 * Le bloc ```json est masqué même incomplet (streaming en cours) ; JSON
 * invalide → simplement ignoré (le texte reste intact).
 */
function splitObjectives(text: string): { body: string; objectives: CoachObjective[] } {
  const m = /```(?:json)?\s*([\s\S]*?)(?:```|$)/.exec(text);
  if (!m || !m[1].trimStart().startsWith("{")) return { body: text, objectives: [] };
  const body = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  try {
    const parsed = JSON.parse(m[1]) as { objectives?: CoachObjective[] };
    const objectives = Array.isArray(parsed.objectives)
      ? parsed.objectives
          .filter((o): o is CoachObjective => !!o && typeof o.title === "string")
          .slice(0, 5)
      : [];
    return { body, objectives };
  } catch {
    return { body, objectives: [] }; // bloc incomplet (stream) ou JSON invalide
  }
}

/** Rendu inline minimal : **gras**. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(p);
    return m ? <strong key={i}>{m[1]}</strong> : <span key={i}>{p}</span>;
  });
}

/** Rendu markdown léger (titres, listes, gras, paragraphes) sans dépendance. */
function CoachMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length) {
      const items = list;
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1 my-2">
          {items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (h) {
      flushList();
      blocks.push(
        <p key={`h-${blocks.length}`} className="font-semibold text-foreground mt-3 first:mt-0">
          {renderInline(h[2])}
        </p>,
      );
    } else if (li) {
      list.push(li[1]);
    } else {
      flushList();
      blocks.push(
        <p key={`p-${blocks.length}`} className="mt-2 first:mt-0">
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushList();
  return <div className="text-sm leading-relaxed">{blocks}</div>;
}

/** Tour assistant : corps markdown + cartes d'objectifs mesurables (épinglables). */
function AssistantTurn({
  text,
  canPin,
  onPin,
  pinLabel,
  header,
}: {
  text: string;
  canPin: boolean;
  onPin: (o: CoachObjective) => Promise<void>;
  pinLabel: string;
  header: string;
}) {
  const { body, objectives } = splitObjectives(text);
  const [done, setDone] = useState<number[]>([]);
  const pin = async (o: CoachObjective, i: number) => {
    await onPin(o);
    setDone((d) => (d.includes(i) ? d : [...d, i]));
  };
  return (
    <div>
      <CoachMarkdown text={body} />
      {objectives.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
            <Target className="h-3.5 w-3.5" />
            {header}
          </div>
          {objectives.map((o, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs"
            >
              <div className="flex-1">
                <div className="font-medium">{o.title}</div>
                {(o.metric || o.target) && (
                  <div className="text-muted-foreground">
                    {[o.metric, o.current && o.target ? `${o.current} → ${o.target}` : o.target]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </div>
              {canPin && (
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-primary disabled:text-emerald-500"
                  disabled={done.includes(i)}
                  onClick={() => void pin(o, i)}
                  aria-label={pinLabel}
                  title={pinLabel}
                >
                  {done.includes(i) ? <Check className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Panneau Coach IA générique : prend un **contexte de données** déjà construit
 * (`contextText`) et tient une **conversation continue** (analyse + questions de
 * suivi) dans une modale, avec lecture audio (TTS) et copie. Le contexte n'est
 * injecté qu'une fois (1er message) pour économiser les tokens.
 */
export function CoachPanel({
  getContext,
  resetKey,
  combo,
}: {
  /** Construit le contexte de données AU MOMENT de l'envoi (live = snapshot frais). */
  getContext: () => string | Promise<string>;
  /** Identifiant stable de la cible (session/fichier/"live") : son changement réinitialise le fil. */
  resetKey: string;
  /** Combo circuit/voiture — clé des objectifs épinglés ; absent = épinglage désactivé. */
  combo?: { track: string; trackCourse: string; car: string; carClass: string };
}) {
  const { t, i18n } = useTranslation();
  const aiProvider = useAppStore((s) => s.aiProvider);
  const aiModel = useAppStore((s) => s.aiModel);
  const aiApiKey = useAppStore((s) => s.aiApiKey);
  const aiSystemPromptByLang = useAppStore((s) => s.aiSystemPromptByLang);
  const aiSystemPrompt = aiSystemPromptByLang[i18n.language.slice(0, 2).toLowerCase()] ?? "";

  const provider = getProvider(aiProvider);
  const needsKey = provider?.needsKey ?? true;
  const ready = !!provider && !!aiModel && (!needsKey || !!aiApiKey);

  const [open, setOpen] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [question, setQuestion] = useState("");
  const [autoRead, setAutoRead] = useState(false); // B2 : lecture phrase-par-phrase en stream
  const [cost, setCost] = useState(0); // A1 : coût cumulé estimé (USD)
  const [costKnown, setCostKnown] = useState(true);
  const [sttOk, setSttOk] = useState(false); // B1 : reconnaissance vocale dispo
  const [recording, setRecording] = useState(false);
  const [notes, setNotes] = useState<CoachNote[]>([]); // objectifs épinglés du combo
  const [pinned, setPinned] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false); // A2 : stop génération
  const spokenRef = useRef(0); // B2 : offset déjà lu à voix haute

  const lastAnswer = [...thread].reverse().find((x) => x.role === "assistant")?.content ?? null;

  /** Contexte effectif : données + objectifs épinglés (le coach vérifie leur progression). */
  const resolveContext = async () => {
    const base = await Promise.resolve(getContext());
    if (notes.length === 0) return base;
    const noteLines = notes.map(
      (nt) => `[${new Date(nt.created_at * 1000).toISOString().slice(0, 10)}]\n${nt.note}`,
    );
    return (
      base +
      "\n\n## Pinned coaching objectives (saved by the driver after past sessions)\n" +
      noteLines.join("\n---\n") +
      "\n\nCompare this session's data against these objectives and explicitly call out progress or regression on each."
    );
  };

  // Réinitialise tout au changement de cible (session/fichier).
  useEffect(() => () => cancelSpeech(), []);
  useEffect(() => {
    cancelSpeech();
    setReading(false);
    setThread([]);
    setError(null);
    setOpen(false);
    setShowContext(false);
    setCost(0);
    setCostKnown(true);
  }, [resetKey]);

  // Objectifs épinglés du combo — rechargés au changement de cible.
  const comboTrack = combo?.track ?? "";
  const comboCar = combo?.car ?? "";
  useEffect(() => {
    if (!comboTrack || !comboCar) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    ai.notesForCombo(comboTrack, comboCar)
      .then((n) => {
        if (!cancelled) setNotes(n);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [resetKey, comboTrack, comboCar]);

  /** Épingle la dernière réponse comme objectif (réinjecté à la prochaine session du combo). */
  const pinNote = async () => {
    if (!combo || !lastAnswer) return;
    try {
      await ai.addNote({
        track: combo.track,
        trackCourse: combo.trackCourse,
        car: combo.car,
        carClass: combo.carClass,
        note: lastAnswer.slice(0, 1500),
      });
      setPinned(true);
      setTimeout(() => setPinned(false), 1500);
      setNotes(await ai.notesForCombo(combo.track, combo.car));
    } catch {
      /* persistance indisponible — non bloquant */
    }
  };

  const removeNote = async (id: number) => {
    try {
      await ai.deleteNote(id);
      setNotes((ns) => ns.filter((n) => n.id !== id));
    } catch {
      /* non bloquant */
    }
  };

  /** Épingle un objectif structuré (note compacte, vérifiable à la prochaine session). */
  const pinObjective = async (o: CoachObjective) => {
    if (!combo) return;
    const detail = [o.metric, o.current && o.target ? `${o.current} → ${o.target}` : o.target]
      .filter(Boolean)
      .join(" : ");
    const note = detail ? `${o.title} — ${detail}` : o.title;
    try {
      await ai.addNote({
        track: combo.track,
        trackCourse: combo.trackCourse,
        car: combo.car,
        carClass: combo.carClass,
        note,
      });
      setNotes(await ai.notesForCombo(combo.track, combo.car));
    } catch {
      /* non bloquant */
    }
  };

  /** B2 : lit à voix haute les phrases complètes apparues depuis le dernier appel. */
  const speakNewSentences = (acc: string) => {
    const ready = acc.slice(spokenRef.current);
    const m = /^[\s\S]*[.!?\n]/.exec(ready); // jusqu'à la dernière ponctuation forte
    if (!m) return;
    const chunk = stripMarkdown(m[0]).trim();
    spokenRef.current += m[0].length;
    if (chunk) speak(chunk, i18n.language, "chatty");
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const closeModal = () => {
    cancelSpeech();
    setReading(false);
    setOpen(false);
  };

  /** Envoie un fil et ajoute la réponse de l'assistant (en streaming). */
  const runTurn = async (nextThread: Turn[], maxTokens: number) => {
    if (!provider || !ready || busy) return;
    cancelSpeech();
    setReading(false);
    setOpen(true);
    setBusy(true);
    setError(null);
    cancelRef.current = false;
    spokenRef.current = 0;
    setThread([...nextThread, { role: "assistant", content: "" }]); // user + réponse en cours
    try {
      // Cap : on garde toujours le 1er message (qui porte le contexte) + la queue.
      const sent =
        nextThread.length > HISTORY_TAIL + 1
          ? [nextThread[0], ...nextThread.slice(-HISTORY_TAIL)]
          : nextThread;
      let acc = "";
      const full = await converseStream({
        provider,
        model: aiModel,
        apiKey: aiApiKey,
        lang: i18n.language,
        history: sent.map(({ role, content }) => ({ role, content })),
        maxTokens,
        systemOverride: aiSystemPrompt,
        onToken: (chunk) => {
          if (cancelRef.current) return; // A2 : stop demandé → on ignore la suite
          acc += chunk;
          setThread([...nextThread, { role: "assistant", content: acc }]);
          if (autoRead) speakNewSentences(acc); // B2 : lecture progressive
        },
      });
      if (!cancelRef.current) {
        setThread([...nextThread, { role: "assistant", content: full || acc }]);
        // A1 : coût estimé (entrée = contexte+historique ≈, sortie = réponse).
        const inTok = estimateTokens(sent.map((m) => m.content).join("\n"), i18n.language) + 350;
        const outTok = estimateTokens(full || acc, i18n.language);
        const c = estimateCost(aiProvider, aiModel, inTok, outTok);
        if (c == null) setCostKnown(false);
        else setCost((v) => v + c);
      }
    } catch (e) {
      setError(friendlyError(e, t));
      setThread(nextThread); // retire la réponse vide en cas d'échec
    } finally {
      setBusy(false);
    }
  };

  /** A2 : arrête la génération en cours (le flux backend se termine seul, ignoré). */
  const stopGeneration = () => {
    cancelRef.current = true;
    cancelSpeech();
    setBusy(false);
  };

  /** Démarre une nouvelle analyse (réinitialise le fil). */
  const analyze = async (mode: PostRaceMode) => {
    const context = await resolveContext();
    const first: Turn = {
      role: "user",
      content: `${postRacePrompt(mode, i18n.language)}\n\n---\n${context}`,
      display: mode === "quick" ? t("coach.quick") : t("coach.full"),
    };
    void runTurn([first], POST_RACE_MAX_TOKENS[mode]);
  };

  /** Question libre (continue le fil ; injecte le contexte si c'est le 1er message). */
  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    const isFirst = thread.length === 0;
    const context = isFirst ? await resolveContext() : "";
    const user: Turn = {
      role: "user",
      content: isFirst ? `${q}\n\n--- Session data ---\n${context}` : q,
      display: q,
    };
    setQuestion("");
    void runTurn([...thread, user], ASK_MAX_TOKENS);
  };

  const togglePreview = async () => {
    if (!showContext) setPreviewText(await resolveContext());
    setShowContext((v) => !v);
  };

  // B1 : dispo de la reconnaissance vocale (Vosk, feature `stt`) pour la langue.
  useEffect(() => {
    invoke<boolean>("stt_available", { lang: i18n.language })
      .then(setSttOk)
      .catch(() => setSttOk(false));
  }, [i18n.language]);

  /** B1 : push-to-talk → dictée libre transcrite dans le champ question. */
  const toggleMic = async () => {
    if (recording) {
      const pcm = stopCapture();
      setRecording(false);
      try {
        const text = await invoke<string>("stt_recognize_free", {
          pcmBase64: pcmToBase64(pcm),
          lang: i18n.language,
        });
        if (text) setQuestion((q) => (q ? `${q} ${text}` : text));
      } catch {
        /* reco indisponible / échec → on ne remplit rien */
      }
      return;
    }
    try {
      await startCapture();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  const toggleRead = () => {
    if (reading) {
      cancelSpeech();
      setReading(false);
      return;
    }
    if (!lastAnswer) return;
    setReading(true);
    announce(stripMarkdown(lastAnswer), i18n.language, () => setReading(false));
  };

  const copy = async () => {
    if (!lastAnswer) return;
    try {
      await navigator.clipboard.writeText(lastAnswer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papiers indisponible — non bloquant */
    }
  };

  const hasThread = thread.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-primary">
        <Brain className="h-4 w-4" />
        <span className="text-sm font-medium">{t("coach.title")}</span>
      </div>

      {!ready ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <p>{t("coach.notConfigured")}</p>
          <Button asChild variant="outline" size="sm" className="mt-2 gap-1.5">
            <Link to="/config">
              {t("coach.goConfig")}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void analyze("quick")}>
              <Sparkles className="h-3.5 w-3.5" />
              {t("coach.quick")}
            </Button>
            <Button size="sm" variant="secondary" className="gap-1.5" disabled={busy} onClick={() => void analyze("full")}>
              <Brain className="h-3.5 w-3.5" />
              {t("coach.full")}
            </Button>
            {hasThread && !open && (
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setOpen(true)}>
                <FileText className="h-3.5 w-3.5" />
                {t("coach.reopen")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void ask();
              }}
              placeholder={t("coach.ask")}
              className="h-8 text-sm"
            />
            {sttOk && (
              <Button
                size="icon"
                variant={recording ? "secondary" : "outline"}
                className="h-8 w-8 shrink-0"
                onClick={() => void toggleMic()}
                aria-label={t("coach.speak")}
                title={t("coach.speak")}
              >
                <Mic className={cn("h-3.5 w-3.5", recording && "text-primary animate-pulse")} />
              </Button>
            )}
            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" disabled={busy || !question.trim()} onClick={() => void ask()} aria-label={t("coach.send")}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            {provider?.name} · {aiModel}
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => void togglePreview()}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <FileText className="h-3.5 w-3.5" />
          {showContext ? t("coach.hideContext") : t("coach.showContext")}
        </button>
        {showContext && (
          <pre className="mt-2 max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-snug">
            {previewText}
          </pre>
        )}
      </div>

      {/* ── Objectifs épinglés du combo (mémoire longitudinale) ── */}
      {combo && notes.length > 0 && (
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Pin className="h-3.5 w-3.5" />
            {t("coach.notes")} ({notes.length})
          </div>
          {notes.map((nt) => (
            <div
              key={nt.id}
              className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
            >
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {new Date(nt.created_at * 1000).toLocaleDateString()}
              </span>
              <span className="flex-1 line-clamp-2 text-foreground/80">{nt.note}</span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => void removeNote(nt.id)}
                aria-label={t("coach.deleteNote")}
                title={t("coach.deleteNote")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Modale : fil de conversation ── */}
      {open && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === overlayRef.current) closeModal();
          }}
        >
          <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Brain className="h-4 w-4 text-primary" />
              </div>
              <div className="font-semibold text-sm">{t("coach.title")}</div>
              {costKnown && cost > 0 && (
                <span className="text-[11px] tabular-nums text-muted-foreground" title={t("coach.costTip")}>
                  ~{formatCost(cost)}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                {busy && (
                  <Button variant="secondary" size="sm" className="h-7 gap-1.5" onClick={stopGeneration}>
                    <CircleStop className="h-3.5 w-3.5" />
                    {t("coach.stopGen")}
                  </Button>
                )}
                <Button
                  variant={autoRead ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setAutoRead((v) => !v)}
                  aria-label={t("coach.autoRead")}
                  title={t("coach.autoRead")}
                >
                  <Headphones className="h-3.5 w-3.5" />
                </Button>
                <Button variant={reading ? "secondary" : "ghost"} size="sm" className="h-7 gap-1.5" disabled={!lastAnswer} onClick={toggleRead}>
                  {reading ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  {reading ? t("coach.stop") : t("coach.listen")}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5" disabled={!lastAnswer} onClick={() => void copy()}>
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {t("coach.copy")}
                </Button>
                {combo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5"
                    disabled={!lastAnswer || busy}
                    onClick={() => void pinNote()}
                    title={t("coach.pinTip")}
                  >
                    {pinned ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Pin className="h-3.5 w-3.5" />}
                    {t("coach.pin")}
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeModal} aria-label={t("coach.close")}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-auto px-6 py-5">
              {thread.map((turn, i) =>
                turn.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[80%] rounded-lg bg-primary/10 px-3 py-1.5 text-sm text-foreground">
                      {turn.display ?? turn.content}
                    </div>
                  </div>
                ) : (
                  <AssistantTurn
                    key={i}
                    text={turn.content}
                    canPin={!!combo}
                    onPin={pinObjective}
                    pinLabel={t("coach.pin")}
                    header={t("coach.objectives")}
                  />
                ),
              )}
              {busy && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("coach.analyzing")}
                </div>
              )}
              {error && <div className="text-sm text-destructive">{error}</div>}
              {lastAnswer && !busy && (
                <p className="text-[11px] text-muted-foreground/70">{t("coach.disclaimer")}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-3">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void ask();
                }}
                placeholder={t("coach.ask")}
                disabled={busy}
                className="h-9 text-sm"
              />
              {sttOk && (
                <Button
                  size="icon"
                  variant={recording ? "secondary" : "outline"}
                  className="h-9 w-9 shrink-0"
                  onClick={() => void toggleMic()}
                  aria-label={t("coach.speak")}
                  title={t("coach.speak")}
                >
                  <Mic className={cn("h-3.5 w-3.5", recording && "text-primary animate-pulse")} />
                </Button>
              )}
              <Button className="h-9 gap-1.5 shrink-0" disabled={busy || !question.trim()} onClick={() => void ask()}>
                <Send className="h-3.5 w-3.5" />
                {t("coach.send")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Coach IA pour le détail d'une session (analyse post-course depuis SQLite). */
export function AICoachPanel({ detail }: { detail: SessionDetail }) {
  // Setup `.svm` lié à la session (Garage) → réglage réel injecté dans le contexte.
  const [setupText, setSetupText] = useState("");
  useEffect(() => {
    let cancelled = false;
    setSetupText("");
    setups
      .getForSession(detail.session.id)
      .then(async (linked) => {
        if (cancelled || linked.length === 0) return;
        const svm = await setups.getContent(linked[0].id);
        if (!cancelled) setSetupText(buildSetupSummary(svm, linked[0].name));
      })
      .catch(() => {
        /* pas de setup lié / erreur → contexte sans setup */
      });
    return () => {
      cancelled = true;
    };
  }, [detail.session.id]);

  // Référence « alien » ohne_speed (temps au tour communautaire) — base macro.
  const showOhneSpeed = useAppStore((s) => s.showOhneSpeed);
  const [alienText, setAlienText] = useState("");
  useEffect(() => {
    const player = detail.results.find((r) => r.is_player);
    if (!showOhneSpeed || !player || !player.best_lap || player.best_lap <= 0) {
      setAlienText("");
      return;
    }
    let cancelled = false;
    fetchBenchmarks()
      .then((benchmarks) => {
        if (cancelled) return;
        const bm = findBenchmark(
          benchmarks,
          detail.session.track,
          player.car_class,
          detail.session.track_course,
        );
        if (!bm) {
          setAlienText("");
          return;
        }
        const bestMs = player.best_lap! * 1000;
        const { tier, percent, deltaMs } = computeTier(bestMs, bm);
        setAlienText(
          [
            "## Alien reference (ohne_speed, community — lap-time level only)",
            `Class ${player.car_class} · alien hotlap ${formatTime(bm.hotlapTimeMs / 1000)}`,
            `Your best ${formatTime(player.best_lap!)} → ${deltaMs >= 0 ? "+" : ""}${(deltaMs / 1000).toFixed(3)}s (${percent.toFixed(1)}% of alien, tier: ${tier})`,
          ].join("\n"),
        );
      })
      .catch(() => {
        if (!cancelled) setAlienText("");
      });
    return () => {
      cancelled = true;
    };
  }, [detail, showOhneSpeed]);

  // Mémoire longitudinale : historique du combo (PB, tendance secteurs) depuis SQLite.
  const [historyText, setHistoryText] = useState("");
  useEffect(() => {
    let cancelled = false;
    setHistoryText("");
    buildDriverHistoryText(detail)
      .then((txt) => {
        if (!cancelled) setHistoryText(txt);
      })
      .catch(() => {
        if (!cancelled) setHistoryText("");
      });
    return () => {
      cancelled = true;
    };
  }, [detail]);

  const ctx = useMemo(
    () => buildPostRaceContext(detail, setupText, alienText, historyText),
    [detail, setupText, alienText, historyText],
  );
  const player = detail.results.find((r) => r.is_player);
  const combo = player
    ? {
        track: detail.session.track,
        trackCourse: detail.session.track_course,
        car: player.unique_car_name || player.car_type,
        carClass: player.car_class,
      }
    : undefined;
  return (
    <CoachPanel
      getContext={() => ctx.text}
      resetKey={`session-${detail.session.id}`}
      combo={combo}
    />
  );
}

/** Coach IA pour une session de télémétrie (`.duckdb`). `analysis` = comparaison
 *  par virage vs référence (calculée par la page si un tour de réf. est choisi). */
export function TelemetryCoachPanel({
  meta,
  analysis,
}: {
  meta: TelemetryMeta;
  analysis?: LapAnalysis | null;
}) {
  // Charge les canaux électroniques (ABS/TC/map/brake bias) pour permettre au
  // coach de proposer des ajustements ancrés sur les valeurs réellement utilisées.
  const [elecText, setElecText] = useState("");
  useEffect(() => {
    const names = ELEC_CHANNELS.filter((n) => meta.channels.some((c) => c.name === n));
    if (names.length === 0) {
      setElecText("");
      return;
    }
    let cancelled = false;
    telemetry
      .getChannels(meta.info.path, names, null, 3000)
      .then((d) => {
        if (!cancelled) setElecText(buildElectronicsSummary(d));
      })
      .catch(() => {
        if (!cancelled) setElecText("");
      });
    return () => {
      cancelled = true;
    };
  }, [meta]);

  // Tour le plus rapide à pleine résolution → virages + métriques par phase.
  const [cornersText, setCornersText] = useState("");
  const [metricsText, setMetricsText] = useState("");
  useEffect(() => {
    const laps = meta.laps.filter((l) => l.duration > 0);
    if (laps.length === 0) {
      setCornersText("");
      setMetricsText("");
      return;
    }
    const fastest = laps.reduce((a, b) => (b.duration < a.duration ? b : a));
    let cancelled = false;
    const channels = [
      "Ground Speed",
      "Brake Pos",
      "Throttle Pos",
      "Steering Pos",
      "Wheel Speed",
      "SoC",
      "Regen Rate",
      "Virtual Energy",
      "ABS",
      "TC",
    ].filter((c) => meta.channels.some((m) => m.name === c));
    // maxPoints élevé → ≈ résolution native (métriques fines fiables).
    telemetry
      .getChannels(meta.info.path, channels, fastest.lap, 20000)
      .then((d) => {
        if (cancelled) return;
        const get = (n: string) => d.channels.find((c) => c.name === n)?.values[0] ?? [];
        const speed = get("Ground Speed");
        const brake = get("Brake Pos");
        const corners = detectCorners(speed, brake, d.dist);
        setCornersText(summarizeCorners(corners));
        setMetricsText(
          summarizeLapMetrics(
            computeLapMetrics(corners, {
              time: d.time,
              dist: d.dist,
              speed,
              brake,
              throttle: get("Throttle Pos"),
              steering: get("Steering Pos"),
              wheelSpeed: get("Wheel Speed"),
              soc: get("SoC"),
              regen: get("Regen Rate"),
              virtualEnergy: get("Virtual Energy"),
              abs: get("ABS"),
              tc: get("TC"),
            }, { carClass: meta.info.car_class }),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setCornersText("");
          setMetricsText("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [meta]);

  // Référence « meilleur théorique self » : meilleure vitesse d'apex par virage
  // sur tous les tours propres (sans tour de référence ni données pro).
  const [bestApexText, setBestApexText] = useState("");
  useEffect(() => {
    const laps = meta.laps.filter((l) => l.duration > 0);
    if (laps.length < 2 || !meta.channels.some((c) => c.name === "Ground Speed")) {
      setBestApexText("");
      return;
    }
    const fastest = laps.reduce((a, b) => (b.duration < a.duration ? b : a));
    const clean = laps.filter((l) => l.duration <= fastest.duration * 1.08).slice(0, 10);
    let cancelled = false;
    Promise.all(
      clean.map((l) =>
        telemetry
          .getChannels(meta.info.path, ["Ground Speed", "Brake Pos"], l.lap, 4000)
          .then((d) => {
            const sp = d.channels.find((c) => c.name === "Ground Speed")?.values[0] ?? [];
            const br = d.channels.find((c) => c.name === "Brake Pos")?.values[0] ?? [];
            return { lap: l.lap, corners: detectCorners(sp, br, d.dist) };
          })
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      const valid = results.filter((r): r is { lap: number; corners: Corner[] } => r != null);
      const fast = valid.find((r) => r.lap === fastest.lap);
      if (!fast || fast.corners.length === 0) {
        setBestApexText("");
        return;
      }
      setBestApexText(summarizeTheoreticalBest(compareToBestApex(fast.corners, valid.map((v) => v.corners))));
    });
    return () => {
      cancelled = true;
    };
  }, [meta]);

  // Mémoire longitudinale : historique du combo depuis les résultats indexés.
  // Sans filtre layout (nomenclature télémétrie ≠ résultats sur certains circuits).
  const [historyText, setHistoryText] = useState("");
  useEffect(() => {
    setHistoryText("");
    if (!meta.info.car_model) return;
    let cancelled = false;
    const laps = meta.laps.filter((l) => l.duration > 0);
    const fastest = laps.length ? Math.min(...laps.map((l) => l.duration)) : null;
    buildComboHistoryText({
      track: meta.info.track,
      car: meta.info.car_model,
      currentBest: fastest,
    })
      .then((txt) => {
        if (!cancelled) setHistoryText(txt);
      })
      .catch(() => {
        if (!cancelled) setHistoryText("");
      });
    return () => {
      cancelled = true;
    };
  }, [meta]);

  const comparisonText = analysis ? summarizeLapAnalysis(analysis) : "";
  const ctx = useMemo(
    () =>
      buildTelemetryContext(
        meta,
        elecText,
        cornersText,
        comparisonText,
        metricsText,
        bestApexText,
        historyText,
      ),
    [meta, elecText, cornersText, comparisonText, metricsText, bestApexText, historyText],
  );
  // Objectifs épinglés : même clé de combo que le post-race — `car_model` est déjà
  // résolu par le backend en `unique_car_name` (via veh_name, correspondance exacte)
  // et `TrackName` télémétrie = `sessions.track` (vérifié sur données réelles).
  // Sans correspondance (voiture jamais vue dans les résultats) → épinglage désactivé.
  const combo = meta.info.car_model
    ? {
        track: meta.info.track,
        trackCourse: meta.info.track_layout,
        car: meta.info.car_model,
        carClass: meta.info.car_class,
      }
    : undefined;
  return <CoachPanel getContext={() => ctx.text} resetKey={meta.info.path} combo={combo} />;
}

/**
 * Coach IA en **live** : le contexte est un snapshot frais de la shared memory
 * (`live.getData()`) capturé au moment de l'envoi — pas réactif (sinon le fil se
 * réinitialiserait à chaque tick). Conversation continue pendant le relais.
 */
export function LiveCoachPanel() {
  return (
    <CoachPanel
      getContext={async () => buildLiveContext(await live.getData())}
      resetKey="live"
    />
  );
}
