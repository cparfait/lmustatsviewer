# TTS Piper — assets (non versionnés)

Ce dossier reçoit le moteur **Piper** et les **modèles de voix** neuronaux,
utilisés par les annonces vocales Live (commande Rust `tts_synthesize`).

> **Bundle** : seul `tts/piper/` (moteur, ~38 Mo) est embarqué dans l'installeur.
> Les voix `.onnx` (~60 Mo chacune) **ne sont plus bundlées** : l'utilisateur les
> télécharge à la demande depuis Config → Audio / Voix (commande `asset_download`,
> cf. `src/commands/assets.rs`) vers `app_data_dir/tts/voices`.

Le contenu est **lourd** et **hors git** (cf. `.gitignore`). Pour le **dev**, il
faut le récupérer une fois en local :

```powershell
pwsh scripts/fetch-piper.ps1
```

Structure attendue après le fetch :

```
tts/
  piper/
    piper.exe
    onnxruntime.dll
    espeak-ng-data/...
  voices/
    en.onnx        en.onnx.json
    fr.onnx        fr.onnx.json
```

Si ces fichiers sont absents, l'application **bascule automatiquement** sur la
synthèse vocale du navigateur (voix système) — aucune erreur bloquante.

> Licences : choisir des voix Piper sous licence permissive (MIT / CC-BY).
> Les noms de voix sont configurables en tête de `scripts/fetch-piper.ps1`.
