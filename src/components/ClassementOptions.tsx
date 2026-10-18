/**
 * Options de la page Classement (Configuration › Sessions › options du module).
 *
 * Source des paliers de rythme (Alien → Hors rythme) : feuille ohne_speed (défaut,
 * comportement historique) ou base communautaire (moyenne des 5 meilleurs pilotes du
 * combo sur la version la plus récente). Si la base est injoignable ou n'a pas de
 * données, l'app retombe sur la feuille.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { config, isTauri } from "@/lib/api";
import { setTierSource, TIER_SOURCE_KEY, type TierSource } from "@/lib/ohne_speed";
import { INSIGHTS_KEY } from "@/routes/ClassementInsights";

export function TierSourceSelect() {
  const { t } = useTranslation();
  const [src, setSrc] = useState<TierSource>("ohne");

  useEffect(() => {
    if (!isTauri()) return;
    void config.get(TIER_SOURCE_KEY).then((v) => setSrc(v === "community" ? "community" : "ohne"));
  }, []);

  const change = (v: string) => {
    const next: TierSource = v === "community" ? "community" : "ohne";
    setSrc(next);
    setTierSource(next);
    void config.set(TIER_SOURCE_KEY, next).catch(() => {});
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium">{t("config.tierSource")}</div>
        <Select
          value={src}
          onValueChange={change}
          ariaLabel={t("config.tierSource")}
          className="h-8 max-w-[220px]"
          options={[
            { value: "ohne", label: t("config.tierSourceOhne") },
            { value: "community", label: t("config.tierSourceCommunity") },
          ]}
        />
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{t("config.tierSourceDesc")}</p>
    </div>
  );
}

/**
 * Onglets communautaires avancés de la page Classement (Index voitures, Effet du patch,
 * Rival de la semaine). Désactivés par défaut.
 */
export function InsightsToggle() {
  const { t } = useTranslation();
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    void config.get(INSIGHTS_KEY).then((v) => setOn(v === "1"));
  }, []);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium">{t("config.insights")}</div>
        <Switch
          checked={on}
          onCheckedChange={(v: boolean) => {
            setOn(v);
            void config.set(INSIGHTS_KEY, v ? "1" : "0").catch(() => {});
          }}
        />
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{t("config.insightsDesc")}</p>
    </div>
  );
}
