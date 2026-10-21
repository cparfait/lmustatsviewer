/**
 * Comparaison de setups › Analyse IA : visible seulement quand le Coach IA est
 * configuré. L'IA explique chaque écart (comportement par phase) et quand
 * préférer A ou B (ou un résumé court) ; réponse à écouter, questions de suivi
 * sur les deux setups. Rien n'est modifié.
 */
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw, Send, Sparkles, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setups as setupsApi, type SetupDiffSection } from "@/lib/api";
import { chat, friendlyError } from "@/lib/ai/coach";
import type { AIMessage } from "@/lib/ai/types";
import { stripMarkdown } from "@/lib/ai/stripMarkdown";
import { announceAnswer, cancelSpeech } from "@/lib/voice";
import { analysisTarget, useAnalysisReady } from "@/lib/ai/analysisTarget";
import { readDriverStyle, styleForPrompt } from "@/lib/driverStyle";
import { buildCompareMessages, type CompareDetail, type CompareSide } from "@/lib/setupCompareAi";
import { notesOf } from "@/lib/setupView";

/** **gras** dans une ligne. */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

/** Budgets de réponse : analyse complète, résumé court, question de suivi. */
const BUDGET: Record<CompareDetail | "ask", number> = { full: 3000, short: 1200, ask: 800 };
/** Questions de suivi : le 1er échange (qui porte les données) + les derniers tours. */
const HISTORY_TAIL = 6;

/** Rendu Markdown minimal (titres, puces, paragraphes) de la réponse. */
function Answer({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="ml-4 list-disc space-y-0.5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flush();
    if (!line) continue;
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    blocks.push(
      h ? (
        <h4 key={blocks.length} className="mt-2 text-xs font-bold uppercase tracking-wide text-primary">
          {h[1]}
        </h4>
      ) : (
        <p key={blocks.length}>{inline(line)}</p>
      ),
    );
  }
  flush();
  return <div className="flex flex-col gap-1.5 text-sm">{blocks}</div>;
}

export function SetupCompareAiPanel({
  a,
  b,
  idA,
  idB,
  diffs,
}: {
  a: Omit<CompareSide, "notes">;
  b: Omit<CompareSide, "notes">;
  idA: number;
  idB: number;
  diffs: SetupDiffSection[];
}) {
  const { t, i18n } = useTranslation();
  const ready = useAnalysisReady();
  const [busy, setBusy] = useState(false);
  // Fil : [system, données + consigne, analyse, question, réponse…].
  const [thread, setThread] = useState<AIMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [reading, setReading] = useState(false);

  // Nouvelle paire de setups : l'ancienne analyse ne vaut plus.
  useEffect(() => {
    cancelSpeech();
    setReading(false);
    setThread([]);
    setError(null);
  }, [idA, idB, diffs]);
  useEffect(() => () => cancelSpeech(), []);

  if (!ready) return null;

  const answers = thread.filter((m) => m.role === "assistant");
  const lastAnswer = answers.length ? answers[answers.length - 1].content : null;

  /** Envoie le fil et ajoute la réponse ; rend faux si l'appel a échoué. */
  const send = async (next: AIMessage[], maxTokens: number): Promise<boolean> => {
    const target = analysisTarget();
    if (!target) return false;
    cancelSpeech();
    setReading(false);
    setBusy(true);
    setError(null);
    try {
      const sent = next.length > HISTORY_TAIL + 3 ? [...next.slice(0, 3), ...next.slice(-HISTORY_TAIL)] : next;
      const text = (await chat(target.provider, target.model, target.apiKey, sent, maxTokens)).trim();
      // Réponse vide : souvent un modèle « à raisonnement » qui a épuisé son budget
      // en réflexion. On le dit plutôt que de laisser le panneau muet.
      if (!text) {
        setError(t("setupCompare.aiEmpty", { model: target.model }));
        return false;
      }
      setThread([...next, { role: "assistant", content: text }]);
      return true;
    } catch (e) {
      setError(friendlyError(e, t, target.provider, target.model));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const run = async (detail: CompareDetail) => {
    const [svmA, svmB, style] = await Promise.all([
      setupsApi.getContent(idA).catch(() => null),
      setupsApi.getContent(idB).catch(() => null),
      readDriverStyle(),
    ]);
    const messages = buildCompareMessages({
      a: { ...a, notes: svmA ? notesOf(svmA) : null },
      b: { ...b, notes: svmB ? notesOf(svmB) : null },
      diffs,
      lang: i18n.language,
      style: styleForPrompt(style),
      detail,
    });
    setThread([]);
    await send(messages, BUDGET[detail]);
  };

  const ask = async () => {
    const q = question.trim();
    if (!q || busy || !lastAnswer) return;
    setQuestion("");
    // Échec : la question revient dans le champ, rien n'est perdu.
    if (!(await send([...thread, { role: "user", content: q }], BUDGET.ask))) setQuestion(q);
  };

  const toggleRead = () => {
    if (reading) {
      cancelSpeech();
      setReading(false);
      return;
    }
    if (!lastAnswer) return;
    setReading(true);
    announceAnswer(stripMarkdown(lastAnswer), i18n.language, () => setReading(false));
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("setupCompare.aiTitle")}
            </p>
            <p className="text-xs text-muted-foreground">{t("setupCompare.aiIntro")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {lastAnswer && (
              <Button size="sm" variant={reading ? "secondary" : "ghost"} className="gap-1.5" onClick={toggleRead}>
                {reading ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {t(reading ? "coach.stop" : "coach.listen")}
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("short")} title={t("setupCompare.aiShortTip")}>
              {t("setupCompare.aiShort")}
            </Button>
            <Button size="sm" variant={lastAnswer ? "outline" : "default"} className="gap-1.5" disabled={busy} onClick={() => void run("full")}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : lastAnswer ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {t(lastAnswer ? "setupCompare.aiRerun" : "setupCompare.aiRun")}
            </Button>
          </div>
        </div>
        {thread.slice(2).map((m, i) =>
          m.role === "assistant" ? (
            <Answer key={i} text={m.content} />
          ) : (
            <p key={i} className="self-end rounded-lg bg-primary/10 px-3 py-1.5 text-sm">
              {m.content}
            </p>
          ),
        )}
        {busy && lastAnswer && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {lastAnswer && (
          <>
            <div className="flex items-center gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void ask()}
                placeholder={t("setupCompare.aiAsk")}
                aria-label={t("setupCompare.aiAsk")}
                disabled={busy}
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button size="sm" className="h-9 gap-1.5" disabled={busy || !question.trim()} onClick={() => void ask()}>
                <Send className="h-4 w-4" />
                {t("setupCompare.aiSend")}
              </Button>
            </div>
            <p className="text-micro text-muted-foreground">{t("setupCompare.aiDisclaimer")}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
