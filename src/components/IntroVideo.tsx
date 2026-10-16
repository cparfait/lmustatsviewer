import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Vidéo plein écran par-dessus l'app (intro de lancement, easter egg du pied de page).
 *  Se ferme à la fin de la vidéo, sur Échap, sur clic ou avec la croix. Tente la lecture
 *  avec le son, repli en muet si la WebView bloque la lecture automatique sonore. */
export function IntroVideo({
  src,
  onClose,
  showClose = true,
}: {
  src: string;
  onClose: () => void;
  showClose?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLVideoElement>(null);
  const [leaving, setLeaving] = useState(false);

  const close = useCallback(() => {
    setLeaving((was) => {
      if (!was) window.setTimeout(onClose, 350);
      return true;
    });
  }, [onClose]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => close());
    });
  }, [close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={close}
      className={cn(
        "fixed inset-0 z-[200] flex items-center justify-center bg-[#0b101f] transition-opacity duration-300",
        leaving ? "opacity-0" : "opacity-100",
      )}
    >
      <video
        ref={ref}
        src={src}
        playsInline
        preload="auto"
        onEnded={close}
        onError={close}
        className="max-h-full max-w-full"
      />
      {showClose && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
          aria-label={t("footer.videoClose")}
          title={t("footer.videoClose")}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>,
    document.body,
  );
}
