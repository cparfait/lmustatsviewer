/**
 * Reconstruction de la **surface de piste** (les deux bords) à partir de la
 * télémétrie LMU/rFactor2.
 *
 * Les fichiers de piste du jeu (`.mas`) sont chiffrés → la géométrie n'en est
 * pas extractible. En revanche la télémétrie expose deux canaux suffisants :
 *
 * - `Path Lateral`  = position latérale de la voiture p/r à l'**axe central**
 *   de la piste (mètres, signé).
 * - `Track Edge`    = demi‑largeur de piste au point courant (mètres ; on prend
 *   sa valeur absolue).
 *
 * Méthode reprise de **LMU Telemetry Lab** (`processGeometry`) : on part de la
 * trajectoire GPS d'un seul tour (le plus rapide), et pour chaque point on
 * décale le long de la normale pour obtenir les deux bords :
 *
 *   bord gauche = voiture + normale·(W + L)
 *   bord droit  = voiture + normale·(L − W)
 *
 * où `W = |Track Edge|` et `L = Path Lateral`. La voiture (offset 0) est donc
 * toujours entre les bords tant que `|L| ≤ W`. Normales et largeurs sont lissées
 * pour un ruban propre. Les bords sont renvoyés en lat/lon pour être projetés
 * par `TrackMap` dans le même repère que la trajectoire.
 */

/** Mètres par degré de latitude (projection équirectangulaire locale). */
const M_PER_DEG = 111_320;

export interface TrackSurface {
  /** Bord « gauche », en lat/lon. */
  leftLat: number[];
  leftLon: number[];
  /** Bord « droit », en lat/lon. */
  rightLat: number[];
  rightLon: number[];
}

/**
 * Reconstruit les deux bords de piste depuis **un seul tour** (idéalement le
 * plus rapide). Renvoie `null` si les données sont insuffisantes (canaux
 * absents) → l'appelant retombe alors sur le rendu normal.
 *
 * @param lat/lon       Trace GPS du tour (degrés).
 * @param pathLateral   Canal `Path Lateral` aligné par index (m, signé).
 * @param trackEdge     Canal `Track Edge` aligné par index (m).
 * @param inPits        Canal `In Pits` (optionnel) — coupe le ruban aux stands.
 */
export function reconstructTrackSurface(
  lat: number[],
  lon: number[],
  pathLateral: number[],
  trackEdge: number[],
  inPits?: number[],
): TrackSurface | null {
  const n = Math.min(
    lat.length,
    lon.length,
    pathLateral.length,
    trackEdge.length,
  );
  if (n < 20) return null;

  const lat0 = lat[0];
  const lon0 = lon[0];
  const cosLat = Math.cos((lat0 * Math.PI) / 180);

  // Points projetés en mètres (ENU local) + index source conservé.
  type Pt = { x: number; y: number };
  const pts: Pt[] = [];
  const origIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    const la = lat[i];
    const lo = lon[i];
    if (la === 0 || lo === 0 || !Number.isFinite(la) || !Number.isFinite(lo)) {
      continue;
    }
    pts.push({ x: (lo - lon0) * cosLat * M_PER_DEG, y: (la - lat0) * M_PER_DEG });
    origIdx.push(i);
  }
  if (pts.length < 3) return null;
  const m = pts.length;

  // Normales brutes (perpendiculaire à la tangente, voisins).
  const rawNx = new Float64Array(m);
  const rawNy = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let dx: number, dy: number;
    if (i === 0) {
      dx = pts[1].x - pts[0].x;
      dy = pts[1].y - pts[0].y;
    } else if (i === m - 1) {
      dx = pts[i].x - pts[i - 1].x;
      dy = pts[i].y - pts[i - 1].y;
    } else {
      dx = pts[i + 1].x - pts[i - 1].x;
      dy = pts[i + 1].y - pts[i - 1].y;
    }
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) {
      rawNx[i] = 0;
      rawNy[i] = 1;
    } else {
      rawNx[i] = -dy / d;
      rawNy[i] = dx / d;
    }
  }

  const edgeWin = 2; // demi‑fenêtre de moyenne (largeur / latéral)
  // Demi‑largeur brute = moyenne des |Track Edge| voisins (défaut 7,5 m).
  const rawW = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const idx = origIdx[i];
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, idx - edgeWin); j <= Math.min(trackEdge.length - 1, idx + edgeWin); j++) {
      const w = Math.abs(trackEdge[j] || 0);
      if (w > 1) {
        s += w;
        c++;
      }
    }
    rawW[i] = c > 0 ? s / c : 7.5;
  }
  // Lissage de la largeur (fenêtre 25) → bords sans à‑coups.
  const W = new Float64Array(m);
  const wWin = 25;
  for (let i = 0; i < m; i++) {
    let s = 0;
    let c = 0;
    for (let j = i - wWin; j <= i + wWin; j++) {
      if (j >= 0 && j < m) {
        s += rawW[j];
        c++;
      }
    }
    W[i] = s / (c || 1);
  }

  const normWin = 8;
  const leftLat: number[] = [];
  const leftLon: number[] = [];
  const rightLat: number[] = [];
  const rightLon: number[] = [];
  const toLat = (y: number) => lat0 + y / M_PER_DEG;
  const toLon = (x: number) => lon0 + x / (M_PER_DEG * cosLat);
  let lastLat = 0;
  for (let i = 0; i < m; i++) {
    // Normale lissée (fenêtre 8).
    let snx = 0;
    let sny = 0;
    for (let w = -normWin; w <= normWin; w++) {
      const ni = i + w;
      if (ni >= 0 && ni < m) {
        snx += rawNx[ni];
        sny += rawNy[ni];
      }
    }
    const nMag = Math.hypot(snx, sny) || 1;
    const nx = snx / nMag;
    const ny = sny / nMag;

    // Latéral lissé (fenêtre voisine).
    const idx = origIdx[i];
    let sl = 0;
    let cl = 0;
    for (let j = Math.max(0, idx - edgeWin); j <= Math.min(pathLateral.length - 1, idx + edgeWin); j++) {
      const l = pathLateral[j];
      if (Number.isFinite(l)) {
        sl += l;
        cl++;
      }
    }
    const curLat = cl > 0 ? sl / cl : lastLat;
    lastLat = curLat;
    const curW = W[i];

    // Coupe aux stands / excursions aberrantes (on duplique le point précédent
    // pour ne pas tracer un bord vers le stand).
    const inPit = inPits && inPits[idx] != null && inPits[idx] > 0.5;
    if ((inPit || Math.abs(curLat) > curW * 2.5) && leftLat.length > 0) {
      leftLat.push(leftLat[leftLat.length - 1]);
      leftLon.push(leftLon[leftLon.length - 1]);
      rightLat.push(rightLat[rightLat.length - 1]);
      rightLon.push(rightLon[rightLon.length - 1]);
      continue;
    }

    const p = pts[i];
    const lOff = curW + curLat; // bord gauche
    const rOff = curLat - curW; // bord droit
    leftLat.push(toLat(p.y + ny * lOff));
    leftLon.push(toLon(p.x + nx * lOff));
    rightLat.push(toLat(p.y + ny * rOff));
    rightLon.push(toLon(p.x + nx * rOff));
  }

  return { leftLat, leftLon, rightLat, rightLon };
}
