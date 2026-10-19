import { useEffect, useState } from "react";
import { isTauri } from "@/lib/api";
import { regie } from "@/lib/regie";

type Theme = "dark" | "light";

// v2 : clé renommée → efface la valeur "dark" enregistrée par les versions précédentes.
// Les utilisateurs existants repartent du défaut "light" ; les préférences futures sont conservées.
const STORAGE_KEY = "lmu-theme-v2";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === "dark" || stored === "light") return stored;
  return "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem(STORAGE_KEY, theme);
    // La régie tablette suit le thème de l'app.
    if (isTauri()) void regie.setTheme(theme).catch(() => {});
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggle = () => setThemeState((t) => (t === "dark" ? "light" : "dark"));

  return { theme, setTheme, toggle };
}
