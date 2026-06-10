/**
 * Registre central des overlays in-game.
 *
 * Source de vérité unique partagée par la page de gestion (`routes/Overlays.tsx`)
 * et le moteur de rendu (`components/overlay/OverlayRoot.tsx`). Chaque overlay
 * déclare son icône, sa couleur d'accent, ses clés i18n, sa position par défaut
 * et la liste des éléments de contenu activables (onglet « Content »).
 */

import {
  Zap,
  List,
  ArrowUpDown,
  CircleDot,
  Triangle,
  Cloud,
  Fuel,
  Flag,
  Map as MapIcon,
  LayoutGrid,
  Swords,
  Clock,
  Timer,
  AlertTriangle,
  TrendingUp,
  Activity,
  type LucideIcon,
} from "lucide-react";

export type OverlayId =
  | "telemetry"
  | "standings"
  | "relative"
  | "fuel"
  | "tyres"
  | "delta"
  | "weather"
  | "flags"
  | "trackmap"
  | "dashboard"
  | "rival"
  | "session"
  | "endurance"
  | "damage"
  | "speed"
  | "liftcoast";

/** Un élément de contenu activable d'un overlay (onglet « Content »). */
export interface OverlayElement {
  key: string;
  /** Activé par défaut (true si absent). */
  default?: boolean;
}

export interface OverlayDef {
  id: OverlayId;
  icon: LucideIcon;
  /** Couleur d'accent (hex) — liseré, glow, titres. */
  accent: string;
  /** Position par défaut (px, coin haut-gauche dans la fenêtre overlay). */
  defaultX: number;
  defaultY: number;
  /** Largeur de référence (px) — sert au placement par défaut en grille. */
  width: number;
  /** Éléments de contenu activables. */
  elements: OverlayElement[];
}

/**
 * Définitions. Les libellés (titre/description/éléments) viennent de l'i18n :
 *   overlays.items.<id>.title / .desc
 *   overlays.elements.<key>
 */
export const OVERLAY_DEFS: OverlayDef[] = [
  {
    id: "telemetry",
    icon: Zap,
    accent: "#10b981",
    defaultX: 40,
    defaultY: 600,
    width: 420,
    elements: [
      { key: "speed" },
      { key: "gear" },
      { key: "rpm" },
      { key: "pedals" },
      { key: "trace" },
      { key: "shiftAnim" },
      { key: "lockup" },
    ],
  },
  {
    id: "standings",
    icon: List,
    accent: "#38bdf8",
    defaultX: 40,
    defaultY: 120,
    width: 460,
    elements: [
      { key: "classColors" },
      { key: "gaps" },
      { key: "sectors" },
      { key: "bestLap" },
    ],
  },
  {
    id: "relative",
    icon: ArrowUpDown,
    accent: "#a78bfa",
    defaultX: 40,
    defaultY: 360,
    width: 440,
    elements: [{ key: "classColors" }, { key: "gaps" }, { key: "pitFlag" }],
  },
  {
    id: "fuel",
    icon: Fuel,
    accent: "#f59e0b",
    defaultX: 1480,
    defaultY: 120,
    width: 320,
    elements: [
      { key: "toAdd" },
      { key: "lapsLeft" },
      { key: "consumption" },
    ],
  },
  {
    id: "tyres",
    icon: CircleDot,
    accent: "#ec4899",
    defaultX: 1480,
    defaultY: 360,
    width: 320,
    elements: [
      { key: "temps" },
      { key: "wear" },
      { key: "pressure" },
      { key: "brakes" },
    ],
  },
  {
    id: "delta",
    icon: Triangle,
    accent: "#22d3ee",
    defaultX: 700,
    defaultY: 40,
    width: 360,
    elements: [{ key: "bar" }, { key: "trace" }],
  },
  {
    id: "weather",
    icon: Cloud,
    accent: "#60a5fa",
    defaultX: 1480,
    defaultY: 620,
    width: 320,
    elements: [{ key: "temps" }, { key: "wind" }, { key: "rain" }],
  },
  {
    id: "flags",
    icon: Flag,
    accent: "#84cc16",
    defaultX: 760,
    defaultY: 160,
    width: 280,
    elements: [{ key: "sectors" }],
  },
  {
    id: "trackmap",
    icon: MapIcon,
    accent: "#2dd4bf",
    defaultX: 1420,
    defaultY: 760,
    width: 360,
    elements: [{ key: "classColors" }, { key: "playerHighlight" }],
  },
  {
    id: "dashboard",
    icon: LayoutGrid,
    accent: "#f97316",
    defaultX: 520,
    defaultY: 600,
    width: 340,
    elements: [
      { key: "position" },
      { key: "laps" },
      { key: "lastLap" },
      { key: "bestLap" },
      { key: "fuel" },
    ],
  },
  {
    id: "rival",
    icon: Swords,
    accent: "#ef4444",
    defaultX: 700,
    defaultY: 260,
    width: 380,
    elements: [{ key: "ahead" }, { key: "behind" }, { key: "lastLap" }],
  },
  {
    id: "session",
    icon: Clock,
    accent: "#0ea5e9",
    defaultX: 1120,
    defaultY: 40,
    width: 320,
    elements: [{ key: "type" }, { key: "timeLeft" }, { key: "lapsLeft" }],
  },
  {
    id: "endurance",
    icon: Timer,
    accent: "#14b8a6",
    defaultX: 1480,
    defaultY: 840,
    width: 320,
    elements: [{ key: "stint" }, { key: "lapTimes" }, { key: "position" }],
  },
  {
    id: "damage",
    icon: AlertTriangle,
    accent: "#dc2626",
    defaultX: 1120,
    defaultY: 600,
    width: 320,
    elements: [
      { key: "bodywork" },
      { key: "impact" },
      { key: "tyreWear" },
      { key: "punctures" },
      { key: "engine" },
    ],
  },
  {
    id: "speed",
    icon: TrendingUp,
    accent: "#22c55e",
    defaultX: 520,
    defaultY: 840,
    width: 320,
    elements: [{ key: "topSpeed" }, { key: "minSpeed" }, { key: "current" }],
  },
  {
    id: "liftcoast",
    icon: Activity,
    accent: "#eab308",
    defaultX: 860,
    defaultY: 840,
    width: 340,
    elements: [{ key: "ledBar" }, { key: "tc" }, { key: "abs" }],
  },
];

export const OVERLAY_BY_ID: Record<OverlayId, OverlayDef> = Object.fromEntries(
  OVERLAY_DEFS.map((d) => [d.id, d]),
) as Record<OverlayId, OverlayDef>;
