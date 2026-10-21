import type { ComponentType, ReactNode, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import { Car, Flag, Route, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, type SelectItems } from "@/components/ui/select";
import { TrackFlag } from "@/components/TrackFlag";
import { CarLogo } from "@/components/CarLogo";
import { CAR_CLASS_COLORS, liveClassKey } from "@/lib/staticData";

/** Repère devant un choix, selon le filtre (reconnu à son icône, la même sur toutes les pages). */
function decoFor(icon: ComponentType<SVGProps<SVGSVGElement>>): ((v: string) => ReactNode) | undefined {
  const none = (v: string) => !v || v === "all";
  if (icon === Flag || icon === Route) return (v) => (none(v) ? null : <TrackFlag track={v} className="h-3 w-auto shrink-0 rounded-[2px] ring-1 ring-black/10" />);
  if (icon === Car) return (v) => (none(v) ? null : <CarLogo carName={v} className="h-4 w-5 shrink-0 object-contain" />);
  if (icon === Tag)
    return (v) => {
      if (none(v)) return null;
      const c = CAR_CLASS_COLORS[v] ?? CAR_CLASS_COLORS[liveClassKey(v)];
      return <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c?.color ?? "currentColor" }} />;
    };
  return undefined;
}

/** Valeur « Tous / Toutes » d'une liste : la première option vide ou `all` (absente : pas de défaut). */
function defaultValue(options: SelectItems[]): string | undefined {
  for (const o of options) {
    if ("options" in o) continue;
    if (o.value === "" || o.value === "all") return o.value;
  }
  return undefined;
}

/**
 * Champ de filtre étiqueté pour les barres de recherche (Sessions, Dashboard,
 * Télémétrie, Classements). Intitulé sur fond saumon (comme les en-têtes de
 * tableau et le site communautaire) + menu déroulant ; un filtre actif (autre
 * chose que « Tous / Toutes ») passe en orange.
 *
 * Le menu est le `Select` maison (rendu dans le DOM) et non un `<select>`
 * natif — voir `components/ui/select.tsx` pour la raison.
 */
export function FilterField({
  icon: Icon,
  label,
  value,
  onChange,
  options,
  className,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectItems[];
  className?: string;
}) {
  const { t } = useTranslation();
  const dflt = defaultValue(options);
  const active = dflt !== undefined && value !== dflt;
  return (
    <div
      className={cn(
        "inline-flex h-7 items-stretch overflow-hidden rounded-md border border-primary/25 bg-background",
        "focus-within:ring-1 focus-within:ring-ring transition-colors hover:border-primary/50",
        active && "border-primary ring-2 ring-primary/15 hover:border-primary",
        className
      )}
    >
      <span className="flex select-none items-center gap-1.5 whitespace-nowrap border-r border-primary/20 bg-primary/15 px-2 text-micro font-bold uppercase tracking-wide text-primary dark:bg-primary/20 dark:text-orange-200">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </span>
      <Select
        value={value}
        onValueChange={onChange}
        options={options}
        ariaLabel={label}
        variant="filter"
        decorate={decoFor(Icon)}
        searchPlaceholder={t("header.searchList")}
        className={cn(
          "h-full gap-1 rounded-none border-0 bg-transparent pl-2 pr-1.5 text-xs font-semibold hover:border-0 focus:ring-0",
          active && "bg-primary/[0.07] text-primary"
        )}
      />
    </div>
  );
}
