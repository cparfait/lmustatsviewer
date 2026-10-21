// Fiche pilote : son rang sur chaque combo, une carte par circuit (même présentation que
// l'accueil et que la page Classements de l'app). Un pilote anonyme n'a pas de fiche.
/* global avatarImg, initialsBadge, countryFlag, getMe, setMe, standing, t, esc, api, fmtTime, fmtNum, flagImg, carImg, classBadge, chrome, dataReady */
"use strict";

const RANKED_MIN = 20;
// Ordre des classes de l'app (SUIVI §3.6).
const CLASS_ORDER = [/hyper/i, /lmp2.*elms/i, /lmp2/i, /lmp3/i, /gt3/i, /gte/i];
const classRank = (c) => {
  const i = CLASS_ORDER.findIndex((re) => re.test(c));
  return i < 0 ? CLASS_ORDER.length : i;
};
const $ = (id) => document.getElementById(id);
/**
 * Place dans le classement, de 0 (1er) à 1 (dernier) ; seul = 1er. Le « top % » ne convient
 * pas pour comparer : 1er sur 1 pilote = top 100 %.
 */
const place = (c) => (c.drivers <= 1 ? 0 : (c.rank - 1) / (c.drivers - 1));

chrome();

(async () => {
  const tag = new URLSearchParams(location.search).get("tag") || "";
  // Vos temps (repère « c'est moi ») : demandés en même temps que sa fiche, pas après.
  const me = getMe();
  const mineP = me && me !== tag ? api("drivers/profile", { tag: me }).catch(() => null) : Promise.resolve(null);
  let p;
  try {
    [p] = await Promise.all([api("drivers/profile", { tag }), dataReady]);
  } catch {
    $("notice").innerHTML = `<p class="notice">${esc(t("offline"))}</p>`;
    return;
  }
  if (!p) {
    $("notice").innerHTML = `<div class="empty"><b>${esc(t("profile.none"))}</b><a href="/classements.html">${esc(t("back"))}</a></div>`;
    return;
  }
  $("notice").innerHTML = ""; // squelette de chargement retiré
  document.title = `${p.name} — LMU Stats Viewer`;
  $("head").hidden = false;
  $("bar").hidden = false;
  // Avatar Steam s'il l'a choisi, sinon son initiale.
  if (p.avatar) $("avatar").innerHTML = avatarImg(p, "av-lg");
  else {
    // Sa classe la plus jouée (combos de sa fiche) donne la couleur de la pastille.
    const n = new Map();
    for (const c of p.combos) n.set(c.car_class, (n.get(c.car_class) || 0) + 1);
    const main = [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    $("avatar").innerHTML = initialsBadge(p, "av-lg", main);
  }
  $("name").innerHTML = countryFlag(p.country) + esc(p.name) + (p.homonym ? ` <span class="muted" style="font-size:1rem">${esc(p.tag)}</span>` : "");
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
  // Tous ses classements (provisoires compris) ; « définitifs » = 20 pilotes ou plus.
  const ranked = p.combos.filter((c) => c.drivers >= RANKED_MIN);
  // Meilleure place, puis le classement le plus disputé.
  const best = [...p.combos].sort((a, b) => place(a) - place(b) || b.drivers - a.drivers)[0];
  $("k-combos").textContent = fmtNum(p.combos.length);
  $("k-ranked").textContent = fmtNum(ranked.length);
  $("k-records").textContent = fmtNum(p.combos.filter((c) => c.rank === 1).length);
  $("k-podiums").textContent = fmtNum(p.combos.filter((c) => c.rank <= 3).length);
  if (best) {
    const st = standing(best.top_pct, best.rank, best.drivers);
    $("k-best").innerHTML = `<span class="${st.cls}">${esc(st.label)}</span>`;
  }
  $("tbarCount").textContent = p.combos.length === 1 ? t("home.count1") : t("home.count", { n: fmtNum(p.combos.length) });

  // Vous (repère « c'est moi » de ce navigateur) : vos temps sur les mêmes combos, à côté des siens.
  const mine = me && !isMe ? await mineP : null;
  const key = (c) => `${c.track}|${c.track_course}|${c.car_class}`;
  const myBy = new Map((mine?.combos ?? []).map((c) => [key(c), c]));
  const vs = !!mine;
  if (vs) {
    const common = p.combos.filter((c) => myBy.has(key(c)));
    const ahead = common.filter((c) => myBy.get(key(c)).time < c.time).length;
    const line = document.createElement("span");
    line.className = "tbar-vs";
    line.innerHTML = common.length ? t("profile.ahead", { a: fmtNum(ahead), n: fmtNum(common.length) }) : esc(t("profile.noCommon"));
    $("bar").appendChild(line);
  }

  // Une carte par circuit ; les circuits où il est le mieux placé d'abord.
  const byTrack = new Map();
  for (const c of p.combos) {
    if (!byTrack.has(c.track)) byTrack.set(c.track, []);
    byTrack.get(c.track).push(c);
  }
  const score = (c) => place(c) - c.drivers / 1e4;
  const groups = [...byTrack.entries()]
    .map(([track, list]) => ({ track, list: list.sort((a, b) => classRank(a.car_class) - classRank(b.car_class) || score(a) - score(b)) }))
    .sort((a, b) => Math.min(...a.list.map(score)) - Math.min(...b.list.map(score)));

  const head = `<colgroup><col class="c-go"><col class="c-class"><col><col class="c-time"><col class="c-rank"><col class="c-top"><col class="c-where"><col class="c-gap">${vs ? `<col class="c-you"><col class="c-vs">` : ""}</colgroup>
    <thead><tr><th class="c">${esc(t("col.detail"))}</th><th>${esc(t("col.class"))}</th><th>${esc(t("col.car"))}</th><th class="perf sep r">${esc(t("col.time"))}</th><th class="perf c">${esc(t("col.rank"))}</th><th class="perf">${esc(t("col.top"))}</th><th class="perf">${esc(t("col.where"))}</th><th class="perf r">${esc(t("col.gapFirst"))}</th>${vs ? `<th class="sep r">${esc(t("profile.you"))}</th><th class="r">${esc(t("profile.vsGap"))}</th>` : ""}</tr></thead>`;

  $("groups").innerHTML = groups
    .map(
      (g) => `<section class="cgroup">
      <div class="cg-head cg-static">${flagImg(g.track)}<span class="cg-name">${esc(g.track)}</span><span class="cg-n">${g.list.length}</span></div>
      <div class="lb-scroll"><table class="lb cg-table pf-table${vs ? " pf-vs" : ""}">${head}<tbody>${(() => {
        const { groups: courses, withHeaders } = groupByCourse(g.list, g.track, () => 1);
        // Vos colonnes : votre temps et place, votre écart (vert = vous êtes devant), « Comparer ».
        const vsCells = (c, url) => {
          const m = myBy.get(key(c));
          if (!m) return `<td class="sep r muted">—</td><td></td>`;
          const g = m.time - c.time;
          const cmpUrl = `${url}&${new URLSearchParams({ cmp: p.tag })}`;
          return `<td class="sep r mono">${fmtTime(m.time)} <span class="muted">${m.rank} / ${fmtNum(m.drivers)}</span></td>
            <td class="r mono"><span class="${g < 0 ? "vs-win" : g > 0 ? "vs-lose" : ""}">${g > 0 ? "+" : g < 0 ? "−" : "±"}${Math.abs(g).toFixed(3)}</span>
            <a class="cmp-link vs-cmp" href="${esc(cmpUrl)}" title="${esc(t("cmp.tip"))}" aria-label="${esc(t("cmp.tip"))}">${ICON_USERS}</a></td>`;
        };
        const renderRow = (c) => {
          const url = `/combo.html?${new URLSearchParams({ track: c.track, course: c.track_course, class: c.car_class })}`;
          const isRanked = c.drivers >= RANKED_MIN;
          // Position dès le 1er pilote ; sous 20 pilotes, l'effectif est en orange (provisoire).
          const st = standing(c.top_pct, c.rank, c.drivers);
          const pos = `<td class="perf c mono"${isRanked ? "" : ` title="${esc(t("home.pending", { n: c.drivers }))}"`}><b>${c.rank}</b> <span class="${isRanked ? "muted" : "prov-n"}">/ ${fmtNum(c.drivers)}</span></td>
               <td class="perf"><b class="${st.cls}">${esc(st.label)}</b></td>
               <td class="perf"><span class="gauge"><i style="left:${c.drivers <= 1 ? 0 : Math.round(((c.rank - 1) / (c.drivers - 1)) * 100)}%"></i></span></td>
               <td class="perf r mono gap">${c.rank === 1 ? "—" : "+" + c.gap_best.toFixed(3)}</td>`;
          return `<tr class="row-link" data-href="${esc(url)}">
          <td class="c go-cell">${detailLink(url)}</td>
          <td>${classBadge(c.car_class)}</td>
          <td><div class="car"><span class="logo-slot">${carImg(c.car_model)}</span><span class="car-txt"><span>${esc(c.car_model)}</span></span></div></td>
          <td class="perf sep r best-t mono">${fmtTime(c.time)}</td>
          ${pos}
          ${vs ? vsCells(c, url) : ""}
        </tr>`;
        };
        return courses
          .map((cg) => (withHeaders ? courseHeader(cg.course, vs ? 10 : 8) : "") + cg.rows.map((c) => renderRow(c, withHeaders)).join(""))
          .join("");
      })()}</tbody></table></div>
    </section>`,
    )
    .join("");

  // Toute la ligne ouvre le classement du combo (le lien reste le lien accessible).
  $("groups").addEventListener("click", (e) => {
    const tr = e.target.closest("tr.row-link");
    if (tr && !e.target.closest("a")) location.href = tr.dataset.href;
  });
})();
