/* ============================================================
   LMU Stats Viewer — logique du site de présentation
   Langue (FR/EN/ES/DE/IT), thème clair/sombre, galerie + lightbox,
   navigation active, version courante depuis GitHub.
   Aucune dépendance : ce fichier suffit.
   ============================================================ */
(function () {
  "use strict";

  var REPO = "cparfait/lmustatsviewer";
  // `.v3` : entrée horodatée ; les anciennes entrées (sans date) sont ignorées.
  var SS_RELEASE = "lmusv.release.v3";
  // Durée de vie du cache des versions : assez long pour épargner l'API GitHub
  // (60 requêtes/h sans compte), assez court pour qu'une nouvelle version
  // apparaisse sans fermer l'onglet.
  var RELEASE_TTL = 10 * 60 * 1000;

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ─────────────── Langue ─────────────── */

  /* La langue est choisie par ../boot.js (?lang=, choix mémorisé, navigateur, anglais) et
     changée depuis l'en-tête commun (../site.js), qui recharge la page : ici on traduit. */

  function applyLang(lang) {
    var dict = window.VITRINE_I18N[lang] || window.VITRINE_I18N.en;

    document.documentElement.lang = lang;

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var val = dict[key];
      if (val == null) return;

      var attr = el.getAttribute("data-i18n-attr");
      if (attr) { el.setAttribute(attr, val); return; }

      if (el.tagName === "TITLE") { document.title = val; return; }

      // Les libellés peuvent contenir un peu de balisage (<code>, <em>).
      if (val.indexOf("<") !== -1) el.innerHTML = val;
      else el.textContent = val;
    });

    labelShots(dict);

    // Les pages qui construisent du contenu en JS (la page des versions)
    // écoutent cet évènement pour se retraduire.
    document.dispatchEvent(new CustomEvent("lmusv:lang", { detail: lang }));
  }

  /**
   * Le bouton d'agrandissement reprend le titre de la capture qu'il ouvre.
   * Le gabarit vient de la traduction : la ponctuation varie d'une langue à
   * l'autre (« Agrandir : X » en français, « Enlarge: X » en anglais).
   */
  function labelShots(dict) {
    var tpl = dict["a11y.zoom"] || "{0}";
    document.querySelectorAll("#galleryGrid .shot").forEach(function (fig) {
      var btn = fig.querySelector(".shot-open");
      var strong = fig.querySelector("figcaption strong");
      if (btn && strong) btn.setAttribute("aria-label", tpl.replace("{0}", strong.textContent));
    });
  }

  /* ─────────────── Thème ─────────────── */

  /**
   * Les captures existent en deux variantes : <nom>-light.png / <nom>-dark.png.
   * Si une variante manque, on retombe sur l'autre thème plutôt que d'afficher
   * une image cassée — pratique tant qu'une seule série a été produite.
   * Le src n'est réécrit que s'il change vraiment, pour ne pas relancer de
   * téléchargement à chaque bascule. Seule exception : en thème clair, la
   * capture du hero part en « -dark » (valeur écrite dans le HTML) avant
   * d'être remplacée — une image chargée pour rien, au premier affichage.
   */
  function syncShots(theme) {
    var other = theme === "light" ? "dark" : "light";
    document.querySelectorAll("[data-shot]").forEach(function (img) {
      // Les captures de l'application sont en PNG (aplats, texte net) ; celles
      // prises dans le jeu en JPEG, où le PNG pèserait six fois plus lourd.
      var ext = "." + (img.dataset.ext || "png");
      var base = "assets/img/shots/" + img.dataset.shot + "-";
      var next = base + theme + ext;
      if (img.getAttribute("src") === next) return;
      img.onerror = function () {
        img.onerror = null;              // une seule tentative de repli
        img.src = base + other + ext;
      };
      img.src = next;
    });
  }

  /** Le thème est posé par ../boot.js et basculé par l'en-tête commun : on suit les captures. */
  function applyTheme(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#F4F5F8" : "#0B101F");
    syncShots(theme);
  }

  /* ─────────────── Galerie + lightbox ─────────────── */

  function initGallery() {
    var grid = document.getElementById("galleryGrid");
    var lb = document.getElementById("lightbox");
    if (!grid || !lb) return;   // page sans galerie (notes de version)

    var tabs = Array.prototype.slice.call(document.querySelectorAll("#galleryTabs .tab"));
    var shots = Array.prototype.slice.call(document.querySelectorAll("#galleryGrid .shot"));

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle("is-active", on);
          t.setAttribute("aria-selected", String(on));
        });
        var f = tab.dataset.filter;
        shots.forEach(function (s) {
          s.hidden = !(f === "all" || s.dataset.cat === f);
        });
      });
    });

    var lbImg = document.getElementById("lbImg");
    var lbText = document.getElementById("lbText");
    var lbCount = document.getElementById("lbCount");
    var lbClose = document.getElementById("lbClose");
    var lbPrev = document.getElementById("lbPrev");
    var lbNext = document.getElementById("lbNext");
    var index = 0;
    var opener = null;   // pour rendre le focus à la vignette d'origine

    function visibleShots() { return shots.filter(function (s) { return !s.hidden; }); }

    function show(i) {
      var list = visibleShots();
      if (!list.length) return;
      index = (i + list.length) % list.length;
      var fig = list[index];
      var img = fig.querySelector("img");
      var strong = fig.querySelector("figcaption strong");
      // Enfant direct : le titre peut lui-même contenir des <span> (marqueur
      // « bêta »), qu'il ne faut pas confondre avec la description.
      var span = fig.querySelector("figcaption > span");
      lbImg.src = img.src;
      lbImg.alt = strong ? strong.textContent : "";
      lbText.textContent = (strong ? strong.textContent : "") + (span ? " — " + span.textContent : "");
      lbCount.textContent = (index + 1) + " / " + list.length;
      var solo = list.length < 2;
      lbPrev.hidden = solo;
      lbNext.hidden = solo;
    }

    function open(i, from) {
      opener = from || null;
      show(i);
      lb.hidden = false;
      document.body.style.overflow = "hidden";
      lbClose.focus();
    }

    function close() {
      lb.hidden = true;
      lbImg.src = "";
      document.body.style.overflow = "";
      if (opener) { opener.focus(); opener = null; }
    }

    shots.forEach(function (fig) {
      var btn = fig.querySelector(".shot-open");
      if (!btn) return;
      btn.addEventListener("click", function () {
        open(visibleShots().indexOf(fig), btn);
      });
    });

    lbClose.addEventListener("click", close);
    lbPrev.addEventListener("click", function (e) { e.stopPropagation(); show(index - 1); });
    lbNext.addEventListener("click", function (e) { e.stopPropagation(); show(index + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target === lbImg) close(); });

    // Balayage horizontal sur mobile
    var touchX = null;
    lb.addEventListener("touchstart", function (e) { touchX = e.changedTouches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 45) show(index + (dx < 0 ? 1 : -1));
    }, { passive: true });

    document.addEventListener("keydown", function (e) {
      if (lb.hidden) return;
      if (e.key === "Escape") { close(); return; }
      if (e.key === "ArrowLeft") { show(index - 1); return; }
      if (e.key === "ArrowRight") { show(index + 1); return; }

      // Le focus reste dans la lightbox tant qu'elle est ouverte.
      if (e.key === "Tab") {
        var focusables = [lbClose, lbPrev, lbNext].filter(function (b) { return !b.hidden; });
        var pos = focusables.indexOf(document.activeElement);
        e.preventDefault();
        var next = e.shiftKey ? pos - 1 : pos + 1;
        if (next < 0) next = focusables.length - 1;
        if (next >= focusables.length) next = 0;
        focusables[next].focus();
      }
    });
  }

  /* ─────────────── Navigation : section active + ombre d'en-tête ─────────────── */

  function initNavState() {
    var header = document.querySelector(".site-header");

    // Liens de l'en-tête commun vers les sections de l'accueil (« /#features »…).
    var links = Array.prototype.slice.call(document.querySelectorAll(".nav a[href^='/#']"));
    // Toutes les sections : une section sans lien (Classements, qui a sa propre page) efface
    // le repère au lieu de laisser allumé celui de la section précédente.
    var sections = links.length ? Array.prototype.slice.call(document.querySelectorAll("main section[id]")) : [];

    function mark(id) {
      links.forEach(function (a) {
        a.setAttribute("aria-current", a.getAttribute("href") === "/#" + id ? "true" : "false");
      });
    }

    if ("IntersectionObserver" in window && sections.length) {
      // La zone active se situe dans le tiers haut de l'écran, juste sous l'en-tête.
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) mark(en.target.id); });
      }, { rootMargin: "-88px 0px -62% 0px", threshold: 0 });
      sections.forEach(function (s) { io.observe(s); });
    }

    var toTop = document.getElementById("toTop");
    if (!toTop) return;
    toTop.classList.add("is-hidden");
    toTop.hidden = false;
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        header.classList.toggle("is-stuck", y > 8);
        toTop.classList.toggle("is-hidden", y < 700);
        if (y < 120) mark("");   // en haut de page : aucun onglet actif
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ─────────────── Apparition au défilement ─────────────── */

  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });

    items.forEach(function (el, i) {
      // Léger décalage pour les éléments d'une même grille.
      el.style.transitionDelay = (i % 3) * 60 + "ms";
      io.observe(el);
    });
  }

  /* ─────────────── Version courante et lien direct ─────────────── */

  /**
   * La dernière version publiée est lue sur GitHub, puis mémorisée le temps de
   * l'onglet : aucun numéro n'est écrit en dur dans les pages. En cas d'échec
   * (hors ligne, quota d'API), le badge reste masqué et les boutons continuent
   * de pointer vers la page des versions.
   *
   * La page des notes de version récupère elle-même la liste complète et
   * appelle applyRelease() : inutile d'interroger l'API deux fois.
   */
  function applyRelease(rel) {
    if (!rel || !rel.version) return;

    var tag = document.getElementById("verTag");
    if (tag) {
      tag.textContent = rel.version;
      tag.hidden = false;
    }

    if (!rel.asset) return;
    document.querySelectorAll("[data-dl]").forEach(function (a) { a.href = rel.asset; });
  }

  function initRelease() {
    if (document.getElementById("clList")) return;   // géré par changelog.js

    var paint = applyRelease;
    var cached;
    try { cached = JSON.parse(sessionStorage.getItem(SS_RELEASE) || "null"); } catch (e) { cached = null; }
    if (cached && cached.data && Date.now() - cached.t < RELEASE_TTL) { paint(cached.data); return; }
    var stale = cached && cached.data;

    if (!window.fetch) { if (stale) paint(stale); return; }
    // La liste complète plutôt que /releases/latest : elle donne aussi le
    // cumul des téléchargements, pour une seule requête.
    fetch("https://api.github.com/repos/" + REPO + "/releases?per_page=100", {
      headers: { Accept: "application/vnd.github+json" }
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (json) {
        var published = (json || []).filter(function (r) { return !r.draft; });
        if (!published.length) return;

        var latest = published.filter(function (r) { return !r.prerelease; })[0] || published[0];
        var exe = (latest.assets || []).filter(function (a) { return /\.exe$/i.test(a.name); })[0];

        var rel = {
          version: String(latest.tag_name || "").replace(/^v/i, ""),
          asset: exe ? exe.browser_download_url : ""
        };
        if (!rel.version) return;
        try { sessionStorage.setItem(SS_RELEASE, JSON.stringify({ t: Date.now(), data: rel })); } catch (e) { /* ignoré */ }
        paint(rel);
      })
      // Hors ligne ou quota GitHub atteint : dernière valeur connue, sinon le repli du HTML.
      .catch(function () { if (stale) paint(stale); });
  }

  /* ─────────────── Surface publique ───────────────
     Le strict nécessaire pour changelog.js, qui partage le dépôt cible et
     réutilise l'affichage de la version. */
  window.LMUSV = {
    repo: REPO,
    applyRelease: applyRelease,
    lang: function () { return document.documentElement.lang || "en"; },
    dict: function () { return window.VITRINE_I18N[this.lang()] || window.VITRINE_I18N.en; }
  };

  /* ─────────────── Init ─────────────── */

  document.addEventListener("DOMContentLoaded", function () {
    // En-tête et pied de page communs à tout le site (../site.js), puis le contenu de la vitrine.
    // (`window.chrome` est aussi un objet natif de Chrome : on vérifie que site.js est bien là.)
    if (typeof window.chrome === "function") window.chrome();
    applyLang(document.documentElement.lang || "en");
    applyTheme(document.documentElement.getAttribute("data-theme") || "light");
    initGallery();
    initNavState();
    initReveal();
    initRelease();
    document.addEventListener("lmu:theme", function (e) { applyTheme(e.detail); });
  });
})();
