/**
 * Bilan au box (Atelier, opt-in) : écoute passive du flux live. Sur chaque tour
 * propre (sans passage aux stands), la sonde d'équilibre (`balanceProbe.ts`)
 * enregistre dérive avant / arrière, vitesse et pédales. À l'entrée aux stands,
 * après au moins 2 tours mesurés, l'ingénieur résume l'équilibre et propose
 * UNE correction (`recommend`) sur le dernier setup connu de la voiture sur ce
 * circuit ; la carte « Bilan au box » permet d'écrire la nouvelle version.
 * Muet si le serveur impose le setup. Les tours repartent de zéro à chaque relais.
 */

import { useEffect } from "react";
import { create } from "zustand";
import i18n from "@/i18n";
import { isTauri, live, setups as setupsApi, type LiveData, type SetupEntry, type SvmFile } from "@/lib/api";
import { analyzeBalance, carMatches, circuitMatches, type BalanceReport, type ProbeLap, type ProbeSample } from "@/lib/balanceProbe";
import { FLAG_BOX_DEBRIEF, useConfigFlag } from "@/lib/configFlag";
import { fresh } from "@/lib/lmuRest";
import { recommend, type Recommendation } from "@/lib/setupAssistant";
import { learnForCar, svmOfEntry } from "@/lib/setupNotches";
import { engineerVoiceActive } from "@/lib/engineer/sideCallouts";
import { speak } from "@/lib/voice";
import { isFixedSetup } from "@/lib/ai/context/lab-context";

export interface DebriefProposal {
  id: number;
  report: BalanceReport;
  entry: SetupEntry | null;
  svm: SvmFile | null;
  rec: Recommendation | null;
  /** Le défaut existe mais tous les réglages concernés sont en butée. */
  allAtLimit: boolean;
}

interface DebriefStore {
  proposal: DebriefProposal | null;
  show: (p: DebriefProposal) => void;
  clear: () => void;
}

export const useBoxDebriefStore = create<DebriefStore>((set) => ({
  proposal: null,
  show: (proposal) => set({ proposal }),
  clear: () => set({ proposal: null }),
}));

const MAX_LAPS = 10;

/** Échantillon de la sonde, `null` si la trame ne porte pas les dérives. */
export function sampleOf(d: LiveData): ProbeSample | null {
  const t = d.telemetry;
  if (!t) return null;
  const w = t.wheels;
  if (w.some((x) => x.slip_angle == null)) return null;
  return {
    dist: t.lap_dist_est > 0 ? t.lap_dist_est : t.lap_dist,
    speed: t.speed_kmh,
    throttle: t.throttle,
    brake: t.brake,
    front: ((w[0].slip_angle ?? 0) + (w[1].slip_angle ?? 0)) / 2,
    rear: ((w[2].slip_angle ?? 0) + (w[3].slip_angle ?? 0)) / 2,
  };
}

/** Dernier setup de la voiture sur ce circuit (le plus récent), sinon `null`. */
export function pickComboSetup(all: SetupEntry[], track: string, liveNames: string[]): SetupEntry | null {
  return all.filter((e) => circuitMatches(e.circuit, track)).find((e) => carMatches(e.car, liveNames)) ?? null;
}

/** Phrase radio du bilan (langue de l'app). */
export function debriefSpeech(p: DebriefProposal): string {
  const t = i18n.t.bind(i18n);
  const w = p.report.worst;
  if (!w) return t("lab.debrief.sayBalanced");
  const head = t("lab.debrief.sayFinding", {
    symptom: t(`lab.debrief.say.${w.symptom}`),
    phase: t(`lab.debrief.say.${w.phase}`),
    regime: t(`lab.debrief.say.${w.regime}`),
    laps: w.laps,
  });
  if (!p.rec) return head;
  return `${head} ${t("lab.debrief.sayProposal", {
    lever: t(`setupAssistant.lever.${p.rec.lever}`),
    dir: t(p.rec.dir > 0 ? "setupAssistant.up" : "setupAssistant.down"),
  })}`;
}

