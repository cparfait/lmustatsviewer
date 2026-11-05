/**
 * Réglage automatique de l'énergie virtuelle au menu des stands (opt-in).
 *
 * Actif seulement si l'utilisateur a autorisé les écritures dans le jeu ET ce
 * réglage (Config, options du module Live). En course, une fois par tour, le menu
 * est relu pour repérer un changement du pilote, y compris avant notre première
 * écriture. Quand l'arrêt approche (autonomie ≤ 6 tours et un arrêt est nécessaire) :
 * on calcule le niveau d'énergie qui couvre la fin de course (+ ½ tour), sinon le
 * plein, et on choisit l'option du menu la plus proche au-dessus. Le jeu est relu
 * après chaque écriture. Le pilote garde la main : s'il change lui-même la valeur,
 * on ne touche plus à rien jusqu'à son prochain arrêt.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { isTauri, live, type LiveData } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { computeStrategy } from "@/lib/strategy";
import { energyPerLap } from "@/lib/engineer/answers";
import { chooseEnergy, energyItem, EnergyWatch, energyNeed, energyOptions } from "@/lib/pitMenu";
import { toast, toastError } from "@/stores/dialogs";

/** Autonomie (tours) en dessous de laquelle on prépare l'arrêt. */
export const AUTO_ENERGY_RANGE_LAPS = 6;

export function usePitAutoEnergy(): void {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let off: (() => void) | null = null;
    let laps = -1;
    let stops = -1;
    let busy = false;
    /** Dernière valeur connue du menu pour ce relais (détection d'un réglage manuel). */
    const watch = new EnergyWatch();
    let handsOff = false;

    const evaluate = async (d: LiveData) => {
      const p = d.player!;
      const ve = d.extended?.virtual_energy ?? 0;
      if (!(ve > 0)) return; // voiture sans énergie virtuelle : rien à lire
      // Lecture à chaque tour, avant tout calcul : un réglage du pilote fait bien avant
      // la fenêtre d'arrêt doit être vu.
      const item = energyItem(await live.pitMenu());
      if (!item) return;
      if (watch.read(item.current)) {
        handsOff = true; // le pilote a changé la valeur : il garde la main
        return;
      }
      const per = energyPerLap(d);
      const strat = computeStrategy(d.session, p, d.telemetry);
      const lapsLeft = strat?.sessionLapsLeft ?? null;
      if (!per || lapsLeft == null) return;
      const range = ve / per;
      if (range > AUTO_ENERGY_RANGE_LAPS || lapsLeft <= range) return; // pas d'arrêt à préparer
      const need = energyNeed(Math.max(0, lapsLeft - Math.floor(range)), per);
      if (need == null) return;
      const choice = chooseEnergy(energyOptions(item), need);
      if (!choice || choice.index === item.current) return;
      const ok = await live.setPitMenuItem(item.name, choice.index);
      if (ok) {
        watch.written(choice.index);
        toast(tRef.current("live.pitEnergySet", { pct: Math.round(choice.frac * 100) }));
      } else {
        watch.unconfirmed();
        toastError(tRef.current("live.pitEnergyNotConfirmed"));
      }
    };

    void (async () => {
      off = await live.onData((d: LiveData) => {
        if (disposed || !d.session || !d.player) return;
        const st = useAppStore.getState();
        const me = d.standings.find((s) => s.is_player);
        if (d.player.num_pitstops !== stops) {
          stops = d.player.num_pitstops;
          watch.reset();
          handsOff = false;
        }
        const lapDone = laps >= 0 && d.player.total_laps > laps;
        laps = d.player.total_laps;
        if (!lapDone || busy || handsOff || !st.gameWrites || !st.pitAutoEnergy) return;
        if (d.session.session < 10 || !me || me.in_pits) return;
        busy = true;
        void evaluate(d)
          .catch(() => {})
          .finally(() => {
            busy = false;
          });
      });
    })();

    return () => {
      disposed = true;
      off?.();
    };
  }, []);
}
