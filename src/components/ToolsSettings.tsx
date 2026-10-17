/**
 * Outils & diagnostic (catégorie Configuration).
 *
 * 1. Lanceur d'outils (désactivé par défaut) : programmes lancés quand LMU
 *    démarre, fermés à son arrêt si l'option de l'outil est cochée. La
 *    surveillance tourne côté Rust ; `useToolLauncher` (`lib/toolLauncher.ts`,
 *    monté dans App) la relance au démarrage de l'app.
 * 2. Diagnostic PC : lecture seule, aucun fichier modifié. Textes traduits ici
 *    par `id` + `status` ; le backend ne renvoie que des valeurs brutes.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Rocket,
  Stethoscope,
  Loader2,
  Plus,
  Play,
  Trash2,
  CircleCheck,
  TriangleAlert,
  CircleX,
  Info,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { isTauri } from "@/lib/api";
import { openExternal, OPENKNEEBOARD_URL } from "@/lib/widgetServer";
import {
  tools,
  loadLauncherConfig,
  saveLauncherConfig,
  EMPTY_LAUNCHER,
  type DiagItem,
  type DiagStatus,
  type KnownTool,
  type LauncherConfig,
  type LauncherStatus,
} from "@/lib/toolLauncher";

/** Codes d'erreur bruts du backend qui ont un texte traduit. */
const KNOWN_ERRORS = ["not_found", "not_exe", "elevation_required"];

const STATUS_ICON: Record<DiagStatus, { icon: typeof Info; className: string }> = {
  ok: { icon: CircleCheck, className: "text-emerald-500" },
  warn: { icon: TriangleAlert, className: "text-amber-500" },
  error: { icon: CircleX, className: "text-destructive" },
  info: { icon: Info, className: "text-sky-500" },
};

