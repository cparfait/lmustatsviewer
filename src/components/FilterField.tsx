import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Champ de filtre étiqueté pour les barres de recherche (Sessions, Dashboard).
 * Pictogramme + libellé court + `<select>` natif, le tout dans un même
 * conteneur bordé pour rester compact tout en gardant le contexte visible
 * même quand une valeur est sélectionnée.
 */
export function FilterField({
  icon: Icon,
  label,
  value,
  onChange,
  children,
  className,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
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
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full bg-transparent border-0 pl-1 pr-1.5 text-xs focus:outline-none text-foreground cursor-pointer"
      >
        {children}
      </select>
    </label>
  );
}
