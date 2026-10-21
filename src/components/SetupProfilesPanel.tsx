/**
 * Setups complets par profil (opt-in, Config › Atelier) : à partir du setup
 * ouvert, l'app prépare une version Débutant / Stable / Course / Qualif
 * (+ Pluie), montre chaque réglage changé et pourquoi, puis l'écrit à côté
 * (l'original n'est jamais modifié).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, CloudRain, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTauri, live, setups as setupsApi, type RestSettingBound, type SetupEntry, type SvmFile } from "@/lib/api";
import { fresh } from "@/lib/lmuRest";
import { paramLabel } from "@/lib/setupParams";
import { learnForCar, svmOfEntry, type NotchTable } from "@/lib/setupNotches";
import { unknownLevers } from "@/lib/setupAssistant";
import { UnknownNotchesNote } from "@/components/UnknownNotchesNote";
import { PROFILES, planProfile, profileForStyle, profilePatches, type SetupProfile } from "@/lib/setupProfiles";
import { baseName, createSetupVersion, freeName } from "@/lib/setupVersion";
import { readDriverStyle } from "@/lib/driverStyle";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/stores/dialogs";

export function SetupProfilesPanel({ entry, svm, notes }: { entry: SetupEntry; svm: SvmFile; notes: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<SetupProfile>("race");
  const [wet, setWet] = useState(false);
  const [bounds, setBounds] = useState<RestSettingBound[] | null>(null);
  const [table, setTable] = useState<NotchTable | undefined>(undefined);
  const [taken, setTaken] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void (async () => {
      const style = await readDriverStyle();
      const b = await live.garageBounds().then(fresh).catch(() => null);
      const others = await setupsApi.entries(entry.car).catch(() => []);
      const tb = await learnForCar(svm, others.map(svmOfEntry), b).catch(() => undefined);
      if (!alive) return;
      setProfile(profileForStyle(style));
      setBounds(b);
      setTable(tb);
      setTaken(others.filter((o) => o.circuit === entry.circuit).map((o) => o.name));
    })();
    return () => {
      alive = false;
    };
  }, [svm, entry.car, entry.circuit]);

  const plan = useMemo(() => planProfile(svm, profile, wet, bounds, table), [svm, profile, wet, bounds, table]);
  const effective = plan.filter((c) => c.applied !== 0);
  const unknown = useMemo(() => unknownLevers(svm, table), [svm, table]);
  const name = freeName(
    `${baseName(entry)} ${t(`lab.profiles.p.${profile}`)}${wet ? ` ${t("lab.profiles.wetName")}` : ""}`,
    taken,
  );

  const create = async () => {
    if (!effective.length) return;
    setBusy(true);
    try {
      const copy = await createSetupVersion({
        entry,
        patches: profilePatches(plan),
        name,
        label: `${t("lab.profiles.noteTag")} ${t(`lab.profiles.p.${profile}`)}${wet ? ` + ${t("lab.profiles.wetName")}` : ""}`,
        notes,
        lines: effective.map(
          (c) =>
            `· ${t(`setupAssistant.lever.${c.lever}`)} ${c.applied > 0 ? "+" : "−"}${Math.abs(c.applied)} : ${t(`lab.profiles.why.${c.lever}.${c.applied > 0 ? "up" : "down"}`)}`,
        ),
      });
      toastSuccess(t("setupAssistant.created", { name: copy.name }));
      navigate(`/setups/${copy.id}`);
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-muted-foreground">{t("lab.profiles.intro")}</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {PROFILES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setProfile(p)}
            className={cn(
              "rounded-md border p-2.5 text-left transition-colors",
              profile === p ? "border-primary bg-primary/10" : "border-border hover:bg-accent/40",
            )}
          >
            <div className="font-semibold">{t(`lab.profiles.p.${p}`)}</div>
            <div className="text-xs text-muted-foreground">{t(`lab.profiles.d.${p}`)}</div>
          </button>
        ))}
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={wet} onChange={(e) => setWet(e.target.checked)} />
        <CloudRain className="h-4 w-4 text-sky-500" />
        {t("lab.profiles.wet")}
      </label>

      <UnknownNotchesNote levers={unknown} />
      {plan.length === 0 ? (
        !unknown.length && <p className="text-muted-foreground">{t("lab.profiles.none")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {plan.map((c) => {
            const v = c.values[0];
            const limited = c.applied !== c.wanted;
            return (
              <li key={c.lever} className={cn("flex items-start gap-2 rounded-md border border-border/60 p-2", c.applied === 0 && "opacity-50")}>
                {c.wanted > 0 ? <ArrowUp className="h-4 w-4 mt-0.5 text-primary shrink-0" /> : <ArrowDown className="h-4 w-4 mt-0.5 text-primary shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {t(`setupAssistant.lever.${c.lever}`)} — {t("lab.audit.steps", { count: Math.abs(c.applied), sign: c.applied >= 0 ? "+" : "−" })}
                    {limited && <span className="ml-2 text-xs text-amber-600">{t("lab.profiles.limited", { n: Math.abs(c.wanted) })}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {paramLabel(v.key)} {v.index}
                    {v.display ? ` (${v.display})` : ""}
                    {c.top != null ? ` / ${c.top}` : ""}
                    {c.inferred ? ` · ${t("lab.notch.inferred")}` : ""}
                  </div>
                  <div className="text-xs">{t(`lab.profiles.why.${c.lever}.${c.wanted > 0 ? "up" : "down"}`)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button size="sm" disabled={busy || effective.length === 0} onClick={() => void create()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
          {t("lab.profiles.create")}
        </Button>
        <span className="text-xs text-muted-foreground font-mono">{name}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t("lab.profiles.disclaimer")}</p>
    </div>
  );
}
