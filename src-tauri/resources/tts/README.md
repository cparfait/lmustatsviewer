# TTS Piper — assets (non versionnés)

Ce dossier reçoit le moteur **Piper** et les **modèles de voix** neuronaux,
utilisés par les annonces vocales Live (commande Rust `tts_synthesize`).

Le contenu est **lourd** et **hors git** (cf. `.gitignore`). Il faut le récupérer
une fois en local :

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
