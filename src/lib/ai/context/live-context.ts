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
import type { LiveData } from "../../api";

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
    const cls = me ? ` (class P${me.class_position})` : "";
    lines.push(`Position: P${p.position}${cls} · Lap ${p.total_laps} · Pit stops: ${p.num_pitstops} · Penalties: ${p.num_penalties}`);
    lines.push(`Last lap: ${formatTime(p.last_lap_time)} (delta ${n(p.lap_delta, 3, "s")} vs best) · Best: ${formatTime(p.best_lap_time)}`);
    if (p.last_sectors) {
      lines.push(`Last sectors: S1 ${n(p.last_sectors[0], 3)} · S2 ${n(p.last_sectors[1], 3)} · S3 ${n(p.last_sectors[2], 3)}`);
    }
    if (me) {
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
      const temp = tel.wheels.map((wh, i) => `${labels[i]} ${n(wh.temp)}°C`).join(" ");
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
  }

  if (data.extended) {
    lines.push("");
    lines.push("## Electronics (adjustable)");
    lines.push(`TC ${data.extended.tc} · ABS ${data.extended.abs}`);
  }

  if (w) {
    lines.push("");
    lines.push("## Weather");
    lines.push(`Air ${n(w.air_temp)}°C · track ${n(w.track_temp)}°C · rain ${n(w.rain * 100)}% · wind ${n(w.wind_speed, 1, " m/s")}`);
  }

  return lines.join("\n");
}
