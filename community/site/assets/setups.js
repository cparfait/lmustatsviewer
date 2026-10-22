// Setups publiés par les pilotes depuis l'app (fiche d'un setup › Partager). Page pas encore
// liée depuis le menu : elle arrive avec l'app 1.0.10. `?tests=1` montre aussi les
// publications d'essai (apps de développement et bêtas), jamais listées sinon.
/* global t, esc, api, fmtTime, fmtNum, fmtDate, flagImg, carImg, classBadge, chrome, dataReady, filterBar, bindFilterBar, driverName */
"use strict";

const $ = (id) => document.getElementById(id);
const REPO = "cparfait/lmustatsviewer";

chrome();

const params = new URLSearchParams(location.search);
const tests = params.get("tests") === "1";
const state = { car: params.get("car") || "all", track: params.get("track") || "all" };
const extra = tests ? { tests: 1 } : {};

/** « v1.0.9 » ou « 1.0.10 » → [1, 0, 10] ; `null` si illisible. */
const triple = (v) => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || "").trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const older = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};

/**
 * Bandeau « arrive avec la prochaine mise à jour » : tant que la dernière version publiée
 * de l'app (GitHub) est antérieure à la première qui publie des setups. Il disparaît
 * tout seul à la sortie de cette version (rien n'est affiché si GitHub ne répond pas).
 */
async function soonBanner(since) {
  const min = triple(since);
  if (!min) return;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return;
    const latest = triple((await res.json()).tag_name);
    if (latest && older(latest, min)) $("soon").hidden = false;
  } catch {
    /* GitHub injoignable : pas de bandeau */
  }
}

function syncUrl() {
  const q = new URLSearchParams();
  if (state.car !== "all") q.set("car", state.car);
  if (state.track !== "all") q.set("track", state.track);
  if (tests) q.set("tests", "1");
  history.replaceState(null, "", `${location.pathname}${q.toString() ? "?" + q : ""}`);
}

function card(s) {
  const meta = [
    `${flagImg(s.track)}${esc(s.track)}`,
    esc(s.car_model),
    esc(s.setup_type),
    s.best_lap ? `<b class="mono">${esc(fmtTime(s.best_lap))}</b>` : "",
    s.game_version ? esc(s.game_version) : "",
  ].filter(Boolean);
  const stats = [
    `<span class="su-author">${esc(t("su.by"))} ${driverName(s.author, true, s.car_class)}</span>`,
    s.versions > 1 ? esc(t("su.versions", { n: s.versions })) : "",
    esc(t(s.downloads === 1 ? "su.dl1" : "su.dls", { n: fmtNum(s.downloads) })),
    esc(fmtDate(String(s.created_at).slice(0, 10))),
  ].filter(Boolean);
  return `
    <article class="panel su-card">
      <div class="su-head">
        ${carImg(s.car_model)}
        <div class="su-title"><b>${esc(s.name)}</b> <span class="muted">v${esc(s.version)}</span></div>
        ${classBadge(s.car_class)}
      </div>
      <div class="su-meta">${meta.join(" · ")}</div>
      <div class="su-meta muted">${stats.join(" · ")}</div>
      ${s.notes ? `<p class="su-notes">${esc(s.notes)}</p>` : ""}
      <div class="su-actions"><button type="button" class="btn btn-sm" data-dl="${esc(s.id)}">${esc(t("su.download"))}</button></div>
    </article>`;
}

/** Fichier `.svm` téléchargé dans le navigateur (compte un téléchargement). */
async function download(id, btn) {
  btn.disabled = true;
  try {
    const item = await api("setups/item", { id, download: 1 });
    if (!item) throw new Error("not_found");
    const url = URL.createObjectURL(new Blob([item.svm], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${item.name}.svm` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    btn.textContent = t("offline");
  } finally {
    btn.disabled = false;
  }
}

async function loadList() {
  const list = $("list");
  let r;
  try {
    r = await api("setups", { ...extra, car: state.car !== "all" ? state.car : null, track: state.track !== "all" ? state.track : null });
  } catch {
    list.innerHTML = `<p class="notice">${esc(t("offline"))}</p>`;
    return;
  }
  const rows = r?.setups ?? [];
  $("count").textContent = rows.length === 1 ? t("su.count1") : t("su.count", { n: fmtNum(rows.length) });
  list.innerHTML = rows.length
    ? rows.map(card).join("")
    : `<div class="empty"><b>${esc(t("su.emptyT"))}</b>${esc(t("su.emptyD"))}</div>`;
  list.querySelectorAll("[data-dl]").forEach((b) => b.addEventListener("click", () => void download(b.dataset.dl, b)));
}

(async () => {
  if (tests) $("testsOn").hidden = false;
  let facets;
  try {
    [facets] = await Promise.all([api("setups/facets", extra), dataReady]);
  } catch {
    $("list").innerHTML = `<p class="notice">${esc(t("offline"))}</p>`;
    return;
  }
  void soonBanner(facets?.since);
  const cars = facets?.cars ?? [];
  const tracks = facets?.tracks ?? [];
  if (!cars.some((c) => c.car_folder === state.car)) state.car = "all";
  if (!tracks.some((x) => x.track === state.track)) state.track = "all";
  const filters = $("filters");
  filters.innerHTML = filterBar([
    {
      key: "car",
      label: t("su.f.car"),
      value: state.car,
      options: [["all", t("su.all")], ...cars.map((c) => [c.car_folder, `${c.car_model} (${c.car_class})`])],
    },
    { key: "track", label: t("su.f.track"), value: state.track, options: [["all", t("su.allTracks")], ...tracks.map((x) => [x.track, x.track])] },
  ]);
  bindFilterBar(filters, (key, value) => {
    state[key] = value;
    syncUrl();
    void loadList();
  });
  await loadList();
})();
