// Page combo circuit × classe : répartition, position d'un temps, classement, par voiture.
/* global driverMarks, driversWord, classKey, getMe, setMe, standing, t, esc, api, fmtTime, fmtNum, fmtDate, flagImg, carImg, classBadge, trackSvg, chrome, dataReady, driverName, filterBar, bindFilterBar */
"use strict";

const RANKED_MIN = 20;
const PAGE = 50;
const params = new URLSearchParams(location.search);
const q = {
  track: params.get("track") || "",
  course: params.get("course") || params.get("track") || "",
  class: params.get("class") || "",
  version: params.get("version") || "",
  aids: params.get("aids") || "",
  conditions: params.get("conditions") || "",
  car: params.get("car") || "",
  session: params.get("session") || "",
  mode: params.get("mode") || "",
};
const $ = (id) => document.getElementById(id);
const pageUrl = (over) => `/combo.html?${new URLSearchParams(Object.entries({ ...q, ...over }).filter(([, v]) => v))}`;
const parseTime = (txt) => {
  const s = txt.trim().replace(",", ".");
  const m = s.match(/^(\d+):(\d{1,2}(?:\.\d{1,3})?)$/);
  if (m) return +m[1] * 60 + +m[2];
  const n = +s;
  return Number.isFinite(n) && n > 20 ? n : null;
};

chrome();
// Squelettes de chargement retirés dès que les données (ou l'erreur) arrivent.
const unskel = () => document.querySelectorAll("#combo .skeleton").forEach((e) => e.classList.remove("skeleton"));

