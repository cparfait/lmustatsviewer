import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, CheckCircle2, FlaskConical, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { isTauri, live, setups as setupsApi, type RestSettingBound, type SetupEntry, type SetupSessionMatch, type SvmFile } from "@/lib/api";
import { fresh } from "@/lib/lmuRest";
import { paramLabel } from "@/lib/setupParams";
import { applyStep, nextVersionName, PHASED, recommend, unknownLevers, type Phase, type Recommendation, type Regime, type Symptom } from "@/lib/setupAssistant";
import { learnForCar, svmOfEntry, type NotchTable } from "@/lib/setupNotches";
import { usePageState } from "@/lib/usePageState";
import { UnknownNotchesNote } from "@/components/UnknownNotchesNote";
import { formatTime } from "@/lib/utils";
import { toastError, toastSuccess } from "@/stores/dialogs";

const SYMPTOMS: Symptom[] = ["understeer", "oversteer", "brakeInstability", "bottoming", "kerbs", "topSpeed", "lowGrip"];

/** Parent noté dans la lignée (« … ← #123 »), pour le verdict mesuré. */
const PARENT_RX = /←\s*#(\d+)/g;

function parentId(notes: string | null): number | null {
  const all = [...(notes ?? "").matchAll(PARENT_RX)];
  return all.length ? Number(all[all.length - 1][1]) : null;
}

/**
 * Assistant setup : symptôme → un réglage à la fois, d'un cran, écrit dans une
 * NOUVELLE version du setup (jamais d'écrasement), avec la lignée dans les
 * notes. Puis verdict : ressenti du pilote + chrono mesuré (sessions liées).
 */
