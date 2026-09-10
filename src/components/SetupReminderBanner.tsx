import { useTranslation } from "react-i18next";
import { AlertTriangle, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app";

/**
 * Bannière affichée quand l'utilisateur a **passé** l'onboarding : l'app est
 * utilisable (démo, découverte, PC sans Le Mans Ultimate) mais aucune donnée
 * n'est indexée. Un clic rouvre l'assistant de configuration.
 */
export function SetupReminderBanner() {
  const { t } = useTranslation();
  const resumeOnboarding = useAppStore((s) => s.resumeOnboarding);

  return (
    <div className="border-b border-warning/30 bg-warning/10">
      <div className="mx-auto max-w-[1800px] px-4 py-2 flex items-center gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
        <span>{t("onboarding.notConfigured")}</span>
        <Button
          size="sm"
          className="ml-auto gap-1.5"
          onClick={resumeOnboarding}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t("onboarding.configureNow")}
        </Button>
      </div>
    </div>
  );
}
