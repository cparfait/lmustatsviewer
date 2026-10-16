import { useState } from "react";
import { Link } from "react-router";
import { Coffee, Github, Heart, ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { APP_VERSION } from "@/lib/changelog";
import { DiscordIcon } from "@/components/DiscordIcon";
import { DISCORD_URL } from "@/lib/links";
import { IntroVideo } from "@/components/IntroVideo";

export function Footer() {
  const { t } = useTranslation();
  // Easter egg : un clic sur le pilote rejoue l'animation complète.
  const [easterEgg, setEasterEgg] = useState(false);
  return (
    <footer className="mt-12 border-t border-border/60 bg-background/60">
      <div className="mx-auto max-w-[1800px] px-4 py-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {/* Le pilote, devant le nom et la version : un clic rejoue l'animation. */}
          <button
            type="button"
            onClick={() => setEasterEgg(true)}
            aria-label={t("footer.easterEggLabel")}
            className="h-8 w-8 shrink-0 overflow-hidden rounded-full transition-transform hover:scale-110 hover:rotate-[-6deg] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img src="/logos/avatar.png" alt="" className="h-full w-full object-cover" />
          </button>
          <span className="font-mono">LMU Stats Viewer · v{APP_VERSION}</span>
          <span className="text-muted-foreground/40">·</span>
          <Link
            to="/changelog"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ScrollText className="h-3 w-3" />
            {t("changelog.title")}
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1">
            {t("footer.madeWith")}{" "}
            <Heart
              className="h-3 w-3 text-destructive"
              fill="currentColor"
            />{" "}
            {t("footer.forCommunity")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-[#5865F2] hover:bg-[#5865F2]/10 transition-colors"
          >
            <DiscordIcon className="h-3.5 w-3.5" />
            Discord
          </a>

          <a
            href="https://github.com/cparfait/lmustatsviewer"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          >
            <Github className="h-3.5 w-3.5" />
            GitHub
          </a>

          <a
            href="https://buymeacoffee.com/cristof"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-[#FFDD00] text-[#0A0E1A] hover:bg-[#FFCC00] transition-colors font-semibold text-xs shadow-sm hover:shadow-md"
            title={t("footer.bmcTitle")}
          >
            <Coffee className="h-3.5 w-3.5" />
            Buy me a coffee
          </a>
        </div>
      </div>
      {easterEgg && <IntroVideo src="/easter/lmu-splash.mp4" onClose={() => setEasterEgg(false)} />}
    </footer>
  );
}
