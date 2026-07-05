# Coach live par virage — Spécification v2 (post-V1.0)

> Statut : **spec approfondie, non implémentée**. À réaliser après la publication de la V1.0.
> La v1 de cette spec a été **vérifiée ligne par ligne contre le code** (5 audits) et
> critiquée sous 3 angles (pédagogie du coaching, robustesse ingénierie, complétude
> produit). Cette v2 intègre le tout. Les faits sont cités `fichier:ligne`.

Objectif : un coach qui commente le pilotage **virage par virage** pendant le roulage
(freinage, vitesse de passage, réaccélération…), en s'appuyant sur toutes les sources
disponibles — et qui **coache un humain** (fenêtrage cognitif, un focus à la fois,
renforcement positif), au lieu d'annoncer des fautes.

---

## 0. Corrections factuelles vs v1 (vérifiées contre le code)

Ces faits conditionnent toute l'architecture — la v1 se trompait ou était optimiste :

| # | La v1 disait | Réalité vérifiée |
|---|---|---|
| 1 | « mémoire partagée 50 Hz » | Le thread de polling émet à **20 Hz** (sleep 50 ms, `live.rs:1440`). Pire : `lap_dist` et `current_lap_time` viennent du bloc **scoring** (`live.rs:1040, 1124`), rafraîchi par rafales (~5 Hz documenté `live.rs:898-903`). À 300 km/h : 4,2 m/échantillon en 20 Hz, **jusqu'à ~17 m** si le scoring est à 5 Hz. |
| 2 | « TC/ABS slip/cut dans le tampon » | `tc_slip`/`tc_cut`/`abs` sont des **réglages de map** (u8, `live.rs:40-47`), pas des événements d'activation. Aucun slip ratio ni flag « ABS actif » n'est exporté (les vitesses de patch existent dans la struct brute `live.rs:147-152` mais ne sont pas sérialisées). |
| 3 | « réf sous-échantillonnée à 200 pts, ±quelques mètres » | La réf persistée (`useLiveDelta.ts:38-43`) ne contient que `dist/time` + virages réduits à `{n, apexDist}` : **ni point de freinage, ni Vmin, ni aucun canal**. `brakeDist`/`minSpeed` retournés par `detectCorners` sont jetés (`useLiveDelta.ts:206`). 200 pts = 29 m/pt à Spa, 68 m/pt au Mans. Densifier ne suffit pas : il faut **enrichir le format**. |
| 4 | (non vu) | **Bug d'unités bloquant** : `detectCorners` teste `brake < 5` (échelle %, `corners.ts:86-88`) mais le live pousse `brake ∈ [0,1]` (`live.rs:1042`, preuve `TelemetryWidget.tsx:33`). En live, le point de freinage retombe **systématiquement** dans le fallback « sans freinage » → mesure structurellement fausse. À corriger avant toute ligne de P1. |
| 5 | (non vu) | En mode **High FPS**, l'overlay lisse frein/vitesse (lerp 0.25, `useOverlayData.ts:20-34`) → le tampon de `useLiveDelta` est contaminé. De plus `useLiveDelta` ne tourne que si le widget Corner Delta est affiché (`CornerDeltaWidget.tsx:36`). Le coach doit être un **service autonome** abonné au flux `live-data` brut. |
| 6 | « Vsortie, timing pleine charge mesurés » | **Vsortie n'est calculée nulle part** ; `Corner` n'a pas de borne de sortie (`corners.ts:10-21`) ; la capture live a lieu à l'apex −12 m (`useLiveDelta.ts:46, 246-252`) — avant même la sortie. 3 des 8 diagnostics v1 n'avaient pas de données. |
| 7 | « ~12 circuits × 3 classes » (ApexPoints) | Exact (12 circuits, 81 virages, 243 réfs complètes) mais : seulement les **zones de freinage notables** (6-10/circuit, pas tous les virages), plages jusqu'à 7 numéros (`T20-T26`), chevauchement à COTA (`T2-T9` puis `T6`), fichier non trié à Sebring, marqueurs = position de **panneaux** sans coordonnée piste, classe inconnue rabattue en silence sur hypercar (`braking-guide.ts:77`). |
| 8 | « transcripts : noms de virages parfois faux » | Les noms de virages sont **absents** (0/36 vidéos, « turn N » quasi absent) : narration purement séquentielle (« first turn », « next turn », « 100 board »). Aucun timestamp → pas de lien `?t=` sans régénérer les transcripts. |
| 9 | « widget effacé après 10 s » | Le `CoachWidget` existant efface à **15 s** (`CoachWidget.tsx:35`). Détail, mais la v2 s'aligne sur l'existant. |
| 10 | « réf = meilleur tour du joueur » | La réf actuelle est adoptée dès que `lapTime < ref.lapTime` (`useLiveDelta.ts:200`) : un tour **aspiré** devient la réf ; la clé est `track::classe` (`useLiveDelta.ts:52-54`) → une 499P et une 963 partagent la même réf. Il faut des règles d'éligibilité et une clé **par voiture**. |

