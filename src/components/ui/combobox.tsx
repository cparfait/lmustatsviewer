import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnchoredPanel } from "@/components/ui/use-anchored-panel";

/**
 * Champ de **saisie libre avec suggestions**, en remplacement du couple
 * `<input list>` + `<datalist>`.
 *
 * Pourquoi : la liste de suggestions d'un `<datalist>` est dessinée par le
 * navigateur dans une fenêtre système, exactement comme la popup d'un `<select>`
 * natif — donc sujette à la même panne sous WebView2 (liste hors écran ou vide,
 * voir `select.tsx`). Ici la liste est du DOM normal.
 *
 * La valeur reste **libre** : les suggestions ne contraignent rien, elles
 * filtrent sur ce qui est tapé (sous-chaîne, insensible à la casse).
 *
 * Mode `toggle` : une flèche à droite ouvre la liste **complète** (entrée
 * `selected` cochée) ; cliquer dans le champ ne l'ouvre plus — on y modifie ou
 * recherche, et la liste filtrée n'apparaît qu'à la frappe.
 */
export function Combobox({
  value,
  onChange,
  onPick,
  options,
  placeholder,
  className,
  ariaLabel,
  spellCheck = false,
  toggle = false,
  selected,
  toggleLabel,
  onFocus,
  onBlur,
  onKeyDown: onKeyDownExtra,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Suggestion choisie (clic, Entrée). Par défaut : `onChange`. */
  onPick?: (value: string) => void;
  /** Suggestions ; `label` est affiché, `value` est inséré dans le champ. */
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  spellCheck?: boolean;
  /** Flèche d'ouverture de la liste complète (cf. en-tête). */
  toggle?: boolean;
  /** Valeur cochée dans la liste (mode `toggle`). */
  selected?: string;
  toggleLabel?: string;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const { open, setOpen, triggerRef, panelRef, style } = useAnchoredPanel<HTMLElement>({
    // Mode flèche : la liste prend la largeur des ids (pas de troncature).
    width: toggle ? "min-trigger" : "trigger",
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [active, setActive] = useState(0);
  // Ouverte par la flèche : toute la liste, sans filtre, jusqu'à la frappe.
  const [browseAll, setBrowseAll] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Mode flèche : le clic qui donne le focus sélectionne tout le texte ; sans
  // ce drapeau, le relâchement du même clic replaçait le curseur et la frappe
  // s'insérait au milieu de l'id au lieu de lancer une recherche.
  const selectOnMouseUp = useRef(false);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q || browseAll) return options;
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q),
    );
  }, [options, value, browseAll]);

  // L'index actif doit rester dans les bornes quand la liste se réduit.
  useEffect(() => {
    setActive((i) => (i >= matches.length ? 0 : i));
  }, [matches.length]);

  // Texte tapé identique à une suggestion : c'est elle que valide Entrée, pas
  // la première venue (`qwen/x` ne doit pas devenir `qwen/x:free`).
  useEffect(() => {
    if (browseAll) return;
    const q = value.trim().toLowerCase();
    const exact = matches.findIndex((o) => o.value.toLowerCase() === q);
    if (exact >= 0) setActive(exact);
  }, [matches, value, browseAll]);

  // Garde l'entrée survolée au clavier visible dans la liste défilante. On fait
  // défiler le **panneau seul** : `scrollIntoView` faisait aussi défiler la page
  // (longues listes), ce qui sortait le champ de l'écran à l'ouverture.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const item = listRef.current?.children[active] as HTMLElement | undefined;
    if (!panel || !item) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (bottom > panel.scrollTop + panel.clientHeight) panel.scrollTop = bottom - panel.clientHeight;
  }, [active, open, panelRef]);

  const pick = (v: string) => {
    (onPick ?? onChange)(v);
    setOpen(false);
    inputRef.current?.focus();
  };

  /** Liste complète, positionnée sur l'entrée cochée. */
  const openAll = () => {
    setBrowseAll(true);
    setActive(Math.max(0, options.findIndex((o) => o.value === (selected ?? value))));
    setOpen(options.length > 0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        if (toggle) openAll();
        else setOpen(matches.length > 0);
        return;
      }
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + d + matches.length) % Math.max(1, matches.length));
      return;
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      pick(matches[active].value);
      return;
    } else if (e.key === "Tab") {
      setOpen(false);
    }
    onKeyDownExtra?.(e);
  };

  const input = (
    <input
      ref={(el) => {
        inputRef.current = el;
        if (!toggle) triggerRef.current = el;
      }}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        setBrowseAll(false);
        setOpen(true);
        setActive(0);
      }}
      onFocus={(e) => {
        if (!toggle) setOpen(matches.length > 0);
        else {
          e.currentTarget.select();
          selectOnMouseUp.current = true;
        }
        onFocus?.(e);
      }}
      onMouseUp={(e) => {
        if (!selectOnMouseUp.current) return;
        selectOnMouseUp.current = false;
        e.preventDefault();
      }}
      onBlur={(e) => {
        selectOnMouseUp.current = false;
        onBlur?.(e);
      }}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      role="combobox"
      aria-expanded={open}
      aria-autocomplete="list"
      autoComplete="off"
      spellCheck={spellCheck}
      className={className}
    />
  );

  return (
    <>
      {toggle ? (
        <div
          ref={(el) => {
            triggerRef.current = el;
          }}
          className="relative inline-flex"
        >
          {input}
          {options.length > 0 && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={toggleLabel}
              title={toggleLabel}
              // Garde le focus dans le champ (pas de blur → pas de validation).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (open) setOpen(false);
                else openAll();
                inputRef.current?.focus();
                // Focus donné par la flèche : pas de clic dans le champ à neutraliser.
                selectOnMouseUp.current = false;
              }}
              className="absolute inset-y-0 right-0 flex w-7 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn("h-4 w-4 opacity-70 transition-transform", open && "rotate-180")} />
            </button>
          )}
        </div>
      ) : (
        input
      )}
      {open &&
        matches.length > 0 &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            className={cn(
              "z-[80] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg",
              // Largeur mesurée dès la 1re ouverture (sinon : toute la page).
              toggle && "w-max",
            )}
          >
            <div ref={listRef}>
              {matches.map((o, i) => {
                const checked = toggle && selected !== undefined && o.value === selected;
                return (
                  <button
                    key={`${o.value}:${i}`}
                    type="button"
                    // `preventDefault` : garder le focus dans le champ, sinon le
                    // blur ferme le panneau avant que le clic n'aboutisse.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(o.value)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                      i === active && "bg-accent text-accent-foreground",
                      checked && "text-primary",
                    )}
                  >
                    {toggle && (
                      <Check className={cn("h-3.5 w-3.5 shrink-0", !checked && "invisible")} />
                    )}
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
