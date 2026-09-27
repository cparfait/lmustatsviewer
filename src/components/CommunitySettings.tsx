/**
 * Configuration → Communauté : partage des meilleurs tours (COMMUNITY-SPEC.md, lot 2).
 *
 * - Désactivé par défaut ; l'activation passe par un écran explicite (ce qui part / ce
 *   qui ne part jamais, nom LMU affiché en clair avec « Rester anonyme » sur le même
 *   écran — exigence RGPD art. 25-2, spec §9).
 * - Le nom affiché est le nom de pilote écrit par le jeu : non modifiable ici.
 * - Transparence : aperçu exact d'un envoi ; suppression réelle des données du serveur.
 * - « Rester anonyme » est décoché par défaut (décision mainteneur 2026-09-27) : le nom LMU
 *   qui sera affiché est écrit en clair sur l'écran d'activation, avec la case juste à côté.
 * - `CommunityInvite` : la même fenêtre, proposée au lancement puis une seule fois après
 *   un record personnel. Rien n'est partagé tant que le joueur n'a pas cliqué « Activer
 *   le partage » (consentement explicite) : le bouton est seulement mis en avant.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Eye, Loader2, Send, ShieldCheck, Trash2, X, Lock, AlertTriangle, Trophy, Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { community, isTauri, type CommunityPosition, type CommunityStats, type CommunityStatus, type MyCombo } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { useAppStore } from "@/stores/app";
import { useTourStore } from "@/stores/tour";
import { confirmDialog, toast, toastError, toastSuccess } from "@/stores/dialogs";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="flex max-h-[90vh] w-full max-w-2xl flex-col shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-primary/20 bg-primary/[0.06] px-5 py-3">
          <CardTitle className="text-base">{title}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="close">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto p-5">{children}</CardContent>
      </Card>
    </div>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

export function CommunitySettings() {
  const { t, i18n } = useTranslation();
  const playerName = useAppStore((s) => s.playerName);
  const [status, setStatus] = useState<CommunityStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const steam = useSteamLogin();

  const refresh = useCallback(() => {
    if (!isTauri()) return;
    community.status().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!isTauri()) {
    return <p className="text-sm text-muted-foreground">{t("community.notDesktop")}</p>;
  }

  const relative = (ts: number | null) => {
    if (!ts) return t("community.never");
    const diff = Math.round((ts * 1000 - Date.now()) / 60000);
    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
    if (Math.abs(diff) < 60) return rtf.format(diff, "minute");
    if (Math.abs(diff) < 60 * 24) return rtf.format(Math.round(diff / 60), "hour");
    return rtf.format(Math.round(diff / 1440), "day");
  };

  const errorText = (e: string | null) => {
    if (!e) return null;
    if (e.startsWith("network") || e.startsWith("http_5") || e.startsWith("bad_ack") || e === "http_429")
      return t("community.errNetwork");
    if (e === "daily_quota") return t("community.errQuota");
    if (e === "http_401") return t("community.errAuth");
    if (e === "steam_required") return t("community.errSteam");
    return t("community.errGeneric", { error: e });
  };

  const shownName = status?.anonymous && status.tag ? t("community.anonTag", { tag: status.tag }) : playerName;

  const openPreview = async () => {
    try {
      setPreview(await community.preview());
    } catch (e) {
      toastError(String(e));
    }
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      const r = await community.sync();
      if (r.error) toast(errorText(r.error) ?? r.error);
      else if (r.sent > 0) toastSuccess(t("community.syncDone", { count: r.sent }));
      else toast(t("community.syncNothing"));
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const onToggle = async (on: boolean) => {
    if (on) {
      setActivateOpen(true);
      return;
    }
    setBusy(true);
    try {
      setStatus(await community.disable());
      toast(t("community.disabledToast"));
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleAnon = async (value: boolean) => {
    setBusy(true);
    try {
      setStatus(await community.setAnonymous(value));
    } catch {
      toastError(t("community.errNetwork"));
    } finally {
      setBusy(false);
    }
  };

  const deleteData = async () => {
    const ok = await confirmDialog({
      title: t("community.deleteConfirmTitle"),
      message: t("community.deleteConfirmText"),
      confirmLabel: t("community.deleteBtn"),
      destructive: true,
    });
    if (!ok) return;
    // Autre PC (aucune identité ici) : Steam prouve que ce sont vos tours.
    if (!status?.registered && !status?.vault_tag) {
      try {
        const r = await steam.run("recover");
        if (r.status !== "ok") {
          if (r.status !== "cancelled") toastError(steamError(t, r.status));
          return;
        }
      } catch {
        toastError(t("community.steamFailed"));
        return;
      }
    }
    setBusy(true);
    try {
      setStatus(await community.deleteData());
      toastSuccess(t("community.deleteDone"));
    } catch {
      toastError(t("community.deleteFailed"));
    } finally {
      setBusy(false);
    }
  };

  const linkSteam = async () => {
    try {
      const r = await steam.run("link");
      if (r.status === "ok") toastSuccess(t("community.steamLinkDone"));
      else if (r.status !== "cancelled") toastError(steamError(t, r.status));
    } catch {
      toastError(t("community.steamFailed"));
    } finally {
      refresh();
    }
  };

  const err = errorText(status?.last_error ?? null);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{t("community.shareTitle")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("community.shareDesc")}</p>
          </div>
          <Switch checked={!!status?.enabled} disabled={busy || !status} onCheckedChange={onToggle} />
        </div>
        {status?.registered && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [t("community.statSent"), String(status.sent)],
              [t("community.statPending"), String(status.pending)],
              [t("community.statLast"), relative(status.last_sent_at)],
              [t("community.statName"), shownName],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md bg-muted/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p>
                <p className="truncate text-sm font-semibold">{v}</p>
              </div>
            ))}
          </div>
        )}
        {status?.enabled && err && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {err}
          </p>
        )}
        {status && status.rejected > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">{t("community.rejectedNote", { count: status.rejected })}</p>
        )}
        {status?.registered && status.tag && (
          <p className="mt-2 text-[11px] text-muted-foreground">{t("community.tagNote", { tag: status.tag })}</p>
        )}
        {status?.registered && <p className="mt-2 text-[11px] text-muted-foreground">{t("community.disableNote")}</p>}
        {status?.enabled && (
          <div className="mt-3">
            <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={syncNow}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {t("community.syncNow")}
            </Button>
          </div>
        )}
      </div>

      <Row title={`${t("community.nameTitle")} : ${playerName}`} desc={t("community.nameDesc")}>
        {status?.registered && (
          <label className="flex items-center gap-2 text-sm font-medium">
            {t("community.anonymous")}
            <Switch checked={status.anonymous} disabled={busy} onCheckedChange={toggleAnon} />
          </label>
        )}
      </Row>

      {status?.registered && (
        <Row title={t("community.steamTitle")} desc={status.steam_linked ? t("community.steamLinkedDesc") : t("community.steamDesc")}>
          {steam.waiting ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("community.steamWaiting")}
              <Button size="sm" variant="ghost" onClick={steam.cancel}>
                {t("community.steamCancel")}
              </Button>
            </div>
          ) : status.steam_linked ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              {t("community.steamLinked")}
            </span>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={linkSteam}>
              <Link2 className="h-3.5 w-3.5" />
              {t("community.steamLink")}
            </Button>
          )}
        </Row>
      )}

      <Row title={t("community.previewTitle")} desc={t("community.previewDesc")}>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={openPreview}>
          <Eye className="h-3.5 w-3.5" />
          {t("community.previewBtn")}
        </Button>
      </Row>

      <Row title={t("community.deleteTitle")} desc={t("community.deleteDesc")}>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={busy || !status || steam.waiting}
          onClick={deleteData}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("community.deleteBtn")}
        </Button>
      </Row>

      {activateOpen && status && (
        <ActivateDialog
          status={status}
          onClose={() => setActivateOpen(false)}
          onActivated={async (s) => {
            setStatus(s);
            setActivateOpen(false);
            await syncNow();
          }}
        />
      )}

      {preview !== null && (
        <Modal title={t("community.previewModalTitle")} onClose={() => setPreview(null)}>
          {preview ? (
            <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted/60 p-3 text-xs leading-relaxed">{preview}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">{t("community.previewEmpty")}</p>
          )}
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
              {t("community.close")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

type DialogVariant = "settings" | "invite" | "record";

/** « Voici la place que vous auriez » : le bénéfice du partage, montré avant l'activation. */
function Teaser({ combo }: { combo: MyCombo | null }) {
  const { t } = useTranslation();
  const [pos, setPos] = useState<CommunityPosition | null>(null);
  const [drivers, setDrivers] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    if (combo) {
      community
        .get<CommunityPosition>("combos/position", {
          track: combo.track,
          course: combo.track_course,
          class: combo.car_class,
          time: combo.best,
        })
        .then((p) => alive && setPos(p))
        .catch(() => {});
    }
    community
      .get<CommunityStats>("stats")
      .then((s) => alive && setDrivers(s?.drivers ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [combo]);

  const text =
    combo && pos && pos.drivers > 0
      ? t("community.teaserPos", {
          time: formatTime(combo.best),
          track: combo.track_course,
          cls: combo.car_class,
          rank: pos.rank,
          n: pos.drivers,
        })
      : drivers
        ? t("community.teaserDrivers", { count: drivers })
        : null;
  if (!text) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/40 bg-gradient-to-r from-primary/15 to-primary/[0.03] p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Trophy className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-bold">{text}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("community.teaserCta")}</p>
      </div>
    </div>
  );
}