---

## 1. Principes de coaching (le cœur de la v2)

La mesure ne suffit pas : un coach qui annonce des fautes au mauvais moment agace et
fait désactiver la fonction. Cinq principes non négociables :

1. **Fenêtrage cognitif.** Un message vocal n'est délivré que dans une **fenêtre
   calme** : gaz > 90 % maintenu (sortie finie) ET temps-avant-prochain-freinage ≥
   durée TTS + 1,5 s (calculable depuis la réf : `brakeDist` du virage suivant +
   vitesse courante). Pas de fenêtre avant le 2ᵉ virage suivant (enchaînement, esses)
   → **report au débrief de fin de tour**. Fraîcheur : délivrer dans les 5-8 s après
   la sortie du virage, sinon abandonner.
2. **Format radio.** En roulage : **≤ 8 mots, 1 seul chiffre**, gabarit fixe
   « Virage — verbe — chiffre ». Ex. : « Virage 3 : freine 50 mètres plus tôt. » /
   « Esses : porte 10 de plus. » / « Sortie 5 : gaz plus tôt. » Le détail complet
   (Vmin 142 vs 155, G lat…) va dans le **widget overlay**, pas dans la voix.
3. **Un seul chantier (« focus collant »).** Pas « le pire virage de CE tour »
   (zapping) : le coach élit UN virage-chantier (score = Δt × chronicité ×
   faisabilité) et **s'y tient 3-5 tours**, mêmes mots, jusqu'à amélioration
   confirmée (2 passages sous le seuil) ou changement de formulation.
4. **Renforcement positif.** Fermer la boucle est le message le plus précieux :
   « Voilà, c'est ça. Deux dixièmes de gagnés au 3. » (déclenché quand le
   virage-chantier passe sous le seuil après un correctif). Annoncer aussi les
   réussites remarquables (meilleure Vmin de la session, premier passage propre d'un
   virage chronique). **Ratio visé ≥ 1 positif pour 2 correctifs.** Alterner message
   de *résultat* et message de *geste* (les métriques de geste existent : `trail`,
   `throttleReopenDist`, `steerCorrections` — `lapMetrics.ts:39-46`).
5. **Feedback dégressif.** Un feedback à chaque passage crée une dépendance
   (guidance hypothesis) : passages 1-2 systématiques, puis 1 sur 2, puis 1 sur 3,
   puis silence + validation finale.

---

## 2. Sources de données

### 2.1 Dans l'app (avec leur état réel)

| Source | Contenu vérifié | Usage |
|---|---|---|
| **Flux live** (`live-data`, 20 Hz) | speed/throttle/brake/steering/clutch (inputs *unfiltered*), gear, rpm, G lat/long/vert, roues (temp, usure, pression, brake_temp, grip_fract, flat/detached), fuel, dégâts, `gap_ahead/behind`, `track_limits`, drapeaux (jaune par secteur, bleu), météo (rain, wind — norme seule), standings avec `pos_x/pos_z`, énergie virtuelle/SoC | Mesure du pilotage + inhibiteurs |
| **Réf `useLiveDelta`** | dist/time + `{n, apexDist}` — **à remplacer** par la réf v2 (§3) | Delta par virage (embryon existant `useLiveDelta.ts:246-252`) |
| **Guide ApexPoints** (`braking-guide-data.ts`) | 12 circuits × 3 classes, 81 virages : marker (83 % parseables en mètres, mais position de panneau), speed « A→B km/h » (97 % parseables), gear, pressure (mot-clé `trail` détectable), tip FR/EN | Référence *macro* + callouts prédictifs (§8 Découverte) |
| **Transcripts vidéos** (36/36) | ~8 500 chars/vidéo, narration séquentielle, 0 nom de virage, 0 timestamp | Matière de formulation LLM hors-ligne uniquement (§10) ; jamais de matching lexical |
| **Benchmarks ohne_speed** | Temps au tour par tier (réseau au runtime ; rien par virage) | Calibrer le niveau pilote (§7) et les caps de débrief |
| **DB sessions** (SQLite) | Historique complet, meilleurs secteurs, `coach_notes` (5/combo, `ai.rs:279`), historique par combo (`driver-history-context.ts`) | Chronicité, objectifs (§11) |
| **Élévation + profil de style** | `trackElevation.json`, style pilote (`lapMetrics.ts:265-295`) | Enrichir la formulation (P3) |

