| Moteur | Condition | Phrases | Erreurs par mot (WER) | Phrases exactes | Mots-clés compris | Délai p50 | Délai p95 | CPU / s d'audio |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| vosk | bruit10 | 40 | 10.8 % | 35 % | 71 % | 1248 ms | 1835 ms | 0.40 |
| vosk | bruit5 | 40 | 14.2 % | 28 % | 62 % | 1316 ms | 2102 ms | 0.42 |
| vosk | propre | 40 | 6.3 % | 50 % | 77 % | 1250 ms | 1925 ms | 0.41 |
| vosk | (tout) | 120 | 10.4 % | 38 % | 70 % | 1255 ms | 1922 ms | 0.41 |
| parakeet | bruit10 | 40 | 3.7 % | 62 % | 84 % | 373 ms | 466 ms | 0.27 |
| parakeet | bruit5 | 40 | 3.6 % | 58 % | 83 % | 372 ms | 609 ms | 0.28 |
| parakeet | propre | 40 | 3.2 % | 60 % | 84 % | 373 ms | 469 ms | 0.28 |
| parakeet | (tout) | 120 | 3.5 % | 60 % | 84 % | 372 ms | 481 ms | 0.28 |

| Moteur | commande | jargon | libre | numero | quantite | question | virage |
|---|---:|---:|---:|---:|---:|---:|---:|
| vosk | 58 % | 92 % | 21 % | 81 % | 69 % | 98 % | 54 % |
| parakeet | 100 % | 100 % | 75 % | 83 % | 67 % | 100 % | 78 % |

Chargement du modèle : vosk 1.0 s, parakeet 4.1 s
