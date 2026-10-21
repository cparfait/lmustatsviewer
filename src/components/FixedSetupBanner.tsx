/**
 * Bandeau « setup imposé par le serveur » (Atelier, opt-in) : le jeu signale
 * `mIsFixedSetup`, le garage est fermé ; seuls les réglages au volant restent.
 */
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { FLAG_FIXED_SETUP, useConfigFlag } from "@/lib/configFlag";

export function FixedSetupBanner({ fixed }: { fixed: boolean | null | undefined }) {
  const { t } = useTranslation();
  const on = useConfigFlag(FLAG_FIXED_SETUP);
  if (!on || fixed !== true) return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-6 py-1.5 text-xs text-amber-700 dark:text-amber-300">
      <Lock className="h-3.5 w-3.5 shrink-0" />
      <span className="font-semibold">{t("lab.fixed.title")}</span>
      <span className="text-muted-foreground">{t("lab.fixed.text")}</span>
    </div>
  );
}
