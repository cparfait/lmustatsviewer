import type { LiveData } from "@/lib/api";
import type { Tr } from "@/i18n";

/** Props communes à tous les widgets d'overlay. */
export interface WidgetProps {
  data: LiveData;
  /** Éléments de contenu activés (clé → bool). */
  content: Record<string, boolean>;
  accent: string;
  t: Tr;
}
