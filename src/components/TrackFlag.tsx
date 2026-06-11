import { useEffect, useState } from "react";
import { getCircuitFlagUrlSync, getCircuitFlagUrl } from "@/lib/staticData";

interface TrackFlagProps {
  track: string;
  className?: string;
}

export function TrackFlag({ track, className = "h-3.5 w-auto rounded-[2px]" }: TrackFlagProps) {
  // Chemin synchrone (si le cache est déjà chaud — cas normal après init).
  const [url, setUrl] = useState<string | null>(() => getCircuitFlagUrlSync(track));

  useEffect(() => {
    // Si le cache était froid au premier rendu, on charge en async puis on met à jour.
    if (!url) {
      getCircuitFlagUrl(track).then((u) => {
        if (u) setUrl(u);
      });
    }
  }, [track]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!url) return null;
  return (
    <img
      src={url}
      alt={track}
      className={className}
      style={{ verticalAlign: "-0.1em" }}
    />
  );
}
