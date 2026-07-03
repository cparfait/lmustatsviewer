/**
 * Verdicts **déterministes** pour le Coach IA (Axe 2).
 *
 * Le LLM lit mal les tableaux de 4 valeurs par roue et est mauvais en
 * arithmétique. On pré-calcule donc en code des constats fiables et
 * **indépendants de la voiture** (déséquilibres relatifs), que le modèle n'a
 * plus qu'à **formuler**. Même principe que le « STRATEGY COMPUTER » du
 * carburant : le contexte indique au modèle de faire confiance à ces lignes.
 *
 * Roues : index 0=FL, 1=FR, 2=RL, 3=RR. `temp3` = bord gauche / centre / bord
 * droit de la bande de roulement (→ indice de gonflage).
 */

import type { LiveData } from "@/lib/api";

const W = ["FL", "FR", "RL", "RR"];

export function buildTyreInsights(data: LiveData): string {
  const tel = data.telemetry;
  if (!tel || !tel.wheels) return "";
  const wheels = tel.wheels;
  const temps = wheels.map((x) => x.temp);
  if (temps.every((t) => t <= 0)) return ""; // pas encore de données pneus

  const lines: string[] = [];
  lines.push(
    "## Computed tyre/brake insights (deterministic — trust these, do not re-derive)",
  );

  // 1) Balance de température (carcasse)
  const avg = temps.reduce((a, b) => a + b, 0) / 4;
  const frontAvg = (temps[0] + temps[1]) / 2;
  const rearAvg = (temps[2] + temps[3]) / 2;
  const leftAvg = (temps[0] + temps[2]) / 2;
  const rightAvg = (temps[1] + temps[3]) / 2;
  const hottest = temps.indexOf(Math.max(...temps));
  const coldest = temps.indexOf(Math.min(...temps));
  const spread = temps[hottest] - temps[coldest];
  lines.push(
    `Carcass temps °C: FL ${temps[0].toFixed(0)} · FR ${temps[1].toFixed(0)} · RL ${temps[2].toFixed(0)} · RR ${temps[3].toFixed(0)} (avg ${avg.toFixed(0)})`,
  );
  const bal: string[] = [];
  if (Math.abs(frontAvg - rearAvg) >= 10)
    bal.push(
      frontAvg > rearAvg
        ? "front axle hotter (front working harder, understeer tendency)"
        : "rear axle hotter (rear working harder, oversteer tendency)",
    );
  if (Math.abs(leftAvg - rightAvg) >= 10)
    bal.push(leftAvg > rightAvg ? "left side hotter" : "right side hotter");
  if (spread >= 12)
    bal.push(
      `hottest ${W[hottest]} (+${(temps[hottest] - avg).toFixed(0)} vs avg), coldest ${W[coldest]}`,
    );
  lines.push(
    bal.length ? `Temp balance: ${bal.join("; ")}.` : "Temp balance: even.",
  );

  // 2) Gonflage déduit du profil de bande (centre vs bords)
  const infl: string[] = [];
  for (let i = 0; i < 4; i++) {
    const [l, c, r] = wheels[i].temp3;
    if (l <= 0 || c <= 0 || r <= 0) continue;
    const edges = (l + r) / 2;
    if (c - edges >= 8) infl.push(`${W[i]} over-inflated (centre hotter)`);
    else if (edges - c >= 8) infl.push(`${W[i]} under-inflated (edges hotter)`);
  }
  if (infl.length) lines.push(`Pressure (tread profile): ${infl.join("; ")}.`);

  // 3) Usure (gomme restante %)
  const wears = wheels.map((x) => x.wear);
  if (wears.some((x) => x > 0)) {
    const minW = Math.min(...wears);
    const maxW = Math.max(...wears);
    const mostWorn = wears.indexOf(minW);
    lines.push(
      `Rubber remaining %: FL ${wears[0].toFixed(0)} · FR ${wears[1].toFixed(0)} · RL ${wears[2].toFixed(0)} · RR ${wears[3].toFixed(0)}` +
        (maxW - minW >= 10 ? ` → most worn ${W[mostWorn]}.` : "."),
    );
  }

  // 4) Balance de freins avant/arrière (si températures significatives)
  const bt = wheels.map((x) => x.brake_temp);
  if (bt.every((x) => x > 0)) {
    const fAvg = (bt[0] + bt[1]) / 2;
    const rAvg = (bt[2] + bt[3]) / 2;
    if (Math.abs(fAvg - rAvg) >= 80)
      lines.push(
        `Brake temps: ${fAvg > rAvg ? "front" : "rear"} hotter (F ${fAvg.toFixed(0)}°C / R ${rAvg.toFixed(0)}°C).`,
      );
  }

  return lines.join("\n");
}
