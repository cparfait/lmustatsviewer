// Thème et langue posés AVANT le premier rendu, sur toutes les pages (vitrine et
// classements) : pas de bascule de couleur visible au chargement. Fichier séparé :
// la CSP du site interdit les scripts en ligne.
(function () {
  "use strict";
  var root = document.documentElement;
  // JS actif : les effets d'apparition de la vitrine ne s'appliquent qu'ici, pour que le
  // contenu reste visible si les scripts ne se chargent pas.
  root.classList.add("js");
  var langs = ["fr", "en", "es", "de", "it"];
  try {
    // Palette de l'app : clair par défaut, sombre au choix.
    root.setAttribute("data-theme", localStorage.getItem("lmu-theme") === "dark" ? "dark" : "light");
    // Langue : ?lang= d'un lien direct (retenu) > choix mémorisé > navigateur > anglais.
    // Une langue simplement devinée n'est jamais mémorisée : le site suit le navigateur.
    var q = (new URLSearchParams(location.search).get("lang") || "").toLowerCase();
    var l = langs.indexOf(q) !== -1 ? q : "";
    if (l) localStorage.setItem("lmu-lang", l);
    if (!l) {
      var stored = localStorage.getItem("lmu-lang");
      if (langs.indexOf(stored) !== -1) l = stored;
    }
    if (!l) {
      var nav = navigator.languages || [navigator.language || "en"];
      for (var i = 0; i < nav.length && !l; i++) {
        var c = String(nav[i]).slice(0, 2).toLowerCase();
        if (langs.indexOf(c) !== -1) l = c;
      }
    }
    root.lang = l || "en";
    root.setAttribute("data-lang", root.lang);
  } catch (e) {
    /* stockage indisponible : valeurs du HTML */
  }
})();
