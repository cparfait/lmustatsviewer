import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useAnchoredPanel } from "@/components/ui/use-anchored-panel";

/**
 * Sélecteur de couleur **rendu dans la page**, en remplacement de
 * `<input type="color">`.
 *
 * Pourquoi : le champ natif ouvre le sélecteur de couleurs de Windows, une
 * fenêtre système hors du webview — même famille de panne que la popup d'un
 * `<select>` natif (voir `select.tsx`). Ici tout est du DOM normal : carré
 * saturation/luminosité, barre de teinte, saisie hexadécimale et préréglages.
 *
 * Contrat identique au champ natif : `value`/`onChange` en `#rrggbb`.
 */

// ── Conversions ─────────────────────────────────────────────────────────────

/** `#abc` / `#aabbcc` → [r, g, b] (0-255) ; `null` si la chaîne est invalide. */
function hexToRgb(hex: string): [number, number, number] | null {
  const s = hex.trim().replace(/^#/, "");
  const full =
    s.length === 3 ? s.replace(/./g, (c) => c + c) : s.length === 6 ? s : null;
  if (!full || !/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const p = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`;
}

/** [r,g,b] 0-255 → [teinte 0-360, saturation 0-1, valeur 0-1]. */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255,
    gg = g / 255,
    bb = b / 255;
  const max = Math.max(rr, gg, bb),
    min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const i = Math.floor(h / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][i];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const hsvToHex = (h: number, s: number, v: number) => rgbToHex(...hsvToRgb(h, s, v));

/** Préréglages : identité de l'app + accents lisibles sur fond de jeu. */
const PRESETS = [
  "#D93B00", "#f97316", "#eab308", "#22c55e",
  "#00c896", "#4FA1FF", "#075AB8", "#a855f7",
  "#FF1D43", "#ffffff", "#94a3b8", "#0b101f",
];

// ── Suivi du pointeur sur une zone (carré S/V et barre de teinte) ───────────

function useDragArea(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const apply = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    onMove(clamp((clientX - r.left) / r.width), clamp((clientY - r.top) / r.height));
  };
  return {
    ref,
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      apply(e.clientX, e.clientY);
    },
    // `buttons & 1` : ne suit que pendant un glisser bouton enfoncé.
    onPointerMove: (e: React.PointerEvent) => {
      if (e.buttons & 1) apply(e.clientX, e.clientY);
    },
  };
}

// ── Composant ───────────────────────────────────────────────────────────────

export function ColorPicker({
  value,
  onChange,
  className,
  ariaLabel,
}: {
  /** Couleur au format `#rrggbb`. */
  value: string;
  onChange: (hex: string) => void;
  /** Classes du déclencheur (pastille). */
  className?: string;
  ariaLabel?: string;
}) {
  const { open, setOpen, triggerRef, panelRef, style } =
    useAnchoredPanel<HTMLButtonElement>();
  const [hsv, setHsv] = useState<[number, number, number]>(() => {
    const rgb = hexToRgb(value) ?? [0, 0, 0];
    return rgbToHsv(...rgb);
  });
  // Texte du champ hexa : libre pendant la frappe (« #1a2 » est incomplet mais
  // doit rester éditable), resynchronisé sur la valeur dès qu'elle change.
  const [hexDraft, setHexDraft] = useState(value);

  // Dernière couleur émise par ce composant : sert à distinguer « la valeur a
  // changé parce que je viens de la changer » d'un vrai changement extérieur.
  const emitted = useRef(value);

  // Resynchronise quand la valeur vient d'ailleurs (reset, changement de
  // widget). Se recalculer sur nos propres émissions ferait tressauter les
  // curseurs : l'aller-retour HSV → hexa → HSV n'est pas exact (arrondis).
  useEffect(() => {
    setHexDraft(value);
    if (value.toLowerCase() === emitted.current.toLowerCase()) return;
    const rgb = hexToRgb(value);
    if (!rgb) return;
    const [h, s, v] = rgbToHsv(...rgb);
    setHsv(([ph]) => [s === 0 || v === 0 ? ph : h, s, v]);
  }, [value]);

  const emit = (next: [number, number, number]) => {
    const hex = hsvToHex(...next);
    emitted.current = hex;
    setHsv(next);
    onChange(hex);
  };

  /**
   * Applique une couleur écrite en hexadécimal. Renvoie `false` si la chaîne
   * n'est pas une couleur valide (l'appelant décide quoi faire).
   * La teinte est conservée quand la couleur est grise ou noire : sans ça,
   * passer par du noir remettrait la teinte à 0 (rouge) et ferait sauter le
   * carré S/V sous le curseur.
   */
  const applyHex = (raw: string): boolean => {
    const rgb = hexToRgb(raw);
    if (!rgb) return false;
    const hex = rgbToHex(...rgb);
    const [h, s, v] = rgbToHsv(...rgb);
    emitted.current = hex;
    setHsv(([ph]) => [s === 0 || v === 0 ? ph : h, s, v]);
    onChange(hex);
    return true;
  };

  const sv = useDragArea((x, y) => emit([hsv[0], x, 1 - y]));
  const hue = useDragArea((x) => emit([x * 360, hsv[1], hsv[2]]));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen(!open)}
        className={cn(
          "h-8 w-14 cursor-pointer rounded-md border border-border p-0.5",
          "focus:outline-none focus:ring-1 focus:ring-ring",
          className,
        )}
      >
        <span
          className="block h-full w-full rounded-[3px]"
          style={{ background: value }}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            className="z-[80] w-[232px] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg"
          >
            {/* Saturation (X) × luminosité (Y), sur la teinte courante */}
            <div
              ref={sv.ref}
              onPointerDown={sv.onPointerDown}
              onPointerMove={sv.onPointerMove}
              className="relative h-32 w-full cursor-crosshair rounded-md"
              style={{
                background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv[0]} 100% 50%)`,
              }}
            >
              <span
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%` }}
              />
            </div>

            {/* Teinte */}
            <div
              ref={hue.ref}
              onPointerDown={hue.onPointerDown}
              onPointerMove={hue.onPointerMove}
              className="relative mt-3 h-3 w-full cursor-pointer rounded-full"
              style={{
                background:
                  "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
              }}
            >
              <span
                className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                style={{ left: `${(hsv[0] / 360) * 100}%`, background: `hsl(${hsv[0]} 100% 50%)` }}
              />
            </div>

            {/* Saisie hexadécimale */}
            <input
              value={hexDraft}
              onChange={(e) => {
                const raw = e.target.value;
                setHexDraft(raw);
                // Pendant la frappe on n'accepte QUE la forme complète
                // `#rrggbb` : la forme courte à 3 chiffres capturerait
                // « #22D3EE » dès « #22D » (= #2222DD), et la resynchro
                // ci-dessus réécrirait le champ sous les doigts.
                if (/^#?[0-9a-f]{6}$/i.test(raw.trim())) applyHex(raw);
              }}
              // La forme courte (« #abc ») n'est développée qu'à la sortie du
              // champ ; une saisie invalide y revient à la couleur courante.
              onBlur={() => {
                if (!applyHex(hexDraft)) setHexDraft(value);
              }}
              spellCheck={false}
              aria-label="Hex"
              className="mt-3 h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-xs uppercase focus:outline-none focus:ring-1 focus:ring-ring"
            />

            {/* Préréglages */}
            <div className="mt-2 grid grid-cols-6 gap-1.5">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => applyHex(c)}
                  aria-label={c}
                  className={cn(
                    "h-5 w-full rounded border border-border/60",
                    c.toLowerCase() === value.toLowerCase() && "ring-2 ring-ring",
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
