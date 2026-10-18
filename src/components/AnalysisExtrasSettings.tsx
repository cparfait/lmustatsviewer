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
import { Bell, Bookmark, Gauge, Loader2, ShieldCheck, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { config, isTauri, type WheelBinding } from "@/lib/api";
import {
  FLAG_COMPARABLE,
  FLAG_RECORD_BEEPS,
  FLAG_REGULARITY,
  FLAG_REVIEW_MARKS,
  setConfigFlag,
  useConfigFlag,
} from "@/lib/configFlag";
import { recordBeeps } from "@/lib/radioFx";
import { MARK_BINDINGS_EVENT, MARK_KEY_KEY, MARK_WHEEL_KEY } from "@/lib/reviewMarks";

function FlagRow({ flag, icon, title, desc, children }: { flag: string; icon: React.ReactNode; title: string; desc: string; children?: React.ReactNode }) {
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
