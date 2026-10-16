# À valider en jeu (mise à jour : 2026-10-16)

Liste de ce qui n'a pas encore pu être vérifié en roulant, regroupée par moment
de séance pour être suivie au volant. Coche au fur et à mesure ; ce qui ne
colle pas est à signaler (capture d'écran + moment de la séance).

**Avant de commencer**
- Lancer l'app de dev (`npm run tauri dev`) **et fermer la version installée** :
  elles partagent le dossier des tracés et le profil WebView2.
- Pour tester la voix (questions « plaquettes ? », « utile », etc.), il faut le
  build avec la reconnaissance vocale (feature `stt`, cf. SUIVI §7).

---

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
