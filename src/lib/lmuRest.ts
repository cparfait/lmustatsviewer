/**
 * Exploitation du pont REST du jeu (module pur, `lmu_rest.rs` côté Rust).
 *
 * Règle d'or : une donnée REST ne sert que si elle est **fraîche** (≤ 8 s) et
 * cohérente avec le live ; sinon chaque fonction rend `null` et l'appelant garde
 * son comportement d'avant (mémoire partagée, mesure, `.wet`, réglage manuel).
 *
 * `enrichLive` est appliqué à chaque trame `live-data` (`api.ts`) : il corrige
 * en un seul point la durée de séance (connue dès la formation) et la conso de
 * carburant (garde-fou officiel), pour que tous les consommateurs en profitent.
 */

import type {
  LiveData,
  LmuRestLive,
  RestField,
  RestForecastNode,
  RestPitScreen,
  RestSettingBound,
  RestUsed,
} from "@/lib/api";

/** Écart relatif toléré entre conso mesurée et conso officielle du jeu. */
export const CONSUMPTION_TOLERANCE = 0.4;
/** Écart max (s) entre l'horloge de séance REST et celle de la mémoire partagée. */
const CLOCK_TOLERANCE_S = 30;

/** La donnée si elle est fraîche, sinon null. */
export function fresh<T>(f: RestField<T> | null | undefined): T | null {
  return f && f.state === "fresh" ? f.data : null;
}

/**
 * Garde-fou de consommation : la mesure prime, la valeur du jeu la remplace
 * avant toute mesure ou quand la mesure s'en écarte de plus de 40 % (tour avec
 * ravitaillement, sortie des stands, tour sous FCY…).
 */
export function guardPerLap(
  measured: number | null | undefined,
  official: number | null | undefined,
  tolerance = CONSUMPTION_TOLERANCE,
): { perLap: number; source: "measured" | "game" } | null {
  const m = measured != null && measured > 0 && isFinite(measured) ? measured : null;
  const o = official != null && official > 0 && isFinite(official) ? official : null;
  if (m != null && o != null) {
    const r = m / o;
    return r < 1 - tolerance || r > 1 + tolerance ? { perLap: o, source: "game" } : { perLap: m, source: "measured" };
  }
  if (m != null) return { perLap: m, source: "measured" };
  if (o != null) return { perLap: o, source: "game" };
  return null;
}

/** Écran stands frais, sinon null. */
export function pitScreen(rest: LmuRestLive | null | undefined): RestPitScreen | null {
  return fresh(rest?.pit);
}

/** Conso officielle de carburant (L/tour) d'après la table du jeu. */
export function officialFuelPerLap(rest: LmuRestLive | null | undefined): number | null {
  return pitScreen(rest)?.fuel_per_lap ?? null;
}

/** Conso officielle d'énergie virtuelle (fraction/tour) d'après la table du jeu. */
export function officialEnergyPerLap(rest: LmuRestLive | null | undefined): number | null {
  return pitScreen(rest)?.energy_per_lap ?? null;
}

/**
 * Fin de séance (même horloge que `session_time`) d'après le jeu, connue dès la
 * formation, pour les séances **au temps**. Relevé sur le jeu (oct. 2026) :
 * `endEventTime` n'est PAS la fin de séance (600 s dans une séance de 6 h) ;
 * la fin est `startEventTime + maxTime` (recoupé par `currentEventTime +
 * timeRemainingInGamePhase` en vert). Null si l'info est périmée, si la séance
 * est au tour, ou si l'horloge REST ne colle pas à celle de la mémoire partagée.
 *
 * Avant le départ (phase < 5 : grille, formation, compte à rebours), relevé en
 * course le 2026-10-16 : `startEventTime` = 0 et `timeRemainingInGamePhase` = -1,
 * puis `startEventTime` passe à l'heure du vert (105 s après 1 min 45 de
 * formation). Le chrono de course ne tourne pas encore : il reste toute la
 * durée, donc fin = maintenant + `maxTime`.
 */
