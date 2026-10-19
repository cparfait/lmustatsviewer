| Moteur | Condition | Phrases | Erreurs par mot (WER) | Phrases exactes | Mots-clés compris | Délai p50 | Délai p95 | CPU / s d'audio |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| vosk | voix | 40 | 17.8 % | 42 % | 83 % | 1460 ms | 1861 ms | 0.57 |
| vosk | (tout) | 40 | 17.8 % | 42 % | 83 % | 1460 ms | 1861 ms | 0.57 |
| parakeet | voix | 40 | 12.1 % | 62 % | 87 % | 272 ms | 540 ms | 0.26 |
| parakeet | (tout) | 40 | 12.1 % | 62 % | 87 % | 272 ms | 540 ms | 0.26 |
| whisper | voix | 40 | 12.5 % | 55 % | 84 % | 2572 ms | 2722 ms | 2.03 |
| whisper | (tout) | 40 | 12.5 % | 55 % | 84 % | 2572 ms | 2722 ms | 2.03 |
| whisper-p | voix | 40 | 12.6 % | 58 % | 87 % | 3147 ms | 4203 ms | 2.30 |
| whisper-p | (tout) | 40 | 12.6 % | 58 % | 87 % | 3147 ms | 4203 ms | 2.30 |

| Moteur | commande | jargon | libre | numero | quantite | question | virage |
|---|---:|---:|---:|---:|---:|---:|---:|
| vosk | 100 % | 83 % | 88 % | 73 % | 94 % | 100 % | 57 % |
| parakeet | 75 % | 83 % | 100 % | 82 % | 94 % | 100 % | 71 % |
| whisper | 100 % | 83 % | 100 % | 82 % | 94 % | 100 % | 50 % |
| whisper-p | 100 % | 83 % | 100 % | 73 % | 94 % | 100 % | 71 % |

Chargement du modèle : vosk 1.1 s, parakeet 3.1 s, whisper 1.6 s, whisper-p 1.5 s
