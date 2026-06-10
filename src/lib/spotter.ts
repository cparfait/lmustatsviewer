/**
 * Spotter « à la demande » (Couche 1 — MVP touches).
 *
 * Construit des phrases parlées à partir des données Live, déclenchées par des
 * **raccourcis globaux** (actifs même quand le jeu a le focus). Couche 1 :
 * Statut · Mute · Répète. Le vocabulaire et les réponses sont calqués sur les
 * champs réellement alimentés par le plugin shared-memory (cf. `LiveData`), donc
 * directement extensibles vers la Couche 2 (reconnaissance par commandes).
 *
 * Aucune dépendance React : les phrases sont des fonctions pures ; l'orchestration
 * (raccourcis + store) vit dans `useSpotter` (App).
 */

import type { LiveData } from "@/lib/api";
import type { Tr } from "@/i18n";
import type { Intent } from "@/lib/spotterCommands";

/** Temps au tour en forme parlée : « 1 minute 23.456 » / « 23.456 secondes »
 *  (millièmes inclus pour une annonce précise). */
function lapVoice(s: number, t: Tr): string {
  if (!s || s <= 0 || !isFinite(s)) return "";
  const m = Math.floor(s / 60);
  const sec = (s - m * 60).toFixed(3);
  return m > 0
    ? t("live.vLapTime", { min: m, sec })
    : t("live.vLapTimeShort", { sec });
}

/** Écart au pilote devant (s, 0 si en tête / indisponible). */
function gapAhead(data: LiveData): number {
  const me = data.standings.find((s) => s.is_player);
  if (!me || (data.player?.position ?? 0) <= 1) return 0;
  return me.time_behind_next > 0 ? me.time_behind_next : 0;
}

/** Écart du poursuivant immédiat (s, 0 si dernier / indisponible). */
function gapBehind(data: LiveData): number {
  const pos = data.player?.position ?? 0;
  const behind = data.standings.find((s) => s.position === pos + 1);
  return behind && behind.time_behind_next > 0 ? behind.time_behind_next : 0;
}

/**
 * Construit la phrase « Statut » : résumé de course complet, ordonné du plus
 * important au moins important — position · (aux stands) · dernier tour ·
 * meilleur tour · écart devant · écart au poursuivant · tours/temps restants ·
 * autonomie carburant. N'inclut que les clauses dont la donnée est disponible
 * (pas de bruit). Les écarts sont omis aux stands (valeurs aberrantes). Repli
 * explicite si pas en session.
 */
export function buildStatus(data: LiveData | null, t: Tr): string {
  if (
    !data ||
    !data.connected ||
    data.paused ||
    !data.session ||
    !data.player
  ) {
    return t("live.spNoSession");
  }
  const p = data.player;
  const sc = data.session;
  const me = data.standings.find((s) => s.is_player) ?? null;
  const inPits = me?.in_pits ?? false;
  const parts: string[] = [];

  // Position au général.
  if (p.position === 1) parts.push(t("live.spLeader"));
  else if (p.position > 0) parts.push(t("live.spPos", { pos: p.position }));

  // Aux stands : on le signale (et on omet les écarts plus bas).
  if (inPits) parts.push(t("live.spInPits"));

  // Dernier tour bouclé + meilleur tour de la session.
  if (p.last_lap_time > 0) {
    parts.push(t("live.spLap", { lap: lapVoice(p.last_lap_time, t) }));
  }
  if (p.best_lap_time > 0) {
    parts.push(t("live.spBest", { lap: lapVoice(p.best_lap_time, t) }));
  }

  // Écarts devant / derrière — sans objet aux stands.
  if (!inPits) {
    const gapNext = me?.time_behind_next ?? 0;
    if (p.position > 1 && gapNext > 0) {
      parts.push(t("live.spGapNext", { time: gapNext.toFixed(1) }));
    }
    // Voiture juste derrière : son écart au précédent (= nous).
    const behind = data.standings.find((s) => s.position === p.position + 1);
    const gapBehind = behind?.time_behind_next ?? 0;
    if (gapBehind > 0) {
      parts.push(t("live.spGapBehind", { time: gapBehind.toFixed(1) }));
    }
  }

  // Restant : tours (course au tour) ou minutes (course au temps).
  if (sc.max_laps > 0 && sc.max_laps < 1000) {
    const lapsLeft = sc.max_laps - p.total_laps;
    if (lapsLeft > 0) parts.push(t("live.spLapsLeft", { count: lapsLeft }));
  } else if (sc.end_et > 0 && sc.end_et > sc.session_time) {
    const minLeft = Math.round((sc.end_et - sc.session_time) / 60);
    if (minLeft > 0) parts.push(t("live.spTimeLeft", { min: minLeft }));
  }

  // Autonomie carburant (tours restants estimés par le plugin).
  const fuelLaps = data.telemetry?.fuel_laps_remaining ?? 0;
  if (fuelLaps > 0) {
    parts.push(t("live.spFuel", { n: Math.floor(fuelLaps) }));
  }

  return parts.length ? parts.join(", ") : t("live.spNoSession");
}

