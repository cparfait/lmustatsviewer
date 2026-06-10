/**
 * Cadre d'un overlay : positionnement absolu (x/y), échelle, opacité.
 *
 * En mode Édition : affiche le chrome (barre « OVERLAY − 1.0x + ⚙ » + liseré
 * d'accent) et devient déplaçable au pointeur. Hors édition : chrome masqué et
 * `pointer-events:none` (la fenêtre est de toute façon click-through).
 */

import { useEffect, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { Minus, Plus, Settings2 } from "lucide-react";
import { useOverlaysStore, type OverlaySettings } from "@/stores/overlays";
import { OVERLAY_BY_ID, type OverlayId } from "@/lib/overlays";

interface Props {
  id: OverlayId;
  settings: OverlaySettings;
  editMode: boolean;
  /** Opacité générale (0→1), multipliée à l'opacité propre de l'overlay. */
  globalOpacity: number;
  children: React.ReactNode;
}

export function OverlayFrame({
  id,
  settings,
  editMode,
  globalOpacity,
  children,
}: Props) {
  const def = OVERLAY_BY_ID[id];
  const updateSettings = useOverlaysStore((s) => s.updateSettings);
  const flush = useOverlaysStore((s) => s.flush);

  // Position locale pendant le drag (commit au pointerup → évite de spammer le store).
  const [pos, setPos] = useState({ x: settings.x, y: settings.y });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  // Resynchronise quand la position vient d'ailleurs (config distante) et pas en drag.
  useEffect(() => {
    if (!dragRef.current) setPos({ x: settings.x, y: settings.y });
  }, [settings.x, settings.y]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editMode) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({
      x: Math.max(0, d.originX + (e.clientX - d.startX)),
      y: Math.max(0, d.originY + (e.clientY - d.startY)),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
    updateSettings(id, { x: pos.x, y: pos.y });
    // Persiste + diffuse tout de suite (pas en différé) → la page principale reçoit
    // la nouvelle position avant un éventuel « Mettre à jour ».
    flush().catch(() => {});
  };

  const setScale = (delta: number) => {
    const next = Math.min(2, Math.max(0.5, +(settings.scale + delta).toFixed(2)));
    updateSettings(id, { scale: next });
  };

  return (
    <div
      className="absolute"
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${settings.scale})`,
        transformOrigin: "top left",
        opacity: settings.opacity * globalOpacity,
        pointerEvents: editMode ? "auto" : "none",
      }}
    >
      {editMode && (
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="flex items-center gap-1 mb-1 cursor-move select-none rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur"
          style={{
            background: "rgba(10,12,16,0.85)",
            border: `1px solid ${def.accent}`,
            color: def.accent,
            boxShadow: `0 0 10px ${def.accent}55`,
          }}
        >
          <span className="mr-1">{id}</span>
          <button
            type="button"
            className="grid h-5 w-5 place-items-center rounded hover:bg-white/10"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setScale(-0.1)}
            aria-label="Réduire"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="w-9 text-center tabular-nums text-white/80">
            {settings.scale.toFixed(1)}x
          </span>
          <button
            type="button"
            className="grid h-5 w-5 place-items-center rounded hover:bg-white/10"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setScale(0.1)}
            aria-label="Agrandir"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="ml-1 grid h-5 w-5 place-items-center rounded hover:bg-white/10"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => emit("overlay-open-config", id)}
            aria-label="Configurer"
          >
            <Settings2 className="h-3 w-3" />
          </button>
        </div>
      )}
      <div
        style={{
          outline: editMode ? `1px dashed ${def.accent}88` : "none",
          outlineOffset: 2,
          borderRadius: 12,
        }}
      >
        {children}
      </div>
    </div>
  );
}
