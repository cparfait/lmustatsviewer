/**
 * Apparence des overlays (bouton « Apparence » de la page Overlays) : style Classique /
 * Instrument et options d'affichage communes à tous les widgets (fenêtre overlay et
 * widgets servis), avec un aperçu en direct sur des données d'exemple.
 *
 * Tout est désactivé par défaut : le style Classique reste l'apparence historique.
 * Voir `components/overlay/look.ts`.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useOverlaysStore } from "@/stores/overlays";
import { OVERLAY_BY_ID, type OverlayId } from "@/lib/overlays";
import { WIDGETS } from "@/components/overlay/widgets";
import { sampleLiveData } from "@/components/overlay/sampleData";
import {
  lookClasses,
  OverlayLookContext,
  type OverlayDensity,
  type OverlayStyle,
} from "@/components/overlay/look";

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
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const PREVIEW: OverlayId[] = ["standings", "sectors", "telemetry"];

/** Aperçu en direct de quelques widgets avec l'apparence choisie. */
function LookPreview() {
  const { t } = useTranslation();
  const look = useOverlaysStore((s) => s.cfg.look);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 50);
    return () => clearInterval(id);
  }, []);
  const data = sampleLiveData(tick);
  return (
    <OverlayLookContext.Provider value={look}>
      <div
        className={`flex flex-wrap items-start gap-4 rounded-lg p-4 ${lookClasses(look)}`}
        style={{ background: "linear-gradient(135deg, #2a3140, #151a22)" }}
      >
        {PREVIEW.map((id) => {
          const Widget = WIDGETS[id];
          return <Widget key={id} data={data} content={{}} accent={OVERLAY_BY_ID[id].accent} t={t} />;
        })}
      </div>
    </OverlayLookContext.Provider>
  );
}

/** Fenêtre des réglages d'apparence, ouverte par le bouton « Apparence ». */
export function OverlayLookDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const look = useOverlaysStore((s) => s.cfg.look);
  const setLook = useOverlaysStore((s) => s.setLook);
  const instrument = look.style === "instrument";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <Card
        className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">{t("overlays.look.title")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("overlays.look.desc")}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label={t("overlays.look.close")}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
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

          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("overlays.look.preview")}</p>
            <p className="text-xs text-muted-foreground">{t("overlays.look.previewHint")}</p>
            <LookPreview />
          </div>
        </div>
      </Card>
    </div>
  );
}
