import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge enseigné à reconnaître nos tailles de police custom
 * (`text-nano`/`text-micro`/`text-mini`, déclarées en `@utility` dans
 * `index.css`). Sans ça, twMerge les prend pour des classes `text-*` de couleur
 * et les **supprime** dès qu'une couleur `text-…` est présente dans le même
 * `cn(...)` — ce qui faisait rendre `SessionBadge`/`TierBadge` en 12 px (taille
 * héritée de la cellule) au lieu de 10 px, alors que `ClassBadge` (sans `cn`)
 * restait en 10 px. D'où les pastilles « de tailles différentes » sur GT3.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["nano", "micro", "mini"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Ordre canonique des classes (V1 `CLASS_ORDER` + LMP2 WEC/ELMS). */
export function classOrder(cls: string): number {
  const order: Record<string, number> = {
    Hyper: 1,
    "LMP2 WEC": 2,
    "LMP2 ELMS": 3,
    LMP3: 4,
    GT3: 5,
    GTE: 6,
  };
  return order[cls] ?? 99;
}

/**
 * Formate un temps exprimé en SECONDES au format `m:ss.mmm` (règle V1
 * `formatSecondsToMmSsMs`). Renvoie `N/A` si null / ≤ 0 / non fini.
 */
export function formatTime(
  seconds: number | null | undefined
): string {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return "N/A";
  // Arrondir AU MS d'abord, puis répartir min/sec — sinon un temps comme
  // 119.9999 s donnait "1:60.000" (min sur la valeur brute, sec arrondi par
  // toFixed(3) → "60.000") au lieu de "2:00.000".
  const totalMs = Math.round(seconds * 1000);
  const min = Math.floor(totalMs / 60000);
  const sec = (totalMs % 60000) / 1000;
  return `${min}:${sec.toFixed(3).padStart(6, "0")}`;
}

/** Formate un secteur exprimé en secondes : `ss.mmm`. */
export function formatSectorSeconds(
  seconds: number | null | undefined
): string {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return "—";
  return seconds.toFixed(3);
}

/**
 * Formate un écart (gap) en secondes — V1 `formatSecondsToMmSsMs(..., false)` :
 * - < 60 s → `12.345s` (seul format secondes, plus lisible pour les petits écarts)
 * - ≥ 60 s → `m:ss.mmm` (sinon « 252.643 » devient illisible).
 * Toujours sans préfixe : l'appelant ajoute « +/- » si besoin.
 */
export function formatGap(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return "—";
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  if (abs < 60) return `${sign}${abs.toFixed(3)}s`;
  // Arrondir au ms avant de répartir min/sec (évite "1:60.000", cf. formatTime).
  const totalMs = Math.round(abs * 1000);
  const min = Math.floor(totalMs / 60000);
  const sec = (totalMs % 60000) / 1000;
  return `${sign}${min}:${sec.toFixed(3).padStart(6, "0")}`;
}

/** Compare deux versions de jeu (`1.0110` > `0.9200`). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Fuseau horaire appliqué à l'affichage des dates. `null` = fuseau local du
 * système. Défini au démarrage depuis la config (`setAppTimezone`).
 */
let appTimezone: string | null = null;

/** Définit le fuseau horaire d'affichage (depuis la config). */
export function setAppTimezone(tz: string | null) {
  appTimezone = tz && tz.trim() !== "" ? tz : null;
}

/** Formate un horodatage epoch (secondes) en `JJ/MM/AAAA HH:mm`. */
export function formatDateTime(epochSeconds: number): string {
  if (!epochSeconds) return "—";
  const d = new Date(epochSeconds * 1000);
  const p = (n: number) => n.toString().padStart(2, "0");
  if (appTimezone) {
    // Décompose la date dans le fuseau choisi via Intl.
    try {
      const parts = new Intl.DateTimeFormat("fr-FR", {
        timeZone: appTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(d);
      const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
      return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
    } catch {
      /* fuseau invalide → repli sur le fuseau local */
    }
  }
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Formate un horodatage epoch (secondes) en `JJ/MM/AA` — respecte le fuseau. */
export function formatDateShort(epochSeconds: number): string {
  if (!epochSeconds) return "—";
  const d = new Date(epochSeconds * 1000);
  const p = (n: number) => n.toString().padStart(2, "0");
  if (appTimezone) {
    try {
      const parts = new Intl.DateTimeFormat("fr-FR", {
        timeZone: appTimezone,
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(d);
      const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
      return `${get("day")}/${get("month")}/${get("year")}`;
    } catch {
      /* fuseau invalide → repli sur le fuseau local */
    }
  }
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}

export const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--color-foreground)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
  },
  labelStyle: { color: "var(--color-muted-foreground)", marginBottom: "2px" },
  itemStyle: { color: "var(--color-foreground)" },
  cursor: { fill: "var(--color-muted)", opacity: 0.15 },
};
