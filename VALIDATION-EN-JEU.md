# À valider en jeu (mise à jour : 2026-10-18)

Liste de ce qui n'a pas encore pu être vérifié en roulant, regroupée par moment
de séance pour être suivie au volant. Coche au fur et à mesure ; ce qui ne
colle pas est à signaler (capture d'écran + moment de la séance).

**Avant de commencer**
- Lancer l'app de dev (`npm run tauri dev`) **et fermer la version installée** :
  elles partagent le dossier des tracés et le profil WebView2.
- La reconnaissance vocale (Vosk) est compilée d'office : il suffit d'avoir
  téléchargé le modèle de la langue (Configuration › Audio / Voix).

---

## 00. Annonces de course 2026-10-18 (branche `feat/radio-parity`)

Rien de cette section n'a encore roulé : tout a été vérifié par les tests (TS et
Rust) et par une capture synthétique rejouée, pas dans le jeu.

**Lecture du jeu**
- [ ] Page Live : aucun voyant « Données LMU » orange en séance normale (sinon, noter
      la version du jeu : disposition de `LMU_Data` changée).
- [ ] Zone « Rules » lue : en course, ouvrir Configuration › Maintenance › Capture,
      enregistrer 30 s, rejouer → la page Live se rejoue (voyant « Rejeu »).
- [ ] Centre de messages : une coupure sanctionnée → « Stop and go reçu : coupure de
      piste » (ou drive-through) au lieu de « Pénalité reçue » ; « Pénalité purgée » à
      la sortie du stop & go. **Vérifier si le jeu traduit ces messages** quand son
      interface est en français (les textes reconnus sont ceux du jeu en anglais).
- [ ] Limites de piste : « 1 sur 4 », … puis « la prochaine coûte une pénalité ».
- [ ] Mauvais sens (faire demi-tour en essais) → « Mauvais sens ! ».
- [ ] Course de nuit : « Phares obligatoires » à l'heure dite par le jeu.

**Neutralisations**
- [ ] Départ lancé avec formation : « Tu pars de la place N, colonne … » puis
      « Suis X » ; « Recolle à X » si on traîne ; « Laisse passer X » si on double.
- [ ] Full course yellow / voiture de sécurité : « Voiture de sécurité en piste »,
      « Stands fermés / ouverts », « elle rentre ce tour », « Relance ».
- [ ] Course en ligne : la zone « Rules » est-elle remplie (participants) ? Sinon,
      seules la voiture de sécurité et la relance sont annoncées.

**Stands**
- [ ] Écritures activées : « plein jusqu'à la fin », « ajoute 20 litres », « énergie à
      85 », « change les quatre pneus », « pneus avant », « mets des pneus pluie »,
      « répare tout », « purge la pénalité », « programme du stand » → le menu du jeu
      change et la radio confirme. Écritures coupées → la radio le dit, rien ne change.
- [ ] Les libellés du menu varient selon la voiture (Hypercar, LMP2, GT3) : tester
      les trois.
- [ ] Endurance avec équipier : « box occupé : X est dedans » quand il est au box.
- [ ] Sortie des stands avec trafic → « Trafic à la sortie des stands ».

**Pneus, fin de course, choc**
- [ ] Perte de pression (crevaison lente) → annoncée sans fausse alerte en virage.
- [ ] Fenêtre de pression renseignée → bilan après 2 tours, une fois par relais.
- [ ] Sortie dans l'herbe → « Pneus sales » ; gros blocage → « possible plat ».
- [ ] Choc avec arrêt → « Tu vas bien ? », puis « on repart » en roulant.
- [ ] Derniers tours avec un rival proche → « attaque » / « défends » (une fois).

**Son, volant, coach**
- [ ] Sortie audio choisie : la radio sort sur le casque, le jeu sur les enceintes.
- [ ] Son du jeu baissé pendant la radio et pendant le push-to-talk, rendu après ;
      **tuer l'app pendant une annonce** puis la relancer → le jeu retrouve son volume.
- [ ] Boutons du volant : sourdine, répète, statut, volume ±, spotter, accusé du box.
- [ ] Note vocale : bouton maintenu → « Note enregistrée pour le virage N » ; au tour
      suivant elle est rejouée ~3 s avant le virage.
- [ ] Coach sur Spa / Monza : « Virage 1, La Source » au lieu du numéro du coach.
- [ ] Piper sous forte charge (OBS en encodage CPU) : spotter et alertes sans retard.
- [ ] Mode cohabitation avec un autre ingénieur radio lancé : plus de spotter ni
      d'annonces en doublon ; stratégie et météo toujours là.

