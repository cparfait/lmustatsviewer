/**
 * Contexte de données pour le Coach IA en **live** (snapshot shared memory).
 *
 * On s'appuie sur les champs déjà calculés par le backend Rust (notamment
 * `fuel_consumption` et `fuel_laps_remaining`) + le bilan stratégie déterministe
 * partagé (`lib/strategy.ts` — mêmes chiffres que la page Live). Pas
 * d'invention : étiquettes EN compactes, sections omises si données absentes.
 */

import { formatTime } from "../../utils";
import { computeStrategy, strategyToText } from "../../strategy";
import { buildTyreInsights } from "../insights";
import { playerClassPosition, gapBetween } from "../../livePosition";
import type { LiveData, LiveStanding } from "../../api";

function sessionTypeLabel(s: number): string {
  if (s === 0) return "Test";
  if (s >= 1 && s <= 4) return "Practice";
  if (s >= 5 && s <= 8) return "Qualifying";
  if (s === 9) return "Warmup";
  if (s >= 10) return "Race";
  return "Session";
}

function n(v: number | null | undefined, digits = 0, unit = ""): string {
  if (v == null || !isFinite(v)) return "N/A";
  return `${v.toFixed(digits)}${unit}`;
}

/**
 * Temps de secteur : le backend écrit 0 quand le jeu ne le fournit pas (tour en
 * cours, tour invalidé, retour au garage…). Un « 0.000 » brut était lu par le
 * modèle comme un vrai chrono (« S3 0.000 → secteur perdu ») : on écrit N/A.
 */
function sec(v: number | null | undefined): string {
  return v != null && isFinite(v) && v > 0 ? v.toFixed(3) : "N/A";
}

/**
 * Température pneu plausible. À l'arrêt au garage, LMU renvoie 0 K, converti en
 * −273 °C côté Rust : ce n'est pas une mesure, on ne la transmet pas.
 */
function tyreTempValid(c: number): boolean {
  return isFinite(c) && c > -50 && c < 250;
}

