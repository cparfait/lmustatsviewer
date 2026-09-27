// Accueil du site communautaire : chiffres, puis tous les classements d'un coup d'œil.
// Vue « Par circuit » (une carte repliable par circuit, une ligne par classement — même
// présentation que la page Classements de l'app) ou vue « Liste » (tableau unique).
/* global carImg, driverName, driversWord, t, esc, api, fmtTime, fmtNum, flagImg, classBadge, classKey, chrome, dataReady, filterBar, bindFilterBar, getMe */
"use strict";

const RANKED_MIN = 20;
// Ordre des classes de l'app (SUIVI §3.6) ; une classe inconnue passe en dernier.
const CLASS_ORDER = [/hyper/i, /lmp2.*elms/i, /lmp2/i, /lmp3/i, /gt3/i, /gte/i];
const classRank = (c) => {
  const i = CLASS_ORDER.findIndex((re) => re.test(c));
  return i < 0 ? CLASS_ORDER.length : i;
};
const PERSON_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
// Secteurs du tour record ; en violet quand c'est aussi le meilleur secteur du classement.
const SECTORS = ["s1", "s2", "s3"];
const CHEVRON_SVG = '<svg class="cg-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const byClass = (a, b) => classRank(a) - classRank(b) || a.localeCompare(b);
// Classement toutes classes d'un circuit : son tracé le plus roulé, sans classe.
const trackUrl = (g) => {
  const byCourse = new Map();
  for (const c of g.list) byCourse.set(c.track_course, (byCourse.get(c.track_course) ?? 0) + c.drivers);
  const course = [...byCourse.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return `/combo.html?${new URLSearchParams(Object.entries({ track: g.track, course, ...hq }).filter(([, v]) => v))}`;
};
const comboUrl = (c) =>
  `/combo.html?${new URLSearchParams(Object.entries({ track: c.track, course: c.track_course, class: c.car_class, ...hq }).filter(([, v]) => v))}`;

chrome();

const hp = new URLSearchParams(location.search);
const hq = { session: hp.get("session") || "", mode: hp.get("mode") || "", version: hp.get("version") || "" };
const $ = (id) => document.getElementById(id);

// Raccourci vers sa fiche quand le site connaît déjà le pilote (lien depuis l'app ou « C'est moi »).
const me = getMe();
if (me) {
  $("meLink").href = `/pilote.html?tag=${encodeURIComponent(me)}`;
  $("meLink").hidden = false;
}

// Vue et tri retenus dans ce navigateur ; affichés dès le chargement.
let view = localStorage.getItem("lmu-home-view") === "list" ? "list" : "grid";
let sort = localStorage.getItem("lmu-home-sort") === "az" ? "az" : "popular";
const segs = [
  [$("viewSeg"), "view", () => view, (v) => { view = v; localStorage.setItem("lmu-home-view", v); }],
  [$("sortSeg"), "sort", () => sort, (v) => { sort = v; localStorage.setItem("lmu-home-sort", v); }],
];
const syncSegs = () => {
  for (const [el, attr, get] of segs)
    el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === get())));
};
syncSegs();

