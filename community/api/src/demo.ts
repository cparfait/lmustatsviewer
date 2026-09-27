/**
 * Données de DÉMONSTRATION en production, pour tester le site peuplé — puis tout
 * effacer. Chaque session factice porte le marqueur `app_version = DEMO_VERSION` :
 * `purgeDemo` n'efface QUE les installations dont toutes les sessions le portent
 * (une vraie installation n'est jamais touchée, même si un nom se ressemble).
 *
 * Les sessions passent par `ingestSessions` : même validation, mêmes bornes
 * anti-triche que les vraies. Chaque combo est inséré du plus rapide au plus lent
 * (sinon la borne « trop rapide » rejetterait les meilleurs temps arrivés tard).
 */
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./db.js";
import { DEFAULT_INGEST, ingestSessions, registerInstall, type Install } from "./ingest.js";

export const DEMO_VERSION = "0.0.1-demo";

type Combo = [track: string, course: string, cls: string, record: number, drivers: number, cars: string[]];

const GT3 = ["BMW M4 LMGT3", "Ferrari 296 LMGT3 Evo", "McLaren 720S LMGT3 Evo", "Ford Mustang LMGT3", "Mercedes-AMG LMGT3",
  "Porsche 911 GT3 R LMGT3", "Chevrolet Corvette Z06 LMGT3.R", "Lexus RC F LMGT3", "Aston Martin Vantage AMR LMGT3 Evo"];
const HYPER = ["Ferrari 499P", "Porsche 963", "Toyota GR010 Hybrid", "Cadillac V-Series.R", "Peugeot 9x8 (2024/25)", "Alpine A424", "BMW M Hybrid V8"];
const LMP2 = ["Oreca 07"];
const GTE = ["Porsche 911 RSR-19", "Ferrari 488 GTE EVO", "Aston Martin Vantage AMR", "Chevrolet Corvette C8.R"];
const LMP3 = ["Ligier JS P325", "Duqueine D09", "Ginetta G61-LT-P3 Evo"];

// Noms exacts du jeu ; records plausibles (pilotes rapides).
const COMBOS: Combo[] = [
  ["Circuit de Spa-Francorchamps", "Circuit de Spa-Francorchamps", "GT3", 137.2, 240, GT3],
  ["Circuit de Spa-Francorchamps", "Circuit de Spa-Francorchamps", "Hyper", 124.1, 120, HYPER],
  ["Circuit de Spa-Francorchamps", "Circuit de Spa-Francorchamps", "LMP2 WEC", 128.9, 60, LMP2],
  ["Circuit de Spa-Francorchamps", "Circuit de Spa-Francorchamps", "GTE", 141.8, 35, GTE],
  ["Circuit de la Sarthe", "Circuit de la Sarthe", "GT3", 236.4, 200, GT3],
  ["Circuit de la Sarthe", "Circuit de la Sarthe", "Hyper", 205.9, 150, HYPER],
  ["Circuit de la Sarthe", "Circuit de la Sarthe Mulsanne", "GT3", 222.8, 45, GT3],
  ["Autodromo Nazionale Monza", "Autodromo Nazionale Monza", "GT3", 106.9, 180, GT3],
  ["Autodromo Nazionale Monza", "Autodromo Nazionale Monza", "LMP2 WEC", 101.2, 70, LMP2],
  ["Fuji Speedway", "Fuji Speedway", "GT3", 99.8, 110, GT3],
  ["Fuji Speedway", "Fuji Speedway", "LMP2 WEC", 91.9, 40, LMP2],
  ["Fuji Speedway", "Fuji Speedway Classic", "GT3", 97.1, 25, GT3],
  ["Bahrain International Circuit", "Bahrain International Circuit", "GT3", 118.7, 130, GT3],
  ["Bahrain International Circuit", "Bahrain International Circuit", "Hyper", 108.4, 90, HYPER],
  ["Algarve International Circuit", "Algarve International Circuit", "GT3", 102.9, 95, GT3],
  ["Algarve International Circuit", "Algarve International Circuit", "LMP2 WEC", 96.4, 45, LMP2],
  ["Autodromo Enzo e Dino Ferrari", "Autodromo Enzo e Dino Ferrari", "GT3", 102.6, 85, GT3],
  ["Circuit de Barcelona", "Circuit de Barcelona", "GT3", 104.2, 60, GT3],
  ["Sebring International Raceway", "Sebring International Raceway", "GT3", 121.3, 150, GT3],
  ["Sebring International Raceway", "Sebring International Raceway", "LMP2 WEC", 111.8, 55, LMP2],
  ["Sebring International Raceway", "Sebring School Circuit", "GT3", 66.2, 20, GT3],
  ["Circuit of the Americas", "Circuit of the Americas", "Hyper", 132.6, 80, HYPER],
  ["Circuit of the Americas", "Circuit of the Americas", "LMP3", 146.9, 22, LMP3],
  ["Michelin Raceway Road Atlanta", "Michelin Raceway Road Atlanta", "GT3", 77.84, 160, GT3],
  ["Michelin Raceway Road Atlanta", "Michelin Raceway Road Atlanta", "Hyper", 68.6, 100, HYPER],
  ["Grand Prix of Long Beach", "Grand Prix of Long Beach", "Hyper", 70.39, 120, HYPER],
  ["Grand Prix of Long Beach", "Grand Prix of Long Beach", "GT3", 78.12, 60, GT3],
  ["WeatherTech Raceway Laguna Seca", "WeatherTech Raceway Laguna Seca", "LMP2 WEC", 73.95, 70, LMP2],
  ["Daytona International Speedway", "Daytona International Speedway Road Course", "Hyper", 92.02, 65, HYPER],
];

