import { useEffect, useState } from "react";
import { getCarImageSlugSync } from "@/lib/staticData";

/**
 * Image (rendu) d'une voiture, chargée depuis `public/cars/<slug>.webp|png`.
 *
 * Discret par nature : si aucune image n'existe pour le modèle, le composant ne
 * rend RIEN (essaie .webp puis .png puis .svg, puis abandonne). Aucune config
 * requise — il suffit de déposer le fichier image nommé d'après le slug du modèle.
 *
 * Le `.svg` final sert de repli « silhouette » (placeholder neutre teinté par
 * classe) tant que le vrai rendu .webp/.png n'a pas été déposé.
 */
const EXTS = ["webp", "png", "svg"] as const;

export function CarImage({
  carName,
  className,
}: {
  carName: string;
  className?: string;
}) {
  const slug = getCarImageSlugSync(carName);
  const [extIdx, setExtIdx] = useState(0);

  // Reset quand la voiture change.
  useEffect(() => {
    setExtIdx(0);
  }, [slug]);

  if (!slug || extIdx >= EXTS.length) return null;

  return (
    <img
      src={`/cars/${slug}.${EXTS[extIdx]}`}
      alt={carName}
      className={className}
      loading="lazy"
      onError={() => setExtIdx((i) => i + 1)}
    />
  );
}
