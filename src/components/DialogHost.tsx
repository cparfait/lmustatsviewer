import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
    if (prompt) {
      setPromptValue(prompt.defaultValue ?? "");
      // Focus + sélection après le rendu de la modale.
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [prompt]);

  // Échap ferme la modale active (annulation).
  useEffect(() => {
    if (!confirm && !prompt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (prompt) {
          prompt.resolve(null);
          setPrompt(null);
        } else if (confirm) {
          confirm.resolve(false);
          setConfirm(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, prompt, setConfirm, setPrompt]);

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
      {confirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) resolveConfirm(false);
          }}
        >
          <Card className="w-full max-w-sm" role="dialog" aria-modal="true">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                {confirm.destructive && (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
                {confirm.title ?? t("config.confirm")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{confirm.message}</p>
              <div className="flex justify-end gap-2">
                <Button
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
                  autoFocus
                >
                  {confirm.confirmLabel ?? t("config.confirm")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Prompt ──────────────────────────────────────────────────────── */}
      {prompt && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) resolvePrompt(null);
          }}
        >
          <Card className="w-full max-w-sm" role="dialog" aria-modal="true">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {prompt.title ?? prompt.message}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {prompt.title && (
                <p className="text-sm text-muted-foreground">
                  {prompt.message}
                </p>
              )}
              <Input
                ref={inputRef}
                value={promptValue}
                placeholder={prompt.placeholder}
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
        </div>
      )}
    </>
  );
}
