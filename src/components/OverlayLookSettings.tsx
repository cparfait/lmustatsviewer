/**
 * Apparence des overlays (page Overlays) : style Classique / Instrument et options
 * d'affichage communes à tous les widgets (fenêtre overlay et widgets servis).
 *
 * Tout est désactivé par défaut : le style Classique reste l'apparence historique.
 * Voir `components/overlay/look.ts`.
 */

import { useTranslation } from "react-i18next";
import { Palette } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useOverlaysStore } from "@/stores/overlays";
import type { OverlayDensity, OverlayStyle } from "@/components/overlay/look";

function Option({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function OverlayLookSettings() {
  const { t } = useTranslation();
  const look = useOverlaysStore((s) => s.cfg.look);
  const setLook = useOverlaysStore((s) => s.setLook);
  const instrument = look.style === "instrument";

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-start gap-3">
        <Palette className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <h3 className="font-semibold">{t("overlays.look.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("overlays.look.desc")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <Option title={t("overlays.look.style")} hint={t("overlays.look.styleHint")}>
          <Select
            value={look.style}
            onValueChange={(v) => setLook({ style: v as OverlayStyle })}
            ariaLabel={t("overlays.look.style")}
            className="h-8 w-36 px-2.5 text-xs"
            options={[
              { value: "classic", label: t("overlays.look.styleClassic") },
              { value: "instrument", label: t("overlays.look.styleInstrument") },
            ]}
          />
        </Option>
        <Option title={t("overlays.look.density")} hint={t("overlays.look.densityHint")}>
          <Select
            value={look.density}
            disabled={!instrument}
            onValueChange={(v) => setLook({ density: v as OverlayDensity })}
            ariaLabel={t("overlays.look.density")}
            className="h-8 w-36 px-2.5 text-xs"
            options={[
              { value: "compact", label: t("overlays.look.densityCompact") },
              { value: "normal", label: t("overlays.look.densityNormal") },
              { value: "cosy", label: t("overlays.look.densityCosy") },
            ]}
          />
        </Option>
        <Option title={t("overlays.look.displayFont")} hint={t("overlays.look.displayFontHint")}>
          <Switch checked={look.displayFont} onCheckedChange={(v: boolean) => setLook({ displayFont: v })} />
        </Option>
        <Option title={t("overlays.look.sharpScale")} hint={t("overlays.look.sharpScaleHint")}>
          <Switch checked={look.sharpScale} onCheckedChange={(v: boolean) => setLook({ sharpScale: v })} />
        </Option>
        <Option title={t("overlays.look.texture")} hint={t("overlays.look.textureHint")}>
          <Switch
            checked={look.texture}
            disabled={!instrument}
            onCheckedChange={(v: boolean) => setLook({ texture: v })}
          />
        </Option>
        <Option title={t("overlays.look.recordFx")} hint={t("overlays.look.recordFxHint")}>
          <Switch checked={look.recordFx} onCheckedChange={(v: boolean) => setLook({ recordFx: v })} />
        </Option>
      </div>
    </Card>
  );
}