**Signaux à exporter du backend (petits ajouts `live.rs`)** : wetness de piste
(`m_min/max/avg_path_wetness`, lus mais non sérialisés), direction du vent (`m_wind`
Vec3), vitesses de patch/rotation de roue (pour un vrai flag blocage/patinage),
build du jeu (`Extended.m_version`), `lap_dist` sur les `track_points` (heatmap §12).

### 2.2 À intégrer (externes)

| Source | Valeur | Effort |
|---|---|---|
| **Ghost/tour importé** (MoTeC `.ld` ou export du format réf v2) | La meilleure référence possible (vrai tour alien par virage) | M |
| **Table fenêtres pneus** (compound → plage °C/kPa) | Inhibiteur « pneus froids » fiable + conseils pression | S |
| **Setups communautaires** (`.svm`) | Corréler symptôme ↔ réglage | S |
| **Repères communautaires** (CSV publiés) | Compléter ApexPoints hors couverture | S |

Écartés : sorties d'autres apps IA (pas de format standard), scraping (fragile,
juridiquement gris). Les apps concurrentes lisent la même mémoire partagée — la
source est déjà là.

---

## 3. Références : schéma v2, éligibilité, péremption

### 3.1 Schéma « réf dense » (remplace le JSON 200 pts)

- **Résolution fixe, pas nombre de points fixe** : 1 pt / 4 m (Spa ≈ 1 750 pts,
  Le Mans ≈ 3 400 pts).
- **8 canaux Float32** : `time, speed, brake, throttle, steer, gLat, gLong, gear`
  (dist implicite — grille régulière). ≈ 109 KB au Mans, ~4 MB pour 40 combos.
- **Métadonnées obligatoires** : `createdAt, gameBuild, carModel, trackTemp, airTemp,
  rain/wetness, compoundF/R, fuelAtStart, tcMap, absMap, lapsSincePit`.
- **Persistance SQLite** (pas `config.set` JSON) :
  - `coach_ref(id, track, car_model, class, kind /*best|ghost|stale*/, created_at, game_build, meta_json, channels BLOB)`
  - `coach_corner(ref_id, corner_uid, entry_dist, brake_dist, apex_dist, exit_dist, vmin, ventry, vexit, full_throttle_dist)`
  - `coach_stats(corner_uid, sigma_brake, sigma_vmin, sigma_dt, n_samples)` (seuils adaptatifs §7)
- Clé logique **par voiture** (`track × car_model × game_build`), plus jamais par
  classe. Garder les 3 dernières réfs (retour arrière).

### 3.2 Éligibilité d'un tour comme réf (à l'enregistrement)

