#!/usr/bin/env node
// Données de DÉMONSTRATION pour voir le site peuplé — UNIQUEMENT en local.
// Refuse toute autre adresse que 127.0.0.1 / localhost (jamais en production).
//   node scripts/seed-local.mjs http://127.0.0.1:3080
import { createHash, randomBytes } from "node:crypto";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3080").replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error("Refusé : seed-local ne s'utilise qu'en local.");
  process.exit(1);
}
const API = BASE + "/api/v1";
const digest = (s) => `sha-256=:${createHash("sha256").update(s).digest("base64")}:`;
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());

const COMBOS = [
  ["Michelin Raceway Road Atlanta", "Michelin Raceway Road Atlanta", "GT3", 77.84, 212, ["Ferrari 296 LMGT3", "BMW M4 LMGT3", "Porsche 911 GT3 R LMGT3", "Chevrolet Corvette Z06 LMGT3.R", "Lexus RC F LMGT3", "Aston Martin Vantage AMR LMGT3 Evo"]],
  ["Michelin Raceway Road Atlanta", "Michelin Raceway Road Atlanta", "Hyper", 68.6, 118, ["Cadillac V-Series.R", "Ferrari 499P", "Porsche 963", "Toyota GR010 Hybrid"]],
  ["Grand Prix of Long Beach", "Grand Prix of Long Beach", "Hyper", 70.39, 167, ["Ferrari 499P", "Porsche 963", "Cadillac V-Series.R"]],
  ["Grand Prix of Long Beach", "Grand Prix of Long Beach", "GT3", 78.12, 64, ["Chevrolet Corvette Z06 LMGT3.R", "BMW M4 LMGT3"]],
  ["WeatherTech Raceway Laguna Seca", "WeatherTech Raceway Laguna Seca", "LMP2 WEC", 73.95, 98, ["Oreca 07"]],
  ["Daytona International Speedway", "Daytona International Speedway Road Course", "Hyper", 92.02, 76, ["Toyota GR010 Hybrid", "Porsche 963"]],
  ["Circuit of the Americas", "Circuit of the Americas", "LMP3", 108.9, 14, ["Ligier JS P325", "Duqueine D09"]],
  ["Circuit de Spa-Francorchamps", "Circuit de Spa-Francorchamps", "GT3", 137.2, 240, ["BMW M4 LMGT3", "Ferrari 296 LMGT3", "McLaren 720S LMGT3 Evo", "Ford Mustang LMGT3"]],
];
const FIRST = ["Théo", "Jonas", "Álvaro", "Kenji", "Luca", "Sam", "Élise", "Hugo", "Mateo", "Nina", "Oscar", "Lena", "Yuki", "Rafael", "Clara", "Finn"];
const LAST = ["Marchal", "Weber", "Ruiz", "Morita", "Bianchi", "Carter", "Garnier", "Lefèvre", "Sanz", "Okafor", "Lindqvist", "Novak", "Dubois", "Rossi", "Keller", "Moreau"];

let total = 0;
for (const [track, course, cls, best, n, cars] of COMBOS) {
  for (let i = 0; i < n; i++) {
    // Une IP simulée par pilote (sinon le limiteur de débit coupe à 240 envois/heure).
    const ip = `10.9.${Math.floor(total / 200)}.${total % 200}`;
    const reg = await (await fetch(API + "/register", { method: "POST", headers: { "x-real-ip": ip } })).json();
    const time = i === 0 ? best : best + 0.1 + Math.exp(Math.log(best * 0.045) + 0.42 * gauss());
    const s1 = +(time * 0.3165).toFixed(3), s2 = +(time * 0.396).toFixed(3), s3 = +(time - s1 - s2).toFixed(3);
    const session = {
      schema: 1, session_key: createHash("sha256").update(randomBytes(16)).digest("hex"), app_version: "1.0.7",
      game_version: rnd() < 0.85 ? "1.4200" : "1.4100", played_on: `2026-09-${String(10 + Math.floor(rnd() * 15)).padStart(2, "0")}`,
      session_type: "Race", setting: "Multiplayer", track, track_course: course, car_class: cls,
      car_model: cars[Math.floor(rnd() * cars.length)],
      driver_name: `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}${rnd() < 0.3 ? " " + Math.floor(rnd() * 99) : ""}`,
      aids: { raw: "PlayerControl,TC=2", tc: 2, brake_help: false, steer_help: false, auto_shift: false },
      best_lap: { time: +time.toFixed(3), s1, s2, s3, lap_num: 5, top_speed: 260, fuel: 0.4, compound_f: "Medium", compound_r: "Medium" },
      best_sectors: { s1, s2, s3 }, valid_laps: 12, median_lap: +(time + 1).toFixed(3), wet: false, has_telemetry: false,
    };
    const body = JSON.stringify({ sessions: [session] });
    await fetch(API + "/sessions", { method: "POST", headers: { authorization: `Bearer ${reg.token}`, "content-type": "application/json", "content-digest": digest(body), "x-real-ip": ip }, body });
    if (rnd() < 0.12) await fetch(API + "/me", { method: "PATCH", headers: { authorization: `Bearer ${reg.token}`, "content-type": "application/json" }, body: JSON.stringify({ anonymous: true }) });
    total++;
  }
}
console.log(`${total} pilotes de démonstration créés`);