export function restSessionEnd(rest: LmuRestLive | null | undefined, sessionTime: number): number | null {
  const s = fresh(rest?.session);
  if (!s || s.max_time == null || !(s.max_time > 0 && s.max_time < 200_000)) return null;
  if (s.maximum_laps != null && s.maximum_laps > 0 && s.maximum_laps < 100_000) return null;
  if (s.current_event_time != null && Math.abs(s.current_event_time - sessionTime) > CLOCK_TOLERANCE_S) return null;
  const beforeGreen = s.game_phase != null && s.game_phase >= 0 && s.game_phase < 5;
  const end = beforeGreen ? (s.current_event_time ?? sessionTime) + s.max_time : (s.start_event_time ?? 0) + s.max_time;
  return end > (s.current_event_time ?? sessionTime) + 1 ? end : null;
}

/**
 * Applique les garde-fous REST à une trame live (idempotent, ne touche à rien
 * quand le pont est muet). Renseigne `rest_used` pour l'indicateur de la page Live.
 */
export function enrichLive(d: LiveData): LiveData {
  if (!d || d.rest_used) return d;
  const used: RestUsed = { fuel: null, sessionEnd: null };
  const rest = d.rest ?? null;

  const sc = d.session;
  if (sc) {
    if (sc.end_et > 0) {
      used.sessionEnd = "live";
    } else {
      const end = restSessionEnd(rest, sc.session_time);
      if (end != null) {
        d.session = { ...sc, end_et: end };
        used.sessionEnd = "game";
      }
    }
  }

  const tel = d.telemetry;
  if (tel) {
    const g = guardPerLap(tel.fuel_consumption, officialFuelPerLap(rest));
    if (g) {
      used.fuel = g.source;
      if (g.source === "game") {
        d.telemetry = { ...tel, fuel_consumption: g.perLap, fuel_laps_remaining: tel.fuel / g.perLap };
      }
    }
  }

  d.rest_used = used;
  return d;
}

/** Nœuds de prévision du jeu pour la séance en cours (≥ 2), sinon null. */
export function gameForecast(rest: LmuRestLive | null | undefined, rf2Session: number): RestForecastNode[] | null {
  const pit = pitScreen(rest);
  if (pit && pit.forecast.length >= 2) return pit.forecast;
  const w = fresh(rest?.weather);
  if (!w) return null;
  const nodes =
    rf2Session >= 10 ? w.race : rf2Session >= 5 && rf2Session <= 8 ? w.qualify : rf2Session >= 1 ? w.practice : [];
  return nodes.length >= 2 ? nodes : null;
}

/**
 * État des plaquettes (fraction restante 0-1, FL FR RL RR) d'après
 * `getVehicleCondition` (≈ 1 neuves, relevé réel). Null si inconnu ou
 * incohérent. (`wearables.brakes` de l'écran des stands est une autre grandeur.)
 */
export function brakePads(rest: LmuRestLive | null | undefined): number[] | null {
  const pads = fresh(rest?.vehicle)?.brake_condition;
  if (!pads || pads.length !== 4 || !pads.every((x) => isFinite(x) && x >= 0 && x <= 1.0001)) return null;
  return pads.map((x) => Math.min(1, x));
}

export const WHEELS = ["FL", "FR", "RL", "RR"] as const;

/**
 * Roues dont la suspension est touchée (dégât > seuil), d'après le jeu ; null
 * si le jeu ne dit rien en ce moment (à ne pas confondre avec « rien de touché »).
 */
export function damagedSuspensionsOrNull(rest: LmuRestLive | null | undefined, threshold = 0.05): number[] | null {
  const v = fresh(rest?.vehicle)?.suspension_damage;
  const s = v && v.length === 4 ? v : (pitScreen(rest)?.suspension_wear ?? []);
  if (s.length !== 4) return null;
  return s.map((x, i) => (x > threshold ? i : -1)).filter((i) => i >= 0);
}

/** Roues dont la suspension est touchée (dégât > seuil), d'après le jeu. */
export function damagedSuspensions(rest: LmuRestLive | null | undefined, threshold = 0.05): number[] {
  return damagedSuspensionsOrNull(rest, threshold) ?? [];
}

