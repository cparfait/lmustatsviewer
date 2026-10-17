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
import type { LiveData } from "@/lib/api";
import { WIDGETS } from "@/components/overlay/widgets";
import { EMPTY_LIVE_DATA } from "@/components/overlay/useOverlayData";
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

/** Données d'exemple de l'aperçu : multiclasse, pédales en mouvement, record toutes les 4 s. */
function sampleData(tick: number): LiveData {
  const record = Math.floor(tick / 80); // un nouveau record de classe en S2 toutes les 4 s
  const s2 = 40.1 - record * 0.012;
  const th = Math.max(0, Math.sin(tick / 9));
  const br = Math.max(0, -Math.sin(tick / 9));
  const st = (pos: number, cls: number, driver: string, vclass: string, best: number, me: boolean, classBest: boolean) => ({
    position: pos,
    class_position: cls,
    driver,
    vehicle_name: driver,
    vehicle_class: vclass,
    last_lap_time: best + 0.4,
    best_lap_time: best,
    time_behind_leader: (pos - 1) * 1.7,
    laps_behind_leader: 0,
    time_behind_next: 1.7,
    is_player: me,
    in_pits: false,
    current_sector: 1,
    last_s1: 30.4,
    last_s2: s2,
    last_s3: 33.2,
    is_class_best_lap: classBest,
    is_class_best_s1: false,
    is_class_best_s2: me,
    is_class_best_s3: false,
    total_laps: 10,
    num_pitstops: 0,
    num_penalties: 0,
    pos_x: 0,
    pos_z: 0,
    finish_status: 0,
  });
  return {
    ...EMPTY_LIVE_DATA,
    connected: true,
    player: {
      lap_delta: Math.sin(tick / 25) * 0.6,
      last_lap_time: 103.7,
      best_lap_time: 103.4,
      last_sectors: [30.52, s2, 33.08],
      best_sectors: [30.4, s2, 33.0],
      total_laps: 10,
    },
    telemetry: {
      throttle: th,
      brake: br,
      speed_kmh: 160 + 110 * th,
      gear: th > 0.5 ? 5 : 3,
      max_gears: 6,
      rpm: 6500 + 2200 * th,
      max_rpm: 9000,
      wheels: [{ grip_fract: br > 0.75 ? 0.85 : 1 }],
    },
    standings: [
      st(1, 1, "A. Leclerc", "Hypercar", 208.1, false, true),
      st(2, 2, "M. Rossi", "Hypercar", 208.6, false, false),
      st(3, 1, "Moi", "LMP2", 214.3, true, true),
      st(4, 2, "J. Weber", "LMP2", 214.9, false, false),
      st(5, 1, "S. Martin", "GT3", 225.2, false, true),
      st(6, 2, "L. Bianchi", "GT3", 225.8, false, false),
    ],
  } as unknown as LiveData;
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
  const data = sampleData(tick);
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
