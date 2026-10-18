/**
 * Fenêtre « Mise à jour installée » : au premier lancement qui suit une mise à jour,
 * les nouveautés de la (ou des) version(s) installée(s), tirées du journal
 * (`lib/changelog.ts`). Titre et accroche de la version, nouveautés mises en avant,
 * le reste compté par type avec un lien vers le journal complet.
 *
 * `WhatsNewHost` décide de l'ouverture (version installée plus récente que la
 * dernière vue, réglage actif, ni onboarding ni Live) ; fermer la fenêtre marque la
 * version installée comme vue. Réglage d'affichage désactivé : la version est
 * marquée comme vue en silence (le réactiver ne ressort pas tout l'historique).
 *
 * Rendue dans `document.body` (portail), comme la fenêtre d'aide.
 */

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiscordIcon } from "@/components/DiscordIcon";
import { DISCORD_URL } from "@/lib/links";
import { APP_VERSION, CHANGELOG, normalizeItem, pickLang, type ChangelogEntry, type ChangelogItem } from "@/lib/changelog";
import { SECTION_META, leadSep, splitLead } from "@/lib/changelogView";
import { digestEntry, isUpgrade, pendingEntries } from "@/lib/whatsNew";
import { useAppStore } from "@/stores/app";
import { useTourStore } from "@/stores/tour";
import { useWhatsNewStore } from "@/stores/whatsNew";
import { cn } from "@/lib/utils";

/** Ouvre la fenêtre au lancement qui suit une mise à jour. */
export function WhatsNewHost({ blocked }: { blocked: boolean }) {
  const configLoaded = useAppStore((s) => s.configLoaded);
  const enabled = useAppStore((s) => s.whatsNew);
  const lastSeen = useAppStore((s) => s.lastSeenVersion);
  const tourOpen = useTourStore((s) => s.open);
  const open = useWhatsNewStore((s) => s.open);

  useEffect(() => {
    if (!configLoaded || blocked || tourOpen || open) return;
    if (!isUpgrade(lastSeen)) return;
    if (enabled && pendingEntries(lastSeen).length) useWhatsNewStore.getState().show(false);
    else void useAppStore.getState().setLastSeenVersion(APP_VERSION).catch(() => {});
  }, [configLoaded, blocked, tourOpen, open, enabled, lastSeen]);

  if (!open || blocked) return null;
  return <WhatsNewModal />;
}

function WhatsNewModal() {
  const { t, i18n } = useTranslation();
  const lastSeen = useAppStore((s) => s.lastSeenVersion);
  const preview = useWhatsNewStore((s) => s.preview);
  const version = useWhatsNewStore((s) => s.version);
  const lang = i18n.language;

  const entries = useMemo<ChangelogEntry[]>(() => {
    if (version) return CHANGELOG.filter((e) => e.version === version);
    return pendingEntries(preview ? "" : lastSeen);
  }, [version, preview, lastSeen]);

  const close = () => {
    if (!preview) void useAppStore.getState().setLastSeenVersion(APP_VERSION).catch(() => {});
    useWhatsNewStore.getState().close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  const shownVersion = entries[0]?.version ?? APP_VERSION;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-start gap-3 border-b border-border/60 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t(preview ? "whatsNew.kickerPreview" : "whatsNew.kicker")}
            </p>
            <h2 id="whats-new-title" className="text-lg font-bold leading-tight">
              {t("whatsNew.title", { version: shownVersion })}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("coach.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenu */}
        <div className="flex flex-col gap-6 overflow-y-auto p-4">
          {entries.length === 0 && <p className="text-sm text-muted-foreground">{t("whatsNew.empty")}</p>}
          {entries.map((entry) => (
            <EntryBlock key={entry.version} entry={entry} lang={lang} showVersion={entries.length > 1} onNavigate={close} />
          ))}
        </div>

        {/* Pied */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 p-3">
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-[#5865F2]"
          >
            <DiscordIcon className="h-3.5 w-3.5 shrink-0 text-[#5865F2]" />
            <span>{t("whatsNew.thanks")}</span>
          </a>
          <Link
            to="/changelog"
            onClick={close}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            {t("whatsNew.fullLog")}
            <ArrowRight className="h-3 w-3" />
          </Link>
          <Button size="sm" onClick={close}>
            {t("whatsNew.close")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EntryBlock({
  entry,
  lang,
  showVersion,
  onNavigate,
}: {
  entry: ChangelogEntry;
  lang: string;
  showVersion: boolean;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  const { highlights, plain, rest } = digestEntry(entry);
  const restParts = (Object.keys(rest) as (keyof typeof rest)[]).map((kind) =>
    t(`whatsNew.rest_${kind}`, { count: rest[kind] ?? 0 }),
  );

  return (
    <section className="flex flex-col gap-3">
      {showVersion && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-primary/15 px-1.5 py-0.5 font-bold text-primary">v{entry.version}</span>
          <span className="font-mono">{entry.date}</span>
        </div>
      )}
      {(entry.headline || entry.intro) && (
        <div>
          {entry.headline && (
            <h3 className="text-base font-bold text-foreground">{pickLang(entry.headline, lang)}</h3>
          )}
          {entry.intro && <p className="mt-1 text-sm text-muted-foreground">{pickLang(entry.intro, lang)}</p>}
        </div>
      )}

      {highlights.length > 0 && (
        <ul className="flex flex-col gap-2">
          {highlights.map((it, i) => (
            <Highlight key={i} item={it} lang={lang} />
          ))}
        </ul>
      )}

      {plain.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {entry.sections.map((section) =>
            section.items
              .filter((it) => plain.includes(it))
              .map((it, i) => (
                <li key={`${section.kind}-${i}`} className="flex gap-2 text-sm text-foreground/90">
                  <span className={cn("select-none", SECTION_META[section.kind].color)}>
                    {SECTION_META[section.kind].icon}
                  </span>
                  <LeadText text={pickLang(normalizeItem(it).text, lang)} lang={lang} />
                </li>
              )),
          )}
        </ul>
      )}

      {restParts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("whatsNew.andAlso", { list: restParts.join(" · ") })}{" "}
          <Link to="/changelog" onClick={onNavigate} className="font-medium text-primary hover:underline">
            {t("whatsNew.seeAll")}
          </Link>
        </p>
      )}
    </section>
  );
}

/** « Titre : description » → titre en gras. */
function LeadText({ text, lang, accent = false }: { text: string; lang: string; accent?: boolean }) {
  const { lead, rest } = splitLead(text);
  return (
    <span className="text-foreground/90">
      {lead && (
        <span className={cn("font-semibold", accent ? "text-primary" : "text-foreground")}>
          {lead}
          {leadSep(lang)}
        </span>
      )}
      {lead ? rest : text}
    </span>
  );
}

function Highlight({ item, lang }: { item: ChangelogItem; lang: string }) {
  return (
    <li className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-2 text-sm">
      <span className="select-none leading-5 text-primary">★</span>
      <LeadText text={pickLang(normalizeItem(item).text, lang)} lang={lang} accent />
    </li>
  );
}
