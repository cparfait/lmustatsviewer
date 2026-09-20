import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Panneau flottant ancré sous un déclencheur, **rendu dans le DOM** (à porter
 * dans un portail par l'appelant) : position `fixed` calculée depuis le
 * rectangle du déclencheur, donc jamais rognée par un parent en `overflow`.
 *
 * Mutualisé par `combobox.tsx` et `color-picker.tsx` — les deux derniers
 * contrôles qui dépendaient encore d'une fenêtre système (liste de suggestions
 * d'un `<datalist>`, sélecteur de couleurs de `<input type="color">`). Même
 * raison que `select.tsx` : sous WebView2 ces fenêtres peuvent s'ouvrir hors
 * écran ou vides.
 *
 * Ferme sur clic extérieur, Échap, et au défilement d'un conteneur parent
 * (comme un `<select>` natif : plutôt fermer que laisser le panneau flotter
 * loin de son champ).
 */
export function useAnchoredPanel<T extends HTMLElement = HTMLElement>({
  width,
}: {
  /** `trigger` = largeur du déclencheur ; `auto` = largeur du contenu. */
  width?: "trigger" | "auto";
} = {}) {
  const triggerRef = useRef<T | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panelH = panelRef.current?.offsetHeight ?? 0;
    const below = window.innerHeight - r.bottom;
    // Bascule au-dessus quand le bas manque de place (et que le haut en a plus).
    const flip = panelH > 0 && below < panelH + 8 && r.top > below;
    setStyle({
      position: "fixed",
      left: Math.round(r.left),
      top: flip ? undefined : Math.round(r.bottom + 4),
      bottom: flip ? Math.round(window.innerHeight - r.top + 4) : undefined,
      ...(width === "trigger" ? { width: Math.round(r.width) } : {}),
      maxHeight: Math.round(Math.max(below, r.top) - 12),
    });
  }, [width]);

  // Première mesure avant peinture → pas de saut visible à l'ouverture.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // `capture` sur le scroll : les conteneurs défilants ne bouillonnent pas.
    // On **suit** le déclencheur plutôt que de fermer : fermer paraissait plus
    // simple, mais un champ qui prend le focus provoque lui-même un défilement
    // (mise à l'écran par le navigateur, texte qui défile sous le curseur) et
    // refermait donc le panneau qu'il venait d'ouvrir. On ne ferme que si le
    // déclencheur a quitté l'écran, où suivre n'aurait plus de sens.
    const onScroll = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) setOpen(false);
      else place();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  return { open, setOpen, triggerRef, panelRef, style, place };
}
