import { useRef, useState, type ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Menu déroulant **rendu dans la page** (Radix), en remplacement du `<select>`
 * natif.
 *
 * Pourquoi : sous WebView2 (Tauri/Windows), la liste d'un `<select>` natif est
 * une fenêtre système séparée. Chez certains utilisateurs — typiquement en
 * multi-écrans avec des mises à l'échelle (DPI) différentes, cas fréquent en
 * simracing — cette fenêtre s'ouvre hors champ ou vide : on ne voit que le
 * cadre de focus du champ, sans aucune option cliquable. Ici la liste est du
 * DOM normal : elle s'affiche toujours au bon endroit, avec le thème de l'app.
 *
 * L'API reste proche du natif : `value` / `onValueChange` + `options`, à plat
 * ou groupées (`{ label, options }` = `<optgroup>`). La valeur vide `""` (nos
 * filtres « Tous / Toutes ») est autorisée : Radix la réserve en interne, on la
 * transpose donc sur une sentinelle.
 *
 * Le déclencheur reprend le style des anciens champs (`h-9`, bordure `input`) ;
 * `className` le surcharge pour les variantes compactes (`h-8`, `text-xs`…).
 */

/** Sentinelle interne : Radix interdit `value=""` sur un item. */
const EMPTY = "__all__";

const toRadix = (v: string) => (v === "" ? EMPTY : v);
const fromRadix = (v: string) => (v === EMPTY ? "" : v);

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Groupe d'options (équivalent `<optgroup>`). */
export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

export type SelectItems = SelectOption | SelectOptionGroup;

const isGroup = (o: SelectItems): o is SelectOptionGroup => "options" in o;

const ITEM_CLASS =
  "relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-7 pr-2 text-sm outline-none " +
  "focus:bg-accent focus:text-accent-foreground data-[state=checked]:font-medium " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

/** Variante « filtre » (barres de filtres) : choix en cours en orange, coche à droite. */
const FILTER_ITEM_CLASS =
  "relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-2.5 pr-8 text-sm outline-none " +
  "focus:bg-primary/10 data-[state=checked]:font-semibold data-[state=checked]:text-primary " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

function Item({ option, filter, decorate }: { option: SelectOption; filter?: boolean; decorate?: (value: string) => ReactNode }) {
  const deco = decorate?.(option.value);
  return (
    <SelectPrimitive.Item
      value={toRadix(option.value)}
      disabled={option.disabled}
      className={filter ? FILTER_ITEM_CLASS : ITEM_CLASS}
    >
      <span className={cn("absolute flex h-3.5 w-3.5 items-center justify-center", filter ? "right-2.5 text-primary" : "left-1.5")}>
        <SelectPrimitive.ItemIndicator>
          <Check className="h-3.5 w-3.5" />
        </SelectPrimitive.ItemIndicator>
      </span>
      {/* Le repère (drapeau, logo, pastille) fait partie du texte : il s'affiche aussi dans le champ. */}
      <SelectPrimitive.ItemText>
        {deco ? (
          <span className="inline-flex min-w-0 items-center gap-2">
            {deco}
            <span className="truncate">{option.label}</span>
          </span>
        ) : (
          option.label
        )}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function Select({
  value,
  onValueChange,
  options,
  className,
  contentClassName,
  placeholder,
  disabled,
  ariaLabel,
  variant,
  decorate,
  searchPlaceholder,
}: {
  value: string;
  onValueChange: (value: string) => void;
  /** Options à plat, ou groupes `{ label, options }` (équivalent `<optgroup>`). */
  options: SelectItems[];
  /** Classes du déclencheur (largeur, etc.). */
  className?: string;
  /** Classes du panneau de la liste. */
  contentClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** « filter » : style des barres de filtres (orange, coche à droite, recherche au-delà de 10 choix). */
  variant?: "filter";
  /** Repère affiché devant un choix (drapeau, logo…) ; `null` = rien. */
  decorate?: (value: string) => ReactNode;
  /** Texte du champ de recherche (variante « filter », listes longues). */
  searchPlaceholder?: string;
}) {
  const filter = variant === "filter";
  const flat = options.flatMap((o) => (isGroup(o) ? o.options : [o]));
  const searchable = filter && flat.length > 10;
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  // Le choix en cours reste toujours dans la liste : Radix en tire le texte affiché dans le champ.
  const match = (o: SelectOption) => !q || o.value === value || o.label.toLowerCase().includes(q);
  return (
    <SelectPrimitive.Root
      value={toRadix(value)}
      onValueChange={(v) => onValueChange(fromRadix(v))}
      disabled={disabled}
      onOpenChange={(open) => {
        setQuery("");
        // Recherche : le champ prend la main dès l'ouverture (Radix place d'abord le focus sur le choix en cours).
        if (open && searchable) setTimeout(() => searchRef.current?.focus(), 30);
      }}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-sm",
          "cursor-pointer transition-colors hover:border-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={cn(
            // z-80 : au-dessus des modales (z-50, NewSetupDialog/LapChartModal),
            // des toasts (z-60) et des dialogues confirm/prompt (z-70) — un menu
            // ouvert depuis une modale doit passer devant elle.
            "z-[80] overflow-hidden border border-border bg-popover text-popover-foreground shadow-lg",
            filter ? "rounded-lg" : "rounded-md",
            "max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)]",
            contentClassName,
          )}
        >
          <SelectPrimitive.ScrollUpButton className="flex h-5 cursor-default items-center justify-center bg-popover">
            <ChevronUp className="h-3.5 w-3.5 opacity-60" />
          </SelectPrimitive.ScrollUpButton>
          {searchable && (
            <div className="border-b border-border/60 p-1.5">
              <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  // Les touches restent dans le champ (sinon la recherche par lettre de Radix les capte) ;
                  // ↓ descend dans la liste.
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      (e.currentTarget.closest("[role=listbox]")?.querySelector("[role=option]") as HTMLElement | null)?.focus();
                    } else if (e.key !== "Escape" && e.key !== "Tab") e.stopPropagation();
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </div>
          )}
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o, i) =>
              isGroup(o) ? (
                <SelectPrimitive.Group key={`g:${o.label}:${i}`}>
                  <SelectPrimitive.Label className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {o.label}
                  </SelectPrimitive.Label>
                  {o.options.filter(match).map((opt, j) => (
                    <Item key={`${opt.value}:${j}`} option={opt} filter={filter} decorate={decorate} />
                  ))}
                </SelectPrimitive.Group>
              ) : (
                // Clé indexée : deux entrées peuvent partager la même valeur
                // (homonymes d'une liste de pilotes, par exemple).
                match(o) && <Item key={`${o.value}:${i}`} option={o} filter={filter} decorate={decorate} />
              ),
            )}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-5 cursor-default items-center justify-center bg-popover">
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
