# Reconnaissance vocale : Vosk, Parakeet ou Whisper ? (2026-10-19)

Question : faut-il changer le moteur de **dictée libre** de l'ingénieur (Vosk small
aujourd'hui) ? La liste fermée des commandes n'est pas en cause : Vosk y reste.

**Verdict : on passe à Parakeet pour la dictée libre, Vosk reste pour les commandes.**
Confirmé sur la vraie voix (40 phrases enregistrées au micro du Pimax, 19/10) après un
premier tri sur voix de synthèse.

## Résultat sur la vraie voix (40 prises, micro Pimax)

| Moteur | Erreurs par mot | Phrases exactes | Mots-clés compris | Délai médian | Délai p95 | CPU par seconde d'audio |
|---|---:|---:|---:|---:|---:|---:|
| **Vosk small** (actuel) | 17,8 % | 42 % | 83 % | 1 460 ms | 1 861 ms | 0,57 |
| **Parakeet v3 int8** | **12,1 %** | **62 %** | **87 %** | **272 ms** | **540 ms** | **0,26** |
| Whisper small int8 | 12,5 % | 55 % | 84 % | 2 572 ms | 2 722 ms | 2,03 |
| Whisper small + amorce de vocabulaire | 12,6 % | 58 % | 87 % | 3 147 ms | 4 203 ms | 2,30 |

| Moteur | Commandes | Jargon | Libres | Numéros | Quantités | Questions | Virages |
|---|---:|---:|---:|---:|---:|---:|---:|
| Vosk small | 100 % | 83 % | 88 % | 73 % | 94 % | 100 % | 57 % |
| Parakeet | 75 % | 83 % | 100 % | 82 % | 94 % | 100 % | 71 % |
| Whisper | 100 % | 83 % | 100 % | 82 % | 94 % | 100 % | 50 % |
| Whisper + amorce | 100 % | 83 % | 100 % | 73 % | 94 % | 100 % | 71 % |

- Parakeet fait **mieux que Vosk partout sauf sur « Répète. »** (un mot seul, rendu « Repet. ») :
  c'est la seule commande ratée, et les commandes restent lues par la liste fermée de Vosk.
- Sur ta voix, l'amorce de Whisper n'apporte plus rien (12,6 % contre 12,5 %) ; Whisper reste
  10 fois plus lent que Parakeet.
- Erreurs qui viennent de la diction, pas du moteur : « Comment sont mes pneus » entendu
  « Commençons mes pneus » par 3 moteurs sur 4 ; phrase 15 répétée deux fois dans la prise.
- Mémoire (mesurée en synthèse) : Vosk 125 Mo, Parakeet 717 Mo, Whisper 298 Mo.
- **Confiance Vosk sans valeur** : 0,88 en moyenne sur les phrases dont les mots-clés sont
  tous compris, 0,85 sur celles où il en rate (de 0,66 à 0,97) ; aucune prise sous 0,55. Le
  réglage « faire répéter quand la dictée est incertaine » (18/10) ne se déclenche donc
  presque jamais avec Vosk, et Parakeet ne donne aucun score.

## Les autres langues (synthèse, 20 phrases traduites)

Corpus : `scripts/stt-eval/corpus_xx.json` ; voix Piper de l'app (EN Ryan + Alan, ES DaveFX +
Claude, DE Thorsten + Eva, IT Paola seule), propre / bruit 10 dB / 5 dB. Erreurs comptées **par
caractère** (lettres seules, chiffres convertis en lettres) pour tolérer les mots composés.

| Langue | Moteur | Erreurs par caractère | Phrases exactes | Mots-clés compris | Délai médian |
|---|---|---:|---:|---:|---:|
| EN | Vosk small | 10,4 % | 38 % | 70 % | 1 255 ms |
| EN | **Parakeet** | **3,5 %** | **60 %** | **84 %** | **372 ms** |
| ES | Vosk small | 4,6 % | 58 % | 87 % | 583 ms |
| ES | **Parakeet** | **2,6 %** | **76 %** | **88 %** | **347 ms** |
| DE | Vosk small | 13,0 % | 34 % | 69 % | 748 ms |
| DE | **Parakeet** | **6,5 %** | **52 %** | **79 %** | **378 ms** |
| IT | Vosk small | 7,3 % | 43 % | 82 % | 771 ms |
| IT | **Parakeet** | **6,3 %** | **45 %** | **82 %** | **321 ms** |

- Parakeet fait **au moins aussi bien que Vosk dans les 5 langues**, nettement mieux en anglais
  et en allemand, à égalité en italien (une seule voix, échantillon plus petit).
- **Aucune confusion de langue** sur 420 prises : il reconnaît la langue seul et répond toujours
  dans celle qui est parlée.
- Erreurs restantes : mots mal entendus (« War me » pour « Warn me », « il boss » pour « ai box »)
  et quelques nombres découpés en anglais (« 9 to 3 » pour « ninety-three »). L'orthographe
  britannique / américaine (« litres / liters ») est comptée comme une erreur pour les deux moteurs.
- Non mesuré : une vraie voix dans ces 4 langues.

## Premier tri (synthèse, 360 prises par moteur)

