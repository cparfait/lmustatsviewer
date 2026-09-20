import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  className,
  ariaLabel,
  spellCheck = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Suggestions ; `label` est affiché, `value` est inséré dans le champ. */
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  spellCheck?: boolean;
}) {
  const { open, setOpen, triggerRef, panelRef, style } =
    useAnchoredPanel<HTMLInputElement>({ width: "trigger" });
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q),
    );
  }, [options, value]);

  // L'index actif doit rester dans les bornes quand la liste se réduit.
  useEffect(() => {
    setActive((i) => (i >= matches.length ? 0 : i));
  }, [matches.length]);

  // Garde l'entrée survolée au clavier visible dans la liste défilante.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(matches.length > 0);
        return;
      }
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + d + matches.length) % Math.max(1, matches.length));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      pick(matches[active].value);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <>
      <input
        ref={triggerRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(matches.length > 0)}
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
      {open &&
        matches.length > 0 &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            className="z-[80] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            <div ref={listRef}>
              {matches.map((o, i) => (
                <button
                  key={`${o.value}:${i}`}
                  type="button"
                  // `preventDefault` : garder le focus dans le champ, sinon le
                  // blur ferme le panneau avant que le clic n'aboutisse.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o.value)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "block w-full cursor-pointer truncate rounded-sm px-2 py-1.5 text-left text-sm",
                    i === active && "bg-accent text-accent-foreground",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
