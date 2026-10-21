/**
 * Réglages restés « par défaut » dont le cran est inconnu (le `.svm` ne garde que
 * le texte affiché) : on le dit, avec la marche à suivre, au lieu de laisser
 * croire que la voiture ne les règle pas. Partagé par l'assistant, l'audit IA
 * et les profils.
 */
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import type { LeverId } from "@/lib/setupAssistant";

export function UnknownNotchesNote({ levers }: { levers: LeverId[] }) {
  const { t } = useTranslation();
  if (!levers.length) return null;
  const list = levers.map((l) => t(`setupAssistant.lever.${l}`)).join(", ");
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
      <div>
        <p className="font-medium">{t("lab.notch.unknownTitle", { count: levers.length })}</p>
        <p className="text-muted-foreground">{t("lab.notch.unknownText", { list })}</p>
      </div>
    </div>
  );
}