const FIRST = ["Théo", "Jonas", "Álvaro", "Kenji", "Luca", "Sam", "Élise", "Hugo", "Mateo", "Nina", "Oscar", "Lena",
  "Yuki", "Rafael", "Clara", "Finn", "Marco", "Inès", "Tomás", "Aiko", "Lars", "Chloé", "Diego", "Mia"];
const LAST = ["Marchal", "Weber", "Ruiz", "Morita", "Bianchi", "Carter", "Garnier", "Lefèvre", "Sanz", "Okafor",
  "Lindqvist", "Novak", "Dubois", "Rossi", "Keller", "Moreau", "Schmidt", "Costa", "Tanaka", "Van Dijk"];

/** Générateur déterministe (mêmes données à chaque exécution). */
function rng(seed: number) {
  let s = seed;
  const next = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next());
  const pick = <T>(a: T[]) => a[Math.floor(next() * a.length)];
  return { next, gauss, pick };
}

export async function seedDemo(db: Db, drivers = 900): Promise<{ drivers: number; sessions: number; rejected: number }> {
  const r = rng(20260927);
  // Pilotes : un nom, un niveau (constant d'un circuit à l'autre), anonyme ou non.
  const pool = Array.from({ length: drivers }, (_, i) => ({
    name: `${r.pick(FIRST)} ${r.pick(LAST)}${r.next() < 0.3 ? ` ${i % 97}` : ""}`,
    skill: Math.exp(0.42 * r.gauss()),
    anonymous: r.next() < 0.12,
    install: null as Install | null,
    accepted: 0,
  }));

  type Row = { d: (typeof pool)[number]; combo: Combo; time: number };
  const rows: Row[] = [];
  for (const combo of COMBOS) {
    const used = new Set<number>();
    for (let i = 0; i < Math.min(combo[4], drivers); i++) {
      let k = Math.floor(r.next() * drivers);
      while (used.has(k)) k = (k + 1) % drivers;
      used.add(k);
      const d = pool[k];
      const time = combo[3] * (1 + 0.012 + 0.03 * d.skill + 0.004 * Math.abs(r.gauss()));
      rows.push({ d, combo, time });
    }
  }

  let sessions = 0;
  let rejected = 0;
  for (const combo of COMBOS) {
    const list = rows.filter((x) => x.combo === combo).sort((a, b) => a.time - b.time);
    for (const { d, time } of list) {
      if (!d.install) {
        const reg = await registerInstall(db);
        d.install = { id: reg.install_id, tag: reg.tag, anonymous: false, display_name: null, homonym: false, hidden: false };
      }
      const t = +time.toFixed(3);
      const s1 = +(t * 0.3165).toFixed(3);
      const s2 = +(t * 0.396).toFixed(3);
      const s3 = +(t - s1 - s2).toFixed(3);
      const roll = r.next();
      const res = await ingestSessions(db, d.install, [
        {
          schema: 1,
          session_key: createHash("sha256").update(randomBytes(16)).digest("hex"),
          app_version: DEMO_VERSION,
          game_version: roll < 0.6 ? "1.4200" : roll < 0.8 ? "1.4100" : "1.3000",
          played_on: `2026-09-${String(1 + Math.floor(r.next() * 25)).padStart(2, "0")}`,
          session_type: r.pick(["Race", "Race", "Qualify", "Practice1"]),
          setting: r.next() < 0.7 ? "Multiplayer" : "Offline",
          track: combo[0],
          track_course: combo[1],
          car_class: combo[2],
          car_model: r.pick(combo[5]),
          driver_name: d.name,
          aids: { raw: "PlayerControl,TC=2", tc: 2, brake_help: r.next() < 0.08, steer_help: false, auto_shift: false },
          best_lap: { time: t, s1, s2, s3, lap_num: 5, top_speed: 260, fuel: 0.4, compound_f: "Medium", compound_r: "Medium" },
          best_sectors: { s1, s2, s3 },
          valid_laps: 6 + Math.floor(r.next() * 20),
          median_lap: +(t * 1.012).toFixed(3),
          wet: r.next() < 0.04,
          has_telemetry: false,
        },
      ], { ...DEFAULT_INGEST, dailyQuota: 10_000 });
      sessions += res.accepted;
      d.accepted += res.accepted;
      rejected += res.rejected.length;
    }
  }
  for (const d of pool) {
    if (!d.install) continue;
    // Aucune session acceptée : pas d'inscription vide laissée derrière.
    if (d.accepted === 0) await db.query("delete from installs where id = $1", [d.install.id]);
    else if (d.anonymous) await db.query("update installs set anonymous = true where id = $1", [d.install.id]);
  }
  return { drivers: pool.filter((d) => d.install && d.accepted > 0).length, sessions, rejected };
}

/** Installations de démonstration : TOUTES leurs sessions portent le marqueur. */
const DEMO_INSTALLS = `
  select install_id from sessions group by install_id
  having bool_and(app_version = '${DEMO_VERSION}')`;

export async function purgeDemo(db: Db, apply: boolean): Promise<{ installs: number; sessions: number; deleted: boolean }> {
  const [{ installs, sessions }] = await db.query<{ installs: number; sessions: number }>(
    `select (select count(*)::int from (${DEMO_INSTALLS}) d) as installs,
            (select count(*)::int from sessions where install_id in (${DEMO_INSTALLS})) as sessions`,
  );
  if (apply && installs > 0) await db.query(`delete from installs where id in (${DEMO_INSTALLS})`);
  return { installs, sessions, deleted: apply && installs > 0 };
}