**Sécurité de l'app (build de release)**
- [ ] CSP (`tauri.conf.json`) : sur une version **installée**, toutes les pages
      s'affichent, la voix marche, le classement communautaire et ohne_speed se
      chargent. En cas de souci : remettre `"csp": null` et le signaler.
      *2026-10-18 — test de fumée sur un build compilé (`tauri build --debug
      --no-bundle`, CSP de prod, `http://tauri.localhost`) : aucune violation CSP ;
      toutes les pages s'affichent (télémétrie 2D/3D comprise), classement
      communautaire et ohne_speed chargés, réglages Annonces / Son / Parler, rapport
      de bug, capture et rejeu, widget Radio (aussi par adresse) OK. Reste à
      vérifier : version **installée**, voix (Piper et IA) et voyants de la page Live
      en jeu.*

---

## 0. Veille 2026-10-17 (branche `feat/veille-pistes`, options à activer)

- [ ] `/overlays` › Widgets par adresse : activer, ouvrir une adresse dans un navigateur
      pendant une séance → le widget bouge en direct ; dans OpenKneeboard (onglet Web
      Dashboard) le panneau prend la taille du widget ; dans OBS (source Navigateur) le
      fond est **transparent**.
- [ ] Configuration › Préférences › Analyse : bips de record (1 bip après un record perso,
      2 si meilleur tour de la classe en séance) ; aucun bip après un tour avec limites de
      piste ou passage aux stands.
- [ ] Repère de revue : bouton du volant assigné **et** push-to-talk toujours fonctionnel ;
      le repère apparaît dans Séances › détail › Incidents.