export function buildLiveContext(data: LiveData): string {
  if (!data.connected) return "Live: not connected to the game (no session running).";

  const lines: string[] = [];
  const s = data.session;
  const p = data.player;
  const tel = data.telemetry;
  const w = data.weather;
  const me = data.standings.find((x) => x.is_player) ?? null;

  lines.push("## Live session" + (data.paused ? " (PAUSED)" : ""));
  if (s) {
    lines.push(`Track: ${s.track} — ${sessionTypeLabel(s.session)}`);
    if (s.max_laps > 0) lines.push(`Laps: ${s.max_laps} planned`);
    if (s.end_et > 0) lines.push(`Timed race, ends at ${formatTime(s.end_et)} (elapsed ${formatTime(s.session_time)})`);
    lines.push(`Cars on track: ${s.num_vehicles}`);
  }

  if (p) {
    lines.push("");
    lines.push("## You");
    // Multiclasse : la position qui compte est celle de la classe (la générale
    // mélange des voitures qui ne se battent pas entre elles).
    const cp = playerClassPosition(data.standings);
    const pos = cp?.multiclass
      ? `Class position: P${cp.classPos}/${cp.classCount} in ${me?.vehicle_class || "your class"} (overall P${cp.overall}/${cp.total} — multi-class session, other classes are not direct rivals)`
      : `Position: P${p.position}${s ? `/${s.num_vehicles}` : ""}`;
    lines.push(`${pos} · Lap ${p.total_laps} · Pit stops: ${p.num_pitstops} · Penalties: ${p.num_penalties}`);
    lines.push(`Last lap: ${formatTime(p.last_lap_time)} (delta ${n(p.lap_delta, 3, "s")} vs best) · Best: ${formatTime(p.best_lap_time)}`);
    if (p.last_sectors) {
      const ls = p.last_sectors;
      lines.push(
        `Last lap sectors: S1 ${sec(ls[0])} · S2 ${sec(ls[1])} · S3 ${sec(ls[2])}` +
          (ls.some((x) => !(x > 0))
            ? " (N/A = not reported by the game for that lap — lap incomplete/invalid or car returned to the garage; this is NOT a time loss)"
            : ""),
      );
    }
    if (p.best_sectors && p.best_sectors.some((x) => x > 0)) {
      const bs = p.best_sectors;
      lines.push(`Best individual sectors seen live this session: S1 ${sec(bs[0])} · S2 ${sec(bs[1])} · S3 ${sec(bs[2])}`);
    }
    if (me?.in_pits) {
      lines.push(
        "Status: IN THE PITS / GARAGE — the car is not on a flying lap; live fuel and tyre readings describe the stationary car, not a running stint.",
      );
    }
    if (me && cp?.multiclass) {
      const gap = (other: LiveStanding | null, label: string): string => {
        if (!other) return `${label}: — (you lead the class)`;
        const g = gapBetween(other, me);
        if (g != null) return `${label}: ${n(g, 3, "s")}`;
        const laps = me.laps_behind_leader - other.laps_behind_leader;
        return `${label}: ${laps > 0 ? `+${laps} lap(s)` : "N/A"}`;
      };
      lines.push(`${gap(cp.classLeader, "Gap to class leader")} · ${gap(cp.classAhead, "Gap to class car ahead")}`);
      lines.push(`Overall: gap to overall leader ${n(me.time_behind_leader, 3, "s")} · gap to car ahead on road (any class) ${n(me.time_behind_next, 3, "s")}`);
    } else if (me) {
      lines.push(`Gap to leader: ${n(me.time_behind_leader, 3, "s")} · Gap to car ahead: ${n(me.time_behind_next, 3, "s")}`);
    }
  }

  if (tel) {
    lines.push("");
    lines.push("## Car");
    lines.push(`Speed ${n(tel.speed_kmh)} km/h · gear ${tel.gear} · ${n(tel.rpm)} rpm · water ${n(tel.water_temp)}°C · oil ${n(tel.oil_temp)}°C`);
    if (tel.front_compound || tel.rear_compound) {
      lines.push(`Tyre compound: front ${tel.front_compound || "?"} / rear ${tel.rear_compound || "?"}`);
    }
    if (tel.wheels) {
      const labels = ["FL", "FR", "RL", "RR"];
      // `wear` est déjà en % de gomme restante (conversion faite côté Rust).
      const wear = tel.wheels.map((wh, i) => `${labels[i]} ${n(wh.wear)}%`).join(" ");
      const temp = tel.wheels.every((wh) => tyreTempValid(wh.temp))
        ? tel.wheels.map((wh, i) => `${labels[i]} ${n(wh.temp)}°C`).join(" ")
        : "N/A (not reported — car stationary / in the garage)";
      const pres = tel.wheels.map((wh, i) => `${labels[i]} ${n(wh.pressure / 100, 2)}bar`).join(" ");
      lines.push(`Tyre rubber remaining: ${wear}`);
      lines.push(`Tyre temp (carcass): ${temp}`);
      lines.push(`Tyre pressure: ${pres}`);
    }
    if (tel.damage_total > 0) lines.push(`Damage: ${n(tel.damage_total * 100)}%`);

    // ── Carburant + bilan stratégie (déterministe, calculé en code) ──
    lines.push("");
    lines.push("## Fuel & strategy");
    lines.push(`Fuel: ${n(tel.fuel, 1, "L")} / ${n(tel.fuel_capacity, 1, "L")}`);
    const strat = computeStrategy(s, p, tel);
    if (strat) {
      lines.push("--- STRATEGY COMPUTER (trust these numbers, do not re-derive them) ---");
      lines.push(strategyToText(strat));
    } else {
      lines.push("Consumption not measured yet (needs 2 flying lap crossings).");
    }

    // Verdicts pneus/freins déterministes (déséquilibres calculés en code).
    const tyreInsights = buildTyreInsights(data);
    if (tyreInsights) {
      lines.push("");
      lines.push(tyreInsights);
    }
  }

  // Maps électroniques embarquées (ABS/TC/map moteur) — désormais issues de la
  // mémoire native LMU (`LMU_Data`), donc les **vraies** valeurs réglées au volant
  // (et non plus les aides de difficulté rF2 qui sortaient toujours à 0). Affiché
  // seulement si renseigné (>0), pour ne rien affirmer si la source est absente.
  if (data.extended && (data.extended.abs > 0 || data.extended.tc > 0)) {
    const e = data.extended;
    lines.push("");
    lines.push("## In-car electronics maps");
    lines.push(
      `ABS ${e.abs}/${e.abs_max} · Traction Control (TC) ${e.tc}/${e.tc_max}` +
        ` · TC power cut ${e.tc_cut}/${e.tc_cut_max}` +
        ` · TC slip angle ${e.tc_slip}/${e.tc_slip_max}` +
        (e.motor_map > 0 ? ` · Engine map ${e.motor_map}` : ""),
    );
  }

  // Énergie virtuelle & hybride (voitures WEC) — la métrique de relais qui compte
  // vraiment (carburant + hybride combinés). Section omise si non-hybride (=0).
  if (data.extended && data.extended.virtual_energy > 0) {
    const e = data.extended;
    const BOOST = ["unavailable", "inactive", "deploying", "regenerating"];
    lines.push("");
    lines.push("## Hybrid / virtual energy");
    lines.push(
      `Virtual energy: ${(e.virtual_energy * 100).toFixed(1)}% remaining` +
        ` · Battery SoC: ${e.state_of_charge.toFixed(0)}%` +
        ` · Regen: ${e.regen.toFixed(0)} kW` +
        ` · Hybrid: ${BOOST[e.boost_state] ?? "?"}`,
    );
  }

  // Limites de piste (si la session les sanctionne) — le coach peut alerter.
  if (data.extended && data.extended.track_limits_per_penalty > 0) {
    const e = data.extended;
    lines.push("");
    lines.push("## Track limits");
    lines.push(
      `${e.track_limits}/${e.track_limits_per_penalty} points before a penalty` +
        (e.track_limits / e.track_limits_per_penalty >= 0.6
          ? " — WARNING, close to a penalty, advise caution"
          : ""),
    );
  }

  if (w) {
    lines.push("");
    lines.push("## Weather");
    lines.push(`Air ${n(w.air_temp)}°C · track ${n(w.track_temp)}°C · rain ${n(w.rain * 100)}% · wind ${n(w.wind_speed, 1, " m/s")}`);
  }

  return lines.join("\n");
}
