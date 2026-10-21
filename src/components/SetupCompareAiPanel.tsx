/**
 * Comparaison de setups › Analyse IA : visible seulement quand le Coach IA est
 * configuré. L'IA explique les écarts (comportement par phase) et quand
 * préférer A ou B ; rien n'est modifié.
 */
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setups as setupsApi, type SetupDiffSection } from "@/lib/api";
import { chat, friendlyError } from "@/lib/ai/coach";
import { analysisTarget, useAnalysisReady } from "@/lib/ai/analysisTarget";
import { readDriverStyle, styleForPrompt } from "@/lib/driverStyle";
import { buildCompareMessages, type CompareSide } from "@/lib/setupCompareAi";
import { notesOf } from "@/lib/setupView";

/** **gras** dans une ligne. */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

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
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Nouvelle paire de setups : l'ancienne analyse ne vaut plus.
  useEffect(() => {
    setAnswer(null);
    setError(null);
  }, [idA, idB, diffs]);

  if (!ready) return null;

  const run = async () => {
    const target = analysisTarget();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
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
      });
      const text = (await chat(target.provider, target.model, target.apiKey, messages, 1200)).trim();
      // Réponse vide : souvent un modèle « à raisonnement » qui a épuisé son budget
      // en réflexion. On le dit plutôt que de laisser le panneau muet.
      if (text) setAnswer(text);
      else setError(t("setupCompare.aiEmpty", { model: target.model }));
    } catch (e) {
      setError(friendlyError(e, t, target.provider, target.model));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("setupCompare.aiTitle")}
            </p>
            <p className="text-xs text-muted-foreground">{t("setupCompare.aiIntro")}</p>
          </div>
          <Button size="sm" variant={answer ? "outline" : "default"} className="gap-1.5 shrink-0" disabled={busy} onClick={() => void run()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : answer ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {t(answer ? "setupCompare.aiRerun" : "setupCompare.aiRun")}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {answer && (
          <>
            <Answer text={answer} />
            <p className="text-micro text-muted-foreground">{t("setupCompare.aiDisclaimer")}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
