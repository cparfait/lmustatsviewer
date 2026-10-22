/**
 * Options d'analyse (veille 2026-10-17), toutes désactivées par défaut, rangées là où
 * elles agissent :
 * - Préférences › Détail des séances : onglet « Régularité », badge « tours comparables » ;
 * - Audio / Voix › Annonces : annonces de record au volant (phrase ou bips) ;
 * - Audio / Voix › Parler à l'ingénieur : repères de revue (raccourci et/ou bouton du volant).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Activity, Bell, Waypoints, Bookmark, BookOpenCheck, CircleDot, FolderSearch, Gauge, History, Link2, Loader2, ShieldCheck, Target, Timer, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { config, isTauri, type WheelBinding } from "@/lib/api";
import {
  FLAG_COMPARABLE,
  FLAG_CONSISTENCY_DOTS,
  FLAG_EVIDENCE_CARDS,
  FLAG_FINE_CORNERS,
  FLAG_OFFICIAL_LAPS,
  FLAG_PEAK_PEDALS,
  FLAG_BEST_SESSION,
  FLAG_RECORD_BEEPS,
  FLAG_REGULARITY,
  FLAG_REVIEW_MARKS,
  FLAG_TELEM_DIAG,
  FLAG_TELEM_LINK,
  FLAG_WEEKLY_GOALS,
  setConfigFlag,
  useConfigFlag,
} from "@/lib/configFlag";
import { GOAL_DEFAULTS, GOAL_KEYS, GOAL_MAX, parseGoal, type GoalKind } from "@/lib/weeklyGoals";
import { recordBeeps } from "@/lib/radioFx";
import { MARK_BINDINGS_EVENT, MARK_KEY_KEY, MARK_WHEEL_KEY } from "@/lib/reviewMarks";

export function FlagRow({ flag, icon, title, desc, children }: { flag: string; icon: React.ReactNode; title: string; desc: string; children?: React.ReactNode }) {
  const on = useConfigFlag(flag);
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 text-primary">{icon}</span>
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>
        </div>
        <Switch checked={on} onCheckedChange={(v: boolean) => void setConfigFlag(flag, v)} />
      </div>
      {on && children}
    </div>
  );
}

/** Raccourci au format accélérateur Tauri (« Control+Alt+K »), saisi au clavier. */
function toAccelerator(e: React.KeyboardEvent): string | null {
  const key = e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Control");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  const k = key.length === 1 ? key.toUpperCase() : key === " " ? "Space" : key;
  if (!parts.length && !/^F\d{1,2}$/.test(k)) return null; // une touche seule hors F1-F24 gênerait la saisie
  return [...parts, k].join("+");
}