/**
 * Dégâts aéro (0-1) d'après l'écran des stands, ou null. Relevé réel
 * (2026-10-16, Road Atlanta) : la valeur dépasse 1 après un gros choc (1,89,
 * suspension AR D cassée) → bornée à 1 pour ne jamais annoncer « 189 % ».
 */
export function aeroDamage(rest: LmuRestLive | null | undefined): number | null {
  const a = pitScreen(rest)?.aero_damage;
  return a != null && isFinite(a) && a >= 0 ? Math.min(1, a) : null;
}

/** Durée prévue du prochain arrêt avec le menu actuel (s), ou null. */
export function plannedStopSeconds(rest: LmuRestLive | null | undefined): number | null {
  const s = pitScreen(rest)?.pit_stop_length_s;
  return s != null && s >= 0 && s < 600 ? s : null;
}

/**
 * Perte au stand à utiliser : temps de voie mesuré (perte − durée de l'arrêt
 * mesuré) + durée prévue du prochain arrêt. Sans ces deux chiffres : la perte
 * enregistrée (mesurée ou réglée à la main), comme avant.
 */
export function effectivePitLoss(
  d: LiveData | null | undefined,
  storedLoss: number,
  laneLoss: number | null | undefined,
): number {
  const stop = plannedStopSeconds(d?.rest);
  if (laneLoss != null && laneLoss > 0 && stop != null) return laneLoss + stop;
  return storedLoss;
}

/**
 * Durée d'arrêt retenue pendant un passage aux stands : la plus haute vue. Le
 * jeu recalcule `pitStopLength` en direct (relevé 2026-10-16 : ~2 s menu vide,
 * 186,6 s avec « Tout réparer ») ; s'il la décompte pendant le service, garder
 * la dernière valeur sous-estimerait l'arrêt et gonflerait le temps de voie.
 */
export function keepPlannedStop(prev: number | null, planned: number | null): number | null {
  if (planned == null || !(planned > 0)) return prev;
  return prev == null ? planned : Math.max(prev, planned);
}

/** Temps de voie d'un arrêt mesuré, si sa durée à l'arrêt est connue. */
export function laneLossFrom(totalLoss: number, stopSeconds: number | null): number | null {
  if (stopSeconds == null) return null;
  const lane = totalLoss - stopSeconds;
  return lane >= 5 && lane <= 120 ? lane : null;
}

/** État du pont pour l'indicateur discret : off (pas de flux), ok, muet. */
export function restStatus(d: LiveData | null | undefined): "off" | "ok" | "silent" {
  const r = d?.rest;
  if (!r || !d?.connected) return "off";
  const anyFresh = [r.vehicle, r.pit, r.session, r.weather].some((f) => f.state === "fresh");
  return r.reachable && anyFresh ? "ok" : "silent";
}

/**
 * Lignes (anglais) pour le contexte du Coach IA : seulement ce que la mémoire
 * partagée n'a pas, et seulement si frais.
 */
