import { create } from "zustand";

/**
 * Fenêtre « Mise à jour installée » — état d'ouverture global.
 *
 * Ouverte au premier lancement qui suit une mise à jour (`WhatsNewHost`), ou à la
 * demande depuis le journal des versions (`preview` : on revoit la fenêtre sans
 * toucher à la dernière version vue). Les autres fenêtres de lancement (invitation
 * communautaire) attendent qu'elle soit fermée.
 */
interface WhatsNewState {
  open: boolean;
  /** Ouverte à la demande : la fermer ne marque rien comme vu. */
  preview: boolean;
  /** Aperçu d'une version précise du journal (sinon : les versions non vues). */
  version: string | null;
  show: (preview: boolean, version?: string) => void;
  close: () => void;
}

export const useWhatsNewStore = create<WhatsNewState>((set) => ({
  open: false,
  preview: false,
  version: null,
  show: (preview, version) => set({ open: true, preview, version: version ?? null }),
  close: () => set({ open: false, preview: false, version: null }),
}));
