import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface TrackMapProps {
  /** Latitudes GPS (degrés), même longueur que `lon`. */
  lat: number[];
  /** Longitudes GPS (degrés). */
  lon: number[];
  /** Accélérateur 0–100 % (aligné par index). */
  throttle: number[];
  /** Frein 0–100 % (aligné par index). */
  brake: number[];
  /** Latitudes GPS du tour de référence (comparaison) — superposées dans le même repère. */
  refLat?: number[];
  /** Longitudes GPS du tour de référence. */
  refLon?: number[];
  /**
   * Bords de piste reconstruits (vraie largeur, via `Path Lateral`/`Track Edge`).
   * Dessine un **ruban de piste plein** sous la ligne du tour courant. Prioritaire
   * sur `roadLaps`.
   */
  trackSurface?: {
    leftLat: number[];
    leftLon: number[];
    rightLat: number[];
    rightLon: number[];
  };
  /** Index de la position courante (mode lecteur) ; -1 = aucun marqueur. */
  markerIndex?: number;
  /** Index de points statiques à marquer (ex. points de freinage). */
  markers?: number[];
  /** Numéros de virages à étiqueter (placés à l'apex, décalés vers l'extérieur). */
  corners?: { index: number; label: string; focus?: boolean }[];
  /** Caméra qui suit la voiture (zoom + recentrage sur `markerIndex`). */
  follow?: boolean;
  /** Tracé monochrome (pour la mini-carte d'aperçu). */
  plain?: boolean;
  /** Survol de la carte → index du point le plus proche (`null` à la sortie). */
  onHoverPoint?: (idx: number | null) => void;
  height?: number;
  theme: "dark" | "light";
}

const COLOR_THROTTLE = "#22c55e";
const COLOR_BRAKE = "#ef4444";
const COLOR_COAST = "#94a3b8";
/** Trajectoire de référence (comparaison) — violet, contrasté avec accel/frein/coast. */
const COLOR_REF = "#a855f7";

/** Côté du repère interne (unités de la `viewBox`) ; le plus grand côté du circuit. */
const VIEW = 1000;

type Pt = { x: number; y: number };
/** Fenêtre de vue SVG (zoom/pan manuel). */
type VB = { x: number; y: number; w: number; h: number };

/** Arrondi compact pour limiter la taille des chaînes `d`. */
const f = (v: number) => Math.round(v * 10) / 10;

/**
 * Lissage Catmull‑Rom uniforme converti en courbes de Bézier cubiques.
 * Donne un tracé continu et sans cassure (rendu « haute fidélité ») à partir
 * de points bruts. Les courbes douces des outils pro viennent de ce rendu
 * vectoriel, pas de données supplémentaires.
 */
