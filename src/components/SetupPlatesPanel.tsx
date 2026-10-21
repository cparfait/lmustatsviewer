/**
 * Planche des réglages (opt-in, Config › Atelier) : la voiture vue de dessus,
 * une pièce cliquée = son rôle, une astuce, les phases du virage concernées et
 * les valeurs du setup ouvert. Dessin maison (SVG), pas d'image tierce.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SvmFile } from "@/lib/api";
import { paramLabel } from "@/lib/setupParams";
import { PARTS, partValues } from "@/lib/setupPlates";
import { cn } from "@/lib/utils";

/** Zones cliquables du dessin (viewBox 0 0 200 420, avant en haut). */
const ZONES: Record<string, { d: string; label: [number, number] }> = {
  frontWing: { d: "M30 18 h140 v16 h-140 z", label: [100, 28] },
  frontTyres: { d: "M14 62 h30 v58 h-30 z M156 62 h30 v58 h-30 z", label: [100, 52] },
  brakes: { d: "M46 74 h16 v34 h-16 z M138 74 h16 v34 h-16 z", label: [100, 96] },
  frontSuspension: { d: "M64 70 h72 v42 h-72 z", label: [100, 128] },
  electronics: { d: "M78 150 h44 v40 h-44 z", label: [100, 172] },
  floor: { d: "M50 200 h100 v60 h-100 z", label: [100, 232] },
  engine: { d: "M64 266 h72 v44 h-72 z", label: [100, 290] },
  differential: { d: "M84 316 h32 v22 h-32 z", label: [100, 330] },
  rearSuspension: { d: "M58 340 h84 v20 h-84 z", label: [100, 352] },
  rearTyres: { d: "M10 300 h34 v62 h-34 z M156 300 h34 v62 h-34 z", label: [100, 300] },
  gearbox: { d: "M88 362 h24 v20 h-24 z", label: [100, 374] },
  rearWing: { d: "M24 388 h152 v18 h-152 z", label: [100, 400] },
};

export function SetupPlatesPanel({ svm }: { svm: SvmFile }) {
  const { t } = useTranslation();
  const [sel, setSel] = useState<string>("frontWing");
  const part = PARTS.find((p) => p.id === sel) ?? PARTS[0];
  const values = useMemo(() => partValues(svm, part), [svm, part]);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-muted-foreground">{t("lab.plates.intro")}</p>
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 items-start">
        <svg viewBox="0 0 200 420" className="w-full max-w-[220px] mx-auto" role="img" aria-label={t("lab.plates.drawing")}>
          {/* Silhouette : carrosserie d'un prototype vu de dessus */}
          <path
            d="M70 36 C70 20 130 20 130 36 L140 70 L156 130 L160 300 L150 380 L50 380 L40 300 L44 130 L60 70 Z"
            className="fill-muted stroke-border"
            strokeWidth={2}
          />
          <path d="M86 140 C86 120 114 120 114 140 L112 200 L88 200 Z" className="fill-background stroke-border" strokeWidth={1.5} />
          {PARTS.map((p) => {
            const z = ZONES[p.id];
            if (!z) return null;
            const active = p.id === sel;
            const has = partValues(svm, p).length > 0;
            return (
              <path
                key={p.id}
                d={z.d}
                role="button"
                tabIndex={0}
                aria-label={t(`lab.plates.parts.${p.id}.name`)}
                onClick={() => setSel(p.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSel(p.id)}
                className={cn(
                  "cursor-pointer transition-colors outline-none",
                  active ? "fill-primary/70 stroke-primary" : has ? "fill-primary/20 stroke-primary/50 hover:fill-primary/40" : "fill-border/40 stroke-border",
                )}
                strokeWidth={1.5}
              >
                <title>{t(`lab.plates.parts.${p.id}.name`)}</title>
              </path>
            );
          })}
        </svg>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {PARTS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSel(p.id)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  p.id === sel ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent/40",
                )}
              >
                {t(`lab.plates.parts.${p.id}.name`)}
              </button>
            ))}
          </div>
          <div className="rounded-md border border-border/60 p-3 flex flex-col gap-2">
            <h4 className="font-semibold">{t(`lab.plates.parts.${part.id}.name`)}</h4>
            <p>{t(`lab.plates.parts.${part.id}.role`)}</p>
            <p className="text-xs text-muted-foreground">💡 {t(`lab.plates.parts.${part.id}.tip`)}</p>
            <div className="flex flex-wrap gap-1.5">
              {part.phases.map((ph) => (
                <span key={ph} className="rounded bg-muted px-2 py-0.5 text-micro uppercase tracking-wide">
                  {t(`lab.plates.phase.${ph}`)}
                </span>
              ))}
            </div>
            {values.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t("lab.plates.noValue")}</p>
            ) : (
              <table className="text-xs">
                <tbody>
                  {values.map((v) => (
                    <tr key={`${v.section}.${v.key}`} className="border-t border-border/40">
                      <td className="py-1 pr-3 text-muted-foreground">
                        {paramLabel(v.key)}
                        {/^(FRONT|REAR)(LEFT|RIGHT)$/i.test(v.section) ? ` · ${v.section.replace(/^(FRONT|REAR)(LEFT|RIGHT)$/i, (_m, a: string, b: string) => `${a[0]}${b[0]}`.toUpperCase())}` : ""}
                      </td>
                      <td className="py-1 font-mono font-semibold text-right">{v.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