const samePath = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function ToolsSettings() {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<LauncherConfig>(EMPTY_LAUNCHER);
  const [status, setStatus] = useState<LauncherStatus | null>(null);
  const [known, setKnown] = useState<KnownTool[]>([]);
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});
  const [diag, setDiag] = useState<DiagItem[] | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [diagError, setDiagError] = useState("");

  useEffect(() => {
    if (!isTauri()) return;
    void loadLauncherConfig().then(setCfg).catch(() => {});
    void tools.detectKnown().then(setKnown).catch(() => {});
    const poll = () => void tools.status().then(setStatus).catch(() => {});
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  const errorText = (raw: string) => {
    // Forme backend : « chemin : code » ou code seul.
    const sep = raw.lastIndexOf(" : ");
    const code = sep >= 0 ? raw.slice(sep + 3) : raw;
    const who = sep >= 0 ? fileName(raw.slice(0, sep)) : "";
    const msg = KNOWN_ERRORS.includes(code) ? t(`tools.err_${code}`) : code;
    return who ? `${who} — ${msg}` : msg;
  };

  const apply = async (next: LauncherConfig) => {
    setCfg(next);
    try {
      setStatus(await saveLauncherConfig(next));
    } catch (e) {
      setStatus((s) => (s ? { ...s, last_error: String(e) } : s));
    }
  };

  const addPath = (path: string) => {
    if (!path || cfg.tools.some((x) => samePath(x.path, path))) return;
    void apply({ ...cfg, tools: [...cfg.tools, { path, close_with_lmu: false }] });
  };

  const pickExe = async () => {
    if (!isTauri()) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      directory: false,
      title: t("tools.pickTitle"),
      filters: [{ name: t("tools.exeFilter"), extensions: ["exe"] }],
    });
    if (typeof selected === "string") addPath(selected);
  };

  const test = async (path: string) => {
    setTestMsg((m) => ({ ...m, [path]: t("tools.testing") }));
    try {
      const launched = await tools.launchNow(path);
      setTestMsg((m) => ({ ...m, [path]: t(launched ? "tools.testLaunched" : "tools.testAlreadyRunning") }));
    } catch (e) {
      setTestMsg((m) => ({ ...m, [path]: errorText(String(e)) }));
    }
  };

  const runDiag = async () => {
    setDiagBusy(true);
    setDiagError("");
    try {
      setDiag(await tools.diagnostic());
    } catch (e) {
      setDiagError(String(e));
    } finally {
      setDiagBusy(false);
    }
  };

  // Outils trouvés sur le PC, par ordre alphabétique.
  const suggestions = known
    .filter((k) => !cfg.tools.some((x) => samePath(x.path, k.path)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const launchedPids = new Map((status?.launched ?? []).map((l) => [l.path.toLowerCase(), l.pid]));

  return (
    <div className="space-y-10">
      {/* ── Lanceur d'outils ── */}
      <section className="space-y-4">
        <div className="flex items-start gap-3">
          <Rocket className="h-5 w-5 mt-0.5 text-primary shrink-0" />
          <div className="space-y-1">
            <h3 className="font-semibold">{t("tools.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("tools.desc")}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{t("tools.enable")}</p>
            <p className="text-xs text-muted-foreground">{t("tools.enableHint")}</p>
          </div>
          <Switch
            checked={cfg.enabled}
            onCheckedChange={(v: boolean) => void apply({ ...cfg, enabled: v })}
          />
        </div>

        {cfg.enabled && status && (
          <p className="text-xs text-muted-foreground">
            {cfg.tools.length === 0
              ? t("tools.statusEmpty")
              : status.lmu_running
                ? t("tools.statusLmuRunning", { count: status.launched.length })
                : t("tools.statusWatching")}
          </p>
        )}

        {/* Tes outils : ceux que l'app ouvrira avec LMU. */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("tools.yours")}</p>
          {cfg.tools.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              {suggestions.length > 0 ? t("tools.emptyWithFound") : t("tools.empty")}
            </p>
          )}
          {cfg.tools.map((tool) => {
            const pid = launchedPids.get(tool.path.trim().toLowerCase());
            return (
              <div key={tool.path} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{fileName(tool.path)}</p>
                    <p className="text-xs font-mono text-muted-foreground truncate" title={tool.path}>
                      {tool.path}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => void test(tool.path)}>
                      <Play />
                      {t("tools.test")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("tools.remove")}
                      title={t("tools.remove")}
                      onClick={() =>
                        void apply({ ...cfg, tools: cfg.tools.filter((x) => x.path !== tool.path) })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={tool.close_with_lmu}
                      onCheckedChange={(v: boolean) =>
                        void apply({
                          ...cfg,
                          tools: cfg.tools.map((x) => (x.path === tool.path ? { ...x, close_with_lmu: v } : x)),
                        })
                      }
                    />
                    {t("tools.closeWithLmu")}
                  </label>
                  {pid !== undefined && (
                    <span className="text-xs text-emerald-500">{t("tools.launchedByApp", { pid })}</span>
                  )}
                </div>
                {testMsg[tool.path] && <p className="text-xs text-muted-foreground">{testMsg[tool.path]}</p>}
              </div>
            );
          })}
        </div>

        {/* Trouvés sur ton PC : une carte par outil connu, ajout en un clic. */}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("tools.suggestions")}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((s) => (
                <div key={s.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-sm font-bold text-primary">
                      {s.name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{t(`tools.role_${s.id}`)}</p>
                    </div>
                  </div>
                  <p className="truncate font-mono text-[11px] text-muted-foreground/80" title={s.path}>
                    {s.path}
                  </p>
                  <Button size="sm" variant="outline" className="mt-auto w-full" onClick={() => addPath(s.path)}>
                    <Plus />
                    {t("tools.addThis")}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed"
          onClick={() => void pickExe()}
        >
          <Plus />
          {t("tools.add")}
        </Button>

        {status?.last_error && (
          <p className="text-sm text-destructive">{t("tools.lastError", { error: errorText(status.last_error) })}</p>
        )}

        <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
          <li>{t("tools.noteAlreadyOpen")}</li>
          <li>{t("tools.noteClose")}</li>
          <li>{t("tools.noteElevation")}</li>
        </ul>
      </section>

      {/* ── Diagnostic PC (lecture seule) ── */}
      <section className="space-y-4">
        <div className="flex items-start gap-3">
          <Stethoscope className="h-5 w-5 mt-0.5 text-primary shrink-0" />
          <div className="space-y-1">
            <h3 className="font-semibold">{t("tools.diagTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("tools.diagDesc")}</p>
          </div>
        </div>

        <Button onClick={() => void runDiag()} disabled={diagBusy || !isTauri()}>
          {diagBusy ? <Loader2 className="animate-spin" /> : <Stethoscope />}
          {diagBusy ? t("tools.diagRunning") : t("tools.diagRun")}
        </Button>

        {diagError && <p className="text-sm text-destructive">{diagError}</p>}

        {diag && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {diag.map((d) => {
              const { icon: Icon, className } = STATUS_ICON[d.status] ?? STATUS_ICON.info;
              return (
                <li key={d.id} className="flex items-start gap-3 p-3">
                  <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${className}`} />
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">{t(`tools.diag_${d.id}`)}</p>
                    <p className="text-sm text-muted-foreground">
                      {t(`tools.diag_${d.id}_${d.status}`, { value: d.detail })}
                    </p>
                    {d.detail && (
                      <p className="text-xs font-mono text-muted-foreground/80 break-all">{d.detail}</p>
                    )}
                    {d.id === "openkneeboard" && d.status !== "ok" && (
                      <Button size="sm" variant="outline" className="mt-1 h-7 text-xs" onClick={() => openExternal(OPENKNEEBOARD_URL)}>
                        {t("overlays.web.okbDownload")}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
