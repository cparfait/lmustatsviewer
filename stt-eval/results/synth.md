| Moteur | Condition | Phrases | Erreurs par mot (WER) | Phrases exactes | Mots-clés compris | Délai p50 | Délai p95 | CPU / s d'audio |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| vosk | bruit10 | 120 | 20.2 % | 33 % | 74 % | 1745 ms | 2318 ms | 0.60 |
| vosk | bruit5 | 120 | 30.6 % | 18 % | 64 % | 2209 ms | 2960 ms | 0.75 |
| vosk | propre | 120 | 15.1 % | 47 % | 81 % | 1421 ms | 1857 ms | 0.49 |
| vosk | (tout) | 360 | 21.9 % | 33 % | 73 % | 1712 ms | 2664 ms | 0.61 |
| parakeet | bruit10 | 120 | 18.2 % | 51 % | 75 % | 308 ms | 366 ms | 0.24 |
| parakeet | bruit5 | 120 | 23.5 % | 42 % | 68 % | 298 ms | 377 ms | 0.24 |
| parakeet | propre | 120 | 10.6 % | 61 % | 83 % | 305 ms | 375 ms | 0.24 |
| parakeet | (tout) | 360 | 17.4 % | 51 % | 75 % | 303 ms | 370 ms | 0.24 |
| whisper | bruit10 | 120 | 20.9 % | 43 % | 74 % | 2532 ms | 2687 ms | 1.77 |
| whisper | bruit5 | 120 | 24.5 % | 41 % | 71 % | 2533 ms | 2703 ms | 1.75 |
| whisper | propre | 120 | 15.2 % | 55 % | 80 % | 2522 ms | 2637 ms | 1.75 |
| whisper | (tout) | 360 | 20.2 % | 46 % | 75 % | 2530 ms | 2669 ms | 1.76 |
| whisper-p | bruit10 | 120 | 16.9 % | 52 % | 81 % | 2651 ms | 2799 ms | 1.83 |
| whisper-p | bruit5 | 120 | 20.2 % | 52 % | 82 % | 2643 ms | 2817 ms | 1.86 |
| whisper-p | propre | 120 | 11.2 % | 68 % | 88 % | 2639 ms | 2815 ms | 1.82 |
| whisper-p | (tout) | 360 | 16.1 % | 57 % | 84 % | 2643 ms | 2799 ms | 1.83 |

| Moteur | commande | jargon | libre | numero | quantite | question | virage |
|---|---:|---:|---:|---:|---:|---:|---:|
| vosk | 78 % | 73 % | 81 % | 76 % | 86 % | 87 % | 42 % |
| parakeet | 67 % | 69 % | 92 % | 78 % | 86 % | 88 % | 51 % |
| whisper | 86 % | 65 % | 96 % | 68 % | 85 % | 96 % | 48 % |
| whisper-p | 86 % | 73 % | 96 % | 77 % | 86 % | 97 % | 78 % |

Chargement du modèle : vosk 0.5 s, parakeet 2.1 s, whisper 1.9 s, whisper-p 1.1 s
