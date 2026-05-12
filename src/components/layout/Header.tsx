import { NavLink } from "react-router";
import { Flag, Moon, Sun, Globe, User, ChevronDown, GitBranch, Check } from "lucide-react";
import { useTheme } from "@/stores/theme";
import { useVersion } from "@/stores/version";
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
import { useState } from "react";

const navItems = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/sessions", label: "Sessions" },
  { to: "/records", label: "Records" },
  { to: "/setups", label: "Setups" },
  { to: "/live", label: "Live" },
  { to: "/config", label: "Config" },
];

const profiles = ["Cédric", "Invité"];
const languages = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
];

export function Header() {
  const { theme, toggle } = useTheme();
  const { active: activeVersion, versions, setActive } = useVersion();
  const [profile, setProfile] = useState(profiles[0]);
  const [lang, setLang] = useState(languages[0]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-6">
        <NavLink to="/" className="flex items-center gap-2.5 group">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-105">
            <Flag className="h-4.5 w-4.5" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-bold tracking-tight">LMU Stats Viewer</span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground -mt-0.5">v2 · preview</span>
          </div>
        </NavLink>

        <nav className="flex items-center gap-1 ml-4">
          {navItems.map((item) => (
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
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 font-mono text-xs h-8 mr-1">
                <GitBranch className="h-3.5 w-3.5 text-primary" />
                <span>v{activeVersion.label}</span>
                {activeVersion.isLatest && <span className="text-[9px] uppercase tracking-wider text-primary font-bold ml-0.5">latest</span>}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Version du jeu</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {versions.map((v) => (
                <DropdownMenuItem key={v.id} onSelect={() => setActive(v.id)}>
                  <div className="flex items-center gap-2 w-full">
                    {v.id === activeVersion.id ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="w-3.5" />}
                    <span className="font-mono text-sm">v{v.label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">build {v.build}</span>
                    <div className="ml-auto flex gap-1">
                      {v.isLatest && <span className="text-[9px] uppercase font-bold text-primary">latest</span>}
                      {v.isCurrent && !v.isLatest && <span className="text-[9px] uppercase font-bold text-success">installé</span>}
                    </div>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs text-muted-foreground">
                Filtre stats sur cette version
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 font-medium">
                <Globe className="h-4 w-4" />
                <span className="uppercase text-xs">{lang.code}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Langue</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {languages.map((l) => (
                <DropdownMenuItem key={l.code} onSelect={() => setLang(l)}>
                  <span className="uppercase mr-2 text-xs text-muted-foreground w-6">{l.code}</span>
                  {l.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 font-medium">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                  {profile.charAt(0)}
                </div>
                <span>{profile}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Profil pilote</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {profiles.map((p) => (
                <DropdownMenuItem key={p} onSelect={() => setProfile(p)}>
                  <User className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  {p}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem>+ Nouveau profil</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
