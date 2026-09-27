// Maquettes « Classements » — comportements + données FICTIVES.
/* global TRACKS */

// ── Thème (même attribut que la vitrine : html[data-theme]) ──────────────
(function theme() {
  const saved = localStorage.getItem("mock-theme");
  if (saved) document.documentElement.dataset.theme = saved;
  const btn = document.getElementById("themeBtn");
  if (btn) btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("mock-theme", next);
  });
})();

// ── Tracés ──────────────────────────────────────────────────────────────
const NS = "http://www.w3.org/2000/svg";
function parsePath(d) {
  return d.replace(/[MLZ]/g, " ").trim().split(/\s+/).reduce((acc, v, i, a) => {
    if (i % 2 === 0) acc.push([+v, +a[i + 1]]);
    return acc;
  }, []);
}
function drawTrack(el, key, { sf = true, pad = 0 } = {}) {
  const d = TRACKS[key];
  if (!d) return null;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `${-pad} ${-pad} ${200 + 2 * pad} ${200 + 2 * pad}`);
  svg.innerHTML = `<path class="track-glow" d="${d}"/><path class="track-line" d="${d}"/>`;
  if (sf) {
    const [x, y] = parsePath(d)[0];
    svg.innerHTML += `<circle class="track-sf" cx="${x}" cy="${y}" r="5"/>`;
  }
  el.appendChild(svg);
  return svg;
}
document.querySelectorAll("[data-track]").forEach((el) => drawTrack(el, el.dataset.track, { pad: +(el.dataset.pad || 0) }));