Tour propre (non taint §6) **et** `gap_ahead > 2 s` sur tout le tour (pas
d'aspiration) **et** pas de jaune **et** pneus dans la fenêtre. Sinon : le tour bat
le best affiché mais **ne devient pas réf coach**.

### 3.3 Péremption / dégradation (à l'usage)

- Build ≠ build réf, ou |trackTemp − réf| > 8 °C, ou wetness ≠, ou compound ≠ →
  réf « indicative » : deltas **relatifs** uniquement, jamais de chiffre absolu de
  point de freinage. Âge > 60 jours → proposer une re-calibration.
- **Réf courte** : médiane glissante des 3 derniers tours propres (mêmes conditions).
  Le message par défaut est « tu freines 12 m plus tôt **que d'habitude** » ; on ne
  compare au best/ghost que s'il est frais et compatible. **N'alerter que si l'écart
  est confirmé sur les deux réfs.**
- **Normalisation carburant** : stocker `fuelAtStart`, corriger le Δt attendu
  (~0,03 s/tour/L, à calibrer par voiture) — jamais comparer un début de stint plein
  à un best réservoir vide sans correction.

### 3.4 Hiérarchie de confiance (inchangée, précisée)

1. **Ghost importé** (même combo, conditions compatibles) ;
2. **Best du joueur** (réf v2 éligible) + **réf courte** en garde-fou ;
3. **Guide ApexPoints** (macro ; jamais pour un chiffre absolu de distance — les
   marqueurs sont des panneaux sans coordonnée piste) ;
4. **Transcripts vidéo** — uniquement pour le *phrasé*, jamais pour les chiffres.

Jamais deux chiffres contradictoires dans un même message. Dégradation **par
source** (un circuit peut avoir vidéo sans guide freinage — Lusail — et inversement
— Road Atlanta, Paul Ricard).

---

## 4. Pipeline live

```
live-data brut 20 Hz (PAS le flux d'affichage lissé High FPS)
  → service autonome TS pur : (frame, state) → (state, events)   [testable, hors React]
  → dead-reckoning distance (§4.1) → tampon du tour (8 canaux)
  → fenêtres de virage curvilignes projetées depuis la réf (§4.2)
  → à la CLÔTURE de fenêtre (sortie, pas apex−12 m) : mesure du virage
  → diagnostics (§5) filtrés par inhibiteurs (§6) et seuils adaptatifs (§7)
  → moteur de restitution (§9) : fenêtre de délivrance, focus collant, budget
```

### 4.1 Précision de mesure (prérequis P0)

Sans correction, σ ≈ 8-10 m sur le point de freinage → le seuil « ±10 m » de la v1
serait du bruit à 1σ. Budget d'erreur cible **±2-3 m**, atteint par :
1. **Dead-reckoning côté Rust** : `d̂ = lap_dist_scoring + v·Δt` avec Δt issu de
   `m_elapsed_time` de la télémétrie (chaque frame porte son horodatage sim exact),
   re-anchor à chaque update scoring. Erreur résiduelle < 1 m.
2. **Interpolation sub-frame** du franchissement de seuil frein (rampe 0→100 % en
   ~200 ms vue à 20 Hz → ±1-2 m après interpolation).
3. **Confirmation sur 2-3 passages** avant de parler (÷√n).
4. **Instrumenter d'abord** : compter les valeurs distinctes de `lap_dist`/s en
   session réelle pour mesurer la vraie cadence scoring LMU (conditionne tout).
5. **Corriger le bug d'unités frein** (§0.4) et normaliser les canaux à l'entrée.

### 4.2 Fenêtres curvilignes + identité stable (remplace les « points »)

- **Fenêtre par virage** définie sur la réf : `[brakeDist_ref − 150 m ; exitDist]`
  où `exitDist` = première distance avec `throttle_ref ≥ 95 %` soutenu 0,5 s.
  Toutes les métriques sont des **agrégats dans la fenêtre** (jamais point à
  point) : une trajectoire de dépassement déplace l'apex de 15 m, la mesure reste
  définie. La clôture de fenêtre déclenche `corner-passed` (l'embryon actuel capture
  à l'apex −12 m — trop tôt pour la sortie).
- **Identité de virage persistante** : à chaque re-détection (nouveau best),
  apparier par `|apexDist_new − apexDist_old| < 40 m` et conserver un
  `corner_uid` stable. La mémoire chronique s'indexe sur cet UID, jamais sur
  l'ordre `n` (qui change quand un kink apparaît).
- **Chicanes** : fenêtres qui se chevauchent → fusion en fenêtre composite.
- **Virage à cheval sur la ligne** : padding circulaire de la trace réf avant
  détection (l'algo ignore les 12 premiers/derniers échantillons, `corners.ts:55`).
- **Virages à fond (Eau Rouge)** : jamais détectés par l'algo vitesse-seule
  (filtre > 95 % de Vmax + proéminence 8 km/h) → second détecteur par **gLat
  soutenu** (> 1 g pendant > 1 s) — d'où le canal gLat dans le tampon.
- **Mapping ApexPoints** : appariement partiel (le guide ne couvre que 6-10 zones
  par circuit), regex `^T(\d+)([A-Z])?(-T(\d+))?$`, plages traitées comme fenêtres
  composites, table de correction **manuelle par circuit embarquée dès la P3**
  (chevauchement COTA, ordre Sebring — vérifiés dans les données).

---

## 5. Diagnostics par virage

Une **cause dominante** par virage, priorisée dans cet ordre (l'événement binaire
prime sur l'écart continu) :

| # | Diagnostic | Mesure (fenêtre courante vs réf) | Données | Message voix (≤ 8 mots) |
|---|---|---|---|---|
| 1 | Blocage au freinage | flag roue (nécessite export patch-vel §2.1) sinon proxy chute brutale de `speed` + `gLong` | ⚠️ export à faire | « Tu bloques au 3, dose. » |
| 2 | Patinage en sortie | oscillation throttle vs accélération réelle (proxy sans slip exporté) | ⚠️ proxy | « Doucement les gaz sortie 5. » |
| 3 | Freinage tardif/précoce | 1er franchissement seuil frein dans la fenêtre, interpolé, vs réf | ✅ après P0 | « Freine 50 mètres plus tôt. » |
| 4 | Sur-ralentissement | Vmin < réf − seuil, sans blocage | ✅ | « Porte 10 de plus au 3. » |
| 5 | Entrée trop rapide (sortie sacrifiée) | Vmin > réf + seuil ET Vexit < réf | nécessite `exitDist` (§4.2) | « Sacrifie l'entrée du 7. » |
| 6 | Réaccélération tardive | `full_throttle_dist` > réf | canal throttle (réf v2) | « Gaz plus tôt sortie 5. » |
| 7 | Grip sous-exploité | max(gLat) fenêtre < réf − seuil | canal gLat (réf v2) | « Le grip est là, engage. » |
| 8 | Pas de trail-braking | relâché sec vs réf en trail (`trail` bool + `brakeReleaseMs`) | ✅ batch, à porter live | « Garde du frein jusqu'à l'apex. » |
| 9 | **Constance** (nouveau) | σ(brakeDist) ou σ(Δt) élevé sur les N derniers tours, moyenne correcte | ring buffer session | « Fixe ton repère au 3. » |

Règles transverses :
- **Constance avant pace** : si la variance domine (σ_Δt > écart moyen), le
  diagnostic est « constance » — corriger la moyenne quand la variance domine est
  du bruit. C'est aussi le meilleur inhibiteur de faux conseils.
- **Gating par niveau** (§7) : jamais de conseil trail-braking à un débutant
  (tête-à-queue garantis) ; fondamentaux seuls (> 107 % du temps alien).
- `absEvents` batch actuel compte les fronts sur tout le segment
  (`lapMetrics.ts:186`), pas seulement le freinage — à resserrer au portage live.

---

## 6. Inhibiteurs (taint **par fenêtre de virage**, pas par tour)

Un dépassement en T1 ne rend pas muet le diagnostic de T9. Table complète, avec le
signal réellement présent dans `LiveData` :

| Situation | Signal | État | Règle |
|---|---|---|---|
| Trafic devant / aspiration | `extended.gap_ahead` | ✅ | < 1,5 s à l'entrée → virage muet ; < 0,8 s fin de ligne droite → pas de verdict freinage |
| Trafic derrière (défense) | `extended.gap_behind` | ✅ | < 1,0 s → muet |
| Trafic multiclasse proche | distance `pos_x/pos_z` des standings | ✅ | < 50 m devant/derrière → muet |
| Jaune (secteur), bleu | `flags.sector_flags`, `player.flag` | ✅ | jaune dans le secteur du virage / bleu actif → muet |
| Coupure de piste | `extended.track_limits` | ✅ | incrément → virage + tour non éligibles réf |
| Dégâts aéro invisibles | `last_impact_magnitude`, `damage_accum_impact` | ✅ | impact > seuil → taint jusqu'au pit (les 8 zones de carrosserie ne voient pas un splitter faussé) |
| Crevaison / roue | `wheels[].flat/detached` | ✅ | muet |
| Pluie / piste évolutive | `weather.rain` ; wetness **non exporté** | ⚠️ export | Δwetness vs réf > 0.1 → mode relatif court |
| Vent | `wind_speed` (norme seule) | ⚠️ direction à exporter | > 20 km/h → seuils élargis |
| Pneus froids | `wheels[].temp` + table fenêtres (§2.2) | table à faire | < fenêtre − 15 °C → message contexte unique, pas de diagnostic |
| Pneus usés | `wheels[].wear` | ✅ | < 30 % → seuils élargis, diagnostic « usure » pas « pilotage » |
| Out/in-lap, pit | `in_pits`, `pit_state`, `speed_limiter` | ✅ (déjà taint) | + 1 tour de grâce après sortie |
| Carburant lourd | `fuel` vs `fuelAtStart` réf | méta réf v2 | normalisation §3.3 |
| Hybride ≠ réf | `boost_state`, `virtual_energy` | ✅ | boost ≠ réf dans la fenêtre → pas de verdict vitesse |
| Maps TC/ABS changées | `extended.tc/abs` (réglages) | ✅ | ≠ maps réf → verdicts patinage/blocage muets |
| Tête-à-queue / anti-stall | `anti_stall`, Vmin < 30 km/h | ✅ | tour muet |
| Pause / warm-up session | `paused`, reset session | ✅ (géré) | — |

---

## 7. Seuils, calibration, niveau pilote

- **Seuils relatifs, pas absolus** : `Δt_seuil = max(0,15 s ; 8 % du temps de virage
  réf)` ; Vmin : `max(5 km/h ; 4 % de Vmin_réf)`. (0,15 s dans une épingle de 8 s ≠
  0,15 s dans un kink de 1,5 s.)
- **Calibration : ≥ 3 tours valides** avant le premier message (la v1 disait 1 —
  insuffisant). Pendant la calibration : σ par virage (brakeDist, Vmin, Δt).
- **Seuils adaptatifs 2σ** : parler seulement si `|x − réf| > max(plancher ;
  2σ_pilote)` ; σ en EWMA (α ≈ 0,3) sur les tours propres. Un pilote irrégulier a
  des seuils larges ; un métronome reçoit des conseils fins.
- **Hystérésis** : déclenchement 2σ, extinction 1σ (pas de ping-pong « plus tôt /
  plus tard »).
- **Confirmation sur 2 passages consécutifs** avant de parler (sauf événement
  binaire type blocage) — l'arbitrage anti-faux-positifs le plus rentable.
- **Niveau pilote auto-calibré** par les benchmarks ohne_speed (jamais déclaré) :
  *Débutant* (> 107 %) : fondamentaux, seuils larges (≥ 0,4 s), repères visuels
  (« au panneau »), pas de trail. *Intermédiaire* : nominal. *Rapide* (< 102 %) :
  seuils fins (0,10 s), chiffres bruts, vocabulaire technique.

---

## 8. Modes d'usage (défauts automatiques par type de session, surchargeables)

| Mode | Comportement |
|---|---|
| **Course** | Silence coaching par défaut. Exceptions : erreur répétée coûteuse (≥ 3×, formulée en enjeu : « Ménage les gaz sortie 5, tu cuis l'arrière ») et **débrief de relais** pendant/après l'arrêt. Le spotter garde la priorité absolue. |
| **Qualif** | Aucun message pendant un tour lancé. Coaching sur l'**out-lap** (fenêtre cognitive idéale) : « Tour annulé au 3 : freinage trop tard. Vise le panneau 100. » |
| **Practice** (défaut) | Le nominal : focus collant + dégressif + renforcement positif (§1). |
| **Drill** | L'utilisateur choisit 1-2 virages. Feedback à CHAQUE passage (le budget 3/tour saute), silence ailleurs. Prédictif avant (« Prochain : ton virage. Panneau 100. ») + verdict après (« Propre. Trois d'affilée. »). Compteur de réussites. |
| **Découverte** (pas de réf joueur) | Guidage **prédictif** depuis ApexPoints : « Chicane Dunlop : freinage au 150, 3ᵉ. » S'estompe au fil des tours. Remplace le « silence radio » de la v1 — c'est le moment où le pilote a le PLUS besoin du coach. |
| **Débrief seul** (transverse) | Rien en roulage, synthèse en fin de tour/session. |

**Callouts prédictifs — règles** : réservés à Découverte, Drill, escalade (un
chantier qui résiste à 3 correctifs), et prudence conditions (pneus froids, pluie —
une fois). Doivent finir **≥ 2 s avant le point de freinage** (déclenchement à
`brakeDist − v × (durée_TTS + 2 s)`). La synthèse Piper étant asynchrone, les
callouts prédictifs (textes fixes par virage) sont **pré-synthétisés** au chargement
du combo. Jamais de prédictif permanent hors drill/découverte (dépendance).

---

## 9. Restitution

- **Priorité vocale dédiée `coach`** : le TTL `chatty` actuel (4 s fixe,
  `voice.ts:180`) est inadapté — l'expiration doit être pilotée par la **fenêtre de
  délivrance** (§1.1), pas par un TTL fixe. Ajouter un paramètre `ttl`/priorité à
  `speak()` (trivial). Jamais par-dessus le spotter : la hiérarchie
  `critical > normal > chatty` existe et fonctionne (`voice.ts:366-368`) ; noter que
  `announce()` du spotter **vide toute la file** (`voice.ts:396`) — un conseil coach
  en attente est supprimé, comportement acceptable (conseil périssable).
- **Anti-spam porté par l'état du coach** (clé = `corner_uid × diagnostic`), pas par
  la dédup texte de la file (qui ne déduplique que le texte exact). Budget : 1
  message/virage, 3/tour, jamais 2× le même virage en N tours sauf aggravation —
  modulé par le focus collant et le dégressif (§1).
- **Widget overlay `cornercoach`** : 7 étapes documentées (id dans `OverlayId`,
  entrée `OVERLAY_DEFS`, composant `FC<WidgetProps>`, mapping `WIDGETS`, i18n × 4,
  rien à faire côté store, rendu automatique). Event Tauri `coach-corner`
  ({texte, virage, delta, détail chiffré}) sur le modèle exact de `coach-voice` →
  `CoachWidget` ; effacement 15 s. Le widget porte le **détail chiffré** que la voix
  ne dit pas (§1.2).
- **Gabarits déterministes intégrés à `voiceMessages`** (groupe `corners`) : les
  messages du coach deviennent personnalisables et testables par l'utilisateur comme
  les annonces existantes, coût quasi nul.
- **Canaux de messages** (P3) : étiqueter sécurité / ingénieur-stratégie /
  coach-pace avec mute indépendant par canal dans Config (pas de nouveau « rôle »,
  la tuyauterie `voice.ts` suffit).

---

## 10. Formulation

- **Déterministe (défaut)** : gabarits i18n paramétrés (via `voiceMessages`).
  Suffisant pour l'essentiel du roulage.
- **Mode LLM = banque de phrases pré-générée, PAS d'appel sur le chemin critique.**
  L'espace des messages est petit (9 diagnostics × ~15 virages × 2-3 sévérités) :
  à l'activation du mode sur un combo, **un seul appel batch** génère 2-3 variantes
  par (virage, diagnostic) à partir de l'extrait ApexPoints + du transcript. Les
  phrases contiennent des **slots** (`{delta}`, `{vmin}`, `{ref}`) remplis en code
  au moment du virage → garantie mécanique du « le LLM ne recalcule rien » (les
  chiffres ne transitent jamais par le modèle en live), zéro latence, zéro coût
  marginal, fonctionne hors-ligne après génération. Stockage SQLite par combo,
  rotation des variantes, invalidation quand la réf change.
- **LLM live uniquement hors chemin critique** : débrief de fin de tour/relais/
  session (réutilise le canal vocal existant : fournisseur vocal distinct déjà
  câblé, non-streaming, `maxTokens` 120-160, consigne type `VOICE_STYLE`
  `coach.ts:107`). Pré-générer pendant la ligne droite/l'arrêt avec **deadline** :
  réponse pas arrivée au moment de parler → fallback gabarit déterministe.
- **Coûts vérifiés** (500 in / 60 out, 3 msg/tour, 1 h) : de $0,01/h (gpt-4.1-nano,
  flash) à ~$0,29/h (Sonnet), $0 en Ollama — le coût est un non-problème ; **la
  latence est LE problème** (appel non-streamé 1-3 s typique, timeout 60 s,
  `ai.rs:156`), d'où la banque de phrases.
- À proscrire : appel synchrone au franchissement, injection du transcript complet
  (~4 000 tokens/appel).

---

## 11. Boucle d'apprentissage (objectifs → pratique → rapport → objectifs)

- **Objectif de session** : à l'ouverture d'une practice, le coach propose (ou
  l'utilisateur choisit) 1-2 virages cibles issus des faiblesses chroniques —
  `coach_notes` structurées (virage ciblé, métrique, valeur cible) au lieu de texte
  libre ; la table existe et est faite pour ça (`db.rs:193-203`, cap 5/combo
  `ai.rs:279`). En live : seuil abaissé + feedback systématique sur ces virages.
- **Progression par virage** (table `corner_history`, écrite en fin de session) :
  **pace** = médiane des Δt (robuste), **constance** = IQR/σ, **tendance** = pente
  sur les N dernières sessions, **taux de réussite** = % passages sous le seuil.
  Messages différenciés : pace → « porte plus de vitesse » ; constance → « la
  vitesse est là, cherche le même freinage à chaque tour » (et ne PAS pousser plus
  vite).
- **Rapport de fin de session — format « 1+1+1 »**, 3 phrases (vocal court + panneau
  complet page Live, persisté) :
  1. un progrès (« Virage 3 : réglé, deux dixièmes reprises, propre 8 fois sur 10 ») ;
  2. un chantier (« Le suivant : la sortie du 9, gaz toujours tard ») ;
  3. un cap calibré ohne_speed (« Prochain objectif : sous 3'52 »).
  Le lien vidéo du combo se raccroche au chantier. (Timestamps `?t=` : nécessite de
  régénérer les transcripts avec timecodes — absents aujourd'hui.)
- **Rappel inter-sessions** : au premier tour d'un combo connu, « La dernière fois,
  ton chantier était le virage 9. On reprend là. »

---

## 12. Fonctions complémentaires (au-delà du correctif)

| Priorité | Fonction | Détail | Effort |
|---|---|---|---|
| P2 | **Coaching de stint** (différenciateur LMU) | Dérive par virage au fil du relais (Vmin qui chute à T7 = pneus AV), lift & coast quand `strategy.ts` dit FUEL SHORT, prudence out-lap. Aucun concurrent ne le fait par virage. | M/L |
| P2 | **« Pourquoi ? » vocal** | Après un callout, Alt+C « pourquoi ? » → le LLM répond avec le diagnostic chiffré du virage + passage transcript. Le PTT existe de bout en bout ; injecter les N derniers `corner-passed` dans le contexte live. | S |
| P2 | **Heatmap des pertes** | Tracé coloré par Δt/virage (TrackMap overlay + page Télémétrie). Prérequis : `lap_dist` sur les `track_points` (petit changement backend). | S/M |
| P2 | **Inputs superposés par virage** | Existe déjà dans TelemetryView (superposition + focus zones) ; ajouter zoom « T1..Tn » + deep-link depuis le rapport de session. | S |
| P3 | **Coaching du risque** | « Tu gagnes 0,1 au 7 mais 2 warnings en 5 tours — pas rentable » (`track_limits` exporté). | S/M |
| P3 | **Cible classe du jour** | Comparer tes secteurs aux meilleurs de ta classe présents en session (standings), plus motivant qu'un CSV. | S/M |
| P3 | **Formulation terrain/style** | Élévation (« freinage en descente, transfère doucement ») + profil de style pilote. | S |

---

## 13. Plan d'implémentation (révisé)

**P0 — Prérequis bloquants** (sans eux, tout le reste mesure faux) :
bug d'unités frein (§0.4) · dead-reckoning distance + instrumentation cadence
scoring (§4.1) · extraction du cœur en module pur hors React, abonné à `live-data`
brut (§0.5) · exports backend (wetness, patch-vel, build, `lap_dist` des
track_points).

**P1 — Mesure** : réf v2 (schéma §3.1, tampon 8 canaux, fenêtres curvilignes,
`corner_uid`, éligibilité §3.2) · événement `corner-passed` à la clôture de fenêtre.
*Aucune UI.*

**P2 — Restitution** : diagnostics §5 (dont constance) + inhibiteurs §6 + seuils §7
· priorité vocale `coach` + fenêtre de délivrance §1 · gabarits `voiceMessages` ·
widget `cornercoach` · modes practice/course/qualif (§8) · focus collant + positif +
dégressif.

**P3 — Références enrichies** : mapping ApexPoints + table de correction par circuit
(obligatoire, pas un filet) · niveau pilote auto-calibré · réf courte + péremption
· mode Découverte prédictif (pré-synthèse TTS).

**P4 — Apprentissage** : objectifs structurés + rapport 1+1+1 + `corner_history` +
rappel inter-sessions · mode Drill · banque de phrases LLM + « pourquoi ? » vocal.

**P5 — Extensions** ✅ (2026-07-03) : ghost importé comme réf `kind='ghost'` (prioritaire
§3.4) depuis **`.duckdb`** (voie principale, télémétrie native) **ou `.ld` MoTeC** (voie
secondaire ; ⚠️ parser binaire à valider sur vrai fichier) · coaching de stint (dérive
`vmin`/virage, lift & coast, out-lap) · heatmap des pertes (TrackMap) · inputs par virage
(zoom T1..Tn + deep-link) · risque (`track_limits`) + cible de classe (secteurs standings).

Chaque phase est livrable seule ; P0+P1+P2 forment le premier coach utile.

---

## 14. Tests sans rouler (stratégie complète) — ✅ socle fait (2026-07-03)

> **Implémenté** (`src/lib/coach/testkit/`, `npm test` = 74 assertions) : enregistreur
> JSONL rejouable (1), harnais de rejeu du module pur (2), fixtures synthétiques (3),
> property tests bruit/dup/shift (4). **Restant** : trait `read_shm` Rust (5) et corpus
> d'or annoté (6, nécessite de vrais enregistrements — le format de capture est prêt).


1. **Enregistreur de frames** (flag dev) : sérialiser `live-data` en JSON Lines
   (~1-2 MB/min gzippé). 30 min de roulage réel = corpus rejouable à vie — l'actif
   le plus précieux du projet.
2. **Harnais de rejeu TS** sur le module pur `(frame, state) → (state, events)` :
   rejeu ×1000, assertions sur la liste exacte des messages émis.
3. **Fixtures synthétiques paramétriques** : générateur de tour (profils
   trapézoïdaux, rampes de frein 200 ms) avec mutations contrôlées (« freine 15 m
   plus tard en T3 ») → assert le diagnostic émis, et un seul.
4. **Property tests** : décalage ±1 frame, bruit σ = 0,5 km/h, **gel scoring
   200 ms**, frames dupliquées → diagnostic inchangé. (Aurait attrapé le bug
   d'unités frein.)
5. **Côté Rust** : abstraire `read_shm` derrière un trait ; rejouer des dumps
   binaires des maps → valide offsets/parsing à chaque patch LMU.
6. **Corpus d'or** : 5-6 enregistrements annotés à la main (« T7 = vrai freinage
   tardif ; T3 = trafic ») → précision/rappel mesurés à chaque évolution de seuil.
   Sans ce corpus, tout réglage est du doigt mouillé.

---

## 15. Risques résiduels

- **Cadence scoring LMU non confirmée** (hypothèse ~5 Hz) : à instrumenter en
  premier — conditionne le budget d'erreur et le dead-reckoning.
- **Pas de slip/flag ABS exporté** : les diagnostics blocage/patinage démarrent en
  mode proxy (vitesse/gLong/throttle) tant que les patch-vel ne sont pas sérialisées.
- **Crédibilité** : une fausse accusation chiffrée (« tu freines 10 m trop tard »
  quand c'est du bruit) tue la confiance — d'où confirmation 2 passages, seuils 2σ,
  et mode relatif par défaut. Le coach doit préférer **se taire** dans le doute.
- **ApexPoints** : données communautaires avec erreurs connues (noms de virages
  faux à COTA/Sebring) — la table de correction par circuit est aussi une table de
  *validation*.
- **Charge CPU** : O(points du virage) par clôture de fenêtre, négligeable ; la
  seule dépense notable (TTS/LLM) est hors chemin critique par construction.
