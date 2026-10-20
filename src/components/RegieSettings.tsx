/**
 * Régie tablette (idée ⑪) : réglages + hôte de démarrage.
 *
 * Désactivée par défaut. Une fois activée, l'app écoute sur l'adresse du réseau
 * local ; la tablette ouvre l'adresse (QR code) et saisit le code à 6 chiffres.
 * Lecture seule. `useRegieAutostart` (`lib/regie.ts`, monté dans App) la relance
 * au démarrage si elle était activée. L'app peut imposer un écran à toutes les
 * tablettes (« Écran affiché sur les tablettes ») ; elles peuvent ensuite en changer.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MonitorSmartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { config, isTauri } from "@/lib/api";
import { toastError, toastSuccess } from "@/stores/dialogs";
import {
  regie,
  regiePort as portOf,
  REGIE_DEFAULT_PORT,
  REGIE_SCREENS,
  type RegieScreen,
  type RegieStatus,
} from "@/lib/regie";

export function RegieSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<RegieStatus | null>(null);
  const [port, setPort] = useState(String(REGIE_DEFAULT_PORT));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState<RegieScreen>("timing");

  const pushScreen = async () => {
    try {
      await regie.pushScreen(screen);
      toastSuccess(t("config.regieScreenSent"));
    } catch (e) {
      toastError(String(e));
    }
  };

  useEffect(() => {
    if (!isTauri()) return;
    void config.get("regie_port").then((p) => setPort(String(portOf(p))));
    const poll = () => void regie.status().then(setStatus).catch(() => {});
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    setError("");
    try {
      const p = portOf(port);
      await config.set("regie_enabled", on ? "1" : "0");
      await config.set("regie_port", String(p));
      setStatus(on ? await regie.start(p) : await regie.stop());
    } catch (e) {
      setError(String(e));
      await config.set("regie_enabled", "0").catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const running = status?.running ?? false;

  return (
    <section className="space-y-4">
      {/* Le titre « Régie tablette » est déjà celui de la catégorie : l'explication suffit. */}
      <p className="text-sm text-muted-foreground">{t("config.regieDesc")}</p>

      <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{t("config.regieEnable")}</p>
          <p className="text-xs text-muted-foreground">{t("config.regieEnableHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch checked={running} disabled={busy} onCheckedChange={(v: boolean) => void toggle(v)} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground" htmlFor="regie-port">
          {t("config.regiePort")}
        </label>
        <Input
          id="regie-port"
          className="w-28 font-mono"
          inputMode="numeric"
          value={port}
          disabled={running || busy}
          onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
        />
      </div>

      {error && <p className="text-sm text-destructive">{t("config.regieError", { error })}</p>}

      {running && status && (
        <div className="flex flex-wrap items-center gap-6 rounded-md border border-border p-4">
          <div
            className="rounded bg-white p-2 [&_svg]:h-44 [&_svg]:w-44"
            aria-label={status.url}
            // SVG produit par le backend (crate `qrcode`) à partir de l'adresse locale.
            dangerouslySetInnerHTML={{ __html: status.qr_svg }}
          />
          <div className="space-y-3">
            <div>
              <p className="text-micro uppercase tracking-widest text-muted-foreground">{t("config.regieAddress")}</p>
              <p className="font-mono text-lg">{status.url}</p>
            </div>
            <div>
              <p className="text-micro uppercase tracking-widest text-muted-foreground">{t("config.regieCode")}</p>
              <p className="font-mono text-3xl font-bold tracking-[0.3em]">{status.code}</p>
            </div>
            <p className="text-xs text-muted-foreground">{t("config.regieClients", { count: status.clients })}</p>
          </div>
        </div>
      )}

      {running && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium">{t("config.regieScreen")}</p>
            <p className="text-xs text-muted-foreground">{t("config.regieScreenHint")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={screen}
              onValueChange={(v) => setScreen(v as RegieScreen)}
              ariaLabel={t("config.regieScreen")}
              className="h-8 w-44 px-2.5"
              options={REGIE_SCREENS.map((k) => ({ value: k, label: t(`config.regieScreens.${k}`) }))}
            />
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void pushScreen()}>
              <MonitorSmartphone className="h-3.5 w-3.5" />
              {t("config.regieScreenSend")}
            </Button>
          </div>
        </div>
      )}

      <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
        <li>{t("config.regieNoteFirewall")}</li>
        <li>{t("config.regieNoteReadOnly")}</li>
        <li>{t("config.regieNoteTemplates")}</li>
      </ul>
    </section>
  );
}
