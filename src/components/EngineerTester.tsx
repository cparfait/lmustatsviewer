/**
 * Config → Audio / Voix → Parler à l'ingénieur : **tester l'ingénieur** sans
 * rouler, avec ou sans IA. La question tapée passe par la même logique que la
 * touche (`askEngineer`) ; la réponse est dite et affichée avec sa source. Les
 * commandes (« on se bat », coupure…) sont reconnues mais pas exécutées.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { askEngineer, type AskResult } from "@/lib/engineer/ask";

export function EngineerTester() {
  const { t, i18n } = useTranslation();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState<"local" | "ai" | null>(null);
  const [result, setResult] = useState<(AskResult & { mode: "local" | "ai" }) | null>(null);
  const examples = t("config.engineerTestExamples").split(" | ").filter(Boolean);

  const run = async (mode: "local" | "ai") => {
    if (!question.trim() || busy) return;
    setBusy(mode);
    try {
      const r = await askEngineer(question, { lang: i18n.language, t, mode, dryRun: true });
      setResult({ ...r, mode });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground/80">{t("config.engineerTestDesc")}</p>
      <div className="flex items-center gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run("local");
          }}
          placeholder={t("config.engineerTestPlaceholder")}
          className="h-8 min-w-0 flex-1 text-sm"
        />
        <Button variant="outline" size="sm" className="h-8" disabled={!question.trim() || !!busy} onClick={() => void run("local")}>
          {busy === "local" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("config.engineerTestLocal")}
        </Button>
        <Button variant="outline" size="sm" className="h-8" disabled={!question.trim() || !!busy} onClick={() => void run("ai")}>
          {busy === "ai" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("config.engineerTestAi")}
        </Button>
      </div>
      {examples.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQuestion(ex)}
              className="rounded-full border border-input px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
      {result && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-sm">
          <div className="mb-0.5 text-mini text-muted-foreground">
            {t(result.mode === "ai" ? "config.engineerTestAi" : "config.engineerTestLocal")} ·{" "}
            {t(`config.engineerTestVia_${result.via}`)}
            {result.sample && <span className="text-amber-600 dark:text-amber-400"> · {t("config.engineerTestSample")}</span>}
          </div>
          {result.text || "—"}
        </div>
      )}
    </div>
  );
}
