import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

export function formatLapTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  return `${min}:${sec.toFixed(3).padStart(6, "0")}`;
}

/**
 * Formate un temps exprimé en SECONDES au format `m:ss.mmm` (règle V1
 * `formatSecondsToMmSsMs`). Renvoie `N/A` si null / ≤ 0 / non fini.
 */
export function formatTime(
  seconds: number | null | undefined
): string {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return "N/A";
  const min = Math.floor(seconds / 60);
  const sec = seconds - min * 60;
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
  const min = Math.floor(abs / 60);
  const sec = abs - min * 60;
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

export function formatDelta(ms: number): string {
  const sign = ms >= 0 ? "+" : "−";
  return `${sign}${(Math.abs(ms) / 1000).toFixed(3)}`;
}

export function formatSectorTime(ms: number): string {
  return (ms / 1000).toFixed(3);
}

export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/**
 * Extracts the session date from the XML result file name.
 * LMU files are typically named "YYYY-MM-DD_HH-MM-SS-R.xml" or similar.
 * Returns "DD/MM/YYYY HH:mm" if a date is found, null otherwise.
 */
export function dateFromFileName(fileName: string): string | null {
  // Match YYYY-MM-DD_HH-MM (with optional -SS suffix before extension/type code)
  const m = fileName.match(/(\d{4})-(\d{2})-(\d{2})[_\s](\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  // Match YYYYMMDD_HHMM
  const m2 = fileName.match(/(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})/);
  if (m2) return `${m2[3]}/${m2[2]}/${m2[1]} ${m2[4]}:${m2[5]}`;
  // Match just YYYY-MM-DD (date only, no time)
  const m3 = fileName.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m3) return `${m3[3]}/${m3[2]}/${m3[1]}`;
  return null;
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
