/**
 * Petits sous-composants présentationnels de la page lecteur de télémétrie
 * (`TelemetryView`). Extraits pour alléger la route. Affichage pur, aucune
 * logique métier. (Les helpers de formatage sont dans `lib/telemetry/format.ts`.)
 */

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatTime } from "@/lib/utils";

/** Ligne du tableau LAP DETAILS : libellé · tour · réf · delta (coloré). */
export function LapRow({
  label,
  cur,
  ref,
  hasRef,
  bold,
}: {
  label: string;
  cur: number | null | undefined;
  ref?: number | null;
  hasRef: boolean;
  bold?: boolean;
}) {
  const fmt = (v: number | null | undefined) =>
    v != null && isFinite(v) && v > 0 ? formatTime(v) : "—";
  const delta =
    cur != null && ref != null && cur > 0 && ref > 0 ? cur - ref : null;
  return (
    <tr className={cn("tabular-nums", bold && "font-semibold")}>
      <td className="text-left text-muted-foreground">{label}</td>
      <td className="text-right font-mono">{fmt(cur)}</td>
      {hasRef && (
        <td className="text-right font-mono text-muted-foreground">{fmt(ref)}</td>
      )}
      {hasRef && (
        <td
          className={cn(
            "text-right font-mono",
            delta == null ? "" : delta < 0 ? "text-emerald-500" : "text-red-500"
          )}
        >
          {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(3)}`}
        </td>
      )}
    </tr>
  );
}

export function DashCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3">
        <span className="text-micro uppercase tracking-wide text-muted-foreground">{title}</span>
        <div className="mt-1.5 flex flex-col gap-0.5">{children}</div>
      </CardContent>
    </Card>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-micro uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}

export function Elec({ l, v }: { l: string; v: string | number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background/50 px-1.5 py-0.5 text-micro">
      <span className="text-muted-foreground">{l}</span>
      <span className="font-semibold tabular-nums">{v}</span>
    </span>
  );
}