function smoothPath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${f(pts[0].x)},${f(pts[0].y)}`;
  if (n === 2)
    return `M${f(pts[0].x)},${f(pts[0].y)} L${f(pts[1].x)},${f(pts[1].y)}`;
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < n ? i + 2 : n - 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

/**
 * Carte 2D du circuit en **SVG vectoriel** (nette à tout zoom, exportable),
 * tracée depuis les coordonnées GPS. Rendu façon LMU Trace / TinyPedal :
 *
 * - **Ruban à deux passes** : un tracé épais (bordure) puis le tracé coloré
 *   par‑dessus → effet « vraie piste ».
 * - **Coloration** par accélérateur / frein / roue libre (heatmap) en mode
 *   normal ; monochrome en mode `plain` (mini‑carte).
 * - **Lissage** Catmull‑Rom → Bézier cubique.
 * - **Repère départ/arrivée** perpendiculaire au tracé.
 *
 * Projection équirectangulaire locale (le circuit est petit → distorsion
 * négligeable) : x = (lon − lon0)·cos(lat0), y = (lat − lat0), axe Y inversé
 * (nord en haut), mise à l'échelle en conservant le ratio d'aspect.
 *
 * Le SVG gère lui‑même le redimensionnement (pas de `ResizeObserver`). La
 * géométrie lourde (projection, chemins lissés) est mémoïsée : seuls la
 * `viewBox` (suivi) et le marqueur de position bougent à 60 fps.
 */
export function TrackMap({
  lat,
  lon,
  throttle,
  brake,
  refLat,
  refLon,
  trackSurface,
  markerIndex = -1,
  markers,
  corners,
  follow = false,
  plain = false,
  onHoverPoint,
  height = 340,
  theme,
}: TrackMapProps) {
  // ── Projection + mise à l'échelle dans le repère interne (mémoïsé) ──
  const geom = useMemo(() => {
    const n = Math.min(lat.length, lon.length);
    if (n < 2) return null;

    const lat0 = lat[0];
    const lon0 = lon[0];
    const cosLat = Math.cos((lat0 * Math.PI) / 180);
    const rx = new Array<number>(n);
    const ry = new Array<number>(n);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = (lon[i] - lon0) * cosLat;
      const y = lat[i] - lat0;
      rx[i] = x;
      ry[i] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const spanX = maxX - minX || 1e-9;
    const spanY = maxY - minY || 1e-9;
    const pad = plain ? 20 : 44;
    const scale = (VIEW - 2 * pad) / Math.max(spanX, spanY);
    const boxW = spanX * scale + 2 * pad;
    const boxH = spanY * scale + 2 * pad;

    const pts: Pt[] = new Array(n);
    let sumX = 0,
      sumY = 0;
    for (let i = 0; i < n; i++) {
      const x = pad + (rx[i] - minX) * scale;
      const y = boxH - pad - (ry[i] - minY) * scale; // Y inversé (nord en haut)
      pts[i] = { x, y };
      sumX += x;
      sumY += y;
    }
    // Paramètres de projection conservés → une 2ᵉ trajectoire (référence) est
    // projetée dans le MÊME repère absolu et se superpose exactement.
    const proj = { lat0, lon0, cosLat, minX, minY, scale, pad };
    return { pts, boxW, boxH, proj, centroid: { x: sumX / n, y: sumY / n } };
  }, [lat, lon, plain]);

  // Projette une trace GPS (lat/lon) dans le repère de `geom` (même origine /
  // échelle que le tour courant → superposition exacte) puis renvoie un chemin
  // lissé. Réutilisé pour la référence et pour la surface de piste.
  const projectLine = useCallback(
    (la: number[], lo: number[], maxNodes: number): string => {
      if (!geom) return "";
      const n = Math.min(la.length, lo.length);
      if (n < 2) return "";
      const { proj, boxH } = geom;
      const pts: Pt[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const rx = (lo[i] - proj.lon0) * proj.cosLat;
        const ry = la[i] - proj.lat0;
        pts[i] = {
          x: proj.pad + (rx - proj.minX) * proj.scale,
          y: boxH - proj.pad - (ry - proj.minY) * proj.scale,
        };
      }
      const step = Math.max(1, Math.ceil(n / maxNodes));
      const idx: number[] = [];
      for (let i = 0; i < n; i += step) idx.push(i);
      if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
      return smoothPath(idx.map((i) => pts[i]));
    },
    [geom],
  );

  // ── Trajectoire de référence (comparaison), même projection (mémoïsé) ──
  const refPath = useMemo(
    () =>
      !geom || plain || !refLat || !refLon
        ? null
        : projectLine(refLat, refLon, 520) || null,
    [geom, refLat, refLon, plain, projectLine],
  );

  // Projette une trace GPS en points bruts (sans lissage) dans le repère `geom`.
  const projectPts = useCallback(
    (la: number[], lo: number[]): Pt[] => {
      if (!geom) return [];
      const n = Math.min(la.length, lo.length);
      const { proj, boxH } = geom;
      const pts: Pt[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const rx = (lo[i] - proj.lon0) * proj.cosLat;
        const ry = la[i] - proj.lat0;
        pts[i] = {
          x: proj.pad + (rx - proj.minX) * proj.scale,
          y: boxH - proj.pad - (ry - proj.minY) * proj.scale,
        };
      }
      return pts;
    },
    [geom],
  );

  // ── Ruban de piste plein (vraie largeur) : polygone bord gauche → bord droit ──
  // Renvoie aussi `lineW` = épaisseur de ligne adaptée à l'échelle (≈ une largeur
  // de voiture), pour que la trajectoire ne paraisse pas démesurée sur la piste.
  const surfacePath = useMemo(() => {
    if (!geom || plain || !trackSurface) return null;
    const L = projectPts(trackSurface.leftLat, trackSurface.leftLon);
    const R = projectPts(trackSurface.rightLat, trackSurface.rightLon);
    const len = Math.min(L.length, R.length);
    if (len < 3) return null;
    let d = `M${f(L[0].x)},${f(L[0].y)}`;
    for (let i = 1; i < L.length; i++) d += ` L${f(L[i].x)},${f(L[i].y)}`;
    for (let i = R.length - 1; i >= 0; i--) d += ` L${f(R[i].x)},${f(R[i].y)}`;
    d += "Z";
    // Largeur de piste projetée (médiane) → ligne ≈ 30 % de la largeur.
    const widths: number[] = [];
    for (let i = 0; i < len; i += Math.max(1, Math.floor(len / 60))) {
      widths.push(Math.hypot(L[i].x - R[i].x, L[i].y - R[i].y));
    }
    widths.sort((a, b) => a - b);
    const medW = widths[widths.length >> 1] || 0;
    // Ligne ≈ 20 % de la largeur de piste (fine → on lit bien la corde dans les
    // virages). Plancher bas pour rester fine sur les grands circuits ; plafond
    // = largeur de ligne par défaut hors mode `plain` (cf. `surfaceW`).
    const lineW = Math.max(0.8, Math.min(9, medW * 0.2));
    return { d, lineW };
  }, [geom, trackSurface, plain, projectPts]);

  // ── Chemins lissés : ruban + segments colorés (mémoïsé) ──
  const paths = useMemo(() => {
    if (!geom) return null;
    const { pts } = geom;
    const n = pts.length;

    // Sous‑échantillonnage (façon `skip_node` TinyPedal) → tracé propre + chaîne `d` raisonnable.
    const maxNodes = plain ? 240 : 520;
    const step = Math.max(1, Math.ceil(n / maxNodes));
    const idx: number[] = [];
    for (let i = 0; i < n; i += step) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);

    const border = smoothPath(idx.map((i) => pts[i]));
    if (plain) return { border, colored: null };

    // Découpage en segments par état (frein / accél. / roue libre), nœuds de frontière partagés.
    const stateOf = (i: number) =>
      (brake[i] ?? 0) > 5
        ? COLOR_BRAKE
        : (throttle[i] ?? 0) > 5
          ? COLOR_THROTTLE
          : COLOR_COAST;

    const runs: { color: string; pts: Pt[] }[] = [];
    let cur: { color: string; pts: Pt[] } | null = null;
    for (const i of idx) {
      const c = stateOf(i);
      if (!cur || cur.color !== c) {
        if (cur) cur.pts.push(pts[i]); // ferme le segment précédent au point de transition
        cur = { color: c, pts: [pts[i]] };
        runs.push(cur);
      } else {
        cur.pts.push(pts[i]);
      }
    }
    const colored = runs.map((r) => ({ color: r.color, d: smoothPath(r.pts) }));
    return { border, colored };
  }, [geom, throttle, brake, plain]);

  // ── Zoom / pan manuel (molette + glisser) ──────────────────────────────────
  const [manualVB, setManualVB] = useState<VB | null>(null);
  // Facteur de zoom en mode suivi (ajustable à la molette).
  const [followZoom, setFollowZoom] = useState(3.5);
  // État du pan en cours (matrice inverse figée au début du glisser).
  const panRef = useRef<{ inv: DOMMatrix; vb: VB; sx: number; sy: number } | null>(
    null,
  );
  // Closure de molette rafraîchie à chaque rendu (capte manualVB/box courants).
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  // Nettoyage du listener wheel non‑passif (attaché via ref de callback).
  const wheelCleanup = useRef<(() => void) | null>(null);

  // Réinitialise le zoom quand le tracé change (nouveau fichier/tour).
  useEffect(() => {
    setManualVB(null);
  }, [lat, lon]);

  // Ref de callback : attache un listener `wheel` **non‑passif** (pour pouvoir
  // `preventDefault` → pas de scroll de page pendant le zoom). React attache
  // `onWheel` en passif, d'où ce contournement.
  const attachSvg = useCallback((node: SVGSVGElement | null) => {
    wheelCleanup.current?.();
    wheelCleanup.current = null;
    if (node) {
      const h = (e: WheelEvent) => wheelRef.current(e);
      node.addEventListener("wheel", h, { passive: false });
      wheelCleanup.current = () => node.removeEventListener("wheel", h);
    }
  }, []);

  if (!geom || !paths) {
    return <div className="w-full" style={{ height }} />;
  }

  const { pts, boxW, boxH, centroid } = geom;
  const hasMarker = markerIndex >= 0 && markerIndex < pts.length;

  // viewBox : suivi (auto) > zoom/pan manuel > plein circuit.
  const zoomable = !plain && !follow;
  let vb: VB = { x: 0, y: 0, w: boxW, h: boxH };
  if (follow && hasMarker) {
    const m = pts[markerIndex];
    const w = boxW / followZoom;
    const h = boxH / followZoom;
    // Centré sur la voiture, mais borné au tracé → au zoom min (1×) on revoit
    // tout le circuit et la caméra ne déborde jamais dans le vide.
    const x = Math.max(0, Math.min(m.x - w / 2, boxW - w));
    const y = Math.max(0, Math.min(m.y - h / 2, boxH - h));
    vb = { x, y, w, h };
  } else if (manualVB) {
    vb = manualVB;
  }
  const viewBox = `${f(vb.x)} ${f(vb.y)} ${f(vb.w)} ${f(vb.h)}`;

  const surfaceW = plain ? 5 : 9; // largeur du tracé coloré (unités viewBox)
  const outlineW = surfaceW + 6; // largeur de la bordure (ruban)
  const borderColor = theme === "dark" ? "#0b1120" : "#cbd5e1";
  const plainColor = theme === "dark" ? "#475569" : "#94a3b8";
  // Surface de piste reconstruite (route + liseré de bord).
  const roadFill = theme === "dark" ? "#334155" : "#d4dbe5";
  const roadEdge = theme === "dark" ? "#1e293b" : "#94a3b8";
  const startColor = theme === "dark" ? "#64748b" : "#94a3b8";
  const tickColor = theme === "dark" ? "#e2e8f0" : "#1e293b";
  const markerStroke = theme === "dark" ? "#0A0E1A" : "#ffffff";
  const badgeBg = theme === "dark" ? "#0f172a" : "#ffffff";
  const badgeBorder = theme === "dark" ? "#475569" : "#cbd5e1";
  const badgeText = theme === "dark" ? "#e2e8f0" : "#0f172a";

  // Repère départ/arrivée : segment perpendiculaire au tracé au point 0.
  let startTick: { x1: number; y1: number; x2: number; y2: number } | null =
    null;
  if (!plain) {
    const a = pts[0];
    const b = pts[Math.min(3, pts.length - 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len; // normale
    const ny = dx / len;
    const half = outlineW * 1.4;
    startTick = {
      x1: a.x + nx * half,
      y1: a.y + ny * half,
      x2: a.x - nx * half,
      y2: a.y - ny * half,
    };
  }

  // Numéros de virages : placés à l'apex, décalés vers l'extérieur du circuit.
  const cornerBadges =
    !plain && !follow && corners
      ? corners
          .filter((c) => c.index >= 0 && c.index < pts.length)
          .map((c) => {
            const p = pts[c.index];
            const a = pts[Math.max(0, c.index - 4)];
            const b = pts[Math.min(pts.length - 1, c.index + 4)];
            const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            let nx = -(b.y - a.y) / len;
            let ny = (b.x - a.x) / len;
            // Côté opposé au centroïde → l'étiquette sort du circuit.
            if ((p.x - centroid.x) * nx + (p.y - centroid.y) * ny < 0) {
              nx = -nx;
              ny = -ny;
            }
            const off = 30;
            return {
              label: c.label,
              focus: !!c.focus,
              x: p.x + nx * off,
              y: p.y + ny * off,
            };
          })
      : [];

  // Survol désactivé en mode suivi : sinon bouger la souris déplacerait l'index
  // affiché (et donc la caméra) au lieu de suivre la voiture en lecture.
  const hoverable = !plain && !follow && !!onHoverPoint;

  // Survol carte → point le plus proche (coords écran → unités viewBox via CTM).
  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onHoverPoint) return;
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < pts.length; k++) {
      const dx = pts[k].x - p.x;
      const dy = pts[k].y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    // Seuil : ignore les survols loin du tracé (zones vides).
    const thresh = outlineW * 3;
    onHoverPoint(best >= 0 && bestD <= thresh * thresh ? best : null);
  };

  // Zoom molette. Rafraîchi chaque rendu. Deux modes :
  //  - suivi : ajuste le facteur de zoom de la caméra (1.5×–12×) ;
  //  - libre : zoom ancré sous le curseur (max 12×).
  wheelRef.current = (e: WheelEvent) => {
    if (plain) return;
    if (follow) {
      e.preventDefault();
      const f2 = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setFollowZoom((z) => Math.min(12, Math.max(1, z * f2)));
      return;
    }
    if (!zoomable) return;
    e.preventDefault();
    const svg = e.currentTarget as SVGSVGElement | null;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const cur = manualVB ?? { x: 0, y: 0, w: boxW, h: boxH };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85;
    const nw = Math.min(boxW, Math.max(boxW / 12, cur.w * factor));
    const k = nw / cur.w;
    if (k === 1) return;
    if (nw >= boxW - 0.5) {
      setManualVB(null); // retour au plein cadre
      return;
    }
    setManualVB({
      x: p.x - (p.x - cur.x) * k,
      y: p.y - (p.y - cur.y) * k,
      w: nw,
      h: cur.h * k,
    });
  };

  // Pan (glisser) : matrice inverse figée au début → translation stable.
  const startPan = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!zoomable || e.button !== 0) return;
    const ctm = e.currentTarget.getScreenCTM();
    if (!ctm) return;
    const inv = ctm.inverse();
    const s = new DOMPoint(e.clientX, e.clientY).matrixTransform(inv);
    panRef.current = { inv, vb, sx: s.x, sy: s.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const movePan = (e: React.PointerEvent<SVGSVGElement>) => {
    const pan = panRef.current;
    if (pan) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(pan.inv);
      setManualVB({
        x: pan.vb.x - (p.x - pan.sx),
        y: pan.vb.y - (p.y - pan.sy),
        w: pan.vb.w,
        h: pan.vb.h,
      });
      return;
    }
    if (hoverable) handleMove(e);
  };
  const endPan = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      panRef.current = null;
    }
  };
  const onLeave = () => {
    if (hoverable) onHoverPoint?.(null);
  };
  const onDouble = () => {
    if (zoomable) setManualVB(null);
  };

  return (
    <div className="w-full">
      <svg
        ref={attachSvg}
        width="100%"
        height={height}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{
          display: "block",
          touchAction: zoomable ? "none" : undefined,
          cursor: zoomable ? "grab" : hoverable ? "crosshair" : undefined,
        }}
        role="img"
        aria-label="Carte du circuit"
        onPointerDown={zoomable ? startPan : undefined}
        onPointerMove={zoomable || hoverable ? movePan : undefined}
        onPointerUp={zoomable ? endPan : undefined}
        onPointerLeave={hoverable ? onLeave : undefined}
        onDoubleClick={zoomable ? onDouble : undefined}
      >
        {surfacePath ? (
          /* Vraie surface de piste reconstruite : ruban plein + liseré de bord,
             puis la ligne du tour courant colorée accél./frein par‑dessus. */
          <>
            <path
              d={surfacePath.d}
              fill={roadFill}
              stroke={roadEdge}
              strokeWidth={1.5}
              strokeLinejoin="round"
              fillRule="evenodd"
            />
            {paths.colored?.map((seg, i) => (
              <path
                key={i}
                d={seg.d}
                fill="none"
                stroke={seg.color}
                strokeWidth={surfacePath.lineW}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </>
        ) : (
          <>
            {/* Ruban : bordure (passe épaisse) */}
            <path
              d={paths.border}
              fill="none"
              stroke={borderColor}
              strokeWidth={plain ? surfaceW + 2 : outlineW}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {plain ? (
              /* Mini‑carte monochrome */
              <path
                d={paths.border}
                fill="none"
                stroke={plainColor}
                strokeWidth={surfaceW}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : (
              /* Surface colorée par accél./frein/roue libre (passe fine, par-dessus) */
              paths.colored?.map((seg, i) => (
                <path
                  key={i}
                  d={seg.d}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={surfaceW}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))
            )}
          </>
        )}

        {/* Trajectoire de référence (comparaison) : liseré sombre + violet pointillé,
            superposé au tracé principal pour révéler l'écart de ligne au zoom. */}
        {refPath && (
          <>
            <path
              d={refPath}
              fill="none"
              stroke={borderColor}
              strokeWidth={surfaceW * 0.7 + 3}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.6}
            />
            <path
              d={refPath}
              fill="none"
              stroke={COLOR_REF}
              strokeWidth={surfaceW * 0.7}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="6 5"
            />
          </>
        )}

        {/* Repère départ/arrivée */}
        {startTick && (
          <line
            x1={f(startTick.x1)}
            y1={f(startTick.y1)}
            x2={f(startTick.x2)}
            y2={f(startTick.y2)}
            stroke={tickColor}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        )}

        {/* Point de départ */}
        {!plain && (
          <circle cx={f(pts[0].x)} cy={f(pts[0].y)} r={4} fill={startColor} />
        )}

        {/* Marqueurs statiques (points de freinage), masqués en suivi */}
        {!plain &&
          !follow &&
          markers?.map((m) =>
            m >= 0 && m < pts.length ? (
              <circle
                key={m}
                cx={f(pts[m].x)}
                cy={f(pts[m].y)}
                r={5}
                fill={COLOR_BRAKE}
                stroke={markerStroke}
                strokeWidth={1.5}
              />
            ) : null,
          )}

        {/* Numéros de virages (focus zones #92 surlignées) */}
        {cornerBadges.map((cb, i) => (
          <g key={i}>
            <circle
              cx={f(cb.x)}
              cy={f(cb.y)}
              r={cb.focus ? 18 : 16}
              fill={cb.focus ? "#ef4444" : badgeBg}
              stroke={cb.focus ? "#fca5a5" : badgeBorder}
              strokeWidth={cb.focus ? 2 : 1.5}
            />
            <text
              x={f(cb.x)}
              y={f(cb.y)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={18}
              fontWeight={cb.focus ? 700 : 600}
              fill={cb.focus ? "#ffffff" : badgeText}
            >
              {cb.label}
            </text>
          </g>
        ))}

        {/* Marqueur de position (mode lecteur) : halo + point contrasté */}
        {hasMarker && (
          <g>
            <circle
              cx={f(pts[markerIndex].x)}
              cy={f(pts[markerIndex].y)}
              r={plain ? 11 : 20}
              fill="#FFB400"
              opacity={0.28}
            />
            <circle
              cx={f(pts[markerIndex].x)}
              cy={f(pts[markerIndex].y)}
              r={plain ? 6.5 : 11}
              fill="#FFB400"
              stroke={markerStroke}
              strokeWidth={plain ? 2 : 3.5}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
