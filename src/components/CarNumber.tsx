/**
 * Numéro de voiture (`CarNumber` des XML LMU), affiché devant le nom du pilote
 * dans les tableaux. Rendu `null` quand le numéro est absent (0) : certaines
 * sessions solo / IA n'en fournissent pas.
 */
import { cn } from "@/lib/utils";

export function CarNumber({
  n,
  className,
}: {
  n: number | null | undefined;
  className?: string;
}) {
  if (!n || n <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[3px] border border-border/60",
        "bg-muted/50 px-1 py-px font-mono text-micro font-semibold leading-none",
        "text-muted-foreground tabular-nums align-middle shrink-0",
        className
      )}
    >
      #{n}
    </span>
  );
}
