import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import type { TrackSurface } from "@/lib/telemetry/trackSurface";

interface Track3DProps {
  lat: number[];
  lon: number[];
  /** Altitude reconstruite (m), même longueur. */
  elevation: number[];
  throttle: number[];
  brake: number[];
  /** Index de la voiture (mode lecteur). */
  carIndex: number;
  /** Bords de piste reconstruits (vraie largeur) → ruban de piste 3D. */
  trackSurface?: TrackSurface;
  /** Exagération verticale du relief. */
  zScale?: number;
  height?: number;
  theme: "dark" | "light";
}

const COL_THROTTLE: [number, number, number] = [0.13, 0.77, 0.37];
const COL_BRAKE: [number, number, number] = [0.94, 0.27, 0.27];
const COL_COAST: [number, number, number] = [0.58, 0.64, 0.72];

/**
 * Carte 3D du circuit (Three.js / react-three-fiber), inspirée de LMU Telemetry
 * Lab. Le relief vient de `elevation` (reconstruit, cf. `lib/elevation.ts`) car
 * les fichiers LMU n'ont pas de canal d'altitude. Tracé coloré accélérateur /
 * frein / roue libre, voiture animée, caméra orbitale.
 */
export function Track3D({
  lat,
  lon,
  elevation,
  throttle,
  brake,
  carIndex,
  trackSurface,
  zScale = 4,
  height = 300,
  theme,
}: Track3DProps) {
  // Projection locale (mètres) centrée + couleurs par point. Mémoïsé → la
  // géométrie n'est pas reconstruite à chaque frame de lecture.
  const { points, colors, size, carPoints, proj } = useMemo(() => {
    const n = Math.min(lat.length, lon.length, elevation.length);
    if (n < 2) {
      return { points: [] as [number, number, number][], colors: [] as [number, number, number][], size: 100, carPoints: [] as [number, number, number][], proj: null as null | { latC: number; lonC: number; lonScale: number; DEG: number } };
    }
    let latC = 0;
    let lonC = 0;
    for (let i = 0; i < n; i++) {
      latC += lat[i];
      lonC += lon[i];
    }
    latC /= n;
    lonC /= n;
    const lonScale = Math.cos((latC * Math.PI) / 180);
    const DEG = 111320;
    const pts: [number, number, number][] = new Array(n);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = (lon[i] - lonC) * lonScale * DEG;
      const z = -(lat[i] - latC) * DEG;
      const y = (elevation[i] ?? 0) * zScale;
      pts[i] = [x, y, z];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const cols: [number, number, number][] = new Array(n);
    for (let i = 0; i < n; i++) {
      const br = brake[i] ?? 0;
      const th = throttle[i] ?? 0;
      cols[i] = br > 5 ? COL_BRAKE : th > 5 ? COL_THROTTLE : COL_COAST;
    }
    const sz = Math.max(maxX - minX, maxZ - minZ) || 100;
    return { points: pts, colors: cols, size: sz, carPoints: pts, proj: { latC, lonC, lonScale, DEG } };
  }, [lat, lon, elevation, throttle, brake, zScale]);

  // Ruban de piste 3D : maillage entre bord gauche et bord droit. L'altitude de
  // chaque sommet est reprise du point de la trajectoire le plus proche (la piste
  // est ~plane latéralement → bonne approximation, dévers ignoré).
  const roadGeom = useMemo(() => {
    if (!trackSurface || !proj || points.length < 2) return null;
    const { latC, lonC, lonScale, DEG } = proj;
    const m = Math.min(trackSurface.leftLat.length, trackSurface.rightLat.length);
    if (m < 3) return null;

    // Altitude par plus proche voisin (échantillonnage de la trajectoire).
    const rn = points.length;
    const searchStep = Math.max(1, Math.floor(rn / 1200));
    const nearestY = (x: number, z: number): number => {
      let bestD = Infinity;
      let bestY = 0;
      for (let j = 0; j < rn; j += searchStep) {
        const dx = points[j][0] - x;
        const dz = points[j][2] - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          bestY = points[j][1];
        }
      }
      return bestY;
    };

    const drop = Math.max(0.5, size * 0.0015); // ruban juste sous la ligne
    const positions = new Float32Array(m * 2 * 3);
    const leftLine: [number, number, number][] = new Array(m);
    const rightLine: [number, number, number][] = new Array(m);
    for (let i = 0; i < m; i++) {
      const lx = (trackSurface.leftLon[i] - lonC) * lonScale * DEG;
      const lz = -(trackSurface.leftLat[i] - latC) * DEG;
      const rx = (trackSurface.rightLon[i] - lonC) * lonScale * DEG;
      const rz = -(trackSurface.rightLat[i] - latC) * DEG;
      const ly = nearestY(lx, lz) - drop;
      const ry = nearestY(rx, rz) - drop;
      positions[i * 6] = lx;
      positions[i * 6 + 1] = ly;
      positions[i * 6 + 2] = lz;
      positions[i * 6 + 3] = rx;
      positions[i * 6 + 4] = ry;
      positions[i * 6 + 5] = rz;
      // Liseré de bord légèrement au-dessus de la surface (z-fight évité).
      leftLine[i] = [lx, ly + drop * 0.5, lz];
      rightLine[i] = [rx, ry + drop * 0.5, rz];
    }
    // Ferme la boucle pour les liserés.
    leftLine.push(leftLine[0]);
    rightLine.push(rightLine[0]);
    // Deux triangles par segment (boucle fermée → dernier relié au premier).
    const idx: number[] = [];
    for (let i = 0; i < m; i++) {
      const a = (i * 2) % (m * 2); // L[i]
      const b = (i * 2 + 1) % (m * 2); // R[i]
      const c = ((i + 1) % m) * 2; // L[i+1]
      const dd = ((i + 1) % m) * 2 + 1; // R[i+1]
      idx.push(a, b, c, b, dd, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return { geometry: g, leftLine, rightLine };
  }, [trackSurface, proj, points, size]);

  // Libère l'ancien maillage quand il est remplacé (changement de fichier/tour).
  useEffect(() => () => roadGeom?.geometry.dispose(), [roadGeom]);

  const ci = Math.max(0, Math.min(carPoints.length - 1, Math.round(carIndex)));
  const carPos = carPoints[ci] ?? [0, 0, 0];
  // Cap (orientation) : direction de la trajectoire autour de l'axe vertical.
  // Calculé sur une **fenêtre** autour de la voiture (et élargie tant que l'écart
  // est trop faible) → évite le tremblement dû au bruit entre échantillons GPS
  // voisins (≈1 m à 4000 points/tour) et le cas voiture lente/arrêtée.
  let heading = 0;
  if (carPoints.length > 1) {
    const last = carPoints.length - 1;
    const minSep = Math.max(size * 0.01, 1e-3);
    let ai = ci;
    let bi = ci;
    for (let w = 4; w <= 60; w += 4) {
      ai = Math.max(0, ci - w);
      bi = Math.min(last, ci + w);
      const dx = carPoints[bi][0] - carPoints[ai][0];
      const dz = carPoints[bi][2] - carPoints[ai][2];
      if (Math.hypot(dx, dz) >= minSep || (ai === 0 && bi === last)) break;
    }
    const a = carPoints[ai];
    const b = carPoints[bi];
    heading = Math.atan2(b[0] - a[0], b[2] - a[2]);
  }
  const cam = size * 0.85;
  const arrowScale = size * 0.0016; // forme ~23 unités → flèche visible mais discrète
  const outlineColor = theme === "dark" ? "#ffffff" : "#0A0E1A";
  // Mêmes couleurs que la carte 2D (`TrackMap`) pour un rendu cohérent.
  const roadColor = theme === "dark" ? "#334155" : "#d4dbe5";
  const roadEdgeColor = theme === "dark" ? "#1e293b" : "#94a3b8";

  // Flèche-chevron (style LMU Telemetry Lab), pointe vers +Y dans l'espace forme.
  const arrowShape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 5.75); // pointe
    s.lineTo(8, -17.25);
    s.lineTo(0, -12.25); // creux arrière
    s.lineTo(-8, -17.25);
    s.lineTo(0, 5.75);
    return s;
  }, []);
  const extrudeSettings = useMemo(() => ({ depth: 5, bevelEnabled: false }), []);

  if (points.length < 2) {
    return <div className="py-12 text-center text-sm text-muted-foreground">GPS —</div>;
  }

  return (
    <div style={{ height }} className="w-full">
      {/* Canvas transparent → hérite du fond (thématisé) de la carte, comme la 2D.
          Évite le fond figé qui ne suivait pas le thème. */}
      <Canvas
        camera={{ position: [0, cam * 0.7, cam], fov: 50, near: 1, far: size * 10 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[1, 2, 1]} intensity={0.6} />
        {/* Ruban de piste reconstruit (vraie largeur), sous la trajectoire.
            Couleur plate identique à la carte 2D (`meshBasicMaterial`, non
            éclairé) + liserés de bord, pour un rendu cohérent et lisible. */}
        {roadGeom && (
          <>
            <mesh geometry={roadGeom.geometry}>
              <meshBasicMaterial color={roadColor} side={THREE.DoubleSide} />
            </mesh>
            <Line points={roadGeom.leftLine} color={roadEdgeColor} lineWidth={1.5} />
            <Line points={roadGeom.rightLine} color={roadEdgeColor} lineWidth={1.5} />
          </>
        )}
        <Line points={points} vertexColors={colors} lineWidth={3} />
        {/* Flèche de position, à plat, pointant le sens de marche (style Lab).
            Contour contrasté (flèche un peu plus grande, dessous) + remplissage or. */}
        <group
          position={[carPos[0], carPos[1] + size * 0.01, carPos[2]]}
          rotation={[0, heading, 0]}
          scale={arrowScale}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} scale={1.35}>
            <extrudeGeometry args={[arrowShape, extrudeSettings]} />
            <meshBasicMaterial color={outlineColor} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <extrudeGeometry args={[arrowShape, extrudeSettings]} />
            <meshBasicMaterial color="#FFB400" />
          </mesh>
        </group>
        <OrbitControls enableDamping target={[0, 0, 0]} maxDistance={size * 3} minDistance={size * 0.15} />
      </Canvas>
    </div>
  );
}
