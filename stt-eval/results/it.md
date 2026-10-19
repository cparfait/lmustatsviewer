| Moteur | Condition | Phrases | Erreurs par mot (WER) | Phrases exactes | Mots-clés compris | Délai p50 | Délai p95 | CPU / s d'audio |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| vosk | bruit10 | 20 | 6.0 % | 45 % | 85 % | 738 ms | 1002 ms | 0.26 |
| vosk | bruit5 | 20 | 11.6 % | 35 % | 70 % | 841 ms | 1096 ms | 0.29 |
| vosk | propre | 20 | 4.3 % | 50 % | 90 % | 729 ms | 916 ms | 0.26 |
| vosk | (tout) | 60 | 7.3 % | 43 % | 82 % | 771 ms | 1002 ms | 0.27 |
| parakeet | bruit10 | 20 | 4.6 % | 50 % | 88 % | 335 ms | 460 ms | 0.26 |
| parakeet | bruit5 | 20 | 9.7 % | 35 % | 75 % | 321 ms | 450 ms | 0.26 |
| parakeet | propre | 20 | 4.6 % | 50 % | 85 % | 313 ms | 440 ms | 0.25 |
| parakeet | (tout) | 60 | 6.3 % | 45 % | 82 % | 321 ms | 440 ms | 0.26 |

| Moteur | commande | jargon | libre | numero | quantite | question | virage |
|---|---:|---:|---:|---:|---:|---:|---:|
| vosk | 83 % | 83 % | 83 % | 92 % | 90 % | 100 % | 52 % |
| parakeet | 50 % | 92 % | 100 % | 83 % | 95 % | 100 % | 56 % |

Chargement du modèle : vosk 0.9 s, parakeet 2.9 s
