import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";
import { Select, type SelectItems } from "@/components/ui/select";

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
  const dflt = defaultValue(options);
  const active = dflt !== undefined && value !== dflt;
  return (
    <div
      className={cn(
        "inline-flex h-8 items-stretch overflow-hidden rounded-md border border-primary/25 bg-background",
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
        className={cn(
          "h-full gap-1 rounded-none border-0 bg-transparent pl-2 pr-1.5 text-xs font-semibold hover:border-0 focus:ring-0",
          active && "bg-primary/[0.07] text-primary"
        )}
      />
    </div>
  );
}