// ── Générateur pseudo-aléatoire déterministe ───────────────────────────
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()); }
const fmt = (s) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(3).padStart(6, "0")}`;
};
const parseTime = (txt) => {
  const t = txt.trim().replace(",", ".");
  const m = t.match(/^(\d+):(\d{1,2}(?:\.\d{1,3})?)$/);
  if (m) return +m[1] * 60 + +m[2];
  const s = +t;
  return Number.isFinite(s) && s > 0 ? s : null;
};

// ── Page combo : Road Atlanta · GT3 ────────────────────────────────────
const combo = document.getElementById("combo");
if (combo) {
  const r = rng(42);
  const BEST = 77.842;
  const ALIEN = 78.35; // référence ohne_speed (rythme alien GT3 Road Atlanta)
  const N = 212;
  const times = [BEST];
  while (times.length < N) {
    const off = Math.exp(Math.log(3.6) + 0.42 * gauss(r));
    const t = BEST + 0.12 + off;
    if (t < 92) times.push(t);
  }
  times.sort((a, b) => a - b);
  const q = (p) => times[Math.min(N - 1, Math.floor(p * (N - 1)))];

  // KPIs
  document.getElementById("k-n").textContent = N;
  document.getElementById("k-best").textContent = fmt(BEST);
  document.getElementById("k-med").textContent = fmt(q(0.5));
  document.getElementById("k-p10").textContent = "< " + fmt(q(0.1));

  // Histogramme
  const W = 720, H = 240, L = 34, R = 12, T = 22, B = 30;
  const lo = 77.5, hi = 90, bw = 0.5;
  const bins = [];
  for (let x = lo; x < hi; x += bw) bins.push({ x, n: times.filter((t) => t >= x && t < x + bw).length });
  const maxN = Math.max(...bins.map((b) => b.n));
  const sx = (t) => L + ((t - lo) / (hi - lo)) * (W - L - R);
  const sy = (n) => H - B - (n / maxN) * (H - B - T);
  const svg = document.getElementById("histo");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  let html = "";
  bins.forEach((b, i) => {
    const x = sx(b.x) + 1.5, w = sx(b.x + bw) - sx(b.x) - 3;
    html += `<rect class="bar" data-i="${i}" x="${x}" y="${sy(b.n)}" width="${w}" height="${H - B - sy(b.n)}" rx="3"/>`;
  });
  for (let t = 78; t <= 90; t += 2) html += `<text class="axis" x="${sx(t)}" y="${H - 10}" text-anchor="middle">${fmt(t).slice(0, 4)}</text>`;
  [["p10", 0.1], ["médiane", 0.5], ["p90", 0.9]].forEach(([l, p]) => {
    const x = sx(q(p));
    html += `<line class="mark" x1="${x}" x2="${x}" y1="${T - 6}" y2="${H - B}"/><text class="mark-l" x="${x + 4}" y="${T + 2}">${l}</text>`;
  });
  html += `<g id="youMark"></g>`;
  svg.innerHTML = html;

  // Calculateur « où se situe mon temps »
  const input = document.getElementById("myTime");
  const tiers = [
    [101, "Alien", "#FF4A0F"], [102, "Compétitif", "#f97316"], [104, "Bon", "#00c896"],
    [106, "Milieu de peloton", "#4FA1FF"], [107, "Fond de grille", "#94a3b8"], [999, "Hors rythme", "#94a3b8"],
  ];
  const update = () => {
    const t = parseTime(input.value);
    const res = document.getElementById("calcRes");
    svg.querySelectorAll(".bar.lit").forEach((b) => b.classList.remove("lit"));
    document.getElementById("youMark").innerHTML = "";
    if (!t) { res.style.opacity = .35; return; }
    res.style.opacity = 1;
    const ahead = times.filter((x) => x < t).length;
    const top = Math.max(1, Math.round(((ahead + 1) / N) * 100));
    const pct = (t / ALIEN) * 100;
    const [, tier, col] = tiers.find(([lim]) => Math.round(pct * 10) / 10 < lim);
    document.getElementById("c-top").innerHTML = `Top ${top} % <small>sur ${N} pilotes</small>`;
    document.getElementById("c-rank").textContent = `${ahead + 1}ᵉ / ${N}`;
    document.getElementById("c-gap").textContent = `+${(t - BEST).toFixed(3)} s`;
    document.getElementById("c-med").textContent = `${t <= q(0.5) ? "−" : "+"}${Math.abs(t - q(0.5)).toFixed(3)} s`;
    const tierEl = document.getElementById("c-tier");
    tierEl.textContent = `${tier} · ${pct.toFixed(1)} %`;
    tierEl.style.color = col;
    tierEl.style.background = col + "22";
    const i = Math.floor((t - lo) / bw);
    svg.querySelector(`.bar[data-i="${i}"]`)?.classList.add("lit");
    if (t > lo && t < hi) {
      const x = sx(t);
      document.getElementById("youMark").innerHTML = `<line class="you" x1="${x}" x2="${x}" y1="${T + 10}" y2="${H - B}"/><text class="you-l" x="${x}" y="${T + 6}" text-anchor="middle">VOUS</text>`;
    }
  };
  input.addEventListener("input", update);
  update();

  // Classement (noms affichés par défaut, anonymat au choix)
  const CARS = {
    ferrari: ["Ferrari 296 LMGT3", "ferrari-296-lmgt3.png"],
    porsche: ["Porsche 911 GT3 R LMGT3", "porsche-911-gt3-r-lmgt3.png"],
    bmw: ["BMW M4 LMGT3", "bmw-m4-lmgt3.png"],
    corvette: ["Corvette Z06 LMGT3.R", "chevrolet-corvette-z06-lmgt3-r.png"],
    aston: ["Aston Martin Vantage AMR LMGT3", "aston-martin-vantage-amr-lmgt3-evo.png"],
    lexus: ["Lexus RC F LMGT3", "lexus-rc-f-lmgt3.png"],
    mclaren: ["McLaren 720S LMGT3 Evo", "mclaren-720s-lmgt3-evo.png"],
    mustang: ["Ford Mustang LMGT3", "ford-mustang-lmgt3.png"],
    lambo: ["Lamborghini Huracán LMGT3 Evo2", "lamborghini-huracan-lmgt3-evo-2.png"],
    merc: ["Mercedes-AMG LMGT3", "mercedes-amg-lmgt3.png"],
  };
  const img = (k) => `../../public/cars/${CARS[k][1]}`;
  const podium = [
    ["M. Lindqvist", "ferrari"], ["Théo Marchal", "bmw"], [null, "porsche"], ["Jonas Weber", "corvette"],
    ["Álvaro Ruiz", "ferrari"], ["Kenji Morita", "lexus"], ["Luca Bianchi", "aston"], [null, "mclaren"],
    ["Sam Carter", "bmw"], ["Élise Garnier", "mustang"],
  ];
  const anonIds = ["#a3f9", "#7c21"];
  let a = 0;
  const rows = podium.map(([name, car], i) => {
    const t = times[i];
    const s1 = t * (0.3165 + (r() - 0.5) * 0.004);
    const s2 = t * (0.3960 + (r() - 0.5) * 0.004);
    return { name: name ?? `Pilote ${anonIds[a++]}`, anon: !name, car, t, s: [s1, s2, t - s1 - s2], v: i === 6 ? "1.41" : "1.42", d: ["hier", "il y a 2 h", "23/09", "il y a 5 h", "24/09", "hier", "22/09", "il y a 1 h", "24/09", "23/09"][i] };
  });
  const bestS = [0, 1, 2].map((k) => Math.min(...rows.map((x) => x.s[k])));
  document.getElementById("lbBody").innerHTML = rows.map((x, i) => `
    <tr>
      <td class="pos">${i < 3 ? `<span class="medal m${i + 1}">${i + 1}</span>` : i + 1}</td>
      <td class="${x.anon ? "anon" : "drv"}">${x.name}</td>
      <td><div class="car"><img src="${img(x.car)}" alt=""><span>${CARS[x.car][0]}</span></div></td>
      <td class="t">${fmt(x.t)}</td>
      <td class="gap">${i === 0 ? "—" : "+" + (x.t - rows[0].t).toFixed(3)}</td>
      ${x.s.map((s, k) => `<td class="sec ${s === bestS[k] ? "pb" : ""}">${s.toFixed(3)}</td>`).join("")}
      <td><span class="ver">${x.v}</span></td>
      <td class="muted">${x.d}</td>
    </tr>`).join("");

  // Répartition par voiture
  const carStats = [
    ["ferrari", 77.842, 80.9, 41], ["bmw", 77.960, 81.2, 37], ["porsche", 78.012, 81.1, 33],
    ["corvette", 78.105, 81.5, 24], ["lexus", 78.240, 81.8, 18], ["aston", 78.301, 81.6, 21],
    ["mclaren", 78.388, 82.0, 15], ["mustang", 78.520, 82.3, 12], ["lambo", 78.610, 82.1, 7], ["merc", 78.702, 82.6, 4],
  ];
  const cx = (t) => ((t - 77.5) / (84 - 77.5)) * 100;
  document.getElementById("cars").innerHTML = carStats.map(([k, b, m, n]) => `
    <div class="car-row">
      <img src="${img(k)}" alt="">
      <span>${CARS[k][0]}</span>
      <div class="track"><div class="range" style="left:${cx(b)}%;width:${cx(m) - cx(b)}%"></div><div class="med" style="left:${cx(m)}%"></div></div>
      <span class="mono" style="text-align:right">${fmt(b)}<br><span class="n">${n} pilotes</span></span>
    </div>`).join("");

  // Évolution par version (effet BoP)
  const vs = [["1.40", 82.45, 78.31], ["1.41", 82.02, 78.10], ["1.42", q(0.5), BEST]];
  const vsvg = document.getElementById("versions");
  const VW = 360, VH = 150;
  const vx = (i) => 40 + i * ((VW - 70) / 2);
  const vy = (t) => 20 + ((t - 77.5) / (83 - 77.5)) * (VH - 50);
  vsvg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
  const line = (k) => vs.map((v, i) => `${i ? "L" : "M"}${vx(i)} ${vy(v[k])}`).join(" ");
  vsvg.innerHTML =
    `<path class="ln" d="${line(1)}"/><path class="ln" style="stroke:var(--purple-best)" d="${line(2)}"/>` +
    vs.map((v, i) => `<circle class="pt" cx="${vx(i)}" cy="${vy(v[1])}" r="4"/><circle cx="${vx(i)}" cy="${vy(v[2])}" r="4" fill="var(--purple-best)"/>` +
      `<text class="lbl" x="${vx(i)}" y="${VH - 8}" text-anchor="middle">v${v[0]}</text>`).join("") +
    `<text class="lbl" x="${vx(2) + 8}" y="${vy(vs[2][1]) + 4}">médiane</text><text class="lbl" x="${vx(2) + 8}" y="${vy(vs[2][2]) + 4}">meilleur</text>`;

  // Étape 2 (aperçu) : zones de freinage déduites de la géométrie du tracé
  const soon = document.getElementById("brakeMap");
  if (soon) {
    const s = drawTrack(soon, "roadAtlanta", { pad: 6 });
    const pts = parsePath(TRACKS.roadAtlanta);
    const n = pts.length;
    const turn = pts.map((p, i) => {
      const a0 = pts[(i - 4 + n) % n], a1 = pts[(i + 4) % n];
      const v1 = [p[0] - a0[0], p[1] - a0[1]], v2 = [a1[0] - p[0], a1[1] - p[1]];
      const ang = Math.abs(Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1]));
      return { i, ang };
    }).sort((x, y) => y.ang - x.ang);
    const picked = [];
    for (const c of turn) {
      if (picked.every((p) => Math.min(Math.abs(p - c.i), n - Math.abs(p - c.i)) > 12)) picked.push(c.i);
      if (picked.length === 7) break;
    }
    const cols = ["#f87171", "#60a5fa", "#4ade80"];
    picked.forEach((i) => cols.forEach((c, k) => {
      const [x, y] = pts[(i - 3 - k * 2 + n) % n];
      s.innerHTML += `<circle class="brake-dot" cx="${x}" cy="${y}" r="4.2" fill="${c}"/>`;
    }));
  }
}

// ── Écran app : aperçu du nom affiché / anonymat ───────────────────────
const nameInput = document.getElementById("pubName");
if (nameInput) {
  const anon = document.getElementById("anonSw");
  const out = document.getElementById("asName");
  const refresh = () => {
    const isAnon = anon.classList.contains("on");
    nameInput.style.opacity = isAnon ? .35 : 1;
    nameInput.style.textDecoration = isAnon ? "line-through" : "none";
    out.innerHTML = isAnon ? "<b>Pilote #a3f9</b> (anonyme)" : `<b>${nameInput.textContent}</b>`;
  };
  anon.addEventListener("click", () => { anon.classList.toggle("on"); refresh(); });
  document.querySelectorAll(".switch[data-toggle]").forEach((s) => s.addEventListener("click", () => s.classList.toggle("on")));
  refresh();
  const veil = document.getElementById("veil");
  document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => { veil.hidden = false; }));
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => { veil.hidden = true; }));
}
