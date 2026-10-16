/**
 * Carte récap de saison (image 1080 × 1350, format portrait des réseaux).
 * Rien n'est calculé ici : on dessine les tuiles déjà préparées par la page.
 */

export interface WrappedTile {
  label: string;
  value: string;
  sub?: string;
}

export interface WrappedInput {
  title: string;
  subtitle: string;
  tiles: WrappedTile[];
  footer: string;
}

export const WRAPPED_W = 1080;
export const WRAPPED_H = 1350;

export function drawWrapped(canvas: HTMLCanvasElement, w: WrappedInput): void {
  canvas.width = WRAPPED_W;
  canvas.height = WRAPPED_H;
  const g = canvas.getContext("2d");
  if (!g) return;
  const bg = g.createLinearGradient(0, 0, WRAPPED_W, WRAPPED_H);
  bg.addColorStop(0, "#0b1020");
  bg.addColorStop(1, "#1d0f0a");
  g.fillStyle = bg;
  g.fillRect(0, 0, WRAPPED_W, WRAPPED_H);
  // Bande d'accent (couleur de l'app).
  g.fillStyle = "#ea580c";
  g.fillRect(0, 0, WRAPPED_W, 14);

  g.fillStyle = "#ffffff";
  g.font = "700 72px system-ui, sans-serif";
  g.fillText(w.title, 72, 150, WRAPPED_W - 144);
  g.fillStyle = "#cbd5e1";
  g.font = "400 36px system-ui, sans-serif";
  g.fillText(w.subtitle, 72, 210, WRAPPED_W - 144);

  const cols = 2;
  const gap = 28;
  const tileW = (WRAPPED_W - 144 - gap) / cols;
  const tileH = 230;
  w.tiles.slice(0, 8).forEach((t, i) => {
    const x = 72 + (i % cols) * (tileW + gap);
    const y = 280 + Math.floor(i / cols) * (tileH + gap);
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.beginPath();
    g.roundRect(x, y, tileW, tileH, 24);
    g.fill();
    g.fillStyle = "#94a3b8";
    g.font = "500 30px system-ui, sans-serif";
    g.fillText(t.label.toUpperCase(), x + 32, y + 56, tileW - 64);
    g.fillStyle = "#ffffff";
    g.font = "800 84px system-ui, sans-serif";
    g.fillText(t.value, x + 32, y + 150, tileW - 64);
    if (t.sub) {
      g.fillStyle = "#fb923c";
      g.font = "500 28px system-ui, sans-serif";
      g.fillText(t.sub, x + 32, y + 200, tileW - 64);
    }
  });

  g.fillStyle = "#64748b";
  g.font = "500 28px system-ui, sans-serif";
  g.fillText(w.footer, 72, WRAPPED_H - 60, WRAPPED_W - 144);
}

/** Octets PNG du canvas (pour l'enregistrement côté Rust). */
export async function canvasPng(canvas: HTMLCanvasElement): Promise<number[]> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("PNG");
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}
