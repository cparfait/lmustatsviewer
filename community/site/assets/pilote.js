// Fiche pilote : son rang sur chaque combo, une carte par circuit (même présentation que
// l'accueil et que la page Classements de l'app). Un pilote anonyme n'a pas de fiche.
/* global getMe, setMe, standing, t, esc, api, fmtTime, fmtNum, flagImg, carImg, classBadge, chrome, dataReady */
"use strict";

const RANKED_MIN = 20;
// Ordre des classes de l'app (SUIVI §3.6).
const CLASS_ORDER = [/hyper/i, /lmp2.*elms/i, /lmp2/i, /lmp3/i, /gt3/i, /gte/i];
const classRank = (c) => {
  const i = CLASS_ORDER.findIndex((re) => re.test(c));
  return i < 0 ? CLASS_ORDER.length : i;
};
const $ = (id) => document.getElementById(id);

chrome();

(async () => {
  const tag = new URLSearchParams(location.search).get("tag") || "";
  let p;
  try {
    [p] = await Promise.all([api("drivers/profile", { tag }), dataReady]);
  } catch {
    $("notice").innerHTML = `<p class="notice">${esc(t("offline"))}</p>`;
    return;
  }
  if (!p) {
    $("notice").innerHTML = `<div class="empty"><b>${esc(t("profile.none"))}</b><a href="/">${esc(t("back"))}</a></div>`;
    return;
  }
  document.title = `${p.name} — LMU Stats Viewer`;
  $("head").hidden = false;
  $("bar").hidden = false;
  $("avatar").textContent = (p.name || "?").trim().charAt(0).toUpperCase();
  $("name").innerHTML = esc(p.name) + (p.homonym ? ` <span class="muted" style="font-size:1rem">${esc(p.tag)}</span>` : "");
  $("headTag").textContent = p.tag;

  // « C'est moi » : ce navigateur épinglera ce pilote en haut des classements.
  const isMe = getMe() === p.tag;
  $("meBox").innerHTML = isMe
    ? `<span class="muted">${esc(t("me.saved"))}</span> <button class="btn btn-ghost btn-sm" id="meToggle">${esc(t("me.clear"))}</button>`
    : `<button class="btn btn-primary btn-sm" id="meToggle">${esc(t("me.set"))}</button>`;
  $("meToggle").addEventListener("click", () => {
    setMe(isMe ? "" : p.tag);
    location.reload();
  });

  // Chiffres de l'en-tête.
  const ranked = p.combos.filter((c) => c.drivers >= RANKED_MIN);
  const best = [...ranked].sort((a, b) => a.top_pct - b.top_pct || a.rank - b.rank)[0];
  $("k-combos").textContent = fmtNum(p.combos.length);
  $("k-ranked").textContent = fmtNum(ranked.length);
  $("k-records").textContent = fmtNum(p.combos.filter((c) => c.rank === 1).length);
  $("k-podiums").textContent = fmtNum(p.combos.filter((c) => c.rank <= 3).length);
  if (best) {
    const st = standing(best.top_pct, best.rank, best.drivers);
    $("k-best").innerHTML = `<span class="${st.cls}">${esc(st.label)}</span>`;
  }
  $("tbarCount").textContent = p.combos.length === 1 ? t("home.count1") : t("home.count", { n: fmtNum(p.combos.length) });

  // Une carte par circuit ; les circuits où il est le mieux placé d'abord.
  const byTrack = new Map();
  for (const c of p.combos) {
    if (!byTrack.has(c.track)) byTrack.set(c.track, []);
    byTrack.get(c.track).push(c);
  }
  const score = (c) => (c.drivers >= RANKED_MIN ? c.top_pct : 1000 - c.drivers);
  const groups = [...byTrack.entries()]
    .map(([track, list]) => ({ track, list: list.sort((a, b) => classRank(a.car_class) - classRank(b.car_class) || score(a) - score(b)) }))
    .sort((a, b) => Math.min(...a.list.map(score)) - Math.min(...b.list.map(score)));

  const head = `<colgroup><col class="c-class"><col><col class="c-time"><col class="c-rank"><col class="c-top"><col class="c-where"><col class="c-gap"><col class="c-go"></colgroup>
    <thead><tr><th>${esc(t("col.class"))}</th><th>${esc(t("col.car"))}</th><th class="perf sep r">${esc(t("col.time"))}</th><th class="perf c">${esc(t("col.rank"))}</th><th class="perf">${esc(t("col.top"))}</th><th class="perf">${esc(t("col.where"))}</th><th class="perf r">${esc(t("col.gapFirst"))}</th><th class="sep"></th></tr></thead>`;

  $("groups").innerHTML = groups
    .map(
      (g) => `<section class="cgroup">
      <div class="cg-head cg-static">${flagImg(g.track)}<span class="cg-name">${esc(g.track)}</span><span class="cg-n">${g.list.length}</span></div>
      <div class="lb-scroll"><table class="lb cg-table pf-table">${head}<tbody>${g.list
        .map((c) => {
          const url = `/combo.html?${new URLSearchParams({ track: c.track, course: c.track_course, class: c.car_class })}`;
          const isRanked = c.drivers >= RANKED_MIN;
          const st = isRanked ? standing(c.top_pct, c.rank, c.drivers) : null;
          const pos = isRanked
            ? `<td class="perf c mono"><b>${c.rank}</b> <span class="muted">/ ${fmtNum(c.drivers)}</span></td>
               <td class="perf"><b class="${st.cls}">${esc(st.label)}</b></td>
               <td class="perf"><span class="gauge"><i style="left:${Math.min(100, (c.rank / c.drivers) * 100)}%"></i></span></td>
               <td class="perf r mono gap">${c.rank === 1 ? "—" : "+" + c.gap_best.toFixed(3)}</td>`
            : `<td class="perf" colspan="4"><span class="pop"><i class="pop-bar"><i class="pend" style="width:${Math.round((c.drivers / RANKED_MIN) * 100)}%"></i></i><span class="muted">${esc(t("home.pending", { n: c.drivers }))}</span></span></td>`;
          return `<tr class="row-link${isRanked ? "" : " is-prov"}" data-href="${esc(url)}">
          <td>${classBadge(c.car_class)}</td>
          <td><div class="car"><span class="logo-slot">${carImg(c.car_model)}</span><span class="car-txt"><span>${esc(c.car_model)}</span>${c.track_course !== c.track ? `<small class="muted">${esc(c.track_course)}</small>` : ""}</span></div></td>
          <td class="perf sep r best-t mono">${fmtTime(c.time)}</td>
          ${pos}
          <td class="sep r"><a class="go-link" href="${esc(url)}">${esc(t("home.open"))}</a></td>
        </tr>`;
        })
        .join("")}</tbody></table></div>
    </section>`,
    )
    .join("");

  // Toute la ligne ouvre le classement du combo (le lien reste le lien accessible).
  $("groups").addEventListener("click", (e) => {
    const tr = e.target.closest("tr.row-link");
    if (tr && !e.target.closest("a")) location.href = tr.dataset.href;
  });
})();
