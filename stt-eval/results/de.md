| Moteur | Condition | Phrases | Erreurs par mot (WER) | Phrases exactes | Mots-clés compris | Délai p50 | Délai p95 | CPU / s d'audio |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| vosk | bruit10 | 40 | 12.1 % | 30 % | 69 % | 731 ms | 1020 ms | 0.22 |
| vosk | bruit5 | 40 | 22.2 % | 12 % | 58 % | 845 ms | 1247 ms | 0.25 |
| vosk | propre | 40 | 4.6 % | 60 % | 81 % | 719 ms | 934 ms | 0.21 |
| vosk | (tout) | 120 | 13.0 % | 34 % | 69 % | 748 ms | 1024 ms | 0.23 |
| parakeet | bruit10 | 40 | 4.4 % | 50 % | 79 % | 385 ms | 556 ms | 0.25 |
| parakeet | bruit5 | 40 | 12.5 % | 40 % | 71 % | 368 ms | 495 ms | 0.25 |
| parakeet | propre | 40 | 2.5 % | 68 % | 86 % | 378 ms | 528 ms | 0.25 |
| parakeet | (tout) | 120 | 6.5 % | 52 % | 79 % | 378 ms | 495 ms | 0.25 |

| Moteur | commande | jargon | libre | numero | quantite | question | virage |
|---|---:|---:|---:|---:|---:|---:|---:|
| vosk | 58 % | 54 % | 83 % | 98 % | 71 % | 72 % | 43 % |
| parakeet | 58 % | 54 % | 92 % | 96 % | 86 % | 78 % | 69 % |

Chargement du modèle : vosk 1.0 s, parakeet 2.8 s
