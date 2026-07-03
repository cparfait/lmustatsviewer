/**
 * Dialogs & toasts applicatifs — remplacent les `alert()` / `confirm()` /
 * `prompt()` natifs (boîtes système hors charte, bloquantes).
 *
 * API impérative pensée comme drop-in :
 *   - `toast(msg)` / `toastError(msg)` / `toastSuccess(msg)` → notification transitoire.
 *   - `await confirmDialog({ message })` → `Promise<boolean>` (remplace `confirm`).
 *   - `await promptDialog({ message, defaultValue })` → `Promise<string | null>` (remplace `prompt`).
 *
 * Le rendu est assuré par `<DialogHost />` (monté une fois dans `App`).
 */

import { create } from "zustand";

export type ToastVariant = "default" | "success" | "error";

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

export interface ConfirmRequest {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}

export interface PromptRequest {
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (value: string | null) => void;
}

interface DialogState {
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  prompt: PromptRequest | null;
  pushToast: (message: string, variant: ToastVariant) => void;
  removeToast: (id: number) => void;
  setConfirm: (req: ConfirmRequest | null) => void;
  setPrompt: (req: PromptRequest | null) => void;
}

let counter = 0;

export const useDialogStore = create<DialogState>((set) => ({
  toasts: [],
  confirm: null,
  prompt: null,
  pushToast: (message, variant) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    // Auto-dismiss après 4 s.
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setConfirm: (confirm) => set({ confirm }),
  setPrompt: (prompt) => set({ prompt }),
}));

// ── Helpers impératifs (utilisables hors composant React) ──────────────────

export function toast(message: string, variant: ToastVariant = "default") {
  useDialogStore.getState().pushToast(message, variant);
}
export const toastError = (message: string) => toast(message, "error");
export const toastSuccess = (message: string) => toast(message, "success");

export function confirmDialog(
  opts: Omit<ConfirmRequest, "resolve">
): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState().setConfirm({ ...opts, resolve });
  });
}

export function promptDialog(
  opts: Omit<PromptRequest, "resolve">
): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogStore.getState().setPrompt({ ...opts, resolve });
  });
}
