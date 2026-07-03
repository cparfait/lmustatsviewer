import { NavLink } from "react-router";
import { Flag, Moon, Sun, Globe, User, Check } from "lucide-react";
import { useTheme } from "@/stores/theme";
import { useAppStore } from "@/stores/app";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const navKeys = [
  { to: "/profile", key: "profile" },
  { to: "/", key: "records", end: true },
  { to: "/sessions", key: "sessions" },
  { to: "/references", key: "references" },
  { to: "/setups", key: "setups" },
  { to: "/live", key: "live" },
  { to: "/overlays", key: "overlays" },
  { to: "/telemetry", key: "telemetry" },
  { to: "/config", key: "config" },
  { to: "/config-v2", key: "configV2" },
];

/** Entrées de menu désactivables par l'utilisateur (Records=accueil & Config toujours
 *  visibles ; Références est piloté par l'option ohne_speed). */
export const MENU_MODULE_KEYS = [
  "profile",
  "sessions",
  "setups",
  "live",
  "overlays",
  "telemetry",
] as const;
const TOGGLEABLE = new Set<string>(MENU_MODULE_KEYS);

const languages = [
  { code: "fr", label: "Français", flag: "fr" },
  { code: "en", label: "English", flag: "gb" },
  { code: "es", label: "Español", flag: "es" },
  { code: "de", label: "Deutsch", flag: "de" },
];

export function Header() {
  const { theme, toggle } = useTheme();
  const { t, i18n } = useTranslation();
  const playerName = useAppStore((s) => s.playerName);
  const menuModules = useAppStore((s) => s.menuModules);
  const showOhneSpeed = useAppStore((s) => s.showOhneSpeed);

  const currentLang =
    languages.find((l) => i18n.language?.startsWith(l.code)) ?? languages[0];

  // Références : visible seulement si l'option ohne_speed est active. Autres
  // modules désactivables : masqués si explicitement mis à false.
  const visibleNav = navKeys.filter((item) => {
    if (item.key === "references") return showOhneSpeed;
    if (TOGGLEABLE.has(item.key)) return menuModules[item.key] !== false;
    return true;
  });

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-6 px-4">
        <NavLink to="/" className="flex items-center gap-2.5 group">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-105">
            <Flag className="h-4.5 w-4.5" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-bold tracking-tight">
              LMU Stats Viewer
            </span>
          </div>
        </NavLink>

        <nav className="flex items-center gap-1 ml-4">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  isActive
                    ? "text-foreground bg-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                )
              }
            >
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                {currentLang ? (
                  <img
                    src={`/flags/${currentLang.flag}.png`}
                    alt={currentLang.label}
                    className="h-3.5 w-auto rounded-[2px]"
                  />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                <span className="uppercase text-xs">
                  {currentLang?.code ?? i18n.language}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("header.language")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {languages.map((l) => (
                <DropdownMenuItem
                  key={l.code}
                  onSelect={() => i18n.changeLanguage(l.code)}
                  className="gap-2"
                >
                  <img
                    src={`/flags/${l.flag}.png`}
                    alt={l.label}
                    className="h-3.5 w-auto rounded-[2px]"
                  />
                  {l.label}
                  {currentLang?.code === l.code && (
                    <Check className="h-3.5 w-3.5 ml-auto text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Nom du joueur (mono-profil, lecture seule) */}
          {playerName && (
            <div className="flex items-center gap-1.5 pl-2 ml-1 border-l border-border/60">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                {playerName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium">{playerName}</span>
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
