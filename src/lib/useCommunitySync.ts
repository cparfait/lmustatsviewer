/**
 * Envoi automatique des sessions au service communautaire (lot 2).
 *
 * Déclenché au lancement, après chaque indexation (`dataVersion`) et toutes les
 * 10 minutes (reprise après coupure / serveur injoignable). Sans effet tant que
 * l'utilisateur n'a pas activé le partage : le Rust vérifie l'opt-in à chaque appel.
 */
import { useEffect } from "react";
import { community, isTauri } from "@/lib/api";
import { useAppStore } from "@/stores/app";

const RETRY_MS = 10 * 60 * 1000;

export function useCommunitySync() {
  const dataVersion = useAppStore((s) => s.dataVersion);

  useEffect(() => {
    if (!isTauri()) return;
    community.sync().catch(() => {});
  }, [dataVersion]);

  useEffect(() => {
    if (!isTauri()) return;
    const id = setInterval(() => community.sync().catch(() => {}), RETRY_MS);
    return () => clearInterval(id);
  }, []);
}
