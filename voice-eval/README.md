# Qualité de la voix de l'ingénieur : évaluation (2026-10-15)

Étude demandée : comparer Kokoro-82M à Piper, chercher de meilleures voix Piper
(surtout DE et IT), concevoir une voix en ligne avec la clé de l'utilisateur, puis
prototyper la meilleure piste derrière un réglage désactivé par défaut.

**Écoute** : `wav/<langue>/<NN>_<moteur>-<voix>.wav` (10 phrases radio par voix,
son brut sans effet radio). Le même numéro correspond à la même phrase pour toutes
les voix. Données brutes : `data/`. Scripts : `scripts/voice-eval/`.

## Recommandation

| Piste | Qualité | Latence (phrase de ~2,7 s) | Taille | Coût | Verdict |
|---|---|---|---|---|---|
| **Voix en ligne, clé de l'utilisateur** | Nettement au-dessus de toute voix locale (prosodie humaine), 5 langues | Non mesurée faute de clé ; annoncée de 75 à 300 ms côté fournisseur, compter 0,3 à 1 s de bout en bout sans streaming. Phrases fixes en cache : 0 ms | 0 | ~1 à 5 $/mois pour 20 h de roulage (détail plus bas) ; gratuit chez Cartesia jusqu'à 20 k caractères/mois | **Prototype livré**, réglage désactivé par défaut |
| **Meilleures voix Piper** (Serena IT, Sharvard ES) | IT : 0,4 % d'erreurs contre 4,4 % (Paola). ES : 2,0 % contre 11,1 % (DaveFX) | Identique aux voix actuelles (115-140 ms) | 64-77 Mo par voix | 0 | **Ajoutées au catalogue** (alternatives). Passage en défaut : décision à prendre |
| Kokoro-82M (ONNX, local) | EN/ES/IT un peu meilleurs, FR identique, **pas d'allemand** | 1,0-1,2 s à 2 threads ; 1,3-1,8 s sous charge, soit 4 à 8 fois Piper | 325 Mo + nouveau runtime | 0 | **Écarté pour l'instant** |

Pourquoi : la voix en ligne est la seule piste qui change vraiment la qualité perçue,
et elle couvre les 5 langues. Kokoro coûte cher (latence, 325 Mo, un second
onnxruntime à embarquer) pour un gain que deux voix Piper apportent déjà en IT et en
ES, et n'apporte rien en FR ni en DE.

## Protocole

- **Machine** : Ryzen 7 5800X3D (8 cœurs/16 threads), 32 Go, RTX 4090. Un processus
  Python tiers occupait déjà le CPU en fond pendant toutes les mesures (~28 % de
  charge au repos) : les chiffres « repos » sont donc légèrement pessimistes.
- **Corpus** : 10 phrases radio par langue, tirées des gabarits réels de l'app
  (`build-corpus.mjs` → `scripts/voice-eval/corpus.json`) : box, drapeaux jaune et bleu,
  crevaison, carburant, écart, freinage au virage 4, conseil réussi, pneus, « oublie
  mon conseil ».
- **Piper** : `piper.exe` livré avec l'app (2023, onnxruntime 1.14), protocole du worker
  de `tts.rs` (`--json-input`, priorité « sous la normale », sans fenêtre). Latence =
  écriture de la requête jusqu'au WAV complet, après une phrase d'échauffement.
- **Kokoro** : `onnx-community/Kokoro-82M-v1.0-ONNX` (commit `1939ad2a`), onnxruntime
  1.23 CPU, phonétisation espeak-ng (comme le ferait une intégration Rust qui
  réutilise l'espeak-ng de Piper ; en anglais, sans le dictionnaire de Kokoro).
  Latence = phonétisation + inférence.
- **Charge « jeu en cours »** : 6 ou 12 processus en boucle active, priorité normale,
  synthèse en priorité basse comme dans l'app.
- **Intelligibilité** : transcription Whisper small (faster-whisper, int8, CPU) puis
  taux d'erreur par caractère sans espaces (CER, insensible au découpage des mots
  composés allemands). C'est un indicateur objectif de netteté de la diction, pas une
  note de naturel : **l'écoute reste indispensable**.

## Résultats (médianes sur 10 phrases)

