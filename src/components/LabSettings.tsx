/**
 * Config › Atelier : outils de setup et d'analyse issus de la veille, tous
 * désactivés par défaut. Un interrupteur par option ; le style du pilote se
 * choisit sous son interrupteur.
 */
import { useTranslation } from "react-i18next";
import { Activity, Award, Gauge, Lock, Map as MapIcon, Radio, Scissors, Sparkles, UserRound, Wand2, Wrench } from "lucide-react";
import { FlagRow } from "@/components/AnalysisExtrasSettings";
import {
  FLAG_ACHIEVEMENTS,
  FLAG_AIDS_ZONES,
  FLAG_BOX_DEBRIEF,
  FLAG_DRIVER_STYLE,
  FLAG_FIXED_SETUP,
  FLAG_PLATFORM_WATCH,
  FLAG_RADIO_SPLIT,
  FLAG_SETUP_AUDIT,
  FLAG_SETUP_PLATES,
  FLAG_SETUP_PROFILES,
  FLAG_STREAM_EVENTS,
} from "@/lib/configFlag";
import { setDriverStyle, useDriverStyleValue, type DriverStyle } from "@/lib/driverStyle";
import { cn } from "@/lib/utils";

const STYLES: DriverStyle[] = ["stable", "lively", "aggressive", ""];

function StylePicker() {
  const { t } = useTranslation();
  const value = useDriverStyleValue();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
      {STYLES.map((s) => (
        <button
          key={s || "none"}
          type="button"
          onClick={() => void setDriverStyle(s)}
          aria-pressed={value === s}
          className={cn(
            "rounded-md border p-2 text-left text-xs transition-colors",
            value === s ? "border-primary bg-primary/10" : "border-border hover:bg-accent/40",
          )}
        >
          <div className="font-semibold text-sm">{t(`lab.settings.style.${s || "none"}`)}</div>
          {s && <div className="text-muted-foreground">{t(`lab.settings.styleD.${s}`)}</div>}
        </button>
      ))}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-micro font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

export function LabSettings() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {/* Le titre « Atelier » est déjà dans l'en-tête de la catégorie. */}
      <p className="text-xs text-muted-foreground">{t("lab.settings.desc")}</p>

      <Group title={t("lab.settings.groupSetup")}>
        <FlagRow flag={FLAG_SETUP_AUDIT} icon={<Sparkles className="h-4 w-4" />} title={t("lab.settings.auditTitle")} desc={t("lab.settings.auditDesc")} />
        <FlagRow flag={FLAG_SETUP_PROFILES} icon={<Wand2 className="h-4 w-4" />} title={t("lab.settings.profilesTitle")} desc={t("lab.settings.profilesDesc")} />
        <FlagRow flag={FLAG_SETUP_PLATES} icon={<MapIcon className="h-4 w-4" />} title={t("lab.settings.platesTitle")} desc={t("lab.settings.platesDesc")} />
      </Group>

      <Group title={t("lab.settings.groupDriver")}>
        <FlagRow flag={FLAG_DRIVER_STYLE} icon={<UserRound className="h-4 w-4" />} title={t("lab.settings.styleTitle")} desc={t("lab.settings.styleDesc")}>
          <StylePicker />
        </FlagRow>
        <FlagRow flag={FLAG_ACHIEVEMENTS} icon={<Award className="h-4 w-4" />} title={t("lab.settings.achTitle")} desc={t("lab.settings.achDesc")} />
      </Group>

      <Group title={t("lab.settings.groupTrack")}>
        <FlagRow flag={FLAG_BOX_DEBRIEF} icon={<Wrench className="h-4 w-4" />} title={t("lab.settings.boxTitle")} desc={t("lab.settings.boxDesc")} />
        <FlagRow flag={FLAG_FIXED_SETUP} icon={<Lock className="h-4 w-4" />} title={t("lab.settings.fixedTitle")} desc={t("lab.settings.fixedDesc")} />
      </Group>

      <Group title={t("lab.settings.groupAnalysis")}>
        <FlagRow flag={FLAG_AIDS_ZONES} icon={<Activity className="h-4 w-4" />} title={t("lab.settings.aidsTitle")} desc={t("lab.settings.aidsDesc")} />
        <FlagRow flag={FLAG_PLATFORM_WATCH} icon={<Gauge className="h-4 w-4" />} title={t("lab.settings.platformTitle")} desc={t("lab.settings.platformDesc")} />
      </Group>

      <Group title={t("lab.settings.groupRadio")}>
        <FlagRow flag={FLAG_RADIO_SPLIT} icon={<Scissors className="h-4 w-4" />} title={t("lab.settings.radioSplitTitle")} desc={t("lab.settings.radioSplitDesc")} />
        <FlagRow flag={FLAG_STREAM_EVENTS} icon={<Radio className="h-4 w-4" />} title={t("lab.settings.streamTitle")} desc={t("lab.settings.streamDesc")} />
      </Group>
    </div>
  );
}
