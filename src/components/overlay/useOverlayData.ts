/**
 * Hook de données live pour la fenêtre overlay.
 *
 * - Démarre le polling backend et s'abonne à `live-data`.
 * - En mode **High FPS**, lisse (interpolation linéaire) les champs scalaires de
 *   télémétrie qui pilotent les barres/jauges (vitesse, RPM, pédales, direction)
 *   à ~60 fps via requestAnimationFrame, pour un rendu fluide entre deux trames
 *   backend (50 ms). Sinon, l'affichage suit directement les trames reçues.
 */

import { useEffect, useRef, useState } from "react";
import { live as liveApi, type LiveData, type LiveTelemetry } from "@/lib/api";
import type { UnlistenFn } from "@tauri-apps/api/event";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpole les champs scalaires « lisses » de la télémétrie. */
function smoothTelemetry(
  prev: LiveTelemetry,
  target: LiveTelemetry,
  t: number,
): LiveTelemetry {
  return {
    ...target,
    speed_kmh: lerp(prev.speed_kmh, target.speed_kmh, t),
    rpm: lerp(prev.rpm, target.rpm, t),
    throttle: lerp(prev.throttle, target.throttle, t),
    brake: lerp(prev.brake, target.brake, t),
    steering: lerp(prev.steering, target.steering, t),
    clutch: lerp(prev.clutch, target.clutch, t),
  };
}

/** Délai pendant lequel on conserve la dernière trame valide après une coupure. */
const GRACE_MS = 1500;

export function useOverlayData(highFps: boolean): LiveData | null {
  const [display, setDisplay] = useState<LiveData | null>(null);
  const latestRef = useRef<LiveData | null>(null);
  const displayRef = useRef<LiveData | null>(null);
  // Dernière trame « valide » (connectée avec télémétrie) + instant de perte.
  const lastGoodRef = useRef<LiveData | null>(null);
  const lostSinceRef = useRef<number>(0);
  const highFpsRef = useRef(highFps);
  highFpsRef.current = highFps;

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let raf = 0;
    let mounted = true;

    liveApi.startPolling().catch(() => {});
    liveApi
      .onData((d) => {
        latestRef.current = d;
      })
      .then((fn) => {
        if (mounted) unlisten = fn;
        else fn();
      });

    const tick = () => {
      const target = latestRef.current;
      if (target) {
        const now = performance.now();
        const good = target.connected && !!target.telemetry;
        if (good) {
          lastGoodRef.current = target;
          lostSinceRef.current = 0;
        } else if (lostSinceRef.current === 0) {
          lostSinceRef.current = now;
        }

        // Anti-clignotement : au lancement d'une course (chargement / grille), le
        // sim émet des trames vides/déconnectées entre deux trames valides → les
        // widgets basculeraient entre contenu et placeholder. Pendant un court
        // délai (GRACE_MS), on conserve la dernière trame valide.
        let effective = target;
        if (
          !good &&
          lastGoodRef.current &&
          now - lostSinceRef.current < GRACE_MS
        ) {
          effective = lastGoodRef.current;
        }

        const cur = displayRef.current;
        let next: LiveData = effective;
        if (
          highFpsRef.current &&
          cur &&
          cur.telemetry &&
          effective.telemetry &&
          cur.connected &&
          effective.connected
        ) {
          next = {
            ...effective,
            telemetry: smoothTelemetry(cur.telemetry, effective.telemetry, 0.25),
          };
        }
        displayRef.current = next;
        setDisplay(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      if (unlisten) unlisten();
    };
  }, []);

  return display;
}