(async () => {
  let detail, combos;
  try {
    [detail, { combos }] = await Promise.all([api("combos/detail", q), api("combos"), dataReady]);
  } catch {
    $("notice").innerHTML = `<p class="notice">${esc(t("offline"))}</p>`;
    unskel();
    $("lbBody").innerHTML = "";
    return;
  }
  unskel();
  document.title = `${q.course} · ${q.class || t("f.allClasses")} — LMU Stats Viewer`;
  $("crumbTrack").textContent = q.course;
  $("crumbClass").textContent = q.class || t("f.allClasses");
  $("title").textContent = q.course;
  // Bandeau : drapeau + circuit, classe ; sous le titre, le circuit quand le tracé diffère.
  $("eyebrow").innerHTML = `${flagImg(q.track)}<span class="cg-name">${esc(q.track)}</span>`;
  // Sans classe : classement général du circuit (une ligne par pilote et par classe).
  $("headClass").innerHTML = q.class ? classBadge(q.class) : `<span class="cls cls-all">${esc(t("f.allClasses"))}</span>`;
  $("subtitle").textContent = q.track !== q.course ? q.track : "";
  if (q.class) document.getElementById("combo").dataset.cls = classKey(q.class);
  $("brakeMap").innerHTML = trackSvg(q.course, 6);

  // Barre de filtres (comme dans l'app). La liste des voitures vient du combo SANS filtre voiture.
  const tracks = [...new Set(combos.map((c) => c.track))].sort();
  const courses = [...new Set(combos.filter((c) => c.track === q.track).map((c) => c.track_course))];
  const classes = combos.filter((c) => c.track === q.track && c.track_course === q.course);
  const base = q.car ? await api("combos/detail", { ...q, car: "" }).catch(() => null) : detail;
  const carOptions = (base?.by_car ?? []).map((c) => c.car_model).sort();
  const allVersions = (base?.versions ?? []).map((v) => v.version);
  // Par défaut : toutes les versions.
  const vSelected = !q.version || q.version === "all" ? "all" : detail?.selected ?? allVersions;
  $("filters").innerHTML = filterBar([
    { key: "track", label: t("f.circuit"), value: q.track, options: tracks.map((x) => [x, x]) },
    { key: "course", label: t("f.layout"), value: q.course, options: courses.map((x) => [x, x]) },
    {
      key: "class",
      label: t("f.class"),
      value: q.class,
      options: [["", t("f.allF")], ...classes.map((c) => [c.car_class, `${c.car_class} · ${c.drivers}`])],
    },
    { key: "car", label: t("f.car"), value: q.car, options: [["", t("f.allF")], ...carOptions.map((x) => [x, x])] },
    { key: "session", label: t("f.session"), value: q.session, options: [["", t("f.allF")], ["race", t("f.race")], ["qualify", t("f.qualify")], ["practice", t("f.practice")]] },
    { key: "mode", label: t("f.mode"), value: q.mode, options: [["", t("f.all")], ["online", t("f.online")], ["offline", t("f.offline")]] },
    {
      key: "version",
      label: t("f.version"),
      multi: {
        all: ["all", t("f.allF")],
        items: (base?.versions ?? []).map((v, i) => [v.version, `v${v.version}${i === 0 ? ` · ${t("latest")}` : ""} · ${fmtNum(v.drivers)}`, `v${v.version}`]),
        selected: vSelected,
      },
    },
    { key: "conditions", label: t("f.conditions"), value: q.conditions, options: [["", t("dry")], ["wet", t("wet")]] },
    { key: "aids", label: t("f.aids"), value: q.aids, options: [["", t("aidsClean")], ["all", t("aidsAll")]] },
  ]);
  bindFilterBar($("filters"), (key, value) => {
    if (key === "version") {
      // Toutes (ou aucune) = défaut, adresse courte ; sinon la liste cochée.
      const all = value === "all" || (Array.isArray(value) && (!value.length || value.length === allVersions.length));
      value = all ? "" : Array.isArray(value) ? value.join(",") : value;
    }
    const over = { [key]: value };
    if (key === "track") {
      // Nouveau circuit : son tracé et sa classe les plus roulés ; voiture et version remises à zéro.
      const best = combos.filter((c) => c.track === value).sort((a, b) => b.drivers - a.drivers)[0];
      Object.assign(over, { course: best?.track_course ?? value, class: q.class ? (best?.car_class ?? q.class) : "", car: "", version: "" });
    }
    if (key === "course") {
      const best = combos.filter((c) => c.track === q.track && c.track_course === value).sort((a, b) => b.drivers - a.drivers)[0];
      Object.assign(over, { class: q.class ? (best?.car_class ?? q.class) : "", car: "", version: "" });
    }
    if (key === "class") Object.assign(over, { car: "", version: "" });
    location.href = pageUrl(over);
  });

  if (!detail) {
    $("notice").innerHTML = `<div class="empty"><b>${esc(t("notFound"))}</b><a href="/">${esc(t("back"))}</a></div>`;
    $("lbBody").innerHTML = "";
    return;
  }
  const version = q.version || "";
  const selected = detail.selected;
  const allSel = selected.length === (detail.versions?.length ?? 0);
  $("meta").innerHTML = `<span>${esc(allSel && selected.length > 1 ? t("versions.all") : selected.map((v) => "v" + v).join(" + "))}</span><span>${fmtNum(detail.drivers)} ${esc(t("drivers"))}</span>`;
  if (!detail.ranked) {
    $("notice").innerHTML = `<p class="notice">${esc(t("provisional", { n: detail.drivers }))}</p>`;
  }

  // Chiffres clés.
  $("k-n").textContent = fmtNum(detail.drivers);
  $("lbCount").textContent = `${fmtNum(detail.drivers)} ${driversWord(detail.drivers)}`;
  $("k-best").textContent = fmtTime(detail.best.time);
  $("k-p10").textContent = "< " + fmtTime(detail.percentiles.p10);
  $("k-med").textContent = fmtTime(detail.percentiles.p50);
  $("k-laps").textContent = fmtNum(detail.valid_laps);
  $("myTime").placeholder = fmtTime(detail.percentiles.p50);

  // Histogramme.
  const { start, width, counts } = detail.histogram;
  const W = 720, H = 260, L = 34, R = 12, T = 34, B = 44;
  const hi = start + counts.length * width;
  const maxN = Math.max(1, ...counts);
  const sx = (x) => L + ((x - start) / (hi - start || 1)) * (W - L - R);
  const sy = (n) => H - B - (n / maxN) * (H - B - T);
  const svg = $("histo");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const bw = (i) => Math.max(1, sx(start + (i + 1) * width) - sx(start + i * width) - 3);
  let h = counts
    .map((n, i) => {
      const a = start + i * width;
      const tip = t("hist.bar", { n, a: fmtTime(a).slice(0, -2), b: fmtTime(a + width).slice(0, -2) });
      return `<rect class="bar" data-i="${i}" x="${sx(a) + 1.5}" y="${sy(n)}" width="${bw(i)}" height="${H - B - sy(n)}" rx="3"><title>${esc(tip)}</title></rect>` +
        (n > 0 && bw(i) >= 14 ? `<text class="count" x="${sx(a) + 1.5 + bw(i) / 2}" y="${sy(n) - 4}" text-anchor="middle">${n}</text>` : "");
    })
    .join("");
  const step = Math.max(1, Math.ceil((hi - start) / 7));
  for (let x = Math.ceil(start); x <= hi; x += step) h += `<text class="axis" x="${sx(x)}" y="${H - 24}" text-anchor="middle">${fmtTime(x).slice(0, -4)}</text>`;
  h += `<text class="dir" x="${L}" y="${H - 6}">${esc(t("hist.fast"))}</text><text class="dir" x="${W - R}" y="${H - 6}" text-anchor="end">${esc(t("hist.slow"))}</text>`;
  h += `<text class="dir" x="${L - 30}" y="${T - 22}">${esc(t("hist.axisY"))}</text>`;
  let lastLabelX = -Infinity;
  for (const [label, p] of [[t("hist.top10"), "p10"], [t("hist.median"), "p50"], [t("hist.p90"), "p90"]]) {
    const v = detail.percentiles[p];
    if (v == null || v > hi) continue;
    h += `<line class="mark" x1="${sx(v)}" x2="${sx(v)}" y1="${T - 12}" y2="${H - B}"/>`;
    // Peu de pilotes : repères confondus → un seul libellé lisible.
    if (sx(v) - lastLabelX < 80) continue;
    h += `<text class="mark-l" x="${sx(v) + 4}" y="${T - 4}">${esc(label)}</text>`;
    lastLabelX = sx(v);
  }
  svg.innerHTML = h + `<g id="youMark"></g>`;

  // Position d'un temps (calculée par le serveur, rang exact).
  let timer = null;
  $("myTime").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const time = parseTime(e.target.value);
      svg.querySelectorAll(".bar.lit").forEach((b) => b.classList.remove("lit"));
      $("youMark").innerHTML = "";
      if (!time) { $("calcRes").style.opacity = .35; return; }
      const pos = await api("combos/position", { ...q, version, time }).catch(() => null);
      if (!pos) return;
      $("calcRes").style.opacity = 1;
      const st = standing(pos.top_pct, pos.rank, pos.drivers);
      $("c-top").innerHTML = `<span class="${st.cls}">${esc(st.label)}</span> <small>${esc(t("calc.of", { n: fmtNum(pos.drivers) }))}</small>`;
      $("c-rank").textContent = `${pos.rank} / ${pos.drivers}`;
      $("c-gap").textContent = `+${pos.gap_best.toFixed(3)} s`;
      $("c-med").textContent = `${pos.gap_median <= 0 ? "−" : "+"}${Math.abs(pos.gap_median).toFixed(3)} s`;
      svg.querySelector(`.bar[data-i="${Math.floor((time - start) / width)}"]`)?.classList.add("lit");
      if (time >= start && time <= hi) {
        $("youMark").innerHTML = `<line class="you" x1="${sx(time)}" x2="${sx(time)}" y1="${T + 10}" y2="${H - B}"/><text class="you-l" x="${sx(time)}" y="${T + 6}" text-anchor="middle">▼</text>`;
      }
    }, 250);
  });

  // Classement paginé, avec recherche d'un pilote (rang réel conservé).
  let offset = 0;
  let nameFilter = "";
  const bestS = [Infinity, Infinity, Infinity];
  const rows = [];
  async function loadMore(reset = false) {
    if (reset) { offset = 0; rows.length = 0; }
    const lb = await api("combos/leaderboard", { ...q, version, limit: PAGE, offset, name: nameFilter }).catch(() => null);
    if (!lb) return;
    $("findInfo").textContent = nameFilter ? (lb.matches ? t("find.matches", { n: lb.matches }) : t("find.none")) : "";
    if (!nameFilter) lb.matches = lb.drivers;
    rows.push(...lb.rows);
    for (const r of rows) ["s1", "s2", "s3"].forEach((k, i) => { if (r[k] != null && r[k] < bestS[i]) bestS[i] = r[k]; });
    offset += lb.rows.length;
    $("lbBody").innerHTML = rows
      .map((r) => `
      <tr class="${me && r.driver.tag === me ? "is-me" : ""}" data-rank="${r.rank}">
        <td class="pos c">${r.rank <= 3 ? `<span class="medal m${r.rank}">${r.rank}</span>` : r.rank}</td>
        <td class="marks">${driverMarks(r.driver)}</td>
        <td class="drv"><button type="button" class="drv-btn" data-tag="${esc(r.driver.tag)}" title="${esc(t("cmp.tip"))}">${driverName(r.driver, false)}</button></td>
        <td><div class="car">${q.class ? "" : classBadge(r.car_class)}<span class="logo-slot">${carImg(r.car_model)}</span><span>${esc(r.car_model)}</span></div></td>
        <td class="t perf sep r">${fmtTime(r.time)}</td>
        <td class="gap perf r">${r.rank === 1 ? "—" : "+" + (r.time - detail.best.time).toFixed(3)}</td>
        ${["s1", "s2", "s3"].map((k, i) => `<td class="sec perf r ${r[k] != null && r[k] === bestS[i] ? "pb" : ""}">${r[k] != null ? r[k].toFixed(3) : "—"}</td>`).join("")}
        <td class="sep c"><span class="ver">${esc(r.game_version)}</span></td>
        <td class="muted r">${esc(fmtDate(r.played_on))}</td>
      </tr>`)
      .join("");
    $("more").hidden = offset >= lb.matches;
  }
  $("more").addEventListener("click", () => loadMore());

  // Comparaison : un clic sur un pseudo ouvre la fenêtre — vous à gauche (sinon le 1er, ou
  // le pilote juste devant si c'est votre nom), le pilote cliqué à droite, chacun modifiable.
  let cmpTags = ["", ""];
  let cmpSeq = 0;
  const plainName = (d) => (d.name ? (d.homonym ? `${d.name} · ${d.tag}` : d.name) : t("anon", { tag: d.tag }));
  const minor = (v) => {
    const [major, frac = ""] = String(v || "").split(".");
    return `${Number(major)}.${frac.padEnd(2, "0").slice(0, 2)}`;
  };
  const f3 = (v) => v.toFixed(3);
  $("lbBody").addEventListener("click", (e) => {
    const b = e.target.closest("button.drv-btn");
    if (!b) return;
    const tag = b.dataset.tag;
    const i = rows.findIndex((r) => r.driver.tag === tag);
    const ref = me && me !== tag ? me : me ? (rows[i - 1] ?? rows[i + 1])?.driver.tag : (rows[0]?.driver.tag !== tag ? rows[0] : rows[1])?.driver.tag;
    cmpTags = [ref || "", tag];
    renderCompare();
  });
  function cmpShell() {
    let el = $("cmpOverlay");
    if (el) return el;
    el = document.createElement("div");
    el.id = "cmpOverlay";
    el.className = "cmp-overlay";
    el.innerHTML = `
      <div class="cmp-modal" role="dialog" aria-modal="true" aria-labelledby="cmpTitle">
        <div class="cmp-head">
          <div><b id="cmpTitle">${esc(t("cmp.title"))}</b><div class="cmp-sub"><span>${esc(q.course)}</span>${q.class ? classBadge(q.class) : ""}</div></div>
          <button type="button" class="cmp-x" aria-label="${esc(t("cmp.close"))}">×</button>
        </div>
        <div class="cmp-body" id="cmpBody"></div>
      </div>`;
    document.body.appendChild(el);
    const close = () => {
      el.hidden = true;
      document.body.classList.remove("cmp-open");
    };
    el.addEventListener("click", (e) => {
      if (e.target === el || e.target.closest(".cmp-x")) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !el.hidden) close();
    });
    el.addEventListener("change", (e) => {
      const sel = e.target.closest("select[data-side]");
      if (!sel) return;
      cmpTags[+sel.dataset.side] = sel.value;
      renderCompare();
    });
    return el;
  }
  async function renderCompare() {
    const el = cmpShell();
    el.hidden = false;
    document.body.classList.add("cmp-open");
    const body = $("cmpBody");
    if (!cmpTags[0]) {
      body.innerHTML = `<p class="cmp-empty">${esc(t("cmp.alone"))}</p>`;
      return;
    }
    if (!body.querySelector(".cmp-pair")) body.innerHTML = `<div class="skeleton sk-line"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line"></div>`;
    const seq = ++cmpSeq;
    const res = await api("combos/compare", { ...q, version, tags: cmpTags.join(",") }).catch(() => null);
    if (seq !== cmpSeq) return;
    const by = new Map((res?.rows ?? []).map((r) => [r.driver.tag, r]));
    const L = by.get(cmpTags[0]);
    const R = by.get(cmpTags[1]);
    body.innerHTML = L && R ? compareHtml(L, R) : `<p class="cmp-empty">${esc(t("offline"))}</p>`;
  }
  /** Retard du plus lent : pastille rouge, la donnée à lire en premier. */
  const deficit = (text, lg = false) => `<span class="cmp-chip${lg ? " lg" : ""}">${esc(text)}</span>`;
  /**
   * Valeur d'un côté : le meilleur des deux en gras à sa couleur, l'autre accompagné de son
   * retard (`chipFirst` : pastille avant la valeur, pour garder les chiffres alignés à droite).
   */
  function val(side, v, other, fmt, better = "low", delta = (d) => "+" + f3(d), chipFirst = true) {
    if (v == null) return `<span class="muted">—</span>`;
    const win = better && other != null && Math.abs(v - other) > 0.0005 ? (better === "low" ? v < other : v > other) : null;
    const chip = win === false ? deficit(delta(Math.abs(v - other))) : "";
    const value = `<span class="mono${win === true ? ` cmp-win s${side}` : ""}">${esc(fmt(v))}</span>`;
    return `<span class="cmp-val">${chipFirst ? chip + value : value + chip}</span>`;
  }
  function compareHtml(L, R) {
    const pair = [L, R];
    const gap = R.time - L.time; // > 0 : la gauche est plus rapide
    const tie = Math.abs(gap) < 0.0005;
    const slower = gap > 0 ? R : L;
    // Liste des pilotes : lignes chargées + les deux comparés (peut-être plus loin dans le classement).
    const list = [...rows];
    for (const r of pair) if (!list.some((x) => x.driver.tag === r.driver.tag)) list.push(r);
    list.sort((a, b) => a.rank - b.rank);
    const options = (side) => list
      .filter((r) => r.driver.tag !== cmpTags[1 - side])
      .map((r) => `<option value="${esc(r.driver.tag)}"${r.driver.tag === cmpTags[side] ? " selected" : ""}>P${r.rank} · ${esc(plainName(r.driver))}${r.driver.tag === me ? ` (${esc(t("cmp.you"))})` : ""}</option>`)
      .join("");
    const card = (r, side) => {
      const isSlower = !tie && r === slower;
      return `
      <div class="cmp-card s${side}${isSlower ? "" : " win"}">
        <select data-side="${side}" aria-label="${esc(t("col.driver"))}">${options(side)}</select>
        <div class="cmp-who">
          <span class="cmp-rank">P${r.rank}</span>
          <div><b>${driverName(r.driver, !!(r.driver.name && (r.driver.country || r.driver.avatar)))}</b><div class="car">${q.class ? "" : classBadge(r.car_class)}${carImg(r.car_model)}<span>${esc(r.car_model)}</span></div></div>
        </div>
        <div class="cmp-time"><span class="mono">${fmtTime(r.time)}</span>${isSlower ? deficit(`+${f3(Math.abs(gap))} s`, true) : ""}</div>
      </div>`;
    };

    const notes = [];
    if (!q.class && L.car_class !== R.car_class) notes.push(t("cmp.diffClass"));
    if (minor(L.game_version) !== minor(R.game_version)) notes.push(t("cmp.diffVersion", { a: minor(L.game_version), b: minor(R.game_version) }));

    // Où se fait l'écart : une barre par secteur, du côté du plus rapide.
    const sectors = ["s1", "s2", "s3"].map((k) => ({ k: k.toUpperCase(), a: L[k], b: R[k], d: L[k] != null && R[k] != null ? R[k] - L[k] : null }));
    const maxD = Math.max(0.001, ...sectors.map((s) => Math.abs(s.d ?? 0)));
    // Temps perdu par le plus lent dans chaque secteur (négatif = secteur qu'il gagne).
    const losses = sectors.filter((s) => s.d != null).map((s) => ({ sector: s.k, loss: gap > 0 ? s.d : -s.d }));
    const worst = losses.length ? losses.reduce((m, x) => (x.loss > m.loss ? x : m)) : null;
    const worstSector = worst && worst.loss > 0.0005 ? worst.sector : null;
    const comeback = losses.length ? losses.reduce((m, x) => (x.loss < m.loss ? x : m)) : null;
    // Conclusion : textes de traduction (fiables, avec <b>) ; seul le nom vient des joueurs → échappé.
    const nm = esc(plainName(slower.driver));
    let say = tie
      ? esc(t("cmp.tie"))
      : worstSector
        ? t("cmp.behind", { name: nm, gap: f3(Math.abs(gap)), part: f3(worst.loss), sector: worstSector })
        : t("cmp.behindOnly", { name: nm, gap: f3(Math.abs(gap)) });
    if (comeback && comeback.loss < -0.0005) say += " " + t("cmp.gains", { gain: f3(-comeback.loss), sector: comeback.sector });
    const bar = (d) => (d != null && Math.abs(d) > 0.0005
      ? `<i class="s${d > 0 ? 0 : 1}" style="width:${((Math.abs(d) / maxD) * 50).toFixed(1)}%;${d > 0 ? "right" : "left"}:50%"></i>`
      : "");
    const secs = losses.length ? `
      <div class="cmp-box">
        <p class="cmp-box-h">${esc(t("cmp.sectors"))}</p>
        <div class="cmp-secs">${sectors.map((s) => `
          <div class="cmp-sec${s.k === worstSector ? " worst" : ""}">
            <b>${s.k}</b>
            <span>${val(0, s.a, s.b, f3)}</span>
            <span class="cmp-bar">${bar(s.d)}</span>
            <span>${val(1, s.b, s.a, f3, "low", undefined, false)}</span>
          </div>`).join("")}
        </div>
      </div>` : "";

    const optimal = (r) => (r.best_s1 != null && r.best_s2 != null && r.best_s3 != null ? r.best_s1 + r.best_s2 + r.best_s3 : null);
    const spread = (r) => (r.median_lap != null ? r.median_lap - r.time : null);
    const tyres = (r) => (r.compound_f ? (r.compound_r && r.compound_r !== r.compound_f ? `${r.compound_f} / ${r.compound_r}` : r.compound_f) : null);
    const session = (r) => {
      const s = r.session_type || "";
      const type = /race/i.test(s) ? t("f.race") : /qual/i.test(s) ? t("f.qualify") : /practice|warm/i.test(s) ? t("f.practice") : s;
      return `${type} · ${r.setting === "Multiplayer" ? t("f.online") : t("f.offline")}`;
    };
    const numRow = (label, get, fmt, better = "low", delta) => {
      const a = get(L);
      const b = get(R);
      if (a == null && b == null) return "";
      return `<tr><td>${esc(label)}</td><td>${val(0, a, b, fmt, better, delta)}</td><td>${val(1, b, a, fmt, better, delta)}</td></tr>`;
    };
    const textRow = (label, get) => `<tr class="ctx"><td>${esc(label)}</td><td>${esc(get(L) ?? "—")}</td><td>${esc(get(R) ?? "—")}</td></tr>`;
    const perf = [
      numRow(t("cmp.optimal"), optimal, fmtTime),
      numRow(t("cmp.median"), (r) => r.median_lap, fmtTime),
      numRow(t("cmp.spread"), spread, (v) => `+${f3(v)} s`),
      numRow(t("cmp.vmax"), (r) => r.top_speed, (v) => `${v.toFixed(1)} km/h`, "high", (d) => `−${d.toFixed(1)}`),
    ].join("");

    return `
      <div class="cmp-pair">
        ${card(L, 0)}
        <div class="cmp-mid"><span>${esc(t("cmp.gap"))}</span><b>${f3(Math.abs(gap))}</b><small>s</small></div>
        ${card(R, 1)}
      </div>
      ${notes.length ? `<p class="cmp-note">⚠ ${esc(notes.join(" "))}</p>` : ""}
      <p class="cmp-say">${say}</p>
      ${secs}
      <div class="cmp-box">
        <table class="cmp-table">
          <thead><tr><th>${esc(t(perf ? "cmp.detail" : "cmp.context"))}</th>${pair.map((r, side) => `<th class="s${side}">${esc(plainName(r.driver))}</th>`).join("")}</tr></thead>
          <tbody>
            ${perf}
            ${perf ? `<tr class="ctx-h"><td colspan="3">${esc(t("cmp.context"))}</td></tr>` : ""}
            ${textRow(t("cmp.tyres"), tyres)}
            ${textRow(t("cmp.session"), session)}
            ${textRow(t("cmp.sessions"), (r) => r.combo_sessions)}
            ${textRow(t("cmp.laps"), (r) => r.combo_laps)}
            ${textRow(t("col.version"), (r) => r.game_version)}
            ${textRow(t("col.date"), (r) => fmtDate(r.played_on))}
          </tbody>
        </table>
      </div>`;
  }

  // Ma position : ligne épinglée en couleur au-dessus du tableau.
  let me = getMe();
  async function showMe(scroll) {
    if (!me) {
      // Pas encore identifié : on choisit son nom dans CE classement, puis on affiche
      // tout de suite son temps et sa position (repère retenu pour les autres circuits).
      $("meCard").innerHTML = `
        <div class="me-card me-empty me-pick">
          <input class="search" id="mePick" placeholder="${esc(t("me.pickPh"))}" autocomplete="off">
          <div class="me-pick-list" id="mePickList"></div>
        </div>`;
      const input = $("mePick");
      input.focus();
      let tm = null;
      input.addEventListener("input", () => {
        clearTimeout(tm);
        tm = setTimeout(async () => {
          const v = input.value.trim();
          if (v.length < 2) { $("mePickList").innerHTML = ""; return; }
          const res = await api("combos/leaderboard", { ...q, version, limit: 6, offset: 0, name: v }).catch(() => null);
          const found = res?.rows ?? [];
          $("mePickList").innerHTML = found.length
            ? found.map((r) => `<button type="button" data-tag="${esc(r.driver.tag)}"><span class="mono">${r.rank}<small class="muted"> / ${fmtNum(res.drivers)}</small></span><span>${driverName(r.driver)}</span><span class="mono">${fmtTime(r.time)}</span></button>`).join("")
            : `<span class="muted">${esc(t("me.pickNone"))}</span>`;
        }, 250);
      });
      $("mePickList").addEventListener("click", (e) => {
        const b = e.target.closest("button[data-tag]");
        if (!b) return;
        setMe(b.dataset.tag);
        me = b.dataset.tag;
        showMe(true);
        loadMore(true);
      });
      if (scroll) $("meCard").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const lb = await api("combos/leaderboard", { ...q, version, limit: 1, offset: 0, tag: me }).catch(() => null);
    const r = lb?.me;
    if (!r) {
      $("meCard").innerHTML = `<div class="me-card me-empty">${esc(t("me.none"))} <button class="btn btn-ghost btn-sm" id="meClear" style="margin-left:auto">${esc(t("me.clear"))}</button></div>`;
    } else {
      const st = standing(Math.max(1, Math.ceil((r.rank / lb.drivers) * 100)), r.rank, lb.drivers);
      $("meCard").innerHTML = `
        <div class="me-card">
          <div class="me-rank">${r.rank}<small style="font-size:.9rem;color:var(--muted)"> / ${fmtNum(lb.drivers)}</small></div>
          <div class="me-main"><span class="me-k">${esc(t("me.title"))}</span><b>${driverName(r.driver)}</b></div>
          <div class="me-main"><span class="me-k">${esc(t("col.time"))}</span><span class="me-time">${fmtTime(r.time)}</span></div>
          <div class="me-main"><span class="me-k">${esc(t("col.gap"))}</span><span class="me-time">${r.rank === 1 ? "—" : "+" + (r.time - detail.best.time).toFixed(3)}</span></div>
          <div class="me-main"><span class="me-k">${esc(t("me.where"))}</span><span class="me-where"><b class="${st.cls}">${esc(st.label)}</b><span class="gauge"><i style="left:${lb.drivers <= 1 ? 0 : Math.round(((r.rank - 1) / (lb.drivers - 1)) * 100)}%"></i></span></span></div>
          <div class="me-side"><div class="car">${carImg(r.car_model)}<span>${esc(r.car_model)}</span></div>
            <button class="btn btn-ghost btn-sm" id="meJump">${esc(t("me.jump"))}</button>
            <button class="btn btn-ghost btn-sm" id="meClear">${esc(t("me.clear"))}</button></div>
        </div>`;
      $("meJump").addEventListener("click", async () => {
        while (!$("lbBody").querySelector("tr.is-me") && !$("more").hidden) await loadMore();
        $("lbBody").querySelector("tr.is-me")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
    $("meClear")?.addEventListener("click", () => { setMe(""); me = ""; showMe(true); loadMore(true); });
    if (scroll) $("meCard").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  $("meBtn").addEventListener("click", () => showMe(true));
  if (me) showMe(false);
  let findTimer = null;
  $("find").addEventListener("input", (e) => {
    clearTimeout(findTimer);
    findTimer = setTimeout(() => {
      const v = e.target.value.trim();
      nameFilter = v.length >= 2 ? v : "";
      loadMore(true);
    }, 250);
  });
  await loadMore();

  // Par voiture.
  const cars = detail.by_car;
  const lo = Math.min(...cars.map((c) => c.best));
  const top = Math.max(...cars.map((c) => c.median ?? c.best)) + 0.3;
  const cx = (x) => ((x - lo + 0.3) / (top - lo + 0.3)) * 100;
  $("cars").innerHTML = cars
    .map((c) => `
    <div class="car-row">
      ${carImg(c.car_model)}
      <span>${esc(c.car_model)}</span>
      <div class="track"><div class="range" style="left:${cx(c.best)}%;width:${Math.max(1, cx(c.median ?? c.best) - cx(c.best))}%"></div><div class="med" style="left:${cx(c.median ?? c.best)}%"></div></div>
      <span class="mono" style="text-align:right">${fmtTime(c.best)}<br><span class="n">${fmtNum(c.drivers)} ${esc(t("drivers"))}</span></span>
    </div>`)
    .join("");

  $("copyLink").addEventListener("click", async () => {
    await navigator.clipboard.writeText(location.href).catch(() => {});
    $("copyLink").textContent = t("share.copied");
  });
})();
