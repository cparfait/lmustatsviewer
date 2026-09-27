// Fiche pilote : son rang sur chaque combo. Un pilote anonyme n'a pas de fiche.
/* global getMe, setMe, standing, t, esc, api, fmtTime, fmtNum, flagImg, carImg, classBadge, chrome, dataReady */
"use strict";

chrome();

(async () => {
  const tag = new URLSearchParams(location.search).get("tag") || "";
  let p;
  try {
    [p] = await Promise.all([api("drivers/profile", { tag }), dataReady]);
  } catch {
    document.getElementById("notice").innerHTML = `<p class="notice">${esc(t("offline"))}</p>`;
    return;
  }
  if (!p) {
    document.getElementById("notice").innerHTML = `<div class="empty"><b>${esc(t("profile.none"))}</b><a href="/">${esc(t("back"))}</a></div>`;
    return;
  }
  document.title = `${p.name} — LMU Stats Viewer`;
  document.getElementById("head").hidden = false;
  document.getElementById("tablePanel").hidden = false;
  document.getElementById("avatar").textContent = (p.name || "?").trim().charAt(0).toUpperCase();
  document.getElementById("tbarName").textContent = p.name;
  document.getElementById("tbarCount").textContent = `${p.combos.length} combos`;
  document.getElementById("name").innerHTML = esc(p.name) + (p.homonym ? ` <span class="muted" style="font-size:1rem">${esc(p.tag)}</span>` : "");
  // « C'est moi » : ce navigateur épinglera ce pilote en haut des classements.
  const isMe = getMe() === p.tag;
  const meBox = document.createElement("div");
  meBox.style.marginLeft = "auto";
  meBox.innerHTML = isMe
    ? `<span class="muted" style="font-size:.85rem">${esc(t("me.saved"))}</span> <button class="btn btn-ghost btn-sm" id="meToggle">${esc(t("me.clear"))}</button>`
    : `<button class="btn btn-primary btn-sm" id="meToggle">${esc(t("me.set"))}</button>`;
  document.getElementById("avatar").parentElement.appendChild(meBox);
  meBox.querySelector("#meToggle").addEventListener("click", () => { setMe(isMe ? "" : p.tag); location.reload(); });
  // Combos classés (≥ 20 pilotes) d'abord, par top % ; puis les provisoires, les plus fournis d'abord.
  const RANKED_MIN = 20;
  p.combos.sort((a, b) => {
    const ra = a.drivers >= RANKED_MIN, rb = b.drivers >= RANKED_MIN;
    if (ra !== rb) return ra ? -1 : 1;
    return ra ? a.top_pct - b.top_pct : b.drivers - a.drivers;
  });
  document.getElementById("rows").innerHTML = p.combos
    .map((c) => {
      const url = `/combo.html?${new URLSearchParams({ track: c.track, course: c.track_course, class: c.car_class, ...(c.version === "all" ? { version: "all" } : {}) })}`;
      return `
      <tr>
        <td><a href="${esc(url)}" style="text-decoration:none">${flagImg(c.track)} <b>${esc(c.track_course)}</b></a></td>
        <td>${classBadge(c.car_class)}</td>
        <td><div class="car">${carImg(c.car_model)}<span>${esc(c.car_model)}</span></div></td>
        <td class="t">${fmtTime(c.time)}${c.version === "all" ? `<br><span class="muted" style="font-size:.72rem;font-weight:500">${esc(t("versions.all"))}</span>` : ""}</td>
        <td class="mono"><b>${c.rank}</b> <span class="muted">/ ${fmtNum(c.drivers)}</span></td>
        <td style="white-space:nowrap">${c.drivers >= RANKED_MIN ? `<b class="${standing(c.top_pct, c.rank, c.drivers).cls}">${esc(standing(c.top_pct, c.rank, c.drivers).label)}</b>` : `<span class="muted">${esc(t("provisional.short", { n: c.drivers }))}</span>`}</td>
        <td class="gap">${c.rank === 1 ? "—" : "+" + c.gap_best.toFixed(3)}</td>
      </tr>`;
    })
    .join("");
})();
