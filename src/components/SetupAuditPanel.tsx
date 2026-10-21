/**
 * Audit IA du setup (opt-in, Config › Atelier) : le pilote dit ce qui le gêne,
 * le Coach IA propose au plus trois changements (liste fermée, validés par le
 * moteur), le pilote coche ceux qu'il garde et une NOUVELLE version est créée.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTauri, live, setups as setupsApi, type RestSettingBound, type SetupEntry, type SvmFile } from "@/lib/api";
import { chat, friendlyError } from "@/lib/ai/coach";
import { analysisTarget, useAnalysisReady } from "@/lib/ai/analysisTarget";
import { buildSetupSummary } from "@/lib/ai/context/setup-context";
import { fresh } from "@/lib/lmuRest";
import { paramLabel } from "@/lib/setupParams";
import { applyChanges, unknownLevers } from "@/lib/setupAssistant";
import { UnknownNotchesNote } from "@/components/UnknownNotchesNote";
import { auditLevers, buildAuditMessages, parseAuditReply, type AuditResult } from "@/lib/setupAudit";
import { learnForCar, svmOfEntry, type NotchTable } from "@/lib/setupNotches";
import { createSetupVersion } from "@/lib/setupVersion";
import { readDriverStyle, styleForPrompt } from "@/lib/driverStyle";
import { toastError, toastSuccess } from "@/stores/dialogs";

export function SetupAuditPanel({ entry, svm, notes }: { entry: SetupEntry; svm: SvmFile; notes: string | null }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const ready = useAnalysisReady();
  const [bounds, setBounds] = useState<RestSettingBound[] | null>(null);
  const [table, setTable] = useState<NotchTable | undefined>(undefined);
  const [complaint, setComplaint] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [keep, setKeep] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void (async () => {
      const b = await live.garageBounds().then(fresh).catch(() => null);
      const others = await setupsApi.entries(entry.car).catch(() => []);
      const tb = await learnForCar(svm, others.map(svmOfEntry), b).catch(() => undefined);
      if (!alive) return;
      setBounds(b);
      setTable(tb);
    })();
    return () => {
      alive = false;
    };
  }, [svm, entry.car]);

  const levers = useMemo(() => auditLevers(svm, bounds, table), [svm, bounds, table]);
  const unknown = useMemo(() => unknownLevers(svm, table), [svm, table]);

  const run = async () => {
    const target = analysisTarget();
    if (!target) return;
    setBusy(true);
    setResult(null);
    try {
      const style = styleForPrompt(await readDriverStyle());
      const messages = buildAuditMessages({
        levers,
        setupSummary: buildSetupSummary(svm, entry.name),
        car: entry.car,
        track: entry.circuit,
        complaint,
        style,
        lang: i18n.language,
      });
      const raw = await chat(target.provider, target.model, target.apiKey, messages, 700);
      const r = parseAuditReply(raw, levers);
      if (!r) {
        toastError(t("lab.audit.unreadable"));
        return;
      }
      setResult(r);
      setKeep(new Set(r.changes.map((c) => c.lever)));
    } catch (e) {
      toastError(friendlyError(e, t, target.provider));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!result) return;
    const kept = result.changes.filter((c) => keep.has(c.lever));
    if (!kept.length) return;
    setBusy(true);
    try {
      const byId = new Map(levers.map((l) => [l.lever, l]));
      const patches = applyChanges(
        kept.map((c) => {
          const l = byId.get(c.lever)!;
          return { values: l.values, delta: c.dir * c.steps, max: l.top };
        }),
      );
      const label = kept.map((c) => `${t(`setupAssistant.lever.${c.lever}`)} ${c.dir > 0 ? "+" : "−"}${c.steps}`).join(", ");
      const copy = await createSetupVersion({
        entry,
        patches,
        label: `${t("lab.audit.noteTag")} — ${label}`,
        notes,
        lines: kept.map((c) => `· ${t(`setupAssistant.lever.${c.lever}`)} : ${c.reason}`),
      });
      toastSuccess(t("setupAssistant.created", { name: copy.name }));
      navigate(`/setups/${copy.id}`);
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const byId = new Map(levers.map((l) => [l.lever, l]));

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-muted-foreground">{t("lab.audit.intro")}</p>
      {!ready && <p className="text-xs text-amber-600">{t("lab.audit.noAi")}</p>}
      <UnknownNotchesNote levers={unknown} />
      <textarea
        className="min-h-20 rounded-md border border-border bg-background p-2 text-sm"
        placeholder={t("lab.audit.placeholder")}
        value={complaint}
        maxLength={600}
        onChange={(e) => setComplaint(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!ready || busy || levers.length === 0} onClick={() => void run()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
          {t("lab.audit.run")}
        </Button>
        <span className="text-xs text-muted-foreground">{t("lab.audit.levers", { n: levers.length })}</span>
      </div>

      {result && (
        <div className="flex flex-col gap-2 rounded-md border border-border/60 p-3">
          {result.summary && <p className="font-medium">{result.summary}</p>}
          {result.changes.length === 0 ? (
            <p className="text-muted-foreground">{t("lab.audit.nothing")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {result.changes.map((c) => {
                const l = byId.get(c.lever);
                const v = l?.values[0];
                return (
                  <li key={c.lever} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={keep.has(c.lever)}
                      onChange={(e) =>
                        setKeep((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(c.lever);
                          else n.delete(c.lever);
                          return n;
                        })
                      }
                    />
                    {c.dir > 0 ? <ArrowUp className="h-4 w-4 mt-0.5 text-primary shrink-0" /> : <ArrowDown className="h-4 w-4 mt-0.5 text-primary shrink-0" />}
                    <div className="min-w-0">
                      <div className="font-medium">
                        {t(`setupAssistant.lever.${c.lever}`)} — {t("lab.audit.steps", { count: c.steps, sign: c.dir > 0 ? "+" : "−" })}
                      </div>
                      {v && (
                        <div className="text-xs text-muted-foreground">
                          {paramLabel(v.key)} {v.index}
                          {v.display ? ` (${v.display})` : ""}
                          {l?.top != null ? ` / ${l.top}` : ""}
                        </div>
                      )}
                      {c.reason && <div className="text-xs">{c.reason}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {result.changes.length > 0 && (
            <div>
              <Button size="sm" variant="outline" disabled={busy || keep.size === 0} onClick={() => void create()}>
                <Wand2 className="h-3.5 w-3.5 mr-1" />
                {t("lab.audit.create")}
              </Button>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("lab.audit.disclaimer")}</p>
    </div>
  );
}
