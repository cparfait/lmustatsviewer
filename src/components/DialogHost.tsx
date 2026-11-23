import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDialogStore } from "@/stores/dialogs";
import { cn } from "@/lib/utils";

/**
 * Rendu unique des toasts + modales confirm/prompt pilotés par `stores/dialogs`.
 * Monté une fois dans `App`. Remplace les boîtes natives `alert/confirm/prompt`.
 */
export function DialogHost() {
  const { t } = useTranslation();
  const { toasts, removeToast, confirm, setConfirm, prompt, setPrompt } =
    useDialogStore();

  // ── Prompt : valeur locale + focus auto ──────────────────────────────────
  const [promptValue, setPromptValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Le focus + la sélection sont faits à l'ouverture (`onOpenAutoFocus`).
    if (prompt) setPromptValue(prompt.defaultValue ?? "");
  }, [prompt]);

  // Échap, clic hors de la carte et confinement de Tab / Maj+Tab : gérés par
  // le primitive Radix Dialog. Ces modales s'ouvrent par programme (pas de
  // `Dialog.Trigger`) : Radix ne saurait pas où rendre le focus, on mémorise
  // donc l'élément actif à l'ouverture et on le restaure à la fermeture.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const rememberFocus = () => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };
  const restoreFocus = (e: Event) => {
    e.preventDefault();
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    if (el && el.isConnected) el.focus();
  };

  function resolveConfirm(ok: boolean) {
    confirm?.resolve(ok);
    setConfirm(null);
  }
  function resolvePrompt(value: string | null) {
    prompt?.resolve(value);
    setPrompt(null);
  }

  return (
    <>
      {/* ── Toasts ──────────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => {
          const Icon =
            toast.variant === "success"
              ? CheckCircle2
              : toast.variant === "error"
                ? XCircle
                : Info;
          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                "pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-card p-3 shadow-lg",
                toast.variant === "success" && "border-success/40",
                toast.variant === "error" && "border-destructive/40",
                toast.variant === "default" && "border-border/60"
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  toast.variant === "success" && "text-success",
                  toast.variant === "error" && "text-destructive",
                  toast.variant === "default" && "text-muted-foreground"
                )}
              />
              <p className="flex-1 text-sm break-words">{toast.message}</p>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("config.cancel")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Confirm ─────────────────────────────────────────────────────── */}
      <DialogPrimitive.Root
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) resolveConfirm(false);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" />
          <DialogPrimitive.Content
            className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 outline-none"
            onCloseAutoFocus={restoreFocus}
            onOpenAutoFocus={(e) => {
              rememberFocus();
              // Action destructive : le focus initial va sur Annuler, jamais sur
              // le bouton qui exécute (Entrée par réflexe ne doit rien détruire).
              if (confirm?.destructive) {
                e.preventDefault();
                cancelRef.current?.focus();
              }
            }}
          >
            {confirm && (
              <Card>
                <CardHeader className="pb-2">
                  <DialogPrimitive.Title asChild>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {confirm.destructive && (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                      {confirm.title ?? t("config.confirm")}
                    </CardTitle>
                  </DialogPrimitive.Title>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DialogPrimitive.Description className="text-sm text-muted-foreground">
                    {confirm.message}
                  </DialogPrimitive.Description>
                  <div className="flex justify-end gap-2">
                    <Button
                      ref={cancelRef}
                      variant="outline"
                      size="sm"
                      onClick={() => resolveConfirm(false)}
                    >
                      {confirm.cancelLabel ?? t("config.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      variant={confirm.destructive ? "destructive" : "default"}
                      onClick={() => resolveConfirm(true)}
                    >
                      {confirm.confirmLabel ?? t("config.confirm")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* ── Prompt ──────────────────────────────────────────────────────── */}
      <DialogPrimitive.Root
        open={!!prompt}
        onOpenChange={(open) => {
          if (!open) resolvePrompt(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" />
          <DialogPrimitive.Content
            className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 outline-none"
            onCloseAutoFocus={restoreFocus}
            onOpenAutoFocus={(e) => {
              rememberFocus();
              // Focus + sélection du champ (valeur par défaut remplaçable).
              e.preventDefault();
              requestAnimationFrame(() => inputRef.current?.select());
            }}
            // Sans titre distinct, le message EST le titre : pas de description.
            {...(prompt?.title ? {} : { "aria-describedby": undefined })}
          >
            {prompt && (
              <Card>
                <CardHeader className="pb-2">
                  <DialogPrimitive.Title asChild>
                    <CardTitle className="text-base">
                      {prompt.title ?? prompt.message}
                    </CardTitle>
                  </DialogPrimitive.Title>
                </CardHeader>
                <CardContent className="space-y-4">
                  {prompt.title && (
                    <DialogPrimitive.Description className="text-sm text-muted-foreground">
                      {prompt.message}
                    </DialogPrimitive.Description>
                  )}
                  <Input
                    ref={inputRef}
                    value={promptValue}
                    placeholder={prompt.placeholder}
                    aria-label={prompt.title ?? prompt.message}
                    onChange={(e) => setPromptValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && promptValue.trim()) {
                        resolvePrompt(promptValue.trim());
                      }
                    }}
                    className="text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => resolvePrompt(null)}
                    >
                      {prompt.cancelLabel ?? t("config.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        resolvePrompt(promptValue.trim() ? promptValue.trim() : null)
                      }
                      disabled={!promptValue.trim()}
                    >
                      {prompt.confirmLabel ?? t("config.confirm")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