(async () => {
  let stats, combos, versions;
  try {
    [stats, { combos, versions }] = await Promise.all([api("stats"), api("combos", hq), dataReady]);
  } catch {
    $("notice").innerHTML = `<p class="notice">${esc(t("offline"))}</p>`;
    document.querySelectorAll("#stats b").forEach((b) => { b.classList.remove("skeleton"); b.textContent = "—"; });
    $("board").innerHTML = "";
    return;
  }

  // Chiffres de l'en-tête.
  const ranked = combos.filter((c) => c.drivers >= RANKED_MIN).length;
  const cells = [
    [fmtNum(stats.drivers), stats.drivers_7d ? t("stat.week", { n: fmtNum(stats.drivers_7d) }) : ""],
    [fmtNum(stats.sessions), stats.sessions_7d ? t("stat.week", { n: fmtNum(stats.sessions_7d) }) : ""],
    [fmtNum(stats.layouts), null],
    [fmtNum(ranked), null],
  ];
  document.querySelectorAll("#stats li").forEach((li, i) => {
    const [v, sub] = cells[i];
    const b = li.querySelector("b");
    b.classList.remove("skeleton");
    b.textContent = v;
    if (sub !== null) {
      const em = li.querySelector("em");
      em.textContent = sub;
      em.className = sub ? "up" : "";
    }
  });

  if (combos.length === 0) {
    $("resultsCount").textContent = "";
    $("board").innerHTML = `<div class="empty board-empty"><b>${esc(t("empty.title"))}</b>${esc(t("empty.text"))}</div>`;
    return;
  }

  const allClasses = [...new Set(combos.map((c) => c.car_class))].sort(byClass);
  const allTracks = [...new Set(combos.map((c) => c.track))].sort();

  let classFilter = null;
  let trackFilter = null;

  const filters = $("filters");
  filters.innerHTML = filterBar([
    { key: "track", label: t("f.circuit"), value: "", options: [["", t("f.all")], ...allTracks.map((x) => [x, x])] },
    { key: "class", label: t("f.class"), value: "", options: [["", t("f.allF")], ...allClasses.map((x) => [x, x])] },
    { key: "session", label: t("f.session"), value: hq.session, options: [["", t("f.allF")], ["race", t("f.race")], ["qualify", t("f.qualify")], ["practice", t("f.practice")]] },
    { key: "mode", label: t("f.mode"), value: hq.mode, options: [["", t("f.all")], ["online", t("f.online")], ["offline", t("f.offline")]] },
    {
      key: "version",
      label: t("f.version"),
      multi: {
        all: ["all", t("f.allF")],
        items: (versions ?? []).map((v) => [v.version, `v${v.version} · ${fmtNum(v.drivers)}`, `v${v.version}`]),
        // Par défaut : toutes les versions.
        selected: !hq.version || hq.version === "all" ? "all" : hq.version.split(","),
        empty: t("f.allF"),
      },
    },
  ]) + `<input class="search" id="search" placeholder="${esc(t("search"))}">`;
  bindFilterBar(filters, (key, value) => {
    if (key === "session" || key === "mode" || key === "version") {
      // « Toutes » (ou rien de coché) = défaut : adresse sans paramètre de version.
      if (value === "all" || (Array.isArray(value) && !value.length)) value = "";
      else if (Array.isArray(value)) value = value.join(",");
      const next = new URLSearchParams(Object.entries({ ...hq, [key]: value }).filter(([, v]) => v));
      location.href = `/?${next}#tracks`;
      return;
    }
    if (key === "class") classFilter = value || null;
    if (key === "track") trackFilter = value || null;
    render();
  });
  const search = $("search");

  for (const [el, attr, get, set] of segs) {
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.dataset[attr] === get()) return;
      set(b.dataset[attr]);
      render();
    });
  }

  const driversCell = (n) => `<b class="mono">${fmtNum(n)}</b> <span class="muted">${esc(driversWord(n))}</span>`;
  // Circuits repliés (le temps de la visite).
  const collapsed = new Set();

  function render() {
    syncSegs();
    const q = search.value.trim().toLowerCase();
    $("resetBtn").hidden = !(q || trackFilter || classFilter || hq.session || hq.mode || hq.version);

    const matchTrack = (track, course) =>
      (!q || `${track} ${course}`.toLowerCase().includes(q)) && (!trackFilter || track === trackFilter);
    const rows = combos
      .filter((c) => matchTrack(c.track, c.track_course) && (!classFilter || c.car_class === classFilter))
      .sort(sort === "az" ? (a, b) => a.track_course.localeCompare(b.track_course) || byClass(a.car_class, b.car_class) : (a, b) => b.drivers - a.drivers);
    $("resultsCount").textContent = rows.length === 1 ? t("home.count1") : t("home.count", { n: fmtNum(rows.length) });

    if (!rows.length) {
      $("board").innerHTML = `<div class="empty board-empty">${esc(t("noResult"))}</div>`;
      return;
    }
    $("board").innerHTML = view === "list" ? listView(rows) : gridView(rows);
  }

  // Une carte par circuit : en-tête repliable, une ligne par classement (tracé × classe).
  function gridView(rows) {
    const byTrack = new Map();
    for (const c of rows) {
      if (!byTrack.has(c.track)) byTrack.set(c.track, []);
      byTrack.get(c.track).push(c);
    }
    const groups = [...byTrack.entries()]
      .map(([track, list]) => ({
        track,
        list: list.sort((a, b) => byClass(a.car_class, b.car_class) || b.drivers - a.drivers),
        // Pilotes distincts du circuit (un pilote de deux classes compte une fois) ; classe filtrée :
        // ceux de cette classe.
        total: !classFilter && list[0].track_drivers != null ? list[0].track_drivers : list.reduce((s, c) => s + c.drivers, 0),
      }))
      .sort(sort === "az" ? (a, b) => a.track.localeCompare(b.track) : (a, b) => b.total - a.total);
    // Fréquentation : relative au classement le plus roulé de la même classe.
    const classMax = new Map();
    for (const c of rows) classMax.set(c.car_class, Math.max(classMax.get(c.car_class) ?? 1, c.drivers));
    const head = `<colgroup><col class="c-class"><col class="c-pilot"><col><col class="c-time"><col class="c-sec"><col class="c-sec"><col class="c-sec"><col class="c-drv"><col class="c-pop"><col class="c-ver"><col class="c-go"></colgroup>
      <thead><tr><th>${esc(t("col.class"))}</th><th>${esc(t("col.recordDriver"))}</th><th>${esc(t("col.recordCar"))}</th><th class="perf sep r">${esc(t("kpi.best"))}</th><th class="perf r">S1</th><th class="perf r">S2</th><th class="perf r">S3</th><th class="perf c">${esc(t("stat.drivers"))}</th><th class="perf">${esc(t("col.pop"))}</th><th class="sep c">${esc(t("col.version"))}</th><th></th></tr></thead>`;
    return groups
      .map((g) => {
        const open = !collapsed.has(g.track);
        return `<section class="cgroup">
        <div class="cg-head" data-track="${esc(g.track)}"><button type="button" class="cg-toggle" aria-expanded="${open}" aria-label="${esc(g.track)}">${CHEVRON_SVG}</button><a class="cg-link" href="${esc(trackUrl(g))}" title="${esc(t("home.allClasses"))}">${flagImg(g.track)}<span class="cg-name">${esc(g.track)}</span></a><span class="cg-n">${g.list.length}</span><span class="cg-drivers">${fmtNum(g.total)} ${esc(driversWord(g.total))}</span></div>
        ${open ? `<div class="lb-scroll"><table class="lb cg-table">${head}<tbody>${g.list
          .map((c) => {
            const url = esc(comboUrl(c));
            const prov = c.drivers < RANKED_MIN;
            const pop = prov
              ? `<span class="pop"><i class="pop-bar"><i class="pend" style="width:${Math.round((c.drivers / RANKED_MIN) * 100)}%"></i></i><span class="muted">${esc(t("home.pending", { n: c.drivers }))}</span></span>`
              : `<span class="pop"><i class="pop-bar"><i class="cc-${classKey(c.car_class)}" style="width:${Math.max(4, Math.round((c.drivers / classMax.get(c.car_class)) * 100))}%"></i></i></span>`;
            return `<tr class="row-link${prov ? " is-prov" : ""}" data-href="${url}">
            <td>${classBadge(c.car_class)}</td>
            <td class="pilot">${c.best_driver ? driverName(c.best_driver) : "—"}</td>
            <td><div class="car"><span class="logo-slot">${carImg(c.best_car)}</span><span class="car-txt"><span>${esc(c.best_car)}</span>${c.track_course !== c.track ? `<small class="muted">${esc(c.track_course)}</small>` : ""}</span></div></td>
            <td class="perf sep r best-t mono">${fmtTime(c.best)}</td>
            ${SECTORS.map((k) => `<td class="perf r mono sec${c[k] != null && c[k] === c[`best_${k}`] ? " pb" : ""}">${c[k] != null ? c[k].toFixed(3) : "—"}</td>`).join("")}
            <td class="perf c mono" title="${esc(`${fmtNum(c.drivers)} ${driversWord(c.drivers)}`)}"><span class="drv-n">${PERSON_SVG}<b>${fmtNum(c.drivers)}</b></span></td>
            <td class="perf">${pop}</td>
            <td class="sep c"><span class="ver">v${esc(c.version)}</span></td>
            <td class="r"><a class="go-link" href="${url}">${esc(t("home.open"))}</a></td>
          </tr>`;
          })
          .join("")}</tbody></table></div>` : ""}
      </section>`;
      })
      .join("");
  }

  // Une ligne par classement (toute la ligne est cliquable).
  function listView(rows) {
    return `<div class="panel lb-panel"><div class="lb-scroll"><table class="lb">
      <thead><tr><th>${esc(t("col.track"))}</th><th>${esc(t("col.class"))}</th><th>${esc(t("kpi.best"))}</th><th>${esc(t("col.recordDriver"))}</th><th>${esc(t("col.car"))}</th><th>${esc(t("stat.drivers"))}</th><th>${esc(t("col.version"))}</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (c) => `
        <tr class="row-link${c.drivers < RANKED_MIN ? " is-prov" : ""}" data-href="${esc(comboUrl(c))}">
          <td><a class="combo-cell" href="${esc(comboUrl(c))}">${flagImg(c.track)}<span><b>${esc(c.track_course)}</b>${c.track !== c.track_course ? `<small class="muted">${esc(c.track)}</small>` : ""}</span></a></td>
          <td>${classBadge(c.car_class)}</td>
          <td class="t best-t">${fmtTime(c.best)}</td>
          <td class="pilot">${c.best_driver ? driverName(c.best_driver) : "—"}</td>
          <td><div class="car">${carImg(c.best_car)}<span>${esc(c.best_car)}</span></div></td>
          <td>${driversCell(c.drivers)}</td>
          <td><span class="ver">v${esc(c.version)}</span></td>
          <td class="go">›</td>
        </tr>`,
        )
        .join("")}</tbody></table></div></div>`;
  }

  search.addEventListener("input", render);
  // Toute la ligne est cliquable (le lien de la ligne reste le lien accessible) ; en-tête = replier.
  $("board").addEventListener("click", (e) => {
    // En-tête de carte : le nom ouvre le classement du circuit, le reste replie la carte.
    const head = e.target.closest(".cg-head");
    if (head && !e.target.closest("a")) {
      const k = head.dataset.track;
      if (collapsed.has(k)) collapsed.delete(k);
      else collapsed.add(k);
      render();
      return;
    }
    const tr = e.target.closest("tr.row-link");
    if (tr && !e.target.closest("a")) location.href = tr.dataset.href;
  });
  render();
})();