type SteamResult = { status: string; tag: string | null; anonymous: boolean | null; existing?: boolean | null };

/**
 * Connexion Steam : ouvre la page officielle de Steam dans le navigateur, puis interroge
 * le serveur toutes les 2 s (10 min au plus) jusqu'au résultat.
 */
function useSteamLogin() {
  const [waiting, setWaiting] = useState(false);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const run = async (mode: "register" | "link" | "recover"): Promise<SteamResult> => {
    stop.current = false;
    setWaiting(true);
    try {
      const { url, poll_id } = await community.steamStart(mode);
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      const until = Date.now() + 10 * 60_000;
      while (!stop.current && Date.now() < until) {
        await new Promise((r) => setTimeout(r, 2000));
        const r = await community.steamPoll(poll_id);
        if (r.status !== "pending") return r;
      }
      return { status: stop.current ? "cancelled" : "expired", tag: null, anonymous: null };
    } finally {
      setWaiting(false);
    }
  };
  return {
    waiting,
    run,
    cancel: () => {
      stop.current = true;
    },
  };
}

const steamError = (t: (k: string) => string, status: string) =>
  status === "not_found" ? t("community.steamNotFound") : status === "taken" ? t("community.steamTaken") : t("community.steamFailed");

/**
 * Fenêtre d'activation du partage : bénéfice (invitation), ce qui part / ne part jamais,
 * nom LMU non modifiable avec « Rester anonyme » (décoché par défaut), historique en option.
 * N'active rien tant que le joueur n'a pas cliqué « Activer le partage ».
 */