function MarkBindings() {
  const { t } = useTranslation();
  const [accel, setAccel] = useState("");
  const [wheel, setWheel] = useState<WheelBinding | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [waitingKey, setWaitingKey] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    void config.get(MARK_KEY_KEY).then((v) => setAccel(v ?? ""));
    void config.get(MARK_WHEEL_KEY).then((v) => {
      try {
        setWheel(v ? (JSON.parse(v) as WheelBinding) : null);
      } catch {
        setWheel(null);
      }
    });
  }, []);

  const saveAccel = async (v: string) => {
    setAccel(v);
    await config.set(MARK_KEY_KEY, v).catch(() => {});
    window.dispatchEvent(new Event(MARK_BINDINGS_EVENT));
  };
  const saveWheel = async (b: WheelBinding | null) => {
    setWheel(b);
    await config.set(MARK_WHEEL_KEY, b ? JSON.stringify(b) : "").catch(() => {});
    window.dispatchEvent(new Event(MARK_BINDINGS_EVENT));
  };
  const captureWheel = async () => {
    setCapturing(true);
    try {
      const b = await invoke<WheelBinding | null>("wheel_capture", { timeoutMs: 10000 });
      if (b) await saveWheel(b);
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="space-y-2 pl-7 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-muted-foreground">{t("extras.markKey")}</span>
        <input
          readOnly
          value={waitingKey ? t("extras.pressKeys") : accel || t("extras.none")}
          onFocus={() => setWaitingKey(true)}
          onBlur={() => setWaitingKey(false)}
          onKeyDown={(e) => {
            e.preventDefault();
            const a = toAccelerator(e);
            if (a) {
              void saveAccel(a);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-7 w-44 rounded-md border border-border bg-background px-2 font-mono"
        />
        {accel && (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void saveAccel("")} aria-label={t("extras.clear")}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-muted-foreground">{t("extras.markWheel")}</span>
        <span className="font-mono">{wheel ? wheel.label : t("extras.none")}</span>
        <Button size="sm" variant="outline" className="h-7 gap-1 px-2" disabled={capturing} onClick={() => void captureWheel()}>
          {capturing && <Loader2 className="h-3 w-3 animate-spin" />}
          {capturing ? t("extras.pressWheel") : t("extras.assign")}
        </Button>
        {wheel && (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void saveWheel(null)} aria-label={t("extras.clear")}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Préférences › « Détail des séances » : onglet Régularité et badge « tours comparables ». */
export function SessionDetailSettings() {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div>
        <h3 className="font-semibold">{t("extras.detailTitle")}</h3>
        <p className="text-xs text-muted-foreground">{t("extras.detailDesc")}</p>
      </div>
      <FlagRow flag={FLAG_REGULARITY} icon={<Gauge className="h-4 w-4" />} title={t("extras.regTitle")} desc={t("extras.regDesc")} />
      <FlagRow flag={FLAG_COMPARABLE} icon={<ShieldCheck className="h-4 w-4" />} title={t("extras.cmpTitle")} desc={t("extras.cmpDesc")} />
    </div>
  );
}

/** Audio / Voix › Annonces : records au volant (phrase de l'ingénieur ou bips). */
export function RecordAnnounceSetting() {
  const { t } = useTranslation();
  return (
    <FlagRow flag={FLAG_RECORD_BEEPS} icon={<Bell className="h-4 w-4" />} title={t("extras.beepsTitle")} desc={t("extras.beepsDesc")}>
      <div className="flex flex-wrap gap-2 pl-7">
        {([1, 2, 3] as const).map((n) => (
          <Button key={n} size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => recordBeeps(n)}>
            <Volume2 className="h-3 w-3" />
            {t(`extras.beepTest${n}`)}
          </Button>
        ))}
      </div>
    </FlagRow>
  );
}

/** Audio / Voix › Parler à l'ingénieur : repères de revue (raccourci et bouton du volant). */
export function ReviewMarksSetting() {
  const { t } = useTranslation();
  return (
    <FlagRow flag={FLAG_REVIEW_MARKS} icon={<Bookmark className="h-4 w-4" />} title={t("extras.marksSettingTitle")} desc={t("extras.marksSettingDesc")}>
      <MarkBindings />
    </FlagRow>
  );
}

/** Cibles des objectifs de la semaine (une cible à 0 masque l'objectif). */
function WeeklyGoalTargets() {
  const { t } = useTranslation();
  const [vals, setVals] = useState<Record<GoalKind, number>>(GOAL_DEFAULTS);
  useEffect(() => {
    if (!isTauri()) return;
    for (const k of Object.keys(GOAL_KEYS) as GoalKind[]) {
      void config.get(GOAL_KEYS[k]).then((v) => setVals((o) => ({ ...o, [k]: parseGoal(k, v) })));
    }
  }, []);
  const save = (k: GoalKind, raw: string) => {
    const v = parseGoal(k, raw);
    setVals((o) => ({ ...o, [k]: v }));
    void config.set(GOAL_KEYS[k], String(v)).catch(() => {});
    window.dispatchEvent(new Event(GOALS_EVENT));
  };
  return (
    <div className="flex flex-wrap gap-3 pl-7 text-xs">
      {(Object.keys(GOAL_KEYS) as GoalKind[]).map((k) => (
        <label key={k} className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{t(`news.goal_${k}`)}</span>
          <input
            type="number"
            min={0}
            max={GOAL_MAX[k]}
            value={vals[k]}
            onChange={(e) => save(k, e.target.value)}
            className="h-7 w-20 rounded-md border border-border bg-background px-2 tabular-nums"
          />
        </label>
      ))}
    </div>
  );
}

/** Prévient le tableau de bord qu'une cible a changé. */
export const GOALS_EVENT = "lmusv:weekly-goals";

/**
 * Préférences › Affichage › « Analyse : nouveautés » (veille 2026-10-21) : chaque
 * nouveauté a son interrupteur, toutes désactivées par défaut ; rien ne change tant
 * qu'on ne les active pas.
 */
export function AnalysisNewsSettings() {
  const { t } = useTranslation();
  return (
    <div className="mt-6 space-y-2">
      <div>
        <h3 className="font-semibold">{t("news.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("news.desc")}</p>
      </div>
      <FlagRow flag={FLAG_TELEM_LINK} icon={<Link2 className="h-4 w-4" />} title={t("news.linkTitle")} desc={t("news.linkDesc")} />
      <FlagRow flag={FLAG_OFFICIAL_LAPS} icon={<Timer className="h-4 w-4" />} title={t("news.lapsTitle")} desc={t("news.lapsDesc")} />
      <FlagRow flag={FLAG_EVIDENCE_CARDS} icon={<BookOpenCheck className="h-4 w-4" />} title={t("news.cardsTitle")} desc={t("news.cardsDesc")} />
      <FlagRow flag={FLAG_CONSISTENCY_DOTS} icon={<CircleDot className="h-4 w-4" />} title={t("news.dotsTitle")} desc={t("news.dotsDesc")} />
      <FlagRow flag={FLAG_BEST_SESSION} icon={<History className="h-4 w-4" />} title={t("news.bestTitle")} desc={t("news.bestDesc")} />
      <FlagRow flag={FLAG_WEEKLY_GOALS} icon={<Target className="h-4 w-4" />} title={t("news.goalsTitle")} desc={t("news.goalsDesc")}>
        <WeeklyGoalTargets />
      </FlagRow>
      <FlagRow flag={FLAG_FINE_CORNERS} icon={<Waypoints className="h-4 w-4" />} title={t("news.fineTitle")} desc={t("news.fineDesc")} />
      <FlagRow flag={FLAG_PEAK_PEDALS} icon={<Activity className="h-4 w-4" />} title={t("news.peakTitle")} desc={t("news.peakDesc")} />
      <FlagRow flag={FLAG_TELEM_DIAG} icon={<FolderSearch className="h-4 w-4" />} title={t("news.diagTitle")} desc={t("news.diagDesc")} />
    </div>
  );
}