export function restContextLines(d: LiveData): string[] {
  const rest = d.rest;
  if (!rest) return [];
  const out: string[] = [];
  const pads = brakePads(rest);
  if (pads) out.push(`Brake pads remaining (game): ${pads.map((x, i) => `${WHEELS[i]} ${Math.round(x * 100)}%`).join(" ")}`);
  const susp = damagedSuspensions(rest);
  const aero = aeroDamage(rest);
  if (susp.length || (aero != null && aero > 0.02)) {
    const parts: string[] = [];
    if (susp.length) parts.push(`suspension damaged ${susp.map((i) => WHEELS[i]).join("/")}`);
    if (aero != null && aero > 0.02) parts.push(`aero damage ${Math.round(aero * 100)}%`);
    out.push(`Damage detail (game): ${parts.join(", ")}`);
  }
  const pit = pitScreen(rest);
  if (pit) {
    if (pit.fuel_per_lap != null) out.push(`Game fuel estimate: ${pit.fuel_per_lap.toFixed(2)} L/lap`);
    if (pit.energy_per_lap != null) {
      const ve = d.extended?.virtual_energy ?? pit.energy_fraction ?? 0;
      const range = ve > 0 ? ` · range ~${(ve / pit.energy_per_lap).toFixed(1)} laps` : "";
      out.push(`Game virtual energy estimate: ${(pit.energy_per_lap * 100).toFixed(1)} %/lap${range}`);
    }
    if (pit.pit_stop_length_s != null) out.push(`Planned pit stop (current pit menu): ${pit.pit_stop_length_s.toFixed(0)} s stationary`);
    if (pit.place_in_class != null) {
      const gap = pit.gap_to_class_leader_s != null && pit.place_in_class > 1 ? ` (+${pit.gap_to_class_leader_s.toFixed(1)} s to class leader)` : "";
      out.push(`Class position (game): P${pit.place_in_class}${gap}`);
    }
    const menu = pit.pit_menu.filter((m) => m.text && !/^no change$/i.test(m.text)).slice(0, 8);
    if (menu.length) out.push(`Pit menu: ${menu.map((m) => `${m.name.replace(/:$/, "")} ${m.text}`).join(" · ")}`);
  }
  const sc = d.session;
  const fc = sc ? gameForecast(rest, sc.session) : null;
  if (fc) {
    const pct = ["start", "25%", "50%", "75%", "finish"];
    out.push(
      `Game weather forecast (session ${fc.length === 5 ? "start→finish" : "nodes"}): ` +
        fc.map((n, i) => `${pct[i] ?? i} ${Math.round(n.temperature)}°C rain ${Math.round(n.rain_chance)}%`).join(" · "),
    );
  }
  return out;
}

/**
 * Usure des plaquettes par tour (fraction/tour, la plus usée des quatre),
 * mesurée aux passages de ligne. Un bond vers le haut (plaquettes changées)
 * repart de zéro. Null tant que moins de 2 tours mesurés.
 */
export class PadWearTracker {
  private samples: number[] = [];

  reset(): void {
    this.samples = [];
  }

  /** Tour bouclé : plaquette la plus usée (0-1). */
  push(minPad: number | null): void {
    if (minPad == null || !(minPad >= 0)) return;
    const last = this.samples[this.samples.length - 1];
    if (last != null && minPad > last + 0.05) this.samples = [];
    this.samples.push(minPad);
    if (this.samples.length > 6) this.samples.shift();
  }

  perLap(): number | null {
    if (this.samples.length < 3) return null;
    const per = (this.samples[0] - this.samples[this.samples.length - 1]) / (this.samples.length - 1);
    return per > 0.0005 ? per : null;
  }

  /** Tours avant d'atteindre `floor` (fraction restante), ou null. */
  lapsTo(minPad: number, floor = 0.1): number | null {
    const per = this.perLap();
    return per ? Math.max(0, (minPad - floor) / per) : null;
  }
}

const NOT_ADJUSTABLE = /^(n\/a|non-adjustable|fixed|detached|)$/i;

/**
 * Plages de réglage de la voiture chargée dans le jeu (`getPlayerGarageData`),
 * pour que l'IA ne propose jamais un cran hors limites. Valeurs figées au
 * chargement de la voiture (pas live). Réglages non ajustables omis.
 */
export function garageBoundsText(bounds: RestSettingBound[] | null, max = 60): string | null {
  if (!bounds) return null;
  const rows = bounds
    .filter((b) => b.max > b.min && !NOT_ADJUSTABLE.test(b.text.trim()))
    .slice(0, max)
    .map((b) => {
      const name = b.key.replace(/^(VM|WM)_/, "");
      return `${name}: step ${Math.round(b.value)} in ${Math.round(b.min)}–${Math.round(b.max)}${b.text ? ` (${b.text})` : ""}`;
    });
  if (!rows.length) return null;
  return [
    "## Setup adjustment ranges (game, car currently loaded — never suggest a step outside these)",
    ...rows,
  ].join("\n");
}
