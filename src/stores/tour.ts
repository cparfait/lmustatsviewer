import { create } from "zustand";

/**
 * Visite guidée (GuidedTour) — état d'ouverture global.
 *
 * Ouverte automatiquement à la fin de l'onboarding (première configuration),
 * et relançable à tout moment depuis la modale d'aide « ? » du header.
 */
interface TourState {
  open: boolean;
  setOpen: (v: boolean) => void;
}

export const useTourStore = create<TourState>((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
}));
