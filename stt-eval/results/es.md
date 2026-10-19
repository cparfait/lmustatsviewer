| Moteur | Condition | Phrases | Erreurs par mot (WER) | Phrases exactes | Mots-clés compris | Délai p50 | Délai p95 | CPU / s d'audio |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| vosk | bruit10 | 40 | 4.8 % | 58 % | 88 % | 587 ms | 855 ms | 0.18 |
| vosk | bruit5 | 40 | 6.6 % | 45 % | 82 % | 651 ms | 883 ms | 0.20 |
| vosk | propre | 40 | 2.4 % | 72 % | 91 % | 522 ms | 721 ms | 0.16 |
| vosk | (tout) | 120 | 4.6 % | 58 % | 87 % | 583 ms | 855 ms | 0.18 |
| parakeet | bruit10 | 40 | 1.8 % | 75 % | 86 % | 360 ms | 468 ms | 0.26 |
| parakeet | bruit5 | 40 | 3.7 % | 72 % | 88 % | 353 ms | 490 ms | 0.25 |
| parakeet | propre | 40 | 2.4 % | 80 % | 89 % | 341 ms | 466 ms | 0.25 |
| parakeet | (tout) | 120 | 2.6 % | 76 % | 88 % | 347 ms | 468 ms | 0.25 |

| Moteur | commande | jargon | libre | numero | quantite | question | virage |
|---|---:|---:|---:|---:|---:|---:|---:|
| vosk | 92 % | 92 % | 100 % | 96 % | 100 % | 100 % | 52 % |
| parakeet | 100 % | 92 % | 100 % | 98 % | 90 % | 100 % | 57 % |

Chargement du modèle : vosk 0.9 s, parakeet 2.9 s