| Moteur | Erreurs par mot | Phrases exactes | Mots-clés compris | Délai médian | Délai p95 | CPU par seconde d'audio | Mémoire | Modèle |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **Vosk small** (actuel) | 21,9 % | 33 % | 73 % | 1 712 ms | 2 664 ms | 0,61 | 125 Mo | 42 Mo |
| **Parakeet v3 int8** | **17,4 %** | 51 % | 75 % | **303 ms** | **370 ms** | **0,24** | 717 Mo | 641 Mo |
| Whisper small int8 | 20,2 % | 46 % | 75 % | 2 530 ms | 2 669 ms | 1,76 | 298 Mo | 470 Mo |
| Whisper small + amorce de vocabulaire | **16,1 %** | **57 %** | **84 %** | 2 643 ms | 2 799 ms | 1,83 | 298 Mo | 470 Mo |

Mots-clés compris par famille :

| Moteur | Commandes | Jargon | Libres | Numéros | Quantités | Questions | Virages |
|---|---:|---:|---:|---:|---:|---:|---:|
| Vosk small | 78 % | 73 % | 81 % | 76 % | 86 % | 87 % | 42 % |
| Parakeet | 67 % | 69 % | 92 % | 78 % | 86 % | 88 % | 51 % |
| Whisper | 86 % | 65 % | 96 % | 68 % | 85 % | 96 % | 48 % |
| Whisper + amorce | 86 % | 73 % | 96 % | 77 % | 86 % | 97 % | 78 % |

Bruit (erreurs par mot, propre → 10 dB → 5 dB de rapport signal/bruit) : Vosk 15,3 → 20,3 →
30,9 % ; Parakeet 10,7 → 18,2 → 23,5 % ; Whisper 15,2 → 20,9 → 24,5 % ; Whisper + amorce
11,2 → 16,9 → 20,2 %. Dans le bruit le plus fort, Vosk ne sort plus que 18 % de phrases
exactes, Parakeet 42 % (détail : `results/synth.md`).

## Ce qu'on en retient (synthèse, confirmé sur la vraie voix)

- **Parakeet est le meilleur compromis pour la course** : plus juste que Vosk (phrases exactes
  51 % contre 33 % en synthèse, 62 % contre 42 % sur ta voix), et surtout **5 à 6 fois plus rapide** (0,3 s contre 1,7 s après le
  relâchement) pour **2,5 fois moins de processeur**. Sa faiblesse : les noms propres (virages)
  et certains mots isolés.
- **Whisper avec amorce comprend le mieux** (82 % des mots-clés, 78 % des virages) parce qu'on
  peut lui donner les noms à l'avance, mais il met **2,6 s** et consomme **1,8 s de processeur
  par seconde d'audio** : trop lourd pendant une course (sur la carte graphique il irait plus
  vite, mais il la prendrait au jeu).
- **Vosk small est le plus lent en dictée libre** dans notre usage (tout le son décodé au
  relâchement). Constat utile même sans changer de moteur : la dictée Vosk pourrait être
  décodée **pendant** l'appui (Vosk sait le faire), ce qui retirerait l'essentiel de ce délai.
- **Mots favorisés pour Parakeet** : sherpa-onnx accepte une liste, mais sans le vocabulaire
  BPE d'origine (absent de l'archive) l'encodage est faux : sans effet à poids normal, phrases
  cassées à poids fort. Piste ouverte : récupérer le tokenizer du modèle NeMo d'origine.
- **Notre correction des noms de virage** (alias + phonétique, ajoutée le 18/10) rattrape peu
  sur ces sorties (Parakeet 51 → 53 % des virages reconnus, Whisper + amorce 86 %).

## Limites

- Voix de synthèse (Piper : tom, siwis, upmc/pierre) : diction propre et régulière, bruit
  synthétique (harmoniques de moteur + souffle rose) ; « Répète. » seul est mal rendu par la
  synthèse (aucun moteur ne le reconnaît) — à revoir sur la vraie voix.
- Français seulement. Parakeet v3 couvre aussi EN/ES/DE/IT, non mesurés ici.
- Machine : Ryzen 7 5800X3D (16 threads), ~22 % de charge de fond, 2 threads par moteur,
  priorité « sous la normale », jeu non lancé.
- Parakeet ne donne aucun score de confiance (le réglage « faire répéter quand la dictée est
  incertaine » ne s'appliquerait pas à lui).

## Protocole et fichiers

- Phrases : `scripts/stt-eval/corpus.json` (40 phrases, mots-clés par phrase).
- Audio : `python -I scripts/stt-eval/synth.py <piper.exe> <voix>` → `wav/synth/` (ignoré par git).
- Mesure : `python -I scripts/stt-eval/bench.py run --engine … --model … --wav … --out …`,
  puis `report` (normalisation commune : sans accents, nombres en chiffres, pluriels simples).
- Moteurs : Vosk `vosk-model-small-fr-0.22` (celui de l'app), Parakeet
  `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8` (sherpa-onnx 1.13.8, recherche gloutonne),
  Whisper `Systran/faster-whisper-small` (faster-whisper 1.2.1, int8, beam 1).
- Bibliothèques installées à part : `%LOCALAPPDATA%\stt-eval\pylib` ; modèles :
  `%LOCALAPPDATA%\stt-eval\models`.
- Tes enregistrements : `python -I scripts/stt-eval/record.py --device <n>` (voir `PHRASES.md`),
  puis la même commande `bench.py run` avec `--wav stt-eval/wav/moi`.
