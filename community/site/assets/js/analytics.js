/* ============================================================
   LMU Stats Viewer — mesure d'audience (GoatCounter)

   GoatCounter ne dépose aucun cookie et ne conserve aucune donnée
   personnelle : pas de bandeau de consentement à prévoir.

   Tant que CODE est vide, ce fichier ne fait strictement rien —
   le site fonctionne à l'identique.
   ============================================================ */
(function () {
  "use strict";

  /* ─── À RENSEIGNER ───────────────────────────────────────────
     Code du site GoatCounter : c'est le sous-domaine choisi à la
     création du compte sur https://www.goatcounter.com.
     Pour https://cparfait.goatcounter.com → CODE = "cparfait".
     ──────────────────────────────────────────────────────────── */
  var CODE = "cparfait";

  /* Respecter le signal « Do Not Track » du navigateur. Cohérent avec le
     propos du site, au prix de quelques visites non comptées. */
  var HONOUR_DNT = true;

  if (!CODE) return;

  // Les essais ne doivent pas polluer les statistiques : ni en local, ni
  // depuis le réseau interne (le site tourne derrière un reverse proxy, on
  // n'y accède par son IP privée que pour le tester).
  var host = location.hostname;
  if (location.protocol === "file:" || !host ||
      host === "localhost" || host === "127.0.0.1" || host === "[::1]" ||
      /\.local$/.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return;

  if (HONOUR_DNT &&
      (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.msDoNotTrack === "1")) return;

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.setAttribute("data-goatcounter", "https://" + CODE + ".goatcounter.com/count");
  document.head.appendChild(s);

  /* ─── Clics sur « Télécharger » ───────────────────────────────────────────
     Les statistiques GitHub donnent le total des installeurs récupérés, toutes
     provenances confondues. Ce compteur-ci répond à une autre question : parmi
     les visiteurs du site, combien repartent avec l'application ?

     Chaque bouton porte sa provenance dans `data-dl`, ce qui permet de voir
     lequel convertit — celui du hero, celui de la page d'installation, ou le
     rappel de fin de page. Ils apparaissent comme des évènements distincts
     dans le tableau de bord.
     ──────────────────────────────────────────────────────────────────────── */
  document.addEventListener("click", function (e) {
    var lien = e.target && e.target.closest ? e.target.closest("[data-dl]") : null;
    if (!lien || !window.goatcounter || !window.goatcounter.count) return;

    var origine = lien.getAttribute("data-dl") || "autre";
    window.goatcounter.count({
      path: "telechargement/" + origine,
      title: "Clic Télécharger — " + origine,
      event: true
    });
  });
})();
