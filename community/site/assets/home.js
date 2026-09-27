// Accueil du site communautaire : chiffres, combos les plus roulés, grille des circuits.
/* global carImg, driversWord, t, esc, api, fmtTime, fmtNum, flagImg, classBadge, trackSvg, mapFallback, chrome, dataReady, filterBar, bindFilterBar */
"use strict";

const RANKED_MIN = 20;
const comboUrl = (c) =>
  `/combo.html?${new URLSearchParams(Object.entries({ track: c.track, course: c.track_course, class: c.car_class, ...hq }).filter(([, v]) => v))}`;

chrome();

const hp = new URLSearchParams(location.search);
const hq = { session: hp.get("session") || "", mode: hp.get("mode") || "", version: hp.get("version") || "" };
// Adresse déjà filtrée (session / mode / version) : on affiche directement le tableau,
// sans faire apparaître puis disparaître l'en-tête.
if (hq.session || hq.mode || hq.version) document.body.classList.add("is-filtered");

(async () => {
  let stats, combos, versions;
  try {
    [stats, { combos, versions }] = await Promise.all([api("stats"), api("combos", hq), dataReady]);
  } catch {
    document.getElementById("notice").innerHTML = `<p class="notice">${esc(t("offline"))}</p>`;
    document.querySelectorAll("#stats b").forEach((b) => { b.classList.remove("skeleton"); b.textContent = "—"; });
    return;
  }

  // Bandeau de chiffres.
  const ranked = combos.filter((c) => c.drivers >= RANKED_MIN).length;
  const cells = [
    [fmtNum(stats.drivers), t("stat.week", { n: fmtNum(stats.drivers_7d) }), true],
    [fmtNum(stats.sessions), t("stat.week", { n: fmtNum(stats.sessions_7d) }), true],
    [fmtNum(stats.layouts), "", false],
    [fmtNum(ranked), t("stat.rankedSub"), false],
  ];
  document.querySelectorAll("#stats .stat").forEach((el, i) => {
    const [v, sub, up] = cells[i];
    const b = el.querySelector("b");
    b.classList.remove("skeleton");
    b.textContent = v;
    const em = el.querySelector("em");
    em.textContent = sub || " ";
    em.className = up && sub ? "up" : "";
  });

  if (combos.length === 0) {
    document.getElementById("trackGrid").innerHTML =
      `<div class="empty" style="grid-column:1/-1"><b>${esc(t("empty.title"))}</b>${esc(t("empty.text"))}</div>`;
    return;
  }

  // Combos les plus roulés.
  document.getElementById("hotSection").hidden = false;
  const top = combos.slice(0, 6);
  const topMax = Math.max(1, ...top.map((c) => c.drivers));
  document.getElementById("hot").innerHTML = top
    .map(
      (c, i) => `
      <a class="hot-row" href="${esc(comboUrl(c))}">
        <span class="hot-rank">${i + 1}</span>
        <span class="hot-thumb">${trackSvg(c.track_course, 4) || flagImg(c.track)}</span>
        <span class="hot-main">
          <b class="hot-name">${esc(c.track_course)}</b>
          <span class="hot-sub">${classBadge(c.car_class)}<span class="muted">${esc(c.best_car)}</span></span>
        </span>
        <span class="hot-time mono">${fmtTime(c.best)}</span>
        <span class="hot-n"><span><b class="mono">${fmtNum(c.drivers)}</b> ${esc(driversWord(c.drivers))}</span><i style="width:${Math.max(6, Math.round((c.drivers / topMax) * 100))}%"></i></span>
      </a>`,
    )
    .join("");

  // Grille des circuits : un circuit (tracé) par carte, meilleur temps par classe.
  const byTrack = new Map();
  for (const c of combos) {
    const k = `${c.track}|${c.track_course}`;
    if (!byTrack.has(k)) byTrack.set(k, { track: c.track, course: c.track_course, classes: [] });
    byTrack.get(k).classes.push(c);
  }
  const cards = [...byTrack.values()].map((g) => {
    g.classes.sort((a, b) => b.drivers - a.drivers);
    g.total = g.classes.reduce((s, c) => s + c.drivers, 0);
    return g;
  });
  cards.sort((a, b) => b.total - a.total);

  const allClasses = [...new Set(combos.map((c) => c.car_class))].sort();
  const allTracks = [...new Set(combos.map((c) => c.track))].sort();
  let classFilter = null;
  let trackFilter = null;
  const filters = document.getElementById("filters");
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
    window.scrollTo({ top: 0 });
  });
  const search = document.getElementById("search");

  function render() {
    const q = search.value.trim().toLowerCase();
    // Un filtre actif → tableau des combos, en haut de page (sans en-tête ni cartes).
    const filtered = !!(q || trackFilter || classFilter || hq.session || hq.mode || hq.version);
    document.body.classList.toggle("is-filtered", filtered);
    document.getElementById("resultsHead").hidden = !filtered;
    document.getElementById("comboTable").hidden = !filtered;
    document.getElementById("trackGrid").hidden = filtered;
    if (filtered) {
      const rows = combos.filter(
        (c) =>
          (!q || `${c.track} ${c.track_course}`.toLowerCase().includes(q)) &&
          (!trackFilter || c.track === trackFilter) &&
          (!classFilter || c.car_class === classFilter),
      );
      document.getElementById("resultsCount").textContent =
        rows.length === 1 ? t("f.result1") : t("f.results", { n: fmtNum(rows.length) });
      document.getElementById("comboRows").innerHTML = rows.length
        ? rows
            .map(
              (c) => `
        <tr class="row-link" data-href="${esc(comboUrl(c))}">
          <td><a class="combo-cell" href="${esc(comboUrl(c))}">${flagImg(c.track)}<span><b>${esc(c.track_course)}</b>${c.track !== c.track_course ? `<small class="muted">${esc(c.track)}</small>` : ""}</span></a></td>
          <td>${classBadge(c.car_class)}</td>
          <td class="t best-t">${fmtTime(c.best)}</td>
          <td><div class="car">${carImg(c.best_car)}<span>${esc(c.best_car)}</span></div></td>
          <td><b class="mono">${fmtNum(c.drivers)}</b> <span class="muted">${esc(driversWord(c.drivers))}</span></td>
          <td><span class="ver">v${esc(c.version)}</span></td>
          <td class="go">›</td>
        </tr>`,
            )
            .join("")
        : `<tr><td colspan="7" class="muted" style="text-align:center;padding:28px">${esc(t("noResult"))}</td></tr>`;
      return;
    }
    const list = cards.filter(
      (g) =>
        (!q || `${g.track} ${g.course}`.toLowerCase().includes(q)) &&
        (!trackFilter || g.track === trackFilter) &&
        (!classFilter || g.classes.some((c) => c.car_class === classFilter)),
    );
    document.getElementById("trackGrid").innerHTML = list.length
      ? list
          .map((g) => {
            const shown = classFilter ? g.classes.filter((c) => c.car_class === classFilter) : g.classes;
            const n = shown.reduce((s, c) => s + c.drivers, 0);
            // Même structure avec ou sans tracé : vignette = tracé, sinon drapeau.
            const outline = trackSvg(g.course, 6);
            return `
        <a class="tcard" href="${esc(comboUrl(shown[0]))}">
          <div class="tcard-head">
            <div class="tcard-title">
              <b>${esc(g.course)}</b>
              <span class="muted">${outline ? flagImg(g.track) : ""}${shown.length} ${esc(t(shown.length > 1 ? "classes" : "class"))} · ${fmtNum(n)} ${esc(driversWord(n))}</span>
            </div>
            <div class="tcard-thumb ${outline ? "" : "is-flag"}">${outline || flagImg(g.track)}</div>
          </div>
          <div class="bests">${shown
            .slice(0, 4)
            .map((c) => `<div>${classBadge(c.car_class)}<span class="muted">${esc(c.best_car)}</span><span class="mono">${fmtTime(c.best)}</span></div>`)
            .join("")}</div>
        </a>`;
          })
          .join("")
      : `<div class="empty" style="grid-column:1/-1">${esc(t("noResult"))}</div>`;
  }

  search.addEventListener("input", () => {
    render();
    window.scrollTo({ top: 0 });
  });
  // Toute la ligne du tableau est cliquable (le lien du circuit reste le lien accessible).
  document.getElementById("comboRows").addEventListener("click", (e) => {
    const tr = e.target.closest("tr.row-link");
    if (tr && !e.target.closest("a")) location.href = tr.dataset.href;
  });
  render();
})();