| Langue | Voix | Repos (ms) | Charge 6 thr (ms) | Charge 12 thr (ms) | Erreurs Whisper (CER) |
|---|---|---:|---:|---:|---:|
| de | **piper-de (Thorsten medium, défaut)** | 159 | 365 | 1003 | 3.7 % |
| de | piper-de_DE-eva_k-x_low | 117 | — | — | 5.8 % |
| de | piper-de_DE-thorsten-high | 533 | 1586 | 14269 | 1.6 % |
| de | piper-de_DE-thorsten_emotional-medium | 163 | — | — | 7.6 % |
| en | kokoro-af_heart | 1047 | — | — | 1.8 % |
| en | kokoro-am_michael | 1144 | — | — | 1.8 % |
| en | kokoro-bm_george | 1167 | 1391 | 1814 | 1.8 % |
| en | kokoro-bm_lewis | 1207 | — | — | 1.8 % |
| en | **piper-en (Ryan medium, défaut)** | 104 | 211 | 1099 | 2.6 % |
| en | piper-en_GB-alan-medium | 121 | — | — | 1.6 % |
| en | piper-en_GB-cori-high | 550 | — | — | 6.5 % |
| es | kokoro-ef_dora | 1026 | — | — | 1.6 % |
| es | kokoro-em_alex | 1069 | — | 1524 | 1.6 % |
| es | **piper-es (DaveFX medium, défaut)** | 143 | — | 1325 | 11.1 % |
| es | piper-es_AR-daniela-high | 498 | — | — | 5.4 % |
| es | piper-es_ES-sharvard-medium (homme) | 115 | — | — | 2.0 % |
| es | piper-es_ES-sharvard-medium-spk1 (femme) | 121 | — | — | 2.3 % |
| es | piper-es_MX-ald-medium | 148 | — | — | 9.3 % |
| es | piper-es_MX-claude-high | 176 | — | — | 3.8 % |
| fr | kokoro-ff_siwis | 1063 | 1289 | 1632 | 6.8 % |
| fr | piper-fr (Tom medium) | 278 | 588 | 4901 | 6.5 % |
| fr | piper-fr_FR-mls-medium | 213 | — | — | 78.4 % |
| fr | piper-fr_FR-siwis-medium | 150 | — | — | 6.7 % |
| fr | piper-fr_FR-upmc-medium (Jessica) | 143 | — | — | 14.7 % |
| fr | **piper-fr_FR-upmc-medium-spk1 (Pierre, défaut)** | 113 | — | — | 7.2 % |
| it | kokoro-if_sara | 1089 | 1316 | 1685 | 3.0 % |
| it | kokoro-im_nicola | 1118 | — | — | 1.0 % |
| it | **piper-it_IT-paola-medium (défaut)** | 133 | 295 | 1362 | 4.4 % |
| it | piper-it_IT-riccardo-x_low | 83 | — | — | 6.8 % |
| it | piper-it_IT-serena-high (JSON nettoyé) | 604 | — | — | 1.1 % |
| it | piper-it_IT-serena-medium (JSON nettoyé) | 139 | 280 | 1561 | 0.4 % |

Kokoro : modèle fp32 à 2 threads. À 4 threads : 0,73-0,90 s au repos.

## 1. Kokoro-82M

- **Licence** : Apache-2.0 (poids et code). Voix intégrées utilisables commercialement.
- **Langues (v1.0)** : anglais US/GB (28 voix), français (**1 seule voix**, `ff_siwis`,
  entraînée sur le même corpus SIWIS que la voix Piper Siwis), espagnol (3), italien (2),
  portugais BR, hindi, japonais, chinois. **Pas d'allemand.**
- **Tailles** : fp32 325 Mo ; fp16 163 Mo ; int8 92 Mo ; q8f16 86 Mo ; + 0,5 Mo par voix.
  - L'int8 est **plus lent** que le fp32 sur CPU (2,0-2,9 s au lieu de 0,6-1,1 s) : la
    quantification dynamique de ses convolutions est mal accélérée par onnxruntime CPU.
  - Le q8f16 **plante** onnxruntime CPU 1.23 au chargement (erreur de segmentation).
  - Seul le fp32 est donc utilisable : 325 Mo à télécharger.
- **Latence** : 0,6 s (4 threads) à 1,3 s (1 thread) pour ~2 s d'audio au repos. Sous
  charge à 2 threads : 1,3-1,8 s. Piper medium : 0,1-0,3 s au repos.
- **Intégration Rust** (si on la reprend un jour) :
  - crate `ort` + onnxruntime ≥ 1.17. Piper embarque le sien en 1.14 : deux DLL
    `onnxruntime.dll` de versions différentes, à isoler (chargement dynamique depuis un
    sous-dossier), +~12 Mo ;
  - phonétisation par espeak-ng : FFI sur l'`espeak-ng.dll` déjà livrée avec Piper
    (`espeak_TextToPhonemes`, mode IPA) ;
  - table de 178 symboles (tokenizer.json), style = `voix[nombre de symboles]`, sortie
    24 kHz : 300 à 500 lignes de Rust.