- [ ] Live › Classement › Briefing (Configuration › Communauté) : le bon tracé et la bonne
      classe sont reconnus (titre de l'encart) sur 3 circuits différents.
- [ ] Configuration › Outils & diagnostic : « Plein écran exclusif » / « Sans bordure »
      correspondent bien au réglage du jeu ; un outil ajouté se lance au démarrage de LMU.
- [ ] Séance en ligne réindexée : badge « Comparable » avec le nom du serveur.

## 1. Au garage (essais, voitures IA en piste)

- [ ] Page Live : point « API du jeu » **vert** ; l'infobulle indique les sources.
- [ ] Carte Live **complète dès l'ouverture**, voie des stands dessinée, sans corde.
- [ ] Carte : tracé **plus large que haut**, ligne de départ en bas ; même
      orientation sur l'overlay Track Map et sur la carte de télémétrie.
      Réglage « Cartes : nord en haut » (Configuration › options Live) → retour
      à l'ancienne orientation.
- [ ] Voitures colorées **par classe** sur la carte Live.
- [ ] Petits points gris le long de la voie des stands (emplacements lus dans le
      jeu) : noter **à quoi ils correspondent** (box d'arrêt ? garages ?) — deux
      séries existent (types 2-53 et 106-159), leur rôle n'est pas confirmé.
- [ ] **Road Atlanta** : numéros de virages affichés (1-9, 10A, 10B, 11, 12) →
      vérifier **chaque numéro contre la carte officielle du circuit**. Un seul
      numéro mal placé = à signaler (la table sera retirée).
- [ ] Long Beach : **aucun** numéro affiché (9 virages détectés pour 11 officiels)
      → comportement attendu. Idem sur tout circuit sans fiche (Le Mans, Fuji,
      Portimão, Paul Ricard).
- [ ] Autres circuits avec fiche (Spa, Monza, COTA, Silverstone, Lusail, Sebring,
      Interlagos, Imola, Bahreïn, Barcelone, Laguna Seca, Daytona) : noter si les
      numéros s'affichent et s'ils sont justes.
- [ ] Écran « Réparations et ravitaillement » : sélectionner **carburant + pneus**
      → noter la durée d'arrêt affichée par le jeu (`pitStopLength`).

## 2. Régie tablette

- [ ] Configuration › Régie tablette → activer : **alerte du pare-feu Windows** →
      autoriser sur le réseau privé.
- [ ] Sur la tablette : scanner le QR code (ou taper l'adresse), saisir le code
      → la page s'ouvre.
- [ ] Les 5 onglets avec des données réelles : Classement, Ingénieur (carburant,
      énergie, plaquettes, pneus), Carte, Duel, TV.
- [ ] Code faux 5 fois → message « trop d'essais » ; le bon code marche après 1 min.
- [ ] Désactiver la régie → la tablette affiche « connexion perdue ».
- [ ] Redémarrer l'app avec la régie activée → elle se relance (nouveau code).
- [ ] **Écran allumé** (téléphone Android et iPhone/iPad, page en HTTP) : laisser la
      régie ouverte 5 min sans toucher → l'écran ne s'éteint pas (repli vidéo muette ;
      réglage « Garder l'écran allumé » coupé → il s'éteint comme avant).
- [ ] Plein écran sur Android → l'orientation reste bloquée en tournant l'appareil
      (réglage « Bloquer l'orientation » coupé → elle suit l'appareil).
- [ ] iPhone : bouton plein écran → message « Partager › Sur l'écran d'accueil » ;
      ajout à l'écran d'accueil → icône LMU SV, ouverture sans barre, pas de nouveau
      code tant que la régie tourne.
- [ ] Téléphone en hauteur : onglets en bas, classement sans défilement en largeur,
      balayage gauche/droite ; couché : une seule barre en haut.
- [ ] Écran **Pédales** en roulant : barres et trace fluides sur le Wi-Fi (pas de
      saccade), rapport / régime / volant justes, TC / ABS / répartition comme en jeu.
- [ ] Écran **Drapeaux** : vert, jaune / FCY, voiture de sécurité, drapeau bleu,
      damier ; « Stands fermés / ouverts » pendant une neutralisation ; limiteur et
      vitesse des stands ; menu des stands identique à celui du jeu.
- [ ] Écran **Pneus** : températures, pressions et usure cohérentes avec la page Live.
- [ ] Réglages › Écrans affichés : en masquer plusieurs → onglets et balayage suivent.

## 3. En piste (premiers tours)

- [ ] Voiture **sans** énergie virtuelle : conso « jeu » au 1er tour, puis
      « mesurée » (infobulle du point « API du jeu »).
- [ ] Carte : surcouche **Vitesse** après un tour complet ; **Écart** après un
      2ᵉ tour (vert = gagné, rouge = perdu face au meilleur tour).
- [ ] Carte : surcouche **Duel** → cliquer une voiture proche : zones vertes /
      rouges cohérentes avec qui va plus vite (mini-secteurs de ~350 m).
- [ ] Repères de secteurs S1 / S2 / S3 au bon endroit.
- [ ] **Plaquettes** : alerte à 25 % puis 10 % (long relais) ; question vocale
      « plaquettes ? » → pourcentages avant / arrière + « tiendront / à changer ».
- [ ] Dégâts (petit choc) : « suspension touchée, avant gauche… », dégâts aéro.

## 4. Notation des annonces (radio)

- [ ] Juste après une annonce, dire « inutile » → réponse « Noté : Inutile ».
- [ ] Idem « utile », « trop tard », « faux » (et dans une autre langue si utilisée).
- [ ] Sans annonce récente (> 2 min) → « Rien à noter ».
- [ ] Bouton **Radio** (page Live) → liste des annonces de la séance, notes
      modifiables, cumul par type ; après 3 « inutile » sur un même type, il
      est marqué « plus rare » et revient moins souvent en piste.
- [ ] Une annonce de sécurité (drapeau, dégâts, box) reste dite même notée « inutile ».

## 5. Course (avec tour de formation)

- [ ] Pendant la formation : durée de course connue (`rest_used.sessionEnd` =
      « game », temps restant affiché avant le vert).
- [ ] Arrêt **réel** avec carburant + pneus : perte au stand mesurée, temps de
      voie enregistré ; à l'arrêt suivant, « où je ressors ? » suit le menu choisi.
- [ ] Météo variable : chance de pluie **≠ 0** dans la prévision du jeu, annonce
      « pluie dans … ».

## 6. Fonctions du jour encore jamais testées en jeu

- [ ] Carte des incidents / temps forts (㉘ ㉝) : seuils d'impact et surfaces
      (contact, sortie, limites de piste) cohérents.
- [ ] Écritures dans le jeu (⑲ ㉞, **opt-in**, désactivées par défaut) : réglage
      du menu des stands depuis la page Stratégie ; énergie automatique.
      Jamais testées contre le vrai jeu — à faire avec une sauvegarde.
- [ ] Assistant setup (㉕) : fiche setup à l'écran (nécessite l'app Tauri).
- [ ] Voix : double lecture `ptt_end_dual` + secours strict, si possible avec
      du bruit (moteur, casque ouvert).
- [ ] Voix en ligne : « Préparer la voix » avec une vraie clé, puis 10 min de
      roulage (annonces préparées sans latence).
- [ ] Piper sous forte charge CPU (et avec un encodage OBS en CPU).
