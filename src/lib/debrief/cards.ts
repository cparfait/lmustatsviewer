/**
 * Familles de défaut du débrief calculé présentées en **cartes** (module pur) :
 * un niveau de confiance (selon la quantité de données qui fonde le constat), les
 * preuves chiffrées à relire, et le tour où aller voir. Ne crée aucun constat :
 * chaque carte reprend une famille déjà retenue par `computeDebrief`.
 */
import type { LapRow, SessionDetail } from "@/lib/api";
import { cleanLaps, playerEvents, type Debrief, type DefectFamily } from "./compute";

export type Confidence = "high" | "medium" | "low";

export interface Evidence {
  /** Clé i18n `cards.ev_<key>`. */
  key: string;
  params: Record<string, string | number>;
}

export interface DebriefCard {
  family: DefectFamily;
  confidence: Confidence;
  evidence: Evidence[];
  /** Tour (numéro des résultats) qui illustre le mieux le constat ; null si aucun. */
  focusLap: number | null;
}

/** Confiance d'un constat statistique selon le nombre de tours propres. */
export function confidenceFromLaps(n: number, high: number, medium: number): Confidence {
  return n >= high ? "high" : n >= medium ? "medium" : "low";
}

const t3 = (s: number) => s.toFixed(3);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const lapList = (s: Set<number>) =>
  [...s]
    .sort((a, b) => a - b)
    .slice(0, 6)
    .join(", ");
const firstOf = (s: Set<number>) => (s.size ? Math.min(...s) : null);

/** Cartes des familles retenues, dans l'ordre du débrief. */
export function debriefCards(detail: SessionDetail, d: Debrief): DebriefCard[] {
  const myLaps: LapRow[] = detail.laps.filter((l) => l.driver_name === d.driver).sort((a, b) => a.lap_num - b.lap_num);
  const clean = cleanLaps(myLaps);
  const ev = playerEvents(detail.stream ?? [], d.driver, myLaps);
  const out: DebriefCard[] = [];

  for (const f of d.families) {
    switch (f.family) {
      case "dnf": {
        const last = myLaps.length ? myLaps[myLaps.length - 1].lap_num : null;
        out.push({ family: "dnf", confidence: "high", evidence: [{ key: "laps", params: { n: d.laps } }], focusLap: last });
        break;
      }
      case "placesLost": {
        const worst = [...d.swings].sort((a, b) => a.delta - b.delta)[0];
        const evidence: Evidence[] = [{ key: "grid", params: { from: d.gridClassPos ?? "?", to: d.classPos ?? "?" } }];
        if (worst && worst.delta < 0) evidence.push({ key: "swing", params: { lap: worst.lap, from: worst.from, to: worst.to } });
        out.push({ family: "placesLost", confidence: "high", evidence, focusLap: worst && worst.delta < 0 ? worst.lap : null });
        break;
      }
      case "weakSector": {
        const n = Number(f.facts.sector) as 1 | 2 | 3;
        const key = `s${n}` as const;
        const xs = clean.filter((l) => l[key] != null && (l[key] as number) > 0);
        const vals = xs.map((l) => l[key] as number);
        const evidence: Evidence[] = [];
        let focus: number | null = null;
        if (vals.length) {
          evidence.push({ key: "sectorMedian", params: { n, median: t3(median(vals)), best: t3(Math.min(...vals)), laps: vals.length } });
          const worst = xs.reduce((a, b) => ((b[key] as number) > (a[key] as number) ? b : a));
          focus = worst.lap_num;
        }
        for (const s of d.sectorLosses) if (s.sector !== n) evidence.push({ key: "otherSector", params: { n: s.sector, loss: t3(s.lossS) } });
        out.push({ family: "weakSector", confidence: confidenceFromLaps(vals.length, 8, 5), evidence, focusLap: focus });
        break;
      }
      case "trackLimits":
        out.push({
          family: "trackLimits",
          confidence: "high",
          evidence: [{ key: "events", params: { n: ev.limits, laps: lapList(ev.limitLaps) || "?" } }],
          focusLap: firstOf(ev.limitLaps),
        });
        break;
      case "penalty":
        out.push({
          family: "penalty",
          confidence: "high",
          evidence: [{ key: "events", params: { n: ev.penalties, laps: lapList(ev.penaltyLaps) || "?" } }],
          focusLap: firstOf(ev.penaltyLaps),
        });
        break;
      case "contacts":
        out.push({
          family: "contacts",
          confidence: "high",
          evidence: [{ key: "events", params: { n: ev.contacts, laps: lapList(ev.contactLaps) || "?" } }],
          focusLap: firstOf(ev.contactLaps),
        });
        break;
      case "inconsistent": {
        const slowest = clean.length ? clean.reduce((a, b) => (b.lap_time > a.lap_time ? b : a)) : null;
        const evidence: Evidence[] = [
          { key: "within", params: { pct: Math.round((d.within05 ?? 0) * 100), laps: d.cleanLaps } },
        ];
        if (d.stdDev != null && d.medianLap != null) evidence.push({ key: "spread", params: { std: t3(d.stdDev), median: t3(d.medianLap) } });
        if (slowest) evidence.push({ key: "slowest", params: { lap: slowest.lap_num, gap: t3(slowest.lap_time - Math.min(...clean.map((l) => l.lap_time))) } });
        out.push({ family: "inconsistent", confidence: confidenceFromLaps(d.cleanLaps, 10, 5), evidence, focusLap: slowest?.lap_num ?? null });
        break;
      }
    }
  }
  return out;
}