- **Verdict** : écarté. Gain réel seulement en ES et IT, déjà obtenu par Sharvard et
  Serena. À revoir si une version gère l'allemand et devient 3 à 4 fois plus rapide.

## 2. Voix Piper : remplacements proposés

Catalogue officiel `rhasspy/piper-voices` relu au commit `c10ece1a` (2026-09).

| Langue | Aujourd'hui | Proposition | Pourquoi | Licence |
|---|---|---|---|---|
| IT | Paola medium (défaut), Riccardo x_low | **Serena medium** | 0,4 % d'erreurs contre 4,4 %, même latence | CC-BY-4.0 |
| ES | DaveFX medium (défaut), Claude high | **Sharvard medium** (homme ou femme) | 2,0 % contre 11,1 %, même latence | CC-BY-3.0 |
| DE | Thorsten medium (défaut), Eva K x_low | Garder Thorsten medium | Thorsten high est plus net (1,6 %) mais 3 à 14 fois plus lent ; aucune autre voix DE ne fait mieux | CC0 |
| FR | Pierre (UPMC), Tom, Siwis | Statu quo | Toutes à ~7 % ; MLS inutilisable (78 %) | — |
| EN | Ryan, Alan | Statu quo | Toutes < 3 % ; Cori high plus lente et moins nette | Ryan : CC BY-NC-SA (pas d'usage commercial) |

- **Serena** a été entraînée avec Piper ≥ 1.5 : son `.onnx.json` déclare 5 diphtongues
  anglaises (`aɪ`, `aʊ`, `ɔɪ`, `eɪ`, `oʊ`) que notre `piper.exe` (2023) refuse (« is not a
  single codepoint »). Elles ne sortent jamais de la phonétisation italienne : le
  téléchargement les retire (`assets.rs::sanitize_voice_json`, testé), et la voix
  fonctionne. C'est ce qu'ont mesuré les WAV « serena ».
- **Fait** : Serena et Sharvard sont au catalogue (`assets.rs`, commit HF figé, SHA-256),
  comme **alternatives** : les voix par défaut ne changent pas.
- **À décider** : en faire les défauts IT et ES pour les nouvelles installations.
  Changer le fichier `<langue>.onnx` modifierait la voix des utilisateurs actuels ; il
  vaut mieux changer le choix par défaut côté app, comme pour Pierre en FR.

### Découverte : Piper s'effondre quand le CPU est saturé

Avec 12 threads occupés, Piper en priorité basse passe de 0,1-0,3 s à **1 à 5 s** par
phrase (medium) et **14 s** (high). `piper.exe` ne fixe pas son nombre de threads
(onnxruntime en prend autant que de cœurs) : en priorité basse, chaque opération attend
le thread le plus en retard. Avec 6 threads occupés, ça reste correct (0,2-0,6 s).

- Ne pas proposer de voix « high » en course.
- À vérifier en jeu réel (LMU charge surtout 2 à 4 cœurs ; un streamer qui encode en
  CPU s'approche des 12 threads).
- Si ça se confirme, deux pistes : faire tourner les modèles Piper via `ort` avec 2
  threads (même chantier que Kokoro, sans le modèle), ou passer le worker en priorité
  normale pendant la synthèse seulement.

## 3. Voix en ligne avec ta propre clé (prototype livré)

### Conception

Elle suit le modèle des fournisseurs d'IA (`src/lib/ai/providers`) : le front construit
la requête, Rust la relaie.

- `src/lib/cloudVoiceProviders.ts` : OpenAI (`/v1/audio/speech`, gpt-4o-mini-tts avec
  consigne « ingénieur radio »), ElevenLabs (`eleven_flash_v2_5`, MP3), Cartesia
  (`sonic-3.6`, `/tts/bytes`, MP3, API `2026-08-14`). Modèle et voix sont des champs libres avec une valeur
  par défaut (Cartesia : voix par langue choisies par le mainteneur, FR `8f1e9d27-…`, EN `5ee9feff-…`, ES `21c2f7ab-…`, IT `c8403b5c-…`, DE `b7187e84-…`).
- `src-tauri/src/commands/tts_cloud.rs` :
  - commande `tts_cloud_synthesize` ;
  - **liste blanche d'hôtes HTTPS** (le relais ne peut pas viser une autre URL) ;
  - délai borné (3 s en course) ;
  - réponse plafonnée à 8 Mo ;
  - erreurs sans URL ;
  - **cache disque des phrases fixes** (sans chiffre, ≤ 70 caractères), clé = empreinte
    SHA-256 de fournisseur, modèle, voix, langue, vitesse et texte : une phrase payée
    une fois ne l'est plus jamais ;
  - `tts_cloud_cache_clear`.
- `src/lib/cloudVoice.ts` :
  - réglages (`voice_cloud`, JSON) ;
  - clé chiffrée par fournisseur (`ai_key_enc_tts-<fournisseur>`, même mécanisme que
    les clés IA) ;
  - **mise en pause 60 s après 2 échecs** (réseau coupé, quota épuisé), pour ne pas
    ajouter 3 s d'attente à chaque annonce ;
  - consommation du mois (`voice_cloud_usage`) : caractères envoyés, phrases servies
    par le cache, relais par Piper.
- `voice.ts` : la voix en ligne n'est essayée que pour les annonces `normal` / `chatty`
  et les **réponses au pilote** (`announceAnswer` : réponses locales et IA à la radio,
  lecture d'une analyse du Coach IA). **Jamais** pour `critical` (drapeaux, crevaison,
  box…), le spotter, le coach par virage (son moment de parole est calculé sur la
  latence de Piper), ni « Répète » (qui peut rejouer une alerte). En cas d'échec ou de
  délai dépassé, Piper dit la phrase. L'effet radio s'applique pareil.
- Config → Audio / Voix → « Voix en ligne (bêta) » (sous « Moteur », visible avec
  Piper) :
  - interrupteur, désactivé par défaut ;
  - fournisseur, clé (avec lien « Obtenir une clé »), modèle, voix ;
  - « Tester » (affiche la latence ou l'erreur exacte) ;
  - consommation du mois et « Vider le cache » ;
  - rappel des règles de sécurité et de confidentialité.

### Coûts (tarifs publics relevés le 2026-10-15)

Hypothèse : ~3 000 caractères envoyés par heure de roulage, une fois les phrases fixes
en cache (40 à 60 annonces d'information de ~40 caractères, plus quelques réponses).
Soit 20 h de roulage par mois ≈ 60 000 caractères.

| Fournisseur | Tarif | 20 h/mois | Langues | Latence annoncée |
|---|---|---|---|---|
| OpenAI `tts-1` | 15 $ / M caractères | ~0,90 $ | 5 (accent anglais perceptible) | non publiée |
| OpenAI `gpt-4o-mini-tts` | 12 $ / M tokens audio (~0,015 $/min) | ~1 $ | 5, ton pilotable par consigne | non publiée |
| ElevenLabs Flash v2.5 | 0,04 $ / 1 000 caractères | ~2,40 $ | 32, dont les 5 | ~75 ms (modèle) |
| Cartesia Sonic 3.6 | 1 crédit / caractère ; gratuit 20 k/mois, Pro 5 $/100 k | 5 $ (ou gratuit jusqu'à ~7 h) | 44, dont les 5 | non publiée sur la page tarifs |
| (non intégré) Azure Neural | 0,5 M caractères/mois gratuits | 0 $ | 5, nombreuses voix | — |

### Ce qui n'est pas vérifié

- **Aucun appel réel** : pas de clé disponible pendant l'étude. Formats de requête
  écrits d'après la documentation des API ; à valider avec « Tester » pour chaque
  fournisseur (Cartesia recalé sur la doc API du 2026-10-15 ; reste l'ID de voix ElevenLabs par
  défaut).
- Latence réelle de bout en bout, et rendu des voix en ligne avec l'effet « Radio stand ».

## Reproduire

```bash
# Prérequis : Python 3.10 avec onnxruntime, misaki (+ espeakng-loader), numpy ;
# faster-whisper installé à part (--target) ; modèles téléchargés hors du dépôt.
node scripts/voice-eval/build-corpus.mjs
python -I scripts/voice-eval/piper_bench.py <piper.exe> scripts/voice-eval/corpus.json voice-eval/wav fr=<voix.onnx> it=<voix.onnx#locuteur> …
python -I scripts/voice-eval/kokoro_bench.py <Kokoro-82M-v1.0-ONNX> scripts/voice-eval/corpus.json voice-eval/wav --threads 2,4 --models model.onnx
python -I scripts/voice-eval/cpu_load.py 12 420   # charge, dans un autre terminal
python -I scripts/voice-eval/intelligibility.py voice-eval/wav scripts/voice-eval/corpus.json <faster-whisper-small> --pylib <dossier>
python -I scripts/voice-eval/report_table.py voice-eval/data
```
