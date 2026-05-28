import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Languages } from "lucide-react";
import {
  CHANGELOG,
  type ChangelogEntry,
  type ChangelogSectionKind,
} from "@/lib/changelog";
import { cn } from "@/lib/utils";

const SECTION_META: Record<
  ChangelogSectionKind,
  { icon: string; color: string }
> = {
  added: { icon: "✅", color: "text-success" },
  improved: { icon: "⬆️", color: "text-sky-400" },
  fixed: { icon: "🐛", color: "text-yellow-500" },
  changed: { icon: "♻️", color: "text-purple" },
  removed: { icon: "🗑️", color: "text-destructive" },
};

const LANG_MAP: Record<string, string> = {
  fr: "fr",
  en: "en",
  es: "es",
  de: "de",
};

function translateEntry(entry: ChangelogEntry, targetLang: string) {
  const text = entry.sections
    .flatMap((s) => s.items)
    .join("\n");
  if (!text.trim()) return;
  const lang = LANG_MAP[targetLang] ?? "en";
  window.open(
    `https://translate.google.com/?sl=en&tl=${lang}&text=${encodeURIComponent(text)}&op=translate`,
    "_blank"
  );
}

export function Changelog() {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          to="/config"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-3 w-3" /> {t("changelog.back")}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("changelog.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("changelog.subtitle")}
        </p>
      </div>

      {CHANGELOG.map((entry) => (
        <Card key={entry.version} className="overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-primary/5">
            <span
              className={cn(
                "rounded-md px-2.5 py-1 text-sm font-bold",
                entry.dev
                  ? "bg-yellow-500/20 text-yellow-500"
                  : "bg-primary/20 text-primary"
              )}
            >
              v{entry.version}
            </span>
            <span className="text-sm text-muted-foreground font-mono">
              {entry.date}
            </span>
            {entry.dev && (
              <span className="text-xs text-yellow-500/80 uppercase tracking-wide">
                {t("changelog.dev")}
              </span>
            )}
            <button
              onClick={() => translateEntry(entry, i18n.language)}
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title={t("changelog.translate")}
            >
              <Languages className="h-3.5 w-3.5" />
              {t("changelog.translate")}
            </button>
          </div>
          <CardContent className="p-4 flex flex-col gap-4">
            {entry.sections.map((section) => {
              const meta = SECTION_META[section.kind];
              return (
                <div key={section.kind}>
                  <h3
                    className={cn(
                      "text-sm font-bold mb-1.5 flex items-center gap-1.5",
                      meta.color
                    )}
                  >
                    <span>{meta.icon}</span>
                    {t(`changelog.${section.kind}`)}
                  </h3>
                  <ul className="flex flex-col gap-1 pl-1">
                    {section.items.map((item, i) => (
                      <li
                        key={i}
                        className="text-sm text-foreground/90 flex gap-2"
                      >
                        <span className="text-muted-foreground/50 select-none">
                          •
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
