import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";
import { Select, type SelectItems } from "@/components/ui/select";

/**
 * Champ de filtre étiqueté pour les barres de recherche (Sessions, Dashboard,
 * Télémétrie). Pictogramme + libellé court + menu déroulant, le tout dans un
 * même conteneur bordé pour rester compact tout en gardant le contexte visible
 * même quand une valeur est sélectionnée.
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
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center rounded-md border border-input bg-background pl-2 pr-0.5",
        "focus-within:ring-1 focus-within:ring-ring transition-colors hover:border-foreground/30",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="ml-1.5 mr-2 text-micro font-medium uppercase tracking-wide text-muted-foreground/80 select-none whitespace-nowrap">
        {label}
      </span>
      <span className="mr-1 h-4 w-px bg-border" />
      <Select
        value={value}
        onValueChange={onChange}
        options={options}
        ariaLabel={label}
        className="h-full gap-1 rounded-none border-0 bg-transparent pl-1 pr-1.5 text-xs hover:border-0 focus:ring-0"
      />
    </div>
  );
}