export function SetupAssistantPanel({ entry, svm, notes, onNotes }: { entry: SetupEntry; svm: SvmFile; notes: string | null; onNotes: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [symptom, setSymptom] = usePageState<Symptom>("setupAssistant.symptom", "understeer");
  const [phase, setPhase] = usePageState<Phase>("setupAssistant.phase", "entry");
  const [regime, setRegime] = usePageState<Regime>("setupAssistant.regime", "slow");
  const [bounds, setBounds] = useState<RestSettingBound[] | null>(null);
  const [table, setTable] = useState<NotchTable | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // Limites réelles des réglages, si le jeu tourne avec cette voiture au garage.
  useEffect(() => {
    if (!isTauri()) return;
    void live
      .garageBounds()
      .then((b) => setBounds(fresh(b)))
      .catch(() => {});
  }, []);

  // Table des crans de la voiture : retrouve l'index des réglages restés « par
  // défaut » (le fichier n'en garde que l'affichage), sinon ils seraient ignorés.
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void (async () => {
      const others = await setupsApi.entries(entry.car).catch(() => []);
      const t = await learnForCar(svm, others.map(svmOfEntry), bounds).catch(() => undefined);
      if (alive) setTable(t);
    })();
    return () => {
      alive = false;
    };
  }, [svm, entry.car, bounds]);

  const recs = useMemo(() => recommend(svm, symptom, phase, regime, bounds, 3, table), [svm, symptom, phase, regime, bounds, table]);
  const unknown = useMemo(() => unknownLevers(svm, table), [svm, table]);
  const symptomLabel = t(`setupAssistant.symptom.${symptom}`) + (PHASED.includes(symptom) ? ` · ${t(`setupAssistant.phase.${phase}`)}` : "") + ` · ${t(`setupAssistant.regime.${regime}`)}`;

  const tryLever = async (r: Recommendation) => {
    setBusy(true);
    try {
      const name = nextVersionName(entry.name.replace(/\.svm$/i, ""));
      const copy = await setupsApi.duplicate(entry.id, name);
      await setupsApi.update({ id: copy.id, sections: applyStep(svm, r) });
      const sign = r.dir > 0 ? "+1" : "−1";
      const line = `${name} ← #${entry.id} : ${paramLabel(r.values[0].key)} ${sign} (${symptomLabel})`;
      await setupsApi.setNotes(copy.id, notes ? `${notes}\n${line}` : line);
      toastSuccess(t("setupAssistant.created", { name }));
      navigate(`/setups/${copy.id}`);
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const verdict = async (v: "better" | "same" | "worse") => {
    const line = `${t("setupAssistant.verdictNote")} : ${t(`setupAssistant.v.${v}`)} (${new Date().toISOString().slice(0, 10)})`;
    try {
      await setupsApi.setNotes(entry.id, notes ? `${notes}\n${line}` : line);
      onNotes();
    } catch (e) {
      toastError(String(e));
    }
  };

  const parent = parentId(notes);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-muted-foreground">{t("setupAssistant.intro")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select
          value={symptom}
          onValueChange={(v) => setSymptom(v as Symptom)}
          ariaLabel={t("setupAssistant.symptomLabel")}
          options={SYMPTOMS.map((s) => ({ value: s, label: t(`setupAssistant.symptom.${s}`) }))}
        />
        <Select
          value={phase}
          disabled={!PHASED.includes(symptom)}
          onValueChange={(v) => setPhase(v as Phase)}
          ariaLabel={t("setupAssistant.phaseLabel")}
          options={(["entry", "mid", "exit"] as Phase[]).map((p) => ({ value: p, label: t(`setupAssistant.phase.${p}`) }))}
        />
        <Select
          value={regime}
          onValueChange={(v) => setRegime(v as Regime)}
          ariaLabel={t("setupAssistant.regimeLabel")}
          options={(["slow", "fast"] as Regime[]).map((r) => ({ value: r, label: t(`setupAssistant.regime.${r}`) }))}
        />
      </div>

      <UnknownNotchesNote levers={unknown} />
      {recs.length === 0 ? (
        !unknown.length && <p className="text-muted-foreground">{t("setupAssistant.none")}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {recs.map((r, i) => (
            <li key={r.lever} className="flex items-center gap-3 rounded-md border border-border/60 p-2.5">
              <span className="text-xs font-bold text-primary w-5 shrink-0">{i + 1}</span>
              {r.dir > 0 ? <ArrowUp className="h-4 w-4 text-primary shrink-0" /> : <ArrowDown className="h-4 w-4 text-primary shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {t(`setupAssistant.lever.${r.lever}`)} — {t(r.dir > 0 ? "setupAssistant.up" : "setupAssistant.down")}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.values.map((v) => `${paramLabel(v.key)} ${v.index}${v.display ? ` (${v.display})` : ""}${r.max != null ? ` / ${r.max}` : ""}`).join(" · ")}
                  {r.inferred && <span title={t("setupAssistant.inferredHint")}> · {t("setupAssistant.inferred")}</span>}
                </div>
              </div>
              {r.atLimit ? (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 shrink-0">
                  <Lock className="h-3.5 w-3.5" />
                  {t("setupAssistant.atLimit")}
                </span>
              ) : (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void tryLever(r)}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5 mr-1" />}
                  {t("setupAssistant.try")}
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">{t("setupAssistant.oneAtATime")}</p>

      <div className="border-t border-border/60 pt-3 flex flex-col gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-primary">{t("setupAssistant.verdictTitle")}</h4>
        <ul className="text-xs text-muted-foreground list-disc pl-5">
          <li>{t("setupAssistant.check1")}</li>
          <li>{t("setupAssistant.check2")}</li>
          <li>{t("setupAssistant.check3")}</li>
        </ul>
        {parent != null && <MeasuredVerdict parentId={parent} entry={entry} />}
        <div className="flex gap-2">
          {(["better", "same", "worse"] as const).map((v) => (
            <Button key={v} size="sm" variant="outline" onClick={() => void verdict(v)}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              {t(`setupAssistant.v.${v}`)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Meilleur tour et secteurs des sessions liées : version précédente vs celle-ci. */
function MeasuredVerdict({ parentId, entry }: { parentId: number; entry: SetupEntry }) {
  const { t } = useTranslation();
  const [pair, setPair] = useState<[SetupSessionMatch | null, SetupSessionMatch | null] | null>(null);
  useEffect(() => {
    void (async () => {
      const parent = await setupsApi.get(parentId).catch(() => null);
      const a = parent?.linked_session_id ? await setupsApi.getSessionSummary(parent.linked_session_id).catch(() => null) : null;
      const b = entry.linked_session_id ? await setupsApi.getSessionSummary(entry.linked_session_id).catch(() => null) : null;
      setPair([a, b]);
    })();
  }, [parentId, entry.linked_session_id]);
  if (!pair) return null;
  const [a, b] = pair;
  if (!a?.best_lap || !b?.best_lap) return <p className="text-xs text-muted-foreground">{t("setupAssistant.linkBoth")}</p>;
  const d = b.best_lap - a.best_lap;
  const sec = (x: number | null, y: number | null) => (x && y ? `${y - x > 0 ? "+" : ""}${(y - x).toFixed(3)}` : "—");
  return (
    <p className="text-xs">
      {t("setupAssistant.measured", { a: formatTime(a.best_lap), b: formatTime(b.best_lap), d: `${d > 0 ? "+" : ""}${d.toFixed(3)}` })}{" "}
      <span className="text-muted-foreground">
        S1 {sec(a.best_lap_s1, b.best_lap_s1)} · S2 {sec(a.best_lap_s2, b.best_lap_s2)} · S3 {sec(a.best_lap_s3, b.best_lap_s3)}
      </span>
    </p>
  );
}
