#!/usr/bin/env node
// Vérification de bout en bout d'un service déployé, SANS laisser de données :
// crée une installation de test, rejoue les scénarios clés (envoi, coupure, renvoi),
// puis efface l'installation (DELETE /me).
//
//   node scripts/smoke.mjs https://lmu.cparfait.ovh
//   node scripts/smoke.mjs http://127.0.0.1:3080        (test local)
import { createHash, randomBytes } from "node:crypto";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3080").replace(/\/$/, "") + "/api/v1";
let failures = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
};
const digest = (s) => `sha-256=:${createHash("sha256").update(s).digest("base64")}:`;

function session() {
  const time = 81.48, s1 = 25.788, s2 = 32.266, s3 = 23.426;
  return {
    schema: 1,
    session_key: createHash("sha256").update(randomBytes(16)).digest("hex"),
    app_version: "0.0.0-smoke",
    game_version: "1.4200",
    played_on: new Date().toISOString().slice(0, 10),
    session_type: "Practice1",
    setting: "Race Weekend",
    // Combo fictif : n'apparaît dans aucun classement réel.
    track: "Smoke Test Circuit",
    track_course: "Smoke Test Circuit",
    car_class: "GT3",
    car_model: "Smoke Test Car",
    driver_name: "Smoke Test",
    aids: { raw: "", tc: null, brake_help: false, steer_help: false, auto_shift: false },
    best_lap: { time, s1, s2, s3, lap_num: 3, top_speed: 250, fuel: 0.5, compound_f: "Medium", compound_r: "Medium" },
    best_sectors: { s1, s2, s3 },
    valid_laps: 5,
    median_lap: 82.1,
    wet: false,
    has_telemetry: false,
  };
}

async function post(path, token, bodyObj, digestOverride) {
  const body = JSON.stringify(bodyObj);
  return fetch(BASE + path, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "content-digest": digestOverride ?? digest(body) },
    body,
  });
}

const health = await fetch(BASE + "/health").catch((e) => ({ status: 0, error: e }));
check(health.status === 200, "santé du service", `HTTP ${health.status}`);
if (health.status !== 200) process.exit(1);

const reg = await fetch(BASE + "/register", { method: "POST" });
check(reg.status === 201, "création d'une installation de test", `HTTP ${reg.status}`);
const { token } = await reg.json();

try {
  const s = session();
  const r1 = await (await post("/sessions", token, { sessions: [s] })).json();
  check(r1.accepted === 1 && r1.received?.[0] === s.session_key, "envoi + accusé de réception");

  const r2 = await (await post("/sessions", token, { sessions: [s] })).json();
  check(r2.duplicates === 1 && r2.received?.[0] === s.session_key, "renvoi après coupure : confirmé sans doublon");

  const trunc = await post("/sessions", token, { sessions: [session()] }, digest("autre contenu"));
  check(trunc.status === 400, "envoi altéré/tronqué refusé", `HTTP ${trunc.status}`);

  const nodigest = await post("/sessions", token, { sessions: [session()] }, "");
  check(nodigest.status === 400, "envoi sans empreinte refusé", `HTTP ${nodigest.status}`);

  const q = "track=Smoke%20Test%20Circuit&course=Smoke%20Test%20Circuit&class=GT3";
  const d = await (await fetch(`${BASE}/combos/detail?${q}`)).json();
  check(d.drivers === 1, "agrégat du combo de test", `pilotes=${d.drivers}`);

  const me = await (await fetch(BASE + "/me", { headers: { authorization: `Bearer ${token}` } })).json();
  check(me.sessions?.length === 1, "export des données (droit d'accès)");
} finally {
  const del = await fetch(BASE + "/me", { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
  check(del.status === 204, "effacement de l'installation de test", `HTTP ${del.status}`);
  const after = await fetch(BASE + "/me", { headers: { authorization: `Bearer ${token}` } });
  check(after.status === 401, "jeton invalide après effacement");
}

console.log(failures === 0 ? "\nTOUT EST OK" : `\n${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
