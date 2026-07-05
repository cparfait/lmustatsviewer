/**
 * Petits prédicats sur l'état de pilotage (partagés voix / callouts).
 */

/**
 * Le pilote est-il dans une **phase critique** — freinage appuyé ou fort braquage
 * (T13 #150) ? Sert à différer les annonces non-critiques pour ne pas distraire
 * dans une zone de freinage / un virage. `brake` en fraction [0,1], `steer` [-1,1].
 */
export function inCriticalZone(brake: number, steer: number): boolean {
  return brake > 0.5 || Math.abs(steer) > 0.4;
}