function ActivateDialog({
  status,
  variant = "settings",
  combo = null,
  onClose,
  onActivated,
}: {
  status: CommunityStatus;
  variant?: DialogVariant;
  /** Combo mis en avant dans l'aperçu de place (invitation / record). */
  combo?: MyCombo | null;
  onClose: () => void;
  onActivated: (s: CommunityStatus) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const playerName = useAppStore((s) => s.playerName);
  const invite = variant !== "settings";
  const [anon, setAnon] = useState(status.registered ? status.anonymous : false);
  // Sessions passées cochées par défaut, depuis l'invitation comme depuis la Configuration.
  const [history, setHistory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const activateRef = useRef<HTMLButtonElement>(null);
  // Connexion Steam obligatoire : elle crée l'identité, ou reprend celle du compte Steam.
  const steam = useSteamLogin();

  useEffect(() => {
    if (invite) activateRef.current?.focus();
  }, [invite]);

  const openPreview = async () => {
    try {
      setPreview(await community.preview());
    } catch (e) {
      toastError(String(e));
    }
  };

  const activate = async () => {
    setBusy(true);
    try {
      // Rien ne part sans lien Steam : connexion d'abord (sauf installation déjà liée).
      let recovered: string | null = null;
      if (!(status.registered && status.steam_linked)) {
        const r = await steam.run("register");
        if (r.status !== "ok") {
          if (r.status !== "cancelled") toastError(steamError(t, r.status));
          return;
        }
        if (r.existing && r.tag) recovered = r.tag;
      }
      const s = await community.enable(history, anon);
      toastSuccess(recovered ? t("community.steamRecovered", { tag: recovered }) : t("community.enabledToast"));
      await onActivated(s);
    } catch {
      toastError(t("community.activateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const title =
    variant === "record" ? t("community.recordTitle") : variant === "invite" ? t("community.inviteTitle") : t("community.activateTitle");

  return (
    <>
      <Modal title={title} onClose={onClose}>
        {variant === "record" && combo && (
          <p className="mb-3 text-sm font-semibold">
            {t("community.recordHook", { time: formatTime(combo.best), track: combo.track_course, cls: combo.car_class })}
          </p>
        )}
        {invite && <Teaser combo={combo} />}
        <p className="mb-4 text-sm text-muted-foreground">{t("community.activateIntro")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              {t("community.sentTitle")}
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {[1, 2, 3, 4].map((i) => <li key={i}>{t(`community.sent${i}`)}</li>)}
            </ul>
          </div>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
              <X className="h-3.5 w-3.5 text-destructive" />
              {t("community.neverTitle")}
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {[1, 2, 3, 4].map((i) => <li key={i}>{t(`community.never${i}`)}</li>)}
            </ul>
          </div>
        </div>

        <div className="mt-4 space-y-2 rounded-xl border-2 border-primary/70 bg-primary/[0.05] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("community.nameAs")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className={anon ? "text-xl font-extrabold line-through opacity-40" : "text-xl font-extrabold"}>
              {playerName}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" />
              {t("community.nameLock")}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {t("community.previewLabel")}{" "}
              <b className="text-foreground">{anon ? t("community.anonPending") : playerName}</b>
            </span>
            <label className="flex items-center gap-2 text-sm font-semibold">
              {t("community.anonymous")}
              <Switch checked={anon} onCheckedChange={setAnon} />
            </label>
          </div>
        </div>

        {!(status.registered && status.steam_linked) && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="space-y-1">
              <p>{t("community.steamRequired")}</p>
              {status.vault_tag && <p>{t("community.vaultFound", { tag: status.vault_tag })}</p>}
              {steam.waiting && (
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("community.steamWaiting")}
                  <button type="button" className="underline" onClick={steam.cancel}>
                    {t("community.steamCancel")}
                  </button>
                </p>
              )}
            </div>
          </div>
        )}

        {status.history_available > 0 && (
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 accent-[var(--color-primary)]"
              checked={history}
              onChange={(e) => setHistory(e.target.checked)}
            />
            {t("community.history", { count: status.history_available })}
          </label>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <div className="space-y-1">
            <button type="button" className="text-xs text-primary underline" onClick={openPreview}>
              {t("community.seeExact")}
            </button>
            {invite && <p className="text-[11px] text-muted-foreground">{t("community.inviteLaterNote")}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={invite ? "ghost" : "outline"}
              size="sm"
              className={invite ? "text-muted-foreground" : undefined}
              onClick={onClose}
            >
              {t("community.later")}
            </Button>
            <Button
              ref={activateRef}
              size={invite ? "default" : "sm"}
              className={invite ? "gap-1.5 px-5 shadow-lg shadow-primary/30" : "gap-1.5"}
              disabled={busy}
              onClick={activate}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {busy
                ? t("community.activating")
                : status.registered && status.steam_linked
                  ? t("community.activate")
                  : t("community.activateSteam")}
            </Button>
          </div>
        </div>
      </Modal>
      {preview !== null && (
        <Modal title={t("community.previewModalTitle")} onClose={() => setPreview(null)}>
          {preview ? (
            <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted/60 p-3 text-xs leading-relaxed">{preview}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">{t("community.previewEmpty")}</p>
          )}
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
              {t("community.close")}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Suivi de l'invitation (localStorage) :
 * - absent → invitation au lancement ;
 * - `record` → « Plus tard » a été choisi : on garde la photo des meilleurs tours et on
 *   repropose **une seule fois**, dès qu'un de ces temps est battu ;
 * - `done` → plus jamais (le réglage reste dans Configuration → Communauté).
 */
type InviteState = { stage: "record" | "done"; bests?: Record<string, number> };
const INVITE_KEY = "lmu.communityInvite";
const comboKey = (c: MyCombo) => `${c.track}|${c.track_course}|${c.car_class}`;

function readInvite(): InviteState | null {
  try {
    return JSON.parse(localStorage.getItem(INVITE_KEY) ?? "null") as InviteState | null;
  } catch {
    return null;
  }
}
const writeInvite = (s: InviteState) => localStorage.setItem(INVITE_KEY, JSON.stringify(s));

interface InviteShow {
  status: CommunityStatus;
  variant: "invite" | "record";
  combo: MyCombo | null;
  combos: MyCombo[];
}

/** Invitation au partage : au lancement, puis une seule fois après un record personnel. */
export function CommunityInvite({ blocked }: { blocked: boolean }) {
  const { t } = useTranslation();
  const playerName = useAppStore((s) => s.playerName);
  const dataVersion = useAppStore((s) => s.dataVersion);
  const tourOpen = useTourStore((s) => s.open);
  const [show, setShow] = useState<InviteShow | null>(null);

  useEffect(() => {
    if (!isTauri() || blocked || tourOpen || !playerName || show) return;
    const state = readInvite();
    if (state?.stage === "done") return;
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const [status, combos] = await Promise.all([community.status(), community.myCombos()]);
        if (!alive) return;
        if (status.enabled || status.registered) {
          writeInvite({ stage: "done" });
          return;
        }
        if (!state) {
          setShow({ status, variant: "invite", combo: combos[0] ?? null, combos });
          return;
        }
        const pb = combos.find((c) => {
          const before = state.bests?.[comboKey(c)];
          return before != null && c.best < before - 0.0005;
        });
        if (pb) setShow({ status, variant: "record", combo: pb, combos });
      } catch {
        /* service injoignable : on réessaiera au prochain lancement / import */
      }
    }, state ? 1000 : 2500);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [blocked, tourOpen, playerName, dataVersion, show]);

  if (!show || blocked) return null;

  const close = (activated: boolean) => {
    if (!activated && show.variant === "invite") {
      writeInvite({ stage: "record", bests: Object.fromEntries(show.combos.map((c) => [comboKey(c), c.best])) });
    } else {
      writeInvite({ stage: "done" });
    }
    setShow(null);
  };

  return (
    <ActivateDialog
      status={show.status}
      variant={show.variant}
      combo={show.combo}
      onClose={() => close(false)}
      onActivated={async () => {
        close(true);
        try {
          const r = await community.sync();
          if (!r.error && r.sent > 0) toastSuccess(t("community.syncDone", { count: r.sent }));
        } catch {
          /* la synchro de fond réessaiera */
        }
      }}
    />
  );
}
