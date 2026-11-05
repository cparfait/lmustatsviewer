// Setups publiés par les pilotes depuis l'app (fiche d'un setup › Partager). Page pas encore
// liée depuis le menu : elle arrive avec l'app 1.0.10. `?tests=1` montre aussi les
// publications d'essai (apps de développement et bêtas), jamais listées sinon.
/* global t, esc, api, fmtTime, fmtNum, fmtDate, classBadge, carImg, flagImg, chrome, dataReady, filterBar, bindFilterBar, driverName */
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

const DL_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>';

/**
 * Les setups en tableau, au style des classements : classe, setup (version, type et notes
 * dessous), voiture, circuit, meilleur tour, tours roulés par l'auteur, auteur,
 * téléchargements, version du jeu, date, bouton. Le tableau défile en largeur sur mobile.
 */
function setupsTable(rows) {
  const head = `<thead><tr>
      <th>${esc(t("col.class"))}</th><th>${esc(t("su.colSetup"))}</th><th>${esc(t("col.car"))}</th><th>${esc(t("col.track"))}</th>
      <th class="perf sep r">${esc(t("kpi.best"))}</th><th class="perf r">${esc(t("su.colLaps"))}</th>
      <th>${esc(t("su.colAuthor"))}</th><th class="r">${esc(t("su.colDl"))}</th><th class="sep c" title="${esc(t("su.gameVer"))}">${esc(t("col.version"))}</th>
      <th class="r">${esc(t("col.date"))}</th><th class="c"></th></tr></thead>`;
  const cols = `<colgroup><col class="su-c-class"><col><col><col class="su-c-track"><col class="su-c-time"><col class="su-c-laps"><col class="su-c-who"><col class="su-c-dl"><col class="su-c-ver"><col class="su-c-date"><col class="su-c-btn"></colgroup>`;
  return `<div class="panel lb-panel su-panel"><div class="lb-scroll"><table class="lb cg-table su-table">${cols}${head}<tbody>${rows.map(row).join("")}</tbody></table></div></div>`;
}

function row(s) {
  const lapTip = [t("su.bestLap"), s.game_version ? `${t("su.gameVer")} : ${s.game_version}` : ""].filter(Boolean).join("\n");
  const dls = t(s.downloads === 1 ? "su.dl1" : "su.dls", { n: fmtNum(s.downloads) });
  const sub = [s.setup_type, s.notes ? s.notes.replace(/\s+/g, " ") : ""].filter(Boolean).join(" · ");
  const tip = [s.name, s.setup_type, s.notes, s.versions > 1 ? t("su.versions", { n: s.versions }) : ""].filter(Boolean).join("\n");
  return `<tr>
      <td>${classBadge(s.car_class)}</td>
      <td class="su-name" title="${esc(tip)}"><div class="su-ell"><b>${esc(s.name)}</b> <span class="muted">v${esc(s.version)}</span></div><div class="su-ell su-sub muted">${esc(sub)}</div></td>
      <td title="${esc(s.car_model)}"><div class="car"><span class="logo-slot">${carImg(s.car_model)}</span><span class="car-txt"><span>${esc(s.car_model)}</span></span></div></td>
      <td title="${esc(s.track)}"><span class="su-track">${flagImg(s.track)}${esc(s.track)}</span></td>
      <td class="perf sep r best-t mono" title="${esc(lapTip)}">${s.best_lap ? esc(fmtTime(s.best_lap)) : "—"}</td>
      <td class="perf r mono">${lapsLine(s) || '<span class="muted">—</span>'}</td>
      <td class="pilot" title="${esc(s.author.name || t("anon", { tag: s.author.tag }))}">${driverName(s.author, true, s.car_class)}</td>
      <td class="r mono" title="${esc(dls)}"><span class="su-dls">${DL_SVG}${esc(fmtNum(s.downloads))}</span></td>
      <td class="sep c">${s.game_version ? `<span class="ver">v${esc(s.game_version)}</span>` : '<span class="muted">—</span>'}</td>
      <td class="r muted su-date">${esc(fmtDate(String(s.created_at).slice(0, 10)))}</td>
      <td class="c"><button type="button" class="btn btn-primary btn-sm su-dl" data-dl="${esc(s.id)}" title="${esc(`${t("su.download")}\n${t("su.hint")}`)}" aria-label="${esc(t("su.download"))}">${DL_SVG}</button></td>
    </tr>`;
}

/** Fichier `.svm` téléchargé dans le navigateur (compte un téléchargement). */
async function download(id, btn) {
  btn.disabled = true;
  try {
    const item = await api("setups/item", { id, download: 1 });
    if (!item) throw new Error("not_found");
    const url = URL.createObjectURL(new Blob([item.svm], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${asciiFileName(item.name)}.svm` });
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

/**
 * Tours roulés avec ce setup chez son auteur (setup chargé reconnu en piste par l'app),
 * sous le meilleur tour ; rien pour une publication d'une app plus ancienne.
 */
function lapsLine(s) {
  if (!s.laps) return "";
  const laps = t(s.laps === 1 ? "su.lap1" : "su.laps", { n: fmtNum(s.laps) });
  const wet = s.wet_laps ? `<small class="muted">${esc(t("su.wet", { n: fmtNum(s.wet_laps) }))}</small>` : "";
  const tip = [t("su.lapsTip"), s.clean_laps != null ? t("su.clean", { n: fmtNum(s.clean_laps) }) : ""].filter(Boolean).join("\n");
  return `<span class="su-laps" title="${esc(tip)}"><span>${esc(laps)}</span>${wet}</span>`;
}

/**
 * Nom de fichier en ASCII, comme dans l'app : accents retirés, « · » et tirets longs en
 * « - », le reste hors ASCII retiré (le jeu peut ne pas lister au garage un nom accentué).
 */
function asciiFileName(name) {
  const special = { æ: "ae", Æ: "AE", œ: "oe", Œ: "OE", ß: "ss", ø: "o", Ø: "O", ł: "l", Ł: "L", "·": "-", "–": "-", "—": "-", "’": "'" };
  const out = [...String(name)]
    .map((c) => {
      if (c.charCodeAt(0) < 128) return c;
      if (special[c]) return special[c];
      const base = c.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return base && [...base].every((x) => x.charCodeAt(0) < 128) ? base : " ";
    })
    .join("");
  return out.replace(/[\\/:*?"<>|]/g, " ").split(/\s+/).filter(Boolean).join(" ") || "setup";
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
    ? setupsTable(rows)
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