async function buildProposal(d: LiveData, report: BalanceReport): Promise<DebriefProposal> {
  const base: DebriefProposal = { id: Date.now(), report, entry: null, svm: null, rec: null, allAtLimit: false };
  const w = report.worst;
  if (!w || !d.session) return base;
  const me = d.standings.find((s) => s.is_player);
  const names = [me?.vehicle_name ?? "", d.player?.vehicle ?? ""].filter(Boolean);
  const all = await setupsApi.entries().catch(() => [] as SetupEntry[]);
  const entry = pickComboSetup(all, d.session.track, names);
  const svm = entry ? svmOfEntry(entry) : null;
  if (!entry || !svm) return base;
  const bounds = await live.garageBounds().then(fresh).catch(() => null);
  const table = await learnForCar(
    svm,
    all.filter((e) => e.car === entry.car).map(svmOfEntry),
    bounds,
  ).catch(() => undefined);
  const recs = recommend(svm, w.symptom, w.phase, w.regime, bounds, 3, table);
  const rec = recs.find((r) => !r.atLimit) ?? null;
  return { ...base, entry, svm, rec, allAtLimit: !rec && recs.length > 0 };
}

export function useBoxDebrief(): void {
  const enabled = useConfigFlag(FLAG_BOX_DEBRIEF);

  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let disposed = false;
    let off: (() => void) | null = null;
    let sessionKey = "";
    let laps: ProbeLap[] = [];
    let cur: ProbeSample[] = [];
    let curLap = -1;
    let pitDuringLap = true;
    let wasInPits: boolean | null = null;
    let busy = false;

    const reset = () => {
      laps = [];
      cur = [];
      curLap = -1;
      pitDuringLap = true;
    };

    const debrief = async (d: LiveData) => {
      const report = analyzeBalance(laps);
      laps = [];
      if (report.laps < 2) return;
      const p = await buildProposal(d, report);
      if (disposed) return;
      useBoxDebriefStore.getState().show(p);
      if (engineerVoiceActive()) speak(debriefSpeech(p), i18n.language || "fr", "normal");
    };

    const onFrame = (d: LiveData) => {
      const p = d.player;
      if (disposed || !d.connected || !d.session || !p || d.paused) return;
      const me = d.standings.find((s) => s.is_player);
      const key = `${d.session.track}|${me?.vehicle_name ?? ""}|${d.session.session}`;
      if (key !== sessionKey) {
        sessionKey = key;
        reset();
        wasInPits = null;
      }
      const inPits = !!me?.in_pits;
      // Tour bouclé : on garde le tour s'il n'est pas passé par les stands.
      if (p.total_laps !== curLap) {
        if (curLap >= 0 && p.total_laps === curLap + 1 && !pitDuringLap && cur.length >= 50) {
          laps.push({ samples: cur });
          if (laps.length > MAX_LAPS) laps.shift();
        }
        cur = [];
        curLap = p.total_laps;
        pitDuringLap = inPits;
      }
      if (inPits) pitDuringLap = true;
      else {
        const s = sampleOf(d);
        if (s) {
          // Retour en arrière (rembobinage, reset) : tour inexploitable.
          if (cur.length && s.dist < cur[cur.length - 1].dist - 200) pitDuringLap = true;
          cur.push(s);
        }
      }
      // Entrée aux stands : bilan du relais (jamais avec un setup imposé).
      if (wasInPits === false && inPits && !busy) {
        if (isFixedSetup(d)) laps = [];
        else {
          busy = true;
          void debrief(d)
            .catch(() => {})
            .finally(() => {
              busy = false;
            });
        }
      }
      wasInPits = inPits;
    };

    void (async () => {
      off = await live.onData(onFrame);
      if (disposed) off();
    })();

    return () => {
      disposed = true;
      off?.();
    };
  }, [enabled]);
}
