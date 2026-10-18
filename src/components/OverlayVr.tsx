/**
 * Mode VR de la page Overlays (bouton « VR » de la barre du haut).
 *
 * En un clic : les adresses locales démarrent (serveur de widgets, 127.0.0.1 seul,
 * lecture seule), un bandeau dit quoi faire dans OpenKneeboard, et chaque carte
 * d'overlay propose « Copier l'adresse VR » à la place de son interrupteur. L'adresse
 * est toujours celle du widget transparent : en VR il flotte au-dessus du jeu.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, ExternalLink, Glasses, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { openExternal, OPENKNEEBOARD_URL, widgetUrl } from "@/lib/widgetServer";

/** Bandeau du mode VR : les quatre gestes à faire, une fois. */
export function VrBanner({ base, error }: { base: string | null; error: string }) {
  const { t } = useTranslation();
  return (
    <Card className="mb-4 space-y-3 border-primary/40 p-4">
      <div className="flex items-start gap-3">
        <Glasses className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-semibold">{t("overlays.vr.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("overlays.vr.desc")}</p>
        </div>
        {!base && !error && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      {error && <p className="text-sm text-destructive">{t("overlays.web.error", { error })}</p>}
      <ol className="list-decimal space-y-1 pl-9 text-sm">
        <li>
          {t("overlays.vr.step1")}{" "}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => openExternal(OPENKNEEBOARD_URL)}>
            {t("overlays.web.okbDownload")}
          </button>
        </li>
        <li>{t("overlays.vr.step2")}</li>
        <li>{t("overlays.vr.step3")}</li>
        <li>{t("overlays.vr.step4")}</li>
      </ol>
      <p className="pl-9 text-xs text-muted-foreground">{t("overlays.web.vrUac")}</p>
    </Card>
  );
}

/** Pied de carte en mode VR : copier l'adresse du widget (ou l'ouvrir pour vérifier). */
export function VrCopyButton({ base, id }: { base: string | null; id: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const url = base ? widgetUrl(base, id) : "";
  const copy = () => {
    if (!url) return;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" className="h-8 flex-1 gap-1.5" disabled={!url} onClick={copy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? t("overlays.web.copied") : t("overlays.vr.copy")}
      </Button>
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8 shrink-0"
        disabled={!url}
        onClick={() => openExternal(url)}
        aria-label={t("overlays.web.open")}
        title={t("overlays.web.open")}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
