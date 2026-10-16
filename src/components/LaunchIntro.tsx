import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app";
import { IntroVideo } from "@/components/IntroVideo";

// Une seule fois par lancement de l'app (pas à chaque changement de page).
let playedThisRun = false;

/** Fin de l'animation de lancement (volet + titre, ~3 s), désactivable dans
 *  Configuration → Préférences → « Animation au lancement ». Monté une fois la config chargée. */
export function LaunchIntro() {
  const enabled = useAppStore((s) => s.launchIntro);
  const [open, setOpen] = useState(() => enabled && !playedThisRun);
  useEffect(() => {
    if (open) playedThisRun = true;
  }, [open]);
  if (!open) return null;
  return <IntroVideo src="/easter/lmu-intro.mp4" onClose={() => setOpen(false)} showClose={false} />;
}