/**
 * Construit la réponse parlée à une **commande** du spotter (Couche 2). Chaque
 * intention puise dans `LiveData` ; `status` réutilise `buildStatus`. Les commandes
 * de contrôle (`repeat`/`mute`) ne produisent pas de phrase (gérées par le hook) →
 * repli sur le statut si jamais elles arrivent ici. Repli `spNoSession` hors session.
 */
export function buildAnswer(intent: Intent, data: LiveData | null, t: Tr): string {
  if (!data || !data.connected || data.paused || !data.session || !data.player) {
    return t("live.spNoSession");
  }
  const p = data.player;
  const sc = data.session;
  const me = data.standings.find((s) => s.is_player) ?? null;
  const inPits = me?.in_pits ?? false;

  switch (intent) {
    case "gap": {
      if (inPits) return t("live.spInPits");
      const parts: string[] = [];
      const ahead = gapAhead(data);
      if (ahead > 0) parts.push(t("live.spGapNext", { time: ahead.toFixed(1) }));
      const behind = gapBehind(data);
      if (behind > 0) parts.push(t("live.spGapBehind", { time: behind.toFixed(1) }));
      return parts.length ? parts.join(", ") : t("live.spNoData");
    }

    case "fuel": {
      const fuelLaps = data.telemetry?.fuel_laps_remaining ?? 0;
      return fuelLaps > 0
        ? t("live.spFuel", { n: Math.floor(fuelLaps) })
        : t("live.spNoData");
    }

    case "tyres": {
      const wheels = data.telemetry?.wheels;
      if (!wheels) return t("live.spNoData");
      // wear = % de gomme restante → min = pneu le plus usé ; temp = carcasse °C.
      const wears = wheels.map((w) => w.wear).filter((x) => x >= 0 && x <= 100);
      const temps = wheels.map((w) => w.temp).filter((x) => x > 0 && x < 250);
      if (!wears.length && !temps.length) return t("live.spNoData");
      const minWear = wears.length ? Math.round(Math.min(...wears)) : null;
      const maxTemp = temps.length ? Math.round(Math.max(...temps)) : null;
      if (minWear !== null && maxTemp !== null) {
        return t("live.spTyres", { wear: minWear, temp: maxTemp });
      }
      if (minWear !== null) return t("live.spTyresWear", { wear: minWear });
      return t("live.spTyresTemp", { temp: maxTemp });
    }

    case "position": {
      const parts: string[] = [];
      if (p.position === 1) parts.push(t("live.spLeader"));
      else if (p.position > 0) parts.push(t("live.spPos", { pos: p.position }));
      const gapLeader = me?.time_behind_leader ?? 0;
      if (!inPits && p.position > 1 && gapLeader > 0) {
        parts.push(t("live.spGapLeader", { time: gapLeader.toFixed(1) }));
      }
      return parts.length ? parts.join(", ") : t("live.spNoData");
    }

    case "pace": {
      const parts: string[] = [];
      if (p.last_lap_time > 0) {
        parts.push(t("live.spLap", { lap: lapVoice(p.last_lap_time, t) }));
      }
      if (p.best_lap_time > 0) {
        parts.push(t("live.spBest", { lap: lapVoice(p.best_lap_time, t) }));
      }
      if (Math.abs(p.lap_delta) > 0.05) {
        const sign = p.lap_delta > 0 ? "+" : "";
        parts.push(t("live.spDelta", { time: `${sign}${p.lap_delta.toFixed(1)}` }));
      }
      return parts.length ? parts.join(", ") : t("live.spNoData");
    }

    case "remaining": {
      if (sc.max_laps > 0 && sc.max_laps < 1000) {
        const lapsLeft = sc.max_laps - p.total_laps;
        if (lapsLeft > 0) return t("live.spLapsLeft", { count: lapsLeft });
      } else if (sc.end_et > 0 && sc.end_et > sc.session_time) {
        const minLeft = Math.round((sc.end_et - sc.session_time) / 60);
        if (minLeft > 0) return t("live.spTimeLeft", { min: minLeft });
      }
      return t("live.spNoData");
    }

    case "weather": {
      const w = data.weather;
      if (!w) return t("live.spNoData");
      const rainPct = Math.round((w.rain ?? 0) * 100);
      if (rainPct >= 5) {
        return t("live.spWeatherRain", {
          pct: rainPct,
          track: Math.round(w.track_temp),
        });
      }
      return t("live.spWeatherDry", {
        air: Math.round(w.air_temp),
        track: Math.round(w.track_temp),
      });
    }

    case "status":
    case "repeat":
    case "mute":
    default:
      return buildStatus(data, t);
  }
}
